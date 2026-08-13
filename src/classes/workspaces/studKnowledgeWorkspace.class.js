"use strict";

const ROOT_TYPES = Object.freeze(["ASSIGNMENT", "COURSE", "RESEARCH_PAPER", "ACADEMIC_DOCUMENT", "NOTE", "REVISION_ITEM"]);

class StudKnowledgeWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {choices: {}, rootType: "ASSIGNMENT", rootId: "", context: null, packages: [], searchQuery: "", searchResults: [], busy: false, error: null};
    }

    async initialize() { await this.refreshChoices(); }

    async refreshChoices() {
        const request = type => this.request("stud-entity-list", {entityType: type, limit: 200});
        const [assignments, courses, papers, documents, notes, revisions] = await Promise.all([request("ASSIGNMENT"), request("COURSE"), request("RESEARCH_PAPER"), request("ACADEMIC_DOCUMENT"), request("NOTE"), request("REVISION_ITEM")]);
        this.state.choices = {ASSIGNMENT: assignments, COURSE: courses, RESEARCH_PAPER: papers, ACADEMIC_DOCUMENT: documents, NOTE: notes, REVISION_ITEM: revisions};
        if (!this.state.rootId || !(this.state.choices[this.state.rootType] || []).some(item => item.id === this.state.rootId)) this.state.rootId = (this.state.choices[this.state.rootType] || [])[0]?.id || "";
    }

    async build() {
        if (!this.state.rootId) throw new Error("Create or select a local academic object before building context.");
        this.state.busy = true; this.state.error = null; this.parent.render();
        try {
            this.state.context = await this.request("stud-academic-context-build", {rootType: this.state.rootType, rootId: this.state.rootId, options: {limit: 80, includeSuggested: true, refreshConcepts: true}});
            this.state.packages = await this.request("stud-academic-context-package-list", {rootType: this.state.rootType, rootId: this.state.rootId, limit: 12});
        } finally { this.state.busy = false; this.parent.render(); }
    }

    options(type) {
        const values = this.state.choices[type] || [];
        return values.length ? values.map(item => `<option value="${this.escape(item.id)}"${this.state.rootId === item.id && this.state.rootType === type ? " selected" : ""}>${this.escape(item.title || item.prompt || item.id)}</option>`).join("") : `<option value="">NO LOCAL ${type.replace(/_/g, " ")} AVAILABLE</option>`;
    }

    render() {
        const context = this.state.context;
        return `<section class="stud-knowledge-workspace">
            <article class="workspace-panel stud-knowledge-builder"><header><h2>ACADEMIC CONTEXT BUILDER</h2><span>LOCAL / EXPLAINABLE</span></header><div class="workspace-panel-content">
                <form data-stud-knowledge-build-form class="stud-knowledge-form"><label>CONTEXT ROOT<select class="aegis-input" name="rootType">${ROOT_TYPES.map(type => `<option value="${type}"${this.state.rootType === type ? " selected" : ""}>${type.replace(/_/g, " ")}</option>`).join("")}</select></label><label>LOCAL RECORD<select class="aegis-input" name="rootId">${this.options(this.state.rootType)}</select></label><button type="submit"${this.state.busy ? " disabled" : ""}>${this.state.busy ? "BUILDING…" : "BUILD CONTEXT"}</button></form>
                <p>Deterministic local relationships, FTS terminology and explicit user decisions only. Building refreshes the bounded local concept index; no provider, LLM or Context Package is invoked or persisted automatically.</p>
                ${this.state.error ? `<div class="stud-document-error">${this.escape(this.state.error)}</div>` : ""}
            </div></article>
            ${context ? this.renderContext(context) : this.renderEmpty()}
        </section>`;
    }

    renderEmpty() { return `<article class="workspace-panel stud-empty-state"><header><h2>KNOWLEDGE / CONTEXT</h2><span>IDLE</span></header><div class="workspace-panel-content"><strong>SELECT A CANONICAL LOCAL ROOT</strong><p>Build a bounded academic context to inspect material, local concepts, support gaps and provenance explanations. It does not infer academic truth.</p></div></article>`; }

    renderContext(context) {
        const badge = value => `<span class="stud-knowledge-badge ${String(value || "").toLowerCase()}">${this.escape(String(value || "UNKNOWN").replace(/_/g, " "))}</span>`;
        const candidate = item => `<article class="stud-knowledge-candidate"><header><strong>${this.escape(item.title)}</strong>${badge(item.relationStatus)}</header><small>${this.escape(item.entityType.replace(/_/g, " "))}</small><ul>${item.reasons.map(reason => `<li>${this.escape(reason)}</li>`).join("")}</ul>${item.conflicts.length ? `<p class="stud-knowledge-conflict">CONFLICTING LOCAL OBSERVATIONS: ${this.escape(item.conflicts.map(conflict => conflict.field).join(", "))}</p>` : ""}<footer>${item.decision ? `<span>USER: ${this.escape(item.decision)}</span>` : ""}<button type="button" data-stud-knowledge-decision="PIN" data-stud-knowledge-candidate-type="${item.entityType}" data-stud-knowledge-candidate-id="${item.entityId}">PIN</button><button type="button" data-stud-knowledge-decision="INCLUDE" data-stud-knowledge-candidate-type="${item.entityType}" data-stud-knowledge-candidate-id="${item.entityId}">INCLUDE</button><button type="button" data-stud-knowledge-decision="EXCLUDE" data-stud-knowledge-candidate-type="${item.entityType}" data-stud-knowledge-candidate-id="${item.entityId}">EXCLUDE</button></footer></article>`;
        const graphNode = node => `<button type="button" data-stud-search-result="${this.escape(node.entityId)}" data-stud-search-type="${this.escape(node.entityType)}"><strong>${this.escape(node.label)}</strong><small>${this.escape(node.entityType.replace(/_/g, " "))}</small></button>`;
        const coverage = context.coverage || {};
        return `<div class="stud-knowledge-results">
            <article class="workspace-panel stud-knowledge-summary"><header><h2>${this.escape(context.root.title || context.root.prompt || "ACADEMIC CONTEXT")}</h2>${badge(context.status)}</header><div class="workspace-panel-content"><p>Selected root: ${this.escape(context.rootType.replace(/_/g, " "))}. ${context.omitted.length ? `${context.omitted.length} bounded items omitted; inspect package limits before reuse.` : "All displayed context is bounded and inspectable."}</p><div class="stud-detail-actions"><button type="button" data-stud-knowledge-package>BUILD CONTEXT PACKAGE</button></div></div></article>
            <article class="workspace-panel stud-knowledge-candidates"><header><h2>RELEVANT LOCAL MATERIAL</h2><span>${context.candidates.length}</span></header><div class="workspace-panel-content"><div>${context.candidates.map(candidate).join("") || "<p>NO LOCAL MATERIAL COULD BE DETERMINISTICALLY RELATED.</p>"}</div>${context.excludedCandidates?.length ? `<section class="stud-knowledge-excluded"><h3>EXCLUDED BY USER · NOT IN CONTEXT PACKAGE</h3>${context.excludedCandidates.map(candidate).join("")}</section>` : ""}</div></article>
            <article class="workspace-panel stud-knowledge-concepts"><header><h2>LOCAL CONCEPTS</h2><span>${context.concepts.length}</span></header><div class="workspace-panel-content"><div class="stud-knowledge-concept-list">${context.concepts.map(item => `<article><strong>${this.escape(item.term)}</strong><small>${item.observationCount} OBSERVATIONS · ${this.escape(item.provenance.entityType)}${item.provenance.pageStart ? ` · PAGE ${item.provenance.pageStart}` : ""}</small></article>`).join("") || "<p>NO EXTRACTABLE LOCAL CONCEPTS.</p>"}</div></div></article>
            <article class="workspace-panel stud-knowledge-coverage"><header><h2>ASSIGNMENT COVERAGE</h2>${badge(coverage.status || "UNRESOLVED")}</header><div class="workspace-panel-content"><p>${this.escape(coverage.message || "Coverage applies only to Assignment contexts.")}</p>${coverage.concepts?.length ? `<div class="stud-knowledge-concept-list">${coverage.concepts.map(item => `<article><strong>${this.escape(item.term)}</strong>${badge(item.coverage)}<small>${this.escape(item.reasons.join("; "))}</small></article>`).join("")}</div>` : ""}${coverage.sourceSupport?.length ? `<section><h3>NOTE SUPPORT</h3>${coverage.sourceSupport.map(item => `<p><strong>${this.escape(item.title)}</strong> ${badge(item.status)} ${item.meaning ? this.escape(item.meaning) : ""}</p>`).join("")}</section>` : ""}</div></article>
            <article class="workspace-panel stud-knowledge-graph"><header><h2>BOUNDED KNOWLEDGE GRAPH</h2><span>${context.graph.nodes.length} NODES · ${context.graph.edges.length} EDGES</span></header><div class="workspace-panel-content"><div class="stud-knowledge-graph-nodes">${context.graph.nodes.map(graphNode).join("")}</div><div class="stud-knowledge-edges">${context.graph.edges.map(edge => `<span>${this.escape(edge.status)} · ${this.escape(edge.type.replace(/_/g, " "))}</span>`).join("") || "NO RELATIONSHIP EDGES IN BOUNDED VIEW."}</div>${context.graph.truncated ? "<p>GRAPH BOUNDED: filter or select a narrower context to inspect more safely.</p>" : ""}</div></article>
            <article class="workspace-panel stud-knowledge-search"><header><h2>CONTEXT SEARCH</h2><span>LOCAL FTS5</span></header><div class="workspace-panel-content"><form data-stud-knowledge-search-form><label>SEARCH THIS CONTEXT<input class="aegis-input" name="query" maxlength="240" value="${this.escape(this.state.searchQuery)}"></label><button type="submit">SEARCH</button></form>${this.state.searchResults.length ? `<div class="stud-global-results"><section>${this.state.searchResults.map(item => `<button type="button" data-stud-search-result="${this.escape(item.entityId)}" data-stud-search-type="${this.escape(item.entityType)}"><strong>${this.escape(item.title)}</strong><span>${this.escape(item.relationshipToContext)} · ${this.escape(item.relevanceReason.join("; "))}</span></button>`).join("")}</section></div>` : ""}</div></article>
            <article class="workspace-panel stud-knowledge-packages"><header><h2>CONTEXT PACKAGES</h2><span>EXPLICIT SNAPSHOTS</span></header><div class="workspace-panel-content">${this.state.packages.length ? this.state.packages.map(item => `<p><strong>${this.escape(item.title)}</strong> ${badge(item.status)} · ${this.escape(item.created_at || item.createdAt)}</p>`).join("") : "<p>NO PACKAGE PERSISTED. Building context alone writes no package.</p>"}<p>Packages are inspectable, bounded and never invoke a model or provider.</p></div></article>
        </div>`;
    }

    async handleClick(event) {
        const decision = event.target.closest("[data-stud-knowledge-decision]");
        const packageButton = event.target.closest("[data-stud-knowledge-package]");
        if (!decision && !packageButton) return false;
        try {
            if (decision) {
                await this.request("stud-academic-context-decide", {rootType: this.state.rootType, rootId: this.state.rootId, candidateType: decision.dataset.studKnowledgeCandidateType, candidateId: decision.dataset.studKnowledgeCandidateId, decision: decision.dataset.studKnowledgeDecision, reason: null});
                await this.build(); this.showToast(this.parent.view, `CONTEXT ITEM ${decision.dataset.studKnowledgeDecision}`);
            } else if (packageButton) {
                const saved = await this.request("stud-academic-context-package-create", {rootType: this.state.rootType, rootId: this.state.rootId, options: {}});
                this.state.packages = await this.request("stud-academic-context-package-list", {rootType: this.state.rootType, rootId: this.state.rootId, limit: 12});
                this.parent.render(); this.showToast(this.parent.view, `CONTEXT PACKAGE ${saved.status}`);
            }
        } catch (error) { this.state.error = error.message || "ACADEMIC CONTEXT OPERATION FAILED"; this.parent.render(); }
        return true;
    }

    async handleSubmit(event) {
        const build = event.target.closest("[data-stud-knowledge-build-form]");
        const search = event.target.closest("[data-stud-knowledge-search-form]");
        if (!build && !search) return false;
        event.preventDefault();
        try {
            const data = new FormData(event.target);
            if (build) { this.state.rootType = data.get("rootType"); this.state.rootId = data.get("rootId"); this.state.context = null; this.state.searchResults = []; await this.build(); }
            else { this.state.searchQuery = String(data.get("query") || "").trim(); this.state.searchResults = this.state.searchQuery ? await this.request("stud-academic-context-search", {rootType: this.state.rootType, rootId: this.state.rootId, query: this.state.searchQuery, options: {scope: "CONTEXT", limit: 30}}) : []; this.parent.render(); }
        } catch (error) { this.state.error = error.message || "ACADEMIC CONTEXT FAILED"; this.parent.render(); }
        return true;
    }

    async handleChange(event) {
        const select = event.target.closest("[data-stud-knowledge-build-form] select[name='rootType']");
        if (!select) return false;
        this.state.rootType = select.value; this.state.rootId = ""; await this.refreshChoices(); this.parent.render(); return true;
    }
}

module.exports = {StudKnowledgeWorkspace, ROOT_TYPES};
