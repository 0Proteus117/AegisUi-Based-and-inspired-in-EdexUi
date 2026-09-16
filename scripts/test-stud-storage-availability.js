#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStoragePaths}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudStorageAvailability}=require("../src/classes/workspaces/studStorageAvailability.class.js");
const {StudManagedStorageRuntime}=require("../src/classes/workspaces/studManagedStorageRuntime.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-availability-")));let store,passed=0,volumeCalls=0;
function check(name,work){work();passed++;console.log(`${name}: PASS`);}
try{
 const local=path.join(root,"local"),external=path.join(root,"external");fs.mkdirSync(local);fs.mkdirSync(external);store=new StudAcademicStore({root:local}).initialize();
 const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>{volumeCalls++;return {uuid:"11111111-1111-1111-1111-111111111111",mountPoint:external};}}),storage=new StudStorageProfileService({store,paths}),availability=new StudStorageAvailability({store,storage});
 const bytes=Buffer.from("%PDF-synthetic availability"),hash=crypto.createHash("sha256").update(bytes).digest("hex"),reference=`documents/synthetic_${hash.slice(0,16)}.pdf`;
 fs.mkdirSync(path.join(local,"documents"));fs.writeFileSync(path.join(local,reference),bytes);
 const resource=store.createEntity("RESOURCE",{title:"Synthetic source",type:"PDF",localReference:reference,checksum:hash}),artifact={canonicalObjectType:"RESOURCE",canonicalObjectId:resource.id,availabilityState:"AVAILABLE"},read=()=>availability.page([artifact])[0];
 check("CANONICAL_AND_BYTE_AVAILABILITY_REMAIN_DISTINCT",()=>{const result=read();assert.strictEqual(result.availabilityState,"AVAILABLE");assert.strictEqual(result.managedFileAvailability.state,"AVAILABLE");assert.strictEqual(result.managedFileAvailability.integrity,"NOT_RECHECKED");assert.ok(!Object.hasOwn(artifact,"managedFileAvailability"));});
 check("NON_FILE_ARTIFACTS_HAVE_NO_INVENTED_STORAGE_STATE",()=>{const note={canonicalObjectType:"NOTE",canonicalObjectId:"stud_note_synthetic"};assert.strictEqual(availability.page([note])[0],note);});
 check("METADATA_ONLY_SOURCE_IS_NOT_IMPORTED",()=>{const r=store.createEntity("RESOURCE",{title:"Public reference metadata",type:"LINK"});assert.strictEqual(availability.page([{...artifact,canonicalObjectId:r.id}])[0].managedFileAvailability.state,"NOT_IMPORTED");});
 check("MISSING_BYTES_LEAVE_CANONICAL_METADATA_AVAILABLE",()=>{fs.unlinkSync(path.join(local,reference));assert.strictEqual(read().managedFileAvailability.state,"MISSING");assert.strictEqual(read().availabilityState,"AVAILABLE");fs.writeFileSync(path.join(local,reference),bytes);});
 check("MISSING_CANONICAL_SOURCE_IS_NOT_A_FAKE_AVAILABLE_FILE",()=>{assert.strictEqual(availability.page([{...artifact,canonicalObjectId:"stud_resource_absent"}])[0].managedFileAvailability.reason,"CANONICAL_SOURCE_MISSING");});
 const profile=storage.registerSelectedDirectory(external,"Synthetic archive"),file=paths.file(profile,reference,{createDirectory:true});fs.writeFileSync(file,bytes);storage.repository.registerLocal(reference,hash,bytes.length);store.db.prepare("UPDATE stud_storage_assets SET active_profile_id=?,row_version=2 WHERE reference=?").run(profile.id,reference);
 check("BOUNDED_PAGE_PROBES_VOLUME_ONCE",()=>{volumeCalls=0;const result=availability.page(Array(50).fill(artifact));assert.strictEqual(volumeCalls,1);assert.ok(result.every(a=>a.managedFileAvailability.state==="AVAILABLE"));assert.throws(()=>availability.page(Array(101).fill(artifact)),e=>e.code==="INVALID_INPUT");});
 check("OFFLINE_IS_DERIVED_WITHOUT_STORED_ARTIFACT_MUTATION",()=>{fs.renameSync(external,`${external}-offline`);const result=read();assert.strictEqual(result.managedFileAvailability.state,"OFFLINE");assert.strictEqual(result.availabilityState,"AVAILABLE");fs.renameSync(`${external}-offline`,external);assert.strictEqual(read().managedFileAvailability.state,"AVAILABLE");});
 check("PRESENCE_NEVER_CLAIMS_A_HASH_RECHECK",()=>{fs.writeFileSync(file,"tampered bytes");assert.strictEqual(read().managedFileAvailability.reason,"PRESENT_NOT_HASH_RECHECKED");assert.throws(()=>new StudManagedStorageRuntime(storage).read(reference));fs.writeFileSync(file,bytes);});
 check("SYMLINK_AND_PRIVATE_REFERENCE_REJECTED",()=>{fs.unlinkSync(file);fs.symlinkSync(path.join(local,reference),file);assert.strictEqual(read().managedFileAvailability.state,"UNAVAILABLE");fs.unlinkSync(file);fs.writeFileSync(file,bytes);store.db.prepare("UPDATE stud_resources SET local_reference='../private' WHERE id=?").run(resource.id);assert.strictEqual(read().managedFileAvailability.reason,"INVALID_MANAGED_REFERENCE");store.db.prepare("UPDATE stud_resources SET local_reference=? WHERE id=?").run(reference,resource.id);});
 check("STATUS_HAS_NO_PRIVATE_PATH_OR_HIDDEN_OPERATION",()=>{assert.ok(!JSON.stringify(read()).includes(root));assert.strictEqual(store.db.prepare("SELECT COUNT(*) n FROM stud_operation_runs").get().n,0);assert.strictEqual(store.db.prepare("SELECT COUNT(*) n FROM stud_operation_events").get().n,0);});
 console.log(`STUD STORAGE AVAILABILITY: ${passed} PASSED`);
}finally{store?.close();fs.rmSync(root,{recursive:true,force:true});}
