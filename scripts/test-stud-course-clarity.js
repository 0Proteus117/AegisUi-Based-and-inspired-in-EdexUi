#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {DatabaseSync} = require("node:sqlite");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudPresentationService} = require("../src/classes/workspaces/studPresentationService.class.js");
const {StudCourseBrowser} = require("../src/classes/workspaces/studCourseBrowser.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudSimpleNavigation} = require("../src/classes/workspaces/studSimpleNavigation.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "stud-ux2-"));
let store = new StudAcademicStore({root}).initialize(), service = new StudPresentationService(store), passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const throws = (fn, code) => assert.throws(fn, e => e.code === code);
const escape = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function strip29(dir) {
    const db = new DatabaseSync(path.join(dir, "academic.sqlite"));
    db.exec("DROP TABLE stud_display_labels; DROP TABLE stud_navigation_preferences; DELETE FROM stud_schema_migrations WHERE version=29"); db.close();
}
async function main() { try {
    const course = store.createEntity("COURSE", {title:"Engineering design", academicYear:"2026/27"});
    const future = store.createEntity("COURSE", {title:"Future course", academicYear:"2027/28"});
    const assignment = store.createEntity("ASSIGNMENT", {title:"Synthetic report", courseId:course.id, description:"A report and presentation. Use Harvard references."});
    check("fresh schema; no fabricated current year or labels", () => { assert.equal(store.schemaInfo().version,29); assert.deepEqual(service.preference(), {academicYear:null, available:false, rowVersion:0}); assert.equal(store.db.prepare("SELECT count(*) n FROM stud_display_labels").get().n,0); });
    let preference = service.chooseYear({academicYear:"2026/27",expectedVersion:0});
    check("explicit year is not the newest available year", () => assert.equal(preference.academicYear,course.academicYear));
    check("stale year writes rejected", () => throws(() => service.chooseYear({academicYear:future.academicYear,expectedVersion:0}),"STALE_PRESENTATION_VERSION"));
    check("unknown, oversized and arbitrary year inputs rejected", () => {
        throws(() => service.chooseYear({academicYear:"fiction",expectedVersion:1}),"NOT_FOUND");
        for (const input of [{academicYear:"x".repeat(81),expectedVersion:1},{academicYear:"2026/27",expectedVersion:"1"},{academicYear:"2026/27",expectedVersion:1,sql:"DROP TABLE"}]) throws(() => service.chooseYear(input),"INVALID_INPUT");
    });
    const resource = store.createEntity("RESOURCE",{courseId:course.id,title:"SYN_2026_Module_specification_final.pdf",type:"REFERENCE"});
    const ref = {entityType:"RESOURCE",entityId:resource.id};
    check("bounded title suggestion preserves original and uncertainty", () => { const p=service.label(ref); assert.equal(p.label,"Module specification"); assert.equal(p.origin,"TITLE_RULE"); assert.equal(p.original,resource.title); assert(p.explanation.includes("not an analysis")); });
    check("ambiguous labels and unknown material stay unchanged", () => {
        for (const title of ["Module specification and assignment brief", "Week 5 source", "<img onerror=attack()>Unknown"]){const p=service.describe("RESOURCE",{id:"not-saved",title});assert.equal(p.label,title);assert.equal(p.origin,"ORIGINAL");}
    });
    let named=service.setLabel({...ref,label:"Our module guide",expectedVersion:0});
    check("human correction never edits canonical source", () => { assert.equal(named.origin,"USER"); assert.equal(store.getEntity("RESOURCE",resource.id).title,resource.title); assert.equal(named.rowVersion,1); });
    check("invalid refs, forged origins and oversized labels rejected", () => {
        for(const input of [{...ref,label:"x",expectedVersion:1,origin:"SYSTEM"},{...ref,label:"x".repeat(161),expectedVersion:1},{...ref,label:"x\nsecret",expectedVersion:1},{...ref,label:"x",expectedVersion:"1"}])throws(()=>service.setLabel(input),"INVALID_INPUT");
        assert.throws(()=>service.setLabel({entityType:"COURSE",entityId:"../../bad",label:"x",expectedVersion:0}));
        assert.throws(()=>service.label({entityType:"RESOURCE",entityId:assignment.id}));
    });
    store.updateEntity("RESOURCE",resource.id,{title:"Updated module handbook"});
    check("provider title drift is visible without changing correction", () => { const p=service.label(ref);assert.equal(p.label,"Our module guide");assert.equal(p.sourceChanged,true); });
    named=service.setLabel({...ref,label:null,expectedVersion:1});
    check("reset retains version; stale edit cannot resurrect old label", () => {assert.equal(named.origin,"TITLE_RULE");assert.equal(named.label,"Module handbook");throws(()=>service.setLabel({...ref,label:"old",expectedVersion:0}),"STALE_PRESENTATION_VERSION");});
    check("discipline-neutral manual naming", () => {for(const title of ["Humanities primary text","Law case report","Social science dataset guide","Group project instructions","Generic coursework"]){const a=store.createEntity("ASSIGNMENT",{title});const p=service.setLabel({entityType:"ASSIGNMENT",entityId:a.id,label:title,expectedVersion:0});assert.equal(p.label,title);assert.equal(store.getEntity("ASSIGNMENT",a.id).title,title);}});
    const parent={state:{},escape,dateText:v=>v,render(){}};
    const ui=new StudSimpleNavigation(parent), requirements=new StudRequirementsContractService({store});
    ui.page=new StudCourseBrowser(store).read({browse:"YEARS"});parent.state.workingContext={activeAssignment:{id:"previous",title:"Old coursework"},activeCourse:{academicYear:"2025/26"}};
    check("chosen year does not foreground a historical assignment",()=>{const html=ui.render();assert(html.includes("Current academic year"));assert(!html.includes("Continue: Old coursework"));assert(html.includes("Other years"));});
    const originalFormData=global.FormData;
    try {
        global.FormData=class { get(){return "Late label";} };
        let finish;const racing=new StudSimpleNavigation({...parent,request:()=>new Promise(resolve=>{finish=resolve;})});
        const form={matches:selector=>selector==="[data-stud-label-form]",dataset:{type:"ASSIGNMENT",id:assignment.id,version:"0"}};
        racing.assignment={assignment};const save=racing.submit({target:form,preventDefault(){}});
        racing.sequence++;racing.assignment={assignment:{id:"new-selection"}};racing.busy=false;finish({label:"Late label"});await save;
        check("late label save cannot overwrite a newer navigation selection",()=>assert.equal(racing.assignmentLabel,undefined));
    }finally{global.FormData=originalFormData;}
    check("absence of contract never means absence of requirements", () => {const html=ui.brief({assignment,requirementsContract:{current:null,draft:null}});assert(html.includes("not been confirmed"));assert(html.includes("not mean none exists"));});
    let draft=requirements.createDraft(assignment.id);
    check("candidates appear separately, never confirmed deliverables", () => {const html=ui.brief({assignment,requirementsContract:requirements.state(assignment.id)});assert(html.includes("suggestions still to review"));assert(html.includes("not yet approved"));assert(html.includes("Check the assessment brief"));});
    const rejected=draft.candidates.find(c=>c.type==="DELIVERABLE");draft=requirements.reviewCandidate({contractId:draft.id,candidateId:rejected.id,disposition:"EXCLUDED",expectedVersion:draft.rowVersion});
    for(const candidate of draft.candidates.filter(c=>c.disposition==="PENDING")) draft=requirements.reviewCandidate({contractId:draft.id,candidateId:candidate.id,disposition:"UNRESOLVED",expectedVersion:draft.rowVersion});
    draft=requirements.addManualRequirement({contractId:draft.id,expectedVersion:draft.rowVersion,requirement:{type:"DELIVERABLE",label:"Deliverable",displayValue:"A reviewed technical report"}});
    draft=requirements.addManualRequirement({contractId:draft.id,expectedVersion:draft.rowVersion,requirement:{type:"DEPENDENCY",label:"Team data",displayValue:"Await team geometry",resolutionState:"UNRESOLVED"}});
    draft=requirements.approve({contractId:draft.id,expectedVersion:draft.rowVersion,approveAsIncomplete:true});
    check("reviewed incomplete summary retains uncertainty and sources", () => {const html=ui.brief({assignment,requirementsContract:requirements.state(assignment.id)});assert(html.includes("A reviewed technical report"));assert(html.includes("Await team geometry"));assert(html.includes("incomplete"));assert(!html.includes("100%"));});
    const beforeHash=draft.contractHash;
    check("summary cannot mutate approved revision", () => assert.equal(requirements.state(assignment.id).current.contractHash,beforeHash));
    check("stale source and newer draft visibly distinguished", () => {const html=ui.brief({assignment,requirementsContract:{current:{...draft,freshness:{reviewCondition:"SOURCE_CHANGED"}},draft:{}}});assert(html.includes("Source material changed"));assert(html.includes("newer draft"));});
    check("conflicts and long hostile text escaped", () => {const html=ui.brief({assignment:{...assignment,description:"<script>attack()</script>"},requirementsContract:{current:{...draft,completeness:"CONFLICTING",items:[{type:"DEADLINE",displayValue:"<img onerror=attack()>",resolutionState:"CONFLICTING"}]}}});assert(!html.includes("<script>"));assert(!html.includes("<img"));assert(html.includes("conflicting information"));});
    const browser=new StudCourseBrowser(store);
    check("browser reads preference and labels without creating work", () => {assert.equal(browser.read({browse:"YEARS"}).preference.academicYear,course.academicYear);assert.equal(browser.read({browse:"CONTENT",courseId:course.id,kind:"RESOURCE"}).items[0].presentation.label,"Module handbook");assert.equal(store.db.prepare("SELECT count(*) n FROM stud_working_context").get().n,0);assert.equal(store.db.prepare("SELECT count(*) n FROM stud_operation_runs").get().n,0);});
    const handlers=new Map(),ipc={handle:(c,h)=>handlers.set(c,h),removeHandler:c=>handlers.delete(c)},none=()=>({dispose(){}});
    const registration=Ipc.registerStudAcademicIpc({ipc,store,researchRuntime:none(),lmsRuntime:none(),documentRuntime:none(),academicAiRuntime:none(),notebookRuntime:none(),computeRuntime:{},toolCatalog:{},app:{getVersion:()=>"test",getPath:()=>root}});
    const trusted={sender:{isDestroyed:()=>false,getURL:()=>"file:///AegisUi/src/ui.html"}};
    const bad=await handlers.get("stud-display-label-set")(trusted,{...ref,label:"name",expectedVersion:2,origin:"SYSTEM"});
    check("typed IPC rejects privileged field forgery",()=>assert.equal(bad.code,"INVALID_INPUT"));
    const hostile=await handlers.get("stud-navigation-year-set")({sender:{isDestroyed:()=>false,getURL:()=>"https://evil.example/"}},{academicYear:null,expectedVersion:1});
    check("untrusted sender cannot change presentation",()=>assert.equal(hostile.ok,false));
    registration.dispose();
    store=new StudAcademicStore({root}).initialize();service=new StudPresentationService(store);
    check("restart preserves year and correction version",()=>{assert.equal(service.preference().academicYear,course.academicYear);assert.equal(service.label(ref).rowVersion,2);assert.equal(new StudRequirementsContractService({store}).state(assignment.id).current.contractHash,beforeHash);});
    store.archiveEntity("COURSE",course.id);
    check("missing selected year degrades without silently switching",()=>{assert.equal(service.preference().available,false);assert.equal(service.preference().academicYear,course.academicYear);});
    preference=service.chooseYear({academicYear:null,expectedVersion:1});
    check("explicit clear is persistent and versioned",()=>assert.deepEqual(preference,{academicYear:null,available:false,rowVersion:2}));
    const migrationRoot=path.join(root,"upgrade");let migrated=new StudAcademicStore({root:migrationRoot}).initialize();const old=migrated.createEntity("ASSIGNMENT",{title:"Existing v28 record"});migrated.close();strip29(migrationRoot);migrated=new StudAcademicStore({root:migrationRoot}).initialize();
    check("v28 upgrade preserves records with zero fabricated preferences",()=>{assert.equal(migrated.schemaInfo().version,29);assert.equal(migrated.getEntity("ASSIGNMENT",old.id).title,old.title);assert.equal(new StudPresentationService(migrated).preference().rowVersion,0);assert.deepEqual(migrated.db.prepare("PRAGMA foreign_key_check").all(),[]);});migrated.close();
    const failRoot=path.join(root,"rollback");let failure=new StudAcademicStore({root:failRoot}).initialize();failure.close();strip29(failRoot);let db=new DatabaseSync(path.join(failRoot,"academic.sqlite"));db.exec("CREATE TABLE stud_display_labels (collision TEXT)");db.close();
    check("failed v29 migration rolls back all new tables",()=>{assert.throws(()=>new StudAcademicStore({root:failRoot}).initialize());db=new DatabaseSync(path.join(failRoot,"academic.sqlite"));assert.equal(db.prepare("SELECT max(version) v FROM stud_schema_migrations").get().v,28);assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='stud_navigation_preferences'").get(),undefined);db.close();});
    console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
} finally {store.close();fs.rmSync(root,{recursive:true,force:true});} }
main().catch(e=>{console.error(e);process.exitCode=1;});
