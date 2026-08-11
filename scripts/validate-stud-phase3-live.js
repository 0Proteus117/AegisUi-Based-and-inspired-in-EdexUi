#!/usr/bin/env node
"use strict";

const fs = require("fs");
const port = Number(process.argv[2] || 9263);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const scenario = String(process.argv[8] || "search").toLowerCase();
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
    return `(async()=>{const manager=window.workspaceManager;manager.activate('student',false);await new Promise(r=>setTimeout(r,180));const cc=manager.studCommandCenter;const now='2026-08-11T12:00:00.000Z';const doi='10.5555/aegis.synthetic.phase3';
        const course={id:'stud_course_phase3_visual',title:'Synthetic Research Methods and Mechanical Systems',code:'SYN-303',description:'Public-safe in-memory validation module.',status:'ACTIVE',createdAt:now,updatedAt:now};
        const assignment={id:'stud_assignment_phase3_visual',courseId:course.id,title:'Evidence-based literature review for an explicitly bounded engineering question',description:'Synthetic assignment used only for Phase 3 visual validation.',status:'IN_PROGRESS',submissionStatus:'UNKNOWN',priority:'HIGH',priorityPresentation:'HIGH',localProgress:58,dueDate:'2026-09-15T14:00:00.000Z',createdAt:now,updatedAt:now};
        const paper={id:'stud_research_paper_phase3_visual',title:'A deliberately long but bounded synthetic paper title for responsive academic research validation',objectType:'ARTICLE',year:2026,publishedDate:'2026-08-11',abstract:'This synthetic abstract verifies readable wrapping, provenance hierarchy, local citation output and assignment relationships without exposing real student work.',venue:'Journal of Synthetic Engineering Validation',publisher:'Public Validation Press',authors:'Ada Example; Grace Sample; Alan Demonstration; Katherine Synthetic',doi,sourceUrl:'https://example.org/research/synthetic',citationJson:'{}',oaJson:JSON.stringify({provider:'UNPAYWALL',doi,isOpenAccess:true,oaStatus:'GOLD',bestLocation:{hostType:'publisher',version:'publishedVersion',license:'cc-by'}}),localDocumentReference:null,documentMetadataJson:null,createdAt:now,updatedAt:now};
        const document={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Literature synthesis'}]},{type:'paragraph',content:[{type:'text',text:'The canonical paper remains linked by ID; this note stores structured local content.'}]},{type:'blockMath',attrs:{latex:'P = \\\\tau \\\\omega'}},{type:'blockquote',content:[{type:'paragraph',content:[{type:'text',text:'Bounded quoted context, clearly distinct from student analysis.'}]}]}]};
        const note={id:'stud_note_phase3_visual',title:'Structured note · equations and evidence',content:'Literature synthesis. The canonical paper remains linked by ID; this note stores structured local content.',courseId:course.id,assignmentId:assignment.id,documentVersion:1,documentJson:JSON.stringify(document),createdAt:now,updatedAt:now};
        const provenance=[{field:'title',observedValue:paper.title,sourceType:'RESEARCH_PROVIDER',sourceId:'CROSSREF',sourceAuthority:'TRUSTED',observedAt:now},{field:'authors',observedValue:paper.authors,sourceType:'RESEARCH_PROVIDER',sourceId:'OPENALEX',sourceAuthority:'CORROBORATING',observedAt:now}];
        const relationship={id:'stud_relation_phase3_visual',fromType:'ASSIGNMENT',fromId:assignment.id,relationType:'HAS_PAPER',toType:'RESEARCH_PAPER',toId:paper.id,source:'USER',createdAt:now};
        cc.state.schema={version:3};cc.state.error=null;cc.state.courses=[course];cc.state.assignments=[assignment];cc.state.selectedCourseId=course.id;cc.state.selectedAssignmentId=assignment.id;cc.state.overview={today:[],upcoming:[assignment],priority:[assignment],continue:[note,paper],moduleStatus:[{...course,activeAssignmentCount:1,nearestDueDate:assignment.dueDate}],generatedAt:now};cc.state.courseContext={course,assignments:[assignment],resources:[],notes:[note],papers:[paper],references:[],provenance:[]};cc.state.assignmentContext={assignment,provenance:[],relationships:[relationship],references:[],resources:[]};
        cc.research.state.library=[paper];cc.research.state.notes=[note];cc.research.state.selectedPaperId=paper.id;cc.research.state.paperContext={paper,provenance};cc.research.state.selectedNoteId=note.id;cc.research.state.oa=null;cc.research.state.oaPdfToken=null;
        const work={provider:'OPENALEX',providerRecordId:'https://openalex.org/W123456',objectType:'ARTICLE',title:'Synthetic discovery result with a long title that remains inside normal responsive flow',authors:[{displayName:'Ada Example'},{displayName:'Grace Sample'}],year:2026,publishedDate:'2026-08-11',venue:'Synthetic Open Research Journal',publisher:'Validation Publisher',abstract:'An ephemeral bounded result. It is visible but not persisted until the analyst explicitly saves it.',doi:'10.5555/discovery.synthetic',openAlexId:'W123456',sourceUrl:'https://example.org/discovery',citationCount:12,referencesCount:20,identifiers:{doi:'10.5555/discovery.synthetic'},oa:{isOpenAccess:true,status:'gold'},observedAt:now};cc.research.state.results=[{token:'synthetic_ephemeral_token',work}];cc.research.state.selectedResult=cc.research.state.results[0];
        return {courseId:course.id,assignmentId:assignment.id,paperId:paper.id,noteId:note.id};})()`;
}

async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(appearance)}==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):${JSON.stringify(appearance)};true`);
        const ids = await evaluate(socket, fixture());
        const scenarios = {
            search: `cc.research.state.tab='SEARCH';cc.setActiveView('RESEARCH')`,
            library: `cc.research.state.tab='LIBRARY';cc.research.state.selectedPaperId='${ids.paperId}';cc.setActiveView('RESEARCH')`,
            oa: `cc.research.state.tab='LIBRARY';cc.research.state.selectedPaperId='${ids.paperId}';cc.setActiveView('RESEARCH')`,
            notes: `cc.research.state.selectedNoteId='${ids.noteId}';cc.setActiveView('NOTES')`,
            assignment: `cc.state.selectedAssignmentId='${ids.assignmentId}';cc.state.activeView='ASSIGNMENTS';cc.render()`,
            citations: `cc.research.state.tab='CITATIONS';cc.research.state.citationPaperIds=['${ids.paperId}'];cc.research.state.citationOutput={style:'harvard1',bibliography:'Example, A., Sample, G., Demonstration, A. and Synthetic, K. (2026) A deliberately long but bounded synthetic paper title for responsive academic research validation. Journal of Synthetic Engineering Validation. doi:10.5555/aegis.synthetic.phase3.',bibtex:'@article{example2026, title={Synthetic validation}, doi={10.5555/aegis.synthetic.phase3}}',cslJson:'[{"id":"stud_research_paper_phase3_visual"}]'};cc.setActiveView('RESEARCH')`,
            services: `cc.research.state.zotero.state='UNAVAILABLE';cc.setActiveView('SERVICES')`,
            compact: `cc.research.state.tab='SEARCH';cc.setActiveView('RESEARCH')`
        };
        await evaluate(socket, `(async()=>{const cc=window.workspaceManager.studCommandCenter;${scenarios[scenario] || scenarios.search};return true})()`);
        await delay(scenario === "notes" ? 900 : 350);
        const report = await evaluate(socket, `(()=>{const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck');if(!deck)return{available:false};const root=deck.querySelector('[data-stud-main]');const rect=e=>e.getBoundingClientRect();const controls=[...root.querySelectorAll('button,input,textarea,select,[contenteditable=true]')].filter(e=>!e.disabled);const escaped=controls.filter(e=>{const panel=e.closest('.workspace-panel')||root;const a=rect(e),b=rect(panel);return a.left<b.left-3||a.right>b.right+3});return{available:true,active:deck.querySelector('.stud-command-nav .active')?.textContent||'',controls:controls.length,escapedControls:escaped.length,horizontalOverflow:root.scrollWidth>root.clientWidth+4,appearance:document.documentElement.dataset.aegisAppearance,scenario:${JSON.stringify(scenario)}}})()`);
        console.log(`STUD_PHASE3_LIVE_AVAILABLE: ${report.available ? "OK" : "FAIL"}`);
        console.log(`STUD_PHASE3_LIVE_LAYOUT: ${report.escapedControls === 0 && !report.horizontalOverflow ? "OK" : "FAIL"} ${JSON.stringify(report)}`);
        if (screenshotPath) { const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false}); fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64")); console.log(`STUD_PHASE3_LIVE_SCREENSHOT: ${screenshotPath}`); }
        if (!report.available || report.escapedControls || report.horizontalOverflow) process.exitCode = 1;
    } finally { socket.close(); }
}
main().catch(error => { console.error(`STUD_PHASE3_LIVE: FAIL ${error.message}`); process.exitCode = 1; });
