#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const Ipc=require("../src/classes/workspaces/studAcademicIpc.class.js");

const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-stud-m8-ipc-")),handlers=new Map(),ipc={handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)},disposable=extra=>Object.assign({dispose(){}},extra||{}),trusted={sender:{isDestroyed:()=>false,getURL:()=>"file:///AegisUi/src/ui.html"}},untrusted={sender:{isDestroyed:()=>false,getURL:()=>"https://evil.example/"}};let passed=0;function check(name,work){work();passed+=1;console.log(`${name}: PASS`);}
(async()=>{const store=new StudAcademicStore({root,applicationVersion:"m8-ipc"}).initialize(),registration=Ipc.registerStudAcademicIpc({ipc,store,app:{getVersion:()=>"m8-ipc",getPath:()=>root},researchRuntime:disposable(),lmsRuntime:disposable(),documentRuntime:disposable(),academicAiRuntime:disposable(),notebookRuntime:disposable(),computeRuntime:{},toolCatalog:{}});try{
 const expected=["stud-claim-list","stud-claim-read","stud-claim-create","stud-claim-update","stud-claim-review","stud-claim-create-revision","stud-evidence-list","stud-evidence-read","stud-evidence-create","stud-evidence-update","stud-evidence-review","stud-claim-evidence-link","stud-claim-evidence-update","stud-claim-evidence-review","stud-claim-evidence-revise","stud-evidence-map","stud-evidence-source-preview"];
 check("M8_FIXED_TYPED_CHANNELS_REGISTERED",()=>expected.forEach(channel=>assert.ok(registration.channels.includes(channel)&&handlers.has(channel),channel)));
 check("NO_GENERIC_CLAIM_EVIDENCE_PERSISTENCE_CHANNEL",()=>assert.ok(!registration.channels.some(channel=>/(claim|evidence)-(?:invoke|sql|log|provider|network|append-any)/i.test(channel))));
 let response=await handlers.get("stud-evidence-map")(untrusted,{assignmentId:"stud_assignment_invalid"});check("UNTRUSTED_SENDER_REJECTED",()=>assert.strictEqual(response.code,"POLICY_BLOCKED"));
 response=await handlers.get("stud-claim-create")(trusted,{assignmentId:"stud_assignment_valid",claim:{text:"Synthetic"},origin:"AI_ASSISTED"});check("RENDERER_CANNOT_FORGE_CLAIM_ORIGIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-evidence-create")(trusted,{assignmentId:"stud_assignment_valid",sourceObjectType:"NOTE",sourceObjectId:"stud_note_valid",origin:"IMPORTED"});check("RENDERER_CANNOT_FORGE_EVIDENCE_ORIGIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-claim-evidence-link")(trusted,{assignmentId:"stud_assignment_valid",claimId:"stud_claim_valid",evidenceId:"stud_evidence_valid",relationshipType:"SUPPORTS",lifecycle:"REVIEWED"});check("RENDERER_CANNOT_FORGE_REVIEW_STATE",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-evidence-map")(trusted,{assignmentId:"bad;DROP TABLE stud_claims"});check("MALFORMED_ID_REJECTED_IN_MAIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-evidence-create")(trusted,{assignmentId:"stud_assignment_valid",sourceObjectType:"ACADEMIC_DOCUMENT",sourceObjectId:"stud_academic_document_valid",locator:{path:"/Users/private/file.pdf"},arbitrarySql:"SELECT *"});check("ARBITRARY_PAYLOAD_REJECTED",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 console.log(`STUD M8 IPC TESTS: ${passed} PASSED`);
}finally{registration.dispose();store.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
