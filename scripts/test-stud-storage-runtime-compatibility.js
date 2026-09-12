#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStoragePaths}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudStorageTransferService}=require("../src/classes/workspaces/studStorageTransferService.class.js");
const {StudManagedStorageRuntime}=require("../src/classes/workspaces/studManagedStorageRuntime.class.js");
const {StudResearchRuntime}=require("../src/classes/workspaces/studResearchRuntime.class.js");
const {StudNotebookRuntime}=require("../src/classes/workspaces/studNotebookRuntime.class.js");
const {StudLmsRuntime}=require("../src/classes/workspaces/studLmsRuntime.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-storage-runtime-")));let store,passed=0;
async function check(name,work){await work();passed++;console.log(`${name}: PASS`);}
(async()=>{try{
 const local=path.join(root,"local"),mount=path.join(root,"archive");fs.mkdirSync(local);fs.mkdirSync(mount);
 store=new StudAcademicStore({root:local}).initialize();
 const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid:"11111111-1111-1111-1111-111111111111",mountPoint:mount})});
 const storage=new StudStorageProfileService({store,paths}),managedStorage=new StudManagedStorageRuntime(storage),service=new StudStorageTransferService({store,storage});
 const external=storage.registerSelectedDirectory(mount,"Synthetic archive"),assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic mixed source assignment"});
 let networkCalls=0;const fetch=()=>{networkCalls++;throw new Error("No provider requests expected");};
 const research=new StudResearchRuntime({root:local,managedStorage,fetch,env:{}}),notebook=new StudNotebookRuntime({root:local,managedStorage,fetch});
 const lms=new StudLmsRuntime({store,root:local,managedStorage,fetch,vault:{}});
 const source=path.join(root,"Synthetic paper.pdf"),csv=path.join(root,"Synthetic lab.csv");fs.writeFileSync(source,"%PDF-Synthetic fixture; not a rendered PDF");fs.writeFileSync(csv,"time,value\n1,10\n2,20\n");
 let pdf,data,moodle,manifest;
 await check("EXPLICIT_IMPORTS_KEEP_CANONICAL_REFERENCE_FORMATS",()=>{
    pdf=research.importPdfFromPath(source);data=notebook.importDatasetFromPath(csv);moodle=lms.managedMoodleFile(Buffer.from("%PDF-Moodle public synthetic material"),{title:"Brief.pdf",mimeType:"application/pdf"});
    assert.ok(pdf.reference.startsWith("documents/"));assert.ok(data.reference.startsWith("datasets/"));assert.ok(moodle.reference.startsWith("documents/moodle_"));
    for(const object of [pdf,data,moodle])store.createEntity("RESOURCE",{title:"Synthetic managed source",assignmentId:assignment.id,type:"FILE",localReference:object.reference,checksum:object.sha256});
    assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_storage_assets").get().count,0);
 });
 await check("RESEARCH_NOTEBOOK_MOODLE_SHARE_VERIFIED_EXTERNAL_MAPPING",async()=>{
    manifest=await service.prepare({assignmentId:assignment.id,targetProfileId:external.id,expectedTargetVersion:1,purpose:"RELOCATE",
        expectedScopeHash:service.catalog.inspect({assignmentId:assignment.id}).scopeHash,references:[pdf.reference,data.reference,moodle.reference]});
    manifest=await service.execute({assignmentId:assignment.id,manifestId:manifest.id,expectedVersion:manifest.rowVersion,confirmLimitedScope:true});
    // Poison the retained local files: reads must follow the active mapping,
    // never silently use the old local path. Restore before testing rollback.
    fs.writeFileSync(path.join(local,pdf.reference),"wrong local bytes");
    assert.strictEqual(research.readManagedPdf(pdf.reference).sha256,pdf.sha256);assert.strictEqual(notebook.readManagedDataset(data.reference).rowCount,2);assert.strictEqual(lms.managedReferenceExists(moodle.reference),true);
    fs.writeFileSync(path.join(local,pdf.reference),fs.readFileSync(source));
 });
 await check("REIMPORT_SAME_BYTES_REUSES_ACTIVE_PROFILE_NO_LOCAL_FALLBACK",()=>{
    const before=fs.statSync(paths.file(external,pdf.reference));assert.strictEqual(research.importPdfFromPath(source).reference,pdf.reference);assert.strictEqual(fs.statSync(paths.file(external,pdf.reference)).ino,before.ino);
    assert.strictEqual(notebook.importDatasetFromPath(csv).reference,data.reference);
    assert.strictEqual(lms.managedMoodleFile(Buffer.from("%PDF-Moodle public synthetic material"),{title:"Brief.pdf",mimeType:"application/pdf"}).reference,moodle.reference);
 });
 await check("MAPPED_VOLUME_OFFLINE_FAILS_CLOSED_WITHOUT_NETWORK_OR_REPAIR",()=>{
    fs.renameSync(mount,`${mount}-offline`);
    for(const work of [()=>research.readManagedPdf(pdf.reference),()=>research.importPdfFromPath(source),()=>notebook.readManagedDataset(data.reference),()=>lms.managedReferenceExists(moodle.reference)])
        assert.throws(work,error=>error.code==="STORAGE_OFFLINE"&&!error.message.includes(root));
    assert.strictEqual(networkCalls,0);assert.ok(!fs.existsSync(mount));assert.ok(store.getEntity("ASSIGNMENT",assignment.id));fs.renameSync(`${mount}-offline`,mount);
 });
 await check("TAMPERED_EXISTING_DESTINATION_IS_NEVER_OVERWRITTEN",()=>{
    const target=paths.file(external,pdf.reference);fs.writeFileSync(target,"tampered archive");
    assert.throws(()=>research.importPdfFromPath(source),error=>error.code==="STORAGE_HASH_MISMATCH");assert.strictEqual(fs.readFileSync(target,"utf8"),"tampered archive");fs.writeFileSync(target,fs.readFileSync(source));
 });
 await check("FIXED_NAMESPACES_REJECT_VAULT_DATABASE_AND_TRAVERSAL",()=>{
    for(const ref of ["academic.sqlite","credentials.json","../secret","documents/a.pdf?token=secret","datasets/%2e%2e.csv"]){
        assert.throws(()=>managedStorage.read(ref),error=>error.code==="INVALID_MANAGED_REFERENCE");assert.throws(()=>managedStorage.put(ref,Buffer.from("x")),error=>error.code==="INVALID_MANAGED_REFERENCE");
    }
 });
 await check("MAPPED_MISSING_FILE_CAN_ONLY_REPAIR_ON_ITS_ACTIVE_PROFILE",()=>{
    const target=paths.file(external,moodle.reference);fs.unlinkSync(target);assert.strictEqual(lms.managedReferenceExists(moodle.reference),false);
    lms.managedMoodleFile(Buffer.from("%PDF-Moodle public synthetic material"),{title:"Brief.pdf",mimeType:"application/pdf"});assert.ok(fs.existsSync(target));assert.strictEqual(storage.repository.asset(moodle.reference).activeProfileId,external.id);
 });
 await check("NEW_CONTENT_REMAINS_LOCAL_UNTIL_EXPLICITLY_RELOCATED",()=>{
    const created=lms.managedMoodleFile(Buffer.from("new synthetic lecture"),{title:"Lecture.txt",mimeType:"text/plain"});assert.ok(fs.existsSync(path.join(local,created.reference)));assert.strictEqual(storage.repository.asset(created.reference),null);
 });
 await check("ROLLBACK_RESTORES_RUNTIME_READS_WITH_SAME_CANONICAL_IDS",async()=>{
    const current=service.inspect({assignmentId:assignment.id,manifestId:manifest.id});await service.rollback({assignmentId:assignment.id,manifestId:manifest.id,expectedVersion:current.rowVersion});
    assert.strictEqual(research.readManagedPdf(pdf.reference).sha256,pdf.sha256);assert.strictEqual(notebook.readManagedDataset(data.reference).rowCount,2);assert.strictEqual(lms.managedReferenceExists(moodle.reference),true);
    assert.strictEqual(networkCalls,0);assert.strictEqual(store.dbPath,path.join(local,"academic.sqlite"));
 });
 research.dispose();notebook.dispose();if(typeof lms.dispose==="function")lms.dispose();
 console.log(`STUD STORAGE RUNTIME COMPATIBILITY: ${passed} PASSED (injected main-only adapter; no SSO/provider request)`);
}finally{if(store)store.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
