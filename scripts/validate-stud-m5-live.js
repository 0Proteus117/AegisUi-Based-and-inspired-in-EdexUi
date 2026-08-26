#!/usr/bin/env node
"use strict";

// Synthetic-only live renderer fixture for M5. It never uses the academic
// store, Moodle, a provider, a model, a filesystem picker or private data.
const fs = require("fs");
const path = require("path");
const port = Number(process.argv[2] || 9241);
const screenshotPath = String(process.argv[3] || "");
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const mode = String(process.argv[8] || "source").toLowerCase();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data); const pending = socket.pending.get(message.id); if (!pending) return;
        socket.pending.delete(message.id);
        if (message.error || message.result?.exceptionDetails) pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        else pending.resolve(pending.raw ? message.result : message.result?.result?.value);
    });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }

function fixture(variant) {
    return `(async()=>{
        const manager=window.workspaceManager; const activation=manager.activate('student',false); if(activation&&typeof activation.then==='function') await activation.catch(()=>{}); for(let attempt=0;attempt<30&&(!manager.studCommandCenter||!manager.studCommandCenter.state.schema);attempt+=1) await new Promise(resolve=>setTimeout(resolve,100)); await new Promise(resolve=>setTimeout(resolve,350));
        const cc=manager.studCommandCenter, now='2026-08-26T12:00:00.000Z', variant=${JSON.stringify(variant)};
        const course={id:'stud_m5_course',title:'Synthetic interdisciplinary evidence practice',code:'SYN-5205',academicYear:'2025/26',academicTerm:'Term 2',status:'ACTIVE',updatedAt:now};
        const assignment={id:'stud_m5_assignment',courseId:course.id,title:variant==='long'?'Synthetic assessment with a deliberately long title to validate calm wrapping across the compact Assignment Workspace':'Synthetic comparative evidence portfolio',description:'Public-safe M5 validation fixture.',dueDate:'2026-11-14T14:00:00.000Z',status:'IN_PROGRESS',weight:50,updatedAt:now};
        const document={id:'stud_m5_document',courseId:course.id,assignmentId:assignment.id,title:'Assessment Brief and Marking Criteria',documentType:'COURSE_MATERIAL',displayName:'Synthetic-Assessment-Brief.pdf',managedReference:'academic_documents/synthetic.pdf',pageCount:12,extractionStatus:'READY',updatedAt:now};
        const note={id:'stud_m5_note',courseId:course.id,assignmentId:assignment.id,title:'Working interpretation',content:'Synthetic local note retained only for visual validation.'};
        const paper={id:'stud_m5_paper',title:'Synthetic source for multidisciplinary assessment design',authors:'A. Example; B. Example',year:'2025',doi:'10.5555/synthetic.2025.1',venue:'Synthetic Review'};
        const resource={id:'stud_m5_resource',courseId:course.id,title:'Course reading pack',type:'DOCUMENT',localReference:null};
        const nodes=[
          {id:'stud_m5_stage_review',title:'Review the brief',semanticType:'REVIEW',state:'COMPLETE',availability:'AVAILABLE',displayState:'COMPLETE',directBlockers:[],gateCheckpoints:[],impactSources:[],predecessorIds:[],successorIds:['stud_m5_stage_data','stud_m5_stage_research'],rowVersion:1},
          {id:'stud_m5_stage_data',title:'Obtain the required team data',semanticType:'EXTERNAL_TASK',state:'NOT_STARTED',availability:variant==='clear'?'AVAILABLE':'DIRECT_BLOCKER',displayState:variant==='clear'?'READY':'NOT_STARTED',directBlockers:variant==='clear'?[]:[{id:'stud_m5_blocker'}],gateCheckpoints:[],impactSources:[],predecessorIds:['stud_m5_stage_review'],successorIds:['stud_m5_stage_draft'],rowVersion:1},
          {id:'stud_m5_stage_research',title:'Research independent sources',semanticType:'RESEARCH',state:'NOT_STARTED',availability:'AVAILABLE',displayState:'READY',directBlockers:[],gateCheckpoints:[],impactSources:[],predecessorIds:['stud_m5_stage_review'],successorIds:['stud_m5_stage_draft'],rowVersion:1},
          {id:'stud_m5_stage_draft',title:'Prepare the portfolio',semanticType:'WRITING',state:'NOT_STARTED',availability:'DEPENDENCY_WAIT',displayState:'DEPENDENCIES_PENDING',directBlockers:[],gateCheckpoints:[],impactSources:[{kind:'BLOCKER',id:'stud_m5_blocker',title:'Awaiting agreed team data',nodeId:'stud_m5_stage_data'}],predecessorIds:['stud_m5_stage_data','stud_m5_stage_research'],successorIds:[],rowVersion:1}
        ];
        const contract={id:'stud_m5_contract',assignmentId:assignment.id,revision:2,lifecycle:'APPROVED',completeness:'INCOMPLETE',freshness:{reviewCondition:variant==='drift'?'SOURCE_CHANGED':'CURRENT',details:[]},candidates:[],items:[{id:'stud_m5_requirement_a',label:'Word count',resolutionState:'RESOLVED',sources:[]},{id:'stud_m5_requirement_b',label:'Team allocation',resolutionState:'UNRESOLVED',sources:[]}]};
        const workflow={id:'stud_m5_workflow',assignmentId:assignment.id,rowVersion:3,graph:{nodes,edges:[],summary:{total:4,complete:1,ready:1,blocked:variant==='clear'?0:1,openBlockers:variant==='clear'?0:1,pendingCheckpoints:0}},conditions:{blockers:variant==='clear'?[]:[{id:'stud_m5_blocker',nodeId:'stud_m5_stage_data',status:'OPEN',title:'Awaiting agreed team data',requiredInput:'Team geometry and measured values',owner:'Project group',impactSources:[]}],checkpoints:[]},template:{title:'Synthetic project workflow'},lifecycle:'ACTIVE',contractRevision:2,integrity:{contractRelation:'CURRENT_APPROVED_REVISION',contractSnapshotMatches:true,sourceReviewCondition:contract.freshness.reviewCondition},history:[]};
        const noContract=variant==='no-contract', contractState={assignmentId:assignment.id,current:noContract?null:contract,draft:null,history:noContract?[]:[contract]};
        const workflowState={assignmentId:assignment.id,current:noContract?null:workflow,history:[],setup:{templates:[],suggestions:[]},contractState};
        const assignmentContext={course,assignment,documents:[document],resources:[],notes:[note],papers:[paper],computeResults:[],notebooks:[],datasets:[],repositories:[],revisions:[],relationships:[],references:[],links:[],provenance:[],conflicts:[],status:'PARTIAL',requirementsContract:contractState,workflowState};
        cc.state.schema={version:18}; cc.state.error=null; cc.state.courses=[course]; cc.state.assignments=[assignment]; cc.state.classifications=new Map([[assignment.id,{assignmentId:assignment.id,label:'COURSEWORK'}]]); cc.state.organisation={years:[],unassignedAssignments:[]};
        cc.state.selectedCourseId=course.id; cc.state.selectedAssignmentId=assignment.id; cc.state.courseContext={course,assignments:[assignment],documents:[document],resources:[resource],notes:[note],papers:[],computeResults:[],notebooks:[],datasets:[],repositories:[],revisions:[],references:[],provenance:[]}; cc.state.assignmentContext=assignmentContext;
        cc.state.workingContext={status:'READY',activeCourse:course,activeAssignment:assignment,activeRequirementContract:noContract?null:contract,activeObject:variant==='empty'?null:{...document,entityType:'ACADEMIC_DOCUMENT'},activeWorkflow:noContract?null:{id:workflow.id,assignmentId:assignment.id,rowVersion:3},activeWorkflowNode:noContract?null:{id:'stud_m5_stage_data',workflowId:workflow.id,title:'Obtain the required team data',semanticType:'EXTERNAL_TASK',state:'NOT_STARTED',rowVersion:1},originSurface:'ASSIGNMENT_WORKSPACE',userPinned:false,updatedAt:now};
        cc.requirements.setState(assignment,contractState); cc.workflow.setState(assignment,workflowState); if(!noContract) cc.workflow.state.selectedNodeId='stud_m5_stage_data'; cc.assignmentWorkspace.setState(assignmentContext,cc.state.workingContext,cc.state.courseContext);
        if(variant!=='empty') cc.assignmentWorkspace.state.preview={type:'ACADEMIC_DOCUMENT',id:document.id,page:3,data:{document,pages:[{pageNumber:3,text:'Synthetic source excerpt for visible page-level provenance and a deliberately longer requirement description that must remain contained.',contentHash:'a'.repeat(64)}],chunks:[{id:'stud_m5_chunk',pageStart:3,chunkType:'TEXT',content:'Synthetic bounded chunk used to verify source note actions and readable document flow.'}]}};
        cc.assignmentWorkspace.state.materialsOpen=variant==='materials'; cc.assignmentWorkspace.state.noteComposer=variant==='notes'; cc.state.activeView='ASSIGNMENTS'; cc.state.navGroup='WORK'; cc.render(); return true;
    })()`;
}

(async () => {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        const system = appearance.startsWith("system-") ? appearance.slice(7) : null;
        if (system) await command(socket, "Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: system}]});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(system || appearance)};true`);
        const fixtureSource = JSON.stringify(fixture(mode));
        const fixtureResult = await evaluate(socket, `(async()=>{try{return {ok:true,value:await (new Function(${fixtureSource}))()};}catch(error){return {ok:false,message:error.message,stack:error.stack};}})()`);
        if (!fixtureResult || !fixtureResult.ok) throw new Error(`Synthetic fixture failed: ${fixtureResult && fixtureResult.message || "unknown"}\n${fixtureResult && fixtureResult.stack || ""}`);
        await delay(400);
        const reportSource = `const commandCenter=window.workspaceManager&&window.workspaceManager.studCommandCenter; const root=commandCenter&&commandCenter.view&&commandCenter.view.querySelector('[data-stud-main]'); if(!root) return {mode:${JSON.stringify(mode)},error:'STUD root unavailable',activeView:commandCenter&&commandCenter.state.activeView,mainCount:document.querySelectorAll('[data-stud-main]').length}; const workspace=root.querySelector('.stud-assignment-workspace'); const preview=root.querySelector('.stud-assignment-workspace-preview'); const notes=root.querySelector('.stud-assignment-workspace-notes'); const bounds=root.getBoundingClientRect(); const controls=[...root.querySelectorAll('button,input,textarea,select,summary')].filter(element=>{const rect=element.getBoundingClientRect(); return rect.width>1&&rect.height>1;}); const escaped=controls.filter(element=>{const rect=element.getBoundingClientRect(); return rect.left<bounds.left-3||rect.right>bounds.right+3;}); const text=root.textContent||''; return {mode:${JSON.stringify(mode)},activeView:commandCenter.state.activeView,navGroup:commandCenter.state.navGroup,mainCount:document.querySelectorAll('[data-stud-main]').length,htmlPrefix:root.innerHTML.slice(0,160),workspace:!!workspace,preview:!!preview,notes:!!notes,blocked:text.includes('THIS STAGE IS BLOCKED'),source:text.includes('LOCAL EXTRACTION · PAGE 3'),unavailable:text.includes('PREVIEW NOT AVAILABLE'),overflow:root.scrollWidth>root.clientWidth+4,escaped:escaped.map(element=>(element.textContent||element.name||element.tagName).trim().slice(0,80)),capture:{x:Math.max(0,bounds.left),y:Math.max(0,bounds.top),width:Math.min(innerWidth-bounds.left,bounds.width),height:Math.min(innerHeight-bounds.top,bounds.height),scale:1}};`;
        const report = await evaluate(socket, `(new Function(${JSON.stringify(reportSource)}))()`);
        const expectedSource = !["empty", "no-contract"].includes(mode);
        const valid = report.workspace && report.preview && report.notes && !report.overflow && !report.escaped.length && (expectedSource ? report.source : report.unavailable || true);
        console.log(`STUD_M5_LIVE_LAYOUT: ${valid ? "OK" : "FAIL"} ${JSON.stringify(report)}`);
        if (screenshotPath) { const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false, clip: report.capture}); fs.mkdirSync(path.dirname(screenshotPath), {recursive: true}); fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64")); console.log(`STUD_M5_SCREENSHOT: ${screenshotPath}`); }
        if (!valid) process.exitCode = 1;
    } finally { socket.close(); }
})().catch(error => { console.error(`STUD_M5_LIVE_LAYOUT: FAIL ${error.message}`); process.exitCode = 1; });
