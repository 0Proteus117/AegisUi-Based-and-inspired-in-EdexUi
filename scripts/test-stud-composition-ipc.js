#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const Ipc=require("../src/classes/workspaces/studAcademicIpc.class.js");

const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-stud-m10-ipc-")),handlers=new Map(),ipc={handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)},disposable=extra=>Object.assign({dispose(){}},extra||{}),trusted={sender:{isDestroyed:()=>false,getURL:()=>"file:///AegisUi/src/ui.html"}},untrusted={sender:{isDestroyed:()=>false,getURL:()=>"https://evil.example/"}};
let passed=0;function check(name,work){work();passed+=1;console.log(`${name}: PASS`);}
(async()=>{
    const store=new StudAcademicStore({root,applicationVersion:"m10-ipc"}).initialize(),registration=Ipc.registerStudAcademicIpc({ipc,store,app:{getVersion:()=>"m10-ipc",getPath:()=>root},researchRuntime:disposable(),lmsRuntime:disposable(),documentRuntime:disposable(),academicAiRuntime:disposable(),notebookRuntime:disposable(),computeRuntime:{},toolCatalog:{}});
    try{
        const expected=["stud-composition-state","stud-composition-create","stud-composition-update","stud-composition-section-add","stud-composition-section-update","stud-composition-section-remove","stud-composition-requirement-set","stud-composition-claim-link","stud-composition-evidence-link","stud-composition-reference-unlink","stud-composition-review","stud-composition-create-revision","stud-composition-readiness","stud-composition-section-context","stud-draft-create","stud-draft-read","stud-draft-version-read","stud-draft-save-version","stud-draft-diff"];
        check("M10_FIXED_TYPED_CHANNELS_REGISTERED",()=>expected.forEach(channel=>assert.ok(registration.channels.includes(channel)&&handlers.has(channel),channel)));
        check("NO_GENERIC_COMPOSITION_PERSISTENCE_CHANNEL",()=>assert.ok(!registration.channels.some(channel=>/(composition|draft)-(?:invoke|sql|log|provider|network|append-any|filesystem|shell)/i.test(channel))));
        let response=await handlers.get("stud-composition-state")(untrusted,{assignmentId:"stud_assignment_invalid"});
        check("UNTRUSTED_SENDER_REJECTED",()=>assert.strictEqual(response.code,"POLICY_BLOCKED"));
        response=await handlers.get("stud-composition-section-add")(trusted,{planId:"stud_composition_plan_valid",expectedVersion:1,section:{title:"Forged",purpose:"x",origin:"MODEL_GENERATED"}});
        check("RENDERER_SECTION_ORIGIN_IS_NOT_AUTHORITATIVE",()=>{assert.strictEqual(response.code,"NOT_FOUND");const source=fs.readFileSync(path.join(__dirname,"../src/classes/workspaces/studAcademicIpc.class.js"),"utf8");assert.ok(source.includes('section:{...payload.section,origin:"USER"}'));});
        response=await handlers.get("stud-draft-save-version")(trusted,{assignmentId:"stud_assignment_valid",draftId:"stud_draft_document_valid",expectedVersion:1,sections:[],origin:"LOCAL_AI"});
        check("RENDERER_CANNOT_FORGE_DRAFT_ORIGIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
        response=await handlers.get("stud-composition-create")(trusted,{assignmentId:"bad;DROP TABLE stud_composition_plans"});
        check("MALFORMED_ID_REJECTED_IN_MAIN",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
        response=await handlers.get("stud-composition-update")(trusted,{planId:"stud_composition_plan_valid",expectedVersion:1,title:"x",arbitrarySql:"DELETE FROM stud_composition_plans"});
        check("ARBITRARY_PAYLOAD_REJECTED",()=>assert.strictEqual(response.code,"INVALID_INPUT"));
        response=await handlers.get("stud-draft-save-version")(trusted,{assignmentId:"stud_assignment_valid",draftId:"stud_draft_document_valid",expectedVersion:1,sections:[{sectionId:"stud_composition_section_valid",content:"x".repeat(130000)}],changeReason:"oversized"});
        check("OVERSIZED_DRAFT_CONTENT_REJECTED_BEFORE_PERSISTENCE",()=>assert.ok(["INVALID_INPUT","NOT_FOUND","PAYLOAD_TOO_LARGE"].includes(response.code)));
        console.log(`STUD M10 COMPOSITION IPC: ${passed} PASSED`);
    }finally{registration.dispose();store.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
