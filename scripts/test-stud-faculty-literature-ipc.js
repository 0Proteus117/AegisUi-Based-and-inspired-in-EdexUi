#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const Ipc=require("../src/classes/workspaces/studAcademicIpc.class.js");

const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-stud-m9-ipc-")),handlers=new Map(),ipc={handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)},trusted={sender:{isDestroyed:()=>false,getURL:()=>"file:///AegisUi/src/ui.html"}},untrusted={sender:{isDestroyed:()=>false,getURL:()=>"https://evil.example/"}},disposable=extra=>Object.assign({dispose(){}},extra||{});let passed=0;function check(name,work){work();passed+=1;console.log(`${name}: PASS`);}
(async()=>{const store=new StudAcademicStore({root,applicationVersion:"m9-ipc"}).initialize(),runtime=disposable({searchOpenAlexAuthors:async()=>[],worksByOpenAlexAuthor:async()=>[]}),registration=Ipc.registerStudAcademicIpc({ipc,store,app:{getVersion:()=>"m9-ipc",getPath:()=>root},researchRuntime:runtime,lmsRuntime:disposable(),documentRuntime:disposable(),academicAiRuntime:disposable(),notebookRuntime:disposable(),computeRuntime:{},toolCatalog:{}});try{
 const expected=["stud-faculty-scout-state","stud-faculty-observation-create","stud-faculty-identity-discover","stud-faculty-identity-confirm","stud-faculty-identity-reject","stud-faculty-publications-discover","stud-faculty-publication-import","stud-faculty-publication-dismiss"];
 check("M9_FIXED_TYPED_CHANNELS_REGISTERED",()=>expected.forEach(channel=>assert.ok(registration.channels.includes(channel)&&handlers.has(channel),channel)));
 check("NO_GENERIC_FACULTY_PROVIDER_OR_PERSISTENCE_CHANNEL",()=>assert.ok(!registration.channels.some(channel=>/faculty-(?:invoke|sql|log|network|endpoint|append-any)/i.test(channel))));
 let response=await handlers.get("stud-faculty-scout-state")(untrusted,{assignmentId:"stud_assignment_valid"});check("UNTRUSTED_SENDER_REJECTED",()=>assert.strictEqual(response.code,"POLICY_BLOCKED"));
 response=await handlers.get("stud-faculty-observation-create")(trusted,{assignmentId:"stud_assignment_valid",displayName:"Synthetic Person",origin:"SYSTEM_GENERATED"});check("RENDERER_CANNOT_FORGE_FACULTY_ORIGIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-faculty-identity-confirm")(trusted,{assignmentId:"bad;DROP TABLE stud_faculty_identities",facultyId:"stud_faculty_valid",candidateId:"stud_candidate_valid",expectedVersion:1});check("MALFORMED_ID_REJECTED_IN_MAIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-faculty-publications-discover")(trusted,{assignmentId:"stud_assignment_valid",planId:"stud_plan_valid",topicId:"stud_topic_valid",facultyId:"stud_faculty_valid",requestId:"bounded",endpoint:"https://evil.example/"});check("RENDERER_CANNOT_SELECT_PROVIDER_ENDPOINT",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 response=await handlers.get("stud-faculty-publication-import")(trusted,{assignmentId:"stud_assignment_valid",publicationId:"stud_publication_valid",expectedVersion:1,createEvidence:true});check("RENDERER_CANNOT_REQUEST_AUTOMATIC_EVIDENCE",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
 console.log(`STUD M9 FACULTY IPC: ${passed} PASSED`);
}finally{registration.dispose();fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
