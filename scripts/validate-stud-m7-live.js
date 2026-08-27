#!/usr/bin/env node
"use strict";

// Synthetic-only CDP validation. It never reads Moodle, a user academic store,
// managed private files, credentials, providers or local model conversations.
const fs = require("fs");
const path = require("path");
const port = Number(process.argv[2] || 9247);
const screenshotPath = String(process.argv[3] || "");
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const scenario = String(process.argv[8] || "populated").toLowerCase();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => { const message=JSON.parse(event.data), pending=socket.pending.get(message.id); if(!pending)return; socket.pending.delete(message.id); if(message.error||message.result?.exceptionDetails)pending.reject(new Error(JSON.stringify(message.error||message.result.exceptionDetails))); else pending.resolve(pending.raw?message.result:message.result?.result?.value); });
    return socket;
}
function command(socket,method,params={}){const id=++socket.sequence;return new Promise((resolve,reject)=>{socket.pending.set(id,{resolve,reject,raw:true});socket.send(JSON.stringify({id,method,params}));});}
function evaluate(socket,expression){const id=++socket.sequence;return new Promise((resolve,reject)=>{socket.pending.set(id,{resolve,reject,raw:false});socket.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:true}}));});}

function fixture(variant) {
    return `(async()=>{
      const manager=window.workspaceManager, activation=manager.activate('student',false);if(activation&&typeof activation.then==='function')await activation.catch(()=>{});for(let i=0;i<80&&(!manager.studCommandCenter||!manager.studCommandCenter.state.schema);i+=1)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,180));
      const cc=manager.studCommandCenter,variant=${JSON.stringify(variant)},now='2026-08-27T12:00:00.000Z';
      const discipline=variant==='humanities'?'Comparative modernism':variant==='law'?'Public law and statutory interpretation':variant==='social'?'Social research methods':variant==='group'?'Collaborative design practice':variant==='manual'?'Independent interdisciplinary study':'Sustainable engineering analysis';
      const course={id:'stud_m7_course',title:discipline,code:variant==='manual'?null:'SYN-7007',academicYear:variant==='manual'?null:'2025/26',academicTerm:variant==='manual'?null:'Term 2',status:'ACTIVE',updatedAt:now};
      const assignment={id:'stud_m7_assignment',courseId:course.id,title:variant==='long'?'Synthetic multidisciplinary investigation with a deliberately extensive title covering competing evidence, methods, limitations and contextual interpretation':'Synthetic research-led assessment',description:'Public-safe M7 visual fixture.',status:'IN_PROGRESS',dueDate:'2026-11-20T14:00:00.000Z',updatedAt:now};
      const requirementA={id:'stud_m7_req_a',label:variant==='law'?'Use authoritative legal sources':variant==='humanities'?'Compare primary texts and criticism':'Support analysis with traceable evidence',requirementType:'EVIDENCE',resolutionState:'RESOLVED'};
      const requirementB={id:'stud_m7_req_b',label:'Discuss limitations and alternatives',requirementType:'STRUCTURE',resolutionState:'RESOLVED'};
      const contract={id:'stud_m7_contract',assignmentId:assignment.id,revision:2,lifecycle:'APPROVED',completeness:'COMPLETE',contractHash:'c'.repeat(64),freshness:{reviewCondition:'CURRENT'},items:[requirementA,requirementB],candidates:[]};
      const document={id:'stud_m7_document',courseId:course.id,assignmentId:assignment.id,title:variant==='ocr'?'Scanned archival source requiring OCR':'Assessment source and methodology guide',documentType:'COURSE_MATERIAL',extractionStatus:variant==='ocr'?'OCR_REQUIRED':'READY'};
      const paper={id:'stud_m7_paper',courseId:course.id,assignmentId:assignment.id,title:'Contrasting scholarly interpretation of the selected topic',authors:'A. Example; B. Example',year:'2025'};
      const note={id:'stud_m7_note',courseId:course.id,assignmentId:assignment.id,title:'Working synthesis note',content:'Synthetic public-safe note.'};
      const dataset={id:'stud_m7_dataset',courseId:course.id,assignmentId:assignment.id,title:'Bounded synthetic dataset',format:'CSV'};
      const baseTopics=[
        {id:'stud_m7_topic_a',planId:'stud_m7_plan',assignmentId:assignment.id,title:variant==='long'?'A deliberately long research topic examining assumptions, competing interpretations, methodological boundaries and limitations across several source classes':'Core concepts and competing interpretations',description:'Inspect relevant foundations, alternative positions and limitations.',rationale:'Proposed from the reviewed evidence requirement.',priority:'HIGH',topicOrder:0,origin:'DETERMINISTIC',basis:'PROPOSED_BY_RESEARCH_PLANNING',disposition:variant==='draft'?'PROPOSED':'INCLUDED',rowVersion:2,requirements:[{requirementItemId:requirementA.id,label:requirementA.label,relationshipBasis:'PROPOSED_BY_RESEARCH_PLANNING'}]},
        {id:'stud_m7_topic_b',planId:'stud_m7_plan',assignmentId:assignment.id,title:variant==='law'?'Competing statutory interpretations':variant==='humanities'?'Primary text and critical positions':'Methods, evidence and limitations',description:'Review methods and explicit uncertainty.',rationale:'User-defined analytical scope.',priority:'NORMAL',topicOrder:1,origin:'USER',basis:'USER_DEFINED',disposition:'INCLUDED',rowVersion:1,requirements:[{requirementItemId:requirementB.id,label:requirementB.label,relationshipBasis:'PROPOSED_BY_RESEARCH_PLANNING'}]}
      ];
      if(variant==='many-topics')for(let i=0;i<9;i+=1)baseTopics.push({...baseTopics[1],id:'stud_m7_topic_extra_'+i,title:'Additional bounded topic '+(i+1),topicOrder:i+2,requirements:[]});
      const questions=variant==='empty'?[]:[{id:'stud_m7_question',planId:'stud_m7_plan',topicId:baseTopics[0].id,assignmentId:assignment.id,text:variant==='humanities'?'How do the primary text and critical positions differ?':'Which assumptions materially affect the interpretation?',priority:'HIGH',state:'UNRESOLVED',origin:'USER',order:0,rowVersion:1,requirements:[]}];
      const gaps=['gaps','blocker','ocr','group'].includes(variant)?[{id:'stud_m7_gap',planId:'stud_m7_plan',topicId:baseTopics[0].id,assignmentId:assignment.id,gapType:variant==='ocr'?'OCR_REQUIRED':variant==='group'?'TEAM_DEPENDENCY':'CONTRADICTORY_EVIDENCE',title:variant==='ocr'?'Source text cannot yet be inspected':variant==='group'?'Awaiting agreed team material':'Alternative position needs comparison',description:'Explicit gap; no conclusion is fabricated.',state:'OPEN',blockerId:variant==='blocker'?'stud_m7_blocker':null,rowVersion:1}]:[];
      const lifecycle=variant==='draft'?'DRAFT':'REVIEWED',plan={id:'stud_m7_plan',assignmentId:assignment.id,courseId:course.id,requirementsContractId:contract.id,requirementsContractRevision:2,requirementsContractHash:contract.contractHash,lifecycle,revision:1,origin:'USER',planHash:lifecycle==='REVIEWED'?'d'.repeat(64):null,rowVersion:4,contractCondition:'CURRENT',topics:baseTopics,questions,gaps,dossierCounts:baseTopics.map((topic,index)=>({topicId:topic.id,total:index?0:3,accepted:index?0:2,reviewed:index?0:1}))};
      const planState=variant==='no-plan'?{assignment,current:null,draft:null,history:[]}:{assignment,current:lifecycle==='REVIEWED'?plan:null,draft:lifecycle==='DRAFT'?plan:null,history:[{id:plan.id,revision:1,lifecycle,requirementsContractRevision:2}]};
      const dossier=variant==='empty'||variant==='no-plan'?[]:[
        {id:'stud_m7_dossier_doc',planId:plan.id,topicId:baseTopics[0].id,assignmentId:assignment.id,canonicalObjectType:'ACADEMIC_DOCUMENT',canonicalObjectId:document.id,membershipOrigin:'ASSIGNMENT_MATERIAL',disposition:'ACCEPTED',reviewState:variant==='ocr'?'UNREVIEWED':'REVIEWED',sourceSuitability:'COURSE_MATERIAL',stance:'AGREES',rowVersion:1},
        {id:'stud_m7_dossier_paper',planId:plan.id,topicId:baseTopics[0].id,assignmentId:assignment.id,canonicalObjectType:'RESEARCH_PAPER',canonicalObjectId:paper.id,membershipOrigin:'USER_ADDED',disposition:'ACCEPTED',reviewState:'PARTIALLY_REVIEWED',sourceSuitability:'PEER_REVIEWED',stance:variant==='contradiction'?'CONFLICTS':'ALTERNATIVE',rationale:'Represents a competing interpretation.',rowVersion:1},
        {id:'stud_m7_dossier_note',planId:plan.id,topicId:baseTopics[0].id,assignmentId:assignment.id,canonicalObjectType:'NOTE',canonicalObjectId:note.id,membershipOrigin:'USER_ADDED',disposition:'SUGGESTED',reviewState:'UNREVIEWED',sourceSuitability:'UNKNOWN',stance:'NOT_ASSESSED',rowVersion:1}
      ];
      if(variant==='large-list')for(let i=0;i<28;i+=1)dossier.push({...dossier[i%3],id:'stud_m7_dossier_extra_'+i,canonicalObjectType:'NOTE',canonicalObjectId:'stud_m7_note_extra_'+i,disposition:i%4?'ACCEPTED':'REJECTED'});
      const coverage={topicId:baseTopics[0].id,state:variant==='blocker'?'BLOCKED':gaps.length||questions.length?'GAPS_REMAIN':dossier.length?'PARTIAL':'EMPTY',reasons:variant==='blocker'?['A linked workflow blocker is open.']:gaps.length?[gaps[0].title]:questions.length?['1 research question remains unresolved.','1 linked Requirement has no reviewed material yet.']:['No accepted material is associated with this Topic.'],counts:{requirements:1,questions:{UNRESOLVED:questions.length},acceptedMaterial:dossier.filter(x=>x.disposition==='ACCEPTED').length,reviewedMaterial:dossier.filter(x=>x.reviewState==='REVIEWED').length,contradictoryOrAlternative:dossier.filter(x=>['CONFLICTS','ALTERNATIVE'].includes(x.stance)).length,openGaps:gaps.length},noPercentage:true};
      const contractState={assignmentId:assignment.id,current:contract,draft:null,history:[contract]},workflowState={assignmentId:assignment.id,current:null,history:[],setup:{templates:[],suggestions:[]},contractState};
      const assignmentContext={course,assignment,documents:[document],papers:[paper],notes:[note],datasets:[dataset],resources:[],computeResults:[],notebooks:[],repositories:[],revisions:[],requirementsContract:contractState,workflowState};
      cc.state.schema={version:20};cc.state.error=null;cc.state.courses=[course];cc.state.assignments=[assignment];cc.state.classifications=new Map([[assignment.id,{label:'COURSEWORK'}]]);cc.state.organisation={years:[],unassignedAssignments:[]};cc.state.selectedCourseId=course.id;cc.state.selectedAssignmentId=assignment.id;cc.state.courseContext={...assignmentContext};cc.state.assignmentContext=assignmentContext;cc.state.workingContext={status:'READY',activeCourse:course,activeAssignment:assignment,activeRequirementContract:contract,activeObject:null,activeWorkflow:null,activeWorkflowNode:null,activeResearchPlan:variant==='no-plan'?null:{id:plan.id,assignmentId:assignment.id,lifecycle},activeResearchTopic:variant==='no-plan'?null:{id:baseTopics[0].id,planId:plan.id,assignmentId:assignment.id,title:baseTopics[0].title},originSurface:'ASSIGNMENT_RESEARCH_PLAN',userPinned:false,updatedAt:now};
      cc.requirements.setState(assignment,contractState);cc.workflow.setState(assignment,workflowState);cc.assignmentWorkspace.setState(assignmentContext,cc.state.workingContext,cc.state.courseContext);cc.assignmentWorkspace.state.mode='RESEARCH_PLAN';const rp=cc.assignmentWorkspace.researchPlan;rp.state={assignmentId:assignment.id,planState,selectedTopicId:variant==='no-plan'?'':baseTopics[0].id,dossier,coverage,loading:false,error:''};cc.setActiveView('ASSIGNMENTS');return {scenario:variant};
    })()`;
}

(async()=>{
    const socket=await connect();
    try {
        await command(socket,"Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:scale,mobile:false});
        const system=appearance.startsWith("system-")?appearance.slice(7):null;if(system)await command(socket,"Emulation.setEmulatedMedia",{features:[{name:"prefers-color-scheme",value:system}]});
        await evaluate(socket,`document.documentElement.dataset.aegisAppearance=${JSON.stringify(system||appearance)};true`);
        const fixtureSource=JSON.stringify(fixture(scenario));
        const result=await evaluate(socket,`(async()=>{try{return {ok:true,value:await (new Function(${fixtureSource}))()};}catch(error){return {ok:false,message:error.message,stack:error.stack};}})()`);
        if(!result||!result.ok)throw new Error(`Synthetic fixture failed: ${result&&result.message||"unknown"}\n${result&&result.stack||""}`);
        await delay(250);
        const report=await evaluate(socket,`(()=>{const cc=window.workspaceManager&&window.workspaceManager.studCommandCenter,root=cc&&cc.view&&cc.view.querySelector('[data-stud-main]');if(!root)return {error:'STUD root unavailable'};const bounds=root.getBoundingClientRect(),controls=[...root.querySelectorAll('button,input,textarea,select,summary')].filter(x=>{const r=x.getBoundingClientRect();return r.width>1&&r.height>1}),escaped=controls.filter(x=>{const r=x.getBoundingClientRect();return r.left<bounds.left-3||r.right>bounds.right+3});return {surface:!!root.querySelector('.stud-research-plan-workspace')||!!root.querySelector('.stud-research-plan-empty'),plan:!!root.querySelector('.stud-research-plan-workspace'),topics:root.querySelectorAll('.stud-research-topic-row').length,dossier:root.querySelectorAll('.stud-dossier-item').length,gaps:root.querySelectorAll('.stud-research-gaps li').length,noFakePercent:(root.textContent||'').includes('NO PERCENTAGE IS INFERRED')||${JSON.stringify(scenario)}==='no-plan',overflow:root.scrollWidth>root.clientWidth+4,escaped:escaped.map(x=>(x.textContent||x.name||x.tagName).trim().slice(0,80)),capture:{x:Math.max(0,bounds.left),y:Math.max(0,bounds.top),width:Math.min(innerWidth-bounds.left,bounds.width),height:Math.min(innerHeight-bounds.top,bounds.height),scale:1}}})()`);
        const valid=report.surface&&!report.overflow&&!report.escaped.length&&report.noFakePercent;console.log(`STUD_M7_LIVE_LAYOUT: ${valid?"OK":"FAIL"} ${JSON.stringify({...report,scenario,appearance,width,height,scale})}`);
        if(screenshotPath){const capture=await command(socket,"Page.captureScreenshot",{format:"png",captureBeyondViewport:false,clip:report.capture});fs.mkdirSync(path.dirname(screenshotPath),{recursive:true});fs.writeFileSync(screenshotPath,Buffer.from(capture.data,"base64"));console.log(`STUD_M7_SCREENSHOT: ${path.resolve(screenshotPath)}`);}
        if(!valid)process.exitCode=1;
    } finally {socket.close();}
})().catch(error=>{console.error(`STUD_M7_LIVE_LAYOUT: FAIL ${error.message}`);process.exitCode=1;});
