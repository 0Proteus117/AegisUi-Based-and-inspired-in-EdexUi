"use strict";

class StudDocumentWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent || null;
        this.state = {capabilities: null, documents: [], choices: {courses: [], assignments: [], papers: [], resources: []}, selectedId: "", context: null, search: [], busy: false, requestId: null, error: null};
    }

    async initialize() {
        const [capabilities, documents, courses, assignments, papers, resources] = await Promise.all([
            this.request("stud-document-capabilities"), this.request("stud-document-list", {limit: 500}),
            this.request("stud-entity-list", {entityType: "COURSE", limit: 500}), this.request("stud-entity-list", {entityType: "ASSIGNMENT", limit: 500}),
            this.request("stud-entity-list", {entityType: "RESEARCH_PAPER", limit: 500}), this.request("stud-entity-list", {entityType: "RESOURCE", limit: 500})
        ]);
        this.state.capabilities = capabilities; this.state.documents = documents; this.state.choices = {courses, assignments, papers, resources};
    }

    async refresh(selectId = this.state.selectedId) {
        this.state.documents = await this.request("stud-document-list", {limit: 500});
        if (selectId && this.state.documents.some(document => document.id === selectId)) await this.select(selectId);
        else { this.state.selectedId = ""; this.state.context = null; }
    }

    async select(id, page = null) {
        this.state.selectedId = id;
        this.state.context = await this.request("stud-document-context", {documentId: id, page: page || undefined, chunkLimit: 200});
        this.state.error = null;
        if (this.parent) this.parent.render();
    }

    render() {
        const selected = this.state.context && this.state.context.document;
        const cap = this.state.capabilities || {};
        return `<section class="stud-document-shell">
            <header class="workspace-panel stud-document-intro"><div><small>STUD / LOCAL DOCUMENT CONTEXT</small><h2>DOCUMENT INTELLIGENCE</h2><p>Explicit, offline PDF analysis with page-level provenance. It does not infer academic discipline, upload a document or contact a provider.</p></div><div class="stud-document-state"><small>BASE ENGINE</small><strong>${this.escape(cap.BUILTIN_PDF && cap.BUILTIN_PDF.status || "CHECKING")}</strong><span>PDF.JS / LOCAL</span></div></header>
            <div class="stud-document-grid">
                <article class="workspace-panel"><header><h2>DOCUMENTS</h2><span>${this.state.documents.length} LOCAL</span></header><div class="workspace-panel-content stud-document-list">${this.renderImportForm()}${this.state.documents.length ? this.state.documents.map(document => `<button type="button" class="${document.id === this.state.selectedId ? "selected" : ""}" data-stud-document-select="${this.escape(document.id)}"><strong>${this.escape(document.title)}</strong><small>${this.escape(document.documentType)} · ${this.escape(document.extractionStatus)}</small></button>`).join("") : `<p class="stud-empty-inline">NO ACADEMIC DOCUMENTS. IMPORT ONE PDF EXPLICITLY TO BEGIN.</p>`}</div></article>
                <article class="workspace-panel stud-document-detail"><header><h2>${selected ? "DOCUMENT CONTEXT" : "LOCAL INGESTION"}</h2><span>${selected ? this.escape(selected.extractionStatus) : "EXPLICIT / OFFLINE"}</span></header><div class="workspace-panel-content">${selected ? this.renderContext() : this.renderEmpty()}</div></article>
            </div>
            <article class="workspace-panel stud-document-policy"><header><h2>ENGINE CAPABILITIES</h2><span>HONEST / OPTIONAL</span></header><div class="workspace-panel-content"><div class="stud-document-capabilities">${Object.entries(cap).map(([name, value]) => `<article><strong>${this.escape(name.replace(/_/g, " "))}</strong><span>${this.escape(value.status)}</span><small>${this.escape(value.reason || `${value.engine} · OFFLINE / NO NETWORK`)}</small></article>`).join("")}</div><p>Advanced engines are not bundled, detected via arbitrary local paths, or replaced by a cloud fallback. Flat page/chunk extraction remains explicit when structure is unavailable.</p></div></article>
        </section>`;
    }

    renderOptions(items, label) { return `<option value="">NO ${label}</option>${items.map(item => `<option value="${this.escape(item.id)}">${this.escape(item.title || item.prompt || item.id)}</option>`).join("")}`; }

    renderImportForm() {
        const choices = this.state.choices;
        return `<form class="stud-document-import-form" data-stud-document-import-form><label>TITLE<input class="aegis-input" name="title" maxlength="240" placeholder="Optional safe display title"></label><label>TYPE<select class="aegis-input" name="documentType"><option>UNKNOWN</option><option>ARTICLE</option><option>BOOK</option><option>BOOK_CHAPTER</option><option>THESIS</option><option>REPORT</option><option>COURSE_MATERIAL</option><option>LECTURE_SLIDES</option><option>LEGAL_MATERIAL</option><option>CASE_LAW</option><option>POLICY</option><option>DATASET_DOCUMENTATION</option><option>TECHNICAL_STANDARD</option><option>OTHER</option></select></label><label>COURSE<select class="aegis-input" name="courseId">${this.renderOptions(choices.courses, "COURSE")}</select></label><label>ASSIGNMENT<select class="aegis-input" name="assignmentId">${this.renderOptions(choices.assignments, "ASSIGNMENT")}</select></label><label>PAPER<select class="aegis-input" name="sourcePaperId">${this.renderOptions(choices.papers, "PAPER")}</select></label><label>RESOURCE<select class="aegis-input" name="sourceResourceId">${this.renderOptions(choices.resources, "RESOURCE")}</select></label><button type="submit">SELECT & IMPORT PDF</button><small>Associations are optional and explicit. This opens one native PDF selection only.</small></form>`;
    }

    renderEmpty() { return `<div class="stud-document-empty"><strong>DOCUMENT-AGNOSTIC ACADEMIC INGESTION</strong><p>Supported now: an explicitly selected local PDF. Pages and text chunks are saved only after you press ANALYZE. No source is assumed to be a paper, and no original path is retained in STUD.</p>${this.state.error ? `<div class="stud-document-error">${this.escape(this.state.error)}</div>` : ""}<button type="button" data-stud-document-import>SELECT LOCAL PDF</button></div>`; }

    renderContext() {
        const {document, extraction, pages, chunks, references, sections} = this.state.context;
        const metadata = [["TYPE", document.documentType], ["FILE", document.displayName || "SAFE LABEL ABSENT"], ["SHA-256", document.checksum || "ABSENT"], ["PAGES", document.pageCount || "UNKNOWN"], ["ENGINE", document.extractionEngine || "NOT RUN"], ["STRUCTURE", extraction ? (sections.length ? "SOURCE-SUPPORTED SECTIONS" : "FLAT PAGE / TEXT") : "NOT ANALYZED"]];
        return `<div class="stud-document-heading"><small>ACADEMIC DOCUMENT</small><h3>${this.escape(document.title)}</h3><div class="stud-document-actions"><button type="button" data-stud-document-analyze="${this.escape(document.id)}"${this.state.busy ? " disabled" : ""}>${document.extractionStatus === "NOT_ANALYZED" ? "ANALYZE DOCUMENT" : "REANALYZE"}</button>${this.state.busy ? `<button type="button" data-stud-document-cancel>CANCEL</button>` : ""}<button type="button" data-stud-document-open-pdf="${this.escape(document.id)}">OPEN PDF</button></div></div>
            ${this.state.error ? `<div class="stud-document-error">${this.escape(this.state.error)}</div>` : ""}
            <dl class="stud-document-metadata">${metadata.map(([key, value]) => `<div><dt>${key}</dt><dd>${this.escape(value)}</dd></div>`).join("")}</dl>
            <section class="stud-document-content"><header><h3>EXTRACTION</h3><span>${extraction ? this.escape(extraction.status) : "IDLE"}</span></header>${extraction ? `<p>${this.escape((extraction.warnings || []).map(item => item.message).join(" ") || "Local normalized extraction is ready. No raw parser payload is retained.")}</p>` : `<p>Press ANALYZE DOCUMENT. The destination remains idle until you make that explicit local request.</p>`}</section>
            ${pages.length ? `<section class="stud-document-content"><header><h3>PAGE ${pages[0].pageNumber}</h3><span>PAGE PROVENANCE</span></header><pre>${this.escape(pages[0].text || "NO EMBEDDED TEXT")}</pre></section>` : ""}
            ${chunks.length ? `<section class="stud-document-content"><header><h3>TEXT CHUNKS</h3><span>${chunks.length} DISPLAYED</span></header><div class="stud-document-chunks">${chunks.map(chunk => `<article><small>PAGE ${chunk.pageStart || "?"} · ${this.escape(chunk.chunkType)}</small><p>${this.escape(chunk.content)}</p><footer><button type="button" data-stud-document-note="${this.escape(chunk.id)}">CREATE NOTE FROM QUOTE</button><button type="button" data-stud-document-revision="${this.escape(chunk.id)}">CREATE REVISION</button></footer></article>`).join("")}</div></section>` : ""}
            <section class="stud-document-content"><header><h3>DIRECT REFERENCES</h3><span>${references.length}</span></header>${references.length ? `<ul>${references.map(reference => `<li>${this.escape(reference.referenceType)} · ${this.escape(reference.value)} · PAGE ${reference.pageNumber || "?"}</li>`).join("")}</ul>` : `<p>NONE EXTRACTED. No citation/reference list was fabricated from visual layout.</p>`}</section>`;
    }

    async handleClick(event) {
        const select = event.target.closest("[data-stud-document-select]");
        const importButton = event.target.closest("[data-stud-document-import]");
        const analyze = event.target.closest("[data-stud-document-analyze]");
        const cancel = event.target.closest("[data-stud-document-cancel]");
        const note = event.target.closest("[data-stud-document-note]");
        const revision = event.target.closest("[data-stud-document-revision]");
        const openPdf = event.target.closest("[data-stud-document-open-pdf]");
        if (!select && !importButton && !analyze && !cancel && !note && !revision && !openPdf) return false;
        try {
            if (select) await this.select(select.dataset.studDocumentSelect);
            else if (importButton) await this.importDocument({});
            else if (analyze) { this.state.busy = true; this.state.requestId = `document_${Date.now()}`; this.parent.render(); const result = await this.request("stud-document-analyze", {documentId: analyze.dataset.studDocumentAnalyze, requestId: this.state.requestId}); this.state.busy = false; this.state.requestId = null; await this.refresh(analyze.dataset.studDocumentAnalyze); this.showToast(this.parent.view, result.status === "CANCELLED" ? "DOCUMENT ANALYSIS CANCELLED" : "DOCUMENT EXTRACTION SAVED EXPLICITLY"); }
            else if (cancel) { await this.request("stud-document-cancel", {requestId: this.state.requestId}); }
            else if (note) { const value = await this.request("stud-document-create-note", {documentId: this.state.selectedId, chunkId: note.dataset.studDocumentNote}); this.showToast(this.parent.view, `NOTE CREATED · ${value.title}`); }
            else if (revision) { const value = await this.request("stud-document-create-revision", {documentId: this.state.selectedId, chunkId: revision.dataset.studDocumentRevision}); this.showToast(this.parent.view, `REVISION ITEM CREATED · ${value.title}`); }
            else if (openPdf) { const pdf = await this.request("stud-document-read-pdf", {documentId: openPdf.dataset.studDocumentOpenPdf}); if (this.parent.research && typeof this.parent.research.openPdfData === "function") await this.parent.research.openPdfData(pdf, {title: this.state.context.document.title, paperId: this.state.context.document.sourcePaperId || null, sourceType: "ACADEMIC_DOCUMENT", documentReference: pdf.reference}); }
        } catch (error) { this.state.busy = false; this.state.requestId = null; this.state.error = error.message || "DOCUMENT OPERATION FAILED"; if (this.parent) this.parent.render(); }
        return true;
    }

    async importDocument(context) {
        const saved = await this.request("stud-document-import-pdf", context);
        if (saved.cancelled) return true;
        await this.refresh(saved.document.id);
        this.showToast(this.parent.view, saved.deduplicated ? "EXISTING DOCUMENT SELECTED" : "LOCAL PDF IMPORTED");
        return true;
    }

    async handleSubmit(event) {
        const form = event.target.closest("[data-stud-document-import-form]");
        if (!form) return false;
        event.preventDefault();
        try {
            const data = new FormData(form);
            await this.importDocument({title: String(data.get("title") || "").trim() || undefined, documentType: data.get("documentType") || "UNKNOWN", courseId: data.get("courseId") || undefined, assignmentId: data.get("assignmentId") || undefined, sourcePaperId: data.get("sourcePaperId") || undefined, sourceResourceId: data.get("sourceResourceId") || undefined});
        } catch (error) { this.state.error = error.message || "DOCUMENT IMPORT FAILED"; if (this.parent) this.parent.render(); }
        return true;
    }
    handleChange() { return Promise.resolve(false); }
}

module.exports = {StudDocumentWorkspace};
