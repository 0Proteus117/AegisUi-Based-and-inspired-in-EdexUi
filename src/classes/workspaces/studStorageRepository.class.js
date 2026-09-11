"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studStorageModel.class.js");
function row(value) {
    return value ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase()),item])) : null;
}

// Main-process internal repository on the existing academic connection.
// Lifecycle decisions belong to the service, not the renderer or this adapter.
class StudStorageRepository {
    constructor(store) { this.store=store; store.initialize(); this.db=store.db; }
    transaction(work) { return this.store.transaction(work); }
    profile(id) {
        const found=row(this.db.prepare("SELECT * FROM stud_storage_profiles WHERE id=?").get(Academic.safeId(id,"Storage profile ID")));
        if (!found) Domain.fail("STORAGE_PROFILE_NOT_FOUND","This storage profile does not exist.");
        return found;
    }
    profiles() { return this.db.prepare("SELECT * FROM stud_storage_profiles ORDER BY kind DESC,created_at,id LIMIT ?").all(Domain.LIMITS.profiles).map(row); }
    insertProfile(value) {
        if (this.db.prepare("SELECT COUNT(*) count FROM stud_storage_profiles").get().count>=Domain.LIMITS.profiles) Domain.fail("STORAGE_PROFILE_LIMIT","The storage profile limit has been reached.");
        const now=Academic.now();
        this.db.prepare(`INSERT INTO stud_storage_profiles (id,kind,label,volume_uuid,mount_hint,relative_root,identity_nonce,created_at,updated_at)
            VALUES (?,'EXTERNAL',?,?,?,?,?,?,?)`).run(value.id,value.label,value.volumeUuid,value.mountHint,value.relativeRoot,value.identityNonce,now,now);
        return this.profile(value.id);
    }
    assertVersion(value,expected) { if(value.rowVersion!==Domain.version(expected)) Domain.fail("STALE_STORAGE_VERSION","Storage changed since this action was prepared. Review it again."); }
    reconnect(profile,mountHint,expected) {
        this.assertVersion(profile,expected);
        const result=this.db.prepare("UPDATE stud_storage_profiles SET mount_hint=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?").run(mountHint,Academic.now(),profile.id,expected);
        if(result.changes!==1) Domain.fail("STALE_STORAGE_VERSION","Storage changed before reconnection.");
        return this.profile(profile.id);
    }
    asset(reference) { return row(this.db.prepare("SELECT * FROM stud_storage_assets WHERE reference=?").get(Domain.managedReference(reference))); }
    registerLocal(reference,sha256,byteSize) {
        Domain.managedReference(reference);Domain.digest(sha256);
        if(!Number.isSafeInteger(byteSize)||byteSize<0||byteSize>Domain.LIMITS.fileBytes) Domain.fail("STORAGE_FILE_LIMIT","Invalid verified asset size.");
        const now=Academic.now();
        this.db.prepare(`INSERT INTO stud_storage_assets (reference,active_profile_id,sha256,byte_size,created_at,updated_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT(reference) DO NOTHING`).run(reference,Domain.LOCAL_PROFILE_ID,Domain.digest(sha256),byteSize,now,now);
        return this.asset(reference);
    }
    canonicalOwners(reference) {
        Domain.managedReference(reference);
        // Fixed canonical columns; deliberately no renderer-selected table/SQL.
        return this.db.prepare(`SELECT 'ACADEMIC_DOCUMENT' object_type,id,checksum FROM stud_academic_documents WHERE managed_reference=?
            UNION ALL SELECT 'RESEARCH_PAPER',id,
                CASE WHEN document_metadata_json IS NULL THEN NULL
                WHEN json_valid(document_metadata_json) THEN json_extract(document_metadata_json,'$.sha256')
                ELSE 'INVALID_METADATA' END
                FROM stud_research_papers WHERE local_document_reference=?
            UNION ALL SELECT 'RESOURCE',id,checksum FROM stud_resources WHERE local_reference=?
            UNION ALL SELECT 'DATASET',id,checksum FROM stud_datasets WHERE managed_reference=? LIMIT 501`).all(reference,reference,reference,reference).map(row);
    }
}
module.exports=Object.freeze({StudStorageRepository});
