"use strict";

const ACTIVE_VIEWS = Object.freeze(["OVERVIEW", "MODULES", "ASSIGNMENTS", "REVISION", "RESEARCH", "DOCUMENTS", "KNOWLEDGE", "AI", "NOTES", "TOOLS", "SERVICES", "MOODLE"]);
const FUTURE_VIEWS = Object.freeze([
    ["PROGRESS", "Derived local work reporting", "FUTURE"]
]);
const ACTIVE_ASSIGNMENT_STATUSES = Object.freeze(["NOT_STARTED", "IN_PROGRESS"]);
const COMPLETED_ASSIGNMENT_STATUSES = Object.freeze(["SUBMITTED", "GRADED"]);

function dateText(value) {
    if (!value) return "UNKNOWN";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "UNKNOWN";
    return new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"}).format(date).toUpperCase();
}

function inputDate(value) { return value ? String(value).slice(0, 16) : ""; }

function isCompleted(assignment) { return COMPLETED_ASSIGNMENT_STATUSES.includes(assignment.status); }

function assignmentPriority(assignment) { return assignment.priorityPresentation || assignment.priority || "NORMAL"; }

function grouped(items) {
    return items.reduce((result, item) => {
        const key = item.entityType || "OTHER";
        (result[key] ||= []).push(item);
        return result;
    }, {});
}

class StudCommandCenter {
    constructor(options = {}) {
        this.ipc = options.ipc;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.state = null;
        this.view = null;
        this.research = null;
        this.moodle = null;
        this.revision = null;
        this.compute = null;
        this.documents = null;
        this.knowledge = null;
        this.academicAssistant = null;
    }

    mount(view) {
        this.view = view;
        const grid = view.querySelector(".workspace-grid");
        view.classList.add("stud-command-center-deck");
        grid.className = "workspace-grid stud-command-center-grid";
        this.state = {
            activeView: "OVERVIEW", courses: [], assignments: [], overview: null,
            selectedCourseId: "", selectedAssignmentId: "", courseContext: null,
            assignmentContext: null, searchQuery: "", searchResults: [],
            assignmentFilters: {courseId: "", status: "ALL", sort: "DUE_ASC", query: ""},
            schema: null, error: null, dialogReturnFocus: null
        };
        this.research = new StudResearchWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        this.moodle = new StudMoodleWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        this.revision = new StudRevisionWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        this.compute = new StudComputeWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        this.documents = new StudDocumentWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        this.knowledge = new StudKnowledgeWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        this.academicAssistant = new StudAcademicAssistantWorkspace({request: (channel, payload) => this.request(channel, payload), escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message), parent: this});
        grid.innerHTML = `
            <section class="stud-command-header workspace-panel">
                <div><small>STUD / LOCAL ACADEMIC CONTEXT</small><h2>STUDENT COMMAND CENTER</h2><p>Courses, assignments and local work context remain explicit, offline and provenance-aware.</p></div>
                <div class="stud-command-status"><small>STORE</small><strong data-stud-status>INITIALIZING</strong><span data-stud-schema>SCHEMA —</span></div>
            </section>
            <nav class="stud-command-nav" aria-label="STUD sections" data-stud-nav></nav>
            <section class="stud-command-search workspace-panel"><div class="workspace-panel-content" data-stud-global-search></div></section>
            <main class="stud-command-main" data-stud-main></main>
            <dialog class="stud-dialog" data-stud-dialog-element aria-labelledby="stud_dialog_title"><header><h2 id="stud_dialog_title">STUD</h2><button type="button" data-stud-close-dialog aria-label="Close dialog">×</button></header><div data-stud-dialog-body></div></dialog>`;
        this.bind();
        // refresh() owns the revision read, so initializing it here too would
        // duplicate the initial local query and briefly risk stale UI state.
        return Promise.all([this.research.initialize(), this.moodle.initialize(), this.compute.initialize(), this.documents.initialize(), this.knowledge.initialize(), this.academicAssistant.initialize(), this.refresh()]).then(() => this.render());
    }

    async request(channel, payload = {}) {
        const response = await this.ipc.invoke(channel, payload);
        if (!response || !response.ok) throw new Error(response && response.message || "STUD local operation failed.");
        return response.data;
    }

    async refresh() {
        try {
            const [schema, overview, courses, assignments] = await Promise.all([
                this.request("stud-core-status"),
                this.request("stud-command-center", {limit: 12}),
                this.request("stud-entity-list", {entityType: "COURSE", limit: 100}),
                this.request("stud-entity-list", {entityType: "ASSIGNMENT", limit: 500})
            ]);
            this.state.schema = schema;
            this.state.overview = overview;
            this.state.courses = courses;
            this.state.assignments = assignments;
            if (this.revision) await this.revision.refresh();
            if (this.state.selectedCourseId && !courses.some(item => item.id === this.state.selectedCourseId)) this.state.selectedCourseId = "";
            if (this.state.selectedAssignmentId && !assignments.some(item => item.id === this.state.selectedAssignmentId)) this.state.selectedAssignmentId = "";
            this.state.error = null;
            await this.refreshContexts();
        } catch (error) {
            this.state.error = error.message || "Academic store unavailable.";
            this.render();
        }
    }

    async refreshContexts() {
        const tasks = [];
        if (this.state.selectedCourseId) tasks.push(this.request("stud-course-context", {courseId: this.state.selectedCourseId, limit: 100}).then(value => { this.state.courseContext = value; }));
        else this.state.courseContext = null;
        if (this.state.selectedAssignmentId) tasks.push(this.loadAssignmentContext(this.state.selectedAssignmentId));
        else this.state.assignmentContext = null;
        await Promise.all(tasks);
        this.render();
    }

    async loadAssignmentContext(id) {
        this.state.assignmentContext = await this.request("stud-orchestration-context", {assignmentId: id});
    }

    setActiveView(view) {
        if (!ACTIVE_VIEWS.includes(view)) return;
        if (view !== this.state.activeView) this.research.deactivate();
        if (view !== "AI" && this.academicAssistant) this.academicAssistant.cancelQuietly();
        this.research.disposeEditor();
        this.state.activeView = view;
        this.render();
    }

    async selectCourse(id, view = "MODULES") {
        this.state.selectedCourseId = id;
        this.state.selectedAssignmentId = "";
        this.state.activeView = view;
        await this.refreshContexts();
    }

    async selectAssignment(id, view = "ASSIGNMENTS") {
        const assignment = this.state.assignments.find(item => item.id === id);
        this.state.selectedAssignmentId = id;
        if (assignment && assignment.courseId) this.state.selectedCourseId = assignment.courseId;
        this.state.activeView = view;
        await this.refreshContexts();
    }

    render() {
        if (!this.view || !this.state) return;
        const setText = (selector, value) => { const node = this.view.querySelector(selector); if (node) node.textContent = value; };
        setText("[data-stud-status]", this.state.error ? "STORE ERROR" : "LOCAL / READY");
        setText("[data-stud-schema]", this.state.schema ? `SCHEMA V${this.state.schema.version} · WAL` : "SCHEMA —");
        this.renderNavigation();
        this.renderSearch();
        const main = this.view.querySelector("[data-stud-main]");
        if (!main) return;
        if (this.state.error) main.innerHTML = `<section class="workspace-panel stud-empty-state"><header><h2>STUD LOCAL STORE</h2><span>ERROR</span></header><div class="workspace-panel-content"><strong>LOCAL ACADEMIC CONTEXT UNAVAILABLE</strong><p>${this.escape(this.state.error)}</p></div></section>`;
        else if (this.state.activeView === "OVERVIEW") main.innerHTML = this.renderOverview();
        else if (this.state.activeView === "MODULES") main.innerHTML = this.renderModules();
        else if (this.state.activeView === "ASSIGNMENTS") main.innerHTML = this.renderAssignments();
        else if (this.state.activeView === "REVISION") main.innerHTML = this.revision.render();
        else if (this.state.activeView === "RESEARCH") main.innerHTML = this.research.renderResearch();
        else if (this.state.activeView === "DOCUMENTS") main.innerHTML = this.documents.render();
        else if (this.state.activeView === "KNOWLEDGE") main.innerHTML = this.knowledge.render();
        else if (this.state.activeView === "AI") main.innerHTML = this.academicAssistant.render();
        else if (this.state.activeView === "NOTES") main.innerHTML = this.research.renderNotes();
        else if (this.state.activeView === "TOOLS") main.innerHTML = this.compute.render();
        else if (this.state.activeView === "MOODLE") main.innerHTML = this.moodle.render();
        else main.innerHTML = this.renderServices();
        this.research.afterRender(this.state.activeView).catch(() => {});
    }

    renderNavigation() {
        const nav = this.view.querySelector("[data-stud-nav]");
        if (!nav) return;
        nav.innerHTML = `${ACTIVE_VIEWS.map(view => `<button type="button" data-stud-nav-view="${view}"${this.state.activeView === view ? " aria-current=\"page\" class=\"active\"" : ""}>${view}</button>`).join("")}${FUTURE_VIEWS.map(([view, description, phase]) => `<span class="stud-nav-deferred" title="${this.escape(description)}"><strong>${view}</strong><small>${phase}</small></span>`).join("")}`;
    }

    renderServices() {
        const services = this.research.renderServices();
        return services.replace("</section>", `${this.moodle.renderServiceCard()}</section>`);
    }

    renderSearch() {
        const area = this.view.querySelector("[data-stud-global-search]");
        if (!area) return;
        const resultGroups = grouped(this.state.searchResults);
        area.innerHTML = `<form class="stud-global-search-form" data-stud-form="search"><label>LOCAL SEARCH<input class="aegis-input" name="query" maxlength="240" value="${this.escape(this.state.searchQuery)}" placeholder="Search local courses, assignments, resources, papers and notes"></label><button type="submit">SEARCH</button></form>${this.state.searchResults.length ? `<div class="stud-global-results">${Object.entries(resultGroups).map(([type, items]) => `<section><small>${this.escape(type.replace(/_/g, " "))}</small>${items.map(item => `<button type="button" data-stud-search-result="${this.escape(item.entityId)}" data-stud-search-type="${this.escape(item.entityType)}"><strong>${this.escape(item.title)}</strong><span>${this.escape(item.snippet || "LOCAL MATCH")}</span></button>`).join("")}</section>`).join("")}</div>` : `<small class="stud-search-policy">FTS5 searches only local canonical academic records. No provider or network request is made.</small>`}`;
    }

    renderOverview() {
        const overview = this.state.overview;
        if (!overview) return "";
        const list = (items, empty, renderer) => items.length ? `<div class="stud-overview-list">${items.map(renderer).join("")}</div>` : `<div class="stud-empty-inline">${empty}</div>`;
        return `<section class="stud-overview-grid">
            <article class="workspace-panel stud-overview-today"><header><h2>TODAY</h2><span>EXPLICIT LOCAL DATA</span></header><div class="workspace-panel-content">${list(overview.today, "NO ACADEMIC ITEMS LINKED FOR TODAY", item => this.assignmentRow(item, "overview"))}</div></article>
            <article class="workspace-panel stud-overview-upcoming"><header><h2>UPCOMING</h2><span>KNOWN DEADLINES</span></header><div class="workspace-panel-content">${list(overview.upcoming, "NO UPCOMING ASSIGNMENTS WITH A KNOWN DUE DATE", item => this.assignmentRow(item, "overview"))}</div></article>
            <article class="workspace-panel stud-overview-priority"><header><h2>PRIORITY</h2><span>LOCAL / TRANSPARENT</span></header><div class="workspace-panel-content">${list(overview.priority, "NO ACTIVE ASSIGNMENTS", item => `<div class="stud-priority-row"><span class="stud-priority-${assignmentPriority(item).toLowerCase()}">${assignmentPriority(item)}</span>${this.assignmentRow(item, "overview")}</div>`)}</div></article>
            <article class="workspace-panel stud-overview-attention"><header><h2>ATTENTION REQUIRED</h2><span>${overview.attention.length} LOCAL ITEMS</span></header><div class="workspace-panel-content">${list(overview.attention, "NO CONFLICTS OR UNMATCHED ACTIVE ASSIGNMENTS", item => `<button type="button" class="stud-object-row" data-stud-open-assignment="${this.escape(item.assignment.id)}"><strong>${this.escape(item.assignment.title)}</strong><small>${item.conflicts.length ? `⚠ ${item.conflicts.length} FIELD CONFLICT${item.conflicts.length > 1 ? "S" : ""}` : "UNMATCHED · NO EXPLICIT CALENDAR OR EMAIL RELATION"}</small></button>`)}</div></article>
            <article class="workspace-panel stud-overview-continue"><header><h2>CONTINUE</h2><span>MODIFIED OBJECTS</span></header><div class="workspace-panel-content">${list(overview.continue, "NO RECENT LOCAL ACADEMIC OBJECTS", item => `<button type="button" class="stud-object-row" data-stud-search-result="${this.escape(item.id)}" data-stud-search-type="${this.escape(item.entityType)}"><strong>${this.escape(item.title || item.prompt || "LOCAL OBJECT")}</strong><small>${this.escape(item.entityType.replace(/_/g, " "))} · ${dateText(item.updatedAt)}</small></button>`)}</div></article>
            <article class="workspace-panel stud-overview-modules"><header><h2>MODULE STATUS</h2><span>LOCAL WORK CONTEXT</span></header><div class="workspace-panel-content">${overview.moduleStatus.length ? `<div class="stud-module-status-list">${overview.moduleStatus.map(course => `<button type="button" data-stud-open-course="${this.escape(course.id)}"><strong>${this.escape(course.code || course.shortName || "MODULE")} · ${this.escape(course.title)}</strong><small>${course.activeAssignmentCount} ACTIVE ASSIGNMENTS${course.nearestDueDate ? ` · NEXT ${dateText(course.nearestDueDate)}` : " · NO KNOWN DEADLINE"}</small></button>`).join("")}</div>` : `<div class="stud-empty-inline">NO MODULES YET · CREATE THE LOCAL ACADEMIC STRUCTURE IN MODULES.</div>`}</div></article>
            <article class="workspace-panel stud-overview-context"><header><h2>ACADEMIC CONTEXT</h2><span>OFFLINE / LOCAL FIRST</span></header><div class="workspace-panel-content"><p>STUD derives local context from canonical records and explicit relationships only. It never writes Moodle, Calendar or Email, and never scans external systems in the background.</p><button type="button" data-stud-nav-view="MODULES">MANAGE MODULES</button><button type="button" data-stud-nav-view="ASSIGNMENTS">MANAGE ASSIGNMENTS</button></div></article>
        </section>`;
    }

    assignmentRow(item) {
        return `<button type="button" class="stud-assignment-row" data-stud-open-assignment="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><small>${this.escape(this.courseLabel(item.courseId))} · ${item.dueDate ? dateText(item.dueDate) : "DUE DATE UNKNOWN"} · ${this.escape(item.status)}</small></button>`;
    }

    courseLabel(courseId) {
        const course = this.state.courses.find(item => item.id === courseId);
        return course ? (course.code || course.shortName || course.title) : "NO MODULE";
    }

    renderModules() {
        const context = this.state.courseContext;
        return `<section class="stud-modules-grid">
            <article class="workspace-panel stud-module-list-panel"><header><h2>MODULES</h2><span>${this.state.courses.length} LOCAL</span></header><div class="workspace-panel-content"><button type="button" data-stud-dialog="CREATE_MODULE">CREATE MODULE</button><div class="stud-module-list">${this.state.courses.length ? this.state.courses.map(course => `<button type="button" class="${course.id === this.state.selectedCourseId ? "selected" : ""}" data-stud-open-course="${this.escape(course.id)}"><strong>${this.escape(course.code || course.shortName || "MODULE")}</strong><span>${this.escape(course.title)}</span><small>${this.escape(course.status)} · ${this.moduleSummary(course.id)}</small></button>`).join("") : `<div class="stud-empty-inline">NO MODULES YET · CREATE THE ACADEMIC STRUCTURE MANUALLY.</div>`}</div></div></article>
            <article class="workspace-panel stud-module-detail-panel"><header><h2>MODULE DETAIL</h2><span>CANONICAL STORE</span></header><div class="workspace-panel-content">${context ? this.renderModuleDetail(context) : `<div class="stud-empty-inline">SELECT A MODULE TO SEE ASSIGNMENTS, RESOURCES, NOTES, PAPERS, REFERENCES AND PROVENANCE.</div>`}</div></article>
        </section>`;
    }

    moduleSummary(courseId) {
        const active = this.state.assignments.filter(item => item.courseId === courseId && !isCompleted(item));
        const nearest = active.filter(item => item.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
        return `${active.length} ACTIVE${nearest ? ` · ${dateText(nearest.dueDate)}` : ""}`;
    }

    renderModuleDetail(context) {
        const {course, assignments, resources, notes, revisions = [], papers, references, provenance} = context;
        const objects = (title, items, entityType, empty) => `<section class="stud-object-section"><header><h3>${title}</h3><span>${items.length}</span></header>${items.length ? `<div>${items.slice(0, 12).map(item => `<button type="button" data-stud-search-result="${this.escape(item.id)}" data-stud-search-type="${entityType}"><strong>${this.escape(item.title)}</strong><small>${entityType === "ASSIGNMENT" ? `${item.dueDate ? dateText(item.dueDate) : "DUE DATE UNKNOWN"} · ${item.status}` : dateText(item.updatedAt)}</small></button>`).join("")}</div>` : `<p>${empty}</p>`}</section>`;
        return `<div class="stud-detail-heading"><small>MODULE</small><h3>${this.escape(course.title)}</h3><span>${this.escape(course.code || "NO CODE")} · ${this.escape(course.status)}</span>${course.startDate || course.endDate ? `<small>${course.startDate ? dateText(course.startDate) : "START UNKNOWN"} → ${course.endDate ? dateText(course.endDate) : "END UNKNOWN"}</small>` : ""}</div>
            <div class="stud-detail-actions"><button type="button" data-stud-dialog="EDIT_MODULE">EDIT MODULE</button><button type="button" data-stud-dialog="CREATE_ASSIGNMENT">NEW ASSIGNMENT</button><button type="button" data-stud-dialog="CREATE_NOTE">NEW NOTE</button><button type="button" data-stud-dialog="ADD_RESOURCE">ADD RESOURCE</button><button type="button" data-stud-create-revision-course="${this.escape(course.id)}">CREATE REVISION ITEM</button></div>
            <div class="stud-object-columns">${objects("ASSIGNMENTS", assignments, "ASSIGNMENT", "NO ASSIGNMENTS STORED IN STUD.")}${objects("REVISION", revisions, "REVISION_ITEM", "NO LOCAL REVISION ITEMS.")}${objects("RESOURCES", resources, "RESOURCE", "NO LOCAL RESOURCES.")}${objects("NOTES", notes, "NOTE", "NO LOCAL NOTES.")}${objects("PAPERS", papers, "RESEARCH_PAPER", "NO RELATED PAPERS.")}</div>
            ${this.renderReferences("COURSE", course.id, references)}${this.renderProvenanceSummary("COURSE", course.id, provenance, ["title", "code", "status"])} `;
    }

    renderAssignments() {
        const filtered = this.filteredAssignments();
        const context = this.state.assignmentContext;
        const courseOptions = `<option value="">ALL MODULES</option>${this.state.courses.map(course => `<option value="${this.escape(course.id)}"${this.state.assignmentFilters.courseId === course.id ? " selected" : ""}>${this.escape(this.courseLabel(course.id))}</option>`).join("")}`;
        return `<section class="stud-assignments-grid">
            <article class="workspace-panel stud-assignment-list-panel"><header><h2>ASSIGNMENTS</h2><span>${filtered.length} MATCHED</span></header><div class="workspace-panel-content"><div class="stud-detail-actions"><button type="button" data-stud-dialog="CREATE_ASSIGNMENT">CREATE ASSIGNMENT</button></div><form class="stud-assignment-filters" data-stud-form="assignment-filters"><label>MODULE<select class="aegis-select" name="courseId">${courseOptions}</select></label><label>STATUS<select class="aegis-select" name="status">${["ALL", "ACTIVE", "UPCOMING", "COMPLETED", "NO_DUE_DATE"].map(value => `<option${this.state.assignmentFilters.status === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>SORT<select class="aegis-select" name="sort">${[["DUE_ASC", "DUE DATE"], ["UPDATED_DESC", "LAST MODIFIED"]].map(([value, label]) => `<option value="${value}"${this.state.assignmentFilters.sort === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>SEARCH<input class="aegis-input" name="query" value="${this.escape(this.state.assignmentFilters.query)}" maxlength="240" placeholder="Local assignment text"></label><button type="submit">APPLY</button></form><div class="stud-assignment-list">${filtered.length ? filtered.map(item => this.assignmentRow(item, "assignments")).join("") : `<div class="stud-empty-inline">NO ASSIGNMENTS MATCH THE CURRENT LOCAL FILTER.</div>`}</div></div></article>
            <article class="workspace-panel stud-assignment-detail-panel"><header><h2>ASSIGNMENT DETAIL</h2><span>LOCAL WORK</span></header><div class="workspace-panel-content">${context ? this.renderAssignmentDetail(context) : `<div class="stud-empty-inline">SELECT AN ASSIGNMENT TO REVIEW DEADLINES, PROVENANCE, LOCAL PROGRESS AND RELATED CONTEXT.</div>`}</div></article>
        </section>`;
    }

    filteredAssignments() {
        const filters = this.state.assignmentFilters;
        const now = Date.now();
        const items = this.state.assignments.filter(item => {
            if (filters.courseId && item.courseId !== filters.courseId) return false;
            if (filters.status === "ACTIVE" && !ACTIVE_ASSIGNMENT_STATUSES.includes(item.status)) return false;
            if (filters.status === "COMPLETED" && !isCompleted(item)) return false;
            if (filters.status === "UPCOMING" && (!item.dueDate || isCompleted(item) || new Date(item.dueDate).getTime() < now)) return false;
            if (filters.status === "NO_DUE_DATE" && item.dueDate) return false;
            if (filters.query && !`${item.title} ${item.description || ""}`.toLowerCase().includes(filters.query.toLowerCase())) return false;
            return true;
        });
        return items.sort((a, b) => filters.sort === "UPDATED_DESC" ? String(b.updatedAt).localeCompare(String(a.updatedAt)) : String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))).slice(0, 150);
    }

    renderAssignmentDetail(context) {
        const {assignment, provenance, relationships, references, resources, notes = [], papers = [], revisions = [], links = [], conflicts = [], status = "CLEAN"} = context;
        const course = this.state.courses.find(item => item.id === assignment.courseId);
        const deadlines = [["RELEASE", assignment.releaseDate], ["DUE", assignment.dueDate], ["CUTOFF", assignment.cutoffDate]];
        return `<div class="stud-detail-heading"><small>ASSIGNMENT</small><h3>${this.escape(assignment.title)}</h3><span>${this.escape(course ? this.courseLabel(course.id) : "NO MODULE")} · ${this.escape(assignment.status)}</span></div>
            <div class="stud-deadline-grid">${deadlines.map(([label, value]) => `<section><small>${label}</small><strong>${value ? dateText(value) : "UNKNOWN"}</strong></section>`).join("")}</div>
            <section class="stud-orchestration-context"><header><h3>ACADEMIC CONTEXT</h3><span>${this.escape(status)}</span></header><div class="stud-orchestration-trace"><article><strong>MOODLE / CANONICAL</strong><small>${provenance.some(item => item.sourceType === "MOODLE") ? "AUTHORITATIVE OBSERVATION AVAILABLE" : "NO MOODLE OBSERVATION"}</small></article><article><strong>CALENDAR</strong><small>${links.filter(item => item.referenceKind === "CALENDAR").length || references.filter(item => item.kind === "CALENDAR").length} EXPLICIT LINKS</small></article><article><strong>EMAIL</strong><small>${links.filter(item => item.referenceKind === "EMAIL").length || references.filter(item => item.kind === "EMAIL").length} EXPLICIT LINKS</small></article><article><strong>LOCAL CONTEXT</strong><small>${resources.length} RESOURCES · ${notes.length} NOTES · ${papers.length} PAPERS</small></article></div>${conflicts.length ? `<div class="stud-conflict-banner" role="status"><strong>⚠ DEADLINE / ACADEMIC CONFLICT</strong><span>${conflicts.map(item => `${this.escape(item.field)} · ${item.values.length} OBSERVATIONS`).join(" · ")}</span><button type="button" data-stud-provenance="ASSIGNMENT:${this.escape(assignment.id)}">REVIEW SOURCES</button></div>` : `<p class="stud-orchestration-note">No material field conflict detected. External systems remain read-only and no action runs automatically.</p>`}</section>
            <form class="stud-edit-grid" data-stud-form="EDIT_ASSIGNMENT" data-stud-entity-id="${this.escape(assignment.id)}"><label>TITLE<input class="aegis-input" name="title" required maxlength="240" value="${this.escape(assignment.title)}"></label><label>STATUS<select class="aegis-select" name="status">${["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "GRADED"].map(status => `<option${assignment.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></label><label>DUE DATE<input class="aegis-input" name="dueDate" type="datetime-local" value="${inputDate(assignment.dueDate)}"></label><label>LOCAL PROGRESS<input class="aegis-input" name="localProgress" type="number" min="0" max="100" step="1" value="${assignment.localProgress ?? ""}" placeholder="0–100"></label><label>PRIORITY<select class="aegis-select" name="priority"><option value="">AUTO / DETERMINISTIC</option>${["URGENT", "HIGH", "NORMAL", "LOW"].map(priority => `<option${assignment.priority === priority ? " selected" : ""}>${priority}</option>`).join("")}</select></label><label class="stud-wide-label">DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000">${this.escape(assignment.description || "")}</textarea></label><button type="submit">SAVE LOCAL WORK</button></form>
            <section class="stud-academic-data"><small>ACADEMIC DATA · ONLY WHEN KNOWN</small><p>SUBMISSION ${this.escape(assignment.submissionStatus || "UNKNOWN")} · GRADE ${assignment.grade ?? "UNKNOWN"}${assignment.gradeMaximum !== null ? ` / ${assignment.gradeMaximum}` : ""} · WEIGHT ${assignment.weight ?? "UNKNOWN"}</p>${assignment.feedback ? `<p>${this.escape(assignment.feedback)}</p>` : ""}</section>
            ${resources.length ? `<section class="stud-object-section"><header><h3>RELATED RESOURCES</h3><span>${resources.length}</span></header><div>${resources.map(item => `<button type="button" data-stud-search-result="${this.escape(item.id)}" data-stud-search-type="RESOURCE"><strong>${this.escape(item.title)}</strong><small>${this.escape(item.type)}</small></button>`).join("")}</div></section>` : `<div class="stud-empty-inline">NO RELATED RESOURCES.</div>`}
            <section class="stud-object-section stud-assignment-research"><header><h3>RESEARCH</h3><span>${papers.length} PAPERS</span></header>${papers.length ? `<div>${papers.map(item => `<button type="button" data-stud-paper-id="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><small>${this.escape(item.year || "YEAR UNKNOWN")} · ${this.escape(item.doi || "DOI UNAVAILABLE")} · ${item.localDocumentReference ? "LOCAL PDF" : "NO LOCAL PDF"}</small></button>`).join("")}</div>` : `<p>NO PAPERS LINKED TO THIS ASSIGNMENT.</p>`}<div class="stud-detail-actions"><button type="button" data-stud-assignment-research="${this.escape(assignment.id)}">RESEARCH FOR ASSIGNMENT</button><button type="button" data-stud-assignment-knowledge="${this.escape(assignment.id)}">BUILD ACADEMIC CONTEXT</button></div></section>
            <section class="stud-object-section"><header><h3>REVISION PREPARATION</h3><span>${revisions.length}</span></header>${revisions.length ? `<div>${revisions.slice(0, 12).map(item => `<button type="button" data-stud-search-result="${this.escape(item.id)}" data-stud-search-type="REVISION_ITEM"><strong>${this.escape(item.title || item.prompt)}</strong><small>${this.escape(item.status)} · ${item.scheduledRevisionAt || item.nextPlannedRevisionAt ? "SCHEDULED" : "UNSCHEDULED"}</small></button>`).join("")}</div>` : `<p>NO LOCAL REVISION PREPARATION ITEM IS LINKED.</p>`}</section>
            <div class="stud-detail-actions"><button type="button" data-stud-dialog="CREATE_NOTE">ADD NOTE</button><button type="button" data-stud-dialog="ADD_RESOURCE">ADD RESOURCE</button><button type="button" data-stud-dialog="MATCH_CALENDAR">FIND RELATED CALENDAR</button><button type="button" data-stud-dialog="MATCH_EMAIL">FIND RELATED EMAIL</button><button type="button" data-stud-create-revision-assignment="${this.escape(assignment.id)}">CREATE REVISION ITEM FOR ASSIGNMENT</button>${conflicts.length ? `<button type="button" data-stud-dialog="OVERRIDE_DUE">USE LOCAL DUE VALUE</button>` : ""}</div>
            ${this.renderReferences("ASSIGNMENT", assignment.id, references)}${this.renderProvenanceSummary("ASSIGNMENT", assignment.id, provenance, ["dueDate", "title", "status"])}<section class="stud-relations"><small>RELATED CONTEXT · ${relationships.length}</small><p>${relationships.length ? "Bounded local relationships are available; no external item is fetched automatically." : "NO RELATED ACADEMIC OBJECTS HAVE BEEN LINKED."}</p></section>`;
    }

    renderReferences(entityType, entityId, references) {
        return `<section class="stud-references"><header><h3>RELATED CALENDAR / EMAIL</h3><span>EXPLICIT ONLY</span></header>${references.length ? `<div>${references.map(item => `<article><strong>${item.kind} REFERENCE</strong><span>${this.escape(item.externalId)}</span><button type="button" data-stud-reference-unlink="${this.escape(item.identifierId)}" data-stud-reference-type="${entityType}" data-stud-reference-entity="${this.escape(entityId)}">UNLINK</button></article>`).join("")}</div>` : `<p>NO CALENDAR EVENT OR EMAIL HAS BEEN EXPLICITLY LINKED. STUD DOES NOT SCAN, OPEN OR COPY EXTERNAL CONTENT.</p>`}</section>`;
    }

    renderProvenanceSummary(entityType, entityId, observations, fields) {
        const relevant = observations.filter(item => fields.includes(item.field));
        const conflicts = relevant.filter(item => observations.filter(other => other.field === item.field).map(other => other.observedValue).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).length > 1);
        return `<section class="stud-provenance-summary"><header><h3>PROVENANCE</h3><span>${conflicts.length ? "CONFLICTING OBSERVATIONS" : "FIELD LEVEL"}</span></header>${relevant.length ? `<div>${relevant.slice(0, 4).map(item => `<article><strong>${this.escape(item.field)}</strong><span>${this.escape(item.sourceType)} / ${this.escape(item.sourceAuthority)}</span><small>${this.escape(item.observedValue || "VALUE ABSENT")}</small></article>`).join("")}</div><button type="button" data-stud-provenance="${entityType}:${this.escape(entityId)}">VIEW SOURCES</button>` : `<p>NO FIELD OBSERVATIONS YET.</p>`}</section>`;
    }

    openDialog(kind, trigger) {
        const dialog = this.view.querySelector("[data-stud-dialog-element]");
        const body = dialog && dialog.querySelector("[data-stud-dialog-body]");
        const title = dialog && dialog.querySelector("#stud_dialog_title");
        if (!dialog || !body || !title) return;
        this.state.dialogReturnFocus = trigger || document.activeElement;
        const course = this.state.courseContext && this.state.courseContext.course;
        const assignment = this.state.assignmentContext && this.state.assignmentContext.assignment;
        const template = {
            CREATE_MODULE: ["CREATE MODULE", `<form class="stud-dialog-form" data-stud-form="CREATE_MODULE"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required autofocus></label><label>CODE<input class="aegis-input" name="code" maxlength="80"></label><label>SHORT NAME<input class="aegis-input" name="shortName" maxlength="80"></label><label>DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000"></textarea></label><label>STATUS<select class="aegis-select" name="status"><option>ACTIVE</option><option>COMPLETED</option></select></label><button type="submit">CREATE LOCAL MODULE</button></form>`],
            EDIT_MODULE: course && ["EDIT MODULE", `<form class="stud-dialog-form" data-stud-form="EDIT_MODULE" data-stud-entity-id="${this.escape(course.id)}"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required value="${this.escape(course.title)}" autofocus></label><label>CODE<input class="aegis-input" name="code" maxlength="80" value="${this.escape(course.code || "")}"></label><label>SHORT NAME<input class="aegis-input" name="shortName" maxlength="80" value="${this.escape(course.shortName || "")}"></label><label>DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000">${this.escape(course.description || "")}</textarea></label><label>STATUS<select class="aegis-select" name="status">${["ACTIVE", "COMPLETED"].map(status => `<option${course.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></label><button type="submit">SAVE MODULE</button></form>`],
            CREATE_ASSIGNMENT: ["CREATE ASSIGNMENT", `<form class="stud-dialog-form" data-stud-form="CREATE_ASSIGNMENT"><label>MODULE<select class="aegis-select" name="courseId"><option value="">NO MODULE / UNASSIGNED</option>${this.state.courses.map(item => `<option value="${this.escape(item.id)}"${course && item.id === course.id ? " selected" : ""}>${this.escape(this.courseLabel(item.id))}</option>`).join("")}</select></label><label>TITLE<input class="aegis-input" name="title" maxlength="240" required autofocus></label><label>DUE DATE<input class="aegis-input" name="dueDate" type="datetime-local"></label><label>STATUS<select class="aegis-select" name="status"><option>NOT_STARTED</option><option>IN_PROGRESS</option></select></label><label>DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000"></textarea></label><button type="submit">CREATE ASSIGNMENT</button></form>`],
            CREATE_NOTE: assignment || course ? ["CREATE NOTE", `<form class="stud-dialog-form" data-stud-form="CREATE_NOTE"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required autofocus></label><label>CONTENT<textarea class="aegis-input" name="content" maxlength="40000"></textarea></label><button type="submit">CREATE + LINK NOTE</button></form>`] : null,
            ADD_RESOURCE: assignment || course ? ["ADD RESOURCE", `<form class="stud-dialog-form" data-stud-form="ADD_RESOURCE"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required autofocus></label><label>TYPE<select class="aegis-select" name="type"><option>REFERENCE</option><option>LINK</option><option>DOCUMENT</option></select></label><label>URL / SAFE REFERENCE<input class="aegis-input" name="url" maxlength="2048"></label><button type="submit">CREATE + LINK RESOURCE</button></form>`] : null,
            MATCH_CALENDAR: assignment && ["SUGGESTED CALENDAR RELATION", `<form class="stud-dialog-form" data-stud-form="MATCH_REFERENCE"><input type="hidden" name="kind" value="CALENDAR"><p>Enter or paste one explicitly selected Calendar event reference. This local matching pass does not create, edit or delete Calendar events.</p><label>EVENT UID / STABLE REFERENCE<input class="aegis-input" name="externalId" maxlength="260" required autofocus></label><label>EVENT TITLE<input class="aegis-input" name="title" maxlength="240"></label><label>MODULE CODE<input class="aegis-input" name="courseCode" maxlength="80" value="${this.escape(course && (course.code || course.shortName) || "")}"></label><label>EVENT DEADLINE<input class="aegis-input" name="dueDate" type="datetime-local" value="${inputDate(assignment.dueDate)}"></label><button type="submit">ASSESS + LINK EXPLICITLY</button></form>`],
            MATCH_EMAIL: assignment && ["SUGGESTED EMAIL RELATION", `<form class="stud-dialog-form" data-stud-form="MATCH_REFERENCE"><input type="hidden" name="kind" value="EMAIL"><p>Enter only a selected message reference and bounded academic context. STUD does not scan mailboxes, copy message bodies or send mail.</p><label>MESSAGE REFERENCE<input class="aegis-input" name="externalId" maxlength="260" required autofocus></label><label>SUBJECT / SAFE SUMMARY<input class="aegis-input" name="title" maxlength="240"></label><label>MODULE CODE<input class="aegis-input" name="courseCode" maxlength="80" value="${this.escape(course && (course.code || course.shortName) || "")}"></label><label>STATED DEADLINE<input class="aegis-input" name="dueDate" type="datetime-local"></label><button type="submit">ASSESS + LINK EXPLICITLY</button></form>`],
            OVERRIDE_DUE: assignment && ["USER OVERRIDE · DUE DATE", `<form class="stud-dialog-form" data-stud-form="OVERRIDE_DUE"><p>This changes only STUD's local canonical interpretation. All Moodle, Calendar and Email observations remain preserved.</p><label>LOCAL DUE DATE<input class="aegis-input" name="dueDate" type="datetime-local" required value="${inputDate(assignment.dueDate)}" autofocus></label><label>REASON<input class="aegis-input" name="note" maxlength="1000" required></label><button type="submit">SAVE USER OVERRIDE</button></form>`]
        }[kind];
        if (!template) { this.showToast(this.view, "SELECT A LOCAL MODULE OR ASSIGNMENT FIRST"); return; }
        title.textContent = template[0];
        body.innerHTML = template[1];
        if (!dialog.open) dialog.showModal();
        requestAnimationFrame(() => body.querySelector("[autofocus], input, select, textarea, button")?.focus());
    }

    openProvenance(token, trigger) {
        const [entityType, entityId] = String(token || "").split(":");
        const context = entityType === "COURSE" ? this.state.courseContext : this.state.assignmentContext;
        const observations = context && context.provenance || [];
        const dialog = this.view.querySelector("[data-stud-dialog-element]");
        const body = dialog && dialog.querySelector("[data-stud-dialog-body]");
        if (!dialog || !body) return;
        this.state.dialogReturnFocus = trigger || document.activeElement;
        dialog.querySelector("#stud_dialog_title").textContent = "FIELD SOURCES";
        const byField = grouped(observations.map(item => ({...item, entityType: item.field})));
        body.innerHTML = `<div class="stud-provenance-dialog">${Object.entries(byField).map(([field, values]) => { const conflicts = new Set(values.map(item => item.observedValue).filter(Boolean)).size > 1; return `<section><header><h3>${this.escape(field)}</h3><span>${conflicts ? "CONFLICTING OBSERVATIONS" : "OBSERVATIONS"}</span></header>${values.map(item => `<article><strong>${this.escape(item.observedValue || "VALUE ABSENT")}</strong><span>${this.escape(item.sourceType)} / ${this.escape(item.sourceAuthority)}</span><small>${dateText(item.observedAt)}</small></article>`).join("")}</section>`; }).join("") || `<p>NO OBSERVATIONS FOR THIS LOCAL OBJECT.</p>`}</div>`;
        if (!dialog.open) dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector("button")?.focus());
    }

    closeDialog() {
        const dialog = this.view.querySelector("[data-stud-dialog-element]");
        if (dialog && dialog.open) dialog.close();
    }

    bind() {
        if (this.view.dataset.studPhase2Bound) return;
        this.view.dataset.studPhase2Bound = "true";
        this.view.addEventListener("click", async event => {
            if (await this.research.handleClick(event)) return;
            if (await this.moodle.handleClick(event)) return;
            if (await this.revision.handleClick(event)) return;
            if (await this.compute.handleClick(event)) return;
            if (await this.documents.handleClick(event)) return;
            if (await this.knowledge.handleClick(event)) return;
            if (await this.academicAssistant.handleClick(event)) return;
            const nav = event.target.closest("[data-stud-nav-view]");
            const course = event.target.closest("[data-stud-open-course]");
            const assignment = event.target.closest("[data-stud-open-assignment]");
            const search = event.target.closest("[data-stud-search-result]");
            const dialog = event.target.closest("[data-stud-dialog]");
            const provenance = event.target.closest("[data-stud-provenance]");
            const unlink = event.target.closest("[data-stud-reference-unlink]");
            const assignmentResearch = event.target.closest("[data-stud-assignment-research]");
            const assignmentKnowledge = event.target.closest("[data-stud-assignment-knowledge]");
            if (nav) this.setActiveView(nav.dataset.studNavView);
            else if (course) this.selectCourse(course.dataset.studOpenCourse);
            else if (assignment) this.selectAssignment(assignment.dataset.studOpenAssignment);
            else if (search) this.openSearchResult(search.dataset.studSearchType, search.dataset.studSearchResult);
            else if (dialog) this.openDialog(dialog.dataset.studDialog, dialog);
            else if (provenance) this.openProvenance(provenance.dataset.studProvenance, provenance);
            else if (unlink) this.unlinkReference(unlink);
            else if (assignmentResearch) { this.research.state.assignmentId = assignmentResearch.dataset.studAssignmentResearch; this.setActiveView("RESEARCH"); }
            else if (assignmentKnowledge) { this.knowledge.state.rootType = "ASSIGNMENT"; this.knowledge.state.rootId = assignmentKnowledge.dataset.studAssignmentKnowledge; this.setActiveView("KNOWLEDGE"); this.knowledge.build().catch(error => { this.knowledge.state.error = error.message || "ACADEMIC CONTEXT FAILED"; this.render(); }); }
            else if (event.target.closest("[data-stud-close-dialog]")) this.closeDialog();
        });
        this.view.addEventListener("submit", async event => { if (await this.research.handleSubmit(event)) return; if (await this.moodle.handleSubmit(event)) return; if (await this.revision.handleSubmit(event)) return; if (await this.compute.handleSubmit(event)) return; if (await this.documents.handleSubmit(event)) return; if (await this.knowledge.handleSubmit(event)) return; if (await this.academicAssistant.handleSubmit(event)) return; this.handleForm(event); });
        this.view.addEventListener("change", event => { this.compute.handleChange(event).catch(() => {}); this.documents.handleChange(event).catch(() => {}); this.knowledge.handleChange(event).catch(() => {}); this.academicAssistant.handleChange(event).catch(() => {}); });
        const dialog = this.view.querySelector("[data-stud-dialog-element]");
        dialog.addEventListener("close", () => { const target = this.state.dialogReturnFocus; this.state.dialogReturnFocus = null; if (target && document.contains(target)) target.focus(); });
    }

    async openSearchResult(entityType, entityId) {
        if (entityType === "COURSE") return this.selectCourse(entityId, "MODULES");
        if (entityType === "ASSIGNMENT") return this.selectAssignment(entityId, "ASSIGNMENTS");
        if (entityType === "RESEARCH_PAPER") { this.research.state.tab = "LIBRARY"; await this.research.selectPaper(entityId); return this.setActiveView("RESEARCH"); }
        if (entityType === "NOTE") { this.research.state.selectedNoteId = entityId; return this.setActiveView("NOTES"); }
        if (entityType === "REVISION_ITEM") { await this.revision.select(entityId, false); return this.setActiveView("REVISION"); }
        if (entityType === "COMPUTE_RESULT") { this.compute.state.result = null; return this.setActiveView("TOOLS"); }
        if (entityType === "ACADEMIC_DOCUMENT") { await this.documents.select(entityId); return this.setActiveView("DOCUMENTS"); }
        this.showToast(this.view, `${entityType.replace(/_/g, " ")} IS AVAILABLE IN THE LOCAL ACADEMIC STORE`);
    }

    async unlinkReference(button) {
        try {
            await this.request("stud-reference-unlink", {entityType: button.dataset.studReferenceType, entityId: button.dataset.studReferenceEntity, identifierId: button.dataset.studReferenceUnlink, confirmation: true});
            await this.refreshContexts();
            this.showToast(this.view, "EXPLICIT REFERENCE UNLINKED");
        } catch (error) { this.showToast(this.view, error.message || "REFERENCE UNLINK FAILED"); }
    }

    async handleForm(event) {
        const form = event.target.closest("form[data-stud-form]");
        if (!form) return;
        event.preventDefault();
        const kind = form.dataset.studForm;
        const value = Object.fromEntries(new FormData(form).entries());
        ["dueDate", "releaseDate", "cutoffDate"].forEach(field => { if (value[field]) value[field] = new Date(value[field]).toISOString(); });
        if (value.localProgress === "") delete value.localProgress;
        else if (value.localProgress !== undefined) value.localProgress = Number(value.localProgress);
        try {
            if (kind === "search") {
                this.state.searchQuery = value.query || "";
                this.state.searchResults = value.query ? await this.request("stud-search", {query: value.query, options: {limit: 30}}) : [];
                this.render();
                return;
            }
            if (kind === "assignment-filters") {
                this.state.assignmentFilters = {...this.state.assignmentFilters, ...value};
                this.render();
                return;
            }
            if (kind === "CREATE_MODULE") {
                const created = await this.request("stud-entity-create", {entityType: "COURSE", value, provenance: {field: "title", observedValue: value.title, sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}});
                this.state.selectedCourseId = created.id;
                this.state.activeView = "MODULES";
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, "LOCAL MODULE CREATED");
                return;
            }
            if (kind === "EDIT_MODULE") {
                await this.request("stud-entity-update", {entityType: "COURSE", entityId: form.dataset.studEntityId, value});
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, "MODULE SAVED LOCALLY");
                return;
            }
            if (kind === "CREATE_ASSIGNMENT") {
                const created = await this.request("stud-entity-create", {entityType: "ASSIGNMENT", value, provenance: {field: "title", observedValue: value.title, sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}});
                this.state.selectedAssignmentId = created.id;
                if (created.courseId) this.state.selectedCourseId = created.courseId;
                this.state.activeView = "ASSIGNMENTS";
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, "ASSIGNMENT CREATED LOCALLY");
                return;
            }
            if (kind === "EDIT_ASSIGNMENT") {
                await this.request("stud-entity-update", {entityType: "ASSIGNMENT", entityId: form.dataset.studEntityId, value});
                await this.refresh();
                this.showToast(this.view, "LOCAL WORK SAVED");
                return;
            }
            if (kind === "MATCH_REFERENCE") {
                if (!this.state.assignmentContext) throw new Error("Select an assignment first.");
                if (value.dueDate) value.dueDate = new Date(value.dueDate).toISOString();
                const result = await this.request("stud-orchestration-confirm-reference", {...value, assignmentId: this.state.assignmentContext.assignment.id, confirmation: true});
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, `${result.proposal.confidence} ${value.kind} RELATION LINKED EXPLICITLY`);
                return;
            }
            if (kind === "OVERRIDE_DUE") {
                if (!this.state.assignmentContext || !value.dueDate) throw new Error("A local due date is required.");
                await this.request("stud-orchestration-user-override", {entityType: "ASSIGNMENT", entityId: this.state.assignmentContext.assignment.id, field: "dueDate", value: new Date(value.dueDate).toISOString(), note: value.note});
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, "USER OVERRIDE RECORDED WITH PROVENANCE");
                return;
            }
            const selected = this.state.assignmentContext && this.state.assignmentContext.assignment || this.state.courseContext && this.state.courseContext.course;
            const selectedType = this.state.assignmentContext ? "ASSIGNMENT" : "COURSE";
            if (!selected) throw new Error("Select a local module or assignment first.");
            if (kind === "CREATE_NOTE") {
                const courseId = selectedType === "COURSE" ? selected.id : selected.courseId || undefined;
                const note = await this.request("stud-entity-create", {entityType: "NOTE", value: {...value, courseId}});
                await this.request("stud-relationship-create", {fromType: selectedType, fromId: selected.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, "NOTE CREATED AND LINKED");
                return;
            }
            if (kind === "ADD_RESOURCE") {
                const resource = await this.request("stud-entity-create", {entityType: "RESOURCE", value: {...value, courseId: selectedType === "COURSE" ? selected.id : selected.courseId || undefined, assignmentId: selectedType === "ASSIGNMENT" ? selected.id : undefined}});
                await this.request("stud-relationship-create", {fromType: selectedType, fromId: selected.id, relationType: "HAS_RESOURCE", toType: "RESOURCE", toId: resource.id, source: "USER"});
                this.closeDialog();
                await this.refresh();
                this.showToast(this.view, "RESOURCE CREATED AND LINKED");
                return;
            }
            if (kind === "LINK_REFERENCE") {
                await this.request("stud-reference-link", {entityType: selectedType, entityId: selected.id, kind: value.kind, externalId: value.externalId});
                this.closeDialog();
                await this.refreshContexts();
                this.showToast(this.view, "EXPLICIT EXTERNAL REFERENCE LINKED");
            }
        } catch (error) { this.showToast(this.view, error.message || "STUD OPERATION FAILED"); }
    }
}

module.exports = {StudCommandCenter, ACTIVE_VIEWS, FUTURE_VIEWS, ACTIVE_ASSIGNMENT_STATUSES, COMPLETED_ASSIGNMENT_STATUSES, derivePriority: assignmentPriority};
