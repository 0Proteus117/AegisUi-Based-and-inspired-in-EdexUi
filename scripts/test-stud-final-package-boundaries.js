#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),{DatabaseSync}=require("node:sqlite");
const {open,fixture}=require("./test-stud-final-package.js");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudWorkflowService}=require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudManagedStorageRuntime}=require("../src/classes/workspaces/studManagedStorageRuntime.class.js");
const {createTrustedIpcMain}=require("../src/classes/ipcSecurity.class.js");
const {registerStudAcademicIpc}=require("../src/classes/workspaces/studAcademicIpc.class.js");
const D=require("../src/classes/workspaces/studFinalPackageModel.class.js");
const TABLES=["stud_final_package_approvals","stud_final_package_sources","stud_final_package_files","stud_final_packages"];
let passed=0;
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
function v27(root){let s=new StudAcademicStore({root}).initialize();const a=s.createEntity("ASSIGNMENT",{title:"Existing synthetic Assignment"});s.close();const db=new DatabaseSync(path.join(root,"academic.sqlite"));TABLES.forEach(t=>db.exec(`DROP TABLE ${t}`));db.exec("DELETE FROM stud_schema_migrations WHERE version=28");db.close();return a;}
(async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"m15-boundaries-")));let e,registration;
 try{
  await check("v27 upgrade preserves existing Assignment without fabricated package",()=>{const dir=path.join(root,"upgrade"),a=v27(dir),s=new StudAcademicStore({root:dir}).initialize();assert.equal(s.schemaInfo().version,28);assert(s.getEntity("ASSIGNMENT",a.id));assert.equal(s.db.prepare("SELECT count(*) n FROM stud_final_packages").get().n,0);assert.equal(s.db.prepare("PRAGMA foreign_key_check").all().length,0);s.close();});
  await check("v28 migration rollback is transactional",()=>{const dir=path.join(root,"rollback");v27(dir);let db=new DatabaseSync(path.join(dir,"academic.sqlite"));db.exec("CREATE TABLE stud_final_package_files(sentinel TEXT)");db.close();assert.throws(()=>new StudAcademicStore({root:dir}).initialize(),err=>err.code==="DATABASE_OPEN_FAILED");db=new DatabaseSync(path.join(dir,"academic.sqlite"));assert.equal(db.prepare("SELECT MAX(version) n FROM stud_schema_migrations").get().n,27);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='stud_final_packages'").get().n,0);db.close();});
  e=open(path.join(root,"domain"));const f=fixture(e),args={assignmentId:f.assignment.id,draftVersionId:f.version.id,citationStyle:"harvard1"};
  const workflow=new StudWorkflowService({store:e.store,requirementsService:e.requirements});let w=workflow.create({assignmentId:f.assignment.id,templateKey:"GENERIC_MANUAL",contractId:f.contract.id});
  w=workflow.createBlocker({workflowId:w.id,nodeId:w.graph.nodes[0].id,blockerType:"WAITING_TEAM_MEMBER",title:"Awaiting real team data",expectedWorkflowVersion:w.rowVersion});
  const blocked=e.packages.create(args);
  w=workflow.createCheckpoint({workflowId:w.id,nodeId:w.graph.nodes[0].id,title:"Explicit human gate",expectedWorkflowVersion:w.rowVersion});
  const checkpoint=w.conditions.checkpoints[0];
  w=workflow.decideCheckpoint({workflowId:w.id,checkpointId:checkpoint.id,decision:"REJECT",expectedWorkflowVersion:w.rowVersion,expectedCheckpointVersion:checkpoint.rowVersion});
  await check("rejected M4 checkpoint remains an approval gate",()=>{const p=e.packages.create(args);assert.equal(p.snapshot.checkpoints[0].status,"REJECTED");});
  w=workflow.createCheckpoint({workflowId:w.id,nodeId:w.graph.nodes[0].id,title:"Reviewed replacement",replacesCheckpointId:checkpoint.id,expectedWorkflowVersion:w.rowVersion});
  const follow=w.conditions.checkpoints.find(c=>c.replacesCheckpointId===checkpoint.id);
  w=workflow.decideCheckpoint({workflowId:w.id,checkpointId:follow.id,decision:"APPROVE",expectedWorkflowVersion:w.rowVersion,expectedCheckpointVersion:follow.rowVersion});
  await check("approved follow-up retains history without obsolete gate",()=>assert.equal(e.packages.create(args).snapshot.checkpoints.length,0));
  await check("actual M4 blocker gates approval without resolving workflow",()=>{const p=e.packages.create(args);assert(p.snapshot.blockers.length===1);assert.throws(()=>e.packages.approve({assignmentId:f.assignment.id,packageId:p.id,expectedManifestHash:p.manifestHash,confirmReviewed:true,acknowledgeIssues:true}),err=>err.code==="PACKAGE_BLOCKED");assert.equal(e.store.db.prepare("SELECT status FROM stud_workflow_blockers WHERE workflow_id=?").get(w.id).status,"OPEN");});
  const bytes=Buffer.from("measurement,value\nsynthetic,1\n"),hash=D.sha(bytes),ref=`datasets/synthetic_${hash.slice(0,16)}.csv`;
  fs.mkdirSync(path.join(e.store.root,"datasets"));fs.writeFileSync(path.join(e.store.root,ref),bytes);
  const resource=e.store.createEntity("RESOURCE",{assignmentId:f.assignment.id,title:"Synthetic table",type:"FILE",localReference:ref,checksum:hash});
  const a=e.artifacts.registerArtifact({assignmentId:f.assignment.id,canonicalObjectType:"RESOURCE",canonicalObjectId:resource.id}).artifact;
  e.packages.managedStorage=new StudManagedStorageRuntime(new StudStorageProfileService({store:e.store}));
  const withFile=e.packages.create({...args,artifactIds:[a.id]});
  await check("appendix bytes use M14 managed identity and exact hashes",()=>{const file=withFile.files.find(f=>f.name==="appendix-1.csv");assert.equal(file.sha256,hash);assert.deepEqual(e.packages.files.readFile(withFile.id,file),bytes);assert.equal(withFile.snapshot.appendices[0].objectId,resource.id);});
  fs.writeFileSync(path.join(e.store.root,ref),"changed");
  await check("mutated source file cannot silently enter another package",()=>assert.throws(()=>e.packages.create({...args,artifactIds:[a.id]}),err=>err.code==="STORAGE_HASH_MISMATCH"));
  await check("saved package survives missing original but reports source unavailable",()=>{fs.unlinkSync(path.join(e.store.root,ref));const p=e.packages.read({assignmentId:f.assignment.id,packageId:withFile.id});assert.equal(p.integrity,"VERIFIED");assert.equal(p.freshness,"SOURCE_UNAVAILABLE");});
  await check("package symlinks are rejected",()=>{const full=path.join(e.store.root,"final-packages",withFile.id,"candidate.md");fs.unlinkSync(full);fs.symlinkSync(path.join(e.store.root,"academic.sqlite"),full);assert.notEqual(e.packages.read({assignmentId:f.assignment.id,packageId:withFile.id}).integrity,"VERIFIED");});
  const handlers=new Map(),ui=path.join(root,"ui.html"),raw={on(){},handle:(c,h)=>handlers.set(c,h),removeHandler:c=>handlers.delete(c)},ipc=createTrustedIpcMain(raw,ui),dead={dispose(){}};
  registration=registerStudAcademicIpc({ipc,store:e.store,app:{getPath:()=>e.store.root,getVersion:()=>"synthetic"},researchRuntime:dead,lmsRuntime:dead,academicAiRuntime:dead,notebookRuntime:dead,documentRuntime:dead,computeRuntime:{},toolCatalog:{}});
  const trusted={sender:{getURL:()=>`file://${ui}`,isDestroyed:()=>false},senderFrame:{url:`file://${ui}`}};
  await check("all fixed package channels reject foreign renderers",()=>{for(const c of D.CHANNELS){assert(handlers.has(c));assert.throws(()=>handlers.get(c)({senderFrame:{url:"https://example.invalid"}},{}),err=>err.code==="UNTRUSTED_RENDERER");}});
  await check("renderer cannot choose files, SQL, approval state or operation",async()=>{for(const [channel,payload] of [["stud-final-package-create",{...args,path:"/private"}],["stud-final-package-approve",{assignmentId:f.assignment.id,packageId:blocked.id,actor:"SYSTEM"}],["stud-final-package-export",{assignmentId:f.assignment.id,packageId:blocked.id,destination:"/private"}]])assert.equal((await handlers.get(channel)(trusted,payload)).code,"INVALID_INPUT");});
  await check("trusted IPC can inspect real immutable package",async()=>{const result=await handlers.get("stud-final-package-read")(trusted,{assignmentId:f.assignment.id,packageId:blocked.id});assert.equal(result.ok,true);assert.equal(result.data.manifestHash,blocked.manifestHash);});
  await check("no submission, model or network dependency in package service",()=>{const source=fs.readFileSync(path.join(__dirname,"../src/classes/workspaces/studFinalPackageService.class.js"),"utf8");assert(!/fetch\(|execFile\(|spawn\(|ollama|https\.request/.test(source));assert(D.CHANNELS.every(c=>!c.includes("submit")));});
  console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
 }finally{registration?.dispose();if(!registration)e?.store.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
