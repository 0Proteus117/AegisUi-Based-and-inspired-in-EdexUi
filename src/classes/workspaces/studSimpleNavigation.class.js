"use strict";

// Transient route only. Academic ownership, validation and persistence remain
// with the existing main-process services. Navigating never starts work.
class StudSimpleNavigation {
    constructor(parent) {
        this.parent = parent; this.route = {browse: "YEARS"}; this.page = null;
        this.busy = false; this.error = ""; this.sequence = 0; this.assignment = null;
    }
    async load(route = this.route) {
        const sequence = ++this.sequence;
        this.route = {...route}; this.busy = true; this.error = ""; this.page = null; this.assignment = null;
        this.parent.render();
        try {
            const page = await this.parent.request("stud-course-organisation", {...route, limit: 40});
            if (sequence === this.sequence) this.page = page;
        } catch (error) { if (sequence === this.sequence) this.error = error.message; }
        finally { if (sequence === this.sequence) { this.busy = false; this.parent.render(); this.focusHeading(); } }
    }
    focusHeading() {
        if (!this.parent.view || !["OVERVIEW", "MODULES"].includes(this.parent.state.activeView)) return;
        const heading = this.parent.view.querySelector(".stud-simple-navigation h2");
        if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); }
    }
    button(label, action, value = "", secondary = "") {
        return `<button type="button" data-stud-simple="${action}" data-value="${this.parent.escape(value)}"${this.busy ? " disabled" : ""}><strong>${this.parent.escape(label)}</strong>${secondary ? `<span>${this.parent.escape(secondary)}</span>` : ""}</button>`;
    }
    courseTitle(course) {
        if (course.presentation?.origin === "USER") return course.presentation.label;
        let title = course.title || "Untitled course";
        // Only exact duplicate structured prefixes; no invented aliases.
        for (const prefix of [course.code, course.shortName]) if (prefix && title.startsWith(`${prefix} — `)) title = title.slice(prefix.length + 3);
        return title;
    }
    async click(event) {
        const target = event.target.closest("[data-stud-simple]");
        if (!target) return false;
        if (this.busy) return true;
        const action = target.dataset.studSimple, value = target.dataset.value;
        try {
            if (action === "years") await this.load({browse: "YEARS"});
            else if (action === "current-year") await this.load({browse: "COURSES", academicYear: this.page.preference.academicYear});
            else if (action === "set-year" || action === "clear-year") {
                const preference = this.page.preference;
                this.busy = true; this.parent.render();
                await this.parent.request("stud-navigation-year-set", {academicYear: action === "clear-year" ? null : this.route.academicYear, expectedVersion: preference.rowVersion});
                await this.load(this.route);
            }
            else if (action === "year") {
                const year = this.page.items[Number(value)]; if (!year) return true;
                await this.load({browse: "COURSES", academicYear: year.academicYear});
            } else if (action === "courses") await this.load({browse: "COURSES", academicYear: this.route.academicYear ?? null});
            else if (action === "page") await this.load({...this.route, offset: Number(value)});
            else if (action === "kind") await this.load({...this.route, kind: value, offset: 0});
            else if (action === "course") {
                const course = this.page.items.find(item => item.id === value); if (!course) return true;
                this.busy = true; this.parent.render();
                await this.parent.selectCourse(value, "MODULES");
            } else if (action === "assignment" || action === "continue") {
                this.busy = true; this.parent.render();
                await this.parent.selectAssignment(value, "MODULES");
                this.page = null;
                this.assignment = this.parent.state.assignmentContext;
                this.assignmentLabel = await this.parent.request("stud-display-label-read", {entityType: "ASSIGNMENT", entityId: value});
                this.route = {browse: "CONTENT", academicYear: this.parent.state.courseContext?.course.academicYear || null, courseId: this.assignment.assignment.courseId, kind: "ASSIGNMENT"};
                this.busy = false; this.parent.render(); this.focusHeading();
            } else if (action === "content") await this.load(this.route);
            else if (action === "requirements" || action === "workspace") {
                this.parent.assignmentWorkspace.state.mode = action === "requirements" ? "REQUIREMENTS" : "WORK";
                this.parent.setActiveView("ASSIGNMENTS");
            } else if (action === "source") await this.parent.openSearchResult(this.route.kind, value);
        } catch (error) { this.busy = false; this.error = error.message; this.parent.render(); }
        return true;
    }
    async submit(event) {
        const labelForm = event.target.matches("[data-stud-label-form]");
        if (!labelForm && !event.target.matches("[data-stud-simple-search]")) return false;
        event.preventDefault();
        if (this.busy) return true;
        if (labelForm) {
            const form = event.target, label = new FormData(form).get("label"), reset = event.submitter?.value === "reset";
            const sequence = this.sequence, assignmentId = this.assignment?.assignment.id;
            this.busy = true;
            // Keep the entered value visible on failure. Saving never updates a
            // canonical title or provider observation.
            try {
                const saved = await this.parent.request("stud-display-label-set", {entityType: form.dataset.type, entityId: form.dataset.id, expectedVersion: Number(form.dataset.version), label: reset ? null : label});
                if (sequence !== this.sequence) return true;
                this.busy = false;
                if (assignmentId !== this.assignment?.assignment.id) return true;
                if (this.assignment) { this.assignmentLabel = saved; this.busy = false; this.parent.render(); }
                else await this.load(this.route);
            } catch (error) { if (sequence === this.sequence) this.busy = false; throw error; }
        } else await this.load({...this.route, offset: 0, query: new FormData(event.target).get("query") || ""});
        return true;
    }
    nameDetails(presentation) {
        if (!presentation) return "";
        const e = value => this.parent.escape(value), p = presentation;
        return `<details class="stud-simple-name"><summary>Name and original source</summary><p>${e(p.explanation)}</p><p>Original: ${e(p.original)}</p>${p.sourceChanged ? "<p>The original name changed since your correction. Check whether your display name still fits.</p>" : ""}
            <form data-stud-label-form data-type="${e(p.entityType)}" data-id="${e(p.entityId)}" data-version="${p.rowVersion}"><label>Display name<input name="label" maxlength="160" required value="${e(p.label)}"></label><button type="submit">Save name</button><button type="submit" value="reset" formnovalidate>Reset name</button></form></details>`;
    }
    brief(current) {
        const e = value => this.parent.escape(value), state = current.requirementsContract;
        const contract = state?.current || state?.draft, reviewed = contract?.lifecycle === "APPROVED";
        const items = contract?.items || [], candidates = (contract?.candidates || []).filter(c => ["PENDING", "UNRESOLVED"].includes(c.disposition));
        const value = item => {
            const text = item.displayValue || item.normalizedValue || item.label;
            return item.type === "DEADLINE" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text) ? `Deadline: ${this.parent.dateText(text)}` : text;
        };
        const deliverables = items.filter(i => i.type === "DELIVERABLE");
        const essentials = items.filter(i => ["LENGTH", "FORMAT", "CITATION", "DEADLINE"].includes(i.type));
        const unresolved = [...items.filter(i => i.resolutionState !== "RESOLVED"), ...candidates.filter(c => c.disposition === "UNRESOLVED")];
        const missing = [];
        if (!reviewed) missing.push("Requirements still need your review.");
        if (!deliverables.length) missing.push("What to hand in has not been confirmed in the saved requirements.");
        if (!current.assignment.dueDate && !items.some(i => i.type === "DEADLINE")) missing.push("Delivery date is not confirmed.");
        if (state?.current && state.draft) missing.push("A newer draft of the requirements is awaiting review; this summary uses the approved revision.");
        if (contract?.completeness === "INCOMPLETE") missing.push("The saved requirements are incomplete.");
        if (contract?.completeness === "CONFLICTING") missing.push("Some requirements have conflicting information.");
        const freshness = contract?.freshness?.reviewCondition;
        if (reviewed && freshness && freshness !== "CURRENT") missing.push(({SOURCE_CHANGED: "Source material changed since review.", SOURCE_MISSING: "A reviewed source is no longer available.", OCR_BLOCKED: "Some source text needs OCR.", NEEDS_REVIEW: "The source material needs review."})[freshness] || "Source freshness needs checking.");
        unresolved.slice(0, 8).forEach(i => missing.push(`Needs clarification: ${value(i)}`));
        if (unresolved.length > 8) missing.push(`${unresolved.length - 8} more unresolved items in the requirements review.`);
        const list = rows => `<ul>${rows.slice(0, 8).map(i => `<li>${e(value(i))}${i.resolutionState !== "RESOLVED" ? " — needs clarification" : ""}</li>`).join("")}</ul>${rows.length > 8 ? `<p>${rows.length - 8} more in the requirements review.</p>` : ""}`;
        const coverage = contract?.coverage;
        return `<section class="stud-simple-brief"><h3>What to hand in</h3><p>${reviewed ? "From your reviewed requirements" : "Draft requirements — not yet approved"}</p>${deliverables.length ? list(deliverables) : "<p>Check the assessment brief to confirm the deliverable.</p>"}
            ${essentials.length ? `<h3>Key requirements</h3>${list(essentials)}` : ""}
            ${missing.length ? `<h3>What still needs checking</h3><ul>${missing.map(text => `<li>${e(text)}</li>`).join("")}</ul>` : "<p>No unresolved items are recorded in these requirements. This is not a guarantee of academic completeness.</p>"}
            ${candidates.length ? `<details><summary>${candidates.length} suggestions still to review</summary><p>Suggestions are not confirmed requirements.</p>${list(candidates)}</details>` : ""}
            <details><summary>Original instructions and review details</summary><p>${e(current.assignment.description || "No written instructions saved.")}</p>${coverage ? `<p>Extraction inspected ${coverage.inspectedDocuments} of ${coverage.linkedDocuments} linked documents and ${coverage.chunksInspected} chunks. ${coverage.ocrRequiredDocuments} documents need OCR.${coverage.truncationReached ? " Extraction limits were reached; some content was not inspected." : ""}</p>` : "<p>No saved extraction coverage is available. Absence of a requirement here does not mean none exists.</p>"}</details></section>`;
    }
    render() {
        const e = value => this.parent.escape(value), page = this.page, route = this.route;
        const year = route.academicYear || "Unclassified year", date = value => this.parent.dateText(value);
        const crumbs = `${this.button("Years", "years")}${route.browse !== "YEARS" ? `<span aria-hidden="true">/</span>${this.button(year, "courses")}` : ""}${page?.course ? `<span aria-hidden="true">/</span><span>${e(this.courseTitle(page.course))}</span>` : ""}`;
        let body = "";
        if (this.busy) body = `<p role="status">Loading saved coursework…</p>`;
        else if (this.error) body = `<p role="alert">${e(this.error)}</p>${this.button("Back to years", "years")}`;
        else if (this.assignment) {
            const current = this.parent.state.assignmentContext?.assignment.id === this.assignment.assignment.id ? this.parent.state.assignmentContext : this.assignment;
            const a = current.assignment;
            body = `<header><p>${e(this.parent.state.courseContext?.course.title || "Independent assignment")}</p><h2>${e(this.assignmentLabel?.label || a.title)}</h2><p>${a.dueDate ? `Saved due date: ${e(date(a.dueDate))}` : "Due date not confirmed"}</p></header>${this.brief(current)}
                <div class="stud-simple-actions">${this.button("Review requirements", "requirements")}${this.button("Open workbench", "workspace")}${a.courseId ? this.button("Back to course", "content") : this.button("Back to years", "years")}</div>${this.nameDetails(this.assignmentLabel)}`;
        } else if (!page) body = `<p role="status">Loading saved courses…</p>`;
        else if (route.browse === "YEARS") {
            const active = this.parent.state.workingContext?.activeAssignment;
            const lastYear = this.parent.state.workingContext?.activeCourse?.academicYear;
            const preferred = lastYear ? page.items.findIndex(item => item.academicYear === lastYear) : -1;
            const preference = page.preference || {academicYear: null, available: false, rowVersion: 0};
            const yearButton = (item, index) => this.button(item.academicYear || "Unclassified", "year", index, `${item.courseCount} subject${item.courseCount === 1 ? "" : "s"}`);
            body = `<header><p>Your study space</p><h2>Choose an academic year</h2><p>Open a year to see only its subjects.</p></header>${active && (!preference.available || lastYear === preference.academicYear) ? `<div class="stud-simple-continue">${this.button(`Continue: ${active.title}`, "continue", active.id, "Last saved work")}</div>` : ""}
                ${preference.available ? `<p>Current academic year — chosen by you</p><div class="stud-simple-grid">${this.button(preference.academicYear, "current-year")}</div><details><summary>Other years and year settings</summary><div class="stud-simple-grid">${page.items.map((item, index) => item.academicYear === preference.academicYear ? "" : yearButton(item, index)).join("")}</div>${this.button("Clear current year", "clear-year")}</details>` : `${preference.academicYear ? "<p>Your chosen year has no available courses. Choose another year below.</p>" : ""}${preferred >= 0 ? `<p>Last used year</p><div class="stud-simple-grid">${yearButton(page.items[preferred], preferred)}</div><details><summary>Other years</summary><div class="stud-simple-grid">${page.items.map((item, index) => index === preferred ? "" : yearButton(item, index)).join("")}</div></details>` : `<div class="stud-simple-grid">${page.items.map(yearButton).join("")}</div>`}`}
                ${!page.total ? `<p>No courses saved yet.</p><button type="button" data-stud-nav-view="MOODLE">Connect Moodle</button><button type="button" data-stud-dialog="CREATE_MODULE">Create a course</button>` : ""}`;
        } else if (route.browse === "COURSES") {
            const terms = [...new Set(page.items.map(item => item.academicTerm || "Term not specified"))];
            body = `<header><p>${e(year)}</p><h2>Your subjects</h2>${route.academicYear && page.preference ? page.preference.academicYear === route.academicYear ? "<p>Your current academic year</p>" : this.button("Use as my current year", "set-year") : ""}</header><details${route.query ? " open" : ""}><summary>Find a subject</summary><form data-stud-simple-search><label>Find a subject<input name="query" maxlength="120" value="${e(route.query || "")}" placeholder="Name or module code"></label><button type="submit">Find</button></form></details>
                ${terms.map(term => `<section class="stud-simple-term"><h3>${e(term)}</h3><div class="stud-simple-grid">${page.items.filter(item => (item.academicTerm || "Term not specified") === term).map(item => this.button(this.courseTitle(item), "course", item.id)).join("")}</div></section>`).join("")}${!page.total ? "<p>No subjects match this selection.</p>" : ""}`;
        } else {
            const labels = {ASSIGNMENT: "Assignments", RESOURCE: "Course material", ACADEMIC_DOCUMENT: "Documents"};
            body = `<header><p>${e(year)} · ${e(page.course.academicTerm || "Term not specified")}</p><h2>${e(this.courseTitle(page.course))}</h2></header>
                <div class="stud-simple-kinds" aria-label="Course content">${Object.entries(labels).map(([kind, label]) => `<button type="button" data-stud-simple="kind" data-value="${kind}"${route.kind === kind ? ' aria-current="page"' : ""}>${label} <span>${page.counts[kind]}</span></button>`).join("")}</div>
                <div class="stud-simple-list">${page.items.map(item => `<div>${this.button(item.presentation?.label || item.title || item.displayName || "Untitled", route.kind === "ASSIGNMENT" ? "assignment" : "source", item.id, route.kind === "ASSIGNMENT" ? item.dueDate ? `Due ${date(item.dueDate)}` : "Due date not confirmed" : item.presentation?.origin === "TITLE_RULE" ? `Suggested label · ${item.title}` : route.kind === "ACADEMIC_DOCUMENT" ? "Open saved document" : "Inspect material")}${route.kind !== "ASSIGNMENT" ? this.nameDetails(item.presentation) : ""}</div>`).join("")}</div>
                ${!page.total ? `<p>${route.kind === "ASSIGNMENT" ? "No assignments saved for this subject. This does not mean there are no assessments; Moodle may not have published them yet." : "No items saved in this category yet."}</p>` : ""}
                ${this.nameDetails(page.course.presentation)}<details><summary>Course options</summary><div class="stud-simple-actions"><button data-stud-dialog="EDIT_MODULE" type="button">Edit course</button><button data-stud-dialog="CREATE_ASSIGNMENT" type="button">Add assignment</button><button data-stud-nav-view="MOODLE" type="button">Moodle connection</button></div></details>`;
        }
        const paging = page && !this.assignment && (page.offset > 0 || page.nextOffset !== null) ? `<footer class="stud-simple-pagination">${page.offset > 0 ? this.button("Previous", "page", Math.max(0, page.offset - page.limit)) : ""}<span>${page.offset + 1}–${page.offset + page.items.length} of ${page.total}</span>${page.nextOffset !== null ? this.button("Next", "page", page.nextOffset) : ""}</footer>` : "";
        return `<section class="stud-simple-navigation" aria-label="Academic navigation"><nav class="stud-simple-breadcrumb" aria-label="Academic path">${crumbs}</nav>${body}${paging}</section>`;
    }
}
if (typeof module !== "undefined") module.exports = {StudSimpleNavigation};
else window.StudSimpleNavigation = StudSimpleNavigation;
