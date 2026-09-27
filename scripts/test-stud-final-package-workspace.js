#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const {StudFinalPackageWorkspace}=require("../src/classes/workspaces/studFinalPackageWorkspace.class.js");
const source=fs.readFileSync(path.join(__dirname,"../src/classes/workspaces/studFinalPackageWorkspace.class.js"),"utf8");
let passed=0;async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
function fixture(request=async()=>[]){const owner={id:"stud_assignment_one"},parent={assignment:()=>owner,parent:{render(){}}},escape=x=>String(x??"").replaceAll("<","&lt;").replaceAll('"',"&quot;");return {owner,view:new StudFinalPackageWorkspace({parent,request,escape})};}
const pkg=()=>({id:"stud_package_one",revision:1,title:"<script>bad</script>",manifestHash:"a".repeat(64),integrity:"VERIFIED",freshness:"CURRENT",state:"AWAITING_HUMAN_REVIEW",files:[],snapshot:{issues:[],requirements:[],citations:[],committee:{findings:[]}},preview:"<script>bad</script>"});
(async()=>{
 await check("renderer loads without Node authority",()=>{const context={window:{},module:{exports:{}}};vm.runInNewContext(source,context);assert(context.window.StudFinalPackageWorkspace);assert(!/require\(|process\.|Buffer\./.test(source));});
 await check("resting view performs no provider or persistence operation",()=>{let calls=0;const {view}=fixture(async()=>calls++);assert.match(view.render(),/Save a Draft Version/);assert.equal(calls,0);});
 await check("content and errors cannot create executable markup",()=>{const {view}=fixture();view.state.package=pkg();view.state.error="<img onerror=bad>";assert(!view.render().includes("<script>"));assert(!view.render().includes("<img"));});
 await check("late options cannot overwrite next Assignment",async()=>{let resolve;const pending=new Promise(r=>resolve=r),{view,owner}=fixture(()=>pending);const task=view.open();owner.id="stud_assignment_two";view.reset();resolve([]);await task;assert.equal(view.state.options,null);});
 await check("late inspect or approval result cannot cross Assignments",async()=>{let resolve;const wait=new Promise(r=>resolve=r),{view,owner}=fixture();const task=view.act(()=>wait);owner.id="stud_assignment_two";view.reset();resolve({...pkg(),approval:{}});await task;assert.equal(view.state.package,null);assert.equal(view.state.busy,false);});
 await check("busy actions cannot duplicate approval/export",async()=>{const {view}=fixture();view.state.busy=true;let calls=0;await view.act(()=>calls++);assert.equal(calls,0);});
 await check("blocked and changed packages have no enabled approval",()=>{for(const change of [{freshness:"SOURCE_CHANGED"},{integrity:"PACKAGE_FILE_UNAVAILABLE"},{snapshot:{...pkg().snapshot,issues:[{blocking:true,message:"Human checkpoint pending"}]}}]){const {view}=fixture();view.state.package={...pkg(),...change};assert.match(view.render(),/data-final-package-action="approve" disabled/);}});
 await check("approved snapshot has no approval edit escape hatch",()=>{const {view}=fixture();view.state.package={...pkg(),approval:{approvedAt:"2026-09-27"}};assert(!view.render().includes('data-final-package-action="approve"'));assert.match(view.render(),/Export approved package/);});
 console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
})().catch(e=>{console.error(e);process.exitCode=1;});
