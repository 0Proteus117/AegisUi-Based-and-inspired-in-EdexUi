#!/usr/bin/env node
"use strict";

// Renderer-only M2 visual fixture. It never calls IPC, providers, AI or SQLite.
const fs = require("fs");
const path = require("path");
const port = Number(process.argv[2] || 9227);
const screenshotPath = String(process.argv[3] || "");
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once:true}); socket.addEventListener("error", reject, {once:true}); });
    socket.addEventListener("message", event => { const message = JSON.parse(event.data), pending = socket.pending.get(message.id); if (!pending) return; socket.pending.delete(message.id); if (message.error || message.result?.exceptionDetails) pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); else pending.resolve(pending.raw ? message.result : message.result?.result?.value); });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw:true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw:false}); socket.send(JSON.stringify({id, method:"Runtime.evaluate", params:{expression, returnByValue:true, awaitPromise:true}})); }); }

function fixture() {
    return `(async()=>{const manager=window.workspaceManager;manager.activate('student',false);await new Promise(resolve=>setTimeout(resolve,200));const cc=manager.studCommandCenter,now='2026-08-24T12:00:00.000Z';
    const course={id:'stud_m2_course_current',title:'Synthetic Systems Analysis and Professional Practice',code:'SYN-4020',academicYear:'2025/26',academicTerm:'Term 2',status:'ACTIVE',updatedAt:now};
    const historic={id:'stud_m2_course_historic',title:'Synthetic Literature and Critical Methods',code:'HUM-101',academicYear:'2024/25',academicTerm:'Term 1',status:'ARCHIVED',updatedAt:'2025-05-01T12:00:00.000Z'};
    const unknown={id:'stud_m2_course_unknown',title:'Synthetic Unclassified Seminar',code:null,academicYear:null,academicTerm:null,status:'ACTIVE',updatedAt:now};
    const assignment={id:'stud_m2_assignment_current',courseId:course.id,title:'Synthetic portfolio: evidence, methods and reflection with a deliberately long validation title',dueDate:'2026-09-07T15:00:00.000Z',status:'IN_PROGRESS',updatedAt:now};
    const document={id:'stud_m2_document_current',title:'Synthetic assessment brief with bounded provenance',documentType:'COURSE_MATERIAL',pageCount:12,updatedAt:now};
    cc.state.schema={version:16};cc.state.error=null;cc.state.courses=[course,historic,unknown];cc.state.assignments=[assignment];cc.state.classifications=new Map([[assignment.id,{assignmentId:assignment.id,classification:'COURSEWORK',sourceKind:'DETERMINISTIC'}]]);cc.state.organisation={years:[{year:'2025/26',terms:[{term:'Term 2',courses:[{course,assignments:[assignment]}]}]},{year:'2024/25',terms:[{term:'Term 1',courses:[{course:historic,assignments:[]}]}]}],unclassified:[{course:unknown,assignments:[]}]};cc.state.workingContext={status:'ACTIVE',activeCourse:course,activeAssignment:assignment,activeContract:null,activeObject:{...document,entityType:'ACADEMIC_DOCUMENT'},originSurface:'DOCUMENTS',userPinned:true,updatedAt:now};cc.state.selectedCourseId=course.id;cc.state.selectedAssignmentId=assignment.id;cc.state.courseContext={course,assignments:[assignment],resources:[],notes:[],revisions:[],papers:[],references:[],provenance:[]};cc.state.assignmentContext={course,assignment,documents:[document],resources:[],notes:[],papers:[],revisions:[],links:[],references:[],provenance:[],conflicts:[],requirements:[],requirementsContract:{assignmentId:assignment.id,current:null,draft:{lifecycle:'DRAFT',completeness:'INCOMPLETE',reviewCondition:'NEEDS_REVIEW',items:[],candidates:[],coverage:{linkedDocuments:1,inspectedDocuments:1,ocrRequiredDocuments:0,chunksInspected:1,candidatesGenerated:0,truncationReached:false},freshness:{reviewCondition:'NEEDS_REVIEW',details:[]}},history:[]}};cc.state.overview={today:[],upcoming:[assignment],priority:[assignment],continue:[{type:'ASSIGNMENT',course,assignment,context:cc.state.workingContext}],moduleStatus:[{...course,activeAssignmentCount:1,nearestDueDate:assignment.dueDate}],attention:[],generatedAt:now};cc.setActiveView('MODULES');cc.render();return true})()`;
}

(async()=>{
    const socket=await connect();
    try {
        await command(socket,"Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
        const system=appearance.startsWith("system-") ? appearance.slice(7) : null;
        if(system) await command(socket,"Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:system}]});
        await evaluate(socket,`document.documentElement.dataset.aegisAppearance=${JSON.stringify(system || appearance)};true`);
        await evaluate(socket,fixture()); await delay(350);
        const report=await evaluate(socket,`(()=>{const root=document.querySelector('[data-workspace="student"] [data-stud-main]');if(!root)return{available:false};const rect=item=>item.getBoundingClientRect(),bounds=rect(root),controls=[...root.querySelectorAll('button,input,textarea,select')].filter(item=>!item.disabled&&rect(item).width>1&&rect(item).height>1),escaped=controls.filter(item=>{const r=rect(item);return r.left<bounds.left-3||r.right>bounds.right+3});return{available:true,context:!!root.querySelector('.stud-working-context'),hierarchy:!!root.querySelector('.stud-academic-hierarchy'),years:[...root.querySelectorAll('.stud-academic-year')].length,unclassified:root.textContent.includes('UNCLASSIFIED'),classification:root.textContent.includes('COURSEWORK'),escaped:escaped.length,overflow:root.scrollWidth>root.clientWidth+4};})()`);
        const valid=report.available&&report.context&&report.hierarchy&&report.years===2&&report.unclassified&&report.classification&&!report.escaped&&!report.overflow;
        console.log(`STUD_M2_LIVE_LAYOUT: ${valid?'OK':'FAIL'} ${JSON.stringify(report)}`);
        if(screenshotPath){const capture=await command(socket,"Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.mkdirSync(path.dirname(screenshotPath),{recursive:true});fs.writeFileSync(screenshotPath,Buffer.from(capture.data,"base64"));console.log(`STUD_M2_SCREENSHOT: ${screenshotPath}`);}
        if(!valid)process.exitCode=1;
    } finally { socket.close(); }
})().catch(error=>{console.error(`STUD_M2_LIVE_LAYOUT: FAIL ${error.message}`);process.exitCode=1;});
