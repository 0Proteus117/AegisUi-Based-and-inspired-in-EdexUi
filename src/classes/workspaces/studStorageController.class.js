"use strict";
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const {StudStorageTransferService}=require("./studStorageTransferService.class.js");
const {StudStorageCleanupService}=require("./studStorageCleanupService.class.js");
const CHANNELS=Object.freeze([
    "stud-storage-profiles","stud-storage-profile-choose","stud-storage-profile-reconnect",
    "stud-storage-catalog","stud-storage-transfer-prepare","stud-storage-transfer-read",
    "stud-storage-transfer-execute","stud-storage-transfer-cancel","stud-storage-transfer-rollback","stud-storage-history","stud-storage-copy-remove"
]);
function page(input){
    const offset=input.offset??0,limit=input.limit??50;
    if(!Number.isSafeInteger(offset)||offset<0||offset>500||!Number.isSafeInteger(limit)||limit<1||limit>50)Domain.fail("INVALID_INPUT","Storage views require a bounded page of up to 50 items.");
    return {offset,limit};
}
// Main-process presentation boundary. Full internal catalogs/manifests are never
// hydrated on ordinary Assignment navigation or exposed as filesystem objects.
class StudStorageController {
    constructor({store,storage,artifacts}){
        this.store=store;this.storage=storage;this.transfers=new StudStorageTransferService({store,storage,artifacts});
        this.cleanup=new StudStorageCleanupService(this.transfers);
        this.recoverBatch();
    }
    recoverBatch(){
        if(this.disposed)return;
        const rows=this.store.db.prepare("SELECT DISTINCT assignment_id FROM stud_storage_manifests WHERE state IN ('COPYING','VERIFIED','ROLLING_BACK') LIMIT 100").all();
        for(const row of rows)this.transfers.recoverInterrupted(row.assignment_id);
        const cleanupCount=this.cleanup.recoverBatch();
        if(rows.length||cleanupCount)this.recoveryTimer=setImmediate(()=>this.recoverBatch());
    }
    catalog(input){
        Academic.assertAllowedKeys(input,["assignmentId","includeCourseMaterial","offset","limit"],"Storage inventory page");
        const {offset,limit}=page(input),catalog=this.transfers.catalog.inspect({assignmentId:input.assignmentId,includeCourseMaterial:input.includeCourseMaterial??false});
        const files=catalog.files.slice(offset,offset+limit).map(file=>({reference:file.reference,profileId:file.profileId,assetVersion:file.assetVersion,
            expectedHash:file.expectedHash,declaredBytes:file.declaredBytes,shared:file.sharedCanonicalReference||file.sharedCourseMaterial||file.canonicalOwnerCount>1,
            sourceCount:file.canonicalOwnerCount,label:catalog.objects.find(object=>file.sources.some(source=>source.type===object.type&&source.id===object.id))?.title||"Managed academic file"}));
        return {assignmentId:catalog.assignmentId,scopeHash:catalog.scopeHash,includeCourseMaterial:catalog.includeCourseMaterial,files,totalFiles:catalog.files.length,
            nextOffset:offset+limit<catalog.files.length?offset+limit:null,issueCount:catalog.issueCount,issues:catalog.issues,truncated:catalog.truncated,
            scope:catalog.scope,exclusions:catalog.exclusions,portableReady:false};
    }
    manifest(input){
        Academic.assertAllowedKeys(input,["assignmentId","manifestId","offset","limit"],"Transfer inspection page");
        const {offset,limit}=page(input),manifest=this.transfers.inspect({assignmentId:input.assignmentId,manifestId:input.manifestId});
        const items=manifest.items.slice(offset,offset+limit),references=new Set(items.map(item=>item.reference));
        // A failed/cancelled rollback is still the latest real attempt. Do not
        // present the earlier successful forward Run as the last operation.
        const runId=manifest.rollbackRunId||manifest.runId;
        const cleanupHistory=this.cleanup.history(manifest.assignmentId,manifest.id);
        let run=runId?this.transfers.artifacts.run({assignmentId:manifest.assignmentId,runId}):null;
        if(cleanupHistory[0]&&(!run||cleanupHistory[0].createdAt>=run.createdAt))run=this.transfers.artifacts.run({assignmentId:manifest.assignmentId,runId:cleanupHistory[0].runId});
        return {...manifest,items,sources:manifest.sources.filter(source=>references.has(source.reference)),totalItems:manifest.items.length,
            retainedCopies:this.cleanup.candidates(manifest,items),cleanupHistory,
            totalBytes:manifest.items.reduce((sum,item)=>sum+item.byteSize,0),nextOffset:offset+limit<manifest.items.length?offset+limit:null,
            run:run?{id:run.id,state:run.state,progressMode:run.progressMode,progressCurrent:run.progressCurrent,progressTotal:run.progressTotal,progressUnit:run.progressUnit,
                statusSummary:run.statusSummary,startedAt:run.startedAt,finishedAt:run.finishedAt}:null};
    }
    register(add){
        add("stud-storage-profiles",[],()=>this.storage.profiles());
        add("stud-storage-profile-choose",["label"],p=>this.storage.chooseExternal(p));
        add("stud-storage-profile-reconnect",["profileId","expectedVersion"],p=>this.storage.reconnect(p));
        add("stud-storage-catalog",["assignmentId","includeCourseMaterial","offset","limit"],p=>this.catalog(p));
        add("stud-storage-transfer-prepare",["assignmentId","targetProfileId","expectedTargetVersion","purpose","includeCourseMaterial","expectedScopeHash","references"],async p=>{
            const result=await this.transfers.prepare(p);return this.manifest({assignmentId:result.assignmentId,manifestId:result.id});
        });
        add("stud-storage-transfer-read",["assignmentId","manifestId","offset","limit"],p=>this.manifest(p));
        add("stud-storage-transfer-execute",["assignmentId","manifestId","expectedVersion","confirmLimitedScope","confirmSharedReferences"],async p=>{
            const result=await this.transfers.execute(p);return this.manifest({assignmentId:result.assignmentId,manifestId:result.id});
        });
        add("stud-storage-transfer-cancel",["assignmentId","manifestId","expectedVersion"],p=>{
            const result=this.transfers.cancel(p);return result.cancellationRequested?result:this.manifest({assignmentId:p.assignmentId,manifestId:p.manifestId});
        });
        add("stud-storage-transfer-rollback",["assignmentId","manifestId","expectedVersion"],async p=>{
            const result=await this.transfers.rollback(p);return this.manifest({assignmentId:result.assignmentId,manifestId:result.id});
        });
        add("stud-storage-history",["assignmentId","limit"],p=>this.transfers.history(p).map(manifest=>({...manifest,cleanupActive:!!this.store.db.prepare("SELECT 1 FROM stud_storage_cleanup_records WHERE assignment_id=? AND manifest_id=? AND state IN ('VERIFYING','DELETE_REQUESTED') LIMIT 1").get(manifest.assignmentId,manifest.id)})));
        add("stud-storage-copy-remove",["assignmentId","manifestId","expectedVersion","reference","expectedAssetVersion","confirmDeleteRetainedCopy"],async p=>{
            await this.cleanup.remove(p);return this.manifest({assignmentId:p.assignmentId,manifestId:p.manifestId});
        });
    }
    dispose(){this.disposed=true;clearImmediate(this.recoveryTimer);this.transfers.dispose();}
}
module.exports=Object.freeze({StudStorageController,CHANNELS});
