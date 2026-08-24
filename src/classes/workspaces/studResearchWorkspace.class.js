"use strict";

const RESEARCH_TABS = Object.freeze(["SEARCH", "LIBRARY", "CITATIONS"]);
const NOTE_EMPTY_DOCUMENT = Object.freeze({type: "doc", content: [{type: "paragraph"}]});

class StudBrowserStructuredEditor {
    constructor(host, content) {
        this.host = host;
        this.host.contentEditable = "true";
        this.host.classList.add("stud-editor-fallback");
        this.host.replaceChildren(this.renderNode(content || NOTE_EMPTY_DOCUMENT));
    }

    renderNode(node = {}) {
        if (node.type === "doc") {
            const fragment = document.createDocumentFragment();
            (node.content || []).forEach(child => fragment.appendChild(this.renderNode(child)));
            return fragment;
        }
        if (node.type === "text") {
            let value = document.createTextNode(String(node.text || ""));
            (node.marks || []).forEach(mark => {
                const wrapper = document.createElement(mark.type === "bold" ? "strong" : mark.type === "italic" ? "em" : mark.type === "link" ? "a" : "span");
                if (mark.type === "link" && /^https:\/\//i.test(String(mark.attrs && mark.attrs.href || ""))) wrapper.href = mark.attrs.href;
                wrapper.appendChild(value); value = wrapper;
            });
            return value;
        }
        const tags = {paragraph: "p", heading: `h${Math.max(1, Math.min(6, Number(node.attrs && node.attrs.level || 2)))}`, blockquote: "blockquote", bulletList: "ul", orderedList: "ol", listItem: "li", codeBlock: "pre", hardBreak: "br", table: "table", tableRow: "tr", tableHeader: "th", tableCell: "td"};
        const element = document.createElement(tags[node.type] || "p");
        if (["inlineMath", "blockMath"].includes(node.type)) {
            element.dataset.studMath = node.type;
            element.textContent = String(node.attrs && node.attrs.latex || "");
        } else (node.content || []).forEach(child => element.appendChild(this.renderNode(child)));
        return element;
    }

    serializeInline(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{type: "text", text: node.nodeValue}] : [];
        if (node.nodeType !== Node.ELEMENT_NODE) return [];
        if (node.tagName === "BR") return [{type: "hardBreak"}];
        const content = [...node.childNodes].flatMap(child => this.serializeInline(child));
        const mark = node.tagName === "STRONG" || node.tagName === "B" ? {type: "bold"}
            : node.tagName === "EM" || node.tagName === "I" ? {type: "italic"}
            : node.tagName === "A" && /^https:\/\//i.test(node.href) ? {type: "link", attrs: {href: node.href}}
            : null;
        return mark ? content.map(item => item.type === "text" ? {...item, marks: [...(item.marks || []), mark]} : item) : content;
    }

    serializeBlock(element) {
        const tag = element.tagName;
        if (tag === "UL" || tag === "OL") return {type: tag === "UL" ? "bulletList" : "orderedList", content: [...element.children].map(child => this.serializeBlock(child))};
        if (tag === "LI") return {type: "listItem", content: [{type: "paragraph", content: [...element.childNodes].flatMap(child => this.serializeInline(child))}]};
        if (tag === "BLOCKQUOTE") return {type: "blockquote", content: [{type: "paragraph", content: [...element.childNodes].flatMap(child => this.serializeInline(child))}]};
        if (tag === "PRE") return {type: "codeBlock", content: this.serializeInline(element)};
        if (/^H[1-6]$/.test(tag)) return {type: "heading", attrs: {level: Number(tag.slice(1))}, content: this.serializeInline(element)};
        if (tag === "TABLE") return {type: "table", content: [...element.rows].map(row => ({type: "tableRow", content: [...row.cells].map(cell => ({type: cell.tagName === "TH" ? "tableHeader" : "tableCell", content: [{type: "paragraph", content: this.serializeInline(cell)}]}))}))};
        return {type: "paragraph", content: this.serializeInline(element)};
    }

    getJSON() {
        const children = [...this.host.children];
        if (!children.length) return {type: "doc", content: [{type: "paragraph", content: this.serializeInline(this.host)}]};
        return {type: "doc", content: children.map(child => this.serializeBlock(child))};
    }

    getAttributes(name) {
        if (name !== "link") return {};
        const anchor = window.getSelection && window.getSelection().anchorNode;
        const element = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
        const link = element && element.closest ? element.closest("a") : null;
        return {href: link && link.href || ""};
    }

    chain() {
        const editor = this;
        const api = {
            focus() { editor.host.focus(); return api; },
            toggleBold() { document.execCommand("bold"); return api; },
            toggleItalic() { document.execCommand("italic"); return api; },
            toggleHeading() { document.execCommand("formatBlock", false, "h2"); return api; },
            toggleBulletList() { document.execCommand("insertUnorderedList"); return api; },
            toggleBlockquote() { document.execCommand("formatBlock", false, "blockquote"); return api; },
            toggleCodeBlock() { document.execCommand("formatBlock", false, "pre"); return api; },
            extendMarkRange() { return api; },
            setLink(attrs = {}) { document.execCommand("createLink", false, attrs.href); return api; },
            insertInlineMath(attrs = {}) { document.execCommand("insertText", false, `$${attrs.latex || ""}$`); return api; },
            insertBlockMath(attrs = {}) { document.execCommand("insertText", false, `\n$$${attrs.latex || ""}$$\n`); return api; },
            insertTable() { document.execCommand("insertHTML", false, "<table><tr><th></th><th></th><th></th></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></table>"); return api; },
            insertContent(value) { document.execCommand("insertText", false, String(value || "")); return api; },
            run() { return true; }
        };
        return api;
    }

    destroy() { this.host.removeAttribute("contenteditable"); }
}

class StudResearchWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.toast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {
            status: null, tab: "SEARCH", busy: false, requestId: "", error: "",
            results: [], selectedResult: null, library: [], selectedPaperId: "", paperContext: null,
            oa: null, oaPdfToken: null, notes: [], selectedNoteId: "", citationStyle: "apa",
            citationPaperIds: [], citationOutput: null, zotero: {state: "NOT CHECKED", items: []},
            notePaperId: "", noteSelection: null
        };
        this.editor = null;
        this.pdf = null;
        this.pdfPage = 1;
        this.pdfScale = 1.15;
        this.pdfText = [];
        this.pdfContext = null;
        this.requestGeneration = 0;
    }

    async initialize() {
        const [status, library, notes] = await Promise.all([
            this.request("stud-research-status"),
            this.request("stud-research-library", {limit: 250}),
            this.request("stud-entity-list", {entityType: "NOTE", limit: 250})
        ]);
        this.state.status = status;
        this.state.library = library;
        this.state.notes = notes;
        return this.state;
    }

    disposeEditor() {
        if (this.editor && typeof this.editor.destroy === "function") this.editor.destroy();
        this.editor = null;
    }

    deactivate() {
        const requestId = this.state.requestId;
        this.requestGeneration += 1;
        this.state.requestId = "";
        this.state.busy = false;
        if (requestId) void this.request("stud-research-cancel", {requestId}).catch(() => {});
    }

    scriptJson(value) {
        return JSON.stringify(value)
            .replace(/&/g, "\\u0026")
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029");
    }

    setTab(tab) {
        if (!RESEARCH_TABS.includes(tab)) return;
        this.disposeEditor();
        this.state.tab = tab;
        this.parent.render();
    }

    providerBadge(provider) {
        const policy = this.state.status && this.state.status.policies && this.state.status.policies[provider];
        const state = this.state.status && this.state.status.providers && this.state.status.providers[provider];
        return `<span class="stud-provider-badge ${state === "READY" ? "ready" : "not-configured"}">${this.escape(provider)} · ${this.escape(policy && policy.costModel || "LOCAL")} · ${this.escape(state || "UNKNOWN")}</span>`;
    }

    renderResearch() {
        const toolbar = `<nav class="stud-research-tabs" aria-label="Research views">${RESEARCH_TABS.map(tab => `<button type="button" data-stud-research-tab="${tab}"${this.state.tab === tab ? " class=\"active\" aria-current=\"page\"" : ""}>${tab}</button>`).join("")}</nav>`;
        const body = this.state.tab === "SEARCH" ? this.renderSearch() : this.state.tab === "LIBRARY" ? this.renderLibrary() : this.renderCitations();
        return `<section class="stud-research-shell"><header class="stud-section-title"><div><small>STUD / RESEARCH</small><h2>ACADEMIC RESEARCH DESK</h2><p>Explicit discovery, canonical local storage, legal open-access resolution and standards-based citations.</p></div><span>EPHEMERAL SEARCH → EXPLICIT SAVE</span></header>${toolbar}${this.state.error ? `<div class="stud-research-error" role="status">${this.escape(this.state.error)}</div>` : ""}${body}</section>`;
    }

    renderSearch() {
        const selected = this.state.selectedResult;
        const providers = `<div class="stud-provider-strip">${["OPENALEX", "CROSSREF", "DATACITE", "UNPAYWALL"].map(provider => this.providerBadge(provider)).join("")}</div>`;
        const courseOptions = this.parent.state.courses.map(item => `<option value="${this.escape(item.id)}">${this.escape(item.code || item.shortName || item.title)}</option>`).join("");
        const assignmentOptions = this.parent.state.assignments.map(item => `<option value="${this.escape(item.id)}">${this.escape(item.title)}</option>`).join("");
        return `${providers}<div class="stud-research-grid">
            <article class="workspace-panel stud-research-query"><header><h2>DISCOVERY</h2><span>OPENALEX / EXPLICIT</span></header><div class="workspace-panel-content">
                <form data-stud-research-form="OPENALEX" class="stud-provider-form"><label>QUERY<input class="aegis-input" name="query" maxlength="240" required placeholder="Search scholarly works"></label><label>YEAR<input class="aegis-input" name="year" type="number" min="1000" max="3000"></label><button type="submit">SEARCH</button>${this.state.busy ? `<button type="button" data-stud-research-cancel>CANCEL</button>` : ""}</form>
                <form data-stud-research-form="DOI" class="stud-provider-form stud-doi-form"><label>DOI<input class="aegis-input" name="doi" maxlength="300" required placeholder="10.xxxx/... (Crossref / DataCite)"></label><button type="submit" name="provider" value="CROSSREF">RESOLVE CROSSREF</button><button type="submit" name="provider" value="DATACITE">RESOLVE DATACITE</button></form>
                <div class="stud-paper-results">${this.state.results.length ? this.state.results.map((result, index) => this.paperRow(result.work, `data-stud-result-index="${index}"`, selected === result ? "selected" : "")).join("") : `<div class="stud-empty-inline">NO EPHEMERAL RESULTS. OPENALEX REQUIRES ITS CURRENT FREE API KEY; DOI RESOLUTION REMAINS AVAILABLE THROUGH CROSSREF AND DATACITE.</div>`}</div>
            </div></article>
            <article class="workspace-panel stud-paper-detail"><header><h2>NORMALIZED RESULT</h2><span>${selected ? this.escape(selected.work.provider) : "NO SELECTION"}</span></header><div class="workspace-panel-content">${selected ? this.renderEphemeralDetail(selected, courseOptions, assignmentOptions) : `<div class="stud-empty-inline">SELECT A RESULT. NOTHING IS STORED UNTIL SAVE TO LIBRARY.</div>`}</div></article>
        </div>`;
    }

    paperRow(paper, attributes = "", className = "") {
        const authors = this.authorText(paper.authors);
        return `<button type="button" class="stud-paper-row ${className}" ${attributes}><strong>${this.escape(paper.title)}</strong><span>${this.escape(authors || "AUTHORS UNKNOWN")}</span><small>${this.escape(paper.year || "YEAR UNKNOWN")} · ${this.escape(paper.venue || paper.objectType || "SOURCE UNKNOWN")} · ${paper.doi ? `DOI ${this.escape(paper.doi)}` : "DOI UNAVAILABLE"}</small></button>`;
    }

    authorText(authors) {
        if (Array.isArray(authors)) return authors.map(item => item.displayName || item).filter(Boolean).slice(0, 20).join("; ");
        return String(authors || "");
    }

    renderEphemeralDetail(result, courseOptions, assignmentOptions) {
        const paper = result.work;
        return `<div class="stud-paper-heading"><small>${this.escape(paper.objectType)} · ${this.escape(paper.provider)}</small><h3>${this.escape(paper.title)}</h3><p>${this.escape(this.authorText(paper.authors) || "AUTHORS UNKNOWN")}</p></div>
            <dl class="stud-paper-metadata"><div><dt>YEAR</dt><dd>${this.escape(paper.year || "UNKNOWN")}</dd></div><div><dt>VENUE</dt><dd>${this.escape(paper.venue || "UNKNOWN")}</dd></div><div><dt>DOI</dt><dd>${this.escape(paper.doi || "UNAVAILABLE")}</dd></div><div><dt>OA SIGNAL</dt><dd>${paper.oa ? (paper.oa.isOpenAccess ? "OPEN ACCESS OBSERVED" : "NOT OBSERVED") : "NOT CHECKED"}</dd></div></dl>
            ${paper.abstract ? `<section class="stud-paper-abstract"><h3>ABSTRACT</h3><p>${this.escape(paper.abstract)}</p></section>` : `<div class="stud-empty-inline">ABSTRACT UNAVAILABLE · NO TEXT HAS BEEN FABRICATED.</div>`}
            <form data-stud-research-form="SAVE" data-stud-result-token="${this.escape(result.token)}" class="stud-save-context"><label>MODULE<select class="aegis-select" name="courseId"><option value="">NO MODULE LINK</option>${courseOptions}</select></label><label>ASSIGNMENT<select class="aegis-select" name="assignmentId"><option value="">NO ASSIGNMENT LINK</option>${assignmentOptions}</select></label><button type="submit">SAVE TO LOCAL LIBRARY</button></form>`;
    }

    renderLibrary() {
        const paper = this.state.paperContext && this.state.paperContext.paper;
        return `<div class="stud-library-grid">
            <article class="workspace-panel stud-library-list"><header><h2>LOCAL LIBRARY</h2><span>${this.state.library.length} SAVED</span></header><div class="workspace-panel-content"><div class="stud-paper-results">${this.state.library.length ? this.state.library.map(item => this.paperRow(item, `data-stud-paper-id="${this.escape(item.id)}"`, item.id === this.state.selectedPaperId ? "selected" : "")).join("") : `<div class="stud-empty-inline">NO SAVED RESEARCH OBJECTS. THE LIBRARY REMAINS FULLY LOCAL AND OFFLINE.</div>`}</div></div></article>
            <article class="workspace-panel stud-library-detail"><header><h2>PAPER DETAIL</h2><span>CANONICAL / PROVENANCE</span></header><div class="workspace-panel-content">${paper ? this.renderSavedPaper(this.state.paperContext) : `<div class="stud-empty-inline">SELECT A SAVED PAPER TO INSPECT IDENTIFIERS, SOURCES, PDF, NOTES AND CITATIONS.</div>`}</div></article>
        </div>`;
    }

    renderSavedPaper(context) {
        const paper = context.paper;
        let oa = null, doc = null;
        try { oa = paper.oaJson && JSON.parse(paper.oaJson); } catch (error) {}
        try { doc = paper.documentMetadataJson && JSON.parse(paper.documentMetadataJson); } catch (error) {}
        return `<div class="stud-paper-heading"><small>${this.escape(paper.objectType || "ARTICLE")} · LOCAL CANONICAL OBJECT</small><h3>${this.escape(paper.title)}</h3><p>${this.escape(paper.authors || "AUTHORS UNKNOWN")}</p></div>
            <dl class="stud-paper-metadata"><div><dt>YEAR</dt><dd>${this.escape(paper.year || "UNKNOWN")}</dd></div><div><dt>DOI</dt><dd>${this.escape(paper.doi || "UNAVAILABLE")}</dd></div><div><dt>VENUE</dt><dd>${this.escape(paper.venue || "UNKNOWN")}</dd></div><div><dt>LOCAL PDF</dt><dd>${doc ? `${this.escape(doc.displayName || "MANAGED PDF")} · ${Math.round((doc.size || 0) / 1024)} KB` : "NOT ATTACHED"}</dd></div></dl>
            <div class="stud-detail-actions"><button type="button" data-stud-find-oa="${this.escape(paper.id)}"${paper.doi ? "" : " disabled title=\"DOI required\""}>FIND OPEN ACCESS</button><button type="button" data-stud-import-pdf="${this.escape(paper.id)}">SELECT LOCAL PDF</button>${paper.localDocumentReference ? `<button type="button" data-stud-open-pdf="${this.escape(paper.id)}">OPEN PDF</button>` : ""}<button type="button" data-stud-paper-note="${this.escape(paper.id)}">CREATE NOTE</button><button type="button" data-stud-paper-revision="${this.escape(paper.id)}">CREATE REVISION</button><button type="button" data-stud-paper-cite="${this.escape(paper.id)}">CITE</button></div>
            ${oa ? this.renderOa(oa) : `<section class="stud-oa-panel"><h3>OPEN ACCESS</h3><p>NOT CHECKED · UNPAYWALL LOOKUP IS EXPLICIT AND REQUIRES PRIVATE LOCAL CONFIGURATION.</p></section>`}
            ${paper.abstract ? `<section class="stud-paper-abstract"><h3>ABSTRACT</h3><p>${this.escape(paper.abstract)}</p></section>` : ""}
            <section class="stud-provenance-ledger"><header><h3>FIELD PROVENANCE</h3><span>${context.provenance.length} OBSERVATIONS</span></header>${context.provenance.length ? context.provenance.slice(0, 40).map(item => `<article><strong>${this.escape(item.field)}</strong><span>${this.escape(item.observedValue || "ABSENT")}</span><small>${this.escape(item.sourceId || item.sourceType)} · ${this.escape(item.sourceAuthority)}</small></article>`).join("") : `<p>NO PROVIDER OBSERVATIONS STORED.</p>`}</section>`;
    }

    renderOa(oa) {
        const best = oa.bestLocation;
        return `<section class="stud-oa-panel"><header><h3>LEGAL OPEN ACCESS</h3><span>${oa.isOpenAccess ? "AVAILABLE" : "NOT FOUND"}</span></header><p>${this.escape(oa.oaStatus || "UNKNOWN")} ${best ? `· ${this.escape(best.hostType || "HOST UNKNOWN")} · ${this.escape(best.version || "VERSION UNKNOWN")} · ${this.escape(best.license || "LICENSE UNKNOWN")}` : ""}</p>${this.state.oaPdfToken ? `<div class="stud-detail-actions"><button type="button" data-stud-open-oa-pdf>OPEN OA PDF</button><button type="button" data-stud-save-oa-pdf>EXPLICITLY SAVE OA PDF</button></div>` : ""}</section>`;
    }

    renderCitations() {
        const selected = new Set(this.state.citationPaperIds);
        return `<div class="stud-citation-grid"><article class="workspace-panel"><header><h2>CITATION SET</h2><span>CANONICAL PAPERS</span></header><div class="workspace-panel-content"><form data-stud-research-form="CITATION" class="stud-citation-form"><label>CSL STYLE<select class="aegis-select" name="style">${[["apa","APA"],["harvard1","HARVARD · CITE THEM RIGHT"],["vancouver","VANCOUVER"]].map(([value,label]) => `<option value="${value}"${this.state.citationStyle === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><div class="stud-citation-papers">${this.state.library.map(paper => `<label><input type="checkbox" name="paperIds" value="${this.escape(paper.id)}"${selected.has(paper.id) ? " checked" : ""}><span>${this.escape(paper.title)}</span></label>`).join("") || `<div class="stud-empty-inline">SAVE PAPERS TO THE LOCAL LIBRARY FIRST.</div>`}</div><button type="submit">GENERATE BIBLIOGRAPHY</button></form></div></article><article class="workspace-panel"><header><h2>BIBLIOGRAPHY OUTPUT</h2><span>CSL / LOCAL</span></header><div class="workspace-panel-content">${this.state.citationOutput ? `<section class="stud-citation-output"><h3>${this.escape(this.state.citationOutput.style.toUpperCase())}</h3><pre>${this.escape(this.state.citationOutput.bibliography)}</pre><div class="stud-detail-actions"><button type="button" data-stud-copy-output="bibliography">COPY CITATION</button><button type="button" data-stud-copy-output="bibtex">COPY BIBTEX</button><button type="button" data-stud-copy-output="cslJson">COPY CSL-JSON</button></div></section>` : `<div class="stud-empty-inline">SELECT SAVED PAPERS. FORMATTING IS LOCAL AND USES BUNDLED CSL RESOURCES; NO METADATA IS INVENTED.</div>`}</div></article></div>`;
    }

    renderNotes() {
        const note = this.state.notes.find(item => item.id === this.state.selectedNoteId) || null;
        let document = NOTE_EMPTY_DOCUMENT;
        if (note && note.documentJson) { try { document = JSON.parse(note.documentJson); } catch (error) {} }
        if (!note && this.state.noteSelection) document = {type: "doc", content: [{type: "blockquote", content: [{type: "paragraph", content: [{type: "text", text: this.state.noteSelection.excerpt}]}]}, {type: "paragraph", content: [{type: "text", text: "Analyst / student note: "}]}]};
        const selectedPaperId = this.state.notePaperId || "";
        return `<section class="stud-notes-shell"><header class="stud-section-title"><div><small>STUD / NOTES</small><h2>STRUCTURED ACADEMIC NOTES</h2><p>Local ProseMirror-compatible document model with explicit paper, module and assignment relationships.</p></div><span>LOCAL / EXPLICIT SAVE</span></header><div class="stud-notes-grid"><article class="workspace-panel"><header><h2>NOTES</h2><span>${this.state.notes.length} LOCAL</span></header><div class="workspace-panel-content"><button type="button" data-stud-new-note>NEW NOTE</button><div class="stud-note-list">${this.state.notes.map(item => `<button type="button" class="${item.id === this.state.selectedNoteId ? "selected" : ""}" data-stud-note-id="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><small>${this.escape(item.content || "EMPTY NOTE")}</small></button>`).join("") || `<div class="stud-empty-inline">NO NOTES YET.</div>`}</div></div></article><article class="workspace-panel stud-note-editor-panel"><header><h2>NOTE EDITOR</h2><span>BROWSER STRUCTURED / JSON V1</span></header><div class="workspace-panel-content"><form data-stud-research-form="NOTE" data-stud-note-id="${this.escape(note && note.id || "")}" class="stud-note-form"><div class="stud-editor-fields"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required value="${this.escape(note && note.title || (this.state.noteSelection ? "Quoted document observation" : "New academic note"))}"></label><label>MODULE<select class="aegis-select" name="courseId"><option value="">NO MODULE</option>${this.parent.state.courses.map(item => `<option value="${this.escape(item.id)}"${note && note.courseId === item.id ? " selected" : ""}>${this.escape(item.code || item.title)}</option>`).join("")}</select></label><label>ASSIGNMENT<select class="aegis-select" name="assignmentId"><option value="">NO ASSIGNMENT</option>${this.parent.state.assignments.map(item => `<option value="${this.escape(item.id)}"${note && note.assignmentId === item.id ? " selected" : ""}>${this.escape(item.title)}</option>`).join("")}</select></label><label>PAPER<select class="aegis-select" name="paperId"><option value="">NO PAPER LINK</option>${this.state.library.map(item => `<option value="${this.escape(item.id)}"${selectedPaperId === item.id ? " selected" : ""}>${this.escape(item.title)}</option>`).join("")}</select></label></div><div class="stud-note-toolbar" role="toolbar" aria-label="Note formatting"><button type="button" data-stud-editor-command="bold">BOLD</button><button type="button" data-stud-editor-command="italic">ITALIC</button><button type="button" data-stud-editor-command="heading">HEADING</button><button type="button" data-stud-editor-command="bulletList">LIST</button><button type="button" data-stud-editor-command="blockquote">QUOTE</button><button type="button" data-stud-editor-command="codeBlock">CODE</button><button type="button" data-stud-editor-command="link">LINK</button><button type="button" data-stud-editor-command="inlineMath">MATH</button><button type="button" data-stud-editor-command="blockMath">DISPLAY MATH</button><button type="button" data-stud-editor-command="table">TABLE</button><button type="button" data-stud-insert-citation>CITATION</button></div>${this.state.noteSelection ? `<div class="stud-selection-provenance">QUOTE · PAGE ${this.state.noteSelection.page} · SHA-256 ${this.escape(this.state.noteSelection.selectionTextHash.slice(0, 16))}… · SOURCE TEXT REMAINS DISTINCT FROM STUDENT NOTE</div>` : ""}<div class="stud-tiptap-editor" data-stud-editor aria-label="Structured note editor"></div><script type="application/json" data-stud-note-document>${this.scriptJson(document)}</script><div class="stud-detail-actions"><button type="submit">SAVE STRUCTURED NOTE</button>${note ? `<button type="button" data-stud-note-revision="${this.escape(note.id)}">CREATE REVISION</button>` : ""}</div></form></div></article></div></section>`;
    }

    renderServices() {
        const state = this.state.zotero.state;
        return `<section class="stud-services-shell"><header class="stud-section-title"><div><small>STUD / CONNECTED SERVICES</small><h2>ACADEMIC SERVICES</h2><p>Optional local interoperability. Core STUD workflows never require an account or subscription.</p></div><span>PARTIALLY ACTIVE</span></header><article class="workspace-panel stud-zotero-panel"><header><h2>ZOTERO LOCAL</h2><span>${this.escape(state)}</span></header><div class="workspace-panel-content"><p>The official Zotero local API is detected on 127.0.0.1 only. Current write operations are not supported, so Aegis offers bounded read/import without pretending it can push items.</p><div class="stud-detail-actions"><button type="button" data-stud-zotero-check>HEALTH CHECK</button>${state === "AVAILABLE_LOCAL" ? `<button type="button" data-stud-zotero-list>READ LOCAL ITEMS</button>` : ""}</div><div class="stud-zotero-items">${this.state.zotero.items.map((item,index) => `<article><strong>${this.escape(item.work.title)}</strong><small>${this.escape(this.authorText(item.work.authors) || "AUTHORS UNKNOWN")}</small><button type="button" data-stud-zotero-import="${index}">IMPORT SELECTED METADATA</button></article>`).join("")}</div></div></article><article class="workspace-panel stud-service-policy"><header><h2>SERVICE POLICY</h2><span>NO HARD DEPENDENCY</span></header><div class="workspace-panel-content"><p>Calendar and Email remain explicit identifier references only. Moodle is a separately configured, capability-driven read-only provider; Zotero metadata stays externally owned; STUD stores only canonical selected objects and stable external identifiers.</p></div></article></section>`;
    }

    async afterRender(view) {
        if (view === "NOTES") await this.mountEditor();
    }

    async mountEditor() {
        const host = this.parent.view.querySelector("[data-stud-editor]");
        const payload = this.parent.view.querySelector("[data-stud-note-document]");
        if (!host || !payload) return;
        let content = NOTE_EMPTY_DOCUMENT;
        try { content = JSON.parse(payload.textContent); } catch (error) {}
        // TipTap's CommonJS entry point previously depended on renderer Node.
        // This browser-native adapter preserves the bounded structured-document
        // contract and toolbar without reintroducing module or filesystem access.
        this.editor = new StudBrowserStructuredEditor(host, content);
    }

    async handleClick(event) {
        const tab = event.target.closest("[data-stud-research-tab]");
        const result = event.target.closest("[data-stud-result-index]");
        const paper = event.target.closest("[data-stud-paper-id]");
        const note = event.target.closest("[data-stud-note-id]");
        if (tab) { this.setTab(tab.dataset.studResearchTab); return true; }
        if (result) { this.state.selectedResult = this.state.results[Number(result.dataset.studResultIndex)] || null; this.parent.render(); return true; }
        if (paper) { await this.selectPaper(paper.dataset.studPaperId); return true; }
        if (note) { this.disposeEditor(); this.state.selectedNoteId = note.dataset.studNoteId; this.state.noteSelection = null; this.state.notePaperId = ""; this.parent.render(); return true; }
        if (event.target.closest("[data-stud-new-note]")) { this.disposeEditor(); this.state.selectedNoteId = ""; this.state.noteSelection = null; this.state.notePaperId = ""; this.parent.render(); return true; }
        if (event.target.closest("[data-stud-research-cancel]")) { await this.cancel(); return true; }
        const oa = event.target.closest("[data-stud-find-oa]"); if (oa) { await this.findOa(oa.dataset.studFindOa); return true; }
        const importPdf = event.target.closest("[data-stud-import-pdf]"); if (importPdf) { await this.importPdf(importPdf.dataset.studImportPdf); return true; }
        const openPdf = event.target.closest("[data-stud-open-pdf]"); if (openPdf) { await this.openPdf(openPdf.dataset.studOpenPdf); return true; }
        if (event.target.closest("[data-stud-open-oa-pdf]")) { await this.openOaPdf(); return true; }
        if (event.target.closest("[data-stud-save-oa-pdf]")) { await this.saveOaPdf(); return true; }
        const paperNote = event.target.closest("[data-stud-paper-note]"); if (paperNote) { this.state.selectedNoteId = ""; this.state.noteSelection = null; this.state.notePaperId = paperNote.dataset.studPaperNote; this.parent.setActiveView("NOTES"); return true; }
        const paperRevision = event.target.closest("[data-stud-paper-revision]"); if (paperRevision) { const selected = this.state.library.find(item => item.id === paperRevision.dataset.studPaperRevision); this.parent.revision.dialog("CREATE", paperRevision, {sourceType: "RESEARCH_PAPER", sourceId: paperRevision.dataset.studPaperRevision, title: selected && `Revision: ${selected.title}`}); return true; }
        const noteRevision = event.target.closest("[data-stud-note-revision]"); if (noteRevision) { const selected = this.state.notes.find(item => item.id === noteRevision.dataset.studNoteRevision); this.parent.revision.dialog("CREATE", noteRevision, {sourceType: "NOTE", sourceId: noteRevision.dataset.studNoteRevision, courseId: selected && selected.courseId, assignmentId: selected && selected.assignmentId, title: selected && `Revision: ${selected.title}`}); return true; }
        const cite = event.target.closest("[data-stud-paper-cite]"); if (cite) { this.state.citationPaperIds = [cite.dataset.studPaperCite]; this.state.tab = "CITATIONS"; this.parent.setActiveView("RESEARCH"); return true; }
        const command = event.target.closest("[data-stud-editor-command]"); if (command) { this.editorCommand(command.dataset.studEditorCommand); return true; }
        if (event.target.closest("[data-stud-insert-citation]")) { this.insertCitation(); return true; }
        const copy = event.target.closest("[data-stud-copy-output]"); if (copy) { await this.copyOutput(copy.dataset.studCopyOutput); return true; }
        if (event.target.closest("[data-stud-zotero-check]")) { await this.zoteroCheck(); return true; }
        if (event.target.closest("[data-stud-zotero-list]")) { await this.zoteroList(); return true; }
        const zoteroImport = event.target.closest("[data-stud-zotero-import]"); if (zoteroImport) { await this.zoteroImport(Number(zoteroImport.dataset.studZoteroImport)); return true; }
        const pdfControl = event.target.closest("[data-stud-pdf-action]"); if (pdfControl) { await this.pdfAction(pdfControl.dataset.studPdfAction); return true; }
        return false;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-research-form]");
        if (!form) return false;
        event.preventDefault();
        const kind = form.dataset.studResearchForm;
        const values = Object.fromEntries(new FormData(form).entries());
        try {
            if (kind === "OPENALEX") await this.search(values);
            else if (kind === "DOI") await this.resolveDoi(values, event.submitter && event.submitter.value || "CROSSREF");
            else if (kind === "SAVE") await this.saveResult(form.dataset.studResultToken, values);
            else if (kind === "CITATION") await this.generateCitation(form);
            else if (kind === "NOTE") await this.saveNote(form, values);
        } catch (error) { this.state.error = error.message || "STUD research operation failed."; this.parent.render(); }
        return true;
    }

    async runRequest(channel, payload) {
        const generation = ++this.requestGeneration;
        const requestId = `stud_ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        this.state.busy = true; this.state.error = ""; this.state.requestId = requestId;
        try {
            const result = await this.request(channel, {...payload, requestId});
            return this.requestGeneration === generation ? result : null;
        } catch (error) {
            if (this.requestGeneration !== generation) return null;
            throw error;
        } finally {
            if (this.requestGeneration === generation) {
                this.state.busy = false;
                this.state.requestId = "";
            }
        }
    }

    async search(values) { const results = await this.runRequest("stud-research-search", {query: values.query, year: values.year || null, limit: 15}); if (!results) return; this.state.results = results; this.state.selectedResult = results[0] || null; this.parent.render(); }
    async resolveDoi(values, provider) { const result = await this.runRequest(provider === "DATACITE" ? "stud-research-resolve-datacite" : "stud-research-resolve-crossref", {doi: values.doi}); if (!result) return; this.state.results = [result]; this.state.selectedResult = result; this.parent.render(); }
    async cancel() { const requestId = this.state.requestId; this.requestGeneration += 1; this.state.requestId = ""; this.state.busy = false; if (requestId) await this.request("stud-research-cancel", {requestId}); }
    async saveResult(token, values) { const saved = await this.request("stud-research-save", {token, courseId: values.courseId || null, assignmentId: values.assignmentId || null}); await this.refreshLibrary(); this.state.selectedPaperId = saved.paper.id; this.state.tab = "LIBRARY"; await this.selectPaper(saved.paper.id); this.toast(this.parent.view, saved.deduplicated ? "EXISTING CANONICAL PAPER LINKED" : "PAPER SAVED TO LOCAL LIBRARY"); }
    async refreshLibrary() { this.state.library = await this.request("stud-research-library", {limit: 250}); this.state.notes = await this.request("stud-entity-list", {entityType: "NOTE", limit: 250}); }
    async selectPaper(id) { this.state.selectedPaperId = id; this.state.paperContext = await this.request("stud-research-context", {paperId: id}); this.state.oa = null; this.state.oaPdfToken = null; this.parent.render(); }
    async findOa(id) { const paper = this.state.library.find(item => item.id === id); const result = await this.runRequest("stud-research-open-access", {doi: paper && paper.doi}); if (!result) return; this.state.oa = result.oa; this.state.oaPdfToken = result.pdfToken; await this.request("stud-paper-set-oa", {paperId: id, oa: result.oa}); await this.selectPaper(id); this.state.oaPdfToken = result.pdfToken; this.parent.render(); }
    async importPdf(id) { const result = await this.request("stud-paper-import-pdf", {paperId: id}); if (!result.cancelled) { await this.refreshLibrary(); await this.selectPaper(id); this.toast(this.parent.view, "MANAGED LOCAL PDF ATTACHED"); } }
    async saveOaPdf() { const id = this.state.selectedPaperId; const result = await this.runRequest("stud-paper-save-oa-pdf", {paperId: id, pdfToken: this.state.oaPdfToken}); if (!result) return; await this.refreshLibrary(); await this.selectPaper(id); this.toast(this.parent.view, "LEGAL OA PDF SAVED LOCALLY"); }

    async openPdf(id) {
        const data = await this.request("stud-paper-read-pdf", {paperId: id});
        await this.openPdfData(data, {paperId: id, sourceType: "LOCAL_DOCUMENT", documentReference: data.reference});
    }

    async openOaPdf() {
        const data = await this.runRequest("stud-paper-read-oa-pdf", {pdfToken: this.state.oaPdfToken});
        if (!data) return;
        await this.openPdfData(data, {paperId: this.state.selectedPaperId, sourceType: "OA_DOCUMENT", documentReference: data.reference});
    }

    async openPdfData(data, context) {
        const dialog = this.parent.view.querySelector("[data-stud-dialog-element]");
        dialog.querySelector("#stud_dialog_title").textContent = "ACADEMIC PDF VIEWER";
        const selectionAction = context && context.paperId ? `<button type="button" data-stud-pdf-action="NOTE_SELECTION">CREATE NOTE FROM SELECTION</button>` : "";
        dialog.querySelector("[data-stud-dialog-body]").innerHTML = `<div class="stud-pdf-viewer"><nav><button type="button" data-stud-pdf-action="PREV">PREV</button><span data-stud-pdf-state>LOADING</span><button type="button" data-stud-pdf-action="NEXT">NEXT</button><button type="button" data-stud-pdf-action="ZOOM_OUT">−</button><button type="button" data-stud-pdf-action="ZOOM_IN">+</button><label>SEARCH<input class="aegis-input" data-stud-pdf-search maxlength="120"></label><button type="button" data-stud-pdf-action="SEARCH">FIND</button>${selectionAction}</nav><div class="stud-pdf-stage"><canvas data-stud-pdf-canvas></canvas><div class="stud-pdf-text" data-stud-pdf-text aria-label="Selectable PDF text layer"></div></div></div>`;
        if (!dialog.open) dialog.showModal();
        const pdfjs = await import("../../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", window.location.href).href;
        const bytes = Uint8Array.from(atob(data.bytesBase64), char => char.charCodeAt(0));
        this.pdf = await pdfjs.getDocument({data: bytes, isEvalSupported: false, useSystemFonts: true}).promise;
        this.pdfContext = {...context, sha256: data.sha256 || ""};
        this.pdfText = [];
        this.pdfPage = 1; this.pdfScale = 1.15; await this.renderPdfPage();
    }

    async renderPdfPage() {
        if (!this.pdf) return;
        const page = await this.pdf.getPage(this.pdfPage);
        const viewport = page.getViewport({scale: this.pdfScale});
        const canvas = this.parent.view.querySelector("[data-stud-pdf-canvas]");
        const textHost = this.parent.view.querySelector("[data-stud-pdf-text]");
        if (!canvas || !textHost) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d"); context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({canvasContext: context, viewport}).promise;
        const textContent = await page.getTextContent();
        this.pdfText[this.pdfPage - 1] = textContent.items.map(item => item.str).join(" ");
        textHost.textContent = this.pdfText[this.pdfPage - 1];
        const state = this.parent.view.querySelector("[data-stud-pdf-state]"); if (state) state.textContent = `PAGE ${this.pdfPage} / ${this.pdf.numPages} · ${Math.round(this.pdfScale * 100)}%`;
    }

    async pdfAction(action) {
        if (!this.pdf) return;
        if (action === "NOTE_SELECTION") {
            const textHost = this.parent.view.querySelector("[data-stud-pdf-text]");
            const selection = window.getSelection();
            const anchor = selection && selection.anchorNode;
            const excerpt = String(selection && selection.toString() || "").trim().slice(0, 4000);
            if (!excerpt || !textHost || !anchor || !textHost.contains(anchor)) return this.toast(this.parent.view, "SELECT TEXT IN THE PDF TEXT LAYER FIRST");
            this.state.notePaperId = this.pdfContext && this.pdfContext.paperId || "";
            this.state.noteSelection = {
                sourceType: this.pdfContext && this.pdfContext.sourceType || "LOCAL_DOCUMENT",
                paperId: this.state.notePaperId,
                documentReference: this.pdfContext && this.pdfContext.documentReference || null,
                page: this.pdfPage,
                selectionTextHash: window.AegisRendererRuntime.sha256Text(excerpt),
                excerpt,
                createdAt: new Date().toISOString()
            };
            const dialog = this.parent.view.querySelector("[data-stud-dialog-element]");
            if (dialog && dialog.open) dialog.close();
            this.state.selectedNoteId = "";
            this.parent.setActiveView("NOTES");
            return;
        }
        if (action === "PREV") this.pdfPage = Math.max(1, this.pdfPage - 1);
        if (action === "NEXT") this.pdfPage = Math.min(this.pdf.numPages, this.pdfPage + 1);
        if (action === "ZOOM_OUT") this.pdfScale = Math.max(.55, this.pdfScale - .15);
        if (action === "ZOOM_IN") this.pdfScale = Math.min(2.5, this.pdfScale + .15);
        if (action === "SEARCH") {
            const term = String(this.parent.view.querySelector("[data-stud-pdf-search]")?.value || "").trim().toLowerCase();
            if (term) {
                for (let pageNumber = 1; pageNumber <= this.pdf.numPages; pageNumber++) {
                    if (!this.pdfText[pageNumber - 1]) { const page = await this.pdf.getPage(pageNumber); const text = await page.getTextContent(); this.pdfText[pageNumber - 1] = text.items.map(item => item.str).join(" "); }
                    if (this.pdfText[pageNumber - 1].toLowerCase().includes(term)) { this.pdfPage = pageNumber; break; }
                }
            }
        }
        await this.renderPdfPage();
    }

    editorCommand(command) {
        if (!this.editor) return;
        const chain = this.editor.chain().focus();
        if (command === "bold") chain.toggleBold().run();
        else if (command === "italic") chain.toggleItalic().run();
        else if (command === "heading") chain.toggleHeading({level: 2}).run();
        else if (command === "bulletList") chain.toggleBulletList().run();
        else if (command === "blockquote") chain.toggleBlockquote().run();
        else if (command === "codeBlock") chain.toggleCodeBlock().run();
        else if (command === "link") {
            const current = this.editor.getAttributes("link").href || "https://";
            const value = window.prompt("Public HTTPS link", current);
            if (value === null) return;
            try {
                const url = new URL(value);
                if (url.protocol !== "https:") throw new Error("HTTPS required");
                chain.extendMarkRange("link").setLink({href: url.href}).run();
            } catch (error) { this.toast(this.parent.view, "ONLY VALID PUBLIC HTTPS LINKS ARE ALLOWED"); }
        }
        else if (command === "inlineMath") chain.insertInlineMath({latex: "F = ma"}).run();
        else if (command === "blockMath") chain.insertBlockMath({latex: "E = mc^2"}).run();
        else if (command === "table") chain.insertTable({rows: 3, cols: 3, withHeaderRow: true}).run();
    }

    insertCitation() {
        const paperId = this.state.notePaperId || this.state.library[0]?.id;
        const paper = this.state.library.find(item => item.id === paperId);
        if (!paper || !this.editor) return this.toast(this.parent.view, "SELECT A SAVED PAPER FIRST");
        const marker = ` [${(paper.authors || "Author").split(/[;,]/)[0]}, ${paper.year || "n.d."}] `;
        this.editor.chain().focus().insertContent(marker).run();
        this.state.notePaperId = paper.id;
    }

    async saveNote(form, values) {
        let document = NOTE_EMPTY_DOCUMENT;
        if (this.editor) document = this.editor.getJSON();
        else { const text = form.querySelector("[data-stud-editor]")?.textContent || ""; document = {type: "doc", content: [{type: "paragraph", content: [{type: "text", text}]}]}; }
        const paperIds = [...new Set([values.paperId, this.state.notePaperId].filter(Boolean))];
        const note = await this.request("stud-note-save-structured", {noteId: form.dataset.studNoteId || null, title: values.title, document, courseId: values.courseId || null, assignmentId: values.assignmentId || null, paperIds, selectionProvenance: this.state.noteSelection});
        this.state.selectedNoteId = note.id; this.state.notePaperId = ""; this.state.noteSelection = null; await this.refreshLibrary(); this.parent.render(); this.toast(this.parent.view, "STRUCTURED NOTE SAVED LOCALLY");
    }

    async generateCitation(form) {
        const data = new FormData(form); const paperIds = data.getAll("paperIds"); const style = data.get("style");
        this.state.citationPaperIds = paperIds; this.state.citationStyle = style; this.state.citationOutput = await this.request("stud-citation-render", {paperIds, style}); this.parent.render();
    }

    async copyOutput(kind) {
        const output = this.state.citationOutput; if (!output) return;
        const text = kind === "cslJson" ? JSON.stringify(output.cslJson, null, 2) : String(output[kind] || "");
        await navigator.clipboard.writeText(text); this.toast(this.parent.view, "CITATION OUTPUT COPIED");
    }

    async zoteroCheck() { try { const result = await this.runRequest("stud-zotero-status", {}); if (!result) return; this.state.zotero.state = result.state; } catch (error) { this.state.zotero.state = "UNAVAILABLE"; this.state.error = "Zotero local API is unavailable. Core STUD remains ready."; } this.parent.render(); }
    async zoteroList() { const items = await this.runRequest("stud-zotero-list", {limit: 25}); if (!items) return; this.state.zotero.items = items; this.parent.render(); }
    async zoteroImport(index) { const item = this.state.zotero.items[index]; if (!item) return; await this.request("stud-zotero-import", {token: item.token}); await this.refreshLibrary(); this.parent.render(); this.toast(this.parent.view, "ZOTERO METADATA IMPORTED EXPLICITLY"); }
}

module.exports = {StudResearchWorkspace, RESEARCH_TABS, NOTE_EMPTY_DOCUMENT};
