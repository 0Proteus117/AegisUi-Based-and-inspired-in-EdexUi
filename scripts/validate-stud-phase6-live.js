#!/usr/bin/env node
"use strict";

// Sanitized visual-layout probe for the local-only Revision workspace. It uses
// renderer state only: no provider, Calendar, Email or Moodle request occurs.
const fs = require("fs");
const port = Number(process.argv[2] || 9266);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const mode = String(process.argv[8] || "detail").toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.seq = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => { const message = JSON.parse(event.data); const pending = socket.pending.get(message.id); if (!pending) return; socket.pending.delete(message.id); if (message.error || message.result?.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); pending.resolve(pending.raw ? message.result : message.result?.result?.value); });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.seq; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.seq; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }
function fixture() { return `(async()=>{
    const manager=window.workspaceManager; manager.activate('student',false); await new Promise(resolve=>setTimeout(resolve,220));
    const cc=manager.studCommandCenter, now='2026-08-11T12:00:00.000Z';
    const course={id:'stud_course_phase6',title:'Synthetic Applied Systems Engineering With A Bounded Long Module Name',code:'SYN-601',shortName:'SYN-601',status:'ACTIVE',createdAt:now,updatedAt:now};
    const assignment={id:'stud_assignment_phase6',courseId:course.id,title:'Synthetic assignment with a safe long title for deterministic visual validation',status:'IN_PROGRESS',priority:'HIGH',dueDate:'2026-08-13T14:00:00.000Z',createdAt:now,updatedAt:now};
    const item={id:'stud_revision_phase6',courseId:course.id,title:'Revision: synthetic control-system stability and bounded local planning',prompt:'Revision: synthetic control-system stability and bounded local planning',description:'Synthetic validation description. This local item demonstrates explicit scheduling, bounded priority and provenance-aware study session history without invoking any external system.',status:'ACTIVE',priority:'HIGH',difficulty:'MEDIUM',confidence:'MEDIUM',estimatedDurationMinutes:45,accumulatedStudyMinutes:35,lastStudiedAt:'2026-08-10T11:20:00.000Z',nextPlannedRevisionAt:'2026-08-14T09:00:00.000Z',scheduledRevisionAt:'2026-08-11T09:00:00.000Z',spacedRevisionEnabled:true,successfulRevisionCount:2,pinned:true,createdAt:now,updatedAt:now,planning:{state:'TODAY',reason:'SCHEDULED TODAY',source:'USER_SCHEDULED'}};
    const alternate={...item,id:'stud_revision_phase6_next',title:'Synthetic unscheduled review item',prompt:'Synthetic unscheduled review item',priority:'NORMAL',scheduledRevisionAt:null,nextPlannedRevisionAt:null,pinned:false,planning:{state:'NEEDS_REVIEW',reason:'NO RECORDED STUDY CONFIDENCE',source:'LOCAL_PLANNER'}};
    const context={revision:item,course,assignments:[assignment],notes:[{id:'stud_note_phase6',title:'Synthetic local study note'}],resources:[{id:'stud_resource_phase6',title:'Synthetic bounded reference resource'}],papers:[{id:'stud_paper_phase6',title:'Synthetic research paper with public-safe metadata'}],history:[{id:'stud_session_finished',status:'FINISHED',elapsedSeconds:2100,startedAt:'2026-08-10T10:45:00.000Z',confidence:'MEDIUM',note:'Synthetic completed study session.'},{id:'stud_session_paused',status:'PAUSED',elapsedSeconds:1200,startedAt:'2026-08-11T08:20:00.000Z',confidence:'UNKNOWN',note:''}],planning:item.planning};
    cc.state.schema={version:7}; cc.state.error=null; cc.state.courses=[course]; cc.state.assignments=[assignment];
    cc.revision.state={...cc.revision.state,overview:{today:[item],overdue:[],upcoming:[alternate],highPriority:[item],unscheduled:[],needsReview:[alternate],recentlyStudied:[item],courseDistribution:{[course.id]:2}},plan:[item,alternate],items:[item,alternate],selectedId:${JSON.stringify(mode === "overview" ? "" : "stud_revision_phase6")},context:${mode === "overview" ? "null" : "context"},activeSession:${JSON.stringify(["session","finish"].includes(mode) ? {id:'stud_session_active',status:'STARTED',elapsedSeconds:900,startedAt:'2026-08-11T11:00:00.000Z'} : null)},error:null};
    cc.setActiveView('REVISION');
    if (${JSON.stringify(mode)} === 'create') cc.revision.dialog('CREATE', cc.view.querySelector('[data-stud-revision-create]'));
    if (${JSON.stringify(mode)} === 'finish') cc.revision.dialog('FINISH', cc.view.querySelector('[data-stud-revision-finish]'), {sessionId:'stud_session_active'});
    if (${JSON.stringify(mode)} === 'link') cc.revision.dialog('LINK', cc.view.querySelector('[data-stud-revision-link]'), {revisionId:item.id});
    return true;
})()`; }
async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile:false});
        const system=appearance.startsWith("system-") ? appearance.slice(7) : null;
        if (system) await command(socket,"Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:system}]});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(system || appearance)};true`);
        await evaluate(socket, fixture()); await delay(300);
        const report = await evaluate(socket, `(()=>{const root=document.querySelector('[data-stud-main]'),rect=element=>element.getBoundingClientRect(),controls=[...root.querySelectorAll('button,input,textarea,select')].filter(element=>!element.disabled),escaped=controls.filter(element=>{const panel=element.closest('.workspace-panel')||root,a=rect(element),b=rect(panel);return a.left<b.left-3||a.right>b.right+3||a.top<b.top-3||a.bottom>b.bottom+3;}),panels=[...root.querySelectorAll('.workspace-panel')],overlaps=[];for(let index=0;index<panels.length;index+=1){for(let other=index+1;other<panels.length;other+=1){const a=rect(panels[index]),b=rect(panels[other]);if(a.right>b.left+5&&b.right>a.left+5&&a.bottom>b.top+5&&b.bottom>a.top+5)overlaps.push([index,other]);}}return{available:!!root,escaped:escaped.length,overflow:root.scrollWidth>root.clientWidth+4,panels:panels.length,overlaps:overlaps.length,revision:!!root.querySelector('.stud-revision-shell'),detail:!!root.querySelector('.stud-revision-detail-panel')};})()`);
        const valid=report.available&&report.revision&&!report.escaped&&!report.overflow&&!report.overlaps&&(mode==='overview'||report.detail);
        console.log(`STUD_PHASE6_LIVE_LAYOUT: ${valid?'OK':'FAIL'} ${JSON.stringify(report)}`);
        if(screenshotPath){await evaluate(socket,`(()=>{const mask=document.createElement('div');mask.textContent='aegis@synthetic-validation-node AegisUi %';Object.assign(mask.style,{position:'fixed',zIndex:'2147483647',left:'17.5vw',right:'1.1vw',top:'5.25vh',height:'4.55vh',display:'grid',alignItems:'center',padding:'0 .55vw',boxSizing:'border-box',border:'1px solid #12679b',background:'#050a0f',color:'#9ecfc8',fontFamily:'monospace',fontSize:'1.2vw'});document.body.append(mask)})()`);const shot=await command(socket,'Page.captureScreenshot',{format:'png'});fs.writeFileSync(screenshotPath,Buffer.from(shot.data,'base64'));console.log(`STUD_PHASE6_SCREENSHOT: ${screenshotPath}`);}
        if(!valid)process.exitCode=1;
    } finally { socket.close(); }
}
main().catch(error=>{console.error(`STUD_PHASE6_LIVE_LAYOUT: FAIL ${error.message}`);process.exitCode=1;});
