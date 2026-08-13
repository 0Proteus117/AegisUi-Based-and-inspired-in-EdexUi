#!/usr/bin/env node
"use strict";

// Sanitized renderer/layout validation for the local Academic Intelligence
// workspace. The fixture stays in renderer memory and does not call IPC,
// providers, a model or local academic storage.
const fs = require("fs");
const port = Number(process.argv[2] || 9269);
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
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.seq = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => { const message = JSON.parse(event.data); const pending = socket.pending.get(message.id); if (!pending) return; socket.pending.delete(message.id); if (message.error || message.result?.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); pending.resolve(pending.raw ? message.result : message.result?.result?.value); });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.seq; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.seq; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }
function fixture() { return `(async()=>{
    const manager=window.workspaceManager;manager.activate('student',false);await new Promise(resolve=>setTimeout(resolve,240));
    const cc=manager.studCommandCenter,now='2026-08-13T12:00:00.000Z';
    const course={entityType:'COURSE',id:'stud_course_phase9',title:'Synthetic Systems Engineering and Bounded Academic Context',code:'SYN-901',status:'ACTIVE',createdAt:now,updatedAt:now};
    const assignment={entityType:'ASSIGNMENT',id:'stud_assignment_phase9',courseId:course.id,title:'Synthetic long assignment brief for stability, thermal response, source support and contextual evidence',description:'Synthetic public-safe text with deliberately long local context terminology for bounded visual validation.',status:'IN_PROGRESS',createdAt:now,updatedAt:now};
    const document={entityType:'ACADEMIC_DOCUMENT',id:'stud_document_phase9',courseId:course.id,assignmentId:assignment.id,title:'Synthetic lecture material with a deliberately long local document title that must wrap safely',documentType:'COURSE_MATERIAL',createdAt:now,updatedAt:now};
    const note={entityType:'NOTE',id:'stud_note_phase9',courseId:course.id,assignmentId:assignment.id,title:'Synthetic note lacking an explicit local source link',content:'Synthetic note content',createdAt:now,updatedAt:now};
    const resource={entityType:'RESOURCE',id:'stud_resource_phase9',courseId:course.id,assignmentId:assignment.id,title:'Synthetic bounded resource',type:'DOCUMENT',createdAt:now,updatedAt:now};
    const candidate=(entity,status,reasons,extra={})=>({entityType:entity.entityType,entityId:entity.id,title:entity.title,relationStatus:status,reasons,metadata:{},entity,decision:null,decisionReason:null,conflicts:[],...extra});
    cc.state.schema={version:10};cc.state.error=null;cc.state.courses=[course];cc.state.assignments=[assignment];
    cc.knowledge.state={...cc.knowledge.state,choices:{ASSIGNMENT:[assignment],COURSE:[course],RESEARCH_PAPER:[],ACADEMIC_DOCUMENT:[document],NOTE:[note],REVISION_ITEM:[]},rootType:'ASSIGNMENT',rootId:assignment.id,busy:false,error:null,searchQuery:'stability',searchResults:[{entityType:'ACADEMIC_DOCUMENT',entityId:document.id,title:document.title,relationshipToContext:'DIRECT',relevanceReason:['Explicit assignment relationship','Matching indexed terminology: stability, response']}],packages:[{title:'Synthetic Academic Context Package',status:'TRUNCATED',created_at:now}],context:{root:assignment,rootType:'ASSIGNMENT',status:'TRUNCATED',generatedAt:now,omitted:[{reason:'PACKAGE_TEXT_LIMIT'}],candidates:[candidate(assignment,'DIRECT',['Selected academic context root']),candidate(document,'DIRECT',['Explicit HAS DOCUMENT relationship','4 matching concepts']),candidate(resource,'DERIVED',['Assigned to selected Assignment']),candidate(note,'SUGGESTED',['Matching indexed terminology: stability, thermal'],{conflicts:[{field:'sourceSupport',values:['SOURCE_LINKED','UNSUPPORTED_LOCAL']}]} )],concepts:[{term:'stability',observationCount:4,provenance:{entityType:'ACADEMIC_DOCUMENT',entityId:document.id,pageStart:1,chunkId:'synthetic_chunk_1'}},{term:'thermal response',observationCount:3,provenance:{entityType:'ACADEMIC_DOCUMENT',entityId:document.id,pageStart:2,chunkId:'synthetic_chunk_2'}},{term:'source support',observationCount:2,provenance:{entityType:'NOTE',entityId:note.id,pageStart:null,chunkId:null}}],coverage:{status:'PARTIAL',message:'3 of 5 assignment concepts have local contextual support.',concepts:[{term:'stability',coverage:'SUPPORTED',reasons:['Present in locally indexed academic context']},{term:'thermal response',coverage:'SUPPORTED',reasons:['Present in locally indexed academic context']},{term:'boundary condition',coverage:'UNRESOLVED',reasons:['No supporting local concept observation found']}],sourceSupport:[{noteId:note.id,title:note.title,status:'UNSUPPORTED_LOCAL',meaning:'No supporting source relationship is available in local STUD data; this does not mean the note is false.'}]},graph:{nodes:[{id:'ASSIGNMENT:'+assignment.id,entityType:'ASSIGNMENT',entityId:assignment.id,label:assignment.title},{id:'ACADEMIC_DOCUMENT:'+document.id,entityType:'ACADEMIC_DOCUMENT',entityId:document.id,label:document.title},{id:'RESOURCE:'+resource.id,entityType:'RESOURCE',entityId:resource.id,label:resource.title},{id:'NOTE:'+note.id,entityType:'NOTE',entityId:note.id,label:note.title}],edges:[{id:'edge1',from:'ASSIGNMENT:'+assignment.id,to:'ACADEMIC_DOCUMENT:'+document.id,type:'HAS_DOCUMENT',status:'DIRECT'},{id:'edge2',from:'ASSIGNMENT:'+assignment.id,to:'NOTE:'+note.id,type:'CONTEXT_MATCH',status:'SUGGESTED'}],truncated:false},policy:{offline:true,providersInvoked:false,llmInvoked:false,automaticPersistence:false}}};
    cc.setActiveView('KNOWLEDGE');return true;
})()`; }
async function main() {
    const socket = await connect();
    try {
        await command(socket,"Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
        const system=appearance.startsWith("system-")?appearance.slice(7):null;if(system)await command(socket,"Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:system}]});
        await evaluate(socket,`document.documentElement.dataset.aegisAppearance=${JSON.stringify(system||appearance)};true`);await evaluate(socket,fixture());await delay(450);
        const report=await evaluate(socket,`(()=>{const root=document.querySelector('[data-stud-main]'),rect=e=>e.getBoundingClientRect(),panels=[...root.querySelectorAll('.workspace-panel')],controls=[...root.querySelectorAll('button,input,textarea,select')].filter(e=>!e.disabled),escaped=controls.filter(e=>{const p=e.closest('.workspace-panel')||root,a=rect(e),b=rect(p);return a.left<b.left-3||a.right>b.right+3||a.top<b.top-3||a.bottom>b.bottom+3;});const overlaps=[];for(let i=0;i<panels.length;i+=1)for(let j=i+1;j<panels.length;j+=1){const a=rect(panels[i]),b=rect(panels[j]);if(a.right>b.left+5&&b.right>a.left+5&&a.bottom>b.top+5&&b.bottom>a.top+5)overlaps.push([i,j]);}return{available:!!root,knowledge:!!root.querySelector('.stud-knowledge-workspace'),escaped:escaped.length,overflow:root.scrollWidth>root.clientWidth+4,overlaps:overlaps.length,panels:panels.length,graph:!!root.querySelector('.stud-knowledge-graph'),coverage:!!root.querySelector('.stud-knowledge-coverage')};})()`);
        const valid=report.available&&report.knowledge&&report.graph&&report.coverage&&!report.escaped&&!report.overflow&&!report.overlaps;console.log(`STUD_PHASE9_LIVE_LAYOUT: ${valid?'OK':'FAIL'} ${JSON.stringify(report)}`);
        if(screenshotPath){await evaluate(socket,`(()=>{const mask=document.createElement('div');mask.textContent='aegis@synthetic-validation AegisUi %';Object.assign(mask.style,{position:'fixed',zIndex:'2147483647',left:'17.5vw',right:'1.1vw',top:'5.25vh',height:'4.55vh',display:'grid',alignItems:'center',padding:'0 .55vw',boxSizing:'border-box',border:'1px solid #12679b',background:'#050a0f',color:'#9ecfc8',fontFamily:'monospace',fontSize:'1.2vw'});document.body.append(mask)})()`);const capture=await command(socket,'Page.captureScreenshot',{format:'png'});fs.writeFileSync(screenshotPath,Buffer.from(capture.data,'base64'));console.log(`STUD_PHASE9_SCREENSHOT: ${screenshotPath}`);}
        if(!valid)process.exitCode=1;
    } finally {socket.close();}
}
main().catch(error=>{console.error(`STUD_PHASE9_LIVE_LAYOUT: FAIL ${error.message}`);process.exitCode=1;});
