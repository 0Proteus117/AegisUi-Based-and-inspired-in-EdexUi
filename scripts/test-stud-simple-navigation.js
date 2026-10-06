#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudWorkingContextService}=require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudSimpleNavigation}=require("../src/classes/workspaces/studSimpleNavigation.class.js");
const {StudCommandCenter}=require("../src/classes/workspaces/studCommandCenter.class.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"stud-ux1-test-"));
let store=new StudAcademicStore({root}).initialize(),passed=0;
const check=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`);};
const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function main(){try{
    let context=new StudWorkingContextService({store});
    const read=input=>context.courseOrganisation(input);
    const courses=[
        {title:"Engineering design",academicYear:"2026/27",academicTerm:"Term 1"},
        {title:"Humanities criticism",academicYear:"2026/27",academicTerm:"Term 2"},
        {title:"Law analysis",academicYear:"2025/26"},
        {title:"Social science",academicYear:"2024/25",academicTerm:"Summer"},
        {title:"Generic manual"},
        {title:"Future module",academicYear:"2027/28",academicTerm:"Term 1"}
    ].map(c=>store.createEntity("COURSE",c));
    let assignment;
    store.transaction(()=>{for(let i=0;i<620;i++)assignment=store.createEntity("ASSIGNMENT",{title:`Synthetic ${String(i).padStart(4,"0")}`,courseId:courses[0].id});});
    const years=read({browse:"YEARS"});
    check("stored years only; no invented current year",()=>{assert.equal(years.total,5);assert.ok(years.items.some(y=>y.academicYear===null));assert.ok(years.items.every(y=>!Object.hasOwn(y,"current")));});
    check("year and term scope is independent of module codes",()=>{const result=read({browse:"COURSES",academicYear:"2026/27"});assert.equal(result.total,2);assert.deepEqual(result.items.map(c=>c.academicTerm),["Term 1","Term 2"]);});
    check("unknown and manual courses remain accessible",()=>assert.equal(read({browse:"COURSES",academicYear:null}).items[0].id,courses[4].id));
    check("paged assignments are not a globally truncated 500-record list",()=>{const result=read({browse:"CONTENT",courseId:courses[0].id,kind:"ASSIGNMENT",offset:600});assert.equal(result.total,620);assert.equal(result.items.length,20);assert.equal(result.nextOffset,null);});
    check("course counts and content kinds remain separate",()=>{store.createEntity("RESOURCE",{title:"Module specification",type:"REFERENCE",courseId:courses[0].id});const result=read({browse:"CONTENT",courseId:courses[0].id,kind:"RESOURCE"});assert.equal(result.total,1);assert.equal(result.counts.ASSIGNMENT,620);assert.equal(result.counts.ACADEMIC_DOCUMENT,0);});
    check("search does not cross academic year",()=>{assert.equal(read({browse:"COURSES",academicYear:"2026/27",query:"Law"}).total,0);assert.equal(read({browse:"COURSES",academicYear:"2026/27",query:"criticism"}).total,1);});
    check("main rejects unbounded payloads and invalid canonical IDs",()=>{
        for(const payload of [{browse:"YEARS",limit:101},{browse:"YEARS",offset:-1},{browse:"YEARS",limit:"40"},{browse:"YEARS",query:"x".repeat(121)},{browse:"YEARS",sql:"SELECT 1"},{browse:"COURSES"},{browse:"CONTENT",courseId:courses[0].id,kind:"__proto__"},{browse:"CONTENT",courseId:"../../bad",kind:"ASSIGNMENT"}])assert.throws(()=>read(payload));
    });
    check("browse does not fabricate contexts or requirements",()=>{assert.equal(store.db.prepare("SELECT count(*) n FROM stud_working_context").get().n,0);assert.equal(store.db.prepare("SELECT count(*) n FROM stud_requirement_contracts").get().n,0);});
    const parent={state:{workingContext:null},request:async(channel,input)=>{assert.equal(channel,"stud-course-organisation");return read(input);},escape,render(){},dateText:v=>v};
    const ui=new StudSimpleNavigation(parent);const click=(action,value="")=>ui.click({target:{closest:()=>({dataset:{studSimple:action,value:String(value)}})}});
    await ui.load();check("year screen does not show internal labels or a flat course list",()=>{const html=ui.render();assert.ok(html.includes("Choose an academic year"));assert.ok(!html.includes("Engineering design"));assert.ok(!html.includes("CURRENT / RELEVANT"));});
    await click("year",ui.page.items.findIndex(y=>y.academicYear==="2026/27"));check("choosing a year replaces years with just its subjects",()=>{const html=ui.render();assert.ok(html.includes("Engineering design"));assert.ok(!html.includes("Law analysis"));assert.ok(!html.includes("Future module"));});
    await ui.load({browse:"CONTENT",courseId:courses[0].id,academicYear:"2026/27",kind:"ASSIGNMENT"});
    check("content page exposes honest next page and unknown due date",()=>{assert.ok(ui.render().includes("1–40 of 620"));assert.ok(ui.render().includes("Due date not confirmed"));});
    await click("page",40);check("next page queries only next scoped records",()=>assert.equal(ui.page.offset,40));
    await click("years");check("back returns to years without changing context",()=>assert.equal(ui.route.browse,"YEARS"));
    parent.state.workingContext={activeCourse:courses[0]};
    check("last used year is distinct from inferred current year; others remain available",()=>{const html=ui.render();assert.ok(html.includes("Last used year"));assert.ok(html.includes("Other years"));assert.ok(html.includes("2027/28"));assert.ok(!html.includes("Current year"));});
    const hostile=store.createEntity("COURSE",{title:'<img src=x onerror="attack()">',academicYear:"2026/27"});
    await ui.load({browse:"COURSES",academicYear:"2026/27"});check("canonical titles are escaped, not inserted as HTML",()=>{assert.ok(ui.render().includes("&lt;img"));assert.ok(!ui.render().includes('<img src=x'));});
    const deferred=[];const racing=new StudSimpleNavigation({...parent,request:(_c,p)=>new Promise(resolve=>deferred.push({p,resolve}))});
    const first=racing.load({browse:"YEARS"}),second=racing.load({browse:"COURSES",academicYear:null});deferred[1].resolve({items:[],total:0,nextOffset:null});await second;deferred[0].resolve(years);await first;
    check("stale asynchronous response cannot overwrite current route",()=>{assert.equal(racing.route.browse,"COURSES");assert.equal(racing.page.total,0);});
    const cc=new StudCommandCenter({ipc:{invoke:async(_channel,payload)=>({ok:true,data:store.getEntity(payload.entityType,payload.entityId)})}});
    cc.state={courses:[],assignments:[]};cc.workingContext={update:async value=>context.update(value)};cc.applyWorkingContext=()=>{};cc.refreshContexts=async()=>{};
    await cc.selectCourse(courses[0].id,"RESEARCH");await cc.selectAssignment(assignment.id);
    check("opening canonical objects beyond hydrated caches works",()=>{assert.equal(cc.state.selectedAssignmentId,assignment.id);assert.equal(cc.state.selectedCourseId,courses[0].id);});
    store.close();store=new StudAcademicStore({root}).initialize();context=new StudWorkingContextService({store});
    check("meaningful assignment selection survives restart",()=>assert.equal(context.read().activeAssignment.id,assignment.id));
    store.archiveEntity("COURSE",hostile.id);
    check("archived courses are not browsable",()=>assert.throws(()=>read({browse:"CONTENT",courseId:hostile.id,kind:"ASSIGNMENT"})));
    check("foreign keys and schema are unchanged",()=>{assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);assert.equal(store.schemaInfo().version,28);});
    console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
}finally{store.close();fs.rmSync(root,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1;});
