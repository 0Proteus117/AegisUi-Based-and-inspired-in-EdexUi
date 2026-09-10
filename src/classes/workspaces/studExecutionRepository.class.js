"use strict";

const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studExecutionModel.class.js");

function camel(row){
    if(!row)return null;
    const result={};
    Object.entries(row).forEach(([key,value])=>{result[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase())]=["supports_pause","supports_cancel","can_skip","pause_on_battery","pause_on_memory_pressure","keep_awake","built_in"].includes(key)?Boolean(value):value;});
    for(const [raw,name,fallback] of [["inputSnapshotJson","inputSnapshot",{}],["outputSummaryJson","outputSummary",null],["capabilitiesJson","capabilities",{}],["metadataJson","metadata",{}],["probeResultJson","probeResult",{}],["snapshotJson","snapshot",{}],["durableOutputJson","durableOutput",null]]){
        if(Object.prototype.hasOwnProperty.call(result,raw)){result[name]=Domain.parse(result[raw],fallback);delete result[raw];}
    }
    return result;
}

class StudExecutionRepository{
    constructor(store){if(!store)throw new Error("StudAcademicStore is required.");this.store=store;store.initialize();this.db=store.db;}
    transaction(work){return this.store.transaction(work);}
    assignment(id){const value=this.store.getEntity("ASSIGNMENT",Academic.safeId(id,"Assignment ID"));if(!value)throw new Academic.StudError("NOT_FOUND","Assignment does not exist.");return value;}
    workflow(id){const row=this.db.prepare("SELECT * FROM stud_workflow_instances WHERE id=?").get(Academic.safeId(id,"Workflow ID"));if(!row)throw new Academic.StudError("NOT_FOUND","Workflow does not exist.");return camel(row);}
    planRow(id){const row=camel(this.db.prepare("SELECT * FROM stud_execution_plans WHERE id=?").get(Academic.safeId(id,"Execution Plan ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Execution Plan does not exist.");return row;}
    stepRow(id){const row=camel(this.db.prepare("SELECT * FROM stud_execution_steps WHERE id=?").get(Academic.safeId(id,"Execution Step ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Execution Step does not exist.");return row;}
    attemptRow(id){const row=camel(this.db.prepare("SELECT * FROM stud_execution_attempts WHERE id=?").get(Academic.safeId(id,"Execution Attempt ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Execution Attempt does not exist.");return row;}
    assertVersion(row,expected,code){const version=Domain.expectedVersion(expected);if(row.rowVersion!==version)throw new Academic.StudError(code,"Execution state changed before this action.",{expected:version,actual:row.rowVersion});}

    createPlan(value){
        const id=Academic.createId("execution_plan"),now=Academic.now();
        this.db.prepare(`INSERT INTO stud_execution_plans
            (id,assignment_id,workflow_id,workflow_row_version,workflow_fingerprint,scope,resource_profile_id,routing_policy,pinned_model_id,launch_policy,state,priority,input_hash,topology_hash,parent_run_id,status_summary,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(id,value.assignmentId,value.workflowId,value.workflowRowVersion,value.workflowFingerprint,value.scope,value.resourceProfileId,value.routingPolicy,value.pinnedModelId,value.launchPolicy,"DRAFT",value.priority,value.inputHash,value.topologyHash,null,value.statusSummary,now,now);
        return this.planRow(id);
    }
    insertStep(plan,value){
        const id=Academic.createId("execution_step"),now=Academic.now();
        this.db.prepare(`INSERT INTO stud_execution_steps
            (id,plan_id,assignment_id,workflow_node_id,task_type,handler_type,execution_class,state,priority,resource_class,capability,selected_model_id,idempotency_class,idempotency_key,recovery_class,supports_pause,supports_cancel,can_skip,timeout_ms,max_retries,input_snapshot_json,input_hash,state_reason,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(id,plan.id,plan.assignmentId,value.workflowNodeId,value.taskType,value.handlerType,value.executionClass,value.state||"PENDING",value.priority||"NORMAL",value.resourceClass,value.capability||null,null,value.idempotencyClass,value.idempotencyKey,value.recoveryClass,value.supportsPause?1:0,value.supportsCancel?1:0,value.canSkip?1:0,value.timeoutMs,value.maxRetries,value.inputSnapshotJson,value.inputHash,value.stateReason||null,now,now);
        this.db.prepare("INSERT INTO stud_task_handler_snapshots (step_id,handler_type,contract_version,capabilities_json,snapshot_hash,created_at) VALUES (?,?,?,?,?,?)").run(id,value.handlerType||"NONE",value.contractVersion||1,value.capabilitiesJson||"{}",value.handlerHash||Domain.hash({handlerType:value.handlerType||"NONE"}),now);
        return this.stepRow(id);
    }
    insertDependency(stepId,dependsOnStepId){this.db.prepare("INSERT INTO stud_execution_step_dependencies (step_id,depends_on_step_id) VALUES (?,?)").run(stepId,dependsOnStepId);}
    dependencies(planId){return Object.freeze(this.db.prepare(`SELECT d.* FROM stud_execution_step_dependencies d JOIN stud_execution_steps s ON s.id=d.step_id WHERE s.plan_id=? ORDER BY d.step_id,d.depends_on_step_id`).all(planId).map(camel));}
    steps(planId,limit=Domain.LIMITS.steps){return Object.freeze(this.db.prepare("SELECT * FROM stud_execution_steps WHERE plan_id=? ORDER BY created_at,id LIMIT ?").all(planId,Math.min(Number(limit)||Domain.LIMITS.steps,Domain.LIMITS.steps)).map(row=>Object.freeze(camel(row))));}
    attempts(stepId,limit=Domain.LIMITS.attempts){return Object.freeze(this.db.prepare("SELECT * FROM stud_execution_attempts WHERE step_id=? ORDER BY attempt_number DESC LIMIT ?").all(stepId,Math.min(Number(limit)||Domain.LIMITS.attempts,Domain.LIMITS.attempts)).map(row=>Object.freeze(camel(row))));}
    checkpoints(stepId,limit=Domain.LIMITS.checkpoints){return Object.freeze(this.db.prepare("SELECT * FROM stud_execution_checkpoints WHERE step_id=? ORDER BY created_at DESC,id DESC LIMIT ?").all(stepId,Math.min(Number(limit)||Domain.LIMITS.checkpoints,Domain.LIMITS.checkpoints)).map(row=>Object.freeze(camel(row))));}
    hydrate(id){
        const plan=this.planRow(id),steps=this.steps(plan.id),dependencies=this.dependencies(plan.id);
        return Object.freeze({...plan,steps,dependencies});
    }
    currentForAssignment(assignmentId){const assignment=this.assignment(assignmentId),row=this.db.prepare("SELECT id FROM stud_execution_plans WHERE assignment_id=? ORDER BY CASE WHEN state IN ('READY','RUNNING','PAUSED','WAITING_HUMAN','WAITING_EXTERNAL','INTERRUPTED') THEN 0 ELSE 1 END,created_at DESC LIMIT 1").get(assignment.id);return row?this.hydrate(row.id):null;}
    planSummaries(assignmentId){this.assignment(assignmentId);return Object.freeze(this.db.prepare("SELECT id,scope,state,created_at,started_at,finished_at,status_summary FROM stud_execution_plans WHERE assignment_id=? ORDER BY created_at DESC,id DESC LIMIT 20").all(assignmentId).map(camel));}
    listPlans(assignmentId,limit=25,before=null){const assignment=this.assignment(assignmentId),safe=Math.min(Math.max(Number(limit)||25,1),Domain.LIMITS.plans),rows=before?this.db.prepare("SELECT id FROM stud_execution_plans WHERE assignment_id=? AND created_at<? ORDER BY created_at DESC,id DESC LIMIT ?").all(assignment.id,before,safe):this.db.prepare("SELECT id FROM stud_execution_plans WHERE assignment_id=? ORDER BY created_at DESC,id DESC LIMIT ?").all(assignment.id,safe);return Object.freeze(rows.map(row=>this.hydrate(row.id)));}
    updatePlan(plan,next,expected=plan.rowVersion){
        const now=Academic.now(),result=this.db.prepare(`UPDATE stud_execution_plans SET state=?,parent_run_id=?,user_confirmed_at=?,started_at=?,finished_at=?,status_summary=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`).run(next.state===undefined?plan.state:next.state,next.parentRunId===undefined?plan.parentRunId:next.parentRunId,next.userConfirmedAt===undefined?plan.userConfirmedAt:next.userConfirmedAt,next.startedAt===undefined?plan.startedAt:next.startedAt,next.finishedAt===undefined?plan.finishedAt:next.finishedAt,next.statusSummary===undefined?plan.statusSummary:next.statusSummary,now,plan.id,expected);
        if(!result.changes)throw new Academic.StudError("STALE_EXECUTION_PLAN","Execution Plan changed before this action.");
        return this.planRow(plan.id);
    }
    updateStep(step,next,expected=step.rowVersion){
        const now=Academic.now(),result=this.db.prepare(`UPDATE stud_execution_steps SET state=?,selected_model_id=?,attempt_count=?,active_attempt_id=?,output_summary_json=?,checkpoint_cursor=?,m6_run_id=?,state_reason=?,started_at=?,finished_at=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`).run(next.state===undefined?step.state:next.state,next.selectedModelId===undefined?step.selectedModelId:next.selectedModelId,next.attemptCount===undefined?step.attemptCount:next.attemptCount,next.activeAttemptId===undefined?step.activeAttemptId:next.activeAttemptId,next.outputSummaryJson===undefined?(step.outputSummary===null?null:Domain.canonicalJson(step.outputSummary)):next.outputSummaryJson,next.checkpointCursor===undefined?step.checkpointCursor:next.checkpointCursor,next.m6RunId===undefined?step.m6RunId:next.m6RunId,next.stateReason===undefined?step.stateReason:next.stateReason,next.startedAt===undefined?step.startedAt:next.startedAt,next.finishedAt===undefined?step.finishedAt:next.finishedAt,now,step.id,expected);
        if(!result.changes)throw new Academic.StudError("STALE_EXECUTION_STEP","Execution Step changed before this action.");
        return this.stepRow(step.id);
    }
    claimStep(stepId,expectedVersion){
        const step=this.stepRow(stepId);this.assertVersion(step,expectedVersion,"STALE_EXECUTION_STEP");
        if(step.state!=="READY")throw new Academic.StudError("STEP_NOT_READY","Execution Step is not ready to claim.");
        const now=Academic.now(),result=this.db.prepare("UPDATE stud_execution_steps SET state='RUNNING',attempt_count=attempt_count+1,started_at=COALESCE(started_at,?),row_version=row_version+1,updated_at=? WHERE id=? AND row_version=? AND state='READY'").run(now,now,step.id,step.rowVersion);
        if(!result.changes)throw new Academic.StudError("DUPLICATE_STEP_CLAIM","Execution Step was already claimed.");
        return this.stepRow(step.id);
    }
    insertAttempt(step,value){
        const id=Academic.createId("execution_attempt"),number=step.attemptCount,now=Academic.now();
        this.db.prepare(`INSERT INTO stud_execution_attempts (id,step_id,plan_id,assignment_id,attempt_number,state,runtime_request_id,idempotency_key,m6_run_id,model_id,route_decision_id,input_hash,started_at,row_version) VALUES (?,?,?,?,?,'RUNNING',?,?,?,?,?,?,?,1)`).run(id,step.id,step.planId,step.assignmentId,number,value.runtimeRequestId,step.idempotencyKey,value.m6RunId,value.modelId||null,value.routeDecisionId||null,step.inputHash,now);
        this.db.prepare("UPDATE stud_execution_steps SET active_attempt_id=?,m6_run_id=?,selected_model_id=?,row_version=row_version+1,updated_at=? WHERE id=?").run(id,value.m6RunId,value.modelId||null,now,step.id);
        return this.attemptRow(id);
    }
    finishAttempt(attempt,state,value={}){
        const terminal=Academic.enumValue(state,["COMPLETED","FAILED","CANCELLED","INTERRUPTED"],"Attempt state"),now=Academic.now(),result=this.db.prepare(`UPDATE stud_execution_attempts SET state=?,failure_code=?,failure_summary=?,retry_reason=?,watchdog_incident_id=?,finished_at=?,row_version=row_version+1 WHERE id=? AND row_version=? AND state='RUNNING'`).run(terminal,value.failureCode||null,value.failureSummary||null,value.retryReason||null,value.watchdogIncidentId||null,now,attempt.id,attempt.rowVersion);
        if(!result.changes)throw new Academic.StudError("LATE_RESULT_REJECTED","Attempt is no longer active.");
        return this.attemptRow(attempt.id);
    }
    insertCheckpoint(value){const id=Academic.createId("execution_checkpoint"),now=Academic.now();this.db.prepare(`INSERT INTO stud_execution_checkpoints (id,plan_id,step_id,attempt_id,handler_type,input_hash,cursor,durable_output_json,output_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,value.planId,value.stepId,value.attemptId,value.handlerType,value.inputHash,value.cursor||null,value.durableOutputJson||null,value.outputHash||null,now);return Object.freeze(camel(this.db.prepare("SELECT * FROM stud_execution_checkpoints WHERE id=?").get(id)));}

    profiles(){return Object.freeze(this.db.prepare("SELECT * FROM stud_resource_profiles ORDER BY built_in DESC,profile_type,name").all().map(row=>Object.freeze(camel(row))));}
    profile(id){const row=camel(this.db.prepare("SELECT * FROM stud_resource_profiles WHERE id=?").get(Academic.safeId(id,"Resource Profile ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Resource Profile does not exist.");return row;}
    saveCustomProfile(value){const now=Academic.now(),id=value.id||Academic.createId("resource_profile");if(value.id){const current=this.profile(id);if(current.builtIn)throw new Academic.StudError("POLICY_BLOCKED","Built-in Resource Profiles cannot be edited.");this.assertVersion(current,value.expectedVersion,"STALE_RESOURCE_PROFILE");const result=this.db.prepare(`UPDATE stud_resource_profiles SET name=?,max_light_tasks=?,max_network_tasks=?,max_model_tasks=?,min_available_memory_bytes=?,max_model_context=?,pause_on_battery=?,pause_on_memory_pressure=?,keep_awake=?,timeout_ms=?,max_retries=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`).run(value.name,value.maxLightTasks,value.maxNetworkTasks,value.maxModelTasks,value.minAvailableMemoryBytes,value.maxModelContext,value.pauseOnBattery?1:0,value.pauseOnMemoryPressure?1:0,value.keepAwake?1:0,value.timeoutMs,value.maxRetries,now,id,current.rowVersion);if(!result.changes)throw new Academic.StudError("STALE_RESOURCE_PROFILE","Resource Profile changed before save.");}else this.db.prepare(`INSERT INTO stud_resource_profiles (id,profile_type,name,max_light_tasks,max_network_tasks,max_model_tasks,min_available_memory_bytes,max_model_context,pause_on_battery,pause_on_memory_pressure,keep_awake,timeout_ms,max_retries,built_in,row_version,created_at,updated_at) VALUES (?,'CUSTOM',?,?,?,?,?,?,?,?,?,?,?,0,1,?,?)`).run(id,value.name,value.maxLightTasks,value.maxNetworkTasks,value.maxModelTasks,value.minAvailableMemoryBytes,value.maxModelContext,value.pauseOnBattery?1:0,value.pauseOnMemoryPressure?1:0,value.keepAwake?1:0,value.timeoutMs,value.maxRetries,now,now);return this.profile(id);}

    upsertModel(value){const now=Academic.now(),existing=this.db.prepare("SELECT id FROM stud_model_inventory WHERE backend='OLLAMA_LOOPBACK' AND model_identity=?").get(value.modelIdentity),id=existing&&existing.id||Academic.createId("local_model");this.db.prepare(`INSERT INTO stud_model_inventory (id,backend,model_identity,quantization,size_bytes,context_window,availability,last_probe_at,runtime_version,metadata_json,row_version,created_at,updated_at) VALUES (?,'OLLAMA_LOOPBACK',?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(backend,model_identity) DO UPDATE SET quantization=excluded.quantization,size_bytes=excluded.size_bytes,context_window=excluded.context_window,availability=excluded.availability,last_probe_at=excluded.last_probe_at,runtime_version=excluded.runtime_version,metadata_json=excluded.metadata_json,row_version=stud_model_inventory.row_version+1,updated_at=excluded.updated_at`).run(id,value.modelIdentity,value.quantization||null,value.sizeBytes||null,value.contextWindow||null,value.availability,value.lastProbeAt||now,value.runtimeVersion||null,value.metadataJson||"{}",now,now);return this.model(id);}
    model(id){const row=camel(this.db.prepare("SELECT * FROM stud_model_inventory WHERE id=?").get(Academic.safeId(id,"Model ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Local model does not exist.");return row;}
    models(){return Object.freeze(this.db.prepare("SELECT * FROM stud_model_inventory ORDER BY model_identity LIMIT 100").all().map(row=>Object.freeze(camel(row))));}
    assessModel(value){const id=Academic.createId("model_assessment"),now=Academic.now();this.db.prepare(`INSERT INTO stud_model_capability_assessments (id,model_id,capability,assessment,probe_version,probe_result_json,probe_hash,hardware_class,measured_latency_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,value.modelId,value.capability,value.assessment,value.probeVersion,value.probeResultJson,value.probeHash,value.hardwareClass||null,value.measuredLatencyMs||null,now);return Object.freeze(camel(this.db.prepare("SELECT * FROM stud_model_capability_assessments WHERE id=?").get(id)));}
    latestAssessment(modelId,capability){return camel(this.db.prepare("SELECT * FROM stud_model_capability_assessments WHERE model_id=? AND capability=? ORDER BY created_at DESC,id DESC LIMIT 1").get(modelId,capability));}
    insertRoute(value){const id=Academic.createId("model_route"),now=Academic.now();this.db.prepare(`INSERT INTO stud_model_routing_decisions (id,plan_id,step_id,attempt_id,capability,routing_policy,requested_model_id,selected_model_id,outcome,reason,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,value.planId,value.stepId,value.attemptId||null,value.capability,value.routingPolicy,value.requestedModelId||null,value.selectedModelId||null,value.outcome,value.reason,value.snapshotJson,now);return Object.freeze(camel(this.db.prepare("SELECT * FROM stud_model_routing_decisions WHERE id=?").get(id)));}
    routes(stepId,limit=20){return Object.freeze(this.db.prepare("SELECT * FROM stud_model_routing_decisions WHERE step_id=? ORDER BY created_at DESC,id DESC LIMIT ?").all(stepId,Math.min(Number(limit)||20,100)).map(row=>Object.freeze(camel(row))));}

    incident(value){const id=Academic.createId("watchdog_incident"),now=Academic.now();this.db.prepare(`INSERT INTO stud_watchdog_incidents (id,plan_id,step_id,attempt_id,run_id,incident_type,observed_condition,policy_response,resolution,created_at,resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,value.planId,value.stepId||null,value.attemptId||null,value.runId||null,value.incidentType,value.observedCondition,value.policyResponse,value.resolution||null,now,value.resolution?now:null);return Object.freeze(camel(this.db.prepare("SELECT * FROM stud_watchdog_incidents WHERE id=?").get(id)));}
    incidents(planId,limit=Domain.LIMITS.incidents){return Object.freeze(this.db.prepare("SELECT * FROM stud_watchdog_incidents WHERE plan_id=? ORDER BY created_at DESC,id DESC LIMIT ?").all(planId,Math.min(Number(limit)||Domain.LIMITS.incidents,Domain.LIMITS.incidents)).map(row=>Object.freeze(camel(row))));}
    reconcileInterrupted(){
        const now=Academic.now(),plans=this.db.prepare("SELECT id FROM stud_execution_plans WHERE state='RUNNING'").all();
        this.transaction(()=>{this.db.prepare("UPDATE stud_execution_attempts SET state='INTERRUPTED',failure_code='APPLICATION_RESTART',failure_summary='Application stopped before the attempt completed.',finished_at=?,row_version=row_version+1 WHERE state='RUNNING'").run(now);this.db.prepare("UPDATE stud_execution_steps SET state='INTERRUPTED',state_reason='Application restarted; review recovery options.',active_attempt_id=NULL,row_version=row_version+1,updated_at=? WHERE state='RUNNING'").run(now);this.db.prepare("UPDATE stud_execution_plans SET state='INTERRUPTED',status_summary='Execution interrupted by application restart.',row_version=row_version+1,updated_at=? WHERE state='RUNNING'").run(now);});
        return Object.freeze(plans.map(row=>row.id));
    }
}

module.exports=Object.freeze({StudExecutionRepository,camel});
