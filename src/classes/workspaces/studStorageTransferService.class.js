"use strict";
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const {StudStorageManifestRepository}=require("./studStorageManifestRepository.class.js");
const {StudStorageManifestCatalog}=require("./studStorageManifestCatalog.class.js");
const {StudStorageFileTransfer}=require("./studStorageFileTransfer.class.js");
const {StudArtifactOperationsService}=require("./studArtifactOperationsService.class.js");
const Operations=require("./studArtifactOperationsModel.class.js");

// A main-process singleton. Caller-supplied objects never select a file path,
// SQL statement, actor, Run type or free-form persistent event payload.
class StudStorageTransferService {
    constructor({store,storage,catalog,transfer,artifacts}){
        this.storage=storage;this.assets=storage.repository;this.repository=new StudStorageManifestRepository(store);
        this.catalog=catalog||new StudStorageManifestCatalog({store});
        this.transfer=transfer||new StudStorageFileTransfer(storage.paths);
        this.artifacts=artifacts||new StudArtifactOperationsService({store});this.active=new Map();
    }
    scoped(input){return this.repository.get(input.assignmentId,input.manifestId);}
    expected(current,input){this.assets.assertVersion(current,input.expectedVersion);}
    inspect(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","manifestId"],"Storage manifest inspection");
        return Object.freeze({...this.scoped(input),scope:"CANONICAL_MANAGED_FILES_ONLY",portableReady:false,
            exclusions:["LOCAL_DATABASE_REMAINS_ON_THIS_MAC","OLLAMA_MODELS_EXTERNALLY_MANAGED","NO_REMOTE_SOURCE_ACQUISITION"]});
    }
    history(input={}){Academic.assertAllowedKeys(input,["assignmentId","limit"],"Storage history");return this.repository.list(input.assignmentId,input.limit);}
    async prepare(input={}, {signal}={}){
        if(this.stopping)Domain.fail("STORAGE_CANCELLED","Storage is shutting down.");
        if(this.preparing||this.cleaning)Domain.fail("STORAGE_BUSY","A storage selection or retained copy is already being verified.");
        this.preparing=true;this.preparationController=new AbortController();
        const abort=()=>this.preparationController?.abort();if(signal?.aborted)abort();else signal?.addEventListener("abort",abort,{once:true});
        try{return await this.prepareSelection(input,{signal:this.preparationController.signal});}finally{signal?.removeEventListener("abort",abort);this.preparing=false;this.preparationController=null;}
    }
    async prepareSelection(input={}, {signal}={}){
        Academic.assertAllowedKeys(input,["assignmentId","targetProfileId","expectedTargetVersion","purpose","includeCourseMaterial","expectedScopeHash","references"],"Prepare managed-file transfer");
        const purpose=Academic.enumValue(input.purpose,["RELOCATE","PORTABLE","RETURN"],"Transfer purpose");
        if(!purpose)Domain.fail("INVALID_INPUT","A transfer purpose is required.");
        const target=this.assets.profile(input.targetProfileId);this.assets.assertVersion(target,input.expectedTargetVersion);
        if((purpose==="PORTABLE"&&target.kind!=="LOCAL")||(purpose==="RETURN"&&target.kind!=="EXTERNAL"))Domain.fail("INVALID_STORAGE_PROFILE","Portable files must return to this Mac; return transfers require external storage.");
        this.storage.paths.profileRoot(target);
        const inventory=this.catalog.inspect({assignmentId:input.assignmentId,includeCourseMaterial:input.includeCourseMaterial??false});
        if(inventory.scopeHash!==Domain.digest(input.expectedScopeHash))Domain.fail("STORAGE_SCOPE_CHANGED","The Assignment inventory changed. Inspect it before selecting files.");
        if(!Array.isArray(input.references)||!input.references.length||input.references.length>Domain.LIMITS.manifestItems)Domain.fail("STORAGE_FILE_LIMIT","Select between 1 and 500 managed files.");
        const references=input.references.map(Domain.managedReference).sort();
        if(new Set(references).size!==references.length)Domain.fail("INVALID_INPUT","A managed file may appear only once in a transfer.");
        const selected=references.map(reference=>{
            const file=inventory.files.find(item=>item.reference===reference);
            if(!file)Domain.fail("STORAGE_SCOPE_CHANGED","A selected file is not part of this Assignment inventory.");
            return file;
        });
        const items=[];let bytes=0;
        for(const file of selected){
            const checked=await this.storage.inspectCanonicalFileAsync(file.reference,{signal});
            bytes+=checked.byteSize;if(bytes>Domain.LIMITS.totalBytes)Domain.fail("STORAGE_FILE_LIMIT","The selected files exceed the bounded transfer size.");
            const profile=this.assets.profile(checked.asset?.activeProfileId||Domain.LOCAL_PROFILE_ID);
            if(profile.id===target.id)Domain.fail("SAME_STORAGE_PROFILE","A selected file is already active on the destination profile.");
            items.push({...checked,profileVersion:profile.rowVersion});
        }
        return this.repository.transaction(()=>{
            this.assertScope(inventory);this.assets.assertVersion(this.assets.profile(target.id),target.rowVersion);
            const persisted=items.map(item=>{
                if(JSON.stringify(item.asset)!==JSON.stringify(this.assets.asset(item.reference)))Domain.fail("STALE_STORAGE_VERSION","A file location changed while preparing the transfer.");
                const asset=item.asset||this.assets.registerLocal(item.reference,item.sha256,item.byteSize);
                this.assets.assertVersion(this.assets.profile(asset.activeProfileId),item.profileVersion);
                return {...asset,profileVersion:item.profileVersion};
            });
            // Registering verified legacy identities changes the catalog's
            // storage-version fields, not academic scope. Freeze the resulting
            // prepared inventory in this same transaction before approval.
            const prepared=this.catalog.inspect({assignmentId:inventory.assignmentId,includeCourseMaterial:inventory.includeCourseMaterial});
            return this.repository.insert({assignmentId:inventory.assignmentId,targetProfileId:target.id,targetProfileVersion:target.rowVersion,purpose,
                scopeHash:prepared.scopeHash,includeCourseMaterial:inventory.includeCourseMaterial,
                omittedFileCount:inventory.files.length-selected.length,issueCount:inventory.issueCount,inventoryTruncated:inventory.truncated,
                sharedReferenceCount:selected.filter(file=>file.sharedCanonicalReference||file.sharedCourseMaterial||file.canonicalOwnerCount>1).length},persisted,
                selected.flatMap(file=>file.sources.map(source=>({reference:file.reference,type:source.type,id:source.id,
                    updatedAt:inventory.objects.find(object=>object.type===source.type&&object.id===source.id)?.updatedAt||null}))),inventory.issues);
        });
    }
    assertScope(manifest){
        const current=this.catalog.inspect({assignmentId:manifest.assignmentId,includeCourseMaterial:!!manifest.includeCourseMaterial});
        if(current.scopeHash!==manifest.scopeHash)Domain.fail("STORAGE_SCOPE_CHANGED","Assignment source scope changed. Prepare and review a new transfer.");
    }
    assertMappings(manifest,rollback=false){
        if(!manifest.items.length||manifest.items.length>Domain.LIMITS.manifestItems)Domain.fail("STORAGE_FILE_LIMIT","The manifest has an invalid file count.");
        for(const item of manifest.items){
            const asset=this.assets.asset(item.reference),version=rollback?item.appliedAssetVersion:item.sourceAssetVersion;
            if(!asset||asset.rowVersion!==version||asset.activeProfileId!==(rollback?manifest.targetProfileId:item.sourceProfileId)||asset.sha256!==item.sha256||asset.byteSize!==item.byteSize)
                Domain.fail("STALE_STORAGE_VERSION","A file was relocated or changed after this manifest was reviewed.");
            if(!rollback)this.assets.assertVersion(this.assets.profile(item.sourceProfileId),item.sourceProfileVersion);
        }
        if(!rollback)this.assets.assertVersion(this.assets.profile(manifest.targetProfileId),manifest.targetProfileVersion);
    }
    run(manifest,rollback){
        let run=this.artifacts.createRun({assignmentId:manifest.assignmentId,operationType:rollback?"STORAGE_ROLLBACK":"STORAGE_TRANSFER",actor:"USER",
            progressMode:"DETERMINATE",progressCurrent:0,progressTotal:manifest.items.length,progressUnit:"verified files",
            statusSummary:rollback?"Verifying retained originals":"Copying explicitly selected managed files",parentRunId:rollback?manifest.runId:undefined,canCancel:true,canPause:false});
        return this.artifacts.transitionRun({runId:run.id,action:"START",expectedVersion:run.rowVersion});
    }
    progress(manifest,runId,count){
        const run=this.artifacts.run({assignmentId:manifest.assignmentId,runId});
        if(run.state!=="RUNNING")Domain.fail("STORAGE_CANCELLED","The storage operation is no longer running.");
        // Internal measured update, not a new renderer log or progress API.
        this.artifacts.repository.updateRun({id:run.id,expectedVersion:run.rowVersion,state:run.state,
            progress:Operations.normalizeProgress({progressMode:"DETERMINATE",progressCurrent:count,progressTotal:manifest.items.length,progressUnit:"verified files"}),
            statusSummary:"Verifying selected files; location switch still pending",errorSummary:null,startedAt:run.startedAt,finishedAt:null});
    }
    closeRun(manifest,runId,action,errorCode=null){
        const run=this.artifacts.run({assignmentId:manifest.assignmentId,runId});
        if(action==="COMPLETE"&&run.state!=="RUNNING")Domain.fail("STORAGE_CANCELLED","The operation stopped before its location switch.");
        if(!["CREATED","RUNNING","PAUSED"].includes(run.state))return;
        this.artifacts.transitionRun({runId,action,expectedVersion:run.rowVersion,
            statusSummary:action==="COMPLETE"?"Verified storage locations applied":action==="CANCEL"?"Storage operation cancelled; locations unchanged":"Storage operation stopped; locations unchanged",
            errorSummary:action==="FAIL"?(errorCode||"STORAGE_TRANSFER_FAILED"):undefined});
    }
    async execute(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","manifestId","expectedVersion","confirmLimitedScope","confirmSharedReferences"],"Approve storage transfer");
        let manifest=this.scoped(input);this.expected(manifest,input);
        if(manifest.state!=="PREPARED")Domain.fail("INVALID_STORAGE_TRANSITION","Only a prepared, reviewed manifest can start. Prepare a new manifest to retry.");
        // All M14 manifests exclude the local DB and externally owned model files.
        if(input.confirmLimitedScope!==true||(manifest.sharedReferenceCount>0&&input.confirmSharedReferences!==true))Domain.fail("STORAGE_APPROVAL_REQUIRED","Explicitly acknowledge the limited file scope and any shared references.");
        this.assertMappings(manifest);this.assertScope(manifest);
        return this.perform(manifest,false);
    }
    async rollback(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","manifestId","expectedVersion"],"Restore retained file locations");
        const manifest=this.scoped(input);this.expected(manifest,input);
        if(manifest.state!=="APPLIED")Domain.fail("INVALID_STORAGE_TRANSITION","Only an applied transfer can restore its retained originals.");
        this.assertMappings(manifest,true);return this.perform(manifest,true);
    }
    async perform(initial,rollback){
        if(this.stopping)Domain.fail("STORAGE_CANCELLED","Storage is shutting down.");
        if(this.active.size||this.cleaning)Domain.fail("STORAGE_BUSY","Another storage operation is active. Wait for it to finish or cancel it.");
        const controller=new AbortController();this.active.set(initial.id,controller);let manifest=initial,runId=null;
        try{
            manifest=this.repository.transaction(()=>{
                const current=this.scoped({assignmentId:initial.assignmentId,manifestId:initial.id});this.assets.assertVersion(current,initial.rowVersion);
                this.assertMappings(current,rollback);const run=this.run(current,rollback);runId=run.id;
                return this.repository.change(current,rollback?"ROLLING_BACK":"COPYING",rollback?{rollbackRunId:run.id}:{runId:run.id,approve:true});
            });
            let verified=0;
            for(const item of manifest.items){
                if(controller.signal.aborted)Domain.fail("STORAGE_CANCELLED","The storage operation was cancelled.");
                const source=this.assets.profile(item.sourceProfileId),target=this.assets.profile(manifest.targetProfileId);
                if(rollback)await this.transfer.verify(source,item.reference,item,controller.signal);
                else await this.transfer.copy({sourceProfile:source,targetProfile:target,reference:item.reference,sha256:item.sha256,byteSize:item.byteSize,signal:controller.signal});
                this.repository.transaction(()=>{
                    this.assertMappings(manifest,rollback);
                    this.repository.retain(manifest,item,rollback?source.id:target.id);
                    if(!rollback)this.repository.markVerified(manifest,item);
                    this.progress(manifest,runId,++verified);
                });
            }
            // Re-read every destination (and retained original) before committing
            // one atomic mapping switch. No SQLite transaction spans async I/O.
            const receipts=[];
            for(const item of manifest.items){
                const source=this.assets.profile(item.sourceProfileId),target=this.assets.profile(manifest.targetProfileId);
                receipts.push({profile:source,reference:item.reference,verified:await this.transfer.verify(source,item.reference,item,controller.signal)});
                if(!rollback)receipts.push({profile:target,reference:item.reference,verified:await this.transfer.verify(target,item.reference,item,controller.signal)});
            }
            if(controller.signal.aborted)Domain.fail("STORAGE_CANCELLED","The storage operation was cancelled.");
            manifest=this.repository.transaction(()=>{
                const current=this.scoped({assignmentId:manifest.assignmentId,manifestId:manifest.id});this.assets.assertVersion(current,manifest.rowVersion);
                this.assertMappings(current,rollback);if(!rollback)this.assertScope(current);
                for(const item of receipts){
                    this.assets.assertVersion(this.assets.profile(item.profile.id),item.profile.rowVersion);
                    this.transfer.assertVerified(item.profile,item.reference,item.verified);
                }
                for(const item of current.items){
                    // Final volume/marker availability check immediately before SQL.
                    this.storage.paths.profileRoot(this.assets.profile(item.sourceProfileId));
                    if(!rollback)this.storage.paths.profileRoot(this.assets.profile(current.targetProfileId));
                    this.repository.switchAsset(item,rollback?item.sourceProfileId:current.targetProfileId,rollback?item.appliedAssetVersion:item.sourceAssetVersion);
                    this.repository.retain(current,item,item.sourceProfileId);
                    if(!rollback)this.repository.markApplied(current,item);
                }
                this.closeRun(current,runId,"COMPLETE");
                return this.repository.change(current,rollback?"ROLLED_BACK":"APPLIED");
            });
            return this.inspect({assignmentId:manifest.assignmentId,manifestId:manifest.id});
        }catch(error){
            const code=error instanceof Academic.StudError&&/^[A-Z_]{1,64}$/.test(error.code)?error.code:"STORAGE_TRANSFER_FAILED";
            // App shutdown closes SQLite after aborting this singleton. Leave
            // its durable unfinished state for startup recovery, not late writes.
            if(runId&&!this.stopping)this.repository.transaction(()=>{
                const current=this.scoped({assignmentId:manifest.assignmentId,manifestId:manifest.id});
                // Successful transactions are never undone by reporting failures.
                if(["COPYING","ROLLING_BACK"].includes(current.state)){
                    this.closeRun(current,runId,code==="STORAGE_CANCELLED"?"CANCEL":"FAIL",code);
                    this.repository.change(current,rollback?"APPLIED":code==="STORAGE_CANCELLED"?"CANCELLED":"FAILED",{errorCode:code});
                }
            });
            Domain.fail(code,"The storage operation could not be confirmed. Inspect the manifest and active locations before retrying; a previously removed original cannot be used for rollback.");
        }finally{this.active.delete(initial.id);}
    }
    cancel(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","manifestId","expectedVersion"],"Cancel storage transfer");
        const current=this.scoped(input);this.expected(current,input);
        if(current.state==="PREPARED")return this.repository.transaction(()=>this.repository.change(current,"CANCELLED"));
        const controller=this.active.get(current.id);
        if(!controller||!["COPYING","ROLLING_BACK"].includes(current.state))Domain.fail("INVALID_STORAGE_TRANSITION","This transfer is not cancellable in this process.");
        controller.abort();return Object.freeze({cancellationRequested:true});
    }
    recoverInterrupted(assignmentId){
        // Main bootstrap only, after a process restart. Bounded batches; never
        // resume copying or switch pointers automatically. Not a renderer API.
        Academic.safeId(assignmentId,"Assignment ID");
        const rows=this.repository.db.prepare("SELECT id FROM stud_storage_manifests WHERE assignment_id=? AND state IN ('COPYING','VERIFIED','ROLLING_BACK') ORDER BY id LIMIT 100").all(assignmentId);
        for(const row of rows){
            if(this.active.has(row.id))continue;
            this.repository.transaction(()=>{
                const current=this.repository.get(assignmentId,row.id),rollback=current.state==="ROLLING_BACK";
                const runId=rollback?current.rollbackRunId:current.runId;if(runId)this.closeRun(current,runId,"FAIL","STORAGE_INTERRUPTED");
                this.repository.change(current,rollback?"APPLIED":"INTERRUPTED",{errorCode:"STORAGE_INTERRUPTED"});
            });
        }
        return {inspected:rows.length,moreMayRemain:rows.length===100};
    }
    dispose(){this.stopping=true;this.preparationController?.abort();this.cleanupController?.abort();for(const controller of this.active.values())controller.abort();}
}
module.exports=Object.freeze({StudStorageTransferService});
