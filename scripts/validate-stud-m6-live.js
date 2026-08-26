#!/usr/bin/env node
"use strict";

// Synthetic-only live Electron visual fixture for M6. It never reads Moodle,
// the user's academic store, private files, provider state or credentials.
const fs = require("fs");
const path = require("path");
const port = Number(process.argv[2] || 9246);
const screenshotPath = String(process.argv[3] || "");
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const scenario = String(process.argv[8] || "resting").toLowerCase();
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
        const manager=window.workspaceManager; const activation=manager.activate('student',false); if(activation&&typeof activation.then==='function') await activation.catch(()=>{}); for(let attempt=0;attempt<80&&(!manager.studCommandCenter||!manager.studCommandCenter.state.schema||!manager.studCommandCenter.state.overview||!manager.studCommandCenter.state.organisation);attempt+=1) await new Promise(resolve=>setTimeout(resolve,100)); await new Promise(resolve=>setTimeout(resolve,150));
        const cc=manager.studCommandCenter, variant=${JSON.stringify(variant)}, now='2026-08-26T12:00:00.000Z';
        const generic=variant==='generic', course={id:'stud_m6_course',title:generic?'Independent interdisciplinary study':'Synthetic sustainable systems design',code:generic?null:'SYN-6006',academicYear:generic?null:'2025/26',academicTerm:generic?null:'Term 2',status:'ACTIVE',updatedAt:now};
        const assignment={id:'stud_m6_assignment',courseId:course.id,title:variant==='long'?'Synthetic multidisciplinary assessment with a deliberately long title that validates bounded operational hierarchy without clipping':'Synthetic evidence and design portfolio',description:'Public-safe M6 validation fixture.',dueDate:'2026-11-14T14:00:00.000Z',status:'IN_PROGRESS',weight:50,updatedAt:now};
        const document={id:'stud_m6_document',courseId:course.id,assignmentId:assignment.id,title:'Assessment brief and verified source pack',documentType:'COURSE_MATERIAL',displayName:'Synthetic-Brief.pdf',extractionStatus:'READY',updatedAt:now};
        const note={id:'stud_m6_note',courseId:course.id,assignmentId:assignment.id,title:'Evidence synthesis note',content:'Synthetic note.'};
        const dataset={id:'stud_m6_dataset',courseId:course.id,assignmentId:assignment.id,title:'Bounded laboratory dataset',format:'CSV'};
        const nodes=[
          {id:'stud_m6_review',title:'Review requirements',semanticType:'REVIEW',state:'COMPLETE',availability:'AVAILABLE',displayState:'COMPLETE',directBlockers:[],gateCheckpoints:[],impactSources:[]},
          {id:'stud_m6_research',title:'Acquire and inspect supporting material',semanticType:'RESEARCH',state:'IN_PROGRESS',availability:'AVAILABLE',displayState:'IN_PROGRESS',directBlockers:[],gateCheckpoints:[],impactSources:[]},
          {id:'stud_m6_data',title:'Obtain team measurements',semanticType:'EXTERNAL_TASK',state:'NOT_STARTED',availability:variant==='blocker'?'DIRECT_BLOCKER':variant==='checkpoint'?'HUMAN_INPUT_REQUIRED':'AVAILABLE',displayState:variant==='blocker'?'NOT_STARTED':variant==='checkpoint'?'NOT_STARTED':'READY',directBlockers:variant==='blocker'?[{id:'stud_m6_blocker',title:'Awaiting team geometry dataset'}]:[],gateCheckpoints:variant==='checkpoint'?[{id:'stud_m6_checkpoint',title:'Confirm source selection'}]:[],impactSources:[]},
          {id:'stud_m6_draft',title:'Compose evidence-led submission',semanticType:'WRITING',state:'NOT_STARTED',availability:'DEPENDENCY_WAIT',displayState:'DEPENDENCIES_PENDING',directBlockers:[],gateCheckpoints:[],impactSources:[{title:'Obtain team measurements'}]}
        ];
        const workflow={id:'stud_m6_workflow',assignmentId:assignment.id,rowVersion:4,graph:{nodes,edges:[{fromNodeId:'stud_m6_review',toNodeId:'stud_m6_research'},{fromNodeId:'stud_m6_review',toNodeId:'stud_m6_data'},{fromNodeId:'stud_m6_research',toNodeId:'stud_m6_draft'},{fromNodeId:'stud_m6_data',toNodeId:'stud_m6_draft'}],summary:{total:4,complete:1,ready:1,blocked:variant==='blocker'?1:0,openBlockers:variant==='blocker'?1:0,pendingCheckpoints:variant==='checkpoint'?1:0}},conditions:{blockers:variant==='blocker'?[{id:'stud_m6_blocker',nodeId:'stud_m6_data',status:'OPEN',title:'Awaiting team geometry dataset'}]:[],checkpoints:variant==='checkpoint'?[{id:'stud_m6_checkpoint',nodeId:'stud_m6_data',status:'PENDING',title:'Confirm source selection'}]:[]},template:{title:'Synthetic branched workflow'},lifecycle:'ACTIVE',history:[]};
        const contract={id:'stud_m6_contract',assignmentId:assignment.id,revision:1,lifecycle:'APPROVED',completeness:'INCOMPLETE',freshness:{reviewCondition:'CURRENT'},candidates:[],items:[{id:'r1',label:'Evidence portfolio',resolutionState:'RESOLVED'}]};
        const artifacts=[
          {id:'artifact_document',assignmentId:assignment.id,workflowId:workflow.id,workflowNodeId:'stud_m6_research',canonicalObjectType:'ACADEMIC_DOCUMENT',canonicalObjectId:document.id,artifactType:'ACADEMIC_DOCUMENT',label:document.title,lifecycle:'ACTIVE',origin:'USER_IMPORTED',producer:'USER',availabilityState:'AVAILABLE',integrityHash:'a'.repeat(64),createdAt:'2026-08-26T11:48:00.000Z'},
          {id:'artifact_note',assignmentId:assignment.id,workflowId:workflow.id,workflowNodeId:'stud_m6_research',canonicalObjectType:'NOTE',canonicalObjectId:note.id,artifactType:'NOTE',label:note.title,lifecycle:'ACTIVE',origin:'USER_CREATED',producer:'USER',availabilityState:'AVAILABLE',integrityHash:null,createdAt:'2026-08-26T11:52:00.000Z'},
          {id:'artifact_data',assignmentId:assignment.id,workflowId:workflow.id,workflowNodeId:'stud_m6_data',canonicalObjectType:'DATASET',canonicalObjectId:dataset.id,artifactType:'DATASET',label:dataset.title,lifecycle:'ACTIVE',origin:'USER_IMPORTED',producer:'USER',availabilityState:'AVAILABLE',integrityHash:'b'.repeat(64),createdAt:'2026-08-26T11:56:00.000Z'}
        ];
        if(variant==='long') for(let index=0;index<14;index+=1) artifacts.push({...artifacts[index%3],id:'artifact_extra_'+index,label:'Synthetic artifact '+(index+1)+' with a bounded but deliberately descriptive label',artifactType:index%2?'RESEARCH_PAPER':'SOURCE_DOCUMENT',canonicalObjectId:(index%2?note:document).id,createdAt:'2026-08-26T11:'+(20+index)+':00.000Z'});
        const runState=variant==='failed'?'FAILED':variant==='completed'?'COMPLETED':'RUNNING', determinate=!['resting','indeterminate'].includes(variant), run={id:'stud_m6_run',assignmentId:assignment.id,workflowId:workflow.id,workflowNodeId:variant==='blocker'||variant==='checkpoint'?'stud_m6_data':'stud_m6_research',operationType:variant==='failed'?'DOCUMENT_EXTRACTION':'DOCUMENT_INDEX',state:runState,actor:'SYSTEM',progressMode:variant==='indeterminate'?'INDETERMINATE':determinate?'DETERMINATE':'NONE',progressCurrent:determinate?(runState==='COMPLETED'?42:17):null,progressTotal:determinate?42:null,progressUnit:determinate?'documents':null,statusSummary:runState==='FAILED'?'Extraction stopped safely after a malformed synthetic page':runState==='COMPLETED'?'Indexed 42 / 42 documents':'Indexing canonical documents',errorSummary:runState==='FAILED'?'Malformed page structure; no canonical data was changed.':null,canPause:false,canCancel:false,createdAt:'2026-08-26T11:40:00.000Z',startedAt:'2026-08-26T11:41:00.000Z',finishedAt:['FAILED','COMPLETED'].includes(runState)?'2026-08-26T11:59:00.000Z':null,rowVersion:3};
        const noRuns=variant==='resting'||variant==='artifacts'||variant==='empty'||variant==='generic', activeRuns=noRuns?[]:(['FAILED','COMPLETED'].includes(runState)?[]:[run]), recentRuns=noRuns?[]:[run];
        const events=noRuns?[]:[
          {id:'event_3',eventType:runState==='FAILED'?'OPERATION_FAILED':runState==='COMPLETED'?'OPERATION_COMPLETED':'DOCUMENT_INDEXED',severity:runState==='FAILED'?'ERROR':'INFO',summary:run.statusSummary,createdAt:'2026-08-26T11:59:00.000Z',artifactIds:['artifact_document','artifact_note']},
          {id:'event_2',eventType:'ARTIFACT_REGISTERED',severity:'NOTICE',summary:'Registered evidence synthesis note',createdAt:'2026-08-26T11:52:00.000Z',artifactIds:['artifact_note']},
          {id:'event_1',eventType:'OPERATION_STARTED',severity:'INFO',summary:'Started bounded document indexing',createdAt:'2026-08-26T11:41:00.000Z',artifactIds:[]}
        ];
        const mission={assignment,activeRuns,recentRuns,artifacts:variant==='empty'?[]:artifacts,workflow,resting:activeRuns.length===0};
        const contractState={assignmentId:assignment.id,current:contract,draft:null,history:[contract]}, workflowState={assignmentId:assignment.id,current:workflow,history:[],setup:{templates:[],suggestions:[]},contractState};
        const assignmentContext={course,assignment,documents:[document],resources:[],notes:[note],papers:[],computeResults:[],notebooks:[],datasets:[dataset],repositories:[],revisions:[],relationships:[],references:[],links:[],provenance:[],conflicts:[],status:'PARTIAL',requirementsContract:contractState,workflowState};
        cc.state.schema={version:19};cc.state.error=null;cc.state.courses=[course];cc.state.assignments=[assignment];cc.state.classifications=new Map([[assignment.id,{assignmentId:assignment.id,label:generic?'UNKNOWN':'COURSEWORK'}]]);cc.state.organisation={years:[],unassignedAssignments:[]};cc.state.selectedCourseId=course.id;cc.state.selectedAssignmentId=assignment.id;cc.state.courseContext={course,assignments:[assignment],documents:[document],resources:[],notes:[note],papers:[],computeResults:[],notebooks:[],datasets:[dataset],repositories:[],revisions:[],references:[],provenance:[]};cc.state.assignmentContext=assignmentContext;
        cc.state.workingContext={status:'READY',activeCourse:course,activeAssignment:assignment,activeRequirementContract:contract,activeObject:{...document,entityType:'ACADEMIC_DOCUMENT'},activeWorkflow:{id:workflow.id,assignmentId:assignment.id,rowVersion:4},activeWorkflowNode:{id:run.workflowNodeId,workflowId:workflow.id,title:nodes.find(item=>item.id===run.workflowNodeId).title,semanticType:'RESEARCH',state:'IN_PROGRESS',rowVersion:1},originSurface:'ASSIGNMENT_WORKSPACE',userPinned:false,updatedAt:now};
        cc.requirements.setState(assignment,contractState);cc.workflow.setState(assignment,workflowState);cc.workflow.state.selectedNodeId=run.workflowNodeId;cc.assignmentWorkspace.setState(assignmentContext,cc.state.workingContext,cc.state.courseContext);cc.assignmentWorkspace.state.mode=['artifacts','empty','generic','long'].includes(variant)?'ARTIFACTS':'MISSION';cc.assignmentWorkspace.operational.state.mode=cc.assignmentWorkspace.state.mode;cc.assignmentWorkspace.operational.state.mission=mission;cc.assignmentWorkspace.operational.state.events=events;cc.assignmentWorkspace.operational.state.runArtifacts=noRuns?[]:artifacts.filter(item=>['artifact_document','artifact_note'].includes(item.id));cc.assignmentWorkspace.operational.state.selectedRunId=run.id;cc.assignmentWorkspace.operational.state.selectedArtifactId=mission.artifacts[0]?.id||'';cc.assignmentWorkspace.operational.state.relationships=mission.artifacts.length>1?[{id:'relation_1',fromArtifactId:'artifact_note',toArtifactId:'artifact_document',relationshipType:'DERIVED_FROM'}]:[];
        cc.setActiveView('ASSIGNMENTS');return {activeView:cc.state.activeView,navGroup:cc.state.navGroup,selectedAssignmentId:cc.state.selectedAssignmentId,workspaceMode:cc.assignmentWorkspace.state.mode};
    })()`;
}

(async () => {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        const system = appearance.startsWith("system-") ? appearance.slice(7) : null;
        if (system) await command(socket, "Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: system}]});
        await evaluate(socket, `document.documentElement.dataset.aegisAppearance=${JSON.stringify(system || appearance)};true`);
        const source = JSON.stringify(fixture(scenario));
        const result = await evaluate(socket, `(async()=>{try{return {ok:true,value:await (new Function('return '+${source}))()};}catch(error){return {ok:false,message:error.message,stack:error.stack};}})()`);
        if (!result || !result.ok) throw new Error(`Synthetic fixture failed: ${result && result.message || "unknown"}\n${result && result.stack || ""}`);
        await delay(300);
        const report = await evaluate(socket, `(new Function(${JSON.stringify(`const cc=window.workspaceManager&&window.workspaceManager.studCommandCenter;const root=cc&&cc.view&&cc.view.querySelector('[data-stud-main]');if(!root)return {error:'STUD root unavailable',activeView:cc&&cc.state&&cc.state.activeView};const surface=root.querySelector('.stud-assignment-workspace-detail.is-operational');const bounds=root.getBoundingClientRect();const controls=[...root.querySelectorAll('button,input,select,summary')].filter(item=>{const rect=item.getBoundingClientRect();return rect.width>1&&rect.height>1});const escaped=controls.filter(item=>{const rect=item.getBoundingClientRect();return rect.left<bounds.left-3||rect.right>bounds.right+3});const text=root.textContent||'';return {scenario:${JSON.stringify(scenario)},activeView:cc.state.activeView,navGroup:cc.state.navGroup,workspaceMode:cc.assignmentWorkspace.state.mode,surface:!!surface,artifactBay:!!root.querySelector('.stud-artifact-bay'),mission:!!root.querySelector('.stud-mission-control'),resting:text.includes('Nothing is running')||text.includes('ARTIFACT BAY IS EMPTY'),determinate:!!root.querySelector('.stud-mission-progress.is-determinate'),indeterminate:!!root.querySelector('.stud-mission-progress.is-indeterminate'),events:root.querySelectorAll('.stud-mission-events li').length,artifacts:root.querySelectorAll('.stud-artifact-row').length,overflow:root.scrollWidth>root.clientWidth+4,escaped:escaped.map(item=>(item.textContent||item.tagName).trim().slice(0,80)),capture:{x:Math.max(0,bounds.left),y:Math.max(0,bounds.top),width:Math.min(innerWidth-bounds.left,bounds.width),height:Math.min(innerHeight-bounds.top,bounds.height),scale:1}};`)}))()`);
        const valid = report.surface && !report.overflow && !report.escaped.length && (['artifacts','empty','generic','long'].includes(scenario) ? report.artifactBay : report.mission);
        console.log(`STUD_M6_LIVE_LAYOUT: ${valid ? "OK" : "FAIL"} ${JSON.stringify({...report, fixture: result.value})}`);
        if (screenshotPath) { const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false, clip: report.capture}); fs.mkdirSync(path.dirname(screenshotPath), {recursive: true}); fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64")); console.log(`STUD_M6_SCREENSHOT: ${screenshotPath}`); }
        if (!valid) process.exitCode = 1;
    } finally { socket.close(); }
})().catch(error => { console.error(`STUD_M6_LIVE_LAYOUT: FAIL ${error.message}`); process.exitCode = 1; });
