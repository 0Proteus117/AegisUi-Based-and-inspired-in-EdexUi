"use strict";
const fs=require("fs");
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const row=value=>value?Object.fromEntries(Object.entries(value).map(([key,v])=>[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase()),v])):null;

// Explicit, one-file cleanup of a verified superseded managed copy only. This
// is not cache discovery, directory cleanup or a renderer-selected unlink API.
class StudStorageCleanupService {
    constructor(transfers){this.transfers=transfers;this.repository=transfers.repository;this.db=this.repository.db;this.storage=transfers.storage;}
    candidates(manifest,items=manifest.items){
        return items.map(item=>{
            const asset=this.storage.repository.asset(item.reference),copy=row(this.db.prepare("SELECT * FROM stud_storage_copies WHERE reference=? AND profile_id=?").get(item.reference,item.sourceProfileId));
            const eligible=manifest.state==="APPLIED"&&asset?.activeProfileId===manifest.targetProfileId&&asset.rowVersion===item.appliedAssetVersion&&copy?.state==="RETAINED"&&copy.manifestId===manifest.id&&copy.sha256===item.sha256&&copy.byteSize===item.byteSize;
            return {reference:item.reference,profileLabel:this.storage.repository.profile(item.sourceProfileId).label,expectedAssetVersion:asset?.rowVersion,
                classification:copy?.state==="REMOVED"?"REMOVED":eligible?"RETAINED_REQUIRES_VERIFICATION":"NOT_ELIGIBLE",eligibleForVerification:eligible};
        });
    }
    current(input){
        const manifest=this.transfers.scoped(input);this.transfers.expected(manifest,input);
        const reference=Domain.managedReference(input.reference),item=manifest.items.find(v=>v.reference===reference);
        if(!item||manifest.state!=="APPLIED")Domain.fail("INVALID_STORAGE_CLEANUP","Only an applied manifest's retained original can be considered for cleanup.");
        const asset=this.storage.repository.asset(reference);this.storage.repository.assertVersion(asset||{},input.expectedAssetVersion);
        if(asset.activeProfileId!==manifest.targetProfileId||asset.rowVersion!==item.appliedAssetVersion||asset.sha256!==item.sha256||asset.byteSize!==item.byteSize||item.sourceProfileId===asset.activeProfileId)
            Domain.fail("STALE_STORAGE_VERSION","The active file changed after this transfer. No original can be removed from this manifest.");
        if(!this.candidates(manifest,[item])[0].eligibleForVerification)Domain.fail("INVALID_STORAGE_CLEANUP","There is no eligible retained copy in this manifest.");
        return {manifest,item,asset};
    }
    get(assignmentId,id){
        const result=row(this.db.prepare("SELECT * FROM stud_storage_cleanup_records WHERE assignment_id=? AND id=?").get(assignmentId,id));
        if(!result)Domain.fail("INVALID_STORAGE_CLEANUP","Cleanup history is unavailable for this Assignment.");return result;
    }
    history(assignmentId,manifestId){return this.db.prepare("SELECT * FROM stud_storage_cleanup_records WHERE assignment_id=? AND manifest_id=? ORDER BY created_at DESC,id DESC LIMIT 50").all(assignmentId,manifestId).map(row);}
    finish(record,state,code=null){
        const run=this.transfers.artifacts.run({assignmentId:record.assignmentId,runId:record.runId});
        if(["CREATED","RUNNING","PAUSED"].includes(run.state))this.transfers.artifacts.transitionRun({runId:run.id,expectedVersion:run.rowVersion,action:state==="REMOVED"?"COMPLETE":"FAIL",
            statusSummary:state==="REMOVED"?"One verified inactive copy removed; active file retained":"Cleanup stopped; inspect retained-copy history",errorSummary:state==="REMOVED"?undefined:code});
        this.db.prepare("UPDATE stud_storage_cleanup_records SET state=?,error_code=?,finished_at=? WHERE id=?").run(state,code,Academic.now(),record.id);
    }
    async remove(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","manifestId","expectedVersion","reference","expectedAssetVersion","confirmDeleteRetainedCopy"],"Remove verified retained copy");
        if(input.confirmDeleteRetainedCopy!==true)Domain.fail("STORAGE_APPROVAL_REQUIRED","Deleting this retained original removes its rollback safety copy. Confirm explicitly.");
        const service=this.transfers;if(service.stopping)Domain.fail("STORAGE_CANCELLED","Storage is shutting down.");
        if(service.cleaning||service.preparing||service.active.size)Domain.fail("STORAGE_BUSY","Wait for the current storage operation before cleanup.");
        const initial=this.current(input),source=this.storage.repository.profile(initial.item.sourceProfileId),active=this.storage.repository.profile(initial.asset.activeProfileId);
        service.cleaning=true;service.cleanupController=new AbortController();let record,unlinked=false;
        try{
            record=this.repository.transaction(()=>{
                let run=service.artifacts.createRun({assignmentId:initial.manifest.assignmentId,operationType:"STORAGE_COPY_CLEANUP",actor:"USER",progressMode:"INDETERMINATE",canPause:false,canCancel:false,statusSummary:"Verifying active and retained copies before explicit removal",parentRunId:initial.manifest.runId});
                run=service.artifacts.transitionRun({runId:run.id,expectedVersion:run.rowVersion,action:"START"});
                const id=Academic.createId("storage_cleanup");
                this.db.prepare(`INSERT INTO stud_storage_cleanup_records (id,reference,assignment_id,manifest_id,profile_id,sha256,byte_size,active_asset_version,run_id,state,reason,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,'VERIFYING','VERIFIED_SUPERSEDED_COPY',?)`).run(id,initial.item.reference,initial.manifest.assignmentId,initial.manifest.id,source.id,initial.item.sha256,initial.item.byteSize,initial.asset.rowVersion,run.id,Academic.now());
                return this.get(initial.manifest.assignmentId,id);
            });
            const signal=service.cleanupController.signal;
            const activeReceipt=await service.transfer.verify(active,initial.item.reference,initial.item,signal);
            const sourceReceipt=await service.transfer.verify(source,initial.item.reference,initial.item,signal);
            // Reaffirm canonical owners too: verified bytes alone do not permit
            // deleting a copy after canonical source identity has diverged.
            await this.storage.inspectCanonicalFileAsync(initial.item.reference,{signal});
            const recheck=()=>{
                if(signal.aborted)Domain.fail("STORAGE_CANCELLED","Cleanup was interrupted before removal.");
                this.current(input);
                if(service.artifacts.run({assignmentId:record.assignmentId,runId:record.runId}).state!=="RUNNING")Domain.fail("STORAGE_CANCELLED","The cleanup operation is no longer running.");
                for(const profile of [source,active])this.storage.repository.assertVersion(this.storage.repository.profile(profile.id),profile.rowVersion);
                service.transfer.assertVerified(active,initial.item.reference,activeReceipt);
                service.transfer.assertVerified(source,initial.item.reference,sourceReceipt);
            };
            recheck();
            // Durable intent precedes unlink. Filesystem and SQLite cannot share
            // a transaction: crash recovery marks uncertainty, never replays a
            // deletion or claims that an unknown unlink definitely succeeded.
            this.repository.transaction(()=>this.db.prepare("UPDATE stud_storage_cleanup_records SET state='DELETE_REQUESTED' WHERE id=?").run(record.id));
            recheck();
            fs.unlinkSync(this.storage.paths.file(source,initial.item.reference));unlinked=true;
            this.repository.transaction(()=>{
                this.db.prepare("UPDATE stud_storage_copies SET state='REMOVED' WHERE reference=? AND profile_id=?").run(initial.item.reference,source.id);
                this.finish(record,"REMOVED");
            });
            return this.get(record.assignmentId,record.id);
        }catch(error){
            const code=error instanceof Academic.StudError&&/^[A-Z_]{1,64}$/.test(error.code)?error.code:"STORAGE_CLEANUP_FAILED";
            if(record&&!service.stopping)this.repository.transaction(()=>this.finish(record,unlinked?"INTERRUPTED":"FAILED",unlinked?"STORAGE_CLEANUP_REVIEW_REQUIRED":code));
            Domain.fail(unlinked?"STORAGE_CLEANUP_REVIEW_REQUIRED":code,unlinked?"Copy removal could not be fully recorded. The active copy remains; inspect cleanup history.":"Cleanup did not remove the retained copy. Inspect its history before retrying.");
        }finally{service.cleaning=false;service.cleanupController=null;}
    }
    recoverBatch(){
        const records=this.db.prepare("SELECT * FROM stud_storage_cleanup_records WHERE state IN ('VERIFYING','DELETE_REQUESTED') ORDER BY id LIMIT 100").all().map(row);
        for(const record of records)this.repository.transaction(()=>this.finish(record,"INTERRUPTED","STORAGE_CLEANUP_REVIEW_REQUIRED"));
        return records.length;
    }
}
module.exports=Object.freeze({StudStorageCleanupService});
