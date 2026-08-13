"use strict";

class StudProgressWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.parent = options.parent;
        this.state = {tab: "OVERVIEW", data: null, sources: null, error: null, loading: false};
    }

    async initialize() { await this.refresh(); }
    async refresh(courseId = null) {
        this.state.loading = true;
        try { this.state.data = await this.request("stud-progress-overview", courseId ? {courseId} : {}); this.state.error = null; }
        catch (error) { this.state.error = error.message || "PROGRESS ANALYTICS UNAVAILABLE"; }
        finally { this.state.loading = false; }
    }

    badge(state) { return `<span class="stud-progress-state state-${this.escape(String(state || "UNKNOWN").toLowerCase())}">${this.escape(state || "UNKNOWN")}</span>`; }
    value(value, suffix = "") { return value === null || value === undefined ? "UNKNOWN" : `${this.escape(String(value))}${suffix}`; }
    card(label, value, detail = "", state = "KNOWN") { return `<article class="stud-progress-card"><small>${this.escape(label)}</small><strong>${this.value(value)}</strong>${detail ? `<span>${this.escape(detail)}</span>` : ""}${this.badge(state)}</article>`; }
    date(value) { if (!value) return "UNKNOWN"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "UNKNOWN" : new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric"}).format(date).toUpperCase(); }

    render() {
        if (this.state.loading && !this.state.data) return `<section class="workspace-panel stud-empty-state"><div class="workspace-panel-content">LOADING LOCAL PROGRESS ANALYTICS…</div></section>`;
        if (this.state.error) return `<section class="workspace-panel stud-empty-state"><header><h2>PROGRESS ANALYTICS</h2>${this.badge("UNKNOWN")}</header><div class="workspace-panel-content"><strong>LOCAL REPORTING UNAVAILABLE</strong><p>${this.escape(this.state.error)}</p></div></section>`;
        const data = this.state.data;
        if (!data) return "";
        const content = this.state.tab === "COURSES" ? this.renderCourses(data) : this.state.tab === "ASSESSMENTS" ? this.renderAssessments(data) : this.state.tab === "WORKLOAD" ? this.renderWorkload(data) : this.state.tab === "REVISION" ? this.renderRevision(data) : this.state.tab === "ACTIVITY" ? this.renderActivity(data) : this.renderOverview(data);
        return `<section class="stud-progress-shell">
            <header class="workspace-panel stud-progress-header"><div><small>STUD / DERIVED LOCAL REPORTING</small><h2>PROGRESS ANALYTICS</h2><p>Canonical local records, explicit provenance and bounded session history only. No prediction, gamification or external queries.</p></div><div>${this.badge("LOCAL / OFFLINE")}</div></header>
            <nav class="stud-progress-tabs" aria-label="Progress analytics views">${["OVERVIEW", "COURSES", "ASSESSMENTS", "WORKLOAD", "REVISION", "ACTIVITY"].map(tab => `<button type="button" data-stud-progress-tab="${tab}"${this.state.tab === tab ? " class=\"active\" aria-current=\"page\"" : ""}>${tab}</button>`).join("")}</nav>
            ${content}
            ${this.renderSources()}
            <footer class="workspace-panel stud-progress-policy"><small>REPORTING POLICY</small><span>DERIVED / LOCAL / EXPLICIT DATA ONLY · NO LMS, CALENDAR, EMAIL, PROVIDER OR AI ACTIVITY</span></footer>
        </section>`;
    }

    renderOverview(data) {
        const summary = data.summary;
        return `<section class="stud-progress-grid">
            <section class="workspace-panel"><header><h2>ACADEMIC POSITION</h2>${this.badge(summary.completeness.state)}</header><div class="workspace-panel-content stud-progress-metrics">${this.card("COURSES", summary.courses, "canonical local courses")}${this.card("ASSIGNMENTS", summary.assignments, `${summary.completedAssignments} completed`)}${this.card("COMPLETION", summary.completionPercent === null ? null : `${summary.completionPercent}%`, "assignment state only", summary.assignments ? "PARTIAL" : "UNKNOWN")}${this.card("ASSESSMENT", summary.grades.weightedAverage === null ? "NO WEIGHTED AVG" : `${summary.grades.weightedAverage}%`, summary.grades.method, summary.grades.state)}</div></section>
            <section class="workspace-panel"><header><h2>ATTENTION REQUIRED</h2><span>${data.attention.length} ITEMS</span></header><div class="workspace-panel-content stud-progress-list">${data.attention.length ? data.attention.map(item => `<button type="button" class="stud-progress-row" data-stud-progress-assignment="${this.escape(item.assignmentId || "")}"><strong>${this.escape(item.kind)}</strong><span>${this.escape(item.label)}</span><small>${this.escape(item.detail)}</small></button>`).join("") : "<p>NO LOCAL CONFLICTS OR OVERDUE ITEMS FOUND.</p>"}</div></section>
            <section class="workspace-panel"><header><h2>WORKLOAD WINDOW</h2>${this.badge(summary.workload.state)}</header><div class="workspace-panel-content stud-progress-metrics">${this.card("OVERDUE", summary.workload.overdue, "incomplete only", summary.workload.overdue ? "CONFLICTING" : "KNOWN")}${this.card("NEXT 7 DAYS", summary.workload.next7, "explicit deadlines")}${this.card("UNSCHEDULED", summary.workload.unscheduled, "no local deadline", summary.workload.unscheduled ? "PARTIAL" : "KNOWN")}</div></section>
            <section class="workspace-panel"><header><h2>REVISION / STUDY</h2>${this.badge(summary.revision.state)}</header><div class="workspace-panel-content stud-progress-metrics">${this.card("REVISION ITEMS", summary.revision.items, "canonical local items")}${this.card("FINISHED SESSIONS", summary.revision.sessions, "explicit sessions")}${this.card("STUDY MINUTES", summary.revision.minutes, "finished sessions only")}</div></section>
            <section class="workspace-panel stud-progress-wide"><header><h2>DATA COMPLETENESS</h2><button type="button" data-stud-progress-sources="OVERVIEW">INSPECT SOURCES</button></header><div class="workspace-panel-content stud-progress-metrics">${this.card("ASSIGNMENTS", summary.completeness.assignments, "canonical records")}${this.card("DEADLINES", summary.completeness.deadlines, "known due dates")}${this.card("GRADES", summary.completeness.grades, "only compatible numerical schemes average")}${this.card("CONFLICTS", summary.completeness.conflicts, "conflicts remain unresolved", summary.completeness.conflicts ? "CONFLICTING" : "KNOWN")}</div></section>
        </section>`;
    }

    renderCourses(data) { return `<section class="workspace-panel"><header><h2>COURSE PROGRESS</h2><span>DERIVED FROM ASSIGNMENTS / REVISION / PROVENANCE</span></header><div class="workspace-panel-content stud-progress-table">${data.courses.length ? data.courses.map(report => `<button type="button" class="stud-progress-course-row" data-stud-progress-course="${this.escape(report.course.id)}"><strong>${this.escape(report.course.code || report.course.title)}</strong><span>${this.escape(report.course.title)}</span><span>${this.value(report.completionPercent, "%")} COMPLETE</span><span>${this.value(report.grades.weightedAverage, "%")} GRADE</span>${this.badge(report.completeness.state)}</button>`).join("") : "<p>NO LOCAL COURSES.</p>"}</div></section>`; }
    renderAssessments(data) { const assessment = data.assessments; return `<section class="workspace-panel"><header><h2>ASSESSMENTS / GRADES</h2>${this.badge(assessment.state)}</header><div class="workspace-panel-content"><p>Only valid numerical grades are normalized for averages. Text, pass/fail and incompatible schemes remain visible but are never fabricated into a score.</p><div class="stud-progress-metrics">${this.card("WEIGHTED AVERAGE", assessment.summary.weightedAverage === null ? null : `${assessment.summary.weightedAverage}%`, assessment.summary.method, assessment.summary.state)}${this.card("KNOWN WEIGHT", assessment.summary.knownWeight === 0 ? null : `${assessment.summary.knownWeight}%`, "explicit assessment weights")}${this.card("NON-NUMERIC", assessment.summary.nonNumericCount, "visible, excluded from average", assessment.summary.nonNumericCount ? "PARTIAL" : "KNOWN")}${this.card("INCOMPATIBLE", assessment.summary.incompatibleCount, "not averaged", assessment.summary.incompatibleCount ? "PARTIAL" : "KNOWN")}</div><div class="stud-progress-table">${assessment.rows.map(row => `<button type="button" class="stud-progress-course-row" data-stud-progress-assignment="${this.escape(row.assignment.id)}"><strong>${this.escape(row.assignment.title)}</strong><span>${this.escape(row.grade.kind === "NUMERIC" ? `${row.grade.raw}/${row.grade.maximum} · ${row.grade.percent.toFixed(2)}%` : row.grade.value || row.grade.kind)}</span><span>${this.escape(row.assignment.gradeScheme || "UNKNOWN")}</span>${this.badge(row.conflicts.length ? "CONFLICTING" : row.grade.kind === "UNKNOWN" ? "UNKNOWN" : "KNOWN")}</button>`).join("")}</div></div></section>`; }
    renderWorkload(data) { return `<section class="workspace-panel"><header><h2>DEADLINES / WORKLOAD</h2>${this.badge(data.workload.state)}</header><div class="workspace-panel-content"><p>Descriptive planning view from explicit deadlines and assignment status. It does not predict performance or infer effort where none was recorded.</p><div class="stud-progress-table">${data.workload.items.length ? data.workload.items.map(item => `<button type="button" class="stud-progress-course-row" data-stud-progress-assignment="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><span>${this.date(item.dueDate)}</span><span>${item.days < 0 ? `${Math.abs(item.days)} DAY(S) OVERDUE` : `${item.days} DAY(S) REMAINING`}</span>${this.badge(item.days < 0 ? "CONFLICTING" : "KNOWN")}</button>`).join("") : "<p>NO INCOMPLETE ASSIGNMENTS WITH LOCAL DEADLINES.</p>"}</div></div></section>`; }
    renderRevision(data) { return `<section class="stud-progress-grid"><section class="workspace-panel"><header><h2>REVISION / STUDY ACTIVITY</h2>${this.badge(data.revision.state)}</header><div class="workspace-panel-content stud-progress-metrics">${this.card("ITEMS", data.revision.items, "local revision items")}${this.card("FINISHED SESSIONS", data.revision.sessions, "explicit sessions")}${this.card("MINUTES", data.revision.minutes, "finished sessions only")}${data.revision.confidence.map(item => this.card(`${item.level} CONFIDENCE`, item.count, "user-recorded session value", item.count ? "KNOWN" : "UNKNOWN")).join("")}</div></section><section class="workspace-panel"><header><h2>RECENT SESSIONS</h2><span>EXPLICIT ACTIVITY</span></header><div class="workspace-panel-content stud-progress-list">${data.revision.recent.length ? data.revision.recent.map(item => `<article class="stud-progress-row"><strong>${this.date(item.endedAt)}</strong><span>${this.value(Math.round((item.elapsedSeconds || 0) / 60), " MIN")}</span><small>${this.escape(item.confidence || "UNKNOWN")} CONFIDENCE · ${this.escape(item.difficulty || "UNKNOWN")} DIFFICULTY</small></article>`).join("") : "<p>NO FINISHED LOCAL STUDY SESSIONS.</p>"}</div></section></section>`; }
    renderActivity(data) { return `<section class="workspace-panel"><header><h2>ACADEMIC ACTIVITY</h2>${this.badge(data.activity.state)}</header><div class="workspace-panel-content stud-progress-list">${data.activity.entries.length ? data.activity.entries.map(item => `<article class="stud-progress-row"><strong>${this.escape(item.kind.replace(/_/g, " "))}</strong><span>${this.escape(item.label)}</span><small>${this.date(item.at)} · ${this.escape(item.provenance)}</small></article>`).join("") : "<p>NO LOCAL ACADEMIC ACTIVITY AVAILABLE.</p>"}</div></section>`; }
    renderSources() { if (!this.state.sources) return ""; const source = this.state.sources; return `<section class="workspace-panel stud-progress-sources"><header><h2>METRIC SOURCES</h2><button type="button" data-stud-progress-close-sources>CLOSE</button></header><div class="workspace-panel-content"><p>${this.escape(source.scope)} · LOCAL PROVENANCE INSPECTION</p><pre>${this.escape(JSON.stringify(source, null, 2).slice(0, 12000))}</pre></div></section>`; }

    async handleClick(event) {
        const tab = event.target.closest("[data-stud-progress-tab]");
        const course = event.target.closest("[data-stud-progress-course]");
        const assignment = event.target.closest("[data-stud-progress-assignment]");
        const sources = event.target.closest("[data-stud-progress-sources]");
        if (event.target.closest("[data-stud-progress-close-sources]")) { this.state.sources = null; this.parent.render(); return true; }
        if (tab) { this.state.tab = tab.dataset.studProgressTab; this.parent.render(); return true; }
        if (course) { this.state.data = await this.request("stud-progress-overview", {courseId: course.dataset.studProgressCourse}); this.state.tab = "COURSES"; this.parent.render(); return true; }
        if (assignment) { await this.parent.selectAssignment(assignment.dataset.studProgressAssignment, "ASSIGNMENTS"); return true; }
        if (sources) { this.state.sources = await this.request("stud-progress-metric-sources", {scope: sources.dataset.studProgressSources}); this.parent.render(); return true; }
        return false;
    }
    async handleSubmit() { return false; }
}

window.StudProgressWorkspace = StudProgressWorkspace;
