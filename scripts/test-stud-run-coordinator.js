#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {DatabaseSync}=require("node:sqlite");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService}=require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService}=require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudWorkflowService}=require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudArtifactOperationsService}=require("../src/classes/workspaces/studArtifactOperationsService.class.js");
const {StudRunCoordinator}=require("../src/classes/workspaces/studRunCoordinator.class.js");
const {StudTaskHandlerRegistry}=require("../src/classes/workspaces/studTaskHandlerRegistry.class.js");
const {StudExecutionRepository}=require("../src/classes/workspaces/studExecutionRepository.class.js");
const {StudExecutionWatchdog}=require("../src/classes/workspaces/studResourceMonitor.class.js");

let passed=0;
async function check(name,work){await work();passed+=1;console.log(`${name}: PASS`);}
function expect(code,work){assert.throws(work,error=>error&&error.code===code,code);}
function waitUntil(test,timeout=1500){return new Promise((resolve,reject)=>{const start=Date.now(),poll=()=>{if(test())return resolve();if(Date.now()-start>timeout)return reject(new Error("Timed out waiting for coordinator state."));setTimeout(poll,5);};poll();});}
class FakeAssistant{
    constructor(){this.requests=[];}
    client(){return {config:{model:"synthetic-local:3b"},client:{listModels:async()=>({ok:true,status:"READY",models:["synthetic-local:3b"],checkedAt:new Date().toISOString()}),chat:async request=>{this.requests.push(request);const protectedValue=String(request.messages[1].content).match(/"protected":"([^"]+)"/);return {ok:true,status:"READY",response:protectedValue?JSON.stringify({status:"OK",protected:protectedValue[1],items:[1,2,3]}):JSON.stringify({status:"CANDIDATE_READY",candidate:"A bounded candidate grounded in the supplied reviewed evidence.",limitations:[]})};}}};}
}
class TestResources{
    constructor(allow=true){this.allow=allow;this.kept=false;}
    setActiveModelTasks(value){this.active=value;}
    snapshot(){return {allowNewHeavy:this.allow,reasons:this.allow?[]:["MEMORY_PRESSURE"],availableMemoryBytes:8*1024**3,totalMemoryBytes:16*1024**3,onBattery:false,activeModelTasks:this.active?this.active():0};}
    evaluate(){return this.snapshot();}
    acquireKeepAwake(){this.kept=true;}
    releaseKeepAwake(){this.kept=false;}
    dispose(){}
}
class TestWatchdog{
    constructor(repository,artifacts){this.repository=repository;this.artifacts=artifacts;this.timers=new Map();}
    watch({attemptId,timeoutMs,onTimeout}){this.timers.set(attemptId,setTimeout(onTimeout,timeoutMs));}
    clear(id){clearTimeout(this.timers.get(id));this.timers.delete(id);}
    record(value){return this.repository.incident(value);}
    dispose(){for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();}
}
function delayedHandler(registry,{ignoresAbort=false}={}){
    const original=registry.get("DETERMINISTIC_STUD_CHECK");
    registry.handlers.set("DETERMINISTIC_STUD_CHECK",Object.freeze({...original,supportsCancel:true,timeoutMs:5000,execute:(_context,signal)=>new Promise(resolve=>{const finish=()=>resolve({status:signal.aborted?"CANCELLED":"SUCCESS",output:{kind:"DELAYED_SYNTHETIC"}});if(!ignoresAbort)signal.addEventListener("abort",finish,{once:true});setTimeout(finish,250);} )}));
}
function open(root,options={}){
    const store=new StudAcademicStore({root,applicationVersion:"m13-test"}).initialize(),requirements=new StudRequirementsContractService({store}),context=new StudWorkingContextService({store,requirementsService:requirements}),workflow=new StudWorkflowService({store,requirementsService:requirements,workingContextService:context}),artifacts=new StudArtifactOperationsService({store,workflowService:workflow,workingContextService:context}),repository=new StudExecutionRepository(store),assistant=options.assistant||new FakeAssistant(),handlers=options.handlers||new StudTaskHandlerRegistry({assistantRuntime:assistant}),resources=options.resources||new TestResources(),watchdog=options.watchdog||new TestWatchdog(repository,artifacts);
    const coordinator=new StudRunCoordinator({store,repository,workflowService:workflow,artifactOperationsService:artifacts,requirementsService:requirements,workingContextService:context,assistantRuntime:assistant,handlerRegistry:handlers,resourceMonitor:resources,watchdog});
    return {store,requirements,context,workflow,artifacts,assistant,handlers,resources,watchdog,coordinator};
}
function fixture(env,title="Synthetic multidisciplinary coursework"){
    const course=env.store.createEntity("COURSE",{title:`${title} course`}),assignment=env.store.createEntity("ASSIGNMENT",{courseId:course.id,title}),flow=env.workflow.create({assignmentId:assignment.id,templateKey:"GENERIC_MANUAL",allowNoContract:true,noContractReason:"Synthetic public-safe M13 fixture."});
    return {course,assignment,flow};
}
function stripV26(dbPath){const db=new DatabaseSync(dbPath);db.exec(`PRAGMA foreign_keys=OFF;
ALTER TABLE stud_draft_versions DROP COLUMN execution_plan_id;
ALTER TABLE stud_draft_versions DROP COLUMN execution_step_id;
ALTER TABLE stud_draft_versions DROP COLUMN execution_attempt_id;
ALTER TABLE stud_draft_versions DROP COLUMN model_routing_decision_id;
DROP TABLE IF EXISTS stud_watchdog_incidents; DROP TABLE IF EXISTS stud_resource_profiles; DROP TABLE IF EXISTS stud_model_routing_decisions; DROP TABLE IF EXISTS stud_model_capability_assessments; DROP TABLE IF EXISTS stud_model_inventory; DROP TABLE IF EXISTS stud_task_handler_snapshots; DROP TABLE IF EXISTS stud_execution_checkpoints; DROP TABLE IF EXISTS stud_execution_attempts; DROP TABLE IF EXISTS stud_execution_step_dependencies; DROP TABLE IF EXISTS stud_execution_steps; DROP TABLE IF EXISTS stud_execution_plans;
DROP INDEX IF EXISTS stud_operation_runs_parent_index;
DELETE FROM stud_schema_migrations WHERE version=26;`);
// Restore the original v19-v25 event constraint, not an empty v26 lookalike.
const schema=db.prepare("SELECT sql FROM sqlite_master WHERE name='stud_operation_events'").get().sql;
const historicalEvents=db.prepare("SELECT * FROM stud_operation_events ORDER BY event_sequence").all();
const historicalLinks=db.prepare("SELECT * FROM stud_operation_event_artifacts").all();
const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='stud_operation_events' AND sql IS NOT NULL").all();
const originalSchema=schema.replace(/,'EXECUTION_PLAN_STARTED'[^)]+/,"");
db.exec("DELETE FROM stud_operation_event_artifacts; DROP TABLE stud_operation_events;");
db.exec(originalSchema);indexes.forEach(row=>db.exec(row.sql));
for(const row of historicalEvents){const keys=Object.keys(row);db.prepare(`INSERT INTO stud_operation_events (${keys.join(",")}) VALUES (${keys.map(()=>"?").join(",")})`).run(...Object.values(row));}
for(const row of historicalLinks)db.prepare("INSERT INTO stud_operation_event_artifacts (event_id,artifact_id) VALUES (?,?)").run(row.event_id,row.artifact_id);
db.exec("PRAGMA foreign_keys=ON;");assert.deepStrictEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);db.close();}

(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-stud-m13-"));try{
    let env=open(path.join(root,"core")),base=fixture(env);
    await check("SCHEMA_V26_FRESH_NO_FABRICATED_EXECUTION",async()=>{assert.strictEqual(env.store.schemaInfo().version,27);for(const table of ["stud_execution_plans","stud_execution_steps","stud_execution_attempts","stud_model_inventory","stud_watchdog_incidents"])assert.strictEqual(env.store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count,0);assert.strictEqual(env.coordinator.profiles().length,3);});
    let preflight;
    await check("PLAN_IS_EXPLICIT_PREFLIGHT_WITH_NO_RUN",async()=>{preflight=env.coordinator.createPlan({assignmentId:base.assignment.id,workflowId:base.flow.id,scope:"CURRENT_STAGE",resourceProfileId:"stud_resource_interactive"});assert.strictEqual(preflight.plan.state,"READY");assert.strictEqual(preflight.counts.machineOperable,1);assert.strictEqual(preflight.explicitLaunchRequired,true);assert.strictEqual(env.artifacts.runs({assignmentId:base.assignment.id}).length,0);});
    await check("STALE_AND_UNCONFIRMED_LAUNCH_FAIL_CLOSED",async()=>{await assert.rejects(env.coordinator.launch({assignmentId:base.assignment.id,planId:preflight.plan.id,expectedVersion:preflight.plan.rowVersion}),error=>error.code==="EXPLICIT_CONFIRMATION_REQUIRED");await assert.rejects(env.coordinator.launch({assignmentId:base.assignment.id,planId:preflight.plan.id,expectedVersion:999,confirmLaunch:true}),error=>error.code==="STALE_EXECUTION_PLAN");});
    await check("DETERMINISTIC_STEP_EXECUTES_WITH_REAL_M6_RUN_EVENTS",async()=>{await env.coordinator.launch({assignmentId:base.assignment.id,planId:preflight.plan.id,expectedVersion:preflight.plan.rowVersion,confirmLaunch:true});const plan=await env.coordinator.waitForIdle(preflight.plan.id);assert.strictEqual(plan.state,"COMPLETED");assert.strictEqual(plan.steps[0].state,"COMPLETED");assert.strictEqual(plan.steps[0].attemptCount,1);const mission=env.coordinator.missionState({assignmentId:base.assignment.id,planId:plan.id});assert.ok(mission.events.some(item=>item.eventType==="EXECUTION_PLAN_STARTED"));assert.ok(mission.events.some(item=>item.eventType==="EXECUTION_STEP_COMPLETED"));assert.ok(env.artifacts.runs({assignmentId:base.assignment.id}).length>=2);});
    await check("IDEMPOTENCY_PREVENTS_DUPLICATE_STEP_CLAIM",async()=>{const plan=env.coordinator.createPlan({assignmentId:base.assignment.id,workflowId:base.flow.id,scope:"CURRENT_STAGE"}).plan,step=plan.steps[0],claimed=env.coordinator.repository.claimStep(step.id,step.rowVersion);assert.strictEqual(claimed.state,"RUNNING");expect("STEP_NOT_READY",()=>env.coordinator.repository.claimStep(step.id,claimed.rowVersion));env.coordinator.repository.updateStep(claimed,{state:"CANCELLED",activeAttemptId:null,finishedAt:new Date().toISOString()});env.coordinator.repository.updatePlan(env.coordinator.repository.planRow(plan.id),{state:"CANCELLED",finishedAt:new Date().toISOString(),statusSummary:"Synthetic claim test complete."});});
    await check("MODEL_INVENTORY_PROBE_AND_ROUTING_ARE_LOCAL_EXPLICIT",async()=>{const inventory=await env.coordinator.modelInventory(),model=inventory.models[0];await assert.rejects(env.coordinator.modelProbe({modelId:model.id,capability:"SHORT_REASONING"}),error=>error.code==="EXPLICIT_REQUEST_REQUIRED");const assessment=await env.coordinator.modelProbe({modelId:model.id,capability:"SHORT_REASONING",explicitRequest:true});assert.strictEqual(assessment.assessment,"SUITABLE");const plan=env.coordinator.repository.listPlans(base.assignment.id,1)[0],step=plan.steps[0],route=env.coordinator.router.route({planId:plan.id,stepId:step.id,capability:"SHORT_REASONING",routingPolicy:"AUTOMATIC",profile:env.coordinator.repository.profile("stud_resource_interactive")});assert.strictEqual(route.outcome,"SELECTED");assert.strictEqual(route.selectedModelId,model.id);});
    await check("PINNED_UNSUITABLE_MODEL_HAS_NO_FALLBACK",async()=>{const model=env.coordinator.repository.models()[0],plan=env.coordinator.repository.listPlans(base.assignment.id,1)[0],route=env.coordinator.router.route({planId:plan.id,stepId:plan.steps[0].id,capability:"ACADEMIC_REVIEW",routingPolicy:"PINNED",requestedModelId:model.id,profile:env.coordinator.repository.profile("stud_resource_interactive")});assert.strictEqual(route.outcome,"NO_SUITABLE_MODEL");assert.strictEqual(route.selectedModelId,null);});
    await check("CUSTOM_RESOURCE_PROFILE_IS_BOUNDED_AND_VERSIONED",async()=>{const profile=env.coordinator.saveProfile({name:"Synthetic bounded",maxLightTasks:2,maxNetworkTasks:1,maxModelTasks:1,minAvailableMemoryBytes:1073741824,maxModelContext:4096,pauseOnBattery:true,pauseOnMemoryPressure:true,keepAwake:false,timeoutMs:60000,maxRetries:1});assert.strictEqual(profile.profileType,"CUSTOM");expect("POLICY_BLOCKED",()=>env.coordinator.saveProfile({id:"stud_resource_interactive",expectedVersion:1,name:"No",maxLightTasks:1,maxNetworkTasks:0,maxModelTasks:0,minAvailableMemoryBytes:1073741824,maxModelContext:4096,pauseOnBattery:false,pauseOnMemoryPressure:true,keepAwake:false,timeoutMs:60000,maxRetries:0}));});
    await check("INPUT_DRIFT_REJECTS_RESUME",async()=>{const created=env.coordinator.createPlan({assignmentId:base.assignment.id,workflowId:base.flow.id,scope:"CURRENT_STAGE"}).plan;let row=env.coordinator.repository.updatePlan(env.coordinator.repository.planRow(created.id),{state:"PAUSED",statusSummary:"Synthetic pause"});const flow=env.workflow.read({workflowId:base.flow.id}),node=flow.graph.nodes[0];env.workflow.renameNode({workflowId:flow.id,nodeId:node.id,title:"Changed authoritative review",expectedWorkflowVersion:flow.rowVersion,expectedNodeVersion:node.rowVersion});await assert.rejects(env.coordinator.resume({assignmentId:base.assignment.id,planId:row.id,expectedVersion:row.rowVersion}),error=>error.code==="RUN_INPUT_CHANGED");});
    assert.deepStrictEqual(env.store.db.prepare("PRAGMA foreign_key_check").all(),[]);env.coordinator.dispose();env.store.close();

    const cancelEnv=open(path.join(root,"cancel"));delayedHandler(cancelEnv.handlers);const cancelBase=fixture(cancelEnv,"Cancellation fixture"),cancelPlan=cancelEnv.coordinator.createPlan({assignmentId:cancelBase.assignment.id,workflowId:cancelBase.flow.id,scope:"CURRENT_STAGE"}).plan;
    await check("AUTHORITATIVE_CANCELLATION_REJECTS_LATE_RESULT",async()=>{await cancelEnv.coordinator.launch({assignmentId:cancelBase.assignment.id,planId:cancelPlan.id,expectedVersion:cancelPlan.rowVersion,confirmLaunch:true});await waitUntil(()=>cancelEnv.coordinator.controllers.size===1);let live=cancelEnv.coordinator.repository.planRow(cancelPlan.id);await cancelEnv.coordinator.cancel({assignmentId:cancelBase.assignment.id,planId:live.id,expectedVersion:live.rowVersion});const settled=await cancelEnv.coordinator.waitForIdle(live.id);assert.strictEqual(settled.state,"CANCELLED");assert.strictEqual(settled.steps[0].state,"CANCELLED");assert.ok(cancelEnv.coordinator.repository.incidents(live.id).some(item=>item.incidentType==="LATE_RESULT_REJECTED"));assert.ok(cancelEnv.artifacts.runs({assignmentId:cancelBase.assignment.id}).every(run=>run.state!=="RUNNING"));});cancelEnv.coordinator.dispose();cancelEnv.store.close();

    const pauseEnv=open(path.join(root,"pause"));delayedHandler(pauseEnv.handlers);const pauseBase=fixture(pauseEnv,"Pause fixture"),pausePlan=pauseEnv.coordinator.createPlan({assignmentId:pauseBase.assignment.id,workflowId:pauseBase.flow.id,scope:"CURRENT_STAGE"}).plan;
    await check("PAUSE_AFTER_CURRENT_AND_RESUME_ARE_REAL",async()=>{await pauseEnv.coordinator.launch({assignmentId:pauseBase.assignment.id,planId:pausePlan.id,expectedVersion:pausePlan.rowVersion,confirmLaunch:true});await waitUntil(()=>pauseEnv.coordinator.controllers.size===1);let live=pauseEnv.coordinator.repository.planRow(pausePlan.id);await pauseEnv.coordinator.pause({assignmentId:pauseBase.assignment.id,planId:live.id,expectedVersion:live.rowVersion});await pauseEnv.coordinator.waitForIdle(live.id);live=pauseEnv.coordinator.repository.planRow(live.id);assert.strictEqual(live.state,"PAUSED");assert.strictEqual(pauseEnv.artifacts.run({assignmentId:pauseBase.assignment.id,runId:live.parentRunId}).state,"PAUSED");await pauseEnv.coordinator.resume({assignmentId:pauseBase.assignment.id,planId:live.id,expectedVersion:live.rowVersion});const done=await pauseEnv.coordinator.waitForIdle(live.id);assert.strictEqual(done.state,"COMPLETED");});pauseEnv.coordinator.dispose();pauseEnv.store.close();

    const retryEnv=open(path.join(root,"retry"));let executions=0,original=retryEnv.handlers.get("DETERMINISTIC_STUD_CHECK");retryEnv.handlers.handlers.set("DETERMINISTIC_STUD_CHECK",Object.freeze({...original,maxRetries:1,execute:async()=>++executions===1?{status:"FAILED",error:"Synthetic transient failure."}:{status:"SUCCESS",output:{kind:"RETRIED_SUCCESS"}}}));const retryBase=fixture(retryEnv,"Retry fixture"),retryPlan=retryEnv.coordinator.createPlan({assignmentId:retryBase.assignment.id,workflowId:retryBase.flow.id,scope:"CURRENT_STAGE",resourceProfileId:"stud_resource_balanced"}).plan;
    await check("BOUNDED_RETRY_REUSES_IDEMPOTENCY_KEY_WITH_NEW_ATTEMPT",async()=>{await retryEnv.coordinator.launch({assignmentId:retryBase.assignment.id,planId:retryPlan.id,expectedVersion:retryPlan.rowVersion,confirmLaunch:true});let failed=await retryEnv.coordinator.waitForIdle(retryPlan.id);assert.strictEqual(failed.state,"PAUSED");assert.strictEqual(failed.steps[0].state,"FAILED");retryEnv.coordinator.retry({assignmentId:retryBase.assignment.id,planId:failed.id,stepId:failed.steps[0].id,expectedPlanVersion:failed.rowVersion,expectedStepVersion:failed.steps[0].rowVersion});failed=retryEnv.coordinator.repository.hydrate(failed.id);await retryEnv.coordinator.resume({assignmentId:retryBase.assignment.id,planId:failed.id,expectedVersion:failed.rowVersion});const done=await retryEnv.coordinator.waitForIdle(failed.id),attempts=retryEnv.coordinator.repository.attempts(done.steps[0].id,5);assert.strictEqual(done.state,"COMPLETED");assert.strictEqual(attempts.length,2);assert.strictEqual(attempts[0].idempotencyKey,attempts[1].idempotencyKey);});retryEnv.coordinator.dispose();retryEnv.store.close();

    const pressureResources=new TestResources(false),pressureEnv=open(path.join(root,"pressure"),{resources:pressureResources}),pressureBase=fixture(pressureEnv,"Resource pressure fixture"),pressurePlan=pressureEnv.coordinator.createPlan({assignmentId:pressureBase.assignment.id,workflowId:pressureBase.flow.id,scope:"CURRENT_STAGE"}).plan;
    await check("RESOURCE_PRESSURE_STOPS_NEW_WORK_AND_RESUMES_WITH_INCIDENT",async()=>{await pressureEnv.coordinator.launch({assignmentId:pressureBase.assignment.id,planId:pressurePlan.id,expectedVersion:pressurePlan.rowVersion,confirmLaunch:true});let paused=await pressureEnv.coordinator.waitForIdle(pressurePlan.id);assert.strictEqual(paused.state,"PAUSED");assert.strictEqual(paused.steps[0].attemptCount,0);assert.ok(pressureEnv.coordinator.repository.incidents(paused.id).some(item=>item.incidentType==="MEMORY_PRESSURE"));pressureResources.allow=true;await pressureEnv.coordinator.resume({assignmentId:pressureBase.assignment.id,planId:paused.id,expectedVersion:paused.rowVersion});const done=await pressureEnv.coordinator.waitForIdle(paused.id);assert.strictEqual(done.state,"COMPLETED");});pressureEnv.coordinator.dispose();pressureEnv.store.close();

    const restartEnv=open(path.join(root,"restart"));delayedHandler(restartEnv.handlers,{ignoresAbort:true});const restartBase=fixture(restartEnv,"Restart fixture"),restartPlan=restartEnv.coordinator.createPlan({assignmentId:restartBase.assignment.id,workflowId:restartBase.flow.id,scope:"CURRENT_STAGE"}).plan;await restartEnv.coordinator.launch({assignmentId:restartBase.assignment.id,planId:restartPlan.id,expectedVersion:restartPlan.rowVersion,confirmLaunch:true});await waitUntil(()=>restartEnv.coordinator.controllers.size===1);
    await check("RESTART_RECONCILES_ACTIVE_PLAN_STEP_ATTEMPT_AND_M6_RUNS",async()=>{const repository=new StudExecutionRepository(restartEnv.store),recovered=new StudRunCoordinator({store:restartEnv.store,repository,workflowService:restartEnv.workflow,artifactOperationsService:restartEnv.artifacts,requirementsService:restartEnv.requirements,assistantRuntime:restartEnv.assistant,handlerRegistry:restartEnv.handlers,resourceMonitor:new TestResources(),watchdog:new TestWatchdog(repository,restartEnv.artifacts)}),plan=recovered.repository.hydrate(restartPlan.id);assert.strictEqual(plan.state,"INTERRUPTED");assert.strictEqual(plan.steps[0].state,"INTERRUPTED");assert.strictEqual(recovered.repository.attempts(plan.steps[0].id,1)[0].state,"INTERRUPTED");assert.strictEqual(restartEnv.artifacts.run({assignmentId:restartBase.assignment.id,runId:plan.parentRunId}).state,"PAUSED");recovered.dispose();await restartEnv.coordinator.waitForIdle(restartPlan.id);});restartEnv.coordinator.dispose();restartEnv.store.close();

    await check("SUSPENSION_INTERRUPTS_WITHOUT_FAKE_RESTART_OR_LATE_OUTPUT",async()=>{
        const e=open(path.join(root,"suspend"));delayedHandler(e.handlers,{ignoresAbort:true});const f=fixture(e),p=e.coordinator.createPlan({assignmentId:f.assignment.id,workflowId:f.flow.id}).plan;
        await e.coordinator.launch({assignmentId:f.assignment.id,planId:p.id,expectedVersion:p.rowVersion,confirmLaunch:true});await waitUntil(()=>e.coordinator.controllers.size===1);
        const a=[...e.coordinator.controllers.keys()][0],s=e.coordinator.repository.steps(p.id)[0];e.coordinator.saveCheckpoint(p.id,s.id,a,{cursor:"synthetic-before-sleep",durableOutput:{completed:1}});
        e.coordinator.interruptOnSuspend();const done=await e.coordinator.waitForIdle(p.id);
        assert.strictEqual(done.state,"INTERRUPTED");assert.strictEqual(done.steps[0].state,"INTERRUPTED");assert.ok(!done.steps[0].outputSummary);
        assert.strictEqual(e.coordinator.repository.checkpoints(s.id,1)[0].cursor,"synthetic-before-sleep");
        const history=e.coordinator.missionState({assignmentId:f.assignment.id,planId:p.id});
        assert.ok(history.events.some(event=>/computer suspension/.test(event.summary)));assert.ok(!history.events.some(event=>/application restart/.test(event.summary)));
        assert.ok(e.artifacts.runs({assignmentId:f.assignment.id}).every(run=>run.state!=="RUNNING"));
        e.coordinator.dispose();e.store.close();
    });
    await check("TIMEOUT_FENCES_A_HANDLER_IGNORING_ABORT",async()=>{
        const e=open(path.join(root,"timeout")),h=e.handlers.get("DETERMINISTIC_STUD_CHECK");e.handlers.handlers.set(h.type,Object.freeze({...h,timeoutMs:1000,execute:()=>new Promise(resolve=>setTimeout(()=>resolve({status:"SUCCESS",output:{late:true}}),1300))}));
        const f=fixture(e),p=e.coordinator.createPlan({assignmentId:f.assignment.id,workflowId:f.flow.id}).plan;
        await e.coordinator.launch({assignmentId:f.assignment.id,planId:p.id,expectedVersion:p.rowVersion,confirmLaunch:true});const done=await e.coordinator.waitForIdle(p.id);
        assert.strictEqual(done.state,"FAILED");assert.strictEqual(e.coordinator.repository.attempts(done.steps[0].id,1)[0].failureCode,"TASK_TIMEOUT");
        await new Promise(resolve=>setTimeout(resolve,300));assert.ok(!e.coordinator.repository.steps(p.id)[0].outputSummary);
        e.coordinator.dispose();e.store.close();
    });
    await check("RECORDED_RESOURCE_PROFILE_CANNOT_REWRITE_EXECUTION_HISTORY",async()=>{
        const e=open(path.join(root,"profile-history")),f=fixture(e),input={name:"Recorded",maxLightTasks:1,maxNetworkTasks:0,maxModelTasks:0,minAvailableMemoryBytes:268435456,maxModelContext:2048,pauseOnBattery:false,pauseOnMemoryPressure:true,keepAwake:false,timeoutMs:60000,maxRetries:0},profile=e.coordinator.saveProfile(input);
        e.coordinator.createPlan({assignmentId:f.assignment.id,workflowId:f.flow.id,resourceProfileId:profile.id});
        expect("PROFILE_IN_USE",()=>e.coordinator.saveProfile({...input,id:profile.id,expectedVersion:profile.rowVersion,maxModelTasks:1}));
        e.coordinator.dispose();e.store.close();
    });
    await check("WATCHDOG_EVENT_SUMMARY_RESPECTS_M6_BOUND_WITHOUT_LOSING_INCIDENT_DETAIL",async()=>{
        const e=open(path.join(root,"watchdog-bound")),f=fixture(e),created=e.coordinator.createPlan({assignmentId:f.assignment.id,workflowId:f.flow.id}).plan;
        let run=e.artifacts.createRun({assignmentId:f.assignment.id,workflowId:f.flow.id,operationType:"ASSIGNMENT_EXECUTION_PLAN",actor:"WORKFLOW",progressMode:"NONE",statusSummary:"Synthetic watchdog bound",canPause:true,canCancel:true});
        run=e.artifacts.transitionRun({runId:run.id,action:"START",expectedVersion:run.rowVersion,progressMode:"NONE",statusSummary:"Synthetic watchdog bound active"});
        const plan=e.coordinator.repository.updatePlan(e.coordinator.repository.planRow(created.id),{state:"RUNNING",parentRunId:run.id,statusSummary:"Synthetic watchdog bound"}),watchdog=new StudExecutionWatchdog({repository:e.coordinator.repository,artifactOperationsService:e.artifacts}),detail="x".repeat(1500);
        const incident=watchdog.record({planId:plan.id,runId:run.id,assignmentId:f.assignment.id,workflowId:f.flow.id,incidentType:"UNKNOWN",observedCondition:detail,policyResponse:"WARN"}),event=e.artifacts.events({assignmentId:f.assignment.id,runId:run.id,limit:10})[0];
        assert.strictEqual(incident.observedCondition.length,1500);assert.strictEqual(event.summary.length,1000);watchdog.dispose();await e.coordinator.cancel({assignmentId:f.assignment.id,planId:plan.id,expectedVersion:plan.rowVersion});e.coordinator.dispose();e.store.close();
    });
    const migrationRoot=path.join(root,"migration");let migration=open(migrationRoot),legacy=migration.store.createEntity("ASSIGNMENT",{title:"Existing v25 Assignment"});migration.coordinator.dispose();migration.store.close();stripV26(path.join(migrationRoot,"academic.sqlite"));migration=open(migrationRoot);
    await check("V25_TO_V26_MIGRATION_PRESERVES_WITHOUT_FABRICATION",async()=>{assert.strictEqual(migration.store.schemaInfo().version,27);assert.ok(migration.store.getEntity("ASSIGNMENT",legacy.id));assert.strictEqual(migration.store.db.prepare("SELECT COUNT(*) count FROM stud_execution_plans").get().count,0);assert.deepStrictEqual(migration.store.db.prepare("PRAGMA foreign_key_check").all(),[]);});migration.coordinator.dispose();migration.store.close();

    await check("MIGRATION_RETAINS_ACTUAL_M6_HISTORY_AND_ARTIFACT_LINKS",()=>{
        const historyRoot=path.join(root,"historical-events");let e=open(historyRoot),f=fixture(e),note=e.store.createEntity("NOTE",{assignmentId:f.assignment.id,courseId:f.course.id,title:"Historical note",content:"Synthetic"});
        e.artifacts.registerArtifact({assignmentId:f.assignment.id,canonicalObjectType:"NOTE",canonicalObjectId:note.id,artifactType:"NOTE",origin:"USER_CREATED"});
        const before=e.store.db.prepare("SELECT * FROM stud_operation_events ORDER BY event_sequence").all(),links=e.store.db.prepare("SELECT * FROM stud_operation_event_artifacts").all();
        assert.ok(before.length&&links.length);e.coordinator.dispose();e.store.close();stripV26(path.join(historyRoot,"academic.sqlite"));e=open(historyRoot);
        assert.deepStrictEqual(e.store.db.prepare("SELECT * FROM stud_operation_events ORDER BY event_sequence").all(),before);assert.deepStrictEqual(e.store.db.prepare("SELECT * FROM stud_operation_event_artifacts").all(),links);
        assert.deepStrictEqual(e.store.db.prepare("PRAGMA foreign_key_check").all(),[]);e.coordinator.dispose();e.store.close();
    });
    const rollbackRoot=path.join(root,"rollback");let rollback=open(rollbackRoot),preserved=rollback.store.createEntity("ASSIGNMENT",{title:"Rollback Assignment"});rollback.coordinator.dispose();rollback.store.close();stripV26(path.join(rollbackRoot,"academic.sqlite"));const broken=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));broken.exec("CREATE TABLE stud_execution_plans (id TEXT PRIMARY KEY);");broken.close();
    await check("V26_MIGRATION_FAILURE_ROLLS_BACK_ATOMICALLY",async()=>{assert.throws(()=>open(rollbackRoot),error=>error&&error.code==="DATABASE_OPEN_FAILED"&&/migration 26/i.test(error.details&&error.details.cause||""));const inspect=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_schema_migrations WHERE version=26").get().count,0);assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_assignments WHERE id=?").get(preserved.id).count,1);assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name='stud_execution_steps'").get().count,0);inspect.close();});

    console.log(`STUD M13 RUN COORDINATOR: ${passed} PASSED`);
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
