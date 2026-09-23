"use strict";

const Academic=require("./studAcademicModel.class.js");
const fs=require("fs");
const Domain=require("./studExecutionModel.class.js");
const {StudExecutionRepository}=require("./studExecutionRepository.class.js");
const {StudTaskHandlerRegistry}=require("./studTaskHandlerRegistry.class.js");
const {StudModelRouter}=require("./studModelRouter.class.js");
const {StudResourceMonitor,StudExecutionWatchdog}=require("./studResourceMonitor.class.js");

const TERMINAL_PLAN=new Set(["COMPLETED","FAILED","CANCELLED"]);
const TERMINAL_STEP=new Set(["COMPLETED","FAILED","CANCELLED","SKIPPED","UNSUPPORTED"]);

function boundedObject(value,depth=0){
    if(depth>5)return null;
    if(Array.isArray(value))return value.slice(0,30).map(item=>boundedObject(item,depth+1));
    if(value&&typeof value==="object")return Object.keys(value).slice(0,60).reduce((result,key)=>{if(!/(token|secret|password|cookie|credential|signed.?url|local.?path)/i.test(key))result[key]=boundedObject(value[key],depth+1);return result;},{});
    return typeof value==="string"?value.slice(0,4000):value;
}
function exactPlanFingerprint(workflow){return Domain.hash({id:workflow.id,rowVersion:workflow.rowVersion,templateFingerprint:workflow.templateFingerprint,nodes:workflow.graph.nodes.map(node=>({id:node.id,rowVersion:node.rowVersion,state:node.state,title:node.title,semanticType:node.semanticType})),edges:workflow.graph.edges.map(edge=>({from:edge.fromNodeId,to:edge.toNodeId}))});}
function executionTopology(nodes){return nodes.map(node=>({id:node.id,title:node.title,semanticType:node.semanticType,predecessors:[...(node.predecessorIds||[])].sort()}));}

class StudRunCoordinator{
    constructor(options={}){
        if(!options.store||!options.workflowService||!options.artifactOperationsService)throw new Error("M13 coordinator requires store, Workflow and M6 Artifact Operations services.");
        this.store=options.store;this.repository=options.repository||new StudExecutionRepository(this.store);this.workflow=options.workflowService;this.artifacts=options.artifactOperationsService;this.requirements=options.requirementsService||null;this.research=options.researchPlanService||null;this.composition=options.compositionService||null;this.claimEvidence=options.claimEvidenceService||null;this.assistant=options.assistantRuntime||null;
        this.handlers=options.handlerRegistry||new StudTaskHandlerRegistry({assistantRuntime:this.assistant,compositionService:this.composition,humanisationService:options.humanisationService,lecturerCommitteeService:options.lecturerCommitteeService});
        this.router=options.modelRouter||new StudModelRouter({repository:this.repository,assistantRuntime:this.assistant});
        this.resources=options.resourceMonitor||new StudResourceMonitor({powerMonitor:options.powerMonitor,powerSaveBlocker:options.powerSaveBlocker,diskProbe:options.diskProbe||(()=>{try{const info=fs.statfsSync(this.store.root);return info.bavail*info.bsize;}catch(_error){return null;}})});
        this.watchdog=options.watchdog||new StudExecutionWatchdog({repository:this.repository,artifactOperationsService:this.artifacts});
        this.controllers=new Map();this.activeSchedules=new Map();this.timedOut=new Set();this.suspended=false;this.disposed=false;
        this.resources.setActiveModelTasks(()=>[...this.controllers.values()].filter(item=>item.resourceClass.startsWith("MODEL")).length);
        if(this.resources.setSuspendHandler)this.resources.setSuspendHandler(()=>this.interruptOnSuspend());
        this.interruptedPlanIds=this.repository.reconcileInterrupted();
        this.interruptedPlanIds.forEach(planId=>this.reconcileOperationalRuns(planId));
    }
    reconcileOperationalRuns(planId,cause="application restart"){
        const plan=this.repository.planRow(planId);
        for(const step of this.repository.steps(plan.id).filter(item=>item.state==="INTERRUPTED"&&item.m6RunId)){
            const run=this.artifacts.run({assignmentId:plan.assignmentId,runId:step.m6RunId});
            if(run.state==="RUNNING")this.artifacts.transitionRun({runId:run.id,action:"FAIL",expectedVersion:run.rowVersion,progressMode:run.progressMode,statusSummary:`Interrupted by ${cause}`,errorSummary:"The bounded task stopped before completion."});
        }
        if(plan.parentRunId){const parent=this.artifacts.run({assignmentId:plan.assignmentId,runId:plan.parentRunId});if(parent.state==="RUNNING"&&parent.canPause)this.artifacts.transitionRun({runId:parent.id,action:"PAUSE",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:`Execution interrupted by ${cause}`});}
        this.event(plan,null,"EXECUTION_PLAN_INTERRUPTED",`Execution was interrupted by ${cause}.`,"NOTICE");
    }
    interruptOnSuspend(){
        for(const planId of this.activeSchedules.keys()){
            const plan=this.repository.planRow(planId);if(!["RUNNING","PAUSED"].includes(plan.state))continue;
            this.repository.updatePlan(plan,{state:"INTERRUPTED",statusSummary:"Computer suspended. Explicitly resume after wake; no automatic replay."});
            for(const [attemptId,owned] of this.controllers){if(owned.planId!==plan.id)continue;this.watchdog.clear(attemptId);const attempt=this.repository.attemptRow(attemptId);if(attempt.state==="RUNNING")this.repository.finishAttempt(attempt,"INTERRUPTED",{failureCode:"APP_SUSPENDED",failureSummary:"Computer suspended during the bounded operation."});const step=this.repository.stepRow(owned.stepId);this.repository.updateStep(step,{state:"INTERRUPTED",activeAttemptId:null,stateReason:"Execution interrupted by suspension."});owned.controller.abort();}
            this.reconcileOperationalRuns(plan.id,"computer suspension");
            this.watchdog.record({planId:plan.id,runId:plan.parentRunId,assignmentId:plan.assignmentId,workflowId:plan.workflowId,incidentType:"APP_SUSPENDED",observedCondition:"Computer suspended; in-flight attempts were interrupted, not timed out.",policyResponse:"REQUEST_HUMAN"});
        }
        this.resources.releaseKeepAwake();
    }
    assignment(id){return this.repository.assignment(id);}
    scopedPlan(assignmentId,planId){const assignment=this.assignment(assignmentId),plan=this.repository.planRow(planId);if(plan.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_EXECUTION","Execution Plan does not belong to this Assignment.");return plan;}
    scopedStep(plan,stepId){const step=this.repository.stepRow(stepId);if(step.planId!==plan.id||step.assignmentId!==plan.assignmentId)throw new Academic.StudError("CROSS_PLAN_EXECUTION_STEP","Execution Step does not belong to this Plan.");return step;}
    contextSnapshot(assignmentId,workflow){
        const assignment=this.assignment(assignmentId),contractState=this.requirements?this.requirements.state(assignment.id):{current:null,draft:null},contract=contractState.current||null,researchState=this.research?this.research.state({assignmentId:assignment.id}):null,compositionState=this.composition?this.composition.state({assignmentId:assignment.id,draftLimit:10}):null,composition=compositionState&&(compositionState.current||compositionState.draft)||null;
        // Inspection timestamps are not intellectual input. M1 refreshes checkedAt on
        // every read; retaining it here would make an unchanged contract look stale.
        return boundedObject({assignment:{id:assignment.id,courseId:assignment.courseId,title:assignment.title,dueDate:assignment.dueDate},workflow:{id:workflow.id,templateFingerprint:workflow.templateFingerprint},contract:contract&&{id:contract.id,revision:contract.revision,hash:contract.contractHash,lifecycle:contract.lifecycle,completeness:contract.completeness,freshness:contract.freshness&&{reviewCondition:contract.freshness.reviewCondition,details:contract.freshness.details}},research:researchState&&researchState.current&&{id:researchState.current.id,revision:researchState.current.revision,hash:researchState.current.planHash,lifecycle:researchState.current.lifecycle},composition:composition&&{id:composition.id,revision:composition.revision,hash:composition.planHash,lifecycle:composition.lifecycle},limitations:[]});
    }
    draftInput(base,sectionId=null){
        if(!this.composition||!base.composition||base.composition.lifecycle!=="REVIEWED")return {...base,limitations:[...(base.limitations||[]),"No current reviewed Composition Plan is available."]};
        const composition=this.composition.repository.planRow(base.composition.id);
        if(!base.contract||composition.requirementsContractId!==base.contract.id||composition.requirementsContractHash!==base.contract.hash)throw new Academic.StudError("RUN_INPUT_CHANGED","The reviewed Composition Plan does not reference the current approved Requirements Contract. Review it before drafting.");
        const row=sectionId?this.repository.db.prepare("SELECT id FROM stud_composition_sections WHERE plan_id=? AND id=?").get(base.composition.id,Academic.safeId(sectionId,"Section ID")):this.repository.db.prepare("SELECT id FROM stud_composition_sections WHERE plan_id=? ORDER BY section_order,id LIMIT 1").get(base.composition.id);
        if(sectionId&&!row)throw new Academic.StudError("CROSS_PLAN_SECTION","Selected Section does not belong to the current reviewed Composition Plan.");
        if(!row)return {...base,limitations:[...(base.limitations||[]),"Reviewed Composition Plan contains no Section."]};
        const context=this.composition.sectionContext({assignmentId:base.assignment.id,planId:base.composition.id,sectionId:row.id});
        const requirements=base.contract?this.repository.db.prepare("SELECT id,requirement_type,label,display_value,normalized_value,unit,resolution_state FROM stud_requirement_items WHERE contract_id=? ORDER BY item_order,id LIMIT 50").all(base.contract.id):[];
        const coverage={linkedClaims:context.claims.length,inspectedClaims:Math.min(24,context.claims.length),includedClaims:0,unreviewedClaims:0,unusableEvidence:0,omittedLinks:0},limitations=[...(base.limitations||[])],citations=new Map();
        const claims=context.claims.slice(0,24).filter(claim=>{if(claim.lifecycle!=="REVIEWED"){coverage.unreviewedClaims++;return false;}return true;}).map(claim=>{
            const all=claim.links||[];coverage.omittedLinks+=Math.max(0,all.length-12);
            const links=all.slice(0,12).filter(link=>{const e=link.evidence,usable=link.lifecycle==="REVIEWED"&&e&&e.reviewState==="REVIEWED"&&e.freshness&&e.freshness.state==="CURRENT";if(!usable)coverage.unusableEvidence++;return usable;}).map(link=>{
                const e=link.evidence;if(e.citationPaperId){const paper=this.store.getEntity("RESEARCH_PAPER",e.citationPaperId);if(paper)citations.set(paper.id,{id:paper.id,title:paper.title,authors:paper.authors,year:paper.year,doi:paper.doi||null});}
                return {id:link.id,relationshipType:link.relationship_type,reviewState:link.lifecycle,evidence:{id:e.id,excerpt:e.excerpt,reviewHash:e.reviewHash,sourceSnapshotHash:e.sourceSnapshotHash,locator:e.locator,documentId:e.documentId,extractionId:e.extractionId,chunkId:e.chunkId,pageStart:e.pageStart,pageEnd:e.pageEnd,sourceObjectType:e.sourceObjectType,sourceObjectId:e.sourceObjectId,citationPaperId:e.citationPaperId,citationState:e.citationIntegrity&&e.citationIntegrity.state,freshnessState:e.freshness.state}};
            });return {claimId:claim.claimId,revision:claim.revision,text:claim.claimText,links};
        });coverage.includedClaims=claims.length;
        if(coverage.linkedClaims>coverage.inspectedClaims||coverage.omittedLinks)limitations.push("Bounded context: some Claim/Evidence links were not inspected.");
        if(coverage.unreviewedClaims||coverage.unusableEvidence)limitations.push("Unreviewed, unavailable or stale material was excluded; it is not supporting evidence.");
        const input={...base,section:{id:context.section.id,title:context.section.title,purpose:context.section.purpose,plannedLength:context.section.plannedLength,lengthUnit:context.section.lengthUnit},requirements,claims,citations:[...citations.values()],coverage,limitations};
        // Reject oversize inputs instead of silently severing nested exact provenance.
        Domain.boundedJson(input,"Section drafting context");return input;
    }
    inputForNode(base,node,handlerType,selection={}){
        if(handlerType==="SECTION_DRAFT_CANDIDATE")return this.draftInput(base,selection.sectionId);
        const input={...base,node:{id:node.id,title:node.title,semanticType:node.semanticType}};
        if(selection.sessionId)input.session=this.handlers.sessionSnapshot(handlerType,base.assignment.id,selection.sessionId);
        return input;
    }
    selectedSessionType(assignmentId,sessionId){
        const id=Academic.safeId(sessionId,"Session ID");
        // These are fixed canonical tables, never names supplied by the renderer.
        const matches=[
            ["stud_humanisation_sessions","HUMANISATION_CANDIDATE","WRITING"],
            ["stud_lecturer_review_sessions","ACADEMIC_REVIEW","REVIEW"],
            ["stud_correction_sessions","CORRECTION_CANDIDATE","WRITING"]
        ].filter(([table])=>this.repository.db.prepare(`SELECT id FROM ${table} WHERE id=? AND assignment_id=?`).get(id,assignmentId));
        if(matches.length!==1)throw new Academic.StudError("INVALID_TASK_SELECTION","Select one canonical Session belonging to this Assignment.");
        return {handlerType:matches[0][1],semanticType:matches[0][2]};
    }
    classifyNode(node,base,selection={}){
        const semantic=String(node.semanticType||"").toUpperCase();
        if(selection.sectionId&&selection.sessionId)throw new Academic.StudError("INVALID_TASK_SELECTION","Choose a Section or a Session, not both.");
        const session=selection.sessionId?this.selectedSessionType(base.assignment.id,selection.sessionId):null;
        if(session&&session.semanticType!==semantic||selection.sectionId&&semantic!=="WRITING")throw new Academic.StudError("INVALID_TASK_SELECTION","The canonical input is incompatible with this stage type.");
        let handlerType=null,executionClass="MANUAL_ONLY",reason="This stage remains an explicit manual task.";
        if(semantic==="HUMAN_TASK"||semantic==="FINALISATION"){executionClass="HUMAN_GATE";reason="Human review or action is required.";}
        else if(semantic==="EXTERNAL_TASK"){executionClass="EXTERNAL_WAIT";reason="An external human or institutional input is required.";}
        else if(session){handlerType=session.handlerType;executionClass="AUTO_EXECUTABLE";}
        else if(semantic==="WRITING"&&(selection.sectionId||(node.origin==="TEMPLATE"&&node.templateNodeKey==="drafting"))){handlerType="SECTION_DRAFT_CANDIDATE";executionClass="AUTO_EXECUTABLE";if(!base.composition){executionClass="UNSUPPORTED";reason="A reviewed Composition Plan and Section are required for bounded drafting.";}}
        else if(semantic==="REVIEW"){handlerType="DETERMINISTIC_STUD_CHECK";executionClass="AUTO_EXECUTABLE";}
        else if(semantic==="RESEARCH"){executionClass="MANUAL_ONLY";reason="Research acquisition is not safely automated by the M13 handler registry.";}
        const handler=handlerType&&this.handlers.get(handlerType);
        if(handlerType&&!handler){executionClass="UNSUPPORTED";reason="No trusted main-process handler is registered for this task type.";}
        return {handler,handlerType,executionClass,reason};
    }
    selectNodes(workflow,scope,selectedNodeIds=[]){
        const nodes=workflow.graph.nodes.filter(node=>!["COMPLETE","SKIPPED"].includes(node.state)),byId=new Map(nodes.map(node=>[node.id,node]));
        if(scope==="SELECTED_STAGES"){const ids=[...new Set((selectedNodeIds||[]).map(id=>Academic.safeId(id,"Selected Workflow node ID")))];if(!ids.length||ids.some(id=>!byId.has(id)))throw new Academic.StudError("INVALID_INPUT","Selected stages must belong to the current Workflow.");return nodes.filter(node=>ids.includes(node.id));}
        const current=nodes.find(node=>["READY","IN_PROGRESS"].includes(node.displayState))||nodes[0];
        if(!current)return [];
        if(scope==="CURRENT_STAGE")return [current];
        if(scope==="FROM_CURRENT_STAGE"){const seen=new Set([current.id]),queue=[current.id];while(queue.length){const id=queue.shift(),node=workflow.graph.nodes.find(item=>item.id===id);(node&&node.successorIds||[]).forEach(next=>{if(!seen.has(next)){seen.add(next);queue.push(next);}});}return nodes.filter(node=>seen.has(node.id));}
        return nodes;
    }
    createPlan(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","workflowId","scope","selectedNodeIds","taskSelections","resourceProfileId","routingPolicy","pinnedModelId","priority","launchPolicy"],"Execution Plan creation");
        const assignment=this.assignment(input.assignmentId),workflow=this.workflow.read({workflowId:input.workflowId,historyLimit:20});if(workflow.assignmentId!==assignment.id||!workflow.isCurrent||workflow.lifecycle!=="ACTIVE")throw new Academic.StudError("INVALID_WORKFLOW","Execution requires the current active Assignment Workflow.");
        const scope=Academic.enumValue(input.scope||"CURRENT_STAGE",Domain.PLAN_SCOPES,"Execution scope","CURRENT_STAGE"),profile=this.repository.profile(input.resourceProfileId||"stud_resource_interactive"),routingPolicy=Academic.enumValue(input.routingPolicy||"AUTOMATIC",["AUTOMATIC","PINNED"],"Routing policy","AUTOMATIC"),pinnedModelId=routingPolicy==="PINNED"?Academic.safeId(input.pinnedModelId,"Pinned model ID"):null;
        if(pinnedModelId)this.repository.model(pinnedModelId);
        const base=this.contextSnapshot(assignment.id,workflow),nodes=this.selectNodes(workflow,scope,input.selectedNodeIds),topology=executionTopology(nodes);if(!nodes.length)throw new Academic.StudError("NO_EXECUTABLE_SCOPE","No unfinished Workflow stages exist in this scope.");
        if(nodes.length>Domain.LIMITS.steps)throw new Academic.StudError("PAYLOAD_TOO_LARGE","Select at most 120 execution stages.");
        const selections=new Map();if(input.taskSelections!==undefined){if(!Array.isArray(input.taskSelections)||input.taskSelections.length>Domain.LIMITS.steps)throw new Academic.StudError("INVALID_INPUT","Task selections must be a bounded list.");for(const value of input.taskSelections){Academic.assertAllowedKeys(value,["workflowNodeId","sectionId","sessionId"],"Task selection");const id=Academic.safeId(value.workflowNodeId,"Workflow node ID");if(selections.has(id)||!nodes.some(node=>node.id===id))throw new Academic.StudError("CROSS_PLAN_SELECTION","Selection must identify a unique stage in this launch scope.");selections.set(id,value);}}
        return this.repository.transaction(()=>{
            const plan=this.repository.createPlan({assignmentId:assignment.id,workflowId:workflow.id,workflowRowVersion:workflow.rowVersion,workflowFingerprint:workflow.templateFingerprint,scope,resourceProfileId:profile.id,routingPolicy,pinnedModelId,launchPolicy:Academic.enumValue(input.launchPolicy||"EXPLICIT",["EXPLICIT","SAFE_IN_PROCESS_CONTINUE"],"Launch policy","EXPLICIT"),priority:Academic.enumValue(input.priority||"NORMAL",["NORMAL","HIGH"],"Execution priority","NORMAL"),inputHash:Domain.hash(base),topologyHash:Domain.hash(topology),statusSummary:"Review execution preflight before launch."});
            const ids=new Map();
            nodes.forEach(node=>{
                const selection=selections.get(node.id)||{},classification=this.classifyNode(node,base,selection),sessionTask=["HUMANISATION_CANDIDATE","ACADEMIC_REVIEW","CORRECTION_CANDIDATE"].includes(classification.handlerType);
                if(selection.sectionId&&classification.handlerType!=="SECTION_DRAFT_CANDIDATE"||selection.sessionId&&!sessionTask)throw new Academic.StudError("INVALID_TASK_SELECTION","The selected canonical object does not apply to this task.");
                if(sessionTask&&!selection.sessionId){classification.executionClass="HUMAN_GATE";classification.reason="Select an unexecuted canonical Session before this task can run.";}
                const handler=classification.handler,snapshot=handler?this.handlers.snapshot(handler):{handlerType:"NONE",contractVersion:1,executionClass:classification.executionClass,resourceClass:"LIGHT",capability:null,idempotencyClass:"IDEMPOTENT",recoveryClass:"MANUAL_RECOVERY",supportsPause:false,supportsCancel:false,canSkip:true,timeoutMs:30000,maxRetries:0,capabilitiesJson:"{}",handlerHash:Domain.hash({type:"NONE"})};
                const stepInput=this.inputForNode(base,node,classification.handlerType,selection),step=this.repository.insertStep(plan,{workflowNodeId:node.id,taskType:classification.handlerType||node.semanticType,handlerType:classification.handlerType,executionClass:classification.executionClass,state:"PENDING",priority:plan.priority,resourceClass:snapshot.resourceClass,capability:snapshot.capability,idempotencyClass:snapshot.idempotencyClass,idempotencyKey:Domain.stableKey(plan.id,node.id,classification.handlerType||node.semanticType,Domain.hash(stepInput)),recoveryClass:snapshot.recoveryClass,supportsPause:snapshot.supportsPause,supportsCancel:snapshot.supportsCancel,canSkip:snapshot.canSkip,timeoutMs:Math.min(snapshot.timeoutMs,profile.timeoutMs),maxRetries:Math.min(snapshot.maxRetries,profile.maxRetries),inputSnapshotJson:Domain.boundedJson(stepInput,"Execution Step input"),inputHash:Domain.hash(stepInput),stateReason:classification.reason,contractVersion:snapshot.contractVersion,capabilitiesJson:snapshot.capabilitiesJson,handlerHash:snapshot.handlerHash});ids.set(node.id,step.id);
            });
            topology.forEach(item=>item.predecessors.forEach(parent=>{if(ids.has(parent))this.repository.insertDependency(ids.get(item.id),ids.get(parent));}));
            let ready=this.repository.updatePlan(plan,{state:"READY",statusSummary:"Execution Plan is ready for explicit launch."});
            this.refreshAvailability(ready.id,workflow);return this.preflight({assignmentId:assignment.id,planId:ready.id});
        });
    }
    refreshAvailability(planId,workflow=null){
        const plan=this.repository.planRow(planId),view=workflow||this.workflow.read({workflowId:plan.workflowId,historyLimit:10}),nodeMap=new Map(view.graph.nodes.map(node=>[node.id,node])),deps=this.repository.dependencies(plan.id),steps=this.repository.steps(plan.id),byId=new Map(steps.map(step=>[step.id,step]));
        for(const step of steps){
            if(!["PENDING","READY","WAITING_HUMAN","WAITING_EXTERNAL"].includes(step.state))continue;
            const node=nodeMap.get(step.workflowNodeId),required=deps.filter(item=>item.stepId===step.id).map(item=>byId.get(item.dependsOnStepId));
            let state="READY",reason=null;
            if(node&&["COMPLETE","SKIPPED"].includes(node.state)){state="SKIPPED";reason="Canonical Workflow work was explicitly completed or skipped; no machine execution is claimed.";}
            else if(!required.every(item=>item&&["COMPLETED","SKIPPED"].includes(item.state))){state="PENDING";reason="Execution dependencies have not completed.";}
            else if(!node){state="WAITING_EXTERNAL";reason="Canonical Workflow stage is unavailable.";}
            else if(["DIRECT_BLOCKER","DEPENDENCY_WAIT","HUMAN_INPUT_REQUIRED"].includes(node.availability)){state=node.availability==="HUMAN_INPUT_REQUIRED"?"WAITING_HUMAN":"WAITING_EXTERNAL";reason=node.availabilityReason||"Resolve the canonical Workflow condition before resuming.";}
            else if(step.executionClass==="HUMAN_GATE"||step.executionClass==="MANUAL_ONLY"){state="WAITING_HUMAN";reason=step.stateReason||"Complete the human task in the Workflow, then explicitly resume.";}
            else if(step.executionClass==="EXTERNAL_WAIT"){state="WAITING_EXTERNAL";reason="Record the external input in the canonical Workflow, then resume.";}
            else if(step.executionClass==="UNSUPPORTED"){state="UNSUPPORTED";reason=step.stateReason;}
            if(state===step.state&&reason===step.stateReason)continue;
            const updated=this.repository.updateStep(step,{state,stateReason:reason});byId.set(step.id,updated);
            if(state==="READY")this.event(plan,updated,"EXECUTION_STEP_READY",`${node&&node.title||"Execution step"} is ready.`);
            if(state==="WAITING_HUMAN")this.event(plan,updated,"HUMAN_GATE_REACHED",reason,"NOTICE");
        }
        return this.repository.hydrate(plan.id);
    }
    preflight(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId"],"Execution preflight");const plan=this.scopedPlan(input.assignmentId,input.planId),view=this.repository.hydrate(plan.id),profile=this.repository.profile(plan.resourceProfileId),counts=view.steps.reduce((r,s)=>{r[s.executionClass]=(r[s.executionClass]||0)+1;return r;},{}),models=this.repository.models();
        return Object.freeze({plan:view,profile,counts:Object.freeze({machineOperable:counts.AUTO_EXECUTABLE||0,humanGates:counts.HUMAN_GATE||0,manualOnly:counts.MANUAL_ONLY||0,externalWaits:counts.EXTERNAL_WAIT||0,unsupported:counts.UNSUPPORTED||0}),modelRouting:Object.freeze({policy:plan.routingPolicy,pinnedModelId:plan.pinnedModelId,knownModels:models.map(model=>({id:model.id,identity:model.modelIdentity,availability:model.availability}))}),resourceSnapshot:this.resources.snapshot(),warning:profile.profileType==="OVERNIGHT"?"Overnight may use a large share of available compute and memory.":null,explicitLaunchRequired:true});
    }
    event(plan,step,type,summary,severity="INFO",payload={}){
        if(!plan.parentRunId)return null;return this.artifacts.appendEvent({assignmentId:plan.assignmentId,workflowId:plan.workflowId,workflowNodeId:step&&step.workflowNodeId||null,runId:step&&step.m6RunId||plan.parentRunId,eventType:type,actor:"WORKFLOW",severity,summary:Academic.requiredText(String(summary||"Execution event").slice(0,1000),"Execution event summary",1000),payload});
    }
    async launch(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","expectedVersion","confirmLaunch"],"Execution launch");if(input.confirmLaunch!==true)throw new Academic.StudError("EXPLICIT_CONFIRMATION_REQUIRED","Execution requires explicit launch confirmation.");
        let plan=this.scopedPlan(input.assignmentId,input.planId);this.repository.assertVersion(plan,input.expectedVersion,"STALE_EXECUTION_PLAN");if(plan.state!=="READY")throw new Academic.StudError("INVALID_TRANSITION","Only a READY Execution Plan can launch.");
        const parent=this.artifacts.createRun({assignmentId:plan.assignmentId,workflowId:plan.workflowId,operationType:"ASSIGNMENT_EXECUTION_PLAN",actor:"WORKFLOW",progressMode:"NONE",statusSummary:"Assignment execution started",canPause:true,canCancel:true}),started=this.artifacts.transitionRun({runId:parent.id,action:"START",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:"Assignment execution active"});
        plan=this.repository.updatePlan(plan,{state:"RUNNING",parentRunId:started.id,userConfirmedAt:Academic.now(),startedAt:Academic.now(),statusSummary:"Execution active."});this.resources.acquireKeepAwake(this.repository.profile(plan.resourceProfileId));this.event(plan,null,"EXECUTION_PLAN_STARTED","Assignment execution launched.", "INFO",{scope:plan.scope,resourceProfileId:plan.resourceProfileId});
        this.schedule(plan.id);return this.missionState({assignmentId:plan.assignmentId,planId:plan.id});
    }
    schedule(planId){
        if(this.activeSchedules.has(planId))return this.activeSchedules.get(planId);
        const job=this.runSchedule(planId).catch(error=>{
            if(this.disposed)return null;
            const plan=this.repository.planRow(planId);
            if(!TERMINAL_PLAN.has(plan.state)){
                this.repository.updatePlan(plan,{state:"INTERRUPTED",statusSummary:"Execution interrupted; inspect the typed failure before resuming."});
                for(const owned of this.controllers.values())if(owned.planId===plan.id)owned.controller.abort();
                for(const step of this.repository.steps(plan.id).filter(s=>s.state==="RUNNING")){
                    if(step.activeAttemptId){const attempt=this.repository.attemptRow(step.activeAttemptId);if(attempt.state==="RUNNING")this.repository.finishAttempt(attempt,"INTERRUPTED",{failureCode:"COORDINATOR_FAILURE",failureSummary:"Coordinator stopped before committing this result."});}
                    this.repository.updateStep(this.repository.stepRow(step.id),{state:"INTERRUPTED",activeAttemptId:null,stateReason:"Coordinator interrupted; explicit recovery required."});
                    if(step.m6RunId){const child=this.artifacts.run({assignmentId:plan.assignmentId,runId:step.m6RunId});if(child.state==="RUNNING")this.artifacts.transitionRun({runId:child.id,action:"FAIL",expectedVersion:child.rowVersion,progressMode:child.progressMode,statusSummary:"Coordinator interrupted",errorSummary:"Result was not committed."});}
                }
                this.event(plan,null,"EXECUTION_PLAN_INTERRUPTED","Coordinator stopped before scheduling more work.","ERROR",{code:String(error.code||"COORDINATOR_FAILURE").slice(0,80)});
                if(plan.parentRunId){const run=this.artifacts.run({assignmentId:plan.assignmentId,runId:plan.parentRunId});if(run.state==="RUNNING"&&run.canPause)this.artifacts.transitionRun({runId:run.id,action:"PAUSE",expectedVersion:run.rowVersion,progressMode:"NONE",statusSummary:"Coordinator interrupted"});}
            }
            this.resources.releaseKeepAwake();return null;
        }).finally(()=>this.activeSchedules.delete(planId));this.activeSchedules.set(planId,job);return job;
    }
    async runSchedule(planId){
        while(!this.disposed){
            let plan=this.repository.planRow(planId);if(plan.state!=="RUNNING")break;
            const profile=this.repository.profile(plan.resourceProfileId),resource=this.resources.evaluate(profile);if(!resource.allowNewHeavy){const incidentType=resource.reasons.includes("MEMORY_PRESSURE")?"MEMORY_PRESSURE":resource.reasons.includes("APP_SUSPENDED")?"APP_SUSPENDED":"RESOURCE_PROFILE_CONFLICT";this.watchdog.record({planId:plan.id,runId:plan.parentRunId,assignmentId:plan.assignmentId,workflowId:plan.workflowId,incidentType,observedCondition:`Scheduling paused: ${resource.reasons.join(", ")}.`,policyResponse:"STOP_SCHEDULING_NEW_TASKS"});plan=this.repository.updatePlan(plan,{state:resource.reasons.includes("APP_SUSPENDED")?"INTERRUPTED":"PAUSED",statusSummary:"New work paused by the selected Resource Profile."});break;}
            this.validateInputDrift(plan);
            const workflow=this.workflow.read({workflowId:plan.workflowId,historyLimit:10});this.refreshAvailability(plan.id,workflow);const steps=this.repository.steps(plan.id),ready=steps.filter(step=>step.state==="READY");
            if(!ready.length){this.derivePlanState(plan.id);break;}
            const occupied=[...this.controllers.values()],modelBusy=this.router.probing||occupied.some(task=>task.resourceClass.startsWith("MODEL"))||Boolean(this.repository.db.prepare("SELECT id FROM stud_operation_runs WHERE state='RUNNING' AND actor='MODEL' LIMIT 1").get());
            const slots={LIGHT:profile.maxLightTasks-occupied.filter(t=>t.resourceClass==="LIGHT").length,NETWORK:profile.maxNetworkTasks-occupied.filter(t=>t.resourceClass==="NETWORK").length,MODEL_LIGHT:modelBusy?0:profile.maxModelTasks,MODEL_HEAVY:modelBusy?0:profile.maxModelTasks},chosen=[];for(const step of ready.sort((a,b)=>(b.priority==="HIGH")-(a.priority==="HIGH")||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))){if(slots[step.resourceClass]>0){slots[step.resourceClass]-=1;if(step.resourceClass.startsWith("MODEL"))slots.MODEL_LIGHT=slots.MODEL_HEAVY=0;chosen.push(step);}}
            if(!chosen.length){this.repository.updatePlan(plan,{state:"PAUSED",statusSummary:"Resource Profile permits no ready task."});break;}
            await Promise.all(chosen.map(step=>this.executeStep(plan.id,step.id)));
        }
        if(this.disposed)return null;
        const final=this.repository.planRow(planId);
        if(["PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(final.state)&&final.parentRunId){
            const parent=this.artifacts.run({assignmentId:final.assignmentId,runId:final.parentRunId});
            if(parent.state==="RUNNING"&&parent.canPause)this.artifacts.transitionRun({runId:parent.id,action:"PAUSE",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:final.statusSummary||"Execution paused"});
        }
        if(TERMINAL_PLAN.has(final.state)||["PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(final.state))this.resources.releaseKeepAwake();return final;
    }
    async executeStep(planId,stepId){
        let plan=this.repository.planRow(planId),step=this.repository.claimStep(stepId,this.repository.stepRow(stepId).rowVersion),handler=this.handlers.get(step.handlerType),model=null,route=null;
        if(!handler){this.repository.updateStep(step,{state:"UNSUPPORTED",finishedAt:Academic.now(),stateReason:"Trusted Task Handler is unavailable."});return;}
        if(step.capability){const requiredContext=Math.ceil(Buffer.byteLength(JSON.stringify(step.inputSnapshot||{}),"utf8")/4);route=this.router.route({planId:plan.id,stepId:step.id,capability:step.capability,routingPolicy:plan.routingPolicy,requestedModelId:plan.pinnedModelId,profile:this.repository.profile(plan.resourceProfileId),requiredContext});this.event(plan,step,"MODEL_ROUTED",route.reason,route.outcome==="SELECTED"?"INFO":"NOTICE",{outcome:route.outcome,capability:step.capability,modelId:route.selectedModelId||null,requiredContext});if(route.outcome!=="SELECTED"){this.repository.updateStep(step,{state:"UNSUPPORTED",finishedAt:Academic.now(),stateReason:route.reason});return;}model=this.repository.model(route.selectedModelId);}
        let run=this.artifacts.createRun({assignmentId:plan.assignmentId,workflowId:plan.workflowId,workflowNodeId:step.workflowNodeId,operationType:step.handlerType,actor:step.capability?"MODEL":"WORKFLOW",progressMode:step.capability?"INDETERMINATE":"NONE",statusSummary:`${step.taskType} started`,parentRunId:plan.parentRunId,canPause:step.supportsPause,canCancel:step.supportsCancel});run=this.artifacts.transitionRun({runId:run.id,action:"START",expectedVersion:run.rowVersion,progressMode:run.progressMode,statusSummary:`${step.taskType} active`});
        step=this.repository.stepRow(step.id);const attempt=this.repository.insertAttempt(step,{runtimeRequestId:Academic.createId("runtime_request"),m6RunId:run.id,modelId:model&&model.id,routeDecisionId:route&&route.id}),controller=new AbortController();this.controllers.set(attempt.id,{controller,planId:plan.id,stepId:step.id,resourceClass:step.resourceClass,runId:run.id});
        this.event(this.repository.planRow(plan.id),this.repository.stepRow(step.id),"EXECUTION_STEP_STARTED",`${step.taskType} started.`,"INFO",{attemptNumber:attempt.attemptNumber,handlerType:step.handlerType});
        this.watchdog.watch({attemptId:attempt.id,timeoutMs:step.timeoutMs,onTimeout:()=>{this.timedOut.add(attempt.id);controller.abort();this.watchdog.record({planId:plan.id,stepId:step.id,attemptId:attempt.id,runId:run.id,assignmentId:plan.assignmentId,workflowId:plan.workflowId,workflowNodeId:step.workflowNodeId,incidentType:"TASK_TIMEOUT",observedCondition:"Execution Step exceeded its bounded handler timeout.",policyResponse:"CANCEL_CURRENT_ATTEMPT"});}});
        let result,abortListener;try{
            // A handler that ignores AbortSignal must not hold the coordinator forever.
            // Its eventual result is never admitted after the cancellation fence.
            const aborted=new Promise(resolve=>{abortListener=()=>resolve({status:"CANCELLED",error:"Bounded attempt cancelled."});controller.signal.addEventListener("abort",abortListener,{once:true});if(controller.signal.aborted)abortListener();});
            result=await Promise.race([aborted,Promise.resolve().then(()=>handler.execute({plan:this.repository.planRow(plan.id),step:this.repository.stepRow(step.id),attempt,input:step.inputSnapshot,model,route,profile:this.repository.profile(plan.resourceProfileId),checkpoint:checkpoint=>{if(this.disposed||controller.signal.aborted)throw new Academic.StudError("ATTEMPT_CANCELLED","Attempt no longer accepts checkpoints.");return this.saveCheckpoint(plan.id,step.id,attempt.id,checkpoint);}},controller.signal))]);
            if(result&&result.status==="SUCCESS")Domain.boundedJson(result.output||{},"Step output");
        }catch(error){result={status:controller.signal.aborted?"CANCELLED":"FAILED",error:error.code||"HANDLER_FAILED"};}
        finally{if(abortListener)controller.signal.removeEventListener("abort",abortListener);this.watchdog.clear(attempt.id);this.controllers.delete(attempt.id);}
        if(this.disposed)return;
        const authoritativeAttempt=this.repository.attemptRow(attempt.id),authoritativePlan=this.repository.planRow(plan.id),authoritativeStep=this.repository.stepRow(step.id);
        if(authoritativeAttempt.state!=="RUNNING"||authoritativeStep.activeAttemptId!==attempt.id||["CANCELLED","FAILED"].includes(authoritativePlan.state)){
            this.watchdog.record({planId:plan.id,stepId:step.id,attemptId:attempt.id,runId:run.id,assignmentId:plan.assignmentId,workflowId:plan.workflowId,workflowNodeId:step.workflowNodeId,incidentType:"LATE_RESULT_REJECTED",observedCondition:"A terminal or superseded attempt returned a late result; output was rejected.",policyResponse:"WARN",resolution:"Output discarded."});return;
        }
        const timedOut=this.timedOut.delete(attempt.id),success=!timedOut&&result&&result.status==="SUCCESS";
        if(timedOut)result={status:"TASK_TIMEOUT",error:"Execution Step exceeded its bounded timeout."};
        if(success){
            const outputSummaryJson=Domain.boundedJson(result.output||{},"Step output");
            this.repository.finishAttempt(authoritativeAttempt,"COMPLETED");const progress=result.progress||null;let currentRun=this.artifacts.run({assignmentId:plan.assignmentId,runId:run.id});this.artifacts.transitionRun({runId:currentRun.id,action:"COMPLETE",expectedVersion:currentRun.rowVersion,progressMode:progress&&progress.mode||currentRun.progressMode,progressCurrent:progress&&progress.current,progressTotal:progress&&progress.total,progressUnit:progress&&progress.unit,statusSummary:`${step.taskType} completed`});const updated=this.repository.updateStep(authoritativeStep,{state:"COMPLETED",outputSummaryJson,activeAttemptId:null,finishedAt:Academic.now(),stateReason:null});this.event(authoritativePlan,updated,"EXECUTION_STEP_COMPLETED",`${step.taskType} completed.`);
        }else{
            const human=result&&result.status==="HUMAN_INPUT_REQUIRED",unsupported=result&&["NO_SUITABLE_MODEL","DRAFT_BLOCKED_INSUFFICIENT_EVIDENCE"].includes(result.status),cancelled=result&&result.status==="CANCELLED",failureCode=timedOut?"TASK_TIMEOUT":String(result&&result.status||"FAILED").slice(0,100),summary=String(result&&result.error||result&&result.output&&result.output.reason||failureCode).slice(0,2000);
            this.repository.finishAttempt(authoritativeAttempt,cancelled?"CANCELLED":"FAILED",{failureCode,failureSummary:summary});let currentRun=this.artifacts.run({assignmentId:plan.assignmentId,runId:run.id});if(["RUNNING","PAUSED"].includes(currentRun.state))this.artifacts.transitionRun({runId:currentRun.id,action:cancelled?"CANCEL":"FAIL",expectedVersion:currentRun.rowVersion,progressMode:currentRun.progressMode,statusSummary:summary,errorSummary:cancelled?undefined:summary});const next=human?"WAITING_HUMAN":unsupported?"UNSUPPORTED":cancelled?"CANCELLED":"FAILED",updated=this.repository.updateStep(authoritativeStep,{state:next,outputSummaryJson:result&&result.output?Domain.boundedJson(boundedObject(result.output),"Step output"):null,activeAttemptId:null,finishedAt:Academic.now(),stateReason:summary});this.event(authoritativePlan,updated,next==="WAITING_HUMAN"?"HUMAN_GATE_REACHED":"EXECUTION_STEP_FAILED",summary,next==="FAILED"?"ERROR":"NOTICE",{failureCode});
        }
        this.refreshAvailability(plan.id);
    }
    derivePlanState(planId){
        let plan=this.repository.planRow(planId);if(plan.state!=="RUNNING")return plan;const steps=this.repository.steps(plan.id);let state="RUNNING",summary="Execution active.";
        if(steps.every(step=>["COMPLETED","SKIPPED","UNSUPPORTED"].includes(step.state))){
            const completed=steps.filter(step=>step.state==="COMPLETED").length,skipped=steps.filter(step=>step.state==="SKIPPED").length,unsupported=steps.filter(step=>step.state==="UNSUPPORTED").length;
            state=completed===0&&unsupported>0?"FAILED":"COMPLETED";
            summary=state==="FAILED"?`No selected machine operation completed; ${unsupported} unavailable and ${skipped} skipped.`:`Execution ended: ${completed} completed, ${skipped} skipped and ${unsupported} unavailable. Academic Workflow state is unchanged.`;
        }
        else if(steps.some(step=>step.state==="FAILED"&&step.attemptCount<=step.maxRetries)){state="PAUSED";summary="Execution paused after a failed Step; an explicit bounded retry is available.";}
        else if(steps.some(step=>step.state==="FAILED")){state="FAILED";summary="Execution stopped after a failed Step and exhausted its retry policy.";}
        else if(steps.some(step=>step.state==="WAITING_HUMAN")){state="WAITING_HUMAN";summary="Execution is waiting for human review or action.";}
        else if(steps.some(step=>step.state==="WAITING_EXTERNAL")||steps.every(step=>step.state==="PENDING")){state="WAITING_EXTERNAL";summary="Execution is waiting for external input or blocked dependencies.";}
        if(state==="RUNNING")return plan;plan=this.repository.updatePlan(plan,{state,statusSummary:summary,finishedAt:TERMINAL_PLAN.has(state)?Academic.now():null});let parent=this.artifacts.run({assignmentId:plan.assignmentId,runId:plan.parentRunId});if(state==="COMPLETED"&&parent.state==="RUNNING")parent=this.artifacts.transitionRun({runId:parent.id,action:"COMPLETE",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:summary});else if(state==="FAILED"&&parent.state==="RUNNING")parent=this.artifacts.transitionRun({runId:parent.id,action:"FAIL",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:summary,errorSummary:summary});else if(["PAUSED","WAITING_HUMAN","WAITING_EXTERNAL"].includes(state)&&parent.state==="RUNNING"&&parent.canPause)parent=this.artifacts.transitionRun({runId:parent.id,action:"PAUSE",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:summary});this.event(plan,null,state==="COMPLETED"?"EXECUTION_PLAN_COMPLETED":state==="FAILED"?"EXECUTION_STEP_FAILED":state==="PAUSED"?"EXECUTION_STEP_PAUSED":"HUMAN_GATE_REACHED",summary,state==="FAILED"?"ERROR":"INFO");return plan;
    }
    saveCheckpoint(planId,stepId,attemptId,input={}){
        const plan=this.repository.planRow(planId),step=this.scopedStep(plan,stepId),attempt=this.repository.attemptRow(attemptId);if(attempt.stepId!==step.id||attempt.state!=="RUNNING")throw new Academic.StudError("INVALID_CHECKPOINT","Checkpoint requires the active Step attempt.");Academic.assertAllowedKeys(input,["cursor","durableOutput"],"Execution checkpoint");const durable=input.durableOutput?Domain.boundedJson(boundedObject(input.durableOutput),"Durable checkpoint output"):null,checkpoint=this.repository.insertCheckpoint({planId:plan.id,stepId:step.id,attemptId:attempt.id,handlerType:step.handlerType,inputHash:step.inputHash,cursor:Academic.optionalText(input.cursor,"Checkpoint cursor",500),durableOutputJson:durable,outputHash:durable?Domain.hash(Domain.parse(durable)):null});this.repository.updateStep(step,{checkpointCursor:checkpoint.cursor});this.event(plan,step,"EXECUTION_CHECKPOINT_SAVED","Durable execution checkpoint saved.","INFO",{checkpointId:checkpoint.id});return checkpoint;
    }
    async pause(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","expectedVersion"],"Execution pause");let plan=this.scopedPlan(input.assignmentId,input.planId);this.repository.assertVersion(plan,input.expectedVersion,"STALE_EXECUTION_PLAN");if(plan.state!=="RUNNING")throw new Academic.StudError("INVALID_TRANSITION","Only an active Plan can pause.");plan=this.repository.updatePlan(plan,{state:"PAUSED",statusSummary:this.controllers.size?"Pause after current task; no new Step will start.":"Execution paused."});if(!this.controllers.size){const run=this.artifacts.run({assignmentId:plan.assignmentId,runId:plan.parentRunId});if(run.state==="RUNNING"&&run.canPause)this.artifacts.transitionRun({runId:run.id,action:"PAUSE",expectedVersion:run.rowVersion,progressMode:"NONE",statusSummary:"Execution paused"});}return this.missionState({assignmentId:plan.assignmentId,planId:plan.id});
    }
    validateInputDrift(plan){
        const workflow=this.workflow.read({workflowId:plan.workflowId,historyLimit:10}),selectedIds=new Set(this.repository.steps(plan.id).map(step=>step.workflowNodeId));if(!workflow.isCurrent||workflow.lifecycle!=="ACTIVE"||workflow.templateFingerprint!==plan.workflowFingerprint||Domain.hash(executionTopology(workflow.graph.nodes.filter(node=>selectedIds.has(node.id))))!==plan.topologyHash)throw new Academic.StudError("RUN_INPUT_CHANGED","Workflow topology changed; rebuild the Execution Plan.");
        const base=this.contextSnapshot(plan.assignmentId,workflow),steps=this.repository.steps(plan.id);for(const step of steps.filter(item=>["PENDING","READY","INTERRUPTED","WAITING_HUMAN","WAITING_EXTERNAL"].includes(item.state))){
            const previous=step.inputSnapshot||{},node=workflow.graph.nodes.find(node=>node.id===step.workflowNodeId)||{},selection={sectionId:previous.section&&previous.section.id,sessionId:previous.session&&previous.session.id};
            if(this.classifyNode(node,base,selection).handlerType!==step.handlerType)throw new Academic.StudError("RUN_INPUT_CHANGED","Stored task no longer matches canonical dispatch; rebuild the Execution Plan.");
            const current=this.inputForNode(base,node,step.handlerType,selection),currentHash=Domain.hash(current);if(currentHash!==step.inputHash){const changedKeys=[...new Set([...Object.keys(previous),...Object.keys(current)])].filter(key=>Domain.hash(previous[key]??null)!==Domain.hash(current[key]??null));throw new Academic.StudError("RUN_INPUT_CHANGED",`${step.taskType} input changed; rebuild the Execution Plan.`,{stepId:step.id,expectedInputHash:step.inputHash,currentInputHash:currentHash,changedKeys});}}
    }
    async resume(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","expectedVersion"],"Execution resume");let plan=this.scopedPlan(input.assignmentId,input.planId);this.repository.assertVersion(plan,input.expectedVersion,"STALE_EXECUTION_PLAN");if(!["PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(plan.state))throw new Academic.StudError("INVALID_TRANSITION","This Plan cannot resume.");this.validateInputDrift(plan);const profile=this.repository.profile(plan.resourceProfileId),resource=this.resources.evaluate(profile);if(!resource.allowNewHeavy)throw new Academic.StudError("RESOURCE_PROFILE_CONFLICT",`Cannot resume: ${resource.reasons.join(", ")}.`);
        this.repository.transaction(()=>{this.repository.steps(plan.id).filter(step=>step.state==="INTERRUPTED").forEach(step=>{const checkpoint=this.repository.checkpoints(step.id,1)[0],state=step.recoveryClass==="RESUME_FROM_CHECKPOINT"&&checkpoint||step.recoveryClass==="SAFE_RESTART"?"PENDING":"WAITING_HUMAN";this.repository.updateStep(step,{state,activeAttemptId:null,stateReason:state==="WAITING_HUMAN"?"Manual recovery is required.":null});});});
        plan=this.repository.updatePlan(this.repository.planRow(plan.id),{state:"RUNNING",statusSummary:"Execution resumed."});let parent=this.artifacts.run({assignmentId:plan.assignmentId,runId:plan.parentRunId});if(parent.state==="PAUSED")this.artifacts.transitionRun({runId:parent.id,action:"RESUME",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:"Execution resumed"});this.resources.acquireKeepAwake(profile);this.schedule(plan.id);return this.missionState({assignmentId:plan.assignmentId,planId:plan.id});
    }
    async cancel(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","expectedVersion"],"Execution cancellation");let plan=this.scopedPlan(input.assignmentId,input.planId);this.repository.assertVersion(plan,input.expectedVersion,"STALE_EXECUTION_PLAN");if(TERMINAL_PLAN.has(plan.state))throw new Academic.StudError("INVALID_TRANSITION","Execution Plan is already terminal.");plan=this.repository.updatePlan(plan,{state:"CANCELLED",finishedAt:Academic.now(),statusSummary:"Execution cancelled; completed work and history were preserved."});for(const [attemptId,owned] of this.controllers){if(owned.planId!==plan.id)continue;owned.controller.abort();const attempt=this.repository.attemptRow(attemptId);if(attempt.state==="RUNNING")this.repository.finishAttempt(attempt,"CANCELLED",{failureCode:"USER_CANCELLED",failureSummary:"User cancelled the Execution Plan."});const step=this.repository.stepRow(owned.stepId);if(step.state==="RUNNING")this.repository.updateStep(step,{state:"CANCELLED",activeAttemptId:null,finishedAt:Academic.now(),stateReason:"Execution Plan cancelled."});const child=this.artifacts.run({assignmentId:plan.assignmentId,runId:owned.runId});if(["CREATED","RUNNING","PAUSED"].includes(child.state))this.artifacts.transitionRun({runId:child.id,action:child.canCancel?"CANCEL":"FAIL",expectedVersion:child.rowVersion,progressMode:child.progressMode,statusSummary:child.canCancel?"Execution Step cancelled":"Execution result invalidated by Plan cancellation",...(!child.canCancel?{errorSummary:"Non-cancellable task output will not be committed."}:{})});}
        this.repository.steps(plan.id).filter(step=>["PENDING","READY","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(step.state)).forEach(step=>this.repository.updateStep(step,{state:"CANCELLED",finishedAt:Academic.now(),stateReason:"Execution Plan cancelled."}));const parent=plan.parentRunId?this.artifacts.run({assignmentId:plan.assignmentId,runId:plan.parentRunId}):null;if(parent&&["CREATED","RUNNING","PAUSED"].includes(parent.state)&&parent.canCancel)this.artifacts.transitionRun({runId:parent.id,action:"CANCEL",expectedVersion:parent.rowVersion,progressMode:"NONE",statusSummary:"Assignment execution cancelled"});this.resources.releaseKeepAwake();return this.missionState({assignmentId:plan.assignmentId,planId:plan.id});
    }
    retry(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","stepId","expectedPlanVersion","expectedStepVersion"],"Execution retry");const plan=this.scopedPlan(input.assignmentId,input.planId);this.repository.assertVersion(plan,input.expectedPlanVersion,"STALE_EXECUTION_PLAN");const step=this.scopedStep(plan,input.stepId);this.repository.assertVersion(step,input.expectedStepVersion,"STALE_EXECUTION_STEP");if(plan.state!=="PAUSED"||step.state!=="FAILED"||step.attemptCount>step.maxRetries)throw new Academic.StudError("RETRY_LIMIT_REACHED","Step is not eligible for another bounded retry.");this.repository.updateStep(step,{state:"PENDING",activeAttemptId:null,finishedAt:null,stateReason:"Explicit retry requested."});return this.repository.hydrate(plan.id);
    }
    skip(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","stepId","expectedPlanVersion","expectedStepVersion","reason"],"Execution skip");const plan=this.scopedPlan(input.assignmentId,input.planId);this.repository.assertVersion(plan,input.expectedPlanVersion,"STALE_EXECUTION_PLAN");const step=this.scopedStep(plan,input.stepId);this.repository.assertVersion(step,input.expectedStepVersion,"STALE_EXECUTION_STEP");if(TERMINAL_PLAN.has(plan.state)||!step.canSkip||step.state==="RUNNING"||TERMINAL_STEP.has(step.state))throw new Academic.StudError("INVALID_TRANSITION","This Step cannot be skipped.");return this.repository.updateStep(step,{state:"SKIPPED",finishedAt:Academic.now(),stateReason:Academic.requiredText(input.reason,"Skip reason",Domain.LIMITS.reason)});
    }
    async acceptDraftCandidate(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","stepId","expectedStepVersion","draftId"],"Draft candidate acceptance");const plan=this.scopedPlan(input.assignmentId,input.planId),step=this.scopedStep(plan,input.stepId);this.repository.assertVersion(step,input.expectedStepVersion,"STALE_EXECUTION_STEP");if(step.state!=="COMPLETED"||!step.outputSummary||step.outputSummary.kind!=="SECTION_DRAFT_CANDIDATE"||!step.outputSummary.candidate||(step.outputSummary.accepted||step.outputSummary.rejected))throw new Academic.StudError("INVALID_TRANSITION","No unaccepted Section Draft candidate is available.");const attempts=this.repository.attempts(step.id,1),attempt=attempts[0],route=this.repository.routes(step.id,1)[0],compositionId=step.inputSnapshot.composition&&step.inputSnapshot.composition.id;if(!compositionId)throw new Academic.StudError("NOT_FOUND","Reviewed Composition Plan is unavailable.");let draft=input.draftId?this.composition.draft({assignmentId:plan.assignmentId,draftId:input.draftId,versionLimit:5}).draft:null;
        const currentInput=this.draftInput(this.contextSnapshot(plan.assignmentId,this.workflow.read({workflowId:plan.workflowId,historyLimit:1})),step.outputSummary.sectionId);if(Domain.hash(currentInput)!==step.inputHash)throw new Academic.StudError("RUN_INPUT_CHANGED","Drafting evidence changed; review a new candidate before acceptance.");
        let version;this.repository.transaction(()=>{if(!draft)draft=this.composition.createDraft({assignmentId:plan.assignmentId,planId:compositionId,title:`${step.inputSnapshot.assignment.title} draft`});version=this.composition.saveDraftVersion({assignmentId:plan.assignmentId,draftId:draft.id,expectedVersion:draft.rowVersion,sections:[{sectionId:step.outputSummary.sectionId,content:step.outputSummary.candidate}],changeReason:"Explicitly accepted M13 Section Draft candidate.",origin:"LOCAL_AI"});this.repository.db.prepare("UPDATE stud_draft_versions SET execution_plan_id=?,execution_step_id=?,execution_attempt_id=?,model_routing_decision_id=? WHERE id=?").run(plan.id,step.id,attempt&&attempt.id||null,route&&route.id||null,version.id);this.repository.updateStep(step,{outputSummaryJson:Domain.boundedJson({...step.outputSummary,accepted:true,resultingDraftVersionId:version.id,acceptedAt:Academic.now()},"Accepted Draft candidate")});this.artifacts.registerArtifact({assignmentId:plan.assignmentId,workflowId:plan.workflowId,workflowNodeId:step.workflowNodeId,canonicalObjectType:"DRAFT_VERSION",canonicalObjectId:version.id,artifactType:"DRAFT_VERSION",label:`Accepted Section Draft · version ${version.versionNumber}`,origin:"MODEL_GENERATED",producer:"RUN_COORDINATOR",runId:step.m6RunId,metadata:{executionPlanId:plan.id,executionStepId:step.id,executionAttemptId:attempt&&attempt.id||null,modelRoutingDecisionId:route&&route.id||null,explicitAcceptance:true}});});return Object.freeze({draftVersion:version,explicitAcceptance:true});
    }
    rejectDraftCandidate(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","stepId","expectedStepVersion"],"Draft candidate rejection");
        const plan=this.scopedPlan(input.assignmentId,input.planId),step=this.scopedStep(plan,input.stepId);this.repository.assertVersion(step,input.expectedStepVersion,"STALE_EXECUTION_STEP");
        if(step.state!=="COMPLETED"||!step.outputSummary||step.outputSummary.kind!=="SECTION_DRAFT_CANDIDATE"||step.outputSummary.accepted||step.outputSummary.rejected)throw new Academic.StudError("INVALID_TRANSITION","No undecided Draft candidate is available.");
        return this.repository.updateStep(step,{outputSummaryJson:Domain.boundedJson({...step.outputSummary,rejected:true,rejectedAt:Academic.now()},"Rejected candidate")});
    }
    modelInventory(){return this.router.refreshInventory();}
    modelProbe(input){if([...this.controllers.values()].some(task=>task.resourceClass.startsWith("MODEL"))||this.repository.db.prepare("SELECT id FROM stud_operation_runs WHERE state='RUNNING' AND actor='MODEL' LIMIT 1").get())throw new Academic.StudError("MODEL_BUSY","Wait for the active local model operation before capability probing.");return this.router.probe(input);}
    profiles(){return this.repository.profiles();}
    launchOptions(assignmentId){
        const db=this.repository.db,sections=db.prepare("SELECT s.id,s.title FROM stud_composition_sections s JOIN stud_assignment_composition_plans p ON p.current_reviewed_plan_id=s.plan_id WHERE p.assignment_id=? ORDER BY s.section_order,s.id LIMIT 120").all(assignmentId);
        const sessionRows=[...db.prepare("SELECT id,created_at,'HUMANISATION_CANDIDATE' task_type FROM stud_humanisation_sessions WHERE assignment_id=? AND state='CREATED' ORDER BY created_at DESC LIMIT 25").all(assignmentId),...db.prepare("SELECT id,created_at,'ACADEMIC_REVIEW' task_type FROM stud_lecturer_review_sessions WHERE assignment_id=? AND state='CREATED' ORDER BY created_at DESC LIMIT 25").all(assignmentId),...db.prepare("SELECT id,created_at,'CORRECTION_CANDIDATE' task_type FROM stud_correction_sessions WHERE assignment_id=? AND state='CREATED' ORDER BY created_at DESC LIMIT 25").all(assignmentId)];
        const models=this.repository.models().map(model=>({id:model.id,identity:model.modelIdentity,availability:model.availability,assessments:Domain.CAPABILITIES.map(capability=>{const a=this.repository.latestAssessment(model.id,capability);return {capability,assessment:a&&a.assessment||"UNVERIFIED"};})}));
        return {sections,sessions:sessionRows.map(row=>({id:row.id,taskType:row.task_type,label:`${row.task_type.replace(/_/g," ")} · ${row.created_at}`})),models,capabilities:Domain.CAPABILITIES};
    }
    saveProfile(input={}){
        if(input.id&&!this.repository.profile(input.id).builtIn&&this.repository.db.prepare("SELECT id FROM stud_execution_plans WHERE resource_profile_id=? LIMIT 1").get(Academic.safeId(input.id,"Resource Profile ID")))throw new Academic.StudError("PROFILE_IN_USE","This profile is recorded in Execution history. Create a new profile to preserve the original execution policy.");
        Academic.assertAllowedKeys(input,["id","expectedVersion","name","maxLightTasks","maxNetworkTasks","maxModelTasks","minAvailableMemoryBytes","maxModelContext","pauseOnBattery","pauseOnMemoryPressure","keepAwake","timeoutMs","maxRetries"],"Custom Resource Profile");return this.repository.saveCustomProfile({id:input.id?Academic.safeId(input.id,"Resource Profile ID"):null,expectedVersion:input.expectedVersion,name:Academic.requiredText(input.name,"Profile name",120),maxLightTasks:Domain.positiveInteger(input.maxLightTasks,"Light task limit",1,16),maxNetworkTasks:Domain.positiveInteger(input.maxNetworkTasks,"Network task limit",0,8),maxModelTasks:Domain.positiveInteger(input.maxModelTasks,"Model task limit",0,2),minAvailableMemoryBytes:Domain.positiveInteger(input.minAvailableMemoryBytes,"Memory reserve",268435456,137438953472),maxModelContext:Domain.positiveInteger(input.maxModelContext,"Model context",512,262144),pauseOnBattery:input.pauseOnBattery===true,pauseOnMemoryPressure:input.pauseOnMemoryPressure!==false,keepAwake:input.keepAwake===true,timeoutMs:Domain.positiveInteger(input.timeoutMs,"Task timeout",1000,7200000),maxRetries:Domain.positiveInteger(input.maxRetries,"Retry limit",0,3)});
    }
    operationalHistory(plan,eventLimit,artifactLimit){
        if(!plan.parentRunId)return {events:[],planArtifacts:[],historyBounds:{runLimit:512,eventLimit,artifactLimit,truncated:false}};
        // M6 retains authority. Traverse only this bounded Run tree, including
        // previous attempts and canonical M11/M12 child operations, before paging.
        const scope=`WITH RECURSIVE scoped(id) AS (
            SELECT id FROM stud_operation_runs WHERE id=? AND assignment_id=?
            UNION SELECT r.id FROM stud_operation_runs r JOIN scoped s ON r.parent_run_id=s.id WHERE r.assignment_id=? LIMIT 512
        ) `,args=[plan.parentRunId,plan.assignmentId,plan.assignmentId];
        const runCount=this.repository.db.prepare(scope+"SELECT COUNT(*) count FROM scoped").get(...args).count;
        const eventRows=this.repository.db.prepare(scope+"SELECT e.id FROM stud_operation_events e JOIN scoped s ON s.id=e.run_id ORDER BY e.event_sequence DESC LIMIT ?").all(...args,eventLimit+1);
        const artifactRows=this.repository.db.prepare(scope+"SELECT a.artifact_id,MAX(e.event_sequence) last_sequence FROM stud_operation_event_artifacts a JOIN stud_operation_events e ON e.id=a.event_id JOIN scoped s ON s.id=e.run_id GROUP BY a.artifact_id ORDER BY last_sequence DESC LIMIT ?").all(...args,artifactLimit+1);
        const events=eventRows.slice(0,eventLimit).map(row=>this.artifacts.repository.event(row.id)),planArtifacts=artifactRows.slice(0,artifactLimit).map(row=>this.artifacts.scopedArtifact(plan.assignmentId,row.artifact_id));
        return {events:Object.freeze(events),planArtifacts:Object.freeze(this.artifacts.presentArtifacts(planArtifacts)),historyBounds:{runLimit:512,eventLimit,artifactLimit,runBoundReached:runCount>=512,truncated:runCount>=512||eventRows.length>eventLimit||artifactRows.length>artifactLimit}};
    }
    missionState(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","eventLimit","artifactLimit"],"M13 Mission Control state");
        const assignment=this.assignment(input.assignmentId),plan=input.planId?this.scopedPlan(assignment.id,input.planId):this.repository.currentForAssignment(assignment.id),m6=this.artifacts.missionState({assignmentId:assignment.id,historyLimit:20,artifactLimit:Math.min(Number(input.artifactLimit)||30,50)}),executionHistory=this.repository.planSummaries(assignment.id),launchOptions=this.launchOptions(assignment.id);
        if(!plan)return Object.freeze({...m6,executionPlan:null,executionHistory,launchOptions,planArtifacts:Object.freeze([]),resource:this.resources.snapshot(),profiles:this.repository.profiles()});
        const hydrated=this.repository.hydrate(plan.id),incidents=this.repository.incidents(plan.id,50),steps=hydrated.steps.map(step=>Object.freeze({...step,attempts:this.repository.attempts(step.id,5),checkpoints:this.repository.checkpoints(step.id,3),route:this.repository.routes(step.id,1)[0]||null})),eventLimit=Math.min(Number(input.eventLimit)||100,200),{events,planArtifacts,historyBounds}=this.operationalHistory(plan,eventLimit,Math.min(Number(input.artifactLimit)||30,50));
        return Object.freeze({...m6,executionPlan:Object.freeze({...hydrated,steps}),executionHistory,launchOptions,planArtifacts,historyBounds,incidents,events,resource:this.resources.snapshot(),profiles:this.repository.profiles(),resting:m6.resting&&!["RUNNING","PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(plan.state)});
    }
    async waitForIdle(planId){const job=this.activeSchedules.get(planId);if(job)await job;return this.repository.hydrate(planId);}
    dispose(){this.disposed=true;for(const owned of this.controllers.values())owned.controller.abort();this.controllers.clear();this.watchdog.dispose();this.resources.dispose();if(this.router.dispose)this.router.dispose();}
}

module.exports=Object.freeze({StudRunCoordinator,exactPlanFingerprint,boundedObject});
