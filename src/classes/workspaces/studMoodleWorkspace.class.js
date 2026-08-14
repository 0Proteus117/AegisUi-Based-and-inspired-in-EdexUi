"use strict";

const CAPABILITY_LABELS = Object.freeze({
    SITE_INFO: "SITE INFO", COURSES: "COURSES", COURSE_CONTENT: "COURSE CONTENT", ASSIGNMENTS: "ASSIGNMENTS", ASSIGNMENT_STATUS: "SUBMISSION STATUS", RESOURCES: "RESOURCES", CALENDAR: "CALENDAR", GRADES: "GRADES", FEEDBACK: "FEEDBACK", COMPLETION: "COMPLETION", FORUM_READ: "FORUM READ", ANNOUNCEMENTS: "ANNOUNCEMENTS", NOTIFICATIONS: "NOTIFICATIONS", QUIZZES: "QUIZZES", PARTICIPANTS: "PARTICIPANTS", FILES: "FILES", ASSIGNMENT_WRITE: "ASSIGNMENT SUBMISSION", FORUM_WRITE: "FORUM POSTING", MESSAGE_WRITE: "MESSAGING", QUIZ_WRITE: "QUIZ ATTEMPTS"
});
const WRITE_CAPABILITIES = new Set(["ASSIGNMENT_WRITE", "FORUM_WRITE", "MESSAGE_WRITE", "QUIZ_WRITE"]);

function displayDate(value) {
    if (!value) return "NOT YET";
    const date = new Date(value); if (Number.isNaN(date.getTime())) return "UNKNOWN";
    return new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"}).format(date).toUpperCase();
}

class StudMoodleWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {provider: null, probe: null, busy: false, requestId: "", error: "", calendarObservations: [], reauthenticate: false, indexing: false};
    }

    async initialize() { await this.refreshStatus(); }
    async refreshStatus() { try { this.state.provider = await this.request("stud-moodle-status"); this.state.error = ""; } catch (error) { this.state.error = error.message || "Moodle connection state is unavailable."; } }
    status() { return this.state.provider && this.state.provider.status || "CONFIG_REQUIRED"; }
    renderServiceCard() {
        const provider = this.state.provider || {}; const configured = provider.tokenConfigured;
        return `<article class="workspace-panel stud-moodle-service-card"><header><h2>MOODLE</h2><span>${this.escape(this.status())}</span></header><div class="workspace-panel-content"><p>Capability-driven, read-only institutional context. Aegis never stores your university password or browser cookies. Academic files that Moodle explicitly exposes may be copied into managed STUD storage with bounded provenance and hashes.</p><dl class="stud-moodle-mini-status"><div><dt>REST TOKEN</dt><dd>${configured ? "SECURELY CONFIGURED" : "NOT CONFIGURED"}</dd></div><div><dt>LAST SYNC</dt><dd>${this.escape(displayDate(provider.lastSuccessfulSync))}</dd></div></dl><div class="stud-detail-actions"><button type="button" data-stud-moodle-action="open">OPEN MOODLE</button><button type="button" data-stud-moodle-action="probe">CAPABILITY PROBE</button></div></div></article>`;
    }

    render() {
        const provider = this.state.provider || {capabilities: {}, tokenConfigured: false, icsConfigured: false, secureStorageAvailable: false};
        const capabilities = provider.capabilities || {}; const sync = provider.sync || {automaticSync: false, intervalMinutes: 360, nextSyncAt: null, lastResult: {}}; const lastResult = sync.lastResult || {}; const courses = this.parent.state.courses || []; const assignments = this.parent.state.assignments || [];
        const selectedCourse = courses.find(item => item.id === this.parent.state.selectedCourseId) || null;
        const selectedAssignments = selectedCourse ? assignments.filter(item => item.courseId === selectedCourse.id).slice(0, 80) : [];
        const selectedResources = selectedCourse && this.parent.state.courseContext && this.parent.state.courseContext.resources || [];
        const managedDocuments = this.parent.documents && this.parent.documents.state.documents || [];
        const readyDocuments = managedDocuments.filter(item => item.documentType === "COURSE_MATERIAL" && item.extractionStatus === "NOT_ANALYZED");
        return `<section class="stud-moodle-shell">
            <header class="stud-section-title"><div><small>STUD / CONNECTED SERVICES / MOODLE</small><h2>MOODLE ACADEMIC CONTEXT</h2><p>Explicit read-only synchronization. Capability detection reports what this specific Moodle account and service expose; unsupported features remain visible rather than becoming empty panels.</p></div><span>${this.escape(this.status())}</span></header>
            ${this.state.error ? `<section class="stud-moodle-error"><strong>MOODLE ${this.escape(this.status())}</strong><p>${this.escape(this.state.error)}</p></section>` : ""}
            <section class="stud-moodle-control-grid">
                <article class="workspace-panel"><header><h2>CONNECTION</h2><span>SECURE / PERSISTENT</span></header><div class="workspace-panel-content"><form data-stud-moodle-form="configure" class="stud-moodle-config-form" novalidate><label>MOODLE BASE URL<input class="aegis-input" name="baseUrl" type="url" maxlength="1024" autocomplete="url" placeholder="https://moodle.example.edu" value="${this.escape(provider.baseUrl || "")}" required></label><label>DISPLAY NAME<input class="aegis-input" name="displayName" maxlength="160" value="${this.escape(provider.displayName || "Moodle")}"></label><label>WEB SERVICE TOKEN <small>${this.state.reauthenticate ? "ENTER A NEW SANCTIONED TOKEN" : "OPTIONAL TO REPLACE"}</small><input class="aegis-input" name="token" type="password" autocomplete="off" maxlength="4096" placeholder="${provider.tokenConfigured ? "SECURE TOKEN ALREADY CONFIGURED" : "SANCTIONED MOODLE TOKEN"}"></label><label>CALENDAR EXPORT URL <small>OPTIONAL TO REPLACE</small><input class="aegis-input" name="icsUrl" type="password" autocomplete="off" maxlength="4096" placeholder="${provider.icsConfigured ? "SECURE ICS URL ALREADY CONFIGURED" : "HTTPS SAME-HOST ICS URL"}"></label><p class="stud-moodle-security-note">The instance configuration persists locally. Authorized tokens stay encrypted in macOS secure storage; no password, cookies, token-bearing file URL or secret enters SQLite, logs or release evidence.</p><footer><button type="submit">SAVE SECURE CONFIG</button><button type="button" data-stud-moodle-action="open-web">OPEN MOODLE LOGIN</button></footer></form></div></article>
                <article class="workspace-panel"><header><h2>SYNCHRONIZATION</h2><span>${this.escape(this.status())}</span></header><div class="workspace-panel-content"><dl class="stud-moodle-status-grid"><div><dt>AUTHENTICATION</dt><dd>${provider.tokenConfigured ? "SECURE TOKEN CONFIGURED" : "MANUAL CONFIGURATION REQUIRED"}</dd></div><div><dt>LAST SYNC</dt><dd>${this.escape(displayDate(provider.lastSuccessfulSync))}</dd></div><div><dt>NEXT SYNC</dt><dd>${sync.automaticSync ? this.escape(displayDate(sync.nextSyncAt)) : "AUTOMATIC SYNC OFF"}</dd></div><div><dt>LAST RESULT</dt><dd>${this.escape(String(lastResult.status || "NOT RUN").replace(/_/g, " "))}</dd></div><div><dt>CHANGES FOUND</dt><dd>${this.escape(String(lastResult.changes ? Object.values(lastResult.changes).reduce((total, value) => total + (Number(value) || 0), 0) : 0))}</dd></div><div><dt>READY FOR INDEX</dt><dd>${readyDocuments.length} PDF${readyDocuments.length === 1 ? "" : "S"}</dd></div><div><dt>SECURE STORAGE</dt><dd>${provider.secureStorageAvailable ? "AVAILABLE" : "UNAVAILABLE"}</dd></div></dl><form data-stud-moodle-form="sync-preferences" class="stud-moodle-sync-preferences"><label><input name="automaticSync" type="checkbox" ${sync.automaticSync ? "checked" : ""}> AUTOMATIC SYNC</label><label>SYNC INTERVAL<select class="aegis-input" name="intervalMinutes"><option value="60" ${sync.intervalMinutes === 60 ? "selected" : ""}>EVERY HOUR</option><option value="180" ${sync.intervalMinutes === 180 ? "selected" : ""}>EVERY 3 HOURS</option><option value="360" ${sync.intervalMinutes === 360 ? "selected" : ""}>EVERY 6 HOURS</option><option value="720" ${sync.intervalMinutes === 720 ? "selected" : ""}>EVERY 12 HOURS</option><option value="1440" ${sync.intervalMinutes === 1440 ? "selected" : ""}>DAILY</option></select></label><button type="submit" ${this.state.busy || this.state.indexing ? "disabled" : ""}>SAVE AUTO SYNC</button></form><div class="stud-detail-actions"><button type="button" data-stud-moodle-action="probe" ${this.state.busy || this.state.indexing ? "disabled" : ""}>${this.state.busy ? "WORKING…" : "CAPABILITY PROBE"}</button><button type="button" data-stud-moodle-action="sync" ${this.state.busy || this.state.indexing ? "disabled" : ""}>SYNC NOW · ALL ACADEMIC DATA</button><button type="button" data-stud-moodle-action="index-all" ${this.state.busy || this.state.indexing || !readyDocuments.length ? "disabled" : ""}>${this.state.indexing ? "INDEXING COURSE MATERIAL…" : "INDEX ALL COURSE MATERIAL"}</button><button type="button" data-stud-moodle-action="reauthenticate">REAUTHENTICATE</button><button type="button" data-stud-moodle-action="forget" ${this.state.busy || this.state.indexing ? "disabled" : ""}>FORGET MOODLE ACCOUNT</button>${provider.icsConfigured ? `<button type="button" data-stud-moodle-action="sync-ics" ${this.state.busy || this.state.indexing ? "disabled" : ""}>SYNC ICS FALLBACK</button>` : ""}${this.state.busy ? `<button type="button" data-stud-moodle-action="cancel">CANCEL</button>` : ""}</div></div></article>
            </section>
            <section class="stud-moodle-capability-panel workspace-panel"><header><h2>CAPABILITY PROBE</h2><span>READ-ONLY POLICY</span></header><div class="workspace-panel-content"><div class="stud-moodle-capability-grid">${Object.keys(CAPABILITY_LABELS).map(key => `<article class="${WRITE_CAPABILITIES.has(key) ? "policy-disabled" : ""}"><strong>${CAPABILITY_LABELS[key]}</strong><span>${this.escape(capabilities[key] || (WRITE_CAPABILITIES.has(key) ? "POLICY_DISABLED" : "UNKNOWN")).replace(/_/g, " ")}</span><small>${WRITE_CAPABILITIES.has(key) ? "SERVER AVAILABILITY IS NOT EXECUTED BY AEGIS" : "INSTANCE / ACCOUNT CAPABILITY"}</small></article>`).join("")}</div><p class="stud-moodle-policy-copy">Write actions can be reported by Moodle but are never enabled by Aegis: no submissions, modification, forum posting, messaging, grading, enrollment, quiz attempt, file upload or profile change is implemented.</p></div></section>
            <section class="stud-moodle-data-grid">
                <article class="workspace-panel"><header><h2>COURSES</h2><span>CANONICAL STUD</span></header><div class="workspace-panel-content"><div class="stud-moodle-list">${courses.length ? courses.map(course => `<button type="button" data-stud-moodle-course="${this.escape(course.id)}"${selectedCourse && selectedCourse.id === course.id ? " class=\"selected\"" : ""}><strong>${this.escape(course.code || course.shortName || "MODULE")} · ${this.escape(course.title)}</strong><small>${this.escape(course.status)} · ${course.startDate ? this.escape(displayDate(course.startDate)) : "DATE UNKNOWN"}</small></button>`).join("") : `<div class="stud-empty-inline">NO CANONICAL COURSES YET. Configure Moodle and run an explicit synchronization, or continue using STUD locally.</div>`}</div></div></article>
                <article class="workspace-panel"><header><h2>SELECTED COURSE</h2><span>${selectedCourse ? "CANONICAL / PROVENANCE" : "WAITING"}</span></header><div class="workspace-panel-content">${selectedCourse ? `<div class="stud-detail-heading"><small>COURSE</small><h3>${this.escape(selectedCourse.title)}</h3><span>${this.escape(selectedCourse.code || selectedCourse.shortName || "NO CODE")} · ${this.escape(selectedCourse.status)}</span></div><section class="stud-moodle-course-readout"><h3>UPCOMING ASSIGNMENTS</h3>${selectedAssignments.length ? selectedAssignments.map(item => `<button type="button" data-stud-moodle-assignment="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><span>${item.dueDate ? this.escape(displayDate(item.dueDate)) : "DUE DATE UNKNOWN"} · ${this.escape(item.submissionStatus || "UNKNOWN")}</span></button>`).join("") : `<p>NO ASSIGNMENTS STORED FOR THIS COURSE.</p>`}</section><section class="stud-moodle-course-readout"><h3>COURSE MATERIAL</h3>${selectedResources.length ? selectedResources.slice(0, 8).map(resource => { const document = managedDocuments.find(item => item.sourceResourceId === resource.id); const state = document ? document.extractionStatus === "NOT_ANALYZED" ? "READY FOR INDEX" : document.extractionStatus : resource.localReference ? "DOWNLOADED / UNSUPPORTED" : "REFERENCE ONLY"; return `<button type="button" data-stud-search-result="${this.escape(resource.id)}" data-stud-search-type="RESOURCE"><strong>${this.escape(resource.title)}</strong><span>${this.escape(resource.mimeType || resource.type || "RESOURCE")} · ${this.escape(state)}</span></button>`; }).join("") : `<p>NO COURSE MATERIAL HAS BEEN EXPOSED OR SYNCED YET.</p>`}</section><section class="stud-moodle-course-readout stud-moodle-file-state"><h3>RESOURCE POLICY</h3><strong>USER-INITIATED / MANAGED STORAGE</strong><small>SYNC NOW downloads only bounded academic files explicitly exposed by Moodle. Each stored file keeps a hash, MIME type and Moodle provenance; token-bearing URLs and browser sessions are never retained.</small></section>` : `<div class="stud-empty-inline">SELECT A CANONICAL COURSE TO REVIEW ITS ASSIGNMENTS, RESOURCES AND FIELD-LEVEL MOODLE OBSERVATIONS.</div>`}</div></article>
            </section>
            <aside class="stud-moodle-fallbacks workspace-panel"><header><h2>FALLBACKS & OFFLINE POLICY</h2><span>REST → ICS → WEB</span></header><div class="workspace-panel-content"><p>REST is preferred when the institution exposes sanctioned Web Services. A configured Moodle calendar export URL is a constrained ICS fallback for events/deadlines only. OPEN MOODLE LOGIN is the normal institutional login path. None of these paths mutates Aegis Calendar.</p><p>SYNC NOW uses stored secure credentials to reconcile courses, assignments, grades, feedback and published academic resources. Downloaded files live only in managed STUD storage; token-bearing URLs and credentials are never canonical data. Forgetting the account stops future syncs but retains already imported academic material.</p></div></aside>
        </section>`;
    }

    async run(kind) {
        const requestId = `stud_moodle_ui_${Date.now()}_${Math.random().toString(16).slice(2)}`; this.state.busy = true; this.state.requestId = requestId; this.state.error = ""; this.parent.render();
        try {
            let result;
            if (kind === "probe") { result = await this.request("stud-moodle-probe", {requestId}); this.state.probe = result.probe; this.state.provider = result.provider; this.showToast(this.parent.view, "MOODLE CAPABILITIES PROBED"); }
            else if (kind === "sync") { result = await this.request("stud-moodle-sync", {requestId}); this.state.provider = result.provider; this.state.calendarObservations = result.calendarObservations || []; await this.parent.documents.refresh(); await this.parent.refresh(); this.showToast(this.parent.view, result.partial ? "MOODLE PARTIAL SYNC STORED" : `MOODLE SYNC COMPLETE · ${result.files && result.files.downloaded || 0} FILES`); }
            else if (kind === "sync-ics") { result = await this.request("stud-moodle-ics-sync", {requestId}); this.state.provider = result.provider; await this.parent.refresh(); this.showToast(this.parent.view, "MOODLE ICS OBSERVATIONS SYNCED"); }
            return result;
        } catch (error) { this.state.error = error.message || "Moodle operation failed safely."; }
        finally { this.state.busy = false; this.state.requestId = ""; this.parent.render(); }
    }

    async configure(form) {
        const values = Object.fromEntries(new FormData(form).entries());
        const payload = {baseUrl: values.baseUrl, displayName: values.displayName};
        if (values.token && values.token.trim()) payload.token = values.token.trim();
        if (values.icsUrl && values.icsUrl.trim()) payload.icsUrl = values.icsUrl.trim();
        form.querySelector("[name=token]").value = ""; form.querySelector("[name=icsUrl]").value = "";
        try { this.state.provider = await this.request("stud-moodle-configure", payload); this.state.error = ""; this.state.reauthenticate = false; this.showToast(this.parent.view, "MOODLE CONFIG SAVED IN SECURE STORAGE"); }
        catch (error) { this.state.error = error.message || "Moodle configuration was not saved."; }
        this.parent.render();
    }

    async indexAllCourseMaterial() {
        const pending = (this.parent.documents && this.parent.documents.state.documents || []).filter(item => item.documentType === "COURSE_MATERIAL" && item.extractionStatus === "NOT_ANALYZED").slice(0, 100);
        if (!pending.length) return;
        this.state.indexing = true; this.state.error = ""; this.parent.render();
        let indexed = 0; let failed = 0;
        try {
            for (const document of pending) {
                try {
                    const result = await this.request("stud-document-analyze", {documentId: document.id, requestId: `moodle_index_${Date.now()}_${document.id.slice(-10)}`});
                    if (result.status !== "CANCELLED") indexed += 1;
                } catch (_) { failed += 1; }
            }
            await this.parent.documents.refresh();
            this.showToast(this.parent.view, failed ? `COURSE MATERIAL INDEXED · ${indexed} COMPLETE · ${failed} NEED REVIEW` : `COURSE MATERIAL INDEXED · ${indexed} DOCUMENTS`);
        } finally { this.state.indexing = false; this.parent.render(); }
    }

    async handleClick(event) {
        const action = event.target.closest("[data-stud-moodle-action]");
        const course = event.target.closest("[data-stud-moodle-course]"); const assignment = event.target.closest("[data-stud-moodle-assignment]");
        if (course) { await this.parent.selectCourse(course.dataset.studMoodleCourse, "MOODLE"); return true; }
        if (assignment) { await this.parent.selectAssignment(assignment.dataset.studMoodleAssignment, "ASSIGNMENTS"); return true; }
        if (!action) return false;
        const kind = action.dataset.studMoodleAction;
        if (kind === "open") { this.parent.setActiveView("MOODLE"); return true; }
        if (kind === "open-web") { try { await this.request("stud-moodle-open-web", {}); } catch (error) { this.state.error = error.message; this.parent.render(); } return true; }
        if (kind === "reauthenticate") { this.state.reauthenticate = true; this.state.error = "Complete institutional authentication in Moodle, then enter the sanctioned Web Service token here. Aegis does not store passwords or copy browser sessions."; this.parent.render(); return true; }
        if (kind === "forget") { try { this.state.provider = await this.request("stud-moodle-forget-account", {}); this.state.probe = null; this.showToast(this.parent.view, "MOODLE ACCOUNT FORGOTTEN · LOCAL STUD MATERIAL RETAINED"); } catch (error) { this.state.error = error.message; } this.parent.render(); return true; }
        if (kind === "index-all") { await this.indexAllCourseMaterial(); return true; }
        if (kind === "cancel") { if (this.state.requestId) await this.request("stud-moodle-cancel", {requestId: this.state.requestId}); return true; }
        if (["probe", "sync", "sync-ics"].includes(kind)) { await this.run(kind); return true; }
        return false;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-moodle-form]"); if (!form) return false;
        event.preventDefault();
        if (form.dataset.studMoodleForm === "configure") await this.configure(form);
        if (form.dataset.studMoodleForm === "sync-preferences") {
            const values = new FormData(form);
            try { this.state.provider = {...this.state.provider, sync: await this.request("stud-moodle-sync-preferences", {automaticSync: values.get("automaticSync") === "on", intervalMinutes: Number(values.get("intervalMinutes"))})}; this.showToast(this.parent.view, "MOODLE AUTO SYNC PREFERENCE SAVED"); }
            catch (error) { this.state.error = error.message || "Moodle auto sync preference was not saved."; }
            this.parent.render();
        }
        return true;
    }

    dispose() { if (this.state.requestId) this.request("stud-moodle-cancel", {requestId: this.state.requestId}).catch(() => {}); this.state.requestId = ""; }
}

module.exports = {StudMoodleWorkspace, CAPABILITY_LABELS, WRITE_CAPABILITIES};
