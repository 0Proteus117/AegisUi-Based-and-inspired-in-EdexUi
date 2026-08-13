"use strict";

const AI_ROOT_TYPES = Object.freeze(["ASSIGNMENT", "COURSE", "RESEARCH_PAPER", "ACADEMIC_DOCUMENT", "NOTE", "REVISION_ITEM"]);
const AI_MODES = Object.freeze(["ASK", "EXPLAIN", "SUMMARIZE", "COMPARE", "REQUIREMENTS", "STUDY"]);

class StudAcademicAssistantWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {choices: {}, rootType: "ASSIGNMENT", rootId: "", packages: [], package: null, engine: null, mode: "ASK", question: "", response: null, candidates: [], busy: false, requestId: null, error: null};
    }

    async initialize() { await this.refreshChoices(); }

    async refreshChoices() {
        const get = entityType => this.request("stud-entity-list", {entityType, limit: 200});
        const [assignments, courses, papers, documents, notes, revisions] = await Promise.all([get("ASSIGNMENT"), get("COURSE"), get("RESEARCH_PAPER"), get("ACADEMIC_DOCUMENT"), get("NOTE"), get("REVISION_ITEM")]);
        this.state.choices = {ASSIGNMENT: assignments, COURSE: courses, RESEARCH_PAPER: papers, ACADEMIC_DOCUMENT: documents, NOTE: notes, REVISION_ITEM: revisions};
        if (!(this.state.choices[this.state.rootType] || []).some(item => item.id === this.state.rootId)) this.state.rootId = (this.state.choices[this.state.rootType] || [])[0]?.id || "";
        await this.loadPackages();
    }

    async loadPackages() {
        this.state.packages = this.state.rootId ? await this.request("stud-academic-context-package-list", {rootType: this.state.rootType, rootId: this.state.rootId, limit: 30}) : [];
        if (!this.state.packages.some(item => this.state.package && item.id === this.state.package.id)) this.state.package = null;
    }

    async selectPackage(packageId) {
        this.cancelQuietly();
        this.state.package = await this.request("stud-academic-context-package-read", {packageId});
        this.state.response = null; this.state.candidates = []; this.state.error = null;
    }

    async checkEngine() {
        this.state.busy = true; this.state.error = null;
        try { this.state.engine = await this.request("stud-academic-ai-status"); }
        catch (error) { this.state.error = error.message || "LOCAL MODEL STATUS FAILED"; }
        finally { this.state.busy = false; this.parent.render(); }
    }

    requestId() { return `stud_ai_request_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }

    async generate(value) {
        if (!this.state.package) throw new Error("Select an inspected Context Package before asking the local model.");
        this.cancelQuietly();
        this.state.busy = true; this.state.error = null; this.state.response = null; this.state.candidates = [];
        const requestId = this.requestId(); this.state.requestId = requestId;
        this.parent.render();
        try {
            const response = await this.request("stud-academic-ai-generate", {packageId: this.state.package.id, question: value.question, mode: value.mode, requestId});
            if (this.state.requestId !== requestId) return;
            this.state.response = response; this.state.question = value.question; this.state.mode = value.mode;
            if (response.responseId) this.state.candidates = await this.request("stud-academic-ai-revision-candidates", {responseId: response.responseId});
        } catch (error) { if (this.state.requestId === requestId) this.state.error = error.message || "LOCAL ACADEMIC RESPONSE FAILED"; }
        finally { if (this.state.requestId === requestId) { this.state.busy = false; this.state.requestId = null; this.parent.render(); } }
    }

    cancelQuietly() {
        const requestId = this.state.requestId;
        if (requestId) this.request("stud-academic-ai-cancel", {requestId}).catch(() => {});
        this.state.requestId = null; this.state.busy = false;
    }

    packageSummary() {
        const pkg = this.state.package;
        if (!pkg) return `<div class="stud-empty-inline">SELECT A CONTEXT ROOT, THEN SELECT AN EXISTING REVIEWABLE PACKAGE. PACKAGE CREATION REMAINS EXPLICIT IN KNOWLEDGE.</div>`;
        const snapshot = pkg.snapshot || {};
        return `<div class="stud-ai-package-summary"><article><small>ROOT</small><strong>${this.escape(snapshot.root?.entityType || pkg.rootType)} · ${this.escape(snapshot.root?.entityId || pkg.rootId)}</strong></article><article><small>SELECTED SOURCES</small><strong>${Array.isArray(snapshot.chunks) ? snapshot.chunks.length : 0} CHUNKS · ${Array.isArray(snapshot.fragments) ? snapshot.fragments.length : 0} LOCAL FRAGMENTS</strong></article><article><small>BOUNDARY</small><strong>PACKAGE ONLY · NO DATABASE SWEEP</strong></article><article><small>STATUS</small><strong>${this.escape(pkg.status)}</strong></article></div>${pkg.omitted?.length ? `<p class="stud-ai-limit">CONTEXT LIMIT: ${pkg.omitted.length} ITEM(S) OMITTED. THE MODEL WILL RECEIVE THIS LIMITATION.</p>` : ""}`;
    }

    renderResponse() {
        const response = this.state.response;
        if (!response) return `<div class="stud-empty-inline">A LOCAL RESPONSE STAYS EPHEMERAL UNTIL YOU EXPLICITLY SAVE A NOTE OR ACCEPT A REVISION CANDIDATE.</div>`;
        if (!response.responseId) return `<div class="stud-ai-response-status"><strong>${this.escape(response.status)}</strong><p>${this.escape(response.answer || response.error || "No local response is available.")}</p></div>`;
        const trace = response.sourceTrace || [];
        return `<div class="stud-ai-response-status"><strong>${this.escape(response.status)} · ${this.escape(response.model || "LOCAL MODEL")}</strong><small>GENERATED ${this.escape(response.generatedAt || "")}</small></div><section class="stud-ai-answer"><header><h3>GROUNDED RESPONSE</h3><span>EPHEMERAL</span></header><pre>${this.escape(response.answer)}</pre></section><section class="stud-ai-claims"><header><h3>CLAIM TRACE</h3><span>${response.claims?.length || 0} MAPPED</span></header>${response.claims?.length ? response.claims.map(claim => `<article><strong>${this.escape(claim.text)}</strong><small>${claim.sourceRefs?.length ? claim.sourceRefs.map(this.escape).join(" · ") : "NO ACCEPTED SOURCE MAPPING"}</small></article>`).join("") : `<p>NO MODEL-CLAIM SOURCE MAPPING WAS ACCEPTED. REVIEW THE PROVIDED SOURCE TRACE BEFORE RELYING ON THIS RESPONSE.</p>`}</section><section class="stud-ai-trace"><header><h3>SOURCE TRACE</h3><span>CANONICAL PACKAGE REFERENCES</span></header>${trace.map(source => `<button type="button" data-stud-ai-open-source="${this.escape(source.entityType)}:${this.escape(source.entityId)}"><strong>${this.escape(source.id)} · ${this.escape(source.title)}</strong><small>${this.escape(source.entityType)}${source.pageStart ? ` · PAGE ${source.pageStart}` : ""} · ${this.escape(source.kind)}</small></button>`).join("") || `<p>NO SOURCE TRACE.</p>`}</section>${response.limitations?.length ? `<section class="stud-ai-limitations"><header><h3>LIMITS / UNCERTAINTY</h3><span>REVIEW REQUIRED</span></header><ul>${response.limitations.map(item => `<li>${this.escape(item)}</li>`).join("")}</ul></section>` : ""}<div class="stud-detail-actions"><button type="button" data-stud-ai-copy="${this.escape(response.responseId)}">COPY RESPONSE</button><button type="button" data-stud-ai-toggle-save="${this.escape(response.responseId)}">SAVE AS NOTE</button></div>${this.state.saveResponseId === response.responseId ? `<form class="stud-ai-save-form" data-stud-ai-form="SAVE_NOTE"><input type="hidden" name="responseId" value="${this.escape(response.responseId)}"><label>NOTE TITLE<input class="aegis-input" name="title" maxlength="240" value="${this.escape(`Local AI · ${this.state.package?.title || "Academic context"}`)}"></label><button type="submit">SAVE EXPLICITLY</button></form>` : ""}${this.renderCandidates(response)}`;
    }

    renderCandidates(response) {
        const items = this.state.candidates || [];
        return `<section class="stud-ai-candidates"><header><h3>REVISION CANDIDATES</h3><span>REQUIRES ACCEPTANCE</span></header>${items.length ? items.map((item, index) => `<article><strong>${this.escape(item.title)}</strong><small>${this.escape(item.prompt)}</small><button type="button" data-stud-ai-accept-candidate="${this.escape(response.responseId)}:${index}">ACCEPT AS REVISION ITEM</button></article>`).join("") : `<p>NO CANDIDATE WAS CREATED OR PERSISTED AUTOMATICALLY.</p>`}</section>`;
    }

    render() {
        const options = type => (this.state.choices[type] || []).map(item => `<option value="${this.escape(item.id)}"${this.state.rootId === item.id ? " selected" : ""}>${this.escape(item.title || item.prompt || item.id)}</option>`).join("");
        const packageOptions = this.state.packages.map(item => `<option value="${this.escape(item.id)}"${this.state.package?.id === item.id ? " selected" : ""}>${this.escape(item.title)} · ${this.escape(item.status)}</option>`).join("");
        const engine = this.state.engine ? `${this.state.engine.status} · ${this.state.engine.model}` : "NOT CHECKED · EXPLICIT LOCAL CHECK ONLY";
        return `<section class="stud-ai-shell"><article class="workspace-panel"><header><h2>ACADEMIC AI / LOCAL RAG</h2><span>CONTEXT PACKAGE ONLY</span></header><div class="workspace-panel-content stud-ai-intro"><p>Grounded local assistance consumes a reviewed academic Context Package. It has no tools, no cloud fallback and no automatic save.</p><div class="stud-ai-engine"><strong>LOCAL ENGINE · ${this.escape(engine)}</strong><button type="button" data-stud-ai-check-engine>CHECK LOCAL ENGINE</button></div></div></article><article class="workspace-panel"><header><h2>SELECT REVIEWED CONTEXT</h2><span>EXPLICIT / INSPECTABLE</span></header><div class="workspace-panel-content"><form class="stud-ai-context-form" data-stud-ai-form="ROOT"><label>CONTEXT ROOT TYPE<select class="aegis-select" name="rootType">${AI_ROOT_TYPES.map(type => `<option${type === this.state.rootType ? " selected" : ""}>${type}</option>`).join("")}</select></label><label>LOCAL ROOT<select class="aegis-select" name="rootId">${options(this.state.rootType)}</select></label><button type="submit">LOAD PACKAGES</button></form><form class="stud-ai-context-form" data-stud-ai-form="PACKAGE"><label>REVIEWED PACKAGE<select class="aegis-select" name="packageId"><option value="">SELECT PACKAGE</option>${packageOptions}</select></label><button type="submit">INSPECT PACKAGE</button></form>${this.packageSummary()}</div></article><article class="workspace-panel"><header><h2>ASK LOCAL ACADEMIC ASSISTANT</h2><span>${this.state.busy ? "GENERATING / CANCELLABLE" : "NO TOOLS"}</span></header><div class="workspace-panel-content">${this.state.error ? `<p class="stud-ai-error" role="status">${this.escape(this.state.error)}</p>` : ""}<form class="stud-ai-query-form" data-stud-ai-form="GENERATE"><label>MODE<select class="aegis-select" name="mode">${AI_MODES.map(mode => `<option${mode === this.state.mode ? " selected" : ""}>${mode}</option>`).join("")}</select></label><label>QUESTION<textarea class="aegis-input" name="question" required maxlength="3000" placeholder="Ask about the selected local context only.">${this.escape(this.state.question)}</textarea></label><button type="submit"${this.state.busy ? " disabled" : ""}>${this.state.busy ? "GENERATING" : "GENERATE LOCAL RESPONSE"}</button>${this.state.busy ? `<button type="button" data-stud-ai-cancel>STOP</button>` : ""}</form></div></article><article class="workspace-panel"><header><h2>RESPONSE / PROVENANCE</h2><span>HUMAN REVIEW REQUIRED</span></header><div class="workspace-panel-content">${this.renderResponse()}</div></article><article class="workspace-panel"><header><h2>LOCAL AI POLICY</h2><span>FAIL CLOSED</span></header><div class="workspace-panel-content"><p>No model download, web access, filesystem access, Moodle, Calendar, Email, provider action, shell, map control or hidden persistence is available through this surface. Package creation, model use and every save action remain explicit.</p></div></article></section>`;
    }

    async handleClick(event) {
        const check = event.target.closest("[data-stud-ai-check-engine]");
        const cancel = event.target.closest("[data-stud-ai-cancel]");
        const copy = event.target.closest("[data-stud-ai-copy]");
        const save = event.target.closest("[data-stud-ai-toggle-save]");
        const accept = event.target.closest("[data-stud-ai-accept-candidate]");
        const source = event.target.closest("[data-stud-ai-open-source]");
        if (check) { await this.checkEngine(); return true; }
        if (cancel) { this.cancelQuietly(); this.parent.render(); return true; }
        if (copy) { try { await navigator.clipboard.writeText(this.state.response?.answer || ""); this.showToast(this.parent.view, "RESPONSE COPIED · NO PERSISTENCE"); } catch (_error) { this.showToast(this.parent.view, "COPY UNAVAILABLE"); } return true; }
        if (save) { this.state.saveResponseId = save.dataset.studAiToggleSave; this.parent.render(); return true; }
        if (accept) { const [responseId, candidateIndex] = accept.dataset.studAiAcceptCandidate.split(":"); try { await this.request("stud-academic-ai-revision-accept", {responseId, candidateIndex: Number(candidateIndex)}); this.showToast(this.parent.view, "REVISION ITEM SAVED EXPLICITLY"); } catch (error) { this.showToast(this.parent.view, error.message || "REVISION SAVE FAILED"); } return true; }
        if (source) { const [type, id] = source.dataset.studAiOpenSource.split(":"); await this.parent.openSearchResult(type, id); return true; }
        return false;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-ai-form]");
        if (!form) return false;
        event.preventDefault(); const value = Object.fromEntries(new FormData(form).entries());
        try {
            if (form.dataset.studAiForm === "ROOT") { this.cancelQuietly(); this.state.rootType = value.rootType; this.state.rootId = value.rootId; await this.loadPackages(); this.state.package = null; this.state.response = null; this.parent.render(); }
            else if (form.dataset.studAiForm === "PACKAGE") { if (value.packageId) { await this.selectPackage(value.packageId); this.parent.render(); } }
            else if (form.dataset.studAiForm === "GENERATE") await this.generate(value);
            else if (form.dataset.studAiForm === "SAVE_NOTE") { const saved = await this.request("stud-academic-ai-save-note", value); this.state.saveResponseId = null; this.showToast(this.parent.view, `NOTE SAVED EXPLICITLY · ${saved.note.id}`); this.parent.refresh().catch(() => {}); this.parent.render(); }
        } catch (error) { this.state.error = error.message || "ACADEMIC AI OPERATION FAILED"; this.parent.render(); }
        return true;
    }

    handleChange() { return Promise.resolve(); }
}

if (typeof window !== "undefined") window.StudAcademicAssistantWorkspace = StudAcademicAssistantWorkspace;
if (typeof module !== "undefined" && module.exports) module.exports = {StudAcademicAssistantWorkspace, AI_ROOT_TYPES, AI_MODES};
