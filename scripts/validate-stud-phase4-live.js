#!/usr/bin/env node
"use strict";

const fs = require("fs");
const port = Number(process.argv[2] || 9264);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const mode = String(process.argv[8] || "synced").toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => { const message = JSON.parse(event.data); const pending = socket.pending.get(message.id); if (!pending) return; socket.pending.delete(message.id); if (message.error || message.result && message.result.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); pending.resolve(pending.raw ? message.result : message.result && message.result.result && message.result.result.value); });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }

function fixture() {
    return `(async()=>{const manager=window.workspaceManager;manager.activate('student',false);await new Promise(r=>setTimeout(r,180));const cc=manager.studCommandCenter;const now='2026-08-11T12:00:00.000Z';
        const course={id:'stud_course_phase4_visual',title:'Synthetic Systems Engineering and Applied Thermodynamics',code:'SYN-404',shortName:'SYN-404',description:'Public-safe in-memory course used only to validate Moodle presentation.',status:'ACTIVE',startDate:'2026-09-01T08:00:00.000Z',createdAt:now,updatedAt:now};
        const assignment={id:'stud_assignment_phase4_visual',courseId:course.id,title:'Synthetic bounded report with a deliberately long title for responsive Moodle layout validation',description:'Synthetic only. No Moodle record is persisted by the visual validation script.',status:'IN_PROGRESS',submissionStatus:'NOT_SUBMITTED',priority:'HIGH',priorityPresentation:'HIGH',localProgress:0,dueDate:'2026-10-03T15:00:00.000Z',grade:82,gradeMaximum:100,feedback:'Synthetic read-only feedback observation.',createdAt:now,updatedAt:now};
        cc.state.schema={version:4};cc.state.error=null;cc.state.courses=[course];cc.state.assignments=[assignment];cc.state.selectedCourseId=course.id;cc.state.selectedAssignmentId=assignment.id;cc.state.overview={today:[],upcoming:[assignment],priority:[assignment],continue:[],moduleStatus:[{...course,activeAssignmentCount:1,nearestDueDate:assignment.dueDate}],generatedAt:now};cc.state.courseContext={course,assignments:[assignment],resources:[],notes:[],papers:[],references:[],provenance:[]};cc.state.assignmentContext={assignment,provenance:[{field:'dueDate',sourceType:'MOODLE',observedValue:assignment.dueDate,sourceAuthority:'TRUSTED',observedAt:now}],relationships:[],references:[],resources:[]};
        const caps={SITE_INFO:'SUPPORTED',COURSES:'SUPPORTED',COURSE_CONTENT:'SUPPORTED',ASSIGNMENTS:'SUPPORTED',ASSIGNMENT_STATUS:'UNKNOWN',RESOURCES:'SUPPORTED',CALENDAR:'SUPPORTED',GRADES:'SUPPORTED',FEEDBACK:'SUPPORTED',COMPLETION:'PERMISSION_DENIED',FORUM_READ:'NOT_EXPOSED',ANNOUNCEMENTS:'UNKNOWN',NOTIFICATIONS:'UNKNOWN',QUIZZES:'UNKNOWN',PARTICIPANTS:'UNKNOWN',FILES:'UNKNOWN',ASSIGNMENT_WRITE:'POLICY_DISABLED',FORUM_WRITE:'POLICY_DISABLED',MESSAGE_WRITE:'POLICY_DISABLED',QUIZ_WRITE:'POLICY_DISABLED'};const configured=${JSON.stringify(mode)}!=='config-required';if(!configured)Object.keys(caps).forEach(key=>{if(!key.endsWith('_WRITE'))caps[key]='CONFIG_REQUIRED';});cc.moodle.state.provider={id:'stud_moodle_default',displayName:'Synthetic Moodle',baseUrl:configured?'https://moodle.synthetic.example':null,status:configured?'PARTIAL':'CONFIG_REQUIRED',tokenConfigured:configured,icsConfigured:configured,secureStorageAvailable:true,lastSuccessfulSync:configured?now:null,lastAttempt:configured?now:null,lastErrorCode:configured?null:'CONFIG_REQUIRED',capabilities:caps};cc.moodle.state.probe=configured?{webServices:'AVAILABLE',mobileWebServices:'UNKNOWN',rest:'AVAILABLE'}:null;cc.moodle.state.error=${JSON.stringify(mode)}==='offline'?'Synthetic offline provider state: no canonical record was changed.':'';cc.setActiveView(${JSON.stringify(mode === "services" ? "SERVICES" : "MOODLE")});return true;})()`;
}

async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        const systemAppearance = appearance === "system-dark" ? "dark" : appearance === "system-light" ? "light" : null;
        if (systemAppearance) await command(socket, "Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: systemAppearance}]});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(systemAppearance ? "system" : appearance)}==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):${JSON.stringify(systemAppearance ? "system" : appearance)};true`);
        await evaluate(socket, fixture()); await delay(420);
        if (screenshotPath) await evaluate(socket, `(()=>{const existing=document.querySelector('[data-stud-public-screenshot-terminal]');if(existing)existing.remove();const mask=document.createElement('div');mask.dataset.studPublicScreenshotTerminal='true';mask.textContent='aegis@synthetic-validation-node AegisUi %';Object.assign(mask.style,{position:'fixed',zIndex:'2147483647',left:'17.5vw',right:'1.1vw',top:'5.25vh',height:'4.55vh',display:'grid',alignItems:'center',padding:'0 .55vw',boxSizing:'border-box',border:'1px solid #12679b',background:'#050a0f',color:'#9ecfc8',fontFamily:'monospace',fontSize:'1.2vw'});document.body.append(mask);return true})()`);
        const report = await evaluate(socket, `(()=>{const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck');const root=deck&&deck.querySelector('[data-stud-main]');if(!root)return{available:false};const rect=e=>e.getBoundingClientRect();const controls=[...root.querySelectorAll('button,input,textarea,select')].filter(e=>!e.disabled);const escaped=controls.filter(e=>{const panel=e.closest('.workspace-panel')||root;const a=rect(e),b=rect(panel);return a.left<b.left-3||a.right>b.right+3||a.top<b.top-3||a.bottom>b.bottom+3;});const title=root.querySelector('.stud-section-title');const capability=root.querySelector('.stud-moodle-capability-panel');const data=root.querySelector('.stud-moodle-data-grid');const flowApplicable=Boolean(title&&capability&&data);const normalFlow=!flowApplicable||(rect(title).bottom<=rect(capability).top+2&&rect(capability).bottom<=rect(data).top+2);return{available:true,active:deck.querySelector('.stud-command-nav .active')?.textContent||'',controls:controls.length,escapedControls:escaped.length,horizontalOverflow:root.scrollWidth>root.clientWidth+4,normalFlow,appearance:document.documentElement.dataset.aegisAppearance,width:innerWidth,height:innerHeight};})()`);
        console.log(`STUD_PHASE4_LIVE_AVAILABLE: ${report.available ? "OK" : "FAIL"}`);
        console.log(`STUD_PHASE4_LIVE_LAYOUT: ${report.escapedControls === 0 && !report.horizontalOverflow && report.normalFlow ? "OK" : "FAIL"} ${JSON.stringify(report)}`);
        if (screenshotPath) { const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false}); fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64")); console.log(`STUD_PHASE4_LIVE_SCREENSHOT: ${screenshotPath}`); }
        if (!report.available || report.escapedControls || report.horizontalOverflow || !report.normalFlow) process.exitCode = 1;
    } finally { socket.close(); }
}
main().catch(error => { console.error(`STUD_PHASE4_LIVE: FAIL ${error.message}`); process.exitCode = 1; });
