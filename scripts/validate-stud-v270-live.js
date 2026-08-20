#!/usr/bin/env node
"use strict";

// Renderer-only v2.7.0 Reality Pass fixture. No IPC is called and no fixture
// reaches SQLite, the credential vault, Moodle or any external provider.
const fs = require("fs");
const port = Number(process.argv[2] || 9223);
const screenshotPath = String(process.argv[3] || "");
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const mode = String(process.argv[8] || "assignment").toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => { const message = JSON.parse(event.data), pending = socket.pending.get(message.id); if (!pending) return; socket.pending.delete(message.id); if (message.error || message.result?.exceptionDetails) pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); else pending.resolve(pending.raw ? message.result : message.result?.result?.value); });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }

function fixture(targetMode) {
    return `(async()=>{const manager=window.workspaceManager;manager.activate('student',false);await new Promise(r=>setTimeout(r,250));const cc=manager.studCommandCenter,now='2026-08-20T12:00:00.000Z';
    const course={id:'stud_course_v270_public',title:'Synthetic Sustainable Energy Systems',code:'SYN-4020',shortName:'SYN-4020',description:'Public-safe synthetic module used only for v2.7.0 visual validation.',status:'ACTIVE',startDate:'2026-08-01T09:00:00.000Z',endDate:'2026-12-18T17:00:00.000Z',createdAt:now,updatedAt:now};
    const assignment={id:'stud_assignment_v270_public',courseId:course.id,title:'Synthetic resit portfolio · thermal systems analysis and evidence review',description:'Produce three clearly separated portfolio parts using the supplied brief, source evidence and explicit calculations.',status:'IN_PROGRESS',submissionStatus:'NOT_SUBMITTED',priority:'HIGH',priorityPresentation:'HIGH',releaseDate:'2026-08-16T23:00:00.000Z',dueDate:'2026-09-07T15:00:00.000Z',localProgress:42,createdAt:now,updatedAt:now};
    const documents=[{id:'stud_document_v270_brief',title:'Synthetic portfolio assessment brief and marking guidance',documentType:'COURSE_MATERIAL',displayName:'synthetic-portfolio-brief.pdf',checksum:'a'.repeat(64),extractionStatus:'READY',extractionEngine:'PDFJS_LOCAL',pageCount:14,updatedAt:now},{id:'stud_document_v270_appendix',title:'Synthetic individual appendix instructions',documentType:'COURSE_MATERIAL',displayName:'synthetic-appendix.pdf',checksum:'b'.repeat(64),extractionStatus:'READY',extractionEngine:'PDFJS_LOCAL',pageCount:6,updatedAt:now},{id:'stud_document_v270_lecture',title:'Lecture notes · dimensional analysis and thermal balances',documentType:'LECTURE_SLIDES',displayName:'synthetic-lecture.pdf',checksum:'c'.repeat(64),extractionStatus:'READY',extractionEngine:'PDFJS_LOCAL',pageCount:38,updatedAt:now}];
    const resources=[{id:'stud_resource_v270_1',title:'Synthetic prerecorded briefing reference',type:'LINK',localReference:null,updatedAt:now},{id:'stud_resource_v270_2',title:'Synthetic laboratory dataset',type:'DOCUMENT',localReference:'documents/synthetic-lab-data.csv',updatedAt:now}];
    const notes=[{id:'stud_note_v270',title:'Portfolio evidence plan',content:'Synthetic note with explicit source boundaries.',updatedAt:now}];
    const papers=[{id:'stud_paper_v270',title:'Synthetic public-safe thermal systems methods paper',year:2024,doi:'10.5555/aegis.synthetic.v270',localDocumentReference:'documents/synthetic-paper.pdf',updatedAt:now}];
    const revisions=[{id:'stud_revision_v270',title:'Rubric and evidence review',updatedAt:now}];
    const requirements=[{label:'SUBMISSION FORMAT',value:'Part A slides + Part B individual appendix + Part B design report',kind:'DIRECT_REQUIREMENT',location:'Assessment brief · section 2',confidence:'HIGH',sourceType:'MOODLE'},{label:'DEADLINE',value:'07 SEP 2026 · 16:00 EUROPE/LONDON',kind:'DIRECT_REQUIREMENT',location:'Moodle assignment metadata',confidence:'HIGH',sourceType:'MOODLE'},{label:'VIDEO EVIDENCE',value:'Prerecorded presentation link required with Part A',kind:'EXTRACTED_REQUIREMENT',location:'Brief · Part A',confidence:'MEDIUM',sourceType:'ACADEMIC_DOCUMENT'},{label:'CITATION STYLE',value:'Use the stated institutional academic referencing guidance',kind:'EXTRACTED_REQUIREMENT',location:'Marking guidance · references',confidence:'MEDIUM',sourceType:'ACADEMIC_DOCUMENT'}];
    const provenance=[{field:'title',observedValue:assignment.title,sourceType:'MOODLE',sourceAuthority:'AUTHORITATIVE',observedAt:now},{field:'dueDate',observedValue:assignment.dueDate,sourceType:'MOODLE',sourceAuthority:'AUTHORITATIVE',observedAt:now}];
    const assignmentContext={assignment,course,provenance,relationships:[],references:[],resources,documents,notes,papers,revisions,links:[],conflicts:[],requirements,status:'CORROBORATED'};
    cc.state.schema={version:14};cc.state.error=null;cc.state.courses=[course];cc.state.assignments=[assignment];cc.state.selectedCourseId=course.id;cc.state.selectedAssignmentId=assignment.id;cc.state.workflowAssignmentId=assignment.id;cc.state.assignmentContext=assignmentContext;cc.state.courseContext={course,assignments:[assignment],resources,notes,revisions,papers,references:[],provenance:[]};cc.state.overview={today:[],upcoming:[assignment],priority:[assignment],continue:[notes[0]],moduleStatus:[{...course,activeAssignmentCount:1,nearestDueDate:assignment.dueDate}],attention:[],generatedAt:now};
    cc.documents.state={...cc.documents.state,capabilities:{BUILTIN_PDF:{status:'AVAILABLE',engine:'PDF.JS'},OCR:{status:'NOT_INSTALLED',reason:'Optional OCR pack not installed.'}},documents,choices:{courses:[course],assignments:[assignment],papers,resources},selectedId:documents[0].id,context:{document:documents[0],extraction:{status:'READY',warnings:[]},pages:[{pageNumber:1,text:'SYNTHETIC PORTFOLIO BRIEF\\n\\nSubmit three separately identified parts. Preserve evidence provenance and review the marking criteria before final submission.'}],chunks:[{id:'stud_chunk_v270_public',pageStart:1,chunkType:'PARAGRAPH',content:'Synthetic extracted requirement text with page-level provenance. No private student material is present.'}],references:[{referenceType:'INSTITUTIONAL_GUIDANCE',value:'Synthetic academic referencing guidance',pageNumber:12}],sections:[{title:'Assessment requirements',pageStart:1}]},listQuery:'',listLimit:40,importExpanded:false,busy:false,error:null};
    const capabilities={SITE_INFO:'SUPPORTED',COURSES:'SUPPORTED',COURSE_CONTENT:'SUPPORTED',ASSIGNMENTS:'SUPPORTED',ASSIGNMENT_STATUS:'SUPPORTED',RESOURCES:'SUPPORTED',CALENDAR:'SUPPORTED',GRADES:'SUPPORTED',FEEDBACK:'SUPPORTED',COMPLETION:'SUPPORTED',FORUM_READ:'SUPPORTED',ANNOUNCEMENTS:'SUPPORTED',NOTIFICATIONS:'UNKNOWN',QUIZZES:'UNKNOWN',PARTICIPANTS:'UNKNOWN',FILES:'SUPPORTED',ASSIGNMENT_WRITE:'POLICY_DISABLED',FORUM_WRITE:'POLICY_DISABLED',MESSAGE_WRITE:'POLICY_DISABLED',QUIZ_WRITE:'POLICY_DISABLED'};
    cc.moodle.state={...cc.moodle.state,provider:{id:'stud_moodle_public',displayName:'Synthetic University Moodle',baseUrl:'https://moodle.synthetic.example',status:'READY',tokenConfigured:true,browserSessionConfigured:false,secureStorageAvailable:true,lastSuccessfulSync:now,lastAttempt:now,lastErrorCode:null,capabilities,sync:{automaticSync:false,intervalMinutes:360,nextSyncAt:null,lastResult:{status:'SUCCESS',changes:{courses:1,assignments:1,resources:5,files:3}}}},probe:{webServices:'AVAILABLE',rest:'AVAILABLE'},busy:false,error:'',showSettings:false,indexing:false};
    const view=${JSON.stringify(targetMode)}==='home'?'OVERVIEW':${JSON.stringify(targetMode)}==='course'?'MODULES':${JSON.stringify(targetMode)}==='document'?'DOCUMENTS':${JSON.stringify(targetMode)}==='moodle'?'MOODLE':'ASSIGNMENTS';cc.setActiveView(view);return true})()`;
}

(async () => {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        const system = appearance.startsWith("system-") ? appearance.slice(7) : null;
        if (system) await command(socket, "Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: system}]});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(system || appearance)};true`);
        await evaluate(socket, fixture(mode));
        const sections = {roadmap:'.stud-assignment-roadmap',brief:'.stud-assignment-brief-preview',requirements:'.stud-assignment-requirements',evidence:'.stud-evidence-matrix',resources:'.stud-assignment-resources',research:'.stud-assignment-research'};
        if (sections[mode]) await evaluate(socket, `document.querySelector(${JSON.stringify(sections[mode])})?.scrollIntoView({block:'start'});true`);
        await delay(350);
        const report = await evaluate(socket, `(()=>{const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck'),main=deck?.querySelector('[data-stud-main]');if(!deck||!main)return{available:false};const rect=e=>e.getBoundingClientRect(),bounds=rect(main),controls=[...main.querySelectorAll('button,input,textarea,select')].filter(e=>!e.disabled&&rect(e).width>1&&rect(e).height>1),escaped=controls.filter(e=>{const a=rect(e);return a.left<bounds.left-4||a.right>bounds.right+4});return{available:true,mode:${JSON.stringify(mode)},controls:controls.length,escaped:escaped.length,horizontalOverflow:main.scrollWidth>main.clientWidth+4,assignment:!!main.querySelector('.stud-assignment-detail-panel'),roadmap:!!main.querySelector('.stud-assignment-roadmap'),brief:!!main.querySelector('.stud-assignment-brief-preview'),requirements:!!main.querySelector('.stud-assignment-requirements'),evidence:!!main.querySelector('.stud-evidence-matrix')}})()`);
        const valid = report.available && !report.escaped && !report.horizontalOverflow && (["home","course","document","moodle"].includes(mode) || report.assignment && report.roadmap && report.brief && report.requirements && report.evidence);
        console.log(`STUD_V270_LIVE_LAYOUT: ${valid ? "OK" : "FAIL"} ${JSON.stringify(report)}`);
        if (screenshotPath) {
            const clip = await evaluate(socket, `(()=>{const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck'),r=deck.getBoundingClientRect();return{x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(innerWidth-r.left,r.width),height:Math.min(innerHeight-r.top,r.height),scale:1}})()`);
            const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false, clip});
            fs.mkdirSync(require("path").dirname(screenshotPath), {recursive: true});
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`STUD_V270_SCREENSHOT: ${screenshotPath}`);
        }
        if (!valid) process.exitCode = 1;
    } finally { socket.close(); }
})().catch(error => { console.error(`STUD_V270_LIVE_LAYOUT: FAIL ${error.message}`); process.exitCode = 1; });
