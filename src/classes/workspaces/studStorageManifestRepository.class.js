"use strict";
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const row=value=>value?Object.fromEntries(Object.entries(value).map(([key,item])=>[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase()),item])):null;

// Main-only persistence on the existing academic connection. No file I/O here.
class StudStorageManifestRepository {
    constructor(store){this.store=store;store.initialize();this.db=store.db;}
    transaction(work){return this.store.transaction(work);}
    get(assignmentId,id){
        const result=row(this.db.prepare("SELECT * FROM stud_storage_manifests WHERE id=? AND assignment_id=?").get(Academic.safeId(id,"Manifest ID"),Academic.safeId(assignmentId,"Assignment ID")));
        if(!result)Domain.fail("STORAGE_MANIFEST_NOT_FOUND","This Assignment has no such storage manifest.");
        return {...result,items:this.db.prepare("SELECT * FROM stud_storage_manifest_items WHERE manifest_id=? ORDER BY reference LIMIT 501").all(id).map(row),
            sources:this.db.prepare("SELECT * FROM stud_storage_manifest_sources WHERE manifest_id=? ORDER BY reference,object_type,object_id LIMIT 500").all(id).map(row),
            reviewIssues:this.db.prepare("SELECT * FROM stud_storage_manifest_review_issues WHERE manifest_id=? ORDER BY ordinal LIMIT 100").all(id).map(row)};
    }
    list(assignmentId,limit=20){
        Academic.safeId(assignmentId,"Assignment ID");
        if(!Number.isSafeInteger(limit)||limit<1||limit>Domain.LIMITS.page)Domain.fail("INVALID_INPUT","A bounded history limit is required.");
        return this.db.prepare("SELECT * FROM stud_storage_manifests WHERE assignment_id=? ORDER BY created_at DESC,id DESC LIMIT ?").all(assignmentId,limit).map(row);
    }
    insert(value,items,sources,issues){
        const id=Academic.createId("storage_manifest"),now=Academic.now();
        this.db.prepare(`INSERT INTO stud_storage_manifests
            (id,assignment_id,target_profile_id,target_profile_version,purpose,state,scope_hash,include_course_material,
            omitted_file_count,issue_count,inventory_truncated,shared_reference_count,created_at,updated_at)
            VALUES (?,?,?,?,?,'PREPARED',?,?,?,?,?,?,?,?)`).run(id,value.assignmentId,value.targetProfileId,value.targetProfileVersion,value.purpose,value.scopeHash,
                value.includeCourseMaterial?1:0,value.omittedFileCount,value.issueCount,value.inventoryTruncated?1:0,value.sharedReferenceCount,now,now);
        const statement=this.db.prepare(`INSERT INTO stud_storage_manifest_items
            (manifest_id,reference,source_profile_id,source_asset_version,source_profile_version,sha256,byte_size,state)
            VALUES (?,?,?,?,?,?,?,'PENDING')`);
        for(const item of items)statement.run(id,item.reference,item.activeProfileId,item.rowVersion,item.profileVersion,item.sha256,item.byteSize);
        const sourceStatement=this.db.prepare("INSERT INTO stud_storage_manifest_sources (manifest_id,reference,object_type,object_id,source_updated_at) VALUES (?,?,?,?,?)");
        for(const source of sources)sourceStatement.run(id,source.reference,source.type,source.id,source.updatedAt);
        const issueStatement=this.db.prepare("INSERT INTO stud_storage_manifest_review_issues (manifest_id,ordinal,code,object_type,object_id) VALUES (?,?,?,?,?)");
        issues.forEach((issue,index)=>issueStatement.run(id,index,issue.code,issue.type,issue.id));
        return this.get(value.assignmentId,id);
    }
    change(current,state,{runId=current.runId,rollbackRunId=current.rollbackRunId,errorCode=null,approve=false}={}){
        const now=Academic.now(),finished=["APPLIED","FAILED","CANCELLED","INTERRUPTED","ROLLED_BACK"].includes(state)?now:null;
        const result=this.db.prepare(`UPDATE stud_storage_manifests SET state=?,run_id=?,rollback_run_id=?,error_code=?,
            approved_at=COALESCE(approved_at,?),row_version=row_version+1,updated_at=?,finished_at=? WHERE id=? AND row_version=?`).run(
                state,runId,rollbackRunId,errorCode,approve?now:null,now,finished,current.id,current.rowVersion);
        if(result.changes!==1)Domain.fail("STALE_STORAGE_VERSION","The transfer changed. Review its current state.");
        return this.get(current.assignmentId,current.id);
    }
    retain(manifest,item,profileId){
        this.db.prepare(`INSERT INTO stud_storage_copies (reference,profile_id,sha256,byte_size,manifest_id,verified_at,state)
            VALUES (?,?,?,?,?,?,'RETAINED') ON CONFLICT(reference,profile_id) DO UPDATE SET sha256=excluded.sha256,
            byte_size=excluded.byte_size,manifest_id=excluded.manifest_id,verified_at=excluded.verified_at,state='RETAINED'`).run(
                item.reference,profileId,item.sha256,item.byteSize,manifest.id,Academic.now());
    }
    switchAsset(item,profileId,expectedVersion){
        const result=this.db.prepare(`UPDATE stud_storage_assets SET active_profile_id=?,row_version=row_version+1,updated_at=?
            WHERE reference=? AND row_version=? AND sha256=? AND byte_size=?`).run(profileId,Academic.now(),item.reference,expectedVersion,item.sha256,item.byteSize);
        if(result.changes!==1)Domain.fail("STALE_STORAGE_VERSION","A file location or identity changed before the transfer could be applied.");
    }
    markVerified(manifest,item){this.db.prepare("UPDATE stud_storage_manifest_items SET state='VERIFIED' WHERE manifest_id=? AND reference=?").run(manifest.id,item.reference);}
    markApplied(manifest,item){this.db.prepare("UPDATE stud_storage_manifest_items SET state='APPLIED',applied_asset_version=? WHERE manifest_id=? AND reference=?").run(item.sourceAssetVersion+1,manifest.id,item.reference);}
}
module.exports=Object.freeze({StudStorageManifestRepository});
