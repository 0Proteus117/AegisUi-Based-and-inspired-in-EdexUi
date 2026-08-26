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
        this.state = {mode: "ARTIFACTS", mission: null, events: [], runArtifacts: [], selectedRunId: "", selectedArtifactId: "", relationships: [], loading: false, error: "", artifactFilter: "ALL"};
    }
    assignment() { return this.parent.assignment(); }
    reset() { this.state = {...this.state, mission: null, events: [], runArtifacts: [], selectedRunId: "", selectedArtifactId: "", relationships: [], error: ""}; }
    async open(mode = "ARTIFACTS") { this.state.mode = mode; await this.load(); }
    async load() {
        const assignment = this.assignment(); if (!assignment) return;
        this.state.loading = true; this.state.error = "";
        try {
            this.state.mission = await this.request("stud-mission-control-state", {assignmentId: assignment.id, historyLimit: 25, artifactLimit: 50});
            const runs = this.state.mission.activeRuns.length ? this.state.mission.activeRuns : this.state.mission.recentRuns;
            if (runs.length && !runs.some(run => run.id === this.state.selectedRunId)) this.state.selectedRunId = runs[0].id;
            if (this.state.selectedRunId) [this.state.events, this.state.runArtifacts] = await Promise.all([
                this.request("stud-operation-events", {assignmentId: assignment.id, runId: this.state.selectedRunId, limit: 100}),
                this.request("stud-operation-artifacts", {assignmentId: assignment.id, runId: this.state.selectedRunId, limit: 50})
            ]);
            else { this.state.events = []; this.state.runArtifacts = []; }
        } catch (error) { this.state.error = error.message || "Operational state unavailable."; }
        this.state.loading = false;
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
        return `<button type="button" class="stud-artifact-row${artifact.id === this.state.selectedArtifactId ? " is-selected" : ""}" data-stud-artifact-select="${this.escape(artifact.id)}"><span class="stud-artifact-kind">${this.escape(artifact.artifactType.replace(/_/g, " "))}</span><strong>${this.escape(artifact.label)}</strong><small>${this.escape(artifact.origin.replace(/_/g, " "))} · ${this.escape(artifact.availabilityState)} · ${this.escape(artifact.createdAt)}</small></button>`;
    }
    renderArtifactDetail() {
        const artifact = this.artifact(this.state.selectedArtifactId); if (!artifact) return `<aside class="stud-artifact-detail is-empty"><p>Select an Artifact to inspect its canonical reference, provenance and relationships.</p></aside>`;
        const relations = this.state.relationships.length ? `<ul>${this.state.relationships.map(item => `<li><strong>${this.escape(item.relationshipType.replace(/_/g, " "))}</strong><span>${this.escape(item.fromArtifactId === artifact.id ? item.toArtifactId : item.fromArtifactId)}</span></li>`).join("")}</ul>` : `<p>NO EXPLICIT ARTIFACT RELATIONSHIPS.</p>`;
        return `<aside class="stud-artifact-detail"><header><small>${this.escape(artifact.artifactType.replace(/_/g, " "))}</small><h3>${this.escape(artifact.label)}</h3><span>${this.escape(artifact.lifecycle)} · ${this.escape(artifact.availabilityState)}</span></header><dl><div><dt>CANONICAL OBJECT</dt><dd>${this.escape(artifact.canonicalObjectType.replace(/_/g, " "))}</dd></div><div><dt>ORIGIN</dt><dd>${this.escape(artifact.origin.replace(/_/g, " "))}</dd></div><div><dt>PRODUCER</dt><dd>${this.escape(artifact.producer)}</dd></div><div><dt>INTEGRITY</dt><dd>${this.escape(artifact.integrityHash || "NOT RECORDED")}</dd></div></dl><section><small>RELATIONSHIPS</small>${relations}</section><button type="button" data-stud-artifact-open="${this.escape(artifact.id)}"${artifact.availabilityState !== "AVAILABLE" ? " disabled" : ""}>OPEN IN ASSIGNMENT WORKSPACE</button></aside>`;
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
    renderMission() {
        const mission = this.state.mission; const active = mission.activeRuns[0] || null; const selected = this.run(this.state.selectedRunId) || active; const workflow = mission.workflow;
        if (mission.resting && !selected) return `<section class="stud-mission-control is-resting"><header class="stud-operational-heading"><div><small>MISSION CONTROL</small><h2>Nothing is running</h2><p>Mission Control will show only real bounded operations and their recorded history.</p></div><button type="button" data-stud-operational-refresh>REFRESH</button></header>${this.stageRail(workflow, null)}<div class="stud-operational-empty"><strong>NO OPERATION HISTORY</strong><p>No Run has been recorded for this Assignment. There is no simulated progress, telemetry or activity feed.</p></div></section>`;
        const produced = selected ? this.state.runArtifacts.slice(0, 20) : [];
        return `<section class="stud-mission-control${active ? " is-active" : " is-history"}"><header class="stud-operational-heading"><div><small>MISSION CONTROL · ${active ? "ACTIVE" : "HISTORY"}</small><h2>${this.escape(selected.operationType.replace(/_/g, " "))}</h2><p>${this.escape(selected.statusSummary || selected.state.replace(/_/g, " "))}</p></div><div><strong>${this.escape(selected.state)}</strong><span>ELAPSED ${this.escape(duration(selected.startedAt || selected.createdAt, selected.finishedAt))}</span><button type="button" data-stud-operational-refresh>REFRESH</button></div></header>${this.stageRail(workflow, selected)}<div class="stud-mission-body"><aside class="stud-mission-artifacts"><header><strong>ARTIFACT ACTIVITY</strong><span>${produced.length}</span></header>${produced.length ? produced.map(item => this.renderArtifactRow(item)).join("") : `<p>No Artifact is linked to this operation/stage.</p>`}</aside><main class="stud-mission-inspection"><section class="stud-mission-current"><small>CURRENT OPERATION</small><h3>${this.escape(selected.operationType.replace(/_/g, " "))}</h3>${this.progress(selected)}${this.renderConditions(workflow, selected)}${selected.errorSummary ? `<p class="stud-mission-error">${this.escape(selected.errorSummary)}</p>` : ""}<small>Pause/cancel controls are absent because M6 has no autonomous worker coordinator.</small></section><section class="stud-mission-events"><header><strong>OPERATIONAL EVENTS</strong><span>${this.state.events.length} SHOWN</span></header>${this.state.events.length ? `<ol>${this.state.events.map(event => this.renderEvent(event)).join("")}</ol>` : `<p>NO RECORDED EVENTS FOR THIS RUN.</p>`}</section></main></div>${mission.recentRuns.length ? `<details class="stud-mission-history"><summary>RUN HISTORY · ${mission.recentRuns.length}</summary>${mission.recentRuns.map(run => `<button type="button" data-stud-operation-select="${this.escape(run.id)}" class="${run.id === selected.id ? "is-current" : ""}"><strong>${this.escape(run.operationType.replace(/_/g, " "))}</strong><span>${this.escape(run.state)} · ${this.escape(run.createdAt)}</span></button>`).join("")}</details>` : ""}</section>`;
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
        const refresh = event.target.closest("[data-stud-operational-refresh]"); const register = event.target.closest("[data-stud-artifact-register]"); const select = event.target.closest("[data-stud-artifact-select]"); const open = event.target.closest("[data-stud-artifact-open]"); const filter = event.target.closest("[data-stud-artifact-filter]"); const run = event.target.closest("[data-stud-operation-select]");
        if (!refresh && !register && !select && !open && !filter && !run) return false;
        try {
            if (refresh) { await this.load(); this.parent.parent.render(); }
            else if (register) await this.registerCurrent();
            else if (select) await this.selectArtifact(select.dataset.studArtifactSelect);
            else if (open) { const artifact = this.artifact(open.dataset.studArtifactOpen); if (artifact) await this.parent.openObject(artifact.canonicalObjectType, artifact.canonicalObjectId, {originSurface: "ARTIFACT_BAY"}); }
            else if (filter) { this.state.artifactFilter = filter.dataset.studArtifactFilter; this.parent.parent.render(); }
            else { this.state.selectedRunId = run.dataset.studOperationSelect; [this.state.events, this.state.runArtifacts] = await Promise.all([this.request("stud-operation-events", {assignmentId: this.assignment().id, runId: this.state.selectedRunId, limit: 100}), this.request("stud-operation-artifacts", {assignmentId: this.assignment().id, runId: this.state.selectedRunId, limit: 50})]); this.parent.parent.render(); }
        } catch (error) { this.showToast(this.parent.parent.view, error.message || "OPERATIONAL ACTION UNAVAILABLE"); }
        return true;
    }
}

if (typeof window !== "undefined") window.StudMissionControlWorkspace = StudMissionControlWorkspace;
module.exports = {StudMissionControlWorkspace, ARTIFACT_LABELS, duration};
