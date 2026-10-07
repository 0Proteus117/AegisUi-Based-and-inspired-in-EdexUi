"use strict";

// Presentation only. M1/M10/M15 remain the authorities for approval, writing
// versions and export. Unsaved edits live in memory, never in localStorage.
class StudManualWorkbench {
    constructor(parent) {
        this.parent = parent;
        this.request = parent.request;
        this.escape = parent.escape;
        this.edits = new Map();
        this.generation = 0;
        this.reset();
    }
    reset() {
        this.generation++;
        this.noteDirty = false;
        this.state = {manual:false, loaded:false, busy:false, error:"", notice:"", data:null, requirements:null, draft:null, sectionId:null, panel:null};
    }
    assignmentId() { return this.parent.assignment()?.id; }
    plan() { return this.state.data?.current || this.state.data?.draft || null; }
    section() { return this.plan()?.sections.find(s => s.id === this.state.sectionId) || this.plan()?.sections[0] || null; }
    buffer() { return this.state.draft && this.edits.get(this.state.draft.id); }
    hasUnsaved() { return [...this.edits.values()].some(b => b.sections.size); }
    redraw() { this.parent.parent.render(); }
    button(label, action, value = "", disabled = false) {
        if (action === "save" && !this.buffer()?.sections.size) disabled = true;
        return `<button type="button" data-stud-workbench="${action}" data-value="${this.escape(value)}" ${disabled || this.state.busy ? "disabled" : ""}>${this.escape(label)}</button>`;
    }
    async load(draftId = null) {
        const id = this.assignmentId(), generation = ++this.generation;
        this.state.busy = true;
        this.state.error = "";
        try {
            // Refresh source freshness before reading composition conditions.
            const requirements = await this.request("stud-requirements-state", {assignmentId:id});
            if (id !== this.assignmentId() || generation !== this.generation) return;
            const data = await this.request("stud-composition-state", {assignmentId:id, draftLimit:25});
            if (id !== this.assignmentId() || generation !== this.generation) return;
            const plan = data.current || data.draft;
            const drafts = data.drafts.filter(d => d.compositionPlanId === plan?.id);
            const preferred = draftId || this.state.draft?.id || this.parent.state.workingContext?.activeDraftDocument?.id;
            const chosen = drafts.find(d => d.id === preferred) || drafts[0];
            const draft = chosen ? await this.request("stud-draft-read", {assignmentId:id, draftId:chosen.id, versionLimit:20}) : null;
            if (id !== this.assignmentId() || generation !== this.generation) return;
            const sectionId = plan?.sections.find(s => s.id === this.state.sectionId)?.id || plan?.sections[0]?.id || null;
            Object.assign(this.state, {data, requirements, draft, sectionId, loaded:true});
        } catch (error) {
            if (generation === this.generation) this.state.error = error.message || "The saved work could not be opened.";
        } finally {
            if (generation === this.generation) { this.state.busy = false; this.redraw(); }
        }
    }
    content() {
        const section = this.section();
        return this.buffer()?.sections.get(section?.id) ?? this.state.draft?.currentVersion?.sections.find(s => s.sectionId === section?.id)?.content ?? "";
    }
    input(event) {
        if (event.target.closest?.('.stud-human-workbench [data-stud-research-form="NOTE"]')) { this.noteDirty = true; return; }
        if (!event.target.matches("[data-stud-workbench-text]")) return;
        const draft = this.state.draft, section = this.section();
        if (!draft || !section || this.state.busy) return;
        let buffer = this.edits.get(draft.id);
        if (!buffer) {
            // Do not silently evict human writing to make room for another draft.
            if (this.edits.size >= 8) { event.target.value = this.content(); this.state.error = "Save or discard another edited draft before editing a ninth draft."; this.redraw(); return; }
            buffer = {assignmentId:this.assignmentId(), expectedVersion:draft.rowVersion, sections:new Map()};
            this.edits.set(draft.id, buffer);
        }
        const text = event.target.value.slice(0, 120000);
        const size = [...this.edits.values()].reduce((n, b) => n + [...b.sections.values()].reduce((sum, value) => sum + value.length, 0), 0) - (buffer.sections.get(section.id)?.length || 0) + text.length;
        if (size > 1000000) { event.target.value = this.content(); this.state.error = "Save an edited draft before adding more unsaved text (session limit reached)."; this.redraw(); return; }
        buffer.sections.set(section.id, text);
        const status = this.parent.parent.view?.querySelector("[data-workbench-save-state]");
        if (status) status.textContent = "Unsaved changes — Save before closing Aegis";
        const save = this.parent.parent.view?.querySelector('[data-stud-workbench="save"]');
        const exportButton = this.parent.parent.view?.querySelector('[data-stud-workbench="export"]');
        if (save) save.disabled = false;
        if (exportButton) exportButton.disabled = true;
    }
    guardNoteNavigation(event) {
        if (!this.noteDirty) return;
        const form = this.parent.parent.view?.querySelector('.stud-human-workbench [data-stud-research-form="NOTE"]');
        if (!form) return;
        if (event.target.closest('[data-workbench-discard-note]')) {
            event.preventDefault(); event.stopImmediatePropagation();
            this.noteDirty = false; this.redraw(); return;
        }
        if (form.contains(event.target) || !event.target.closest('button,a,summary')) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!form.querySelector('[data-workbench-note-warning]')) {
            const warning = form.ownerDocument.createElement('p');
            warning.dataset.workbenchNoteWarning = ''; warning.setAttribute('role','status');
            warning.textContent = 'Save this note before changing tools, or discard its unsaved changes. ';
            const discard = form.ownerDocument.createElement('button');
            discard.type = 'button'; discard.dataset.workbenchDiscardNote = ''; discard.textContent = 'Discard unsaved note changes';
            warning.append(discard); form.append(warning);
        }
        form.querySelector('[data-workbench-note-warning]').scrollIntoView({block:'nearest'});
    }
    async save() {
        const id = this.assignmentId(), draft = this.state.draft, buffer = this.buffer(), generation = this.generation;
        if (!draft || !buffer?.sections.size || this.state.busy) return;
        this.state.busy = true; this.state.error = ""; this.redraw();
        try {
            const version = await this.request("stud-draft-save-version", {
                assignmentId:id, draftId:draft.id, expectedVersion:buffer.expectedVersion,
                sections:[...buffer.sections].map(([sectionId, content]) => ({sectionId, content})),
                changeReason:"Manual writing saved from Assignment workbench."
            });
            this.edits.delete(draft.id);
            if (id !== this.assignmentId() || generation !== this.generation) return;
            this.state.notice = `Saved version ${version.versionNumber}. Previous versions are retained.`;
            await this.load(draft.id);
            await this.persistContext();
        } catch (error) {
            if (generation === this.generation) this.state.error = `${error.message || "Save failed."} Your unsaved text is still here. Copy it before discarding or reloading.`;
        } finally {
            if (generation === this.generation) { this.state.busy = false; this.redraw(); }
        }
    }
    async persistContext() {
        const id = this.assignmentId(), plan = this.plan(), section = this.section(), draft = this.state.draft, generation = this.generation;
        if (!plan || !section) return;
        const active = this.parent.activeObject?.();
        const value = await this.request("stud-working-context-update", {
            assignmentId:id, courseId:this.parent.course()?.id || undefined,
            objectType:active?.entityType, objectId:active?.id,
            compositionPlanId:plan.id, compositionSectionId:section.id,
            draftDocumentId:draft?.id, draftVersionId:draft?.currentVersion?.id,
            originSurface:"COMPOSITION_WORKSPACE", userPinned:this.parent.state.workingContext?.userPinned === true
        });
        if (id === this.assignmentId() && generation === this.generation) {
            this.parent.state.workingContext = value;
            this.parent.parent.state.workingContext = value;
        }
    }
    renderSetup() {
        const e = this.escape, plan = this.plan();
        if (!this.state.requirements?.current && !plan) return `<h3>First, check what you need to deliver</h3><p>No requirements have been approved for this assignment. You can read its material and take notes now. Review the requirements before creating a saved draft; incomplete approval remains available.</p><button type="button" data-stud-workspace-mode="REQUIREMENTS">Review requirements</button>`;
        if (!plan) return `<h3>Prepare your writing outline</h3><p>Start with proposed headings from the reviewed requirements, or add your own. Nothing is approved automatically.</p>${this.button("Prepare outline", "prepare")}`;
        if (plan.lifecycle === "REVIEWED") return `<h3>Your outline is ready</h3><ol>${plan.sections.map(s => `<li>${e(s.title)}</li>`).join("")}</ol><p>Create a draft using this reviewed outline. This does not mark the assignment complete.</p>${this.button("Create my draft", "create-draft")}`;
        return `<h3>Check your outline</h3><p>These are headings, not generated academic writing. Add the sections you intend to write, then confirm the outline.</p><ol>${plan.sections.map(s => `<li><strong>${e(s.title)}</strong><p>${e(s.purpose)}</p></li>`).join("")}</ol><form data-workbench-section><label>Heading<input name="title" maxlength="240" required></label><label>What will this section cover?<textarea name="purpose" maxlength="12000" rows="2" required></textarea></label><button type="submit" ${this.state.busy ? "disabled" : ""}>Add heading</button></form>${this.button("I have reviewed this outline", "review-outline", "", !plan.sections.length)}<details><summary>Structure and requirement details</summary><button type="button" data-stud-workspace-mode="COMPOSITION">Edit outline, word budget and requirement links</button></details>`;
    }
    renderWriter() {
        const e = this.escape, plan = this.plan(), draft = this.state.draft, section = this.section();
        if (!draft || !section || plan?.lifecycle !== "REVIEWED") return this.renderSetup();
        const drafts = this.state.data.drafts.filter(d => d.compositionPlanId === plan.id);
        return `<div class="stud-workbench-writing"><label>Section<select data-workbench-section-select ${this.state.busy ? "disabled" : ""}>${plan.sections.map(s => `<option value="${e(s.id)}" ${s.id === section.id ? "selected" : ""}>${e(s.title)}</option>`).join("")}</select></label><h3>${e(section.title)}</h3><p>${e(section.purpose)}</p><label class="stud-workbench-paper">Your writing<textarea data-stud-workbench-text maxlength="120000" rows="20" ${this.state.busy ? "disabled" : ""}>${e(this.content())}</textarea></label><footer><span data-workbench-save-state>${this.buffer()?.sections.size ? "Unsaved changes — Save before closing Aegis" : draft.currentVersion ? `Saved version ${draft.currentVersion.versionNumber}` : "No text saved yet"}</span>${this.button("Save version", "save")}</footer><details><summary>Saved versions and other drafts</summary><p>Showing up to 25 drafts and 20 versions. Earlier history remains stored. Full composition tools are available below.</p>${drafts.map(d => this.button(d.title, "draft", d.id)).join("")}<ul>${draft.history.map(v => `<li>Version ${v.versionNumber} · ${e(v.changeReason || "Saved version")}</li>`).join("")}</ul><button type="button" data-stud-workspace-mode="COMPOSITION">Inspect versions, citations and outline</button>${this.buffer()?.sections.size ? `<p>Discarding removes only the unsaved text in this draft.</p>${this.button("Discard my unsaved changes and reload", "discard")}` : ""}</details></div>`;
    }
    renderPanel() {
        const panel = this.state.panel;
        if (!panel) return "";
        const body = panel === "sources" ? `${this.parent.renderMaterials({compact:true})}${this.parent.renderPreview()}` : panel === "notes" ? this.parent.renderNotes() : `${this.parent.parent.simpleNavigation.brief({...this.parent.state.context, requirementsContract:this.state.requirements})}<button type="button" data-stud-workspace-mode="REQUIREMENTS">Review requirements and sources</button>`;
        return `<aside class="stud-workbench-side"><header><h3>${{sources:"Material", notes:"Notes", requirements:"Requirements"}[panel]}</h3>${this.button("Close", "panel", panel)}</header>${body}</aside>`;
    }
    attention() {
        const contract = this.state.requirements?.current;
        const condition = contract?.freshness?.reviewCondition || this.plan()?.contractCondition;
        const messages = [];
        if (condition && condition !== "CURRENT") messages.push("The source basis needs review. Saved writing has not been changed.");
        if (contract?.completeness && contract.completeness !== "COMPLETE") messages.push("Some requirements remain unresolved or conflicting.");
        if (this.state.data?.draft && this.state.data?.current) messages.push("A newer outline is being reviewed. This draft still uses its approved outline.");
        return messages.length ? `<p class="stud-workbench-attention">${messages.map(this.escape).join(" ")} ${this.button("Inspect requirements", "panel", "requirements")}</p>` : "";
    }
    render() {
        const e = this.escape, assignment = this.parent.assignment();
        const label = this.parent.parent.simpleNavigation?.assignment?.assignment.id === assignment?.id ? this.parent.parent.simpleNavigation.assignmentLabel?.label : null;
        const heading = `<header class="stud-workbench-heading"><div><p>${e(this.parent.course()?.title || "Independent assignment")}</p><h2>${e(label || assignment?.title || "Assignment")}</h2></div><div><button type="button" data-stud-simple="continue" data-value="${e(assignment?.id)}">Back to assignment</button><details><summary>Advanced workspace</summary><button type="button" data-stud-workspace-mode="DETAILS">All assignment tools</button></details></div></header>${this.state.manual ? this.attention() : ""}`;
        if (!this.state.manual) return `<section class="stud-human-workbench">${heading}<h3>How would you like to work?</h3><div class="stud-workbench-choice">${this.button("Work myself", "manual")}<div><button type="button" disabled aria-describedby="stud-ai-limit">With AI — not available yet</button><p id="stud-ai-limit">The complete research-to-draft flow is not connected yet. Existing section-level AI tools do not execute the whole assignment. No AI work has started.</p></div></div></section>`;
        return `<section class="stud-human-workbench">${heading}<nav class="stud-workbench-tools" aria-label="Writing tools">${this.button("Material", "panel", "sources")}${this.button("Notes", "panel", "notes")}${this.button("Requirements", "panel", "requirements")}${this.button("Review & export", "export", "", !this.state.draft?.currentVersion || !!this.buffer()?.sections.size)}<details><summary>More tools</summary><button type="button" data-stud-workspace-mode="RESEARCH_PLAN">Research planning</button><button type="button" data-stud-workspace-open-specialist="RESEARCH">Find sources</button><button type="button" data-stud-workspace-mode="EVIDENCE_MAP">Evidence & citations</button><button type="button" data-stud-workspace-mode="COMPOSITION">Full writing tools</button><button type="button" data-stud-workspace-mode="MISSION">Recorded activity</button></details></nav>${this.state.error ? `<p role="alert">${e(this.state.error)}</p>${this.button("Retry reading saved work", "reload")}` : ""}${this.state.notice ? `<p role="status">${e(this.state.notice)}</p>` : ""}${this.state.busy ? `<p role="status">Reading or saving your local work…</p>` : ""}<div class="stud-workbench-layout${this.state.panel ? " has-panel" : ""}"><main>${this.state.loaded ? this.renderWriter() : this.state.busy ? "" : this.button("Open saved work", "reload")}</main>${this.renderPanel()}</div></section>`;
    }
    async click(event) {
        const button = event.target.closest("[data-stud-workbench]");
        if (!button) return false;
        if (this.state.busy) return true;
        const {studWorkbench:action, value} = button.dataset;
        const id = this.assignmentId(), generation = this.generation, plan = this.plan();
        try {
            if (action === "save") { await this.save(); return true; }
            if (action === "manual") { this.state.manual = true; await this.load(); return true; }
            if (action === "reload") { await this.load(); return true; }
            if (action === "discard") { this.edits.delete(this.state.draft?.id); await this.load(); return true; }
            if (action === "panel") { this.state.panel = this.state.panel === value ? null : value; if (value === "sources") this.parent.state.materialsOpen = true; this.redraw(); return true; }
            if (action === "draft") { await this.load(value); await this.persistContext(); return true; }
            if (action === "export") {
                if (this.buffer()?.sections.size || !this.state.draft?.currentVersion) throw Error("Save your writing before reviewing an export.");
                this.parent.state.mode = "FINAL_PACKAGE";
                await this.parent.finalPackage.open({draftVersionId:this.state.draft.currentVersion.id}); this.redraw(); return true;
            }
            this.state.busy = true; this.state.error = ""; this.redraw();
            if (action === "prepare") await this.request("stud-composition-create", {assignmentId:id, contractId:this.state.requirements.current.id, seedProposals:true});
            else if (action === "review-outline") await this.request("stud-composition-review", {planId:plan.id, expectedVersion:plan.rowVersion});
            else if (action === "create-draft") await this.request("stud-draft-create", {assignmentId:id, planId:plan.id, title:this.parent.assignment().title});
            else throw Error("Unknown workbench action.");
            if (id === this.assignmentId() && generation === this.generation) { await this.load(); await this.persistContext(); }
        } catch (error) {
            if (generation === this.generation) this.state.error = error.message || "The action could not be completed.";
        } finally { if (generation === this.generation) { this.state.busy = false; this.redraw(); } }
        return true;
    }
    async submit(event) {
        const form = event.target.closest("[data-workbench-section]");
        if (!form) return false;
        event.preventDefault();
        if (this.state.busy) return true;
        const plan = this.plan(), fields = new FormData(form), generation = this.generation;
        this.state.busy = true; this.state.error = "";
        try {
            await this.request("stud-composition-section-add", {planId:plan.id, expectedVersion:plan.rowVersion, section:{title:String(fields.get("title") || ""), purpose:String(fields.get("purpose") || ""), order:plan.sections.length, lengthUnit:plan.lengthUnit, originReason:"User-defined writing outline."}});
            if (generation === this.generation) await this.load();
        } catch (error) { if (generation === this.generation) this.state.error = error.message || "Heading could not be saved."; }
        finally { if (generation === this.generation) { this.state.busy = false; this.redraw(); } }
        return true;
    }
    async change(event) {
        if (!event.target.matches("[data-workbench-section-select]")) return false;
        if (!this.plan()?.sections.some(s => s.id === event.target.value)) return true;
        this.state.sectionId = event.target.value;
        this.redraw();
        try { await this.persistContext(); } catch (error) { this.state.error = error.message; this.redraw(); }
        return true;
    }
}

if (typeof window !== "undefined") window.StudManualWorkbench = StudManualWorkbench;
if (typeof module !== "undefined") module.exports = {StudManualWorkbench};
