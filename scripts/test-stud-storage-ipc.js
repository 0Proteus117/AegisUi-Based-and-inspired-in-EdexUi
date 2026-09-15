#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudStoragePaths}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {StudStorageController,CHANNELS}=require("../src/classes/workspaces/studStorageController.class.js");
const {registerStudAcademicIpc}=require("../src/classes/workspaces/studAcademicIpc.class.js");
const {createTrustedIpcMain}=require("../src/classes/ipcSecurity.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-storage-ipc-")));let passed=0,registration,store;
async function check(name,work){await work();passed++;console.log(`${name}: PASS`);}
(async()=>{try{
 const local=path.join(root,"local"),mount=path.join(root,"external");fs.mkdirSync(local);fs.mkdirSync(mount);
 store=new StudAcademicStore({root:local}).initialize();
 const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid:"11111111-1111-1111-1111-111111111111",mountPoint:mount})});
 const storage=new StudStorageProfileService({store,paths,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[mount]})}});
 const handlers=new Map(),ipcMain={on(){},handle:(c,h)=>handlers.set(c,h),removeHandler:c=>handlers.delete(c)},ui=path.join(root,"ui.html");
 const ipc=createTrustedIpcMain(ipcMain,ui),event={sender:{getURL:()=>`file://${ui}`,isDestroyed:()=>false},senderFrame:{url:`file://${ui}`}};
 const dead={dispose(){}},calls={network:0},fetch=()=>{calls.network++;throw new Error("No provider expected");};
 registration=registerStudAcademicIpc({ipc,store,app:{getPath:()=>local,getVersion:()=>"synthetic-M14"},fetch,env:{},storageProfileService:storage,
    lmsRuntime:dead,documentRuntime:dead,academicAiRuntime:dead,humanisationRuntime:dead,lecturerCommitteeRuntime:dead,runCoordinator:dead});
 const invoke=(channel,payload={})=>handlers.get(channel)(event,payload),assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic IPC Assignment"});
 const paper=store.createEntity("RESEARCH_PAPER",{title:"Synthetic IPC paper"}),bytes=Buffer.from("%PDF-IPC synthetic bytes"),hash=crypto.createHash("sha256").update(bytes).digest("hex"),ref=`documents/paper_${hash.slice(0,16)}.pdf`;
 fs.mkdirSync(path.join(local,"documents"));fs.writeFileSync(path.join(local,ref),bytes);store.setPaperDocument(paper.id,{reference:ref,sha256:hash,size:bytes.length});
 store.createRelationship({fromType:"ASSIGNMENT",fromId:assignment.id,toType:"RESEARCH_PAPER",toId:paper.id,relationType:"REFERENCES",source:"USER"});
 let profile,manifest;
 await check("FIXED_PRELOAD_CHANNELS_MATCH_MAIN_REGISTRATION",()=>{
    const preload=fs.readFileSync(path.join(__dirname,"../src/preload.js"),"utf8");for(const channel of CHANNELS){assert.ok(handlers.has(channel));assert.ok(registration.channels.includes(channel));assert.ok(preload.includes(`"${channel}"`));}
    assert.ok(!CHANNELS.some(channel=>/^stud-storage-(?:shell|read-file|write-file|sql|network|append|log|recover)(?:-|$)/.test(channel)));
 });
 await check("EXACT_MAIN_FRAME_REJECTS_REMOTE_FOREIGN_FILE_AND_SUBFRAME",()=>{
    for(const url of ["https://evil.example/","file:///tmp/other.html",`${event.senderFrame.url}?x=1`])assert.throws(()=>handlers.get("stud-storage-profiles")({...event,senderFrame:{url}},{}),error=>error.code==="UNTRUSTED_RENDERER");
    assert.throws(()=>handlers.get("stud-storage-profiles")({...event,senderFrame:{url:event.senderFrame.url,parent:{}}},{}),error=>error.code==="UNTRUSTED_RENDERER");
 });
 await check("NATIVE_PROFILE_SELECTION_DOES_NOT_RETURN_PRIVATE_PATHS",async()=>{
    const result=await invoke("stud-storage-profile-choose",{label:"Synthetic disk"});assert.strictEqual(result.ok,true);profile=result.data.profile;
    assert.ok(!JSON.stringify(result).includes(root));for(const key of ["volumeUuid","mountHint","identityNonce","relativeRoot"])assert.ok(!Object.hasOwn(profile,key));
    const invalid=await invoke("stud-storage-profile-choose",{label:"Disk",path:"/private"});assert.strictEqual(invalid.code,"INVALID_INPUT");
 });
 await check("BOUNDED_INVENTORY_DOES_NOT_CREATE_RUN_OR_NETWORK_REQUEST",async()=>{
    const result=await invoke("stud-storage-catalog",{assignmentId:assignment.id,limit:1});assert.strictEqual(result.data.files.length,1);assert.strictEqual(result.data.portableReady,false);
    assert.strictEqual((await invoke("stud-storage-catalog",{assignmentId:assignment.id,limit:501})).code,"INVALID_INPUT");
    assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,0);assert.strictEqual(calls.network,0);
 });
 await check("TYPED_PREPARATION_AND_MAIN_APPROVAL_VALIDATION",async()=>{
    const catalog=(await invoke("stud-storage-catalog",{assignmentId:assignment.id})).data;
    const result=await invoke("stud-storage-transfer-prepare",{assignmentId:assignment.id,targetProfileId:profile.id,expectedTargetVersion:profile.rowVersion,purpose:"RELOCATE",expectedScopeHash:catalog.scopeHash,references:[ref]});assert.strictEqual(result.ok,true);manifest=result.data;
    assert.strictEqual(manifest.state,"PREPARED");assert.strictEqual(manifest.totalBytes,bytes.length);
    const base={assignmentId:assignment.id,manifestId:manifest.id,expectedVersion:manifest.rowVersion};
    assert.strictEqual((await invoke("stud-storage-transfer-execute",base)).code,"STORAGE_APPROVAL_REQUIRED");
    assert.strictEqual((await invoke("stud-storage-transfer-execute",{...base,state:"APPLIED"})).code,"INVALID_INPUT");
    const result2=await invoke("stud-storage-transfer-execute",{...base,confirmLimitedScope:true});assert.strictEqual(result2.ok,true);manifest=result2.data;assert.strictEqual(manifest.state,"APPLIED");
 });
 await check("PRODUCTION_PDF_HANDLER_READS_ACTIVE_EXTERNAL_BYTES",async()=>{
    fs.writeFileSync(path.join(local,ref),"poisoned original");const result=await invoke("stud-paper-read-pdf",{paperId:paper.id});assert.strictEqual(result.ok,true);assert.strictEqual(result.data.sha256,hash);fs.writeFileSync(path.join(local,ref),bytes);
 });
 await check("OFFLINE_PROFILE_ERRORS_REMAIN_TYPED_WITH_METADATA_ACCESS",async()=>{
    fs.renameSync(mount,`${mount}-offline`);const result=await invoke("stud-paper-read-pdf",{paperId:paper.id});assert.strictEqual(result.code,"STORAGE_OFFLINE");assert.ok(!JSON.stringify(result).includes(root));
    assert.strictEqual((await invoke("stud-storage-transfer-read",{assignmentId:assignment.id,manifestId:manifest.id})).ok,true);fs.renameSync(`${mount}-offline`,mount);
 });
 await check("PREPARATION_SHUTDOWN_ABORTS_BEFORE_STORE_CLOSE_WRITES",async()=>{
    const controller=new StudStorageController({store,storage}),catalog=controller.catalog({assignmentId:assignment.id});
    const pending=controller.transfers.prepare({assignmentId:assignment.id,targetProfileId:"stud_storage_local",expectedTargetVersion:1,purpose:"PORTABLE",expectedScopeHash:catalog.scopeHash,references:[ref]});
    controller.dispose();await assert.rejects(pending,error=>error.code==="STORAGE_CANCELLED");
    assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_storage_manifests").get().count,1);
 });
 await check("TRANSFER_SHUTDOWN_RECOVERS_AFTER_REOPEN_WITHOUT_REPLAY",async()=>{
    const controller=new StudStorageController({store,storage}),catalog=controller.catalog({assignmentId:assignment.id});
    const prepared=await controller.transfers.prepare({assignmentId:assignment.id,targetProfileId:"stud_storage_local",expectedTargetVersion:1,purpose:"PORTABLE",expectedScopeHash:catalog.scopeHash,references:[ref]});
    const pending=controller.transfers.execute({assignmentId:assignment.id,manifestId:prepared.id,expectedVersion:prepared.rowVersion,confirmLimitedScope:true});
    controller.dispose();registration.dispose();registration=null;await assert.rejects(pending,error=>error.code==="STORAGE_CANCELLED");
    store=new StudAcademicStore({root:local}).initialize();const resumedStorage=new StudStorageProfileService({store,paths}),restarted=new StudStorageController({store,storage:resumedStorage});
    assert.strictEqual(restarted.manifest({assignmentId:assignment.id,manifestId:prepared.id}).state,"INTERRUPTED");assert.strictEqual(resumedStorage.repository.asset(ref).activeProfileId,profile.id);restarted.dispose();
 });
 console.log(`STUD STORAGE IPC: ${passed} PASSED`);
}finally{if(registration)registration.dispose();else if(store)store.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
