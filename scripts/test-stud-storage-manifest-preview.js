#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudStorageManifestPreview}=require("../src/classes/workspaces/studStorageManifestPreview.class.js");
const {academicFixture}=require("./stud-m13-fixtures.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-manifest-preview-"));let store,passed=0;
async function check(name,work){await work();passed++;console.log(`${name}: PASS`);}
(async()=>{try{
 store=new StudAcademicStore({root}).initialize();const storage=new StudStorageProfileService({store}),preview=new StudStorageManifestPreview({store,storage}),f=academicFixture(store,root);
 const bytes=Buffer.alloc(1024*1024,42),sha256=crypto.createHash("sha256").update(bytes).digest("hex"),reference=`documents/paper_${sha256.slice(0,16)}.pdf`;
 fs.mkdirSync(path.join(root,"documents"));fs.writeFileSync(path.join(root,reference),bytes);store.setPaperDocument(f.paper.id,{reference,sha256,size:bytes.length});
 f.artifacts.registerArtifact({assignmentId:f.assignment.id,canonicalObjectType:"RESEARCH_PAPER",canonicalObjectId:f.paper.id,origin:"USER_IMPORTED",producer:"USER"});
 let plan=f.research.createDraft({assignmentId:f.assignment.id,seedProposals:false});plan=f.research.addTopic({planId:plan.id,expectedVersion:plan.rowVersion,topic:{title:"Synthetic literature",basis:"USER_DEFINED",disposition:"INCLUDED"}});
 f.research.addDossierItem({planId:plan.id,topicId:plan.topics[0].id,canonicalObjectType:"RESEARCH_PAPER",canonicalObjectId:f.paper.id,disposition:"ACCEPTED"});
 const operationCount=store.db.prepare("SELECT COUNT(*) count FROM stud_operation_events").get().count;
 await check("EXISTING_EVIDENCE_POINTER_REMAINS_INSPECTABLE",()=>{const result=preview.catalog.inspect({assignmentId:f.assignment.id});assert.ok(result.provenanceLinks.some(link=>link.authority==="EVIDENCE"&&link.id===f.evidence.id));assert.strictEqual(f.claims.evidence({assignmentId:f.assignment.id,evidenceId:f.evidence.id}).id,f.evidence.id);});
 await check("M1_M6_M7_M8_CONTEXT_COMPOSED_WITH_REAL_SOURCE_REASONS",async()=>{const result=await preview.inspect({assignmentId:f.assignment.id});const paper=result.objects.find(o=>o.id===f.paper.id);for(const reason of ["CANONICAL_RELATIONSHIP","ARTIFACT_REGISTRY","ACCEPTED_DOSSIER","EVIDENCE_SOURCE"])assert.ok(paper.reasons.includes(reason),reason);assert.strictEqual(result.files.length,1);assert.strictEqual(result.files[0].sha256,sha256);assert.strictEqual(result.verifiedBytes,bytes.length);assert.strictEqual(result.allSelectedFilesVerified,true);assert.strictEqual(result.portableReady,false);});
 await check("ASYNC_FILE_VERIFICATION_YIELDS_TO_EVENT_LOOP",async()=>{let yielded=false;setImmediate(()=>{yielded=true;});await preview.inspect({assignmentId:f.assignment.id});assert.strictEqual(yielded,true);});
 await check("EXPLICIT_CANCELLATION_HAS_NO_PERSISTENT_SIDE_EFFECT",async()=>{const control=new AbortController();setImmediate(()=>control.abort());await assert.rejects(preview.inspect({assignmentId:f.assignment.id},{signal:control.signal}),e=>e.code==="STORAGE_CANCELLED");assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_storage_assets").get().count,0);assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_storage_manifests").get().count,0);assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_operation_events").get().count,operationCount);});
 await check("MISSING_FILE_IS_REPORTED_WITHOUT_PRIVATE_PATH",async()=>{fs.renameSync(path.join(root,reference),path.join(root,"saved"));const result=await preview.inspect({assignmentId:f.assignment.id});assert.strictEqual(result.files[0].status,"STORAGE_FILE_UNAVAILABLE");assert.strictEqual(result.allSelectedFilesVerified,false);assert.ok(!JSON.stringify(result).includes(root));fs.renameSync(path.join(root,"saved"),path.join(root,reference));});
 await check("SOURCE_TAMPER_REJECTS_CANONICAL_HASH",async()=>{fs.writeFileSync(path.join(root,reference),"tampered");const result=await preview.inspect({assignmentId:f.assignment.id});assert.strictEqual(result.files[0].status,"STORAGE_HASH_MISMATCH");assert.strictEqual(result.verifiedBytes,0);fs.writeFileSync(path.join(root,reference),bytes);});
 await check("CONTEXT_CHANGE_DURING_ASYNC_PREVIEW_REJECTS_STALE_SCOPE",async()=>{setImmediate(()=>store.updateEntity("RESEARCH_PAPER",f.paper.id,{title:"Updated source while verifying"}));await assert.rejects(preview.inspect({assignmentId:f.assignment.id}),e=>e.code==="STORAGE_SCOPE_CHANGED");});
 await check("BYTE_BOUND_STOPS_INSPECTION_WITH_EXPLICIT_OMISSIONS",async()=>{
    const domain=require("../src/classes/workspaces/studStorageModel.class.js"),files=Array.from({length:131},(_,i)=>({reference:`documents/bound_${i.toString(16).padStart(16,"0")}.pdf`}));let inspected=0;
    // Protocol/limit fixture only: no claim that 8 GiB of actual data was copied.
    const bounded=new StudStorageManifestPreview({catalog:{inspect:()=>({scopeHash:"synthetic-scope",files,truncated:false})},storage:{inspectCanonicalFileAsync:async()=>{inspected++;return {sha256:"0".repeat(64),byteSize:domain.LIMITS.fileBytes};}}});
    const result=await bounded.inspect({});assert.strictEqual(result.verifiedBytes,domain.LIMITS.totalBytes);assert.strictEqual(result.byteBoundReached,true);assert.strictEqual(result.allSelectedFilesVerified,false);assert.strictEqual(result.files.at(-1).status,"NOT_INSPECTED_BYTE_BOUND");assert.strictEqual(inspected,129);
 });
 await check("RESTART_RETAINS_METADATA_NOT_A_FAKE_PORTABLE_STATE",async()=>{store.close();store=new StudAcademicStore({root}).initialize();const current=new StudStorageManifestPreview({store,storage:new StudStorageProfileService({store})});assert.strictEqual((await current.inspect({assignmentId:f.assignment.id})).files[0].sha256,sha256);assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_storage_manifests").get().count,0);});
 console.log(`STUD STORAGE MANIFEST PREVIEW: ${passed} PASSED`);
}finally{if(store)store.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
