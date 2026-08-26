"use strict";

// M5 is intentionally a composition layer. It owns no academic records: every
// entry below is a canonical STUD object already related to the active
// Assignment, and every meaningful selection goes back through M2's validated
// Working Context service.
const WORKSPACE_OBJECT_TYPES = Object.freeze([
    "ACADEMIC_DOCUMENT", "RESEARCH_PAPER", "NOTE", "RESOURCE", "DATASET",
    "NOTEBOOK", "REPOSITORY_REFERENCE", "COMPUTE_RESULT", "REVISION_ITEM"
]);
const RESOURCE_GROUPS = Object.freeze([
    Object.freeze({id: "BRIEF_MARKING", label: "BRIEF / MARKING"}),
    Object.freeze({id: "COURSE_MATERIAL", label: "COURSE MATERIAL"}),
    Object.freeze({id: "RESEARCH", label: "RESEARCH"}),
    Object.freeze({id: "NOTES", label: "NOTES"}),
    Object.freeze({id: "DATA", label: "DATA"}),
    Object.freeze({id: "REPOSITORY_CODE", label: "REPOSITORY / CODE"}),
    Object.freeze({id: "OTHER", label: "OTHER"})
]);

function isBrief(item = {}) {
    return /\b(?:assessment|brief|instruction|marking|criteria|rubric|guidance|resit|portfolio)\b/i.test(`${item.title || ""} ${item.documentType || ""}`);
}

function objectTitle(item = {}) {
    return String(item.title || item.displayName || item.prompt || item.id || "Untitled academic object");
}

function objectTypeLabel(type) { return String(type || "OBJECT").replace(/_/g, " "); }

function safeJson(value, fallback = null) {
    if (!value || typeof value !== "string") return fallback;
    try { return JSON.parse(value); } catch (error) { return fallback; }
}

function workspaceObjects(context = {}) {
    const seen = new Set();
    const add = (items, type, group) => (items || []).flatMap(item => {
        if (!item || !item.id || seen.has(`${type}:${item.id}`)) return [];
        seen.add(`${type}:${item.id}`);
        return [Object.freeze({type, id: item.id, group, item: Object.freeze({...item, entityType: type})})];
    });
    return Object.freeze([
        ...add((context.documents || []).filter(isBrief), "ACADEMIC_DOCUMENT", "BRIEF_MARKING"),
        ...add((context.documents || []).filter(item => !isBrief(item)), "ACADEMIC_DOCUMENT", "COURSE_MATERIAL"),
        ...add(context.resources, "RESOURCE", "COURSE_MATERIAL"),
        ...add(context.papers, "RESEARCH_PAPER", "RESEARCH"),
        ...add(context.notes, "NOTE", "NOTES"),
        ...add(context.datasets, "DATASET", "DATA"),
        ...add(context.notebooks, "NOTEBOOK", "REPOSITORY_CODE"),
        ...add(context.repositories, "REPOSITORY_REFERENCE", "REPOSITORY_CODE"),
        ...add(context.computeResults, "COMPUTE_RESULT", "DATA"),
        ...add(context.revisions, "REVISION_ITEM", "OTHER")
    ]);
}

function findWorkspaceObject(context, type, id) {
    if (!WORKSPACE_OBJECT_TYPES.includes(type)) return null;
    return workspaceObjects(context).find(item => item.type === type && item.id === id) || null;
}

class StudAssignmentWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {
            context: null, workingContext: null, preview: null, previewError: "", previewPage: 1,
            mode: "WORK", materialsOpen: false, noteComposer: false, selectedNoteId: "", busy: false
        };
    }

    setState(context, workingContext, courseContext = null) {
        const previousAssignment = this.state.context && this.state.context.assignment && this.state.context.assignment.id;
        this.state.context = context || null;
        this.state.courseContext = courseContext || null;
        this.state.workingContext = workingContext || null;
        const assignment = context && context.assignment;
        if (!assignment || assignment.id !== previousAssignment) {
            this.state.preview = null;
            this.state.previewError = "";
            this.state.previewPage = 1;
            this.state.mode = "WORK";
            this.state.materialsOpen = false;
            this.state.noteComposer = false;
            this.state.selectedNoteId = "";
        }
        const active = workingContext && workingContext.activeObject;
        if (active && assignment && findWorkspaceObject(this.objectsContext(), active.entityType, active.id)) {
            this.state.selectedNoteId = active.entityType === "NOTE" ? active.id : this.state.selectedNoteId;
        } else if (active && assignment) {
            // A legacy/current object that is no longer in Assignment scope must
            // never masquerade as Workspace material.
            this.state.preview = null;
        }
    }

    assignment() { return this.state.context && this.state.context.assignment || null; }
    course() { return this.state.context && this.state.context.course || null; }
    workflow() { return this.state.context && this.state.context.workflowState && this.state.context.workflowState.current || null; }

    // Assignment context is the primary source. Course context only contributes
    // objects that are already canonically scoped to the same Course; it never
    // constructs a relationship from a title or a search match.
    objectsContext() {
        const direct = this.state.context || {};
        const course = this.state.courseContext || {};
        const merge = key => {
            const seen = new Set();
            return [...(direct[key] || []), ...(course[key] || [])].filter(item => {
                if (!item || !item.id || seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });
        };
        return {
            ...direct,
            resources: merge("resources"),
            papers: merge("papers"),
            notes: merge("notes"),
            computeResults: merge("computeResults"),
            documents: merge("documents"),
            notebooks: merge("notebooks"),
            datasets: merge("datasets"),
            repositories: merge("repositories"),
            revisions: merge("revisions")
        };
    }

    activeObject() {
        const current = this.state.workingContext && this.state.workingContext.activeObject;
        return current && this.assignment() && findWorkspaceObject(this.objectsContext(), current.entityType, current.id) ? current : null;
    }

    selectedNode() {
        const workflow = this.workflow();
        if (!workflow) return null;
        const requested = this.state.workingContext && this.state.workingContext.activeWorkflowNode;
        return workflow.graph.nodes.find(node => requested && requested.id === node.id)
            || workflow.graph.nodes.find(node => node.id === this.parent.workflow.state.selectedNodeId)
            || workflow.graph.nodes.find(node => node.state === "IN_PROGRESS")
            || workflow.graph.nodes.find(node => node.displayState === "READY")
            || workflow.graph.nodes[0]
            || null;
    }

    async restore() {
        const active = this.activeObject();
        if (!active) return false;
        if (this.state.preview && this.state.preview.type === active.entityType && this.state.preview.id === active.id) return false;
        await this.loadPreview(active.entityType, active.id, this.state.previewPage, {quiet: true});
        return true;
    }

    async setCurrentObject(type, id, originSurface = "ASSIGNMENT_WORKSPACE") {
        const assignment = this.assignment();
        const reference = assignment && findWorkspaceObject(this.objectsContext(), type, id);
        if (!assignment || !reference) throw new Error("This object is not related to the active Assignment. Link it explicitly before opening it here.");
        const prior = this.parent.state.workingContext;
        const workflow = this.workflow();
        const node = this.selectedNode();
        this.parent.state.workingContext = await this.parent.workingContext.update({
            courseId: assignment.courseId || undefined,
            assignmentId: assignment.id,
            objectType: type,
            objectId: id,
            workflowId: workflow && workflow.id || undefined,
            workflowNodeId: node && node.id || undefined,
            originSurface,
            userPinned: prior && prior.userPinned === true
        });
        this.state.workingContext = this.parent.state.workingContext;
        this.parent.applyWorkingContext();
    }

    async openObject(type, id, options = {}) {
        try {
            await this.setCurrentObject(type, id, options.originSurface || "ASSIGNMENT_WORKSPACE");
            if (type === "NOTE") { this.state.selectedNoteId = id; this.state.noteComposer = true; }
            this.state.mode = "WORK";
            this.state.previewPage = Math.max(1, Number(options.page) || 1);
            await this.loadPreview(type, id, this.state.previewPage);
            this.parent.render();
        } catch (error) { this.showToast(this.parent.view, error.message || "WORKSPACE OBJECT UNAVAILABLE"); }
    }

    async loadPreview(type, id, page = 1, options = {}) {
        if (!WORKSPACE_OBJECT_TYPES.includes(type)) throw new Error("This academic object cannot be previewed in the Assignment Workspace.");
        const reference = findWorkspaceObject(this.objectsContext(), type, id);
        if (!reference) throw new Error("This object is not related to the active Assignment.");
        this.state.previewError = "";
        try {
            let data = null;
            if (type === "ACADEMIC_DOCUMENT") data = await this.request("stud-document-context", {documentId: id, page: Math.max(1, Number(page) || 1), chunkLimit: 32});
            else if (type === "RESEARCH_PAPER") data = await this.request("stud-research-context", {paperId: id});
            else if (type === "DATASET") data = await this.request("stud-dataset-read", {datasetId: id});
            else if (type === "NOTEBOOK") data = await this.request("stud-notebook-read", {notebookId: id});
            else data = {object: reference.item};
            this.state.preview = {type, id, data, page: Math.max(1, Number(page) || 1)};
        } catch (error) {
            this.state.preview = {type, id, data: null, page: Math.max(1, Number(page) || 1)};
            this.state.previewError = error.message || "PREVIEW NOT AVAILABLE";
            if (!options.quiet) this.showToast(this.parent.view, this.state.previewError);
        }
    }

    nodeMark(node) { return this.parent.workflow.nodeMark(node); }
    nodeStatus(node) { return this.parent.workflow.nodeStatus(node); }

    classification() {
        const assignment = this.assignment();
        return assignment && this.parent.state.classifications.get(assignment.id) || null;
    }

    requirementsSummary() {
        const state = this.state.context && this.state.context.requirementsContract;
        const contract = state && (state.current || state.draft);
        if (!contract) return {label: "NOT REVIEWED", detail: "Create a reviewed Requirements Contract before relying on a plan.", attention: true};
        const unresolved = (contract.items || []).filter(item => item.resolutionState !== "RESOLVED").length;
        const freshness = contract.freshness && contract.freshness.reviewCondition || "NEEDS_REVIEW";
        return {
            label: `REV ${contract.revision} · ${contract.lifecycle.replace(/_/g, " ")}`,
            detail: `${contract.completeness.replace(/_/g, " ")}${unresolved ? ` · ${unresolved} unresolved` : ""}${freshness !== "CURRENT" ? ` · ${freshness.replace(/_/g, " ")}` : ""}`,
            attention: contract.lifecycle !== "APPROVED" || freshness !== "CURRENT" || unresolved > 0
        };
    }

    renderHeader() {
        const assignment = this.assignment();
        const course = this.course();
        const classification = this.classification();
        const requirement = this.requirementsSummary();
        const workflow = this.workflow();
        const node = this.selectedNode();
        const attention = node && ["DIRECT_BLOCKER", "HUMAN_INPUT_REQUIRED", "DEPENDENCY_WAIT"].includes(node.availability);
        return `<header class="stud-assignment-workspace-header">
            <div class="stud-assignment-workspace-identity"><small>${this.escape(course && this.parent.courseLabel(course.id) || "UNASSIGNED / LOCAL")}</small><h2>${this.escape(assignment.title)}</h2><p>${this.escape(classification && classification.label || "ASSESSMENT TYPE UNKNOWN")} · ${this.escape(assignment.status || "STATUS UNKNOWN")}${assignment.weight !== null && assignment.weight !== undefined ? ` · ${this.escape(String(assignment.weight))}%` : ""}${assignment.dueDate ? ` · DUE ${this.escape(this.parent.dateText ? this.parent.dateText(assignment.dueDate) : assignment.dueDate)}` : " · DUE DATE UNKNOWN"}</p></div>
            <div class="stud-assignment-workspace-context"><small>WORKING ON</small><strong>${workflow && node ? this.escape(node.title) : workflow ? "SELECT A STAGE" : "PLAN NOT CREATED"}</strong><span>${workflow && node ? this.escape(this.nodeStatus(node)) : "NO WORK EXECUTES AUTOMATICALLY"}</span></div>
            <div class="stud-assignment-workspace-status${requirement.attention || attention ? " has-attention" : ""}"><small>REQUIREMENTS</small><strong>${this.escape(requirement.label)}</strong><span>${this.escape(requirement.detail)}</span></div>
        </header>`;
    }

    renderWorkflowRail() {
        const workflow = this.workflow();
        if (!workflow) return `<section class="stud-assignment-workspace-rail is-empty"><div><small>WORKFLOW</small><strong>NO PLAN YET</strong><span>Choose a bounded, explicit structure when you are ready.</span></div><button type="button" data-stud-workspace-mode="WORKFLOW">SET UP WORKFLOW</button></section>`;
        const selected = this.selectedNode();
        return `<nav class="stud-assignment-workspace-rail" aria-label="Assignment workflow stages"><header><small>WORKFLOW</small><button type="button" data-stud-workspace-mode="WORKFLOW">DETAILS</button></header><ol>${workflow.graph.nodes.map(node => `<li class="is-${node.availability.toLowerCase().replace(/_/g, "-")}${selected && selected.id === node.id ? " is-current" : ""}"><button type="button" data-stud-workflow-node="${this.escape(node.id)}" data-workflow-id="${this.escape(workflow.id)}" aria-current="${selected && selected.id === node.id ? "step" : "false"}"><span aria-hidden="true">${this.nodeMark(node)}</span><span><strong>${this.escape(node.title)}</strong><small>${this.escape(this.nodeStatus(node))}</small></span></button></li>`).join("")}</ol></nav>`;
    }

    renderStageAttention() {
        const node = this.selectedNode();
        if (!node || !["DIRECT_BLOCKER", "HUMAN_INPUT_REQUIRED", "DEPENDENCY_WAIT"].includes(node.availability)) return "";
        const label = node.availability === "DIRECT_BLOCKER" ? "THIS STAGE IS BLOCKED" : node.availability === "HUMAN_INPUT_REQUIRED" ? "YOUR DECISION IS REQUIRED" : "THIS STAGE IS WAITING";
        const detail = node.availability === "DEPENDENCY_WAIT"
            ? (node.impactSources || []).map(item => item.title).filter(Boolean).join(" · ") || "A prerequisite remains incomplete."
            : node.availability === "DIRECT_BLOCKER"
                ? `${node.directBlockers.length} explicit blocker${node.directBlockers.length === 1 ? "" : "s"} recorded. Independent stages can still continue.`
                : "A human checkpoint is pending. It does not mark this stage complete automatically.";
        return `<section class="stud-assignment-workspace-attention" role="status"><div><strong>${label}</strong><span>${this.escape(detail)}</span></div><button type="button" data-stud-workspace-mode="WORKFLOW">VIEW CONTEXT</button></section>`;
    }

    objectRows(group) {
        const objects = workspaceObjects(this.objectsContext()).filter(item => item.group === group).slice(0, 40);
        const active = this.activeObject();
        return objects.length ? objects.map(object => `<button type="button" class="${active && active.entityType === object.type && active.id === object.id ? "is-current" : ""}" data-stud-workspace-object-type="${this.escape(object.type)}" data-stud-workspace-object-id="${this.escape(object.id)}"><strong>${this.escape(objectTitle(object.item))}</strong><small>${this.escape(objectTypeLabel(object.type))}${object.item.extractionStatus ? ` · ${this.escape(object.item.extractionStatus)}` : ""}</small></button>`).join("") : `<p>NO RELATED ${this.escape(RESOURCE_GROUPS.find(item => item.id === group).label)}.</p>`;
    }

    renderMaterials() {
        const objects = workspaceObjects(this.objectsContext());
        const count = objects.length;
        return `<details class="stud-assignment-workspace-materials"${this.state.materialsOpen ? " open" : ""}><summary>RELATED MATERIAL · ${count}</summary><p>Shown because it is canonically linked to this Assignment or its Course. Nothing is attached from title similarity.</p><div>${RESOURCE_GROUPS.map(group => `<section><header><strong>${this.escape(group.label)}</strong><span>${objects.filter(item => item.group === group.id).length}</span></header>${this.objectRows(group.id)}</section>`).join("")}</div></details>`;
    }

    renderPreviewEmpty() {
        const node = this.selectedNode();
        const blocked = node && node.availability === "DIRECT_BLOCKER";
        return `<section class="stud-assignment-preview-empty"><small>PRIMARY WORK SURFACE</small><h3>${blocked ? "This stage is waiting for a real input" : "No source open"}</h3><p>${blocked ? "You can still review related material, take notes or select an independent ready stage. STUD will not invent the missing input." : "Choose canonically related material. Opening it updates the visible Working Context, but never queries a provider or starts AI work."}</p><div><button type="button" data-stud-workspace-show-materials>${blocked ? "VIEW AVAILABLE MATERIAL" : "CHOOSE MATERIAL"}</button>${node && node.availability === "DIRECT_BLOCKER" ? `<button type="button" data-stud-workspace-open-ready>OPEN A READY STAGE</button>` : ""}</div></section>`;
    }

    renderDocumentPreview(preview) {
        const data = preview.data || {};
        const document = data.document || {};
        const page = data.pages && data.pages[0];
        const chunks = data.chunks || [];
        const pageCount = Math.max(1, Number(document.pageCount) || preview.page || 1);
        return `<section class="stud-assignment-preview-document"><header><div><small>MANAGED ACADEMIC DOCUMENT</small><h3>${this.escape(objectTitle(document))}</h3><p>${this.escape(document.documentType || "UNKNOWN TYPE")} · ${document.extractionStatus === "OCR_REQUIRED" ? "OCR REQUIRED" : this.escape(document.extractionStatus || "NOT ANALYZED")}</p></div><div class="stud-assignment-preview-actions"><button type="button" data-stud-workspace-document-reader="${this.escape(document.id)}"${document.managedReference ? "" : " disabled"}>OPEN PDF READER</button><button type="button" data-stud-workspace-open-specialist="DOCUMENTS">DOCUMENT DETAILS</button></div></header>
            <nav class="stud-assignment-document-pages" aria-label="Document page"><button type="button" data-stud-workspace-document-page="${Math.max(1, preview.page - 1)}"${preview.page <= 1 ? " disabled" : ""}>PREV PAGE</button><span>PAGE ${preview.page} / ${pageCount}</span><button type="button" data-stud-workspace-document-page="${Math.min(pageCount, preview.page + 1)}"${preview.page >= pageCount ? " disabled" : ""}>NEXT PAGE</button></nav>
            ${page ? `<article class="stud-assignment-document-page"><header><small>LOCAL EXTRACTION · PAGE ${this.escape(page.pageNumber || preview.page)}</small><span>${this.escape(page.contentHash ? "HASHED" : "TEXT AVAILABLE")}</span></header><pre>${this.escape(page.text || "NO EMBEDDED TEXT ON THIS PAGE")}</pre></article>` : `<div class="stud-assignment-preview-unavailable"><strong>${document.extractionStatus === "OCR_REQUIRED" ? "OCR REQUIRED" : "PAGE PREVIEW NOT AVAILABLE"}</strong><p>${document.extractionStatus === "OCR_REQUIRED" ? "The managed document remains available, but this page cannot be read as text without OCR. No text has been fabricated." : "Use the existing local PDF reader or analyze this managed document explicitly."}</p></div>`}
            ${chunks.length ? `<section class="stud-assignment-document-chunks"><header><strong>RELATED EXCERPTS</strong><span>${chunks.length} SHOWN</span></header>${chunks.slice(0, 8).map(chunk => `<article><small>PAGE ${this.escape(chunk.pageStart || preview.page)} · ${this.escape(chunk.chunkType || "TEXT")}</small><p>${this.escape(chunk.content)}</p><button type="button" data-stud-workspace-document-note="${this.escape(chunk.id)}">CREATE NOTE WITH SOURCE</button></article>`).join("")}</section>` : ""}`;
    }

    renderPaperPreview(preview) {
        const context = preview.data || {};
        const paper = context.paper || {};
        const hasPdf = Boolean(paper.localDocumentReference);
        return `<section class="stud-assignment-preview-paper"><header><div><small>CANONICAL RESEARCH PAPER</small><h3>${this.escape(objectTitle(paper))}</h3><p>${this.escape(paper.authors || "AUTHORS UNKNOWN")} · ${this.escape(paper.year || "YEAR UNKNOWN")}</p></div><div class="stud-assignment-preview-actions">${hasPdf ? `<button type="button" data-stud-workspace-paper-reader="${this.escape(paper.id)}">OPEN LOCAL PDF</button>` : ""}<button type="button" data-stud-workspace-note-from-paper="${this.escape(paper.id)}">TAKE NOTE</button><button type="button" data-stud-workspace-cite="${this.escape(paper.id)}">CITE</button></div></header><dl><div><dt>DOI</dt><dd>${this.escape(paper.doi || "UNAVAILABLE")}</dd></div><div><dt>VENUE</dt><dd>${this.escape(paper.venue || "UNKNOWN")}</dd></div><div><dt>PROVENANCE</dt><dd>${this.escape(`${(context.provenance || []).length} OBSERVATIONS`)}</dd></div></dl>${paper.abstract ? `<article><small>ABSTRACT</small><p>${this.escape(paper.abstract)}</p></article>` : `<div class="stud-assignment-preview-unavailable"><strong>ABSTRACT UNAVAILABLE</strong><p>STUD has not invented a summary. You can still inspect the canonical record and its provenance.</p></div>`}</section>`;
    }

    renderDatasetPreview(preview) {
        const data = preview.data || {};
        const dataset = data.dataset || {};
        const columns = (data.columns || []).slice(0, 10);
        const rows = (data.preview || []).slice(0, 10);
        return `<section class="stud-assignment-preview-dataset"><header><div><small>MANAGED DATASET</small><h3>${this.escape(objectTitle(dataset))}</h3><p>${this.escape(dataset.format || "UNKNOWN")} · ${this.escape(String(dataset.rowCount || "UNKNOWN"))} ROWS</p></div><button type="button" data-stud-workspace-open-specialist="WORKBENCH">OPEN DATA WORKBENCH</button></header>${columns.length ? `<div class="stud-assignment-dataset-table" role="region" aria-label="Bounded dataset preview"><table><thead><tr>${columns.map(column => `<th>${this.escape(column.name || column)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.slice(0, columns.length).map(value => `<td>${this.escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="stud-assignment-preview-unavailable"><strong>PREVIEW NOT AVAILABLE</strong><p>The canonical dataset is linked but a local bounded preview could not be read. No original path is exposed.</p></div>`}</section>`;
    }

    renderNotebookPreview(preview) {
        const data = preview.data || {};
        const notebook = data.notebook || data.object || {};
        const cells = (data.cells || []).slice(0, 8);
        return `<section class="stud-assignment-preview-notebook"><header><div><small>CANONICAL NOTEBOOK</small><h3>${this.escape(objectTitle(notebook))}</h3><p>${this.escape(notebook.notebookType || "NOTEBOOK")} · ${this.escape(notebook.executionStatus || "EDITING ONLY")}</p></div><button type="button" data-stud-workspace-open-specialist="WORKBENCH">OPEN NOTEBOOK</button></header>${cells.length ? `<ol>${cells.map(cell => `<li><small>${this.escape(cell.cellType)} · ${this.escape(cell.executionState || "NOT EXECUTED")}</small><pre>${this.escape(String(cell.source || "").slice(0, 1600))}</pre></li>`).join("")}</ol>` : `<div class="stud-assignment-preview-unavailable"><strong>NO CELLS TO PREVIEW</strong><p>This is a canonical notebook reference. Opening it in the local workbench does not run code.</p></div>`}</section>`;
    }

    renderGenericPreview(preview) {
        const object = preview.data && preview.data.object || findWorkspaceObject(this.objectsContext(), preview.type, preview.id)?.item || {};
        if (preview.type === "NOTE") return `<section class="stud-assignment-preview-note"><header><div><small>WORKING NOTE</small><h3>${this.escape(objectTitle(object))}</h3><p>Structured local note · explicit save</p></div><button type="button" data-stud-workspace-note-edit="${this.escape(object.id)}">EDIT NOTE</button></header><pre>${this.escape(String(object.content || "No saved note content yet.").slice(0, 12000))}</pre></section>`;
        if (preview.type === "REPOSITORY_REFERENCE") {
            const metadata = safeJson(object.metadataJson, {});
            return `<section class="stud-assignment-preview-generic"><header><div><small>REPOSITORY REFERENCE</small><h3>${this.escape(objectTitle(object))}</h3><p>${this.escape(object.provider || "PUBLIC REFERENCE")} · ${this.escape(object.selectedRef || "NO SAVED REF")}</p></div><button type="button" data-stud-workspace-open-specialist="WORKBENCH">OPEN REPOSITORY CONTEXT</button></header><p>${this.escape(metadata.description || "No saved public metadata is available. Refresh remains an explicit action in the Workbench.")}</p></section>`;
        }
        if (preview.type === "COMPUTE_RESULT") return `<section class="stud-assignment-preview-generic"><header><div><small>LOCAL COMPUTE RESULT</small><h3>${this.escape(objectTitle(object))}</h3><p>${this.escape(object.tool || "LOCAL COMPUTE")} · ${this.escape(object.operation || "RESULT")}</p></div><button type="button" data-stud-workspace-open-specialist="TOOLS">OPEN COMPUTE TOOLS</button></header><pre>${this.escape(String(object.outputJson || object.content || "Saved canonical result.").slice(0, 12000))}</pre></section>`;
        if (preview.type === "RESOURCE") return `<section class="stud-assignment-preview-generic"><header><div><small>ACADEMIC RESOURCE</small><h3>${this.escape(objectTitle(object))}</h3><p>${this.escape(object.type || "UNKNOWN")} · ${object.localReference ? "MANAGED LOCAL REFERENCE" : "REFERENCE ONLY"}</p></div><button type="button" data-stud-workspace-show-materials>RELATED MATERIAL</button></header><p>${object.localReference ? "This canonical resource has a managed local reference. If a linked AcademicDocument exists, use the material list to open its bounded document preview." : "Preview is not available for this reference type. STUD does not embed an unrestricted browser or follow its URL automatically."}</p></section>`;
        if (preview.type === "REVISION_ITEM") return `<section class="stud-assignment-preview-generic"><header><div><small>REVISION ITEM</small><h3>${this.escape(objectTitle(object))}</h3><p>${this.escape(object.status || "NOT STARTED")} · ${this.escape(object.priority || "NORMAL")}</p></div><button type="button" data-stud-workspace-open-specialist="REVISION">OPEN STUDY</button></header><p>${this.escape(object.description || object.prompt || "No additional local revision detail is available.")}</p></section>`;
        return `<section class="stud-assignment-preview-unavailable"><strong>PREVIEW NOT AVAILABLE</strong><p>This canonical ${this.escape(objectTypeLabel(preview.type))} has no bounded Workspace adapter. Its data remains unchanged and can be opened only through its existing specialised surface.</p></section>`;
    }

    renderPreview() {
        const preview = this.state.preview;
        const active = this.activeObject();
        if (!active) return this.renderPreviewEmpty();
        const title = preview && preview.type === active.entityType && preview.id === active.id ? "" : `<div class="stud-assignment-preview-loading">RESTORING LOCAL OBJECT…</div>`;
        if (!preview || preview.type !== active.entityType || preview.id !== active.id) return title || this.renderPreviewEmpty();
        const error = this.state.previewError ? `<div class="stud-assignment-preview-unavailable" role="status"><strong>PREVIEW NOT AVAILABLE</strong><p>${this.escape(this.state.previewError)}</p></div>` : "";
        const body = preview.type === "ACADEMIC_DOCUMENT" ? this.renderDocumentPreview(preview)
            : preview.type === "RESEARCH_PAPER" ? this.renderPaperPreview(preview)
            : preview.type === "DATASET" ? this.renderDatasetPreview(preview)
            : preview.type === "NOTEBOOK" ? this.renderNotebookPreview(preview)
            : this.renderGenericPreview(preview);
        return `${error}${body}`;
    }

    renderNotes() {
        const context = this.state.context;
        const notes = this.objectsContext().notes || [];
        const current = notes.find(note => note.id === this.state.selectedNoteId) || notes.find(note => this.state.workingContext && this.state.workingContext.activeObject && this.state.workingContext.activeObject.entityType === "NOTE" && this.state.workingContext.activeObject.id === note.id) || null;
        const composerOpen = this.state.noteComposer || Boolean(current) || Boolean(this.parent.research.state.noteSelection);
        const selectionPaper = this.parent.research.state.notePaperId || "";
        return `<aside class="stud-assignment-workspace-notes"><header><div><small>WORKING NOTES</small><h3>${current ? this.escape(current.title) : "No working note selected"}</h3></div><div><button type="button" data-stud-workspace-note-create>CREATE NOTE</button>${notes.length ? `<button type="button" data-stud-workspace-open-specialist="NOTES">ALL NOTES</button>` : ""}</div></header>${notes.length ? `<nav class="stud-assignment-note-tabs" aria-label="Assignment notes">${notes.slice(0, 12).map(note => `<button type="button" class="${current && current.id === note.id ? "is-current" : ""}" data-stud-workspace-note-select="${this.escape(note.id)}">${this.escape(note.title)}</button>`).join("")}</nav>` : ""}${composerOpen ? this.parent.research.renderContextualNoteEditor({note: current, course: this.course(), assignment: this.assignment(), selectedPaperId: selectionPaper}) : `<div class="stud-assignment-notes-empty"><p>Notes stay separate until you explicitly create or select one.</p>${notes.length ? `<button type="button" data-stud-workspace-note-select="${this.escape(notes[0].id)}">OPEN A RELATED NOTE</button>` : ""}</div>`}</aside>`;
    }

    renderActions() {
        const active = this.activeObject();
        return `<footer class="stud-assignment-workspace-actions"><div><small>CONTEXTUAL ACTIONS</small><span>${active ? `${this.escape(objectTypeLabel(active.entityType))} · ${this.escape(objectTitle(active))}` : "SELECT A RELATED OBJECT"}</span></div><div><button type="button" data-stud-workspace-open-specialist="RESEARCH">RESEARCH</button><button type="button" data-stud-workspace-open-specialist="KNOWLEDGE">KNOWLEDGE</button><button type="button" data-stud-workspace-open-specialist="CITATIONS">CITATIONS</button><button type="button" data-stud-workspace-open-specialist="WORKBENCH">WORKBENCH</button></div></footer>`;
    }

    renderWorkspace() {
        const assignment = this.assignment();
        if (!assignment) {
            const candidates = (this.parent.state.assignments || []).slice(0, 8);
            return `<section class="stud-assignment-workspace-empty"><small>WORK / ASSIGNMENT WORKSPACE</small><h2>Choose an Assignment to begin focused work</h2><p>STUD will restore your last valid local Assignment context when one exists. No provider, AI or workflow execution starts here.</p>${candidates.length ? `<div>${candidates.map(item => `<button type="button" data-stud-open-assignment="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><small>${this.escape(this.parent.courseLabel(item.courseId))}</small></button>`).join("")}</div>` : `<button type="button" data-stud-dialog="CREATE_ASSIGNMENT">CREATE MANUAL ASSIGNMENT</button>`}</section>`;
        }
        if (this.state.mode === "REQUIREMENTS") return `<section class="stud-assignment-workspace-detail"><header><button type="button" data-stud-workspace-mode="WORK">← WORKSPACE</button><div><small>ASSIGNMENT REQUIREMENTS</small><h2>${this.escape(assignment.title)}</h2></div></header>${this.parent.requirements.render()}</section>`;
        if (this.state.mode === "WORKFLOW") return `<section class="stud-assignment-workspace-detail"><header><button type="button" data-stud-workspace-mode="WORK">← WORKSPACE</button><div><small>ASSIGNMENT WORKFLOW</small><h2>${this.escape(assignment.title)}</h2></div></header>${this.parent.workflow.render()}</section>`;
        return `<section class="stud-assignment-workspace">
            ${this.renderHeader()}
            ${this.renderWorkflowRail()}
            ${this.renderStageAttention()}
            <div class="stud-assignment-workspace-body"><main class="stud-assignment-workspace-preview">${this.renderPreview()}${this.renderMaterials()}</main>${this.renderNotes()}</div>
            <section class="stud-assignment-workspace-requirements"><button type="button" data-stud-workspace-mode="REQUIREMENTS"><span>REQUIREMENTS</span><strong>${this.escape(this.requirementsSummary().label)}</strong><small>${this.escape(this.requirementsSummary().detail)}</small></button></section>
            ${this.renderActions()}
        </section>`;
    }

    render() { return this.renderWorkspace(); }

    shouldMountNoteEditor() { return this.state.noteComposer || Boolean(this.state.selectedNoteId); }

    async createDocumentNote(chunkId) {
        const preview = this.state.preview;
        if (!preview || preview.type !== "ACADEMIC_DOCUMENT" || !chunkId) return;
        try {
            const note = await this.request("stud-document-create-note", {documentId: preview.id, chunkId});
            await this.onNoteSaved(note);
            this.showToast(this.parent.view, "NOTE CREATED WITH DOCUMENT PROVENANCE");
        } catch (error) { this.showToast(this.parent.view, error.message || "DOCUMENT NOTE UNAVAILABLE"); }
    }

    async onNoteSaved(note) {
        const context = this.state.context;
        if (!note || !context || !context.assignment || note.assignmentId !== context.assignment.id) return;
        const notes = [...(context.notes || []).filter(item => item.id !== note.id), note];
        this.state.context = {...context, notes};
        this.parent.state.assignmentContext = this.state.context;
        this.parent.research.state.notes = [...this.parent.research.state.notes.filter(item => item.id !== note.id), note];
        this.state.selectedNoteId = note.id;
        this.state.noteComposer = true;
        await this.setCurrentObject("NOTE", note.id, "ASSIGNMENT_WORKSPACE_NOTE");
    }

    async openSpecialist(target) {
        const assignment = this.assignment();
        if (!assignment) return;
        if (target === "RESEARCH") { this.parent.research.state.assignmentId = assignment.id; this.parent.research.state.tab = "LIBRARY"; this.parent.setActiveView("RESEARCH"); return; }
        if (target === "KNOWLEDGE") { this.parent.knowledge.state.rootType = "ASSIGNMENT"; this.parent.knowledge.state.rootId = assignment.id; this.parent.setActiveView("KNOWLEDGE"); return; }
        if (target === "CITATIONS") { this.parent.research.state.assignmentId = assignment.id; this.parent.research.state.tab = "CITATIONS"; this.parent.setActiveView("RESEARCH"); return; }
        if (target === "NOTES") { this.parent.research.state.assignmentId = assignment.id; this.parent.setActiveView("NOTES"); return; }
        if (target === "DOCUMENTS") { this.parent.setActiveView("DOCUMENTS"); return; }
        if (target === "WORKBENCH") { this.parent.setActiveView("WORKBENCH"); return; }
        if (target === "TOOLS") { this.parent.setActiveView("TOOLS"); return; }
        if (target === "REVISION") { this.parent.setActiveView("REVISION"); }
    }

    async openDocumentReader(documentId) {
        try {
            const data = await this.request("stud-document-read-pdf", {documentId});
            const document = this.state.preview && this.state.preview.data && this.state.preview.data.document || {};
            await this.parent.research.openPdfData(data, {title: document.title || "Academic document", sourceType: "ACADEMIC_DOCUMENT", documentReference: data.reference});
        } catch (error) { this.showToast(this.parent.view, error.message || "LOCAL PDF READER UNAVAILABLE"); }
    }

    async openPaperReader(paperId) {
        try { await this.parent.research.openPdf(paperId); }
        catch (error) { this.showToast(this.parent.view, error.message || "LOCAL PAPER PDF UNAVAILABLE"); }
    }

    async openReadyStage() {
        const workflow = this.workflow();
        const ready = workflow && workflow.graph.nodes.find(node => node.displayState === "READY" && node.availability === "AVAILABLE");
        if (!ready) return this.showToast(this.parent.view, "NO INDEPENDENT READY STAGE IS AVAILABLE");
        await this.parent.workflow.selectNode({dataset: {workflowId: workflow.id, studWorkflowNode: ready.id}});
    }

    async handleClick(event) {
        const object = event.target.closest("[data-stud-workspace-object-id]");
        const mode = event.target.closest("[data-stud-workspace-mode]");
        const showMaterials = event.target.closest("[data-stud-workspace-show-materials]");
        const documentPage = event.target.closest("[data-stud-workspace-document-page]");
        const documentReader = event.target.closest("[data-stud-workspace-document-reader]");
        const documentNote = event.target.closest("[data-stud-workspace-document-note]");
        const paperReader = event.target.closest("[data-stud-workspace-paper-reader]");
        const paperNote = event.target.closest("[data-stud-workspace-note-from-paper]");
        const cite = event.target.closest("[data-stud-workspace-cite]");
        const noteCreate = event.target.closest("[data-stud-workspace-note-create]");
        const noteSelect = event.target.closest("[data-stud-workspace-note-select]");
        const noteEdit = event.target.closest("[data-stud-workspace-note-edit]");
        const specialist = event.target.closest("[data-stud-workspace-open-specialist]");
        const ready = event.target.closest("[data-stud-workspace-open-ready]");
        if (!object && !mode && !showMaterials && !documentPage && !documentReader && !documentNote && !paperReader && !paperNote && !cite && !noteCreate && !noteSelect && !noteEdit && !specialist && !ready) return false;
        if (object) await this.openObject(object.dataset.studWorkspaceObjectType, object.dataset.studWorkspaceObjectId);
        else if (mode) { this.state.mode = mode.dataset.studWorkspaceMode; this.parent.render(); }
        else if (showMaterials) { this.state.materialsOpen = true; this.parent.render(); }
        else if (documentPage) { const preview = this.state.preview; if (preview && preview.type === "ACADEMIC_DOCUMENT") { this.state.previewPage = Number(documentPage.dataset.studWorkspaceDocumentPage); await this.loadPreview(preview.type, preview.id, this.state.previewPage); this.parent.render(); } }
        else if (documentReader) await this.openDocumentReader(documentReader.dataset.studWorkspaceDocumentReader);
        else if (documentNote) await this.createDocumentNote(documentNote.dataset.studWorkspaceDocumentNote);
        else if (paperReader) await this.openPaperReader(paperReader.dataset.studWorkspacePaperReader);
        else if (paperNote) { this.parent.research.state.notePaperId = paperNote.dataset.studWorkspaceNoteFromPaper; this.parent.research.state.noteSelection = null; this.state.selectedNoteId = ""; this.state.noteComposer = true; this.parent.render(); }
        else if (cite) { this.parent.research.state.citationPaperIds = [cite.dataset.studWorkspaceCite]; await this.openSpecialist("CITATIONS"); }
        else if (noteCreate) { this.parent.research.disposeEditor(); this.parent.research.state.noteSelection = null; this.state.selectedNoteId = ""; this.state.noteComposer = true; this.parent.render(); }
        else if (noteSelect || noteEdit) { const id = (noteSelect || noteEdit).dataset.studWorkspaceNoteSelect || (noteEdit && noteEdit.dataset.studWorkspaceNoteEdit); this.parent.research.disposeEditor(); this.state.selectedNoteId = id; this.state.noteComposer = true; await this.openObject("NOTE", id, {originSurface: "ASSIGNMENT_WORKSPACE_NOTE"}); }
        else if (specialist) await this.openSpecialist(specialist.dataset.studWorkspaceOpenSpecialist);
        else await this.openReadyStage();
        return true;
    }

    async handleSubmit() { return false; }
}

if (typeof window !== "undefined") window.StudAssignmentWorkspace = StudAssignmentWorkspace;
module.exports = {StudAssignmentWorkspace, WORKSPACE_OBJECT_TYPES, RESOURCE_GROUPS, workspaceObjects, findWorkspaceObject, isBrief};
