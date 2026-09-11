#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRunCoordinator}=require("../src/classes/workspaces/studRunCoordinator.class.js");
const {StudHumanisationRuntime}=require("../src/classes/workspaces/studHumanisationRuntime.class.js");
const {StudHumanisationService}=require("../src/classes/workspaces/studHumanisationService.class.js");
const {StudLecturerCommitteeRuntime}=require("../src/classes/workspaces/studLecturerCommitteeRuntime.class.js");
const {StudLecturerCommitteeService}=require("../src/classes/workspaces/studLecturerCommitteeService.class.js");
const {AssistantOllamaClient}=require("../src/classes/assistant/assistantOllamaClient.class.js");
const {academicFixture}=require("./stud-m13-fixtures.js");
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log(`${name}: PASS`);};
class SyntheticAssistant{
    constructor(){this.requests=[];}
    client(){return {config:{model:"DO_NOT_USE_GLOBAL_MODEL"},client:{listModels:async()=>({ok:true,status:"READY",models:["synthetic-validated:1"],checkedAt:new Date().toISOString()}),ensureModelAvailable:async model=>({ok:true,model,status:"READY"}),chat:async request=>{
        this.requests.push(request);const text=request.messages[1].content,nonce=(text.match(/"nonce":"([^"]+)"/)||[])[1];
        if(nonce)return {ok:true,status:"READY",response:JSON.stringify({status:"OK",nonce,candidate:"Synthetic trial: 12.4 mm [SYN2026].",finding:"MISSING_CITATION"})};
        if(text.includes("SECTION DATA:")&&text.includes("AEGIS STUD LOCAL HUMANISATION")){const sections=JSON.parse(text.split("SECTION DATA: ")[1]);return {ok:true,status:"READY",response:JSON.stringify({sections:sections.map(s=>({sectionId:s.sectionId,candidate:s.protectedText}))})};}
        if(text.includes("AEGIS STUD LOCAL LECTURER REVIEW"))return {ok:true,status:"READY",response:JSON.stringify({findings:[]})};
        return {ok:true,status:"READY",response:JSON.stringify({status:"CANDIDATE_READY",candidate:"The synthetic trial reports 12.4 mm (Example, 2026). The scope remains limited.",limitations:["Synthetic test double; no model quality claim."]})};
    }}};}
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-m13-integration-"));let store,coordinator;
(async()=>{try{
    store=new StudAcademicStore({root,applicationVersion:"m13-test"}).initialize();const f=academicFixture(store,root),assistant=new SyntheticAssistant();
    const humanisation=new StudHumanisationService({store,compositionService:f.composition,runtime:new StudHumanisationRuntime({assistantRuntime:assistant}),artifactOperationsService:f.artifacts});
    const committee=new StudLecturerCommitteeService({store,compositionService:f.composition,claimEvidenceService:f.claims,runtime:new StudLecturerCommitteeRuntime({assistantRuntime:assistant}),artifactOperationsService:f.artifacts});
    coordinator=new StudRunCoordinator({store,workflowService:f.workflow,artifactOperationsService:f.artifacts,requirementsService:f.requirements,compositionService:f.composition,claimEvidenceService:f.claims,researchPlanService:f.research,assistantRuntime:assistant,humanisationService:humanisation,lecturerCommitteeService:committee});
    const profile=coordinator.saveProfile({name:"Deterministic test profile",maxLightTasks:2,maxNetworkTasks:0,maxModelTasks:1,minAvailableMemoryBytes:268435456,maxModelContext:8192,pauseOnBattery:false,pauseOnMemoryPressure:false,keepAwake:false,timeoutMs:60000,maxRetries:0});
    const model=(await coordinator.modelInventory()).models[0];await coordinator.modelProbe({modelId:model.id,capability:"ACADEMIC_SECTION_DRAFTING",explicitRequest:true});
    const drafting=f.flow.graph.nodes.find(n=>n.title==="Draft bounded section");
    const create=(flow,node,selection={})=>coordinator.createPlan({assignmentId:f.assignment.id,workflowId:flow.id,scope:"SELECTED_STAGES",selectedNodeIds:[node.id],taskSelections:[{workflowNodeId:node.id,...selection}],resourceProfileId:profile.id,routingPolicy:"PINNED",pinnedModelId:model.id}).plan;
    let plan=create(f.flow,drafting,{sectionId:f.section.id});
    await check("CANONICAL_DRAFT_INPUT_PRESERVES_REVIEWED_LINKS_AND_CITATION",()=>{
        const input=plan.steps[0].inputSnapshot,e=input.claims[0].links[0].evidence;
        assert.strictEqual(input.claims[0].links[0].reviewState,"REVIEWED");assert.strictEqual(e.id,f.evidence.id);assert.strictEqual(e.sourceSnapshotHash,f.evidence.sourceSnapshotHash);assert.strictEqual(e.sourceObjectId,f.paper.id);assert.strictEqual(input.citations[0].title,f.paper.title);assert.strictEqual(input.claims[0].text,f.claim.claimText);
    });
    await check("UNCHANGED_M1_INSPECTION_TIMESTAMP_IS_NOT_INPUT_DRIFT",async()=>{await new Promise(r=>setTimeout(r,5));coordinator.validateInputDrift(coordinator.repository.planRow(plan.id));});
    await check("DRAFT_WORKER_PRODUCES_CANDIDATE_WITHOUT_AUTOSAVE",async()=>{await coordinator.launch({assignmentId:f.assignment.id,planId:plan.id,expectedVersion:plan.rowVersion,confirmLaunch:true});plan=await coordinator.waitForIdle(plan.id);assert.strictEqual(plan.steps[0].state,"COMPLETED");assert.strictEqual(store.db.prepare("SELECT count(*) n FROM stud_draft_versions").get().n,0);const request=assistant.requests.at(-1);assert.strictEqual(request.model,"synthetic-validated:1");assert.strictEqual(request.contextTokens,8192);assert.strictEqual(request.jsonOnly,true);});
    let accepted;
    await check("EXPLICIT_ACCEPTANCE_IS_ATOMIC_VERSIONED_AND_DEDUPLICATED",async()=>{accepted=await coordinator.acceptDraftCandidate({assignmentId:f.assignment.id,planId:plan.id,stepId:plan.steps[0].id,expectedStepVersion:plan.steps[0].rowVersion});assert.strictEqual(accepted.draftVersion.origin,"LOCAL_AI");assert.strictEqual(store.db.prepare("SELECT execution_plan_id FROM stud_draft_versions WHERE id=?").get(accepted.draftVersion.id).execution_plan_id,plan.id);await assert.rejects(coordinator.acceptDraftCandidate({assignmentId:f.assignment.id,planId:plan.id,stepId:plan.steps[0].id,expectedStepVersion:plan.steps[0].rowVersion}),e=>e.code==="STALE_EXECUTION_STEP");assert.strictEqual(store.db.prepare("SELECT count(*) n FROM stud_draft_versions").get().n,1);});
    await check("M6_ARTIFACT_AND_M3_WORK_STATE_RETAIN_AUTHORITY",()=>{assert.ok(coordinator.missionState({assignmentId:f.assignment.id,planId:plan.id}).planArtifacts.some(a=>a.canonicalObjectId===accepted.draftVersion.id));assert.strictEqual(f.workflow.read({workflowId:f.flow.id}).graph.nodes.find(n=>n.id===drafting.id).state,drafting.state);});
    await check("REJECTION_PERSISTS_WITHOUT_DRAFT_CREATION",async()=>{let p=create(f.flow,drafting,{sectionId:f.section.id});await coordinator.launch({assignmentId:f.assignment.id,planId:p.id,expectedVersion:p.rowVersion,confirmLaunch:true});p=await coordinator.waitForIdle(p.id);const s=p.steps[0];coordinator.rejectDraftCandidate({assignmentId:f.assignment.id,planId:p.id,stepId:s.id,expectedStepVersion:s.rowVersion});const fresh=coordinator.repository.stepRow(s.id);assert.strictEqual(fresh.outputSummary.rejected,true);await assert.rejects(coordinator.acceptDraftCandidate({assignmentId:f.assignment.id,planId:p.id,stepId:s.id,expectedStepVersion:fresh.rowVersion}),e=>e.code==="INVALID_TRANSITION");assert.strictEqual(store.db.prepare("SELECT count(*) n FROM stud_draft_versions").get().n,1);});
    let flow=f.workflow.addNode({workflowId:f.flow.id,expectedWorkflowVersion:f.flow.rowVersion,node:{title:"Humanisation of selected draft",semanticType:"WRITING",order:10}}),node=flow.graph.nodes.find(n=>n.title==="Humanisation of selected draft");
    const editorialProfile=humanisation.createProfile({name:"Synthetic clear writing",genre:"ACADEMIC_ESSAY"}),session=humanisation.createSession({assignmentId:f.assignment.id,draftId:accepted.draftVersion.draftId,sourceVersionId:accepted.draftVersion.id,profileId:editorialProfile.id,scope:"SECTION",sectionIds:[f.section.id],goals:["IMPROVE_READABILITY"]});
    await coordinator.modelProbe({modelId:model.id,capability:"EDITORIAL_TRANSFORMATION",explicitRequest:true});
    flow=f.workflow.renameNode({workflowId:flow.id,nodeId:node.id,title:"Mejorar claridad",expectedWorkflowVersion:flow.rowVersion,expectedNodeVersion:node.rowVersion});node=flow.graph.nodes.find(n=>n.id===node.id);
    await check("M11_HANDLER_REUSES_SESSION_AND_ROUTED_MODEL_WITHOUT_GLOBAL_CONFIG_MUTATION",async()=>{let p=create(flow,node,{sessionId:session.id});await coordinator.launch({assignmentId:f.assignment.id,planId:p.id,expectedVersion:p.rowVersion,confirmLaunch:true});p=await coordinator.waitForIdle(p.id);assert.strictEqual(p.steps[0].state,"COMPLETED");const current=humanisation.session({assignmentId:f.assignment.id,sessionId:session.id});assert.ok(["CANDIDATE_READY","NEEDS_REVIEW"].includes(current.state));assert.strictEqual(current.model,"synthetic-validated:1");assert.strictEqual(assistant.client().config.model,"DO_NOT_USE_GLOBAL_MODEL");assert.strictEqual(store.db.prepare("SELECT parent_run_id FROM stud_operation_runs WHERE id=?").get(current.runId).parent_run_id,p.steps[0].m6RunId);});
    flow=f.workflow.addNode({workflowId:flow.id,expectedWorkflowVersion:flow.rowVersion,node:{title:"Academic review",semanticType:"REVIEW",order:11}});node=flow.graph.nodes.find(n=>n.title==="Academic review");
    const review=committee.createSession({assignmentId:f.assignment.id,draftId:accepted.draftVersion.draftId,sourceVersionId:accepted.draftVersion.id});await coordinator.modelProbe({modelId:model.id,capability:"ACADEMIC_REVIEW",explicitRequest:true});
    await check("SESSION_DISPATCH_USES_CANONICAL_TYPE_AND_ASSIGNMENT_NOT_TITLE",()=>{
        const base=coordinator.contextSnapshot(f.assignment.id,flow);
        for(const title of ["Humanisation","Academic review","Revisar estilo","Correction","任意の名前"]){
            assert.strictEqual(coordinator.classifyNode({title,semanticType:"WRITING"},base,{sessionId:session.id}).handlerType,"HUMANISATION_CANDIDATE");
            assert.strictEqual(coordinator.classifyNode({title,semanticType:"REVIEW"},base,{sessionId:review.id}).handlerType,"ACADEMIC_REVIEW");
        }
        const foreign=store.createEntity("ASSIGNMENT",{title:"Unrelated synthetic Assignment"});
        assert.throws(()=>coordinator.classifyNode({semanticType:"REVIEW"},{...base,assignment:foreign},{sessionId:review.id}),e=>e.code==="INVALID_TASK_SELECTION");
        assert.throws(()=>coordinator.classifyNode({semanticType:"HUMAN_TASK"},base,{sessionId:review.id}),e=>e.code==="INVALID_TASK_SELECTION");
    });
    flow=f.workflow.renameNode({workflowId:flow.id,nodeId:node.id,title:"Revisión docente",expectedWorkflowVersion:flow.rowVersion,expectedNodeVersion:node.rowVersion});node=flow.graph.nodes.find(n=>n.id===node.id);
    await check("M12_HANDLER_REUSES_CANONICAL_REVIEW_WITH_PINNED_MODEL",async()=>{let p=create(flow,node,{sessionId:review.id});await coordinator.launch({assignmentId:f.assignment.id,planId:p.id,expectedVersion:p.rowVersion,confirmLaunch:true});p=await coordinator.waitForIdle(p.id);assert.strictEqual(p.steps[0].state,"COMPLETED");assert.ok(["COMPLETE","PARTIAL"].includes(committee.session({assignmentId:f.assignment.id,sessionId:review.id}).state));});
    await check("FOREIGN_SECTIONS_AND_SESSION_TYPE_MISMATCH_ARE_REJECTED",()=>{assert.throws(()=>create(flow,drafting,{sectionId:"stud_composition_section_foreign"}),e=>e.code==="CROSS_PLAN_SECTION");assert.throws(()=>create(flow,drafting,{sessionId:review.id}),e=>e.code==="INVALID_TASK_SELECTION");});
    await check("CLIENT_ONLY_ACCEPTS_TYPED_GENERATION_BOUNDS",async()=>{const client=new AssistantOllamaClient();let body;client.request=async(_path,o)=>{body=o.body;return {message:{content:"{}"}};};assert.strictEqual((await client.chat({model:"synthetic",messages:[],contextTokens:8192,maxOutputTokens:512,jsonOnly:true})).ok,true);assert.deepStrictEqual(body.options,{temperature:0.5,num_ctx:8192,num_predict:512});assert.strictEqual(body.format,"json");assert.strictEqual((await client.chat({contextTokens:-1})).ok,false);});
    await check("STRUCTURED_DECODING_CONSTRAINS_SHAPE_NOT_PROBE_ANSWERS",async()=>{
        const client=new AssistantOllamaClient();let body;client.request=async(_path,o)=>{body=o.body;return {message:{content:"{}"}};};
        assert.strictEqual((await client.chat({responseContract:"STUD_DRAFT_PROBE"})).ok,true);
        assert.deepStrictEqual(body.format.required,["status","candidate","nonce"]);
        assert.ok(!/const|enum|SYN2026|12.4/.test(JSON.stringify(body.format)));
        assert.strictEqual((await client.chat({responseContract:"file:///arbitrary-schema"})).ok,false);
    });
    await check("RESTART_RETAINS_CANDIDATE_DECISIONS_EXACT_INPUT_AND_LINEAGE",()=>{coordinator.dispose();store.close();store=new StudAcademicStore({root}).initialize();assert.strictEqual(store.db.prepare("SELECT execution_plan_id FROM stud_draft_versions WHERE id=?").get(accepted.draftVersion.id).execution_plan_id,plan.id);const snapshot=JSON.parse(store.db.prepare("SELECT input_snapshot_json FROM stud_execution_steps WHERE id=?").get(plan.steps[0].id).input_snapshot_json);assert.strictEqual(snapshot.claims[0].links[0].evidence.sourceSnapshotHash,f.evidence.sourceSnapshotHash);assert.deepStrictEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);});
    console.log(`STUD M13 INTEGRATION: ${passed} PASSED (synthetic model test double; no real-model acceptance claim)`);
}finally{if(coordinator)coordinator.dispose();if(store)store.close();fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
