"use strict";

const ARTIFACT_LABELS = Object.freeze({ACADEMIC_DOCUMENT: "DOCUMENTS", SOURCE_DOCUMENT: "SOURCES", RESEARCH_PAPER: "RESEARCH", WEB_REFERENCE: "REFERENCES", NOTE: "NOTES", DATASET: "DATA", NOTEBOOK: "NOTEBOOKS", REPOSITORY_CODE: "CODE", COMPUTE_INPUT: "COMPUTE", COMPUTE_RESULT: "COMPUTE", FIGURE: "FIGURES", IMAGE: "IMAGES", TABLE: "TABLES", CHART: "CHARTS", CALCULATION: "CALCULATIONS", SIMULATION_RESULT: "SIMULATIONS", REVISION_ITEM: "REVISION", DRAFT_VERSION: "DRAFTS", CITATION_REFERENCE: "CITATIONS", EXPORT_PACKAGE: "EXPORTS", GENERIC_MANUAL: "OTHER"});

function duration(start, end) {
    if (!start) return "NOT STARTED";
    const seconds = Math.max(0, Math.floor((new Date(end || Date.now()).getTime() - new Date(start).getTime()) / 1000));
    if (!Number.isFinite(seconds)) return "UNKNOWN";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60); return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

class StudMissionControlWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.loadSequence=0;
        this.state = {mode: "ARTIFACTS", mission: null, events: [], runArtifacts: [], selectedRunId: "", selectedArtifactId: "", relationships: [], loading: false, error: "", artifactFilter: "ALL"};
    }
    assignment() { return this.parent.assignment(); }
    reset() { this.loadSequence++;clearTimeout(this.refreshTimer);this.state = {...this.state, loading:false,mission: null, events: [], runArtifacts: [], selectedPlanId:"",selectedStepId:"",selectedRunId: "", selectedArtifactId: "", relationships: [], error: ""}; }
    async open(mode = "ARTIFACTS") { this.state.mode = mode; await this.load(); }
    async load() {
        const assignment = this.assignment(); if (!assignment) return;
        const sequence=++this.loadSequence,current=()=>sequence===this.loadSequence&&assignment.id===this.assignment()?.id;
        this.state.loading = true; this.state.error = "";
        try {
            const mission = await this.request("stud-execution-state", {assignmentId: assignment.id, ...(this.state.selectedPlanId?{planId:this.state.selectedPlanId}:{}),eventLimit: 100, artifactLimit: 50});
            if(!current())return;this.state.mission=mission;
            const storageRun=this.state.mission.activeRuns.find(run=>["STORAGE_TRANSFER","STORAGE_ROLLBACK","STORAGE_COPY_CLEANUP"].includes(run.operationType));
            if(storageRun)this.state.selectedRunId=storageRun.id;
            else if (this.state.mission.executionPlan && this.state.mission.executionPlan.parentRunId) this.state.selectedRunId = this.state.mission.executionPlan.parentRunId;
            const runs = this.state.mission.activeRuns.length ? this.state.mission.activeRuns : this.state.mission.recentRuns;
            if (runs.length && !runs.some(run => run.id === this.state.selectedRunId)) this.state.selectedRunId = runs[0].id;
            if (this.state.selectedRunId){const runId=this.state.selectedRunId;const [events,artifacts]=await Promise.all([
                Promise.resolve(runId===mission.executionPlan?.parentRunId?mission.events||[]:[]).then(events => events.length ? events : this.request("stud-operation-events", {assignmentId: assignment.id, runId, limit: 100})),
                this.request("stud-operation-artifacts", {assignmentId: assignment.id, runId, limit: 50})
            ]);if(!current())return;this.state.events=events;this.state.runArtifacts=artifacts;}
            else { this.state.events = []; this.state.runArtifacts = []; }
        } catch (error) { if(!current())return;this.state.error = error.message || "Operational state unavailable."; }
        if(!current())return;
        this.state.loading = false;
        this.scheduleRefresh();
    }
    scheduleRefresh(){
        clearTimeout(this.refreshTimer);
        if(!this.state.mission||(this.state.mission.executionPlan?.state!=="RUNNING"&&!this.state.mission.activeRuns?.length))return;
        this.refreshTimer=setTimeout(async()=>{
            if(this.parent.state.mode!=="MISSION"||this.state.loading)return;
            await this.load();
            // Do not replace controls beneath keyboard focus or an open inspector.
            const focused=typeof document!=="undefined"&&document.activeElement;
            if(!focused||!focused.closest(".stud-mission-control details, .stud-mission-control input, .stud-mission-control select, .stud-mission-control textarea"))this.parent.parent.render();
        },2000);
    }
    artifactGroups() {
        const artifacts = this.state.mission && this.state.mission.artifacts || [];
        const filtered = this.state.artifactFilter === "ALL" ? artifacts : artifacts.filter(item => item.artifactType === this.state.artifactFilter);
        const groups = new Map(); filtered.forEach(item => { const key = ARTIFACT_LABELS[item.artifactType] || "OTHER"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
        return [...groups.entries()];
    }
    artifact(id) { return (this.state.mission && this.state.mission.artifacts || []).find(item => item.id === id) || null; }
    run(id) { return (this.state.mission && [...this.state.mission.activeRuns, ...this.state.mission.recentRuns] || []).find(item => item.id === id) || null; }
    progress(run) {
        if (!run || run.progressMode === "NONE") return `<span class="stud-mission-progress is-none">NO MEASURABLE PROGRESS</span>`;
        if (run.progressMode === "INDETERMINATE") return `<span class="stud-mission-progress is-indeterminate">IN PROGRESS · TOTAL UNKNOWN</span>`;
        return `<div class="stud-mission-progress is-determinate"><span><strong>${run.progressCurrent}</strong> / ${run.progressTotal} ${this.escape(run.progressUnit || "items")}</span><progress max="${run.progressTotal}" value="${run.progressCurrent}">${run.progressCurrent} / ${run.progressTotal}</progress></div>`;
    }
    stageRail(workflow, run) {
        if (!workflow) return `<div class="stud-mission-stage-empty">NO WORKFLOW IS LINKED TO THIS OPERATION.</div>`;
        return `<ol class="stud-mission-stage-rail">${workflow.graph.nodes.map(node => `<li class="is-${this.escape(node.displayState.toLowerCase().replace(/_/g, "-"))}${run && run.workflowNodeId === node.id ? " is-current" : ""}"><span aria-hidden="true">${run && run.workflowNodeId === node.id ? "◆" : node.state === "COMPLETE" ? "✓" : node.availability === "DIRECT_BLOCKER" ? "!" : "·"}</span><div><strong>${this.escape(node.title)}</strong><small>${this.escape(node.displayState.replace(/_/g, " "))}</small></div></li>`).join("")}</ol>`;
    }
    renderArtifactRow(artifact) {
        artifact={...artifact,availabilityState:this.availabilityLabel(artifact)};
        return `<button type="button" class="stud-artifact-row${artifact.id === this.state.selectedArtifactId ? " is-selected" : ""}" data-stud-artifact-select="${this.escape(artifact.id)}"><span class="stud-artifact-kind">${this.escape(artifact.artifactType.replace(/_/g, " "))}</span><strong>${this.escape(artifact.label)}</strong><small>${this.escape(artifact.origin.replace(/_/g, " "))} · ${this.escape(artifact.availabilityState)} · ${this.escape(artifact.createdAt)}</small></button>`;
    }
    availabilityLabel(artifact){return artifact.managedFileAvailability?`${artifact.availabilityState} metadata · FILE ${artifact.managedFileAvailability.state.replace(/_/g," ")}`:artifact.availabilityState;}
    renderArtifactDetail() {
        const artifact = this.artifact(this.state.selectedArtifactId); if (!artifact) return `<aside class="stud-artifact-detail is-empty"><p>Select an Artifact to inspect its canonical reference, provenance and relationships.</p></aside>`;
        const relations = this.state.relationships.length ? `<ul>${this.state.relationships.map(item => `<li><strong>${this.escape(item.relationshipType.replace(/_/g, " "))}</strong><span>${this.escape(item.fromArtifactId === artifact.id ? item.toArtifactId : item.fromArtifactId)}</span></li>`).join("")}</ul>` : `<p>NO EXPLICIT ARTIFACT RELATIONSHIPS.</p>`;
        return `<aside class="stud-artifact-detail"><header><small>${this.escape(artifact.artifactType.replace(/_/g, " "))}</small><h3>${this.escape(artifact.label)}</h3><span>${this.escape(artifact.lifecycle)} · ${this.escape(this.availabilityLabel(artifact))}</span></header>${artifact.managedFileAvailability?`<p>File presence is checked separately from canonical metadata. Integrity is rechecked when reading the managed file; no download is started here.</p>`:""}<dl><div><dt>CANONICAL OBJECT</dt><dd>${this.escape(artifact.canonicalObjectType.replace(/_/g, " "))}</dd></div><div><dt>ORIGIN</dt><dd>${this.escape(artifact.origin.replace(/_/g, " "))}</dd></div><div><dt>PRODUCER</dt><dd>${this.escape(artifact.producer)}</dd></div><div><dt>INTEGRITY</dt><dd>${this.escape(artifact.integrityHash || "NOT RECORDED")}</dd></div></dl><section><small>RELATIONSHIPS</small>${relations}</section><button type="button" data-stud-artifact-open="${this.escape(artifact.id)}"${artifact.availabilityState !== "AVAILABLE" ? " disabled" : ""}>OPEN IN ASSIGNMENT WORKSPACE</button></aside>`;
    }
    renderArtifactBay() {
        const active = this.parent.activeObject(); const groups = this.artifactGroups(); const types = [...new Set((this.state.mission && this.state.mission.artifacts || []).map(item => item.artifactType))];
        return `<section class="stud-artifact-bay"><header class="stud-operational-heading"><div><small>ASSIGNMENT ARTIFACT BAY</small><h2>What exists</h2><p>A bounded index of canonical STUD objects. Artifact Bay does not copy their contents or expose local paths.</p></div><div>${active ? `<button type="button" data-stud-artifact-register>REGISTER CURRENT OBJECT</button>` : `<span>OPEN A RELATED OBJECT TO REGISTER IT</span>`}<button type="button" data-stud-operational-refresh>REFRESH</button></div></header><nav class="stud-artifact-filter" aria-label="Artifact type filter"><button type="button" data-stud-artifact-filter="ALL" class="${this.state.artifactFilter === "ALL" ? "is-current" : ""}">ALL</button>${types.map(type => `<button type="button" data-stud-artifact-filter="${this.escape(type)}" class="${this.state.artifactFilter === type ? "is-current" : ""}">${this.escape(ARTIFACT_LABELS[type] || type)}</button>`).join("")}</nav>${groups.length ? `<div class="stud-artifact-bay-body"><main>${groups.map(([label, artifacts]) => `<section class="stud-artifact-group"><header><strong>${this.escape(label)}</strong><span>${artifacts.length}</span></header>${artifacts.map(item => this.renderArtifactRow(item)).join("")}</section>`).join("")}</main>${this.renderArtifactDetail()}</div>` : `<div class="stud-operational-empty"><strong>ARTIFACT BAY IS EMPTY</strong><p>Register an already related canonical object explicitly. Nothing is scanned, imported or inferred when this view opens.</p></div>`}</section>`;
    }
    renderEvent(event) {
        return `<li class="is-${this.escape(event.severity.toLowerCase())}"><time>${this.escape(event.createdAt)}</time><div><strong>${this.escape(event.eventType.replace(/_/g, " "))}</strong><p>${this.escape(event.summary)}</p>${event.artifactIds && event.artifactIds.length ? `<small>${event.artifactIds.length} RELATED ARTIFACT${event.artifactIds.length === 1 ? "" : "S"}</small>` : ""}</div></li>`;
    }
    renderConditions(workflow, run) {
        if (!workflow || !run || !run.workflowNodeId) return "";
        const node = workflow.graph.nodes.find(item => item.id === run.workflowNodeId); if (!node) return "";
        if (!node.directBlockers.length && !node.gateCheckpoints.length && node.availability !== "DEPENDENCY_WAIT") return "";
        return `<section class="stud-mission-conditions"><strong>${this.escape(node.availability.replace(/_/g, " "))}</strong>${node.directBlockers.map(item => `<p>BLOCKER · ${this.escape(item.title)}</p>`).join("")}${node.gateCheckpoints.map(item => `<p>HUMAN INPUT · ${this.escape(item.title)}</p>`).join("")}${node.availability === "DEPENDENCY_WAIT" ? `<p>${this.escape((node.impactSources || []).map(item => item.title).join(" · ") || "A dependency remains unavailable.")}</p>` : ""}</section>`;
    }
    renderExecutionRail(plan, workflow) {
        if (!plan) return this.stageRail(workflow, null);
        const nodes = new Map(workflow && workflow.graph ? workflow.graph.nodes.map(node => [node.id, node]) : []);
        return `<ol class="stud-mission-stage-rail stud-execution-stage-rail">${plan.steps.map(step => {
            const node=nodes.get(step.workflowNodeId),label=node&&node.title||step.taskType.replace(/_/g," "),state=step.state.toLowerCase().replace(/_/g,"-");
            return `<li class="is-${this.escape(state)}${step.state==="RUNNING"?" is-current":""}"><span aria-hidden="true">${step.state==="COMPLETED"?"✓":step.state==="FAILED"?"!":step.state==="RUNNING"?"◆":"·"}</span><div><button type="button" data-stud-step-select="${this.escape(step.id)}">${this.escape(label)}</button><small>${this.escape(step.state.replace(/_/g," "))}</small></div></li>`;
        }).join("")}</ol>`;
    }
    renderLaunch(plan, mission) {
        const profiles=mission.profiles||[],workflow=mission.workflow;
        if (!workflow) return `<div class="stud-operational-empty"><strong>WORKFLOW REQUIRED</strong><p>Create or select the current Assignment Workflow before preparing a Run.</p></div>`;
        if (!plan) return `<section class="stud-mission-launch"><header><small>RUN ASSIGNMENT</small><h2>Prepare real bounded execution</h2><p>Review machine work, human gates and external waits before anything starts.</p></header><div class="stud-mission-launch-options"><label>Scope<select data-stud-execution-scope><option value="CURRENT_STAGE">Current stage</option><option value="SELECTED_STAGES">Selected stages (choose below)</option><option value="FROM_CURRENT_STAGE">From current stage</option><option value="FULL_AVAILABLE_WORKFLOW">Full available workflow</option></select></label><label>Resource profile<select data-stud-execution-profile>${profiles.map(item=>`<option value="${this.escape(item.id)}">${this.escape(item.name)}</option>`).join("")}</select></label></div>${this.renderExecutionOptions(mission)}<button type="button" data-stud-execution-prepare>REVIEW RUN</button></section>`;
        if (plan.state !== "READY") return "";
        const counts=plan.steps.reduce((out,step)=>{out[step.executionClass]=(out[step.executionClass]||0)+1;return out;},{});
        const profile=profiles.find(item=>item.id===plan.resourceProfileId);
        return `<section class="stud-mission-preflight"><header><small>RUN PREFLIGHT</small><h2>${this.escape(this.assignment().title)}</h2><p>Nothing has started. Review the actual scope.</p></header>${this.renderExecutionRail(plan,workflow)}<dl><div><dt>MACHINE OPERABLE</dt><dd>${counts.AUTO_EXECUTABLE||0}</dd></div><div><dt>HUMAN / MANUAL</dt><dd>${(counts.HUMAN_GATE||0)+(counts.MANUAL_ONLY||0)}</dd></div><div><dt>EXTERNAL WAITS</dt><dd>${counts.EXTERNAL_WAIT||0}</dd></div><div><dt>UNSUPPORTED</dt><dd>${counts.UNSUPPORTED||0}</dd></div><div><dt>RESOURCE PROFILE</dt><dd>${this.escape(profile&&profile.name||"Unknown")}</dd></div><div><dt>MODEL ROUTING</dt><dd>${this.escape(plan.routingPolicy)}</dd></div></dl>${profile&&profile.profileType==="OVERNIGHT"?`<p class="stud-mission-warning">Overnight may use a large share of available compute and memory.</p>`:""}${this.renderInputReview(plan)}<footer><button type="button" data-stud-execution-launch>LAUNCH RUN</button><button type="button" data-stud-execution-cancel>DISCARD PREFLIGHT</button></footer></section>`;
    }
    renderExecutionOptions(mission){
        const options=mission.launchOptions||{sections:[],sessions:[],models:[],capabilities:[]},workflow=mission.workflow;
        return `<details class="stud-execution-options"><summary>Stage inputs, model and resource options</summary><div class="stud-mission-launch-options"><label>Model routing<select data-stud-execution-model><option value="">Automatic · validated local models only</option>${options.models.map(model=>`<option value="${this.escape(model.id)}">${this.escape(model.identity)} · ${this.escape(model.availability)}</option>`).join("")}</select></label><label>Capability to check<select data-stud-execution-capability>${options.capabilities.map(value=>`<option value="${this.escape(value)}">${this.escape(value.replace(/_/g," "))}</option>`).join("")}</select></label></div><p>Capability checks use synthetic data. They do not establish academic quality. Models are never downloaded.</p><button type="button" data-stud-execution-models>REFRESH LOCAL MODELS</button><button type="button" data-stud-execution-probe>CHECK SELECTED CAPABILITY</button>${options.models.map(model=>`<p>${this.escape(model.identity)} · ${model.assessments.filter(a=>a.assessment!=="UNVERIFIED").map(a=>this.escape(`${a.capability}: ${a.assessment}`)).join(" · ")||"Not yet checked"}</p>`).join("")}<div class="stud-execution-inputs">${workflow.graph.nodes.filter(node=>!["COMPLETE","SKIPPED"].includes(node.state)).map(node=>`<div data-stud-task-node="${this.escape(node.id)}"><label><input type="checkbox" data-stud-stage-selected> ${this.escape(node.title)}</label><label>Canonical input<select data-stud-task-input><option value="">Default / human input required</option>${node.semanticType==="WRITING"?options.sections.map(s=>`<option value="section:${this.escape(s.id)}">Section · ${this.escape(s.title)}</option>`).join(""):""}${options.sessions.map(s=>`<option value="session:${this.escape(s.id)}">${this.escape(s.label)}</option>`).join("")}</select></label></div>`).join("")}</div><details class="stud-execution-profile"><summary>Custom resource profile</summary><p>These settings bound concurrency and context, not CPU percentages. Low free memory is a conservative signal, not an OS pressure measurement.</p><div class="stud-mission-launch-options"><label>Name<input data-profile-name value="Custom local work" maxlength="120"></label><label>Light tasks<input data-profile-light type="number" min="1" max="16" value="2"></label><label>Model tasks<input data-profile-model type="number" min="0" max="1" value="1"></label><label>Context limit<input data-profile-context type="number" min="512" max="262144" value="8192"></label><label>Timeout seconds<input data-profile-timeout type="number" min="1" max="7200" value="300"></label><label>Memory reserve MiB<input data-profile-memory type="number" min="256" value="1024"></label></div><label><input type="checkbox" data-profile-memory-pause checked> Pause new work below the memory reserve</label><label><input type="checkbox" data-profile-battery checked> Pause new work on battery</label><label><input type="checkbox" data-profile-awake> Keep application awake while executing</label><button type="button" data-stud-execution-profile-save>SAVE CUSTOM PROFILE</button></details></details>`;
    }
    renderInputReview(plan){
        const first=plan.steps.find(s=>s.inputSnapshot),input=first&&first.inputSnapshot||{},contract=input.contract;
        return `<details class="stud-execution-options"><summary>Academic inputs and limitations</summary><p>Requirements: ${contract?this.escape(`revision ${contract.revision} · ${contract.completeness} · ${contract.freshness&&contract.freshness.reviewCondition||"unknown freshness"}`):"No approved contract. Only compatible manual/deterministic work can proceed."}</p><p>Composition: ${input.composition?this.escape(`revision ${input.composition.revision} · ${input.composition.lifecycle}`):"Not available"}</p>${plan.steps.map(s=>{const i=s.inputSnapshot||{};return `<p><strong>${this.escape((s.taskType||"Task").replace(/_/g," "))}</strong> · ${this.escape(s.stateReason||s.executionClass||"")}${i.section?` · Section: ${this.escape(i.section.title)}`:""}${i.coverage?` · ${Number(i.coverage.includedClaims)||0} reviewed Claims included`:""}</p>${(i.limitations||[]).map(reason=>`<p>${this.escape(reason)}</p>`).join("")}`;}).join("")}<p>Missing evidence is not fabricated. Launch never approves academic work or submits it to a university.</p></details>`;
    }
    renderCandidates(plan){
        return plan.steps.filter(step=>step.outputSummary&&step.outputSummary.kind==="SECTION_DRAFT_CANDIDATE"&&step.outputSummary.candidate).map(step=>{const output=step.outputSummary;return `<details class="stud-execution-candidate"><summary>Review Section Draft candidate · ${output.accepted?"accepted":output.rejected?"rejected":"decision required"}</summary><p>Local model suggestion, not reviewed academic truth. Acceptance creates a new immutable Draft Version.</p><pre>${this.escape(output.candidate)}</pre><ul>${(output.limitations||[]).map(item=>`<li>${this.escape(item)}</li>`).join("")}</ul>${!output.accepted&&!output.rejected?`<button type="button" data-stud-draft-decision="accept" data-step-id="${this.escape(step.id)}">ACCEPT INTO NEW DRAFT</button><button type="button" data-stud-draft-decision="reject" data-step-id="${this.escape(step.id)}">REJECT CANDIDATE</button>`:""}</details>`;}).join("");
    }
    renderStepInspection(plan) {
        const step=plan.steps.find(item=>item.id===this.state.selectedStepId)||plan.steps.find(item=>item.state==="RUNNING")||plan.steps.find(item=>["WAITING_HUMAN","WAITING_EXTERNAL","FAILED","INTERRUPTED"].includes(item.state))||null;
        if(!step)return `<section class="stud-mission-current"><small>CURRENT OPERATION</small><h3>NO TASK RUNNING</h3><p>${this.escape(plan.statusSummary||"Execution is resting.")}</p></section>`;
        const attempt=step.attempts&&step.attempts[0],route=step.route,canRetry=plan.state==="PAUSED"&&step.state==="FAILED"&&step.attemptCount<=step.maxRetries,canSkip=["PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(plan.state)&&step.canSkip&&!["RUNNING","COMPLETED","FAILED","CANCELLED","SKIPPED","UNSUPPORTED"].includes(step.state);
        return `<section class="stud-mission-current"><small>CURRENT OPERATION</small><h3>${this.escape(step.taskType.replace(/_/g," "))}</h3><strong>${this.escape(step.state.replace(/_/g," "))}</strong><p>${this.escape(step.stateReason||plan.statusSummary||"")}</p>${route?`<dl><div><dt>MODEL ROUTE</dt><dd>${this.escape(route.outcome)}</dd></div><div><dt>WHY</dt><dd>${this.escape(route.reason)}</dd></div></dl>`:""}${attempt?`<small>ELAPSED ${this.escape(duration(attempt.startedAt,attempt.finishedAt))}</small>`:""}${step.state==="RUNNING"?`<span class="stud-mission-progress is-indeterminate">${step.capability?"MODEL REQUEST ACTIVE · TOTAL UNKNOWN":"OPERATION ACTIVE"}</span>`:""}${canRetry?`<button type="button" data-stud-step-retry="${this.escape(step.id)}">RETRY STEP</button>`:""}${canSkip?`<button type="button" data-stud-step-skip="${this.escape(step.id)}">SKIP EXECUTION STEP</button>`:""}</section>`;
    }
    renderExecutionMission(mission) {
        const plan=mission.executionPlan,workflow=mission.workflow;
        if (!plan || plan.state==="READY") return `<section class="stud-mission-control is-resting"><header class="stud-operational-heading"><div><small>MISSION CONTROL</small><h2>Nothing is running</h2><p>Mission Control shows only real execution. Preparing a Run does not start it.</p></div><button type="button" data-stud-operational-refresh>REFRESH</button></header>${this.renderLaunch(plan,mission)}</section>`;
        const artifacts=(mission.planArtifacts||[]).slice(0,20),active=["RUNNING","PAUSED","WAITING_HUMAN","WAITING_EXTERNAL","INTERRUPTED"].includes(plan.state),controls=active?`<div class="stud-mission-controls">${plan.state==="RUNNING"?`<button type="button" data-stud-execution-pause>PAUSE AFTER CURRENT</button>`:`<button type="button" data-stud-execution-resume>RESUME</button>`}<button type="button" data-stud-execution-cancel>CANCEL RUN</button></div>`:`<div class="stud-mission-controls"><button type="button" data-stud-execution-new>PREPARE ANOTHER RUN</button></div>`;
        const history=(mission.executionHistory||[]).filter(item=>item.id!==plan.id);
        return `<section class="stud-mission-control ${active?"is-active":"is-history"}"><header class="stud-operational-heading"><div><small>MISSION CONTROL · ${this.escape(plan.state)}</small><h2>${this.escape(this.assignment().title)}</h2><p>${this.escape(plan.statusSummary||"")}</p></div><div><strong>${this.escape(plan.state)}</strong><span>ELAPSED ${this.escape(duration(plan.startedAt||plan.createdAt,plan.finishedAt))}</span><button type="button" data-stud-operational-refresh>REFRESH</button></div></header>${this.renderExecutionRail(plan,workflow)}${controls}<div class="stud-mission-body"><aside class="stud-mission-artifacts"><header><strong>ARTIFACT ACTIVITY</strong><span>${artifacts.length}</span></header>${artifacts.length?artifacts.map(item=>this.renderArtifactRow(item)).join(""):`<p>No Artifact was linked to this Execution Plan.</p>`}</aside><main class="stud-mission-inspection">${this.renderStepInspection(plan)}${this.renderCandidates(plan)}<section class="stud-mission-events"><header><strong>OPERATIONAL EVENTS</strong><span>${this.state.events.length} SHOWN</span></header>${mission.historyBounds&&mission.historyBounds.truncated?`<p>Bounded history: older events, artifacts or child operations are omitted from this view. Stored history is retained.</p>`:""}${this.state.events.length?`<ol>${this.state.events.map(event=>this.renderEvent(event)).join("")}</ol>`:`<p>NO RECORDED EVENTS.</p>`}</section></main></div>${mission.incidents&&mission.incidents.length?`<details class="stud-mission-history"><summary>WATCHDOG INCIDENTS · ${mission.incidents.length}</summary>${mission.incidents.map(item=>`<p><strong>${this.escape(item.incidentType.replace(/_/g," "))}</strong> · ${this.escape(item.observedCondition)}</p>`).join("")}</details>`:""}${history.length?`<details class="stud-mission-history"><summary>EXECUTION HISTORY · ${history.length}</summary>${history.map(item=>`<button type="button" data-stud-execution-select="${this.escape(item.id)}"><strong>${this.escape(item.scope.replace(/_/g," "))}</strong><span>${this.escape(item.state)} · ${this.escape(item.createdAt)}</span></button>`).join("")}</details>`:""}</section>`;
    }
    renderMission() {
        const mission = this.state.mission; const active = mission.activeRuns[0] || null; const selected = this.run(this.state.selectedRunId) || active; const workflow = mission.workflow;
        const storageSelected=selected&&["STORAGE_TRANSFER","STORAGE_ROLLBACK","STORAGE_COPY_CLEANUP"].includes(selected.operationType);
        if (!storageSelected&&(mission.executionPlan || (!mission.activeRuns.length && !mission.recentRuns.length && Object.prototype.hasOwnProperty.call(mission,"executionPlan")))) return this.renderExecutionMission(mission);
        if (mission.resting && !selected) return `<section class="stud-mission-control is-resting"><header class="stud-operational-heading"><div><small>MISSION CONTROL</small><h2>Nothing is running</h2><p>Mission Control will show only real bounded operations and their recorded history.</p></div><button type="button" data-stud-operational-refresh>REFRESH</button></header>${this.stageRail(workflow, null)}<div class="stud-operational-empty"><strong>NO OPERATION HISTORY</strong><p>No Run has been recorded for this Assignment. There is no simulated progress, telemetry or activity feed.</p></div></section>`;
        const produced = selected ? this.state.runArtifacts.slice(0, 20) : [];
        return `<section class="stud-mission-control${active ? " is-active" : " is-history"}"><header class="stud-operational-heading"><div><small>MISSION CONTROL · ${active ? "ACTIVE" : "HISTORY"}</small><h2>${this.escape(selected.operationType.replace(/_/g, " "))}</h2><p>${this.escape(selected.statusSummary || selected.state.replace(/_/g, " "))}</p></div><div><strong>${this.escape(selected.state)}</strong><span>ELAPSED ${this.escape(duration(selected.startedAt || selected.createdAt, selected.finishedAt))}</span><button type="button" data-stud-operational-refresh>REFRESH</button></div></header>${this.stageRail(workflow, selected)}<div class="stud-mission-body"><aside class="stud-mission-artifacts"><header><strong>ARTIFACT ACTIVITY</strong><span>${produced.length}</span></header>${produced.length ? produced.map(item => this.renderArtifactRow(item)).join("") : `<p>No Artifact is linked to this operation/stage.</p>`}</aside><main class="stud-mission-inspection"><section class="stud-mission-current"><small>CURRENT OPERATION</small><h3>${this.escape(selected.operationType.replace(/_/g, " "))}</h3>${this.progress(selected)}${this.renderConditions(workflow, selected)}${selected.errorSummary ? `<p class="stud-mission-error">${this.escape(selected.errorSummary)}</p>` : ""}<small>${storageSelected ? "Storage controls are available in Assignment → Files &amp; storage while an operation supports them." : "This view inspects recorded operations. Controls are shown only by the service that can perform them."}</small></section><section class="stud-mission-events"><header><strong>OPERATIONAL EVENTS</strong><span>${this.state.events.length} SHOWN</span></header>${this.state.events.length ? `<ol>${this.state.events.map(event => this.renderEvent(event)).join("")}</ol>` : `<p>NO RECORDED EVENTS FOR THIS RUN.</p>`}</section></main></div>${mission.recentRuns.length ? `<details class="stud-mission-history"><summary>RUN HISTORY · ${mission.recentRuns.length}</summary>${mission.recentRuns.map(run => `<button type="button" data-stud-operation-select="${this.escape(run.id)}" class="${run.id === selected.id ? "is-current" : ""}"><strong>${this.escape(run.operationType.replace(/_/g, " "))}</strong><span>${this.escape(run.state)} · ${this.escape(run.createdAt)}</span></button>`).join("")}</details>` : ""}</section>`;
    }
    render() {
        if (this.state.loading && !this.state.mission) return `<section class="stud-operational-empty"><strong>LOADING LOCAL OPERATIONAL STATE…</strong></section>`;
        if (this.state.error) return `<section class="stud-operational-empty is-error"><strong>OPERATIONAL STATE UNAVAILABLE</strong><p>${this.escape(this.state.error)}</p><button type="button" data-stud-operational-refresh>RETRY</button></section>`;
        if (!this.state.mission) return `<section class="stud-operational-empty"><strong>OPEN ARTIFACT BAY OR MISSION CONTROL</strong></section>`;
        return this.state.mode === "MISSION" ? this.renderMission() : this.renderArtifactBay();
    }
    async selectArtifact(id) { this.state.selectedArtifactId = id; this.state.relationships = await this.request("stud-artifact-relationships", {assignmentId: this.assignment().id, artifactId: id, limit: 50}); this.parent.parent.render(); }
    async registerCurrent() {
        const assignment = this.assignment(); const active = this.parent.activeObject(); const workflow = this.parent.workflow(); const node = this.parent.selectedNode(); if (!assignment || !active) return;
        const result = await this.request("stud-artifact-register", {assignmentId: assignment.id, canonicalObjectType: active.entityType, canonicalObjectId: active.id, workflowId: workflow && workflow.id || undefined, workflowNodeId: node && node.id || undefined});
        await this.load(); this.state.selectedArtifactId = result.artifact.id; this.state.relationships = await this.request("stud-artifact-relationships", {assignmentId: assignment.id, artifactId: result.artifact.id, limit: 50}); this.showToast(this.parent.parent.view, result.created ? "ARTIFACT REGISTERED" : "ARTIFACT ALREADY REGISTERED"); this.parent.parent.render();
    }
    async handleClick(event) {
        if(await this.handleExecutionOptions(event))return true;
        const refresh = event.target.closest("[data-stud-operational-refresh]"); const register = event.target.closest("[data-stud-artifact-register]"); const select = event.target.closest("[data-stud-artifact-select]"); const open = event.target.closest("[data-stud-artifact-open]"); const filter = event.target.closest("[data-stud-artifact-filter]"); const run = event.target.closest("[data-stud-operation-select]");
        const prepare=event.target.closest("[data-stud-execution-prepare]"),launch=event.target.closest("[data-stud-execution-launch]"),pause=event.target.closest("[data-stud-execution-pause]"),resume=event.target.closest("[data-stud-execution-resume]"),cancel=event.target.closest("[data-stud-execution-cancel]"),newRun=event.target.closest("[data-stud-execution-new]"),executionSelect=event.target.closest("[data-stud-execution-select]");
        if (!refresh && !register && !select && !open && !filter && !run && !prepare && !launch && !pause && !resume && !cancel && !newRun && !executionSelect) return false;
        try {
            if (refresh) { await this.load(); this.parent.parent.render(); }
            else if (register) await this.registerCurrent();
            else if (select) await this.selectArtifact(select.dataset.studArtifactSelect);
            else if (open) { const artifact = this.artifact(open.dataset.studArtifactOpen); if (artifact) await this.parent.openObject(artifact.canonicalObjectType, artifact.canonicalObjectId, {originSurface: "ARTIFACT_BAY"}); }
            else if (filter) { this.state.artifactFilter = filter.dataset.studArtifactFilter; this.parent.parent.render(); }
            else if (newRun) { this.state.selectedPlanId=""; this.state.mission={...this.state.mission,executionPlan:null}; this.parent.parent.render(); }
            else if (executionSelect) { this.state.selectedPlanId=executionSelect.dataset.studExecutionSelect;this.state.mission=await this.request("stud-execution-state",{assignmentId:this.assignment().id,planId:executionSelect.dataset.studExecutionSelect,eventLimit:100,artifactLimit:50}); this.state.events=this.state.mission.events||[]; this.parent.parent.render(); }
            else if (prepare) {
                const root=prepare.closest(".stud-mission-launch"),scope=root.querySelector("[data-stud-execution-scope]").value,resourceProfileId=root.querySelector("[data-stud-execution-profile]").value,pinnedModelId=root.querySelector("[data-stud-execution-model]").value,rows=[...root.querySelectorAll("[data-stud-task-node]")],selectedNodeIds=rows.filter(row=>row.querySelector("[data-stud-stage-selected]").checked).map(row=>row.dataset.studTaskNode),taskSelections=rows.filter(row=>scope!=="SELECTED_STAGES"||selectedNodeIds.includes(row.dataset.studTaskNode)).flatMap(row=>{const value=row.querySelector("[data-stud-task-input]").value;if(!value)return [];const [type,id]=value.split(":");return [{workflowNodeId:row.dataset.studTaskNode,[type==="section"?"sectionId":"sessionId"]:id}];});
                this.state.selectedPlanId="";await this.request("stud-execution-plan-create",{assignmentId:this.assignment().id,workflowId:this.state.mission.workflow.id,scope,selectedNodeIds,taskSelections,resourceProfileId,routingPolicy:pinnedModelId?"PINNED":"AUTOMATIC",...(pinnedModelId?{pinnedModelId}:{}),priority:"NORMAL",launchPolicy:"EXPLICIT"}); await this.load(); this.parent.parent.render();
            } else if (launch) {
                const plan=this.state.mission.executionPlan; await this.request("stud-execution-launch",{assignmentId:this.assignment().id,planId:plan.id,expectedVersion:plan.rowVersion,confirmLaunch:true}); await this.load(); this.parent.parent.render();
            } else if (pause) {
                const plan=this.state.mission.executionPlan; await this.request("stud-execution-pause",{assignmentId:this.assignment().id,planId:plan.id,expectedVersion:plan.rowVersion}); await this.load(); this.parent.parent.render();
            } else if (resume) {
                const plan=this.state.mission.executionPlan; await this.request("stud-execution-resume",{assignmentId:this.assignment().id,planId:plan.id,expectedVersion:plan.rowVersion}); await this.load(); this.parent.parent.render();
            } else if (cancel) {
                const plan=this.state.mission.executionPlan; await this.request("stud-execution-cancel",{assignmentId:this.assignment().id,planId:plan.id,expectedVersion:plan.rowVersion}); await this.load(); this.parent.parent.render();
            } else { this.state.selectedRunId = run.dataset.studOperationSelect; [this.state.events, this.state.runArtifacts] = await Promise.all([this.request("stud-operation-events", {assignmentId: this.assignment().id, runId: this.state.selectedRunId, limit: 100}), this.request("stud-operation-artifacts", {assignmentId: this.assignment().id, runId: this.state.selectedRunId, limit: 50})]); this.parent.parent.render(); }
        } catch (error) { this.showToast(this.parent.parent.view, error.message || "OPERATIONAL ACTION UNAVAILABLE"); }
        return true;
    }
    async handleExecutionOptions(event){
        const button=event.target.closest("[data-stud-execution-models],[data-stud-execution-probe],[data-stud-execution-profile-save],[data-stud-draft-decision],[data-stud-step-select],[data-stud-step-retry],[data-stud-step-skip]");if(!button)return false;
        try{
            const root=button.closest(".stud-mission-control"),assignmentId=this.assignment().id,plan=this.state.mission.executionPlan;
            if(button.hasAttribute("data-stud-execution-models"))await this.request("stud-execution-model-inventory",{});
            else if(button.hasAttribute("data-stud-execution-probe")){const modelId=root.querySelector("[data-stud-execution-model]").value;if(!modelId)throw new Error("Select a local model to check its capability.");button.disabled=true;await this.request("stud-execution-model-probe",{modelId,capability:root.querySelector("[data-stud-execution-capability]").value,explicitRequest:true});}
            else if(button.hasAttribute("data-stud-execution-profile-save")){const form=button.closest(".stud-execution-profile"),value=key=>form.querySelector(`[data-profile-${key}]`);await this.request("stud-execution-resource-profile-save",{name:value("name").value,maxLightTasks:Number(value("light").value),maxNetworkTasks:0,maxModelTasks:Number(value("model").value),maxModelContext:Number(value("context").value),timeoutMs:Number(value("timeout").value)*1000,minAvailableMemoryBytes:Number(value("memory").value)*1048576,pauseOnMemoryPressure:value("memory-pause").checked,pauseOnBattery:value("battery").checked,keepAwake:value("awake").checked,maxRetries:0});}
            else if(button.hasAttribute("data-stud-step-select")){this.state.selectedStepId=button.dataset.studStepSelect;this.parent.parent.render();return true;}
            else if(button.hasAttribute("data-stud-draft-decision")){const step=plan.steps.find(item=>item.id===button.dataset.stepId);await this.request(button.dataset.studDraftDecision==="accept"?"stud-execution-draft-accept":"stud-execution-draft-reject",{assignmentId,planId:plan.id,stepId:step.id,expectedStepVersion:step.rowVersion});}
            else {const id=button.dataset.studStepRetry||button.dataset.studStepSkip,step=plan.steps.find(item=>item.id===id),retry=button.hasAttribute("data-stud-step-retry");await this.request(retry?"stud-execution-retry":"stud-execution-skip",{assignmentId,planId:plan.id,stepId:id,expectedPlanVersion:plan.rowVersion,expectedStepVersion:step.rowVersion,...(!retry?{reason:"Explicit user skip in Mission Control; no Workflow completion claimed."}:{})});}
            await this.load();this.parent.parent.render();
        }catch(error){button.disabled=false;this.showToast(this.parent.parent.view,error.message||"Execution action unavailable.");}
        return true;
    }
}

if (typeof window !== "undefined") window.StudMissionControlWorkspace = StudMissionControlWorkspace;
module.exports = {StudMissionControlWorkspace, ARTIFACT_LABELS, duration};
