"use strict";

class StudRequirementsContractWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {assignment: null, contractState: null, selectedSource: null, approvalMode: null, busy: false};
    }

    setState(assignment, contractState) {
        this.state.assignment = assignment || null;
        this.state.contractState = contractState || null;
        const active = contractState && (contractState.draft || contractState.current);
        if (!active || !this.state.selectedSource || ![...active.items, ...active.candidates].some(item => (item.sources || []).some(source => source.id === this.state.selectedSource.id))) {
            this.state.selectedSource = active && [...active.items, ...active.candidates].flatMap(item => item.sources || [])[0] || null;
        }
        this.state.approvalMode = null;
    }

    activeContract() {
        const state = this.state.contractState;
        return state && (state.draft || state.current) || null;
    }

    statusLabel(contract) {
        if (!contract) return "NOT CREATED";
        return `REV ${contract.revision} · ${contract.lifecycle} · ${contract.completeness}`;
    }

    sourceButton(source, compact = false) {
        if (!source) return "";
        return `<button type="button" class="stud-requirement-source-link" data-stud-requirement-source="${this.escape(source.id)}">${compact ? "VIEW SOURCE" : this.escape(source.presentationLabel || source.sourceKind.replace(/_/g, " "))}</button>`;
    }

    renderSourcePreview(contract) {
        const source = this.state.selectedSource || [...contract.items, ...contract.candidates].flatMap(item => item.sources || [])[0];
        if (!source) return `<aside class="stud-requirements-source-preview"><div class="stud-requirements-preview-empty"><small>SOURCE PREVIEW</small><strong>NO EVIDENCE SELECTED</strong><p>Manual requirements can remain explicitly user-authored. Generated candidates expose their exact canonical source here.</p></div></aside>`;
        const page = source.pageStart ? `PAGE ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ""}` : "CANONICAL OBSERVATION";
        const changed = contract.freshness && (contract.freshness.details || []).find(item => item.sourceId === source.id);
        return `<aside class="stud-requirements-source-preview" aria-live="polite">
            <header><small>SOURCE PREVIEW</small><span>${this.escape(page)}</span></header>
            <h4>${this.escape(source.presentationLabel || source.sourceKind.replace(/_/g, " "))}</h4>
            ${changed ? `<p class="stud-requirements-source-condition"><strong>${this.escape(changed.condition.replace(/_/g, " "))}</strong>${this.escape(changed.reason)}</p>` : ""}
            <blockquote>${this.escape(source.excerpt || "The canonical source is recorded but has no bounded display excerpt.")}</blockquote>
            <dl><div><dt>PROVENANCE</dt><dd>${this.escape(source.sourceKind.replace(/_/g, " "))}</dd></div>${source.documentId ? `<div><dt>DOCUMENT</dt><dd>${this.escape(source.documentId)}</dd></div>` : ""}${source.extractionId ? `<div><dt>EXTRACTION</dt><dd>${this.escape(source.extractionId)}</dd></div>` : ""}${source.chunkId ? `<div><dt>CHUNK</dt><dd>${this.escape(source.chunkId)}</dd></div>` : ""}${source.contentHash ? `<div><dt>CONTENT HASH</dt><dd>${this.escape(source.contentHash)}</dd></div>` : ""}</dl>
        </aside>`;
    }

    renderCandidate(candidate, contract) {
        const selected = this.state.selectedSource && (candidate.sources || []).some(source => source.id === this.state.selectedSource.id);
        return `<article class="stud-requirement-row is-${candidate.disposition.toLowerCase()}${selected ? " is-selected" : ""}">
            <button type="button" class="stud-requirement-row-main" data-stud-requirement-source="${this.escape(candidate.sources[0] && candidate.sources[0].id || "")}"${candidate.sources.length ? "" : " disabled"}>
                <span class="stud-requirement-mark">${candidate.disposition === "INCLUDED" ? "✓" : candidate.disposition === "EXCLUDED" ? "×" : candidate.disposition === "UNRESOLVED" ? "?" : "·"}</span>
                <span><strong>${this.escape(candidate.label)}</strong><small>${this.escape(candidate.displayValue || candidate.originalValue || "VALUE UNKNOWN")}</small></span>
            </button>
            <div class="stud-requirement-review-actions" aria-label="Review candidate">
                <button type="button" data-stud-requirement-candidate="${this.escape(candidate.id)}" data-stud-requirement-disposition="INCLUDED" data-stud-contract-version="${contract.rowVersion}" aria-label="Include ${this.escape(candidate.label)}">INCLUDE</button>
                <button type="button" data-stud-requirement-candidate="${this.escape(candidate.id)}" data-stud-requirement-disposition="UNRESOLVED" data-stud-contract-version="${contract.rowVersion}" aria-label="Mark ${this.escape(candidate.label)} unresolved">UNRESOLVED</button>
                <button type="button" data-stud-requirement-candidate="${this.escape(candidate.id)}" data-stud-requirement-disposition="EXCLUDED" data-stud-contract-version="${contract.rowVersion}" aria-label="Exclude ${this.escape(candidate.label)}">EXCLUDE</button>
            </div>
        </article>`;
    }

    renderItem(item, contract) {
        const symbol = item.resolutionState === "RESOLVED" ? "✓" : item.resolutionState === "CONFLICTING" ? "⚠" : "?";
        const selected = this.state.selectedSource && (item.sources || []).some(source => source.id === this.state.selectedSource.id);
        return `<article class="stud-requirement-row is-item${selected ? " is-selected" : ""}">
            <button type="button" class="stud-requirement-row-main" data-stud-requirement-source="${this.escape(item.sources[0] && item.sources[0].id || "")}"${item.sources.length ? "" : " disabled"}>
                <span class="stud-requirement-mark">${symbol}</span><span><strong>${this.escape(item.label)}</strong><small>${this.escape(item.displayValue || item.originalValue || "VALUE UNKNOWN")} · ${this.escape(item.type.replace(/_/g, " "))}</small></span>
            </button>
            ${contract.lifecycle === "DRAFT" ? `<details class="stud-requirement-edit"><summary>EDIT</summary><form data-stud-requirements-form="UPDATE_ITEM" data-contract-id="${this.escape(contract.id)}" data-item-id="${this.escape(item.id)}" data-contract-version="${contract.rowVersion}"><label>LABEL<input name="label" required maxlength="240" value="${this.escape(item.label)}"></label><label>TYPE<select name="type">${["DELIVERABLE","DEADLINE","LENGTH","FORMAT","CITATION","STRUCTURE","LEARNING_OUTCOME","RUBRIC","EVIDENCE","ACADEMIC_INTEGRITY","GROUP_WORK","DEPENDENCY","OTHER"].map(type => `<option${type === item.type ? " selected" : ""}>${type}</option>`).join("")}</select></label><label>VALUE<textarea name="displayValue" maxlength="12000">${this.escape(item.displayValue || item.originalValue || "")}</textarea></label><label>RESOLUTION<select name="resolutionState">${["RESOLVED","UNRESOLVED","CONFLICTING"].map(value => `<option${value === item.resolutionState ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>NOTE<textarea name="userNote" maxlength="4000">${this.escape(item.userNote || "")}</textarea></label><div><button type="submit">SAVE</button><button type="button" data-stud-requirement-remove="${this.escape(item.id)}" data-stud-contract-version="${contract.rowVersion}">REMOVE</button></div></form></details>` : ""}
        </article>`;
    }

    renderApproval(contract) {
        const unresolved = contract.candidates.filter(item => ["PENDING", "UNRESOLVED"].includes(item.disposition)).length + contract.items.filter(item => item.resolutionState !== "RESOLVED").length;
        if (this.state.approvalMode === "INCOMPLETE") return `<section class="stud-requirements-approval-confirm" role="alert"><strong>${unresolved} UNRESOLVED REQUIREMENT${unresolved === 1 ? "" : "S"}</strong><p>They will remain visible and may block only later work that depends on them.</p><div><button type="button" data-stud-requirement-approval-back>BACK TO REVIEW</button><button type="button" data-stud-requirement-approve="INCOMPLETE" data-stud-contract-version="${contract.rowVersion}">APPROVE AS INCOMPLETE</button></div></section>`;
        const pending = contract.candidates.filter(item => item.disposition === "PENDING").length;
        return `<footer class="stud-requirements-review-footer"><span>${contract.items.length} REQUIREMENTS · ${unresolved} UNRESOLVED${pending ? ` · ${pending} PENDING REVIEW` : ""}</span><div>${contract.completeness === "COMPLETE" && !pending ? `<button type="button" data-stud-requirement-approve="COMPLETE" data-stud-contract-version="${contract.rowVersion}">APPROVE CONTRACT</button>` : `<button type="button" data-stud-requirement-approval-start${pending ? " disabled title=\"Review every generated candidate first\"" : ""}>REVIEW INCOMPLETE APPROVAL</button>`}</div></footer>`;
    }

    render() {
        const state = this.state.contractState;
        if (!state) return `<section class="stud-requirements-contract"><p>REQUIREMENTS CONTRACT UNAVAILABLE.</p></section>`;
        const contract = state.draft || state.current;
        if (!contract) return `<section class="stud-requirements-contract is-empty"><div><small>REQUIREMENTS CONTRACT</small><h3>Review what this Assignment actually requires</h3><p>Aegis can prepare bounded candidates from canonical Assignment metadata and linked indexed documents. Nothing is confirmed automatically.</p><button type="button" data-stud-requirements-create>REVIEW REQUIREMENTS</button></div></section>`;
        const coverage = contract.coverage;
        const excluded = contract.candidates.filter(item => item.disposition === "EXCLUDED");
        const queue = contract.candidates.filter(item => item.disposition !== "INCLUDED");
        const freshness = contract.freshness && contract.freshness.reviewCondition || "NEEDS_REVIEW";
        const approved = contract.lifecycle !== "DRAFT";
        return `<section class="stud-requirements-contract${approved ? " is-approved" : " is-review"}">
            <header class="stud-requirements-heading"><div><small>REQUIREMENTS CONTRACT</small><h3>${approved ? "Approved assignment requirements" : "Review assignment requirements"}</h3><p>${approved ? "This revision is immutable. Source changes are reported without rewriting its contents." : "Include, reject or leave uncertain what Aegis found. Add anything the source material did not expose."}</p></div><div><strong>${this.escape(this.statusLabel(contract))}</strong><span>${this.escape(freshness.replace(/_/g, " "))}</span></div></header>
            ${freshness !== "CURRENT" && approved ? `<div class="stud-requirements-freshness" role="status"><strong>${this.escape(freshness.replace(/_/g, " "))}</strong><span>The approved revision is preserved. Create a new revision to review current evidence.</span></div>` : ""}
            <div class="stud-requirements-workspace"><div class="stud-requirements-list">
                ${contract.items.length ? `<div class="stud-requirements-group"><h4>REQUIREMENTS <span>${contract.items.length}</span></h4>${contract.items.map(item => this.renderItem(item, contract)).join("")}</div>` : `<div class="stud-requirements-list-empty"><strong>NO CONFIRMED REQUIREMENTS YET</strong><p>Generated candidates remain suggestions until you include them.</p></div>`}
                ${!approved && queue.length ? `<div class="stud-requirements-group"><h4>REVIEW QUEUE <span>${queue.length}</span></h4>${queue.map(item => this.renderCandidate(item, contract)).join("")}</div>` : ""}
                ${!approved ? `<details class="stud-requirement-add"><summary>ADD MANUAL REQUIREMENT</summary><form data-stud-requirements-form="ADD_MANUAL" data-contract-id="${this.escape(contract.id)}" data-contract-version="${contract.rowVersion}"><label>LABEL<input name="label" required maxlength="240"></label><label>TYPE<select name="type">${["DELIVERABLE","DEADLINE","LENGTH","FORMAT","CITATION","STRUCTURE","LEARNING_OUTCOME","RUBRIC","EVIDENCE","ACADEMIC_INTEGRITY","GROUP_WORK","DEPENDENCY","OTHER"].map(type => `<option>${type}</option>`).join("")}</select></label><label>VALUE<textarea name="displayValue" maxlength="12000"></textarea></label><label>STATE<select name="resolutionState"><option>RESOLVED</option><option>UNRESOLVED</option><option>CONFLICTING</option></select></label><button type="submit">ADD TO DRAFT</button></form></details>` : ""}
                ${excluded.length ? `<details class="stud-requirements-excluded"><summary>${excluded.length} EXCLUDED CANDIDATE${excluded.length === 1 ? "" : "S"}</summary>${excluded.map(item => `<p><strong>${this.escape(item.label)}</strong><span>${this.escape(item.displayValue || item.originalValue || "")}</span></p>`).join("")}</details>` : ""}
            </div>${this.renderSourcePreview(contract)}</div>
            ${approved ? `<footer class="stud-requirements-approved-footer"><dl><div><dt>REVISION</dt><dd>${contract.revision}</dd></div><div><dt>APPROVED</dt><dd>${this.escape(contract.approvedAt || "UNKNOWN")}</dd></div><div><dt>COMPLETENESS</dt><dd>${this.escape(contract.completeness)}</dd></div><div><dt>UNRESOLVED</dt><dd>${contract.items.filter(item => item.resolutionState !== "RESOLVED").length}</dd></div><div><dt>FINGERPRINT</dt><dd>${this.escape(contract.contractHash || "UNAVAILABLE")}</dd></div></dl><button type="button" data-stud-requirement-new-revision data-stud-contract-version="${contract.rowVersion}">CREATE NEW REVISION</button></footer>` : this.renderApproval(contract)}
            ${coverage ? `<details class="stud-requirements-coverage"><summary>EXTRACTION COVERAGE</summary><p>${coverage.linkedDocuments} linked documents · ${coverage.inspectedDocuments} inspected · ${coverage.ocrRequiredDocuments} OCR required · ${coverage.chunksInspected} chunks inspected · ${coverage.candidatesGenerated} candidates${coverage.truncationReached ? " · BOUND REACHED" : ""}</p><small>No supported match means only that bounded inspected evidence produced no candidate.</small></details>` : ""}
        </section>`;
    }

    async refresh() {
        if (!this.state.assignment) return;
        const contractState = await this.request("stud-requirements-state", {assignmentId: this.state.assignment.id});
        this.setState(this.state.assignment, contractState);
        this.parent.state.assignmentContext.requirementsContract = contractState;
        this.parent.render();
    }

    async run(action, success) {
        if (this.state.busy) return;
        this.state.busy = true;
        try { await action(); await this.refresh(); this.showToast(this.parent.view, success); }
        catch (error) { this.showToast(this.parent.view, error.message || "REQUIREMENTS CONTRACT OPERATION FAILED"); }
        finally { this.state.busy = false; }
    }

    async handleClick(event) {
        const create = event.target.closest("[data-stud-requirements-create]");
        const review = event.target.closest("[data-stud-requirement-candidate]");
        const source = event.target.closest("[data-stud-requirement-source]");
        const remove = event.target.closest("[data-stud-requirement-remove]");
        const approvalStart = event.target.closest("[data-stud-requirement-approval-start]");
        const approvalBack = event.target.closest("[data-stud-requirement-approval-back]");
        const approve = event.target.closest("[data-stud-requirement-approve]");
        const revision = event.target.closest("[data-stud-requirement-new-revision]");
        if (!create && !review && !source && !remove && !approvalStart && !approvalBack && !approve && !revision) return false;
        if (create) await this.run(() => this.request("stud-requirements-create-draft", {assignmentId: this.state.assignment.id}), "REQUIREMENTS DRAFT CREATED");
        else if (review) await this.run(() => this.request("stud-requirements-review-candidate", {contractId: this.activeContract().id, candidateId: review.dataset.studRequirementCandidate, disposition: review.dataset.studRequirementDisposition, expectedVersion: Number(review.dataset.studContractVersion)}), "CANDIDATE REVIEW SAVED");
        else if (source && source.dataset.studRequirementSource) {
            try { const detail = await this.request("stud-requirements-source-preview", {sourceId: source.dataset.studRequirementSource}); this.state.selectedSource = detail.source; this.parent.render(); }
            catch (error) { this.showToast(this.parent.view, error.message || "SOURCE PREVIEW UNAVAILABLE"); }
        }
        else if (remove) await this.run(() => this.request("stud-requirements-remove-item", {contractId: this.activeContract().id, itemId: remove.dataset.studRequirementRemove, expectedVersion: Number(remove.dataset.studContractVersion)}), "REQUIREMENT REMOVED FROM DRAFT");
        else if (approvalStart) { this.state.approvalMode = "INCOMPLETE"; this.parent.render(); }
        else if (approvalBack) { this.state.approvalMode = null; this.parent.render(); }
        else if (approve) await this.run(() => this.request("stud-requirements-approve", {contractId: this.activeContract().id, expectedVersion: Number(approve.dataset.studContractVersion), approveAsIncomplete: approve.dataset.studRequirementApprove === "INCOMPLETE"}), approve.dataset.studRequirementApprove === "INCOMPLETE" ? "INCOMPLETE CONTRACT APPROVED HONESTLY" : "REQUIREMENTS CONTRACT APPROVED");
        else if (revision) await this.run(() => this.request("stud-requirements-create-revision", {contractId: this.activeContract().id, expectedVersion: Number(revision.dataset.studContractVersion)}), "NEW DRAFT REVISION CREATED");
        return true;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-requirements-form]");
        if (!form) return false;
        event.preventDefault();
        const value = Object.fromEntries(new FormData(form).entries());
        const request = {contractId: form.dataset.contractId, expectedVersion: Number(form.dataset.contractVersion), requirement: {type: value.type, label: value.label, displayValue: value.displayValue, normalizedValue: value.displayValue, resolutionState: value.resolutionState || "RESOLVED", userNote: value.userNote || null}};
        if (form.dataset.studRequirementsForm === "ADD_MANUAL") await this.run(() => this.request("stud-requirements-add-manual", request), "MANUAL REQUIREMENT ADDED");
        else await this.run(() => this.request("stud-requirements-update-item", {...request, itemId: form.dataset.itemId}), "REQUIREMENT UPDATED");
        return true;
    }
}

module.exports = {StudRequirementsContractWorkspace};
