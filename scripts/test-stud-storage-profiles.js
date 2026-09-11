#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {DatabaseSync}=require("node:sqlite");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudStoragePaths}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {LOCAL_PROFILE_ID}=require("../src/classes/workspaces/studStorageModel.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-storage-profiles-")));
const uuid="11111111-1111-1111-1111-111111111111";
let store,passed=0;
async function check(name,work){await work();passed++;console.log(`${name}: PASS`);}
function expect(code,work){assert.throws(work,error=>error.code===code);}
function strip27(dbPath){const db=new DatabaseSync(dbPath);db.exec(`PRAGMA foreign_keys=OFF;
DROP INDEX stud_storage_document_reference_index; DROP INDEX stud_storage_paper_reference_index;
DROP INDEX stud_storage_resource_reference_index; DROP INDEX stud_storage_dataset_reference_index;
DROP TABLE stud_storage_cleanup_records; DROP TABLE stud_storage_copies; DROP TABLE stud_storage_manifest_items;
DROP TABLE stud_storage_manifests; DROP TABLE stud_storage_assets; DROP TABLE stud_storage_profiles;
DELETE FROM stud_schema_migrations WHERE version=27;`);db.close();}
(async()=>{try{
    const local=path.join(root,"local"),mount=path.join(root,"Synthetic external disk");fs.mkdirSync(mount);
    store=new StudAcademicStore({root:local}).initialize();
    let mountPoint=mount,selection={canceled:true};
    const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid,mountPoint})});
    let service=new StudStorageProfileService({store,paths,dialog:{showOpenDialog:async()=>selection}});
    await check("FRESH_V27_LOCAL_PROFILE_WITHOUT_FABRICATED_ASSIGNMENT_STATE",()=>{
        assert.strictEqual(store.schemaInfo().version,27);
        assert.strictEqual(service.profiles().length,1);
        for(const table of ["stud_storage_assets","stud_storage_manifests","stud_storage_manifest_items","stud_storage_copies","stud_storage_cleanup_records"])assert.strictEqual(store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count,0);
        assert.deepStrictEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
    });
    await check("CANCELLED_PICKER_CREATES_NOTHING",async()=>{assert.deepStrictEqual(await service.chooseExternal({label:"Synthetic external"}),{cancelled:true});assert.strictEqual(service.profiles().length,1);});
    await check("PAYLOAD_REJECTS_RENDERER_PATHS",async()=>assert.rejects(service.chooseExternal({label:"External",path:"/not-authorized"}),error=>error.code==="INVALID_INPUT"));
    await check("NATIVE_FAILURES_DO_NOT_LEAK_SELECTED_PATHS",async()=>{
        const failing=new StudStorageProfileService({store,paths,dialog:{showOpenDialog:async()=>{throw new Error(`Private path ${root}`);}}});
        await assert.rejects(failing.chooseExternal({label:"External"}),error=>error.code==="FILE_DIALOG_UNAVAILABLE"&&!error.message.includes(root));
        assert.throws(()=>service.registerSelectedDirectory(path.join(root,"absent-private-folder"),"Missing"),error=>error.code==="STORAGE_OFFLINE"&&!error.message.includes(root));
    });
    selection={canceled:false,filePaths:[mount]};
    let external;
    await check("EXPLICIT_NATIVE_SELECTION_REGISTERED_WITHOUT_MOVING_FILES",async()=>{
        const result=await service.chooseExternal({label:"Synthetic archive"});external=service.repository.profile(result.profile.id);
        assert.strictEqual(result.profile.availability,"AVAILABLE");
        for(const forbidden of ["mountHint","volumeUuid","identityNonce","relativeRoot"])assert.ok(!Object.hasOwn(result.profile,forbidden));
        assert.ok(!JSON.stringify(result).includes(root));assert.strictEqual(store.dbPath,path.join(local,"academic.sqlite"));
    });
    const assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic interdisciplinary assignment"});
    const bytes=Buffer.from("%PDF-synthetic public fixture"),digest=crypto.createHash("sha256").update(bytes).digest("hex"),ref=`documents/paper_${digest.slice(0,16)}.pdf`;
    fs.mkdirSync(path.join(local,"documents"));fs.writeFileSync(path.join(local,ref),bytes);
    store.createEntity("RESOURCE",{title:"Synthetic source",assignmentId:assignment.id,type:"PDF",localReference:ref,checksum:digest});
    await check("LEGACY_REFERENCE_REMAINS_LOCAL_WITHOUT_BACKFILL",()=>{assert.strictEqual(service.resolveManaged(ref),path.join(local,ref));assert.strictEqual(service.repository.asset(ref),null);});
    await check("CANONICAL_ASSET_REGISTRATION_VERIFIES_BYTES_AND_DEDUPLICATES",()=>{
        const first=service.registerCanonicalFile(ref),second=service.registerCanonicalFile(ref);
        assert.strictEqual(first.activeProfileId,LOCAL_PROFILE_ID);assert.deepStrictEqual(second,first);assert.strictEqual(first.sha256,digest);assert.strictEqual(first.byteSize,bytes.length);
        assert.strictEqual(store.getEntity("ASSIGNMENT",assignment.id).title,"Synthetic interdisciplinary assignment");
    });
    await check("UNOWNED_REFERENCE_CANNOT_ENTER_STORAGE_CATALOG",()=>expect("UNOWNED_MANAGED_REFERENCE",()=>service.registerCanonicalFile("documents/unowned_0123456789abcdef.pdf")));
    await check("CANONICAL_HASH_MISMATCH_IS_NOT_REPAIRED_SILENTLY",()=>{
        fs.writeFileSync(path.join(local,ref),"changed bytes");expect("STORAGE_HASH_MISMATCH",()=>service.inspectCanonicalFile(ref));fs.writeFileSync(path.join(local,ref),bytes);
        assert.strictEqual(service.repository.asset(ref).sha256,digest);
    });
    await check("CONFLICTING_CANONICAL_OWNERS_FAIL_CLOSED",()=>{
        const other=store.createEntity("RESOURCE",{title:"Conflicting synthetic checksum",type:"PDF",localReference:ref,checksum:"0".repeat(64)});
        expect("STORAGE_HASH_MISMATCH",()=>service.inspectCanonicalFile(ref));store.db.prepare("DELETE FROM stud_resources WHERE id=?").run(other.id);
    });
    await check("RESEARCH_PDF_METADATA_CHECKSUM_IS_AUTHORITATIVE_TOO",()=>{
        const paper=store.createEntity("RESEARCH_PAPER",{title:"Synthetic paper",localDocumentReference:ref,documentMetadataJson:JSON.stringify({sha256:"0".repeat(64)})});
        expect("STORAGE_HASH_MISMATCH",()=>service.inspectCanonicalFile(ref));
        store.updateEntity("RESEARCH_PAPER",paper.id,{documentMetadataJson:"malformed"});expect("STORAGE_SOURCE_METADATA_INVALID",()=>service.inspectCanonicalFile(ref));
        store.updateEntity("RESEARCH_PAPER",paper.id,{documentMetadataJson:JSON.stringify({sha256:digest})});assert.strictEqual(service.inspectCanonicalFile(ref).sha256,digest);
    });
    await check("CANONICAL_LOOKUPS_USE_INDEXES_AND_SHARED_OWNER_BOUND_IS_EXPLICIT",()=>{
        for(const [table,column] of [["stud_academic_documents","managed_reference"],["stud_research_papers","local_document_reference"],["stud_resources","local_reference"],["stud_datasets","managed_reference"]]){
            const query=store.db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM ${table} WHERE ${column}=?`).all(ref);
            assert.ok(query.some(row=>/USING INDEX stud_storage_/.test(row.detail)),table);
        }
        const insert=store.db.prepare("INSERT INTO stud_resources (id,type,title,local_reference,checksum,created_at,updated_at) VALUES (?,'PDF','Synthetic shared source',?,?,?,?)"),now=new Date().toISOString();
        store.transaction(()=>{for(let i=0;i<501;i++)insert.run(`storage_bound_${i}`,ref,digest,now,now);});
        expect("STORAGE_OWNER_LIMIT",()=>service.inspectCanonicalFile(ref));
        store.db.prepare("DELETE FROM stud_resources WHERE id GLOB 'storage_bound_*'").run();
    });
    await check("DISCONNECTED_PROFILE_RETAINS_METADATA_AND_LOCAL_FILES",()=>{
        fs.renameSync(mount,`${mount}-offline`);assert.strictEqual(service.profiles().find(p=>p.id===external.id).availability,"STORAGE_OFFLINE");
        assert.ok(store.getEntity("ASSIGNMENT",assignment.id));assert.strictEqual(service.inspectCanonicalFile(ref).sha256,digest);assert.ok(!fs.existsSync(mount));
        fs.renameSync(`${mount}-offline`,mount);
    });
    await check("REMOUNT_AT_DIFFERENT_PATH_REQUIRES_VERIFIED_EXPLICIT_RECONNECT",async()=>{
        mountPoint=`${mount}-renamed`;fs.renameSync(mount,mountPoint);
        assert.strictEqual(service.profiles().find(p=>p.id===external.id).availability,"STORAGE_OFFLINE");
        selection={canceled:false,filePaths:[path.join(mountPoint,external.relativeRoot)]};
        const result=await service.reconnect({profileId:external.id,expectedVersion:external.rowVersion});
        assert.strictEqual(result.profile.availability,"AVAILABLE");assert.strictEqual(result.profile.rowVersion,2);
        await assert.rejects(service.reconnect({profileId:external.id,expectedVersion:1}),error=>error.code==="STALE_STORAGE_VERSION");
    });
    await check("PROFILE_RESTART_RETAINS_IDENTITY_AND_MAPPING",()=>{
        store.close();store=new StudAcademicStore({root:local}).initialize();service=new StudStorageProfileService({store,paths});
        assert.strictEqual(service.profiles().find(p=>p.id===external.id).availability,"AVAILABLE");assert.strictEqual(service.inspectCanonicalFile(ref).sha256,digest);
    });
    await check("FOREIGN_PROFILE_REFERENCE_REJECTED_BY_SQLITE",()=>assert.throws(()=>store.db.prepare("UPDATE stud_storage_assets SET active_profile_id='missing' WHERE reference=?").run(ref),/FOREIGN KEY/));
    const migrationRoot=path.join(root,"migration");let migration=new StudAcademicStore({root:migrationRoot}).initialize();
    const old=migration.createEntity("ASSIGNMENT",{title:"Existing academic state"});migration.close();strip27(path.join(migrationRoot,"academic.sqlite"));
    await check("V26_TO_V27_PRESERVES_EXISTING_ASSIGNMENT_WITHOUT_MOVEMENT",()=>{
        const before=new DatabaseSync(path.join(migrationRoot,"academic.sqlite"));assert.strictEqual(before.prepare("SELECT MAX(version) version FROM stud_schema_migrations").get().version,26);before.close();
        migration=new StudAcademicStore({root:migrationRoot}).initialize();assert.strictEqual(migration.schemaInfo().version,27);assert.ok(migration.getEntity("ASSIGNMENT",old.id));
        assert.strictEqual(migration.db.prepare("SELECT COUNT(*) count FROM stud_storage_assets").get().count,0);assert.deepStrictEqual(migration.db.prepare("PRAGMA foreign_key_check").all(),[]);migration.close();
    });
    const rollbackRoot=path.join(root,"rollback");let rollback=new StudAcademicStore({root:rollbackRoot}).initialize();const retained=rollback.createEntity("ASSIGNMENT",{title:"Rollback retained"});rollback.close();strip27(path.join(rollbackRoot,"academic.sqlite"));
    const collide=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));collide.exec("CREATE TABLE stud_storage_manifest_items (sentinel TEXT)");collide.close();
    await check("MIGRATION_FAILURE_ROLLS_BACK_ALL_NEW_TABLES_AND_PRESERVES_DATA",()=>{
        assert.throws(()=>new StudAcademicStore({root:rollbackRoot}).initialize(),error=>error.code==="DATABASE_OPEN_FAILED"&&/migration 27/.test(error.details.cause));
        const db=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));assert.strictEqual(db.prepare("SELECT MAX(version) version FROM stud_schema_migrations").get().version,26);assert.ok(db.prepare("SELECT id FROM stud_assignments WHERE id=?").get(retained.id));
        assert.strictEqual(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name='stud_storage_profiles'").get().count,0);db.close();
    });
    console.log(`STUD STORAGE PROFILES: ${passed} PASSED (synthetic filesystem; no provider calls)`);
}finally{if(store)store.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
