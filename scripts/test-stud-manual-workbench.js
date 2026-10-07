#!/usr/bin/env node
"use strict";
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const {StudManualWorkbench} = require("../src/classes/workspaces/studManualWorkbench.class.js");
const {StudWorkingContextService} = require("../src/classes/workspaces/studWorkingContextService.class.js");
const {open, fixture} = require("./test-stud-final-package.js");
const escape = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stud-ux3-")), exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stud-ux3-export-"));
    let e = open(root, {showOpenDialog:async () => ({canceled:false,filePaths:[exportRoot]})});
    try {
        const f = fixture(e, "Synthetic manual report", true), calls = [];
        const context = new StudWorkingContextService({store:e.store, requirementsService:e.requirements});
        let selected = f.assignment;
        const routes = {
            "stud-requirements-state": p => e.requirements.state(p.assignmentId),
            "stud-composition-state": p => e.composition.state(p),
            "stud-draft-read": p => e.composition.draft(p),
            "stud-draft-save-version": p => e.composition.saveDraftVersion(p),
            "stud-working-context-update": p => context.update(p),
            "stud-composition-create": p => e.composition.createPlan(p),
            "stud-composition-review": p => e.composition.reviewPlan(p),
            "stud-draft-create": p => e.composition.createDraft(p)
        };
        const parent = {request:async (channel,payload) => {calls.push(channel); assert(routes[channel],channel); return routes[channel](payload);}, escape, assignment:() => selected, course:() => null, state:{}, parent:{render(){}, state:{}, view:{querySelector:() => null}, simpleNavigation:{brief:() => "Canonical requirements"}}, renderMaterials:() => "Materials", renderPreview:() => "Exact canonical preview", renderNotes:() => "Canonical notes", finalPackage:{open:async()=>{}}};
        const ui = new StudManualWorkbench(parent);
        const click = (action,value="") => ui.click({target:{closest:() => ({dataset:{studWorkbench:action,value}})}});
        const input = text => ui.input({target:{matches:() => true,value:text}});
        check("entry offers honest manual path, never simulates AI", () => {assert(ui.render().includes("Work myself"));assert(ui.render().includes("not available yet"));assert(!ui.render().includes("<textarea"));assert.equal(calls.length,0);});
        await click("manual");
        check("manual opens canonical current draft", () => {assert.equal(ui.state.draft.id,f.draft.id);assert.equal(ui.section().id,f.plan.sections[0].id);assert(ui.render().includes("synthetic user-authored reflection"));});
        input("My own writing <script>bad()</script>");
        await click("panel","sources");
        check("source preview does not erase unsaved text or execute markup", () => {assert.equal(ui.content(),"My own writing <script>bad()</script>");assert(ui.render().includes("Exact canonical preview"));assert(!ui.render().includes("<script>"));assert(ui.render().includes("&lt;script&gt;"));});
        await click("panel","notes");
        check("notes use existing editor, no duplicate note created", () => {assert(ui.render().includes("Canonical notes"));assert.equal(e.store.db.prepare("SELECT count(*) n FROM stud_notes").get().n,0);});
        await click("save");
        check("save creates immutable version and updates canonical context", () => {assert.equal(ui.state.draft.currentVersion.versionNumber,2);assert.equal(ui.buffer(),undefined);assert.equal(parent.state.workingContext.activeDraftDocument.id,f.draft.id);assert.equal(ui.state.draft.history.length,2);});
        input("Keep this unsaved edit");
        e.composition.saveDraftVersion({assignmentId:f.assignment.id,draftId:f.draft.id,expectedVersion:ui.state.draft.rowVersion,sections:[{sectionId:f.plan.sections[0].id,content:"Concurrent writer"}]});
        await click("reload"); await click("save");
        check("refresh never rebases stale unsaved write silently", () => {assert(ui.state.error.includes("unsaved text"));assert.equal(ui.content(),"Keep this unsaved edit");assert.equal(e.composition.draft({assignmentId:f.assignment.id,draftId:f.draft.id}).currentVersion.sections[0].content,"Concurrent writer");});
        await click("export");
        check("export cannot ignore unsaved writing", () => assert(ui.state.error.includes("Save your writing")));
        await click("discard");
        check("explicit discard reloads current canonical text", () => assert.equal(ui.content(),"Concurrent writer"));
        input("Saved synthetic final text."); await click("save"); await click("export");
        check("review handoff is canonical final package, not submission", () => assert.equal(parent.state.mode,"FINAL_PACKAGE"));
        const pkg=e.packages.create({assignmentId:f.assignment.id,draftVersionId:ui.state.draft.currentVersion.id,artifactIds:[],citationStyle:"harvard1"});
        const exported=await e.packages.export({assignmentId:f.assignment.id,packageId:pkg.id,expectedManifestHash:pkg.manifestHash});
        check("saved writing exports as unapproved review copy with real citation identity",()=>{assert.equal(exported.verified,true);assert.equal(exported.approved,false);assert(pkg.preview.includes("Saved synthetic final text."));assert.equal(pkg.snapshot.citations[0].citationPaperId,f.paper.id);});
        const currentId=ui.state.draft.currentVersion.id;
        e.store.close();e=open(root);await click("reload");
        check("restart resolves exact saved version and content",()=>{assert.equal(ui.state.draft.currentVersion.id,currentId);assert.equal(ui.content(),"Saved synthetic final text.");});
        const revision=e.composition.createRevision({planId:f.plan.id,expectedVersion:e.composition.state({assignmentId:f.assignment.id}).current.rowVersion});await click("reload");
        check("new draft outline cannot mix sections with existing reviewed draft",()=>{assert.equal(ui.plan().id,f.plan.id);assert.notEqual(ui.plan().id,revision.id);assert.equal(ui.state.draft.compositionPlanId,ui.plan().id);});
        check("no ordinary writing generates operational runs",()=>{assert.equal(e.store.db.prepare("SELECT count(*) n FROM stud_operation_runs").get().n,0);assert(!calls.some(c=>/execution|ollama|search|model/.test(c)));});
        input("Unsaved across assignment navigation");
        selected=e.store.createEntity("ASSIGNMENT",{title:"Generic manual coursework"});ui.reset();await click("manual");
        check("no approved requirements means explicit review, not fabricated approval",()=>{assert(ui.render().includes("Review requirements"));assert(!ui.render().includes("data-stud-workbench-text"));});
        selected=f.assignment;ui.reset();await click("manual");
        check("assignment navigation preserves this session's unsaved text",()=>assert.equal(ui.content(),"Unsaved across assignment navigation"));
        await click("discard");
        let resolve;
        const race = new StudManualWorkbench({...parent,request:()=>new Promise(r=>{resolve=r;})});
        const pending=race.load();race.reset();selected={id:"different"};resolve({current:null});
        // First stale response must not trigger subsequent reads for the old Assignment.
        await pending;
        check("assignment reset invalidates pending read identity",()=>assert.equal(race.state.loaded,false));
        for(const title of ["Engineering comparison", "Humanities interpretation", "Law case analysis", "Social science report", "Generic group coursework"]){
            const sample=fixture(e,title);selected=sample.assignment;ui.reset();await click("manual");
            check(`manual workbench supports ${title}`,()=>{assert.equal(ui.state.draft.id,sample.draft.id);assert(ui.render().includes(title));});
        }
        check("source drift and incomplete review stay visible without fabricating progress",()=>{ui.state.requirements={current:{completeness:"INCOMPLETE",freshness:{reviewCondition:"SOURCE_CHANGED"}}};const html=ui.render();assert(html.includes("source basis needs review"));assert(html.includes("requirements remain unresolved"));assert(!html.includes("100%"));});
        check("new renderer component has no Node, provider or shadow database API",()=>{const source=fs.readFileSync(path.join(__dirname,"../src/classes/workspaces/studManualWorkbench.class.js"),"utf8");assert(!/require\(|process\.|Buffer\.|localStorage\.(?:getItem|setItem)|ipcRenderer|fetch\(/.test(source));});
        check("unsaved contextual note blocks tool navigation until save or explicit discard",()=>{let prevented=false,stopped=false,scrolled=false;const noteUi=new StudManualWorkbench({...parent,parent:{...parent.parent,view:{querySelector:()=>({contains:()=>false,querySelector:()=>({scrollIntoView:()=>{scrolled=true;}})})}}});noteUi.noteDirty=true;noteUi.guardNoteNavigation({target:{closest:s=>s==='[data-workbench-discard-note]'?null:{}},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});assert(prevented&&stopped&&scrolled);assert.equal(noteUi.noteDirty,true);});
        console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
    } finally {e.store.close();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(exportRoot,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
