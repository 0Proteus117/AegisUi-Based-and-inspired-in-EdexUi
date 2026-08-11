"use strict";

function dateText(value) {
    if (!value) return "UNKNOWN";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "UNKNOWN" : new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"}).format(date).toUpperCase();
}
function inputDate(value) { return value ? String(value).slice(0, 16) : ""; }
function localId(value) { return String(value || "").replace(/[^a-z0-9_-]/gi, "_"); }

class StudRevisionWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {overview: null, plan: [], items: [], selectedId: "", context: null, filters: {courseId: "", status: "ALL", priority: "ALL", scheduled: "ALL", sort: "NEXT"}, activeSession: null, error: null};
    }

    async initialize() { return this.refresh(); }

    async refresh() {
        try {
            const [overview, plan, items] = await Promise.all([
                this.request("stud-revision-overview", {limit: 12}),
                this.request("stud-revision-plan", {limit: 24}),
                this.request("stud-revision-list", {...this.state.filters, limit: 120})
            ]);
            this.state.overview = overview;
            this.state.plan = plan;
            this.state.items = items;
            if (this.state.selectedId && !items.some(item => item.id === this.state.selectedId)) this.state.selectedId = "";
            if (this.state.selectedId) await this.select(this.state.selectedId, false);
            else this.state.context = null;
            this.state.error = null;
        } catch (error) { this.state.error = error.message || "Revision workspace unavailable."; }
    }

    async select(id, redraw = true) {
        this.state.selectedId = id;
        this.state.context = await this.request("stud-revision-context", {revisionItemId: id, historyLimit: 40});
        this.state.activeSession = (this.state.context.history || []).find(item => ["STARTED", "PAUSED"].includes(item.status)) || null;
        if (redraw) this.parent.render();
    }

    itemRow(item, compact = false) {
        const planning = item.planning || {};
        return `<button type="button" class="stud-revision-row${item.id === this.state.selectedId ? " selected" : ""}" data-stud-revision-open="${this.escape(item.id)}"><strong>${this.escape(item.title || item.prompt)}</strong><small>${this.escape(item.priority || "NORMAL")} · ${this.escape(planning.state || item.status || "ACTIVE")} · ${this.escape(planning.reason || (item.scheduledRevisionAt ? "SCHEDULED" : "LOCAL ITEM"))}</small>${compact ? "" : `<span>${item.estimatedDurationMinutes ? `${item.estimatedDurationMinutes} MIN` : "DURATION UNKNOWN"}</span>`}</button>`;
    }

    renderList(items, empty, compact = false) { return items && items.length ? `<div class="stud-revision-list">${items.map(item => this.itemRow(item, compact)).join("")}</div>` : `<div class="stud-empty-inline">${empty}</div>`; }

    render() {
        if (this.state.error) return `<section class="workspace-panel stud-empty-state"><header><h2>REVISION / STUDY PLANNING</h2><span>LOCAL ERROR</span></header><div class="workspace-panel-content"><strong>REVISION WORKSPACE UNAVAILABLE</strong><p>${this.escape(this.state.error)}</p></div></section>`;
        const overview = this.state.overview || {today: [], overdue: [], upcoming: [], highPriority: [], unscheduled: [], needsReview: [], recentlyStudied: []};
        const courseOptions = `<option value="">ALL MODULES</option>${this.parent.state.courses.map(course => `<option value="${this.escape(course.id)}"${this.state.filters.courseId === course.id ? " selected" : ""}>${this.escape(this.parent.courseLabel(course.id))}</option>`).join("")}`;
        return `<section class="stud-revision-shell">
            <section class="stud-revision-overview-grid">
                <article class="workspace-panel"><header><h2>TODAY / STUDY PLAN</h2><span>${this.state.plan.length} BOUNDED ITEMS</span></header><div class="workspace-panel-content">${this.renderList(this.state.plan, "NO LOCAL STUDY ITEMS REQUIRE ACTION TODAY.")}</div></article>
                <article class="workspace-panel"><header><h2>OVERDUE</h2><span>${overview.overdue.length}</span></header><div class="workspace-panel-content">${this.renderList(overview.overdue, "NO OVERDUE LOCAL REVISIONS.", true)}</div></article>
                <article class="workspace-panel"><header><h2>UPCOMING</h2><span>${overview.upcoming.length}</span></header><div class="workspace-panel-content">${this.renderList(overview.upcoming, "NO UPCOMING LOCAL REVISION.", true)}</div></article>
                <article class="workspace-panel"><header><h2>NEEDS REVIEW</h2><span>${overview.needsReview.length}</span></header><div class="workspace-panel-content">${this.renderList(overview.needsReview, "NO UNASSESSED LOCAL REVISION ITEMS.", true)}</div></article>
                <article class="workspace-panel"><header><h2>UNSCHEDULED</h2><span>${overview.unscheduled.length}</span></header><div class="workspace-panel-content">${this.renderList(overview.unscheduled, "NO UNSCHEDULED LOCAL REVISION ITEMS.", true)}</div></article>
                <article class="workspace-panel stud-revision-policy"><header><h2>PLANNING POLICY</h2><span>LOCAL / EXPLICIT</span></header><div class="workspace-panel-content"><p>Plans use local schedule, priority, known related deadlines and explicit study feedback. Suggestions never become Calendar events or external changes.</p><button type="button" data-stud-revision-create>CREATE REVISION ITEM</button></div></article>
            </section>
            <section class="stud-revision-library-grid">
                <article class="workspace-panel"><header><h2>REVISION LIBRARY</h2><span>${this.state.items.length} LOCAL</span></header><div class="workspace-panel-content"><form class="stud-revision-filters" data-stud-revision-form="FILTER"><label>MODULE<select class="aegis-select" name="courseId">${courseOptions}</select></label><label>STATUS<select class="aegis-select" name="status">${["ALL", "ACTIVE", "PAUSED", "COMPLETED"].map(value => `<option${this.state.filters.status === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>PRIORITY<select class="aegis-select" name="priority">${["ALL", "URGENT", "HIGH", "NORMAL", "LOW"].map(value => `<option${this.state.filters.priority === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>SCHEDULE<select class="aegis-select" name="scheduled">${["ALL", "SCHEDULED", "UNSCHEDULED"].map(value => `<option${this.state.filters.scheduled === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>SORT<select class="aegis-select" name="sort">${[["NEXT", "NEXT REVISION"], ["LAST_STUDIED", "LAST STUDIED"], ["CREATED", "CREATED"], ["MODIFIED", "MODIFIED"], ["TITLE", "TITLE"]].map(([value, label]) => `<option value="${value}"${this.state.filters.sort === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><button type="submit">APPLY</button></form><div class="stud-detail-actions"><button type="button" data-stud-revision-create>CREATE ITEM</button></div>${this.renderList(this.state.items, "NO LOCAL REVISION ITEMS MATCH THE CURRENT FILTER.")}</div></article>
                <article class="workspace-panel stud-revision-detail-panel"><header><h2>REVISION ITEM</h2><span>LOCAL FIRST</span></header><div class="workspace-panel-content">${this.state.context ? this.renderDetail(this.state.context) : `<div class="stud-empty-inline">SELECT A REVISION ITEM TO PLAN, STUDY, LINK ACADEMIC MATERIAL OR REVIEW HISTORY.</div>`}</div></article>
            </section>
        </section>`;
    }

    renderDetail(context) {
        const {revision, course, assignments, notes, resources, papers, history, planning} = context;
        const related = (label, items, type) => `<section class="stud-object-section"><header><h3>${label}</h3><span>${items.length}</span></header>${items.length ? `<div>${items.slice(0, 12).map(item => `<button type="button" data-stud-search-result="${this.escape(item.id)}" data-stud-search-type="${type}"><strong>${this.escape(item.title)}</strong><small>${type.replace(/_/g, " ")}</small></button>`).join("")}</div>` : `<p>NO EXPLICIT ${label} LINK.</p>`}</section>`;
        const session = this.state.activeSession;
        return `<div class="stud-detail-heading"><small>REVISION TARGET</small><h3>${this.escape(revision.title || revision.prompt)}</h3><span>${this.escape(revision.status)} · ${this.escape(revision.priority)} · ${this.escape(planning.state)}</span><small>${this.escape(planning.reason)}</small></div>
            <section class="stud-revision-facts"><article><small>MODULE</small><strong>${this.escape(course ? this.parent.courseLabel(course.id) : "UNASSIGNED")}</strong></article><article><small>LAST STUDIED</small><strong>${dateText(revision.lastStudiedAt)}</strong></article><article><small>STUDY TIME</small><strong>${revision.accumulatedStudyMinutes || 0} MIN</strong></article><article><small>NEXT</small><strong>${dateText(revision.scheduledRevisionAt || revision.nextPlannedRevisionAt)}</strong></article></section>
            ${session ? `<section class="stud-study-session" role="status"><strong>STUDY SESSION · ${this.escape(session.status)}</strong><span>Elapsed time is local and only committed when you pause or finish.</span><div>${session.status === "STARTED" ? `<button type="button" data-stud-revision-session="PAUSE" data-stud-session-id="${this.escape(session.id)}">PAUSE</button>` : `<button type="button" data-stud-revision-session="RESUME" data-stud-session-id="${this.escape(session.id)}">RESUME</button>`}<button type="button" data-stud-revision-finish data-stud-session-id="${this.escape(session.id)}">FINISH</button><button type="button" data-stud-revision-session="CANCEL" data-stud-session-id="${this.escape(session.id)}">CANCEL</button></div></section>` : `<div class="stud-detail-actions"><button type="button" data-stud-revision-start="${this.escape(revision.id)}">START STUDY SESSION</button></div>`}
            <form class="stud-edit-grid" data-stud-revision-form="UPDATE" data-stud-revision-id="${this.escape(revision.id)}"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required value="${this.escape(revision.title || revision.prompt)}"></label><label>STATUS<select class="aegis-select" name="status">${["ACTIVE", "PAUSED", "COMPLETED"].map(value => `<option${revision.status === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>PRIORITY<select class="aegis-select" name="priority">${["URGENT", "HIGH", "NORMAL", "LOW"].map(value => `<option${revision.priority === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>ESTIMATE (MIN)<input class="aegis-input" name="estimatedDurationMinutes" type="number" min="0" max="1440" value="${revision.estimatedDurationMinutes ?? ""}"></label><label>CONFIDENCE<select class="aegis-select" name="confidence">${["UNKNOWN", "LOW", "MEDIUM", "HIGH"].map(value => `<option${revision.confidence === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>DIFFICULTY<select class="aegis-select" name="difficulty">${["UNKNOWN", "LOW", "MEDIUM", "HIGH"].map(value => `<option${revision.difficulty === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>SCHEDULED REVISION<input class="aegis-input" name="scheduledRevisionAt" type="datetime-local" value="${inputDate(revision.scheduledRevisionAt)}"></label><label>SPACED REVISION<select class="aegis-select" name="spacedRevisionEnabled"><option value="false"${!revision.spacedRevisionEnabled ? " selected" : ""}>OFF</option><option value="true"${revision.spacedRevisionEnabled ? " selected" : ""}>ON / LOCAL HELPER</option></select></label><label class="stud-wide-label">DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000">${this.escape(revision.description || "")}</textarea></label><button type="submit">SAVE LOCAL REVISION</button></form>
            <div class="stud-detail-actions"><button type="button" data-stud-revision-link="${this.escape(revision.id)}">LINK LOCAL MATERIAL</button><button type="button" data-stud-revision-pin="${this.escape(revision.id)}">${revision.pinned ? "UNPIN" : "PIN TO PLAN"}</button><button type="button" data-stud-revision-archive="${this.escape(revision.id)}">ARCHIVE ITEM</button></div>
            ${related("ASSIGNMENTS", assignments, "ASSIGNMENT")}${related("NOTES", notes, "NOTE")}${related("RESOURCES", resources, "RESOURCE")}${related("RESEARCH", papers, "RESEARCH_PAPER")}
            <section class="stud-object-section"><header><h3>STUDY HISTORY</h3><span>${history.length}</span></header>${history.length ? `<div>${history.slice(0, 20).map(item => `<article class="stud-history-row"><strong>${this.escape(item.status)}</strong><span>${Math.round((item.elapsedSeconds || 0) / 60)} MIN · ${dateText(item.startedAt)}</span><small>${this.escape(item.confidence || "UNKNOWN")} CONFIDENCE${item.note ? ` · ${this.escape(item.note)}` : ""}</small></article>`).join("")}</div>` : `<p>NO EXPLICIT LOCAL STUDY SESSION RECORDED.</p>`}</section>`;
    }

    dialog(kind, trigger, context = {}) {
        const dialog = this.parent.view.querySelector("[data-stud-dialog-element]");
        const body = dialog && dialog.querySelector("[data-stud-dialog-body]");
        if (!dialog || !body) return;
        this.parent.state.dialogReturnFocus = trigger || document.activeElement;
        const revision = this.state.context && this.state.context.revision;
        const assignmentId = context.assignmentId || "";
        const courseId = context.courseId || revision && revision.courseId || "";
        const sourceType = context.sourceType || "";
        const sourceId = context.sourceId || "";
        const template = {
            CREATE: ["CREATE REVISION ITEM", `<form class="stud-dialog-form" data-stud-revision-form="CREATE"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required autofocus value="${this.escape(context.title || "")}"></label><label>MODULE<select class="aegis-select" name="courseId"><option value="">UNASSIGNED</option>${this.parent.state.courses.map(item => `<option value="${this.escape(item.id)}"${item.id === courseId ? " selected" : ""}>${this.escape(this.parent.courseLabel(item.id))}</option>`).join("")}</select></label><label>PRIORITY<select class="aegis-select" name="priority"><option>NORMAL</option><option>HIGH</option><option>URGENT</option><option>LOW</option></select></label><label>ESTIMATE (MIN)<input class="aegis-input" name="estimatedDurationMinutes" type="number" min="0" max="1440"></label><label>SCHEDULED REVISION<input class="aegis-input" name="scheduledRevisionAt" type="datetime-local"></label><label>SPACED REVISION<select class="aegis-select" name="spacedRevisionEnabled"><option value="false">OFF</option><option value="true">ON / LOCAL HELPER</option></select></label><label class="stud-wide-label">DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000"></textarea></label><input type="hidden" name="assignmentId" value="${this.escape(assignmentId)}"><input type="hidden" name="sourceType" value="${this.escape(sourceType)}"><input type="hidden" name="sourceId" value="${this.escape(sourceId)}"><button type="submit">CREATE LOCAL REVISION ITEM</button></form>`],
            FINISH: ["FINISH STUDY SESSION", `<form class="stud-dialog-form" data-stud-revision-form="FINISH" data-stud-session-id="${this.escape(context.sessionId)}"><p>Completion records only this explicit local session. A spaced suggestion is never an external Calendar event.</p><label>DIFFICULTY<select class="aegis-select" name="difficulty"><option>UNKNOWN</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label><label>CONFIDENCE<select class="aegis-select" name="confidence"><option>UNKNOWN</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label><label class="stud-wide-label">SHORT STUDY NOTE<textarea class="aegis-input" name="note" maxlength="1000"></textarea></label><label>SCHEDULE SPACED SUGGESTION<select class="aegis-select" name="scheduleNext"><option value="false">NO</option><option value="true">YES / IF ENABLED</option></select></label><button type="submit">FINISH + RECORD LOCALLY</button></form>`],
            LINK: ["LINK LOCAL ACADEMIC MATERIAL", `<form class="stud-dialog-form" data-stud-revision-form="LINK" data-stud-revision-id="${this.escape(context.revisionId || revision && revision.id)}"><p>Enter one existing canonical local object ID. This creates only an explicit local relationship; no provider or file is opened.</p><label>OBJECT TYPE<select class="aegis-select" name="toType"><option>ASSIGNMENT</option><option>NOTE</option><option>RESOURCE</option><option>RESEARCH_PAPER</option><option>REVISION_ITEM</option></select></label><label>LOCAL OBJECT ID<input class="aegis-input" name="toId" maxlength="96" required autofocus></label><label>RELATION<select class="aegis-select" name="relationType"><option>SUPPORTS</option><option>REFERENCES</option><option>RELATES_TO</option><option>USES</option></select></label><button type="submit">LINK EXPLICITLY</button></form>`]
        }[kind];
        if (!template) return;
        dialog.querySelector("#stud_dialog_title").textContent = template[0];
        body.innerHTML = template[1];
        if (!dialog.open) dialog.showModal();
        requestAnimationFrame(() => body.querySelector("[autofocus], input, select, textarea, button")?.focus());
    }

    async handleClick(event) {
        const open = event.target.closest("[data-stud-revision-open]");
        const create = event.target.closest("[data-stud-revision-create]");
        const start = event.target.closest("[data-stud-revision-start]");
        const transition = event.target.closest("[data-stud-revision-session]");
        const finish = event.target.closest("[data-stud-revision-finish]");
        const link = event.target.closest("[data-stud-revision-link]");
        const pin = event.target.closest("[data-stud-revision-pin]");
        const archive = event.target.closest("[data-stud-revision-archive]");
        const fromAssignment = event.target.closest("[data-stud-create-revision-assignment]");
        const fromCourse = event.target.closest("[data-stud-create-revision-course]");
        if (!(open || create || start || transition || finish || link || pin || archive || fromAssignment || fromCourse)) return false;
        try {
            if (open) await this.select(open.dataset.studRevisionOpen);
            else if (create) this.dialog("CREATE", create);
            else if (fromAssignment) { const assignment = this.parent.state.assignments.find(item => item.id === fromAssignment.dataset.studCreateRevisionAssignment); this.dialog("CREATE", fromAssignment, {assignmentId: fromAssignment.dataset.studCreateRevisionAssignment, courseId: assignment && assignment.courseId, title: assignment && `Prepare: ${assignment.title}`}); }
            else if (fromCourse) { const course = this.parent.state.courses.find(item => item.id === fromCourse.dataset.studCreateRevisionCourse); this.dialog("CREATE", fromCourse, {courseId: fromCourse.dataset.studCreateRevisionCourse, title: course && `Revision: ${course.title}`}); }
            else if (start) { await this.request("stud-study-session-start", {revisionItemId: start.dataset.studRevisionStart}); await this.refresh(); this.parent.render(); this.showToast(this.parent.view, "LOCAL STUDY SESSION STARTED"); }
            else if (transition) { await this.request("stud-study-session-transition", {sessionId: transition.dataset.studSessionId, action: transition.dataset.studRevisionSession}); await this.refresh(); this.parent.render(); this.showToast(this.parent.view, `STUDY SESSION ${transition.dataset.studRevisionSession}D`); }
            else if (finish) this.dialog("FINISH", finish, {sessionId: finish.dataset.studSessionId});
            else if (link) this.dialog("LINK", link, {revisionId: link.dataset.studRevisionLink});
            else if (pin) { const item = this.state.context.revision; await this.request("stud-revision-schedule", {revisionItemId: item.id, pinned: !item.pinned, note: "Explicit study plan pin"}); await this.refresh(); this.parent.render(); }
            else if (archive) { if (!window.confirm("Archive this local revision item? Study history is retained.")) return true; await this.request("stud-entity-archive", {entityType: "REVISION_ITEM", entityId: archive.dataset.studRevisionArchive, confirmation: true}); this.state.selectedId = ""; await this.refresh(); this.parent.render(); }
        } catch (error) { this.showToast(this.parent.view, error.message || "REVISION ACTION FAILED"); }
        return true;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-revision-form]");
        if (!form) return false;
        event.preventDefault();
        const kind = form.dataset.studRevisionForm;
        const value = Object.fromEntries(new FormData(form).entries());
        try {
            if (kind === "FILTER") { this.state.filters = {...this.state.filters, ...value}; await this.refresh(); this.parent.render(); return true; }
            if (kind === "CREATE") {
                const {assignmentId, sourceType, sourceId} = value; delete value.assignmentId; delete value.sourceType; delete value.sourceId;
                if (value.estimatedDurationMinutes === "") delete value.estimatedDurationMinutes;
                if (!value.scheduledRevisionAt) delete value.scheduledRevisionAt; else value.scheduledRevisionAt = new Date(value.scheduledRevisionAt).toISOString();
                const created = await this.request("stud-entity-create", {entityType: "REVISION_ITEM", value, provenance: {field: "title", observedValue: value.title, sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}});
                if (assignmentId) await this.request("stud-relationship-create", {fromType: "REVISION_ITEM", fromId: created.id, relationType: "SUPPORTS", toType: "ASSIGNMENT", toId: assignmentId, source: "USER"});
                if (sourceType && sourceId) await this.request("stud-relationship-create", {fromType: "REVISION_ITEM", fromId: created.id, relationType: "REFERENCES", toType: sourceType, toId: sourceId, source: "USER"});
                this.parent.closeDialog(); this.state.selectedId = created.id; await this.refresh(); this.parent.render(); this.showToast(this.parent.view, "LOCAL REVISION ITEM CREATED"); return true;
            }
            if (kind === "UPDATE") {
                if (value.estimatedDurationMinutes === "") delete value.estimatedDurationMinutes;
                if (value.scheduledRevisionAt) value.scheduledRevisionAt = new Date(value.scheduledRevisionAt).toISOString(); else value.scheduledRevisionAt = null;
                await this.request("stud-entity-update", {entityType: "REVISION_ITEM", entityId: form.dataset.studRevisionId, value}); await this.refresh(); this.parent.render(); this.showToast(this.parent.view, "LOCAL REVISION SAVED"); return true;
            }
            if (kind === "FINISH") { await this.request("stud-study-session-transition", {sessionId: form.dataset.studSessionId, action: "FINISH", difficulty: value.difficulty, confidence: value.confidence, note: value.note, scheduleNext: value.scheduleNext === "true"}); this.parent.closeDialog(); await this.refresh(); this.parent.render(); this.showToast(this.parent.view, "STUDY SESSION RECORDED LOCALLY"); return true; }
            if (kind === "LINK") { await this.request("stud-relationship-create", {fromType: "REVISION_ITEM", fromId: form.dataset.studRevisionId, relationType: value.relationType, toType: value.toType, toId: value.toId, source: "USER"}); this.parent.closeDialog(); await this.refresh(); this.parent.render(); this.showToast(this.parent.view, "LOCAL ACADEMIC MATERIAL LINKED"); return true; }
        } catch (error) { this.showToast(this.parent.view, error.message || "REVISION FORM FAILED"); }
        return true;
    }
}

module.exports = {StudRevisionWorkspace, localId};
