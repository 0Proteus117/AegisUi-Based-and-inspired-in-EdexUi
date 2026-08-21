#!/usr/bin/env node
"use strict";

const fs = require("fs");
const port = Number(process.argv[2] || 9242);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const scenario = String(process.argv[8] || "overview").toLowerCase();
if (!["overview", "modules", "assignments", "provenance"].includes(scenario)) throw new Error("Unsupported validation scenario.");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data); const pending = socket.pending.get(message.id);
        if (!pending) return; socket.pending.delete(message.id);
        if (message.error || message.result && message.result.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        pending.resolve(pending.raw ? message.result : message.result && message.result.result && message.result.result.value);
    });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }
function fixtureId(value) { const id = String(value || ""); if (!/^stud_[a-z0-9_]{6,120}$/i.test(id)) throw new Error("Renderer returned an invalid synthetic fixture identifier."); return id; }

function fixture() {
    return `(async () => { const manager=window.workspaceManager; manager.activate('student',false); await new Promise(resolve => setTimeout(resolve, 40));
        const ipc=require('electron').ipcRenderer; const cc=window.workspaceManager.studCommandCenter;
        const course=await ipc.invoke('stud-entity-create',{entityType:'COURSE',value:{title:'Synthetic Systems Engineering Module with bounded public-safe detail',code:'SYN-201',description:'Synthetic validation module only.',status:'ACTIVE'},provenance:{field:'title',observedValue:'Synthetic Systems Engineering Module with bounded public-safe detail',sourceType:'USER',sourceAuthority:'AUTHORITATIVE'}});
        const assignment=await ipc.invoke('stud-entity-create',{entityType:'ASSIGNMENT',value:{courseId:course.data.id,title:'Synthetic assignment with deliberately long but bounded title for compact Command Center validation',description:'Synthetic assignment context only. No private grades or academic data.',dueDate:'2026-08-12T14:00:00.000Z',status:'IN_PROGRESS',localProgress:45,priority:'HIGH'},provenance:{field:'dueDate',observedValue:'2026-08-12T14:00:00.000Z',sourceType:'USER',sourceAuthority:'AUTHORITATIVE'}});
        const note=await ipc.invoke('stud-entity-create',{entityType:'NOTE',value:{courseId:course.data.id,title:'Synthetic note',content:'Synthetic bounded note used for responsive validation.'}});
        await ipc.invoke('stud-relationship-create',{fromType:'COURSE',fromId:course.data.id,relationType:'HAS_NOTE',toType:'NOTE',toId:note.data.id,source:'USER'});
        await ipc.invoke('stud-provenance-create',{entityType:'ASSIGNMENT',entityId:assignment.data.id,field:'dueDate',observedValue:'2026-08-11T12:00:00.000Z',sourceType:'EMAIL',sourceAuthority:'TRUSTED'});
        await ipc.invoke('stud-reference-link',{entityType:'ASSIGNMENT',entityId:assignment.data.id,kind:'CALENDAR',externalId:'synthetic-calendar-reference'});
        cc.state.selectedCourseId=course.data.id; cc.state.selectedAssignmentId=assignment.data.id; await cc.refresh();
        return {courseId:course.data.id,assignmentId:assignment.data.id};
    })()`;
}

async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(appearance)} === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : ${JSON.stringify(appearance)}; true;`);
        const returnedIds = await evaluate(socket, fixture());
        const ids = {courseId: fixtureId(returnedIds.courseId), assignmentId: fixtureId(returnedIds.assignmentId)};
        if (scenario === "modules") await evaluate(socket, `(async () => { const cc=window.workspaceManager.studCommandCenter; await cc.selectCourse('${ids.courseId}','MODULES'); })()`);
        if (scenario === "assignments") await evaluate(socket, `(async () => { const cc=window.workspaceManager.studCommandCenter; await cc.selectAssignment('${ids.assignmentId}','ASSIGNMENTS'); })()`);
        if (scenario === "provenance") await evaluate(socket, `(async () => { const cc=window.workspaceManager.studCommandCenter; await cc.selectAssignment('${ids.assignmentId}','ASSIGNMENTS'); cc.openProvenance('ASSIGNMENT:${ids.assignmentId}', document.querySelector('[data-workspace="student"]')); })()`);
        await delay(350);
        const report = await evaluate(socket, `(() => { const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck'); if(!deck)return {available:false}; const rect=item=>item.getBoundingClientRect(); const panels=[...deck.querySelectorAll('.workspace-panel')]; const controls=[...deck.querySelectorAll('button,input,textarea,select')].filter(item=>!item.disabled); const escaped=controls.filter(item=>{const panel=item.closest('.workspace-panel');if(!panel)return false;const r=rect(item),p=rect(panel);return r.left<p.left-2||r.right>p.right+2||r.top<p.top-2||r.bottom>p.bottom+2;}); return {available:true,title:deck.querySelector('.stud-command-header h2')?.textContent||'',panels:panels.length,controls:controls.length,escapedControls:escaped.length,horizontalOverflow:deck.scrollWidth>deck.clientWidth+3,active:deck.querySelector('.stud-command-nav .active')?.textContent||'',future:[...deck.querySelectorAll('.stud-nav-deferred')].length}; })()`);
        console.log(`STUD_PHASE2_LIVE_AVAILABLE: ${report && report.available ? "OK" : "FAIL"}`);
        console.log(`STUD_PHASE2_LIVE_LAYOUT: ${report && report.escapedControls === 0 && !report.horizontalOverflow ? "OK" : "FAIL"} ${JSON.stringify(report)}`);
        if (screenshotPath) {
            const clip = await evaluate(socket, `(() => { const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck'); if(!deck)return null;const r=deck.getBoundingClientRect();return {x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(innerWidth-r.left,r.width),height:Math.min(innerHeight-r.top,r.height),scale:1}; })()`);
            const capture = await command(socket, "Page.captureScreenshot", {format:"png",captureBeyondViewport:false,...(clip ? {clip} : {})});
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`STUD_PHASE2_LIVE_SCREENSHOT: ${screenshotPath}`);
        }
        if (!report || !report.available || report.escapedControls || report.horizontalOverflow || report.future !== 6) process.exitCode = 1;
    } finally { socket.close(); }
}
main().catch(error => { console.error(`STUD_PHASE2_LIVE: FAIL ${error.message}`); process.exitCode = 1; });
