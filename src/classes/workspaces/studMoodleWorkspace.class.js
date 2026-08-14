"use strict";

const CAPABILITY_LABELS = Object.freeze({
    SITE_INFO: "SITE INFO", COURSES: "COURSES", COURSE_CONTENT: "COURSE CONTENT", ASSIGNMENTS: "ASSIGNMENTS", ASSIGNMENT_STATUS: "SUBMISSION STATUS", RESOURCES: "RESOURCES", CALENDAR: "CALENDAR", GRADES: "GRADES", FEEDBACK: "FEEDBACK", COMPLETION: "COMPLETION", FORUM_READ: "FORUM READ", ANNOUNCEMENTS: "ANNOUNCEMENTS", NOTIFICATIONS: "NOTIFICATIONS", QUIZZES: "QUIZZES", PARTICIPANTS: "PARTICIPANTS", FILES: "FILES", ASSIGNMENT_WRITE: "ASSIGNMENT SUBMISSION", FORUM_WRITE: "FORUM POSTING", MESSAGE_WRITE: "MESSAGING", QUIZ_WRITE: "QUIZ ATTEMPTS"
});
const WRITE_CAPABILITIES = new Set(["ASSIGNMENT_WRITE", "FORUM_WRITE", "MESSAGE_WRITE", "QUIZ_WRITE"]);
const UEL_MOODLE_URL = "https://moodle.uel.ac.uk";

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
        this.authPoll = null;
        this.authResumeAttempted = false;
    }

    async initialize() {
        await this.refreshStatus();
        this.onWindowFocus = () => this.resumePendingAuthentication().catch(() => {});
        if (typeof window !== "undefined") window.addEventListener("focus", this.onWindowFocus);
    }
    async refreshStatus() { try { this.state.provider = await this.request("stud-moodle-status"); this.state.error = ""; } catch (error) { this.state.error = error.message || "Moodle connection state is unavailable."; } }
    async resumePendingAuthentication() {
        await this.refreshStatus();
        const provider = this.state.provider || {};
        if (provider.authenticationPending && !provider.tokenConfigured && !this.authResumeAttempted) {
            this.authResumeAttempted = true;
            try { await this.request("stud-moodle-open-web", {}); }
            catch (error) { this.state.error = error.message || "The pending Moodle sign-in could not be resumed."; }
        }
        this.parent.render();
    }
    startAuthPolling() {
        if (this.authPoll) clearInterval(this.authPoll);
        const expiresAt = Date.now() + 10 * 60 * 1000;
        const poll = async () => {
            await this.refreshStatus();
            const provider = this.state.provider || {};
            if (provider.tokenConfigured || !provider.authenticationPending || Date.now() >= expiresAt) {
                clearInterval(this.authPoll); this.authPoll = null;
                if (provider.tokenConfigured) { this.authResumeAttempted = false; await this.parent.documents.refresh(); await this.parent.refresh(); }
            }
            this.parent.render();
        };
        this.authPoll = setInterval(() => poll().catch(() => {}), 1000);
    }
    status() { return this.state.provider && this.state.provider.status || "CONFIG_REQUIRED"; }
    renderServiceCard() {
        const provider = this.state.provider || {}; const configured = provider.tokenConfigured || provider.browserSessionConfigured;
        return `<article class="workspace-panel stud-moodle-service-card"><header><h2>MOODLE</h2><span>${this.escape(this.status())}</span></header><div class="workspace-panel-content"><p>Read-only academic context from your institution.</p><dl class="stud-moodle-mini-status"><div><dt>CONNECTION</dt><dd>${configured ? "CONNECTED" : "NOT CONNECTED"}</dd></div><div><dt>LAST SYNC</dt><dd>${this.escape(displayDate(provider.lastSuccessfulSync))}</dd></div></dl><div class="stud-detail-actions"><button type="button" data-stud-moodle-action="open">OPEN MOODLE</button></div></div></article>`;
    }

    render() {
        const provider = this.state.provider || {capabilities: {}, tokenConfigured: false, icsConfigured: false, secureStorageAvailable: false};
        const capabilities = provider.capabilities || {}; const sync = provider.sync || {automaticSync: false, intervalMinutes: 360, nextSyncAt: null, lastResult: {}}; const lastResult = sync.lastResult || {}; const courses = this.parent.state.courses || []; const assignments = this.parent.state.assignments || [];
        const connected = Boolean(provider.tokenConfigured || provider.browserSessionConfigured);
        const showCapabilities = Boolean(this.state.probe || connected || provider.lastSuccessfulSync);
        const selectedCourse = courses.find(item => item.id === this.parent.state.selectedCourseId) || null;
        const selectedAssignments = selectedCourse ? assignments.filter(item => item.courseId === selectedCourse.id).slice(0, 80) : [];
        const selectedResources = selectedCourse && this.parent.state.courseContext && this.parent.state.courseContext.resources || [];
        const managedDocuments = this.parent.documents && this.parent.documents.state.documents || [];
        const readyDocuments = managedDocuments.filter(item => item.documentType === "COURSE_MATERIAL" && item.extractionStatus === "NOT_ANALYZED");
        return `<section class="stud-moodle-shell">
            <header class="stud-section-title"><div><small>STUD / CONNECTED SERVICES</small><h2>MOODLE</h2><p>Connect once, then Aegis keeps your academic context current within your chosen sync settings.</p></div><span>${this.escape(this.status())}</span></header>
            ${this.state.error ? `<section class="stud-moodle-error"><strong>MOODLE ${this.escape(this.status())}</strong><p>${this.escape(this.state.error)}</p></section>` : ""}
            <section class="workspace-panel stud-moodle-primary-card"><header><h2>${connected ? "MOODLE CONNECTED" : "CONNECT YOUR MOODLE"}</h2><span>${connected ? "SECURE / READ ONLY" : "UNIVERSITY OF EAST LONDON"}</span></header><div class="workspace-panel-content">${connected ? `<p>Your connection is ready. Aegis only reads the academic information your account exposes.</p><div class="stud-detail-actions"><button type="button" data-stud-moodle-action="sync" ${this.state.busy || this.state.indexing ? "disabled" : ""}>${this.state.busy ? "SYNCING…" : "SYNC NOW"}</button><button type="button" data-stud-moodle-action="index-all" ${this.state.busy || this.state.indexing || !readyDocuments.length ? "disabled" : ""}>${this.state.indexing ? "INDEXING…" : "INDEX COURSE MATERIAL"}</button><button type="button" data-stud-moodle-action="settings">SETTINGS</button></div>` : `<p>${provider.authenticationPending ? "Your UEL session is ready. Aegis will resume the secure return automatically; use CONTINUE CONNECTION only if the browser remains on Moodle Home." : "Sign in through your normal browser. UEL requires system-browser SSO; Aegis never receives or stores your password."}</p><div class="stud-detail-actions"><button type="button" data-stud-moodle-action="connect">${provider.authenticationPending ? "CONTINUE CONNECTION" : "CONNECT UEL MOODLE"}</button><button type="button" data-stud-moodle-action="settings">CONNECTION OPTIONS</button></div>`}</div></section>
            <section class="workspace-panel stud-moodle-status-card"><header><h2>SYNC STATUS</h2><button type="button" class="stud-subtle-action" data-stud-moodle-action="settings">OPTIONS</button></header><div class="workspace-panel-content"><dl class="stud-moodle-status-grid"><div><dt>LAST SYNC</dt><dd>${this.escape(displayDate(provider.lastSuccessfulSync))}</dd></div><div><dt>NEXT SYNC</dt><dd>${sync.automaticSync ? this.escape(displayDate(sync.nextSyncAt)) : "OFF"}</dd></div><div><dt>LAST RESULT</dt><dd>${this.escape(String(lastResult.status || "NOT RUN").replace(/_/g, " "))}</dd></div><div><dt>CHANGES</dt><dd>${this.escape(String(lastResult.changes ? Object.values(lastResult.changes).reduce((total, value) => total + (Number(value) || 0), 0) : 0))}</dd></div></dl></div></section>
            ${this.state.showSettings ? `<details class="workspace-panel stud-moodle-settings" open><summary>CONNECTION &amp; SYNC OPTIONS</summary><div class="workspace-panel-content"><form data-stud-moodle-form="configure" class="stud-moodle-config-form" novalidate><label>MOODLE BASE URL<input class="aegis-input" name="baseUrl" type="url" maxlength="1024" autocomplete="url" value="${this.escape(provider.baseUrl || UEL_MOODLE_URL)}" required></label><label>DISPLAY NAME<input class="aegis-input" name="displayName" maxlength="160" value="${this.escape(provider.displayName || "UEL Moodle")}"></label><label>WEB SERVICE TOKEN <small>ONLY IF YOUR INSTITUTION ISSUES ONE</small><input class="aegis-input" name="token" type="password" autocomplete="off" maxlength="4096" placeholder="OPTIONAL SANCTIONED TOKEN"></label><label>CALENDAR EXPORT URL <small>OPTIONAL</small><input class="aegis-input" name="icsUrl" type="password" autocomplete="off" maxlength="4096" placeholder="OPTIONAL HTTPS ICS URL"></label><p class="stud-moodle-security-note">Password and MFA stay in the official UEL browser flow. Authorized Moodle tokens are returned directly to Aegis and encrypted in macOS secure storage; no secret enters SQLite or logs.</p><footer><button type="submit">SAVE CONNECTION OPTIONS</button><button type="button" data-stud-moodle-action="reauthenticate">REAUTHENTICATE</button><button type="button" data-stud-moodle-action="forget" ${this.state.busy || this.state.indexing ? "disabled" : ""}>FORGET ACCOUNT</button></footer></form><form data-stud-moodle-form="sync-preferences" class="stud-moodle-sync-preferences"><label><input name="automaticSync" type="checkbox" ${sync.automaticSync ? "checked" : ""}> AUTOMATIC SYNC</label><label>SYNC INTERVAL<select class="aegis-input" name="intervalMinutes"><option value="60" ${sync.intervalMinutes === 60 ? "selected" : ""}>EVERY HOUR</option><option value="180" ${sync.intervalMinutes === 180 ? "selected" : ""}>EVERY 3 HOURS</option><option value="360" ${sync.intervalMinutes === 360 ? "selected" : ""}>EVERY 6 HOURS</option><option value="720" ${sync.intervalMinutes === 720 ? "selected" : ""}>EVERY 12 HOURS</option><option value="1440" ${sync.intervalMinutes === 1440 ? "selected" : ""}>DAILY</option></select></label><button type="submit" ${this.state.busy || this.state.indexing ? "disabled" : ""}>SAVE SYNC OPTIONS</button></form></div></details>` : ""}
            ${showCapabilities ? `<details class="workspace-panel stud-moodle-capability-panel"><summary>CAPABILITY REPORT / READ ONLY</summary><div class="workspace-panel-content"><div class="stud-moodle-capability-grid">${Object.keys(CAPABILITY_LABELS).map(key => `<article class="${WRITE_CAPABILITIES.has(key) ? "policy-disabled" : ""}"><strong>${CAPABILITY_LABELS[key]}</strong><span>${this.escape(capabilities[key] || (WRITE_CAPABILITIES.has(key) ? "POLICY_DISABLED" : "UNKNOWN")).replace(/_/g, " ")}</span></article>`).join("")}</div><p class="stud-moodle-policy-copy">Aegis never submits work, posts, messages, changes grades or modifies Moodle.</p></div></details>` : ""}
            <section class="stud-moodle-data-grid">
                <article class="workspace-panel"><header><h2>COURSES</h2><span>CANONICAL STUD</span></header><div class="workspace-panel-content"><div class="stud-moodle-list">${courses.length ? courses.map(course => `<button type="button" data-stud-moodle-course="${this.escape(course.id)}"${selectedCourse && selectedCourse.id === course.id ? " class=\"selected\"" : ""}><strong>${this.escape(course.code || course.shortName || "MODULE")} · ${this.escape(course.title)}</strong><small>${this.escape(course.status)} · ${course.startDate ? this.escape(displayDate(course.startDate)) : "DATE UNKNOWN"}</small></button>`).join("") : `<div class="stud-empty-inline">NO CANONICAL COURSES YET. Configure Moodle and run an explicit synchronization, or continue using STUD locally.</div>`}</div></div></article>
                <article class="workspace-panel"><header><h2>SELECTED COURSE</h2><span>${selectedCourse ? "CANONICAL / PROVENANCE" : "WAITING"}</span></header><div class="workspace-panel-content">${selectedCourse ? `<div class="stud-detail-heading"><small>COURSE</small><h3>${this.escape(selectedCourse.title)}</h3><span>${this.escape(selectedCourse.code || selectedCourse.shortName || "NO CODE")} · ${this.escape(selectedCourse.status)}</span></div><section class="stud-moodle-course-readout"><h3>UPCOMING ASSIGNMENTS</h3>${selectedAssignments.length ? selectedAssignments.map(item => `<button type="button" data-stud-moodle-assignment="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><span>${item.dueDate ? this.escape(displayDate(item.dueDate)) : "DUE DATE UNKNOWN"} · ${this.escape(item.submissionStatus || "UNKNOWN")}</span></button>`).join("") : `<p>NO ASSIGNMENTS STORED FOR THIS COURSE.</p>`}</section><section class="stud-moodle-course-readout"><h3>COURSE MATERIAL</h3>${selectedResources.length ? selectedResources.slice(0, 8).map(resource => { const document = managedDocuments.find(item => item.sourceResourceId === resource.id); const state = document ? document.extractionStatus === "NOT_ANALYZED" ? "READY FOR INDEX" : document.extractionStatus : resource.localReference ? "DOWNLOADED / UNSUPPORTED" : "REFERENCE ONLY"; return `<button type="button" data-stud-search-result="${this.escape(resource.id)}" data-stud-search-type="RESOURCE"><strong>${this.escape(resource.title)}</strong><span>${this.escape(resource.mimeType || resource.type || "RESOURCE")} · ${this.escape(state)}</span></button>`; }).join("") : `<p>NO COURSE MATERIAL HAS BEEN EXPOSED OR SYNCED YET.</p>`}</section><section class="stud-moodle-course-readout stud-moodle-file-state"><h3>RESOURCE POLICY</h3><strong>USER-INITIATED / MANAGED STORAGE</strong><small>SYNC NOW downloads only bounded academic files explicitly exposed by Moodle. Each stored file keeps a hash, MIME type and Moodle provenance; token-bearing URLs and browser sessions are never retained.</small></section>` : `<div class="stud-empty-inline">SELECT A CANONICAL COURSE TO REVIEW ITS ASSIGNMENTS, RESOURCES AND FIELD-LEVEL MOODLE OBSERVATIONS.</div>`}</div></article>
            </section>
            ${connected ? `<aside class="stud-moodle-fallbacks workspace-panel"><header><h2>LOCAL POLICY</h2><span>READ ONLY</span></header><div class="workspace-panel-content"><p>Downloaded course material is kept only in managed STUD storage with provenance and hashes. Aegis does not change Moodle or Aegis Calendar.</p></div></aside>` : ""}
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
        if (kind === "settings") { this.state.showSettings = !this.state.showSettings; this.parent.render(); return true; }
        if (kind === "connect" || kind === "open-web" || kind === "reauthenticate") { try { this.authResumeAttempted = false; await this.request("stud-moodle-open-web", {}); await this.refreshStatus(); this.state.error = ""; this.startAuthPolling(); this.parent.render(); } catch (error) { this.state.error = error.message; this.parent.render(); } return true; }
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

    dispose() { if (this.state.requestId) this.request("stud-moodle-cancel", {requestId: this.state.requestId}).catch(() => {}); if (this.authPoll) clearInterval(this.authPoll); this.authPoll = null; if (typeof window !== "undefined" && this.onWindowFocus) window.removeEventListener("focus", this.onWindowFocus); this.state.requestId = ""; }
}

module.exports = {StudMoodleWorkspace, CAPABILITY_LABELS, WRITE_CAPABILITIES};
