#!/usr/bin/env node
"use strict";

const fs = require("fs");
const port = Number(process.argv[2] || 9234);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    socket.sequence = 0;
    socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        const pending = socket.pending.get(message.id);
        if (!pending) return;
        socket.pending.delete(message.id);
        if (message.error || message.result && message.result.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        pending.resolve(pending.raw ? message.result : message.result && message.result.result && message.result.result.value);
    });
    return socket;
}

function command(socket, method, params = {}) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); });
}

function evaluate(socket, expression) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); });
}

async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(appearance)}; window.workspaceManager.activate('student', false); true;`);
        await delay(300);
        await evaluate(socket, `(async () => {
            const ipc = require('electron').ipcRenderer;
            const course = await ipc.invoke('stud-entity-create', {entityType:'COURSE', value:{title:'Synthetic Applied Mechanics', code:'SYN-101', description:'Synthetic public-safe course used for visual validation.'}, provenance:{field:'title', observedValue:'Synthetic Applied Mechanics', sourceType:'USER', sourceAuthority:'AUTHORITATIVE'}});
            const assignment = await ipc.invoke('stud-entity-create', {entityType:'ASSIGNMENT', value:{courseId:course.data.id,title:'Synthetic finite element report with a deliberately long but bounded title for compact layout validation',description:'Synthetic assignment description. No real grade, deadline or student data.',dueDate:'2026-11-18T14:00:00.000Z',status:'IN_PROGRESS'}, provenance:{field:'dueDate', observedValue:'2026-11-18T14:00:00.000Z', sourceType:'USER', sourceAuthority:'AUTHORITATIVE'}});
            await ipc.invoke('stud-provenance-create', {entityType:'ASSIGNMENT',entityId:assignment.data.id,field:'dueDate',observedValue:'2026-11-17T23:59:00.000Z',sourceType:'EMAIL',sourceAuthority:'TRUSTED'});
            window.workspaceManager.studentState.selectedCourseId=course.data.id;
            window.workspaceManager.studentState.selectedAssignmentId=assignment.data.id;
            await window.workspaceManager.refreshStudentCore();
            return {courseId:course.data.id,assignmentId:assignment.data.id};
        })()`);
        const report = await evaluate(socket, `(() => {
            const view=document.querySelector('[data-workspace="student"]:not(.workspace-is-hidden)'); const root=view && view.querySelector('.stud-academic-grid');
            if(!root) return {available:false}; const box=root.getBoundingClientRect(); const panels=[...root.querySelectorAll('.workspace-panel')]; const controls=[...root.querySelectorAll('button,input,textarea,select')].filter(item=>!item.disabled); const rect=item=>item.getBoundingClientRect();
            const escaped=controls.filter(item=>{const panel=item.closest('.workspace-panel'); if(!panel)return false; const r=rect(item),p=rect(panel); const verticallyScrollable=panel.scrollHeight>panel.clientHeight+3; return r.left<p.left-2||r.right>p.right+2||(!verticallyScrollable&&(r.top<p.top-2||r.bottom>p.bottom+2));});
            return {available:true, panels:panels.length, controls:controls.length, escapedControls:escaped.length, horizontalOverflow:root.scrollWidth>root.clientWidth+3, fields:[...root.querySelectorAll('.stud-provenance li')].length, title:root.querySelector('.stud-core-header h2')?.textContent||''};
        })()`);
        console.log(`STUD_LIVE_AVAILABLE: ${report && report.available ? "OK" : "FAIL"}`);
        console.log(`STUD_LIVE_LAYOUT: ${report && report.escapedControls === 0 && !report.horizontalOverflow ? "OK" : "FAIL"} ${JSON.stringify(report)}`);
        if (screenshotPath) {
            const clip = await evaluate(socket, `(() => { const deck=document.querySelector('[data-workspace="student"] .stud-academic-deck'); if (!deck) return null; const r=deck.getBoundingClientRect(); return {x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(window.innerWidth-r.left,r.width),height:Math.min(window.innerHeight-r.top,r.height),scale:1}; })()`);
            const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false, ...(clip ? {clip} : {})});
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`STUD_LIVE_SCREENSHOT: ${screenshotPath}`);
        }
        if (!report || !report.available || report.escapedControls || report.horizontalOverflow) process.exitCode = 1;
    } finally { socket.close(); }
}

main().catch(error => { console.error(`STUD_LIVE: FAIL ${error.message}`); process.exitCode = 1; });
