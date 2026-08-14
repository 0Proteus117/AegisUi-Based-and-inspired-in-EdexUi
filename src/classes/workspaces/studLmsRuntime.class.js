"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {safeStorage, shell, BrowserWindow, session} = require("electron");
const Model = require("./studAcademicModel.class.js");
const Lms = require("./studLmsModel.class.js");
const {StudCredentialVault} = require("./studCredentialVault.class.js");
const {MoodleAdapter} = require("./studMoodleAdapter.class.js");
const {MoodleSessionAdapter} = require("./studMoodleSessionAdapter.class.js");

const DEFAULT_UEL_MOODLE_URL = "https://moodle.uel.ac.uk";
const MOODLE_AUTH_PARTITION = "persist:aegis-stud-moodle-auth";

function parseIcsDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!match) return null;
    const [, year, month, day, hour = "00", minute = "00", second = "00", zulu] = match;
    const date = zulu ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))) : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function unfoldIcs(input) { return String(input || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/); }
function unescapeIcs(value) { return String(value || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim(); }

function parseIcs(text) {
    if (Buffer.byteLength(String(text || ""), "utf8") > 1024 * 1024) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle ICS data exceeded the permitted size.");
    const events = [];
    let current = null;
    unfoldIcs(text).forEach(line => {
        if (line === "BEGIN:VEVENT") { current = {}; return; }
        if (line === "END:VEVENT") { if (current && current.uid && current.summary) events.push(current); current = null; return; }
        if (!current) return;
        const separator = line.indexOf(":"); if (separator < 1) return;
        const left = line.slice(0, separator); const key = left.split(";", 1)[0].toUpperCase(); const value = line.slice(separator + 1);
        if (["UID", "SUMMARY", "DESCRIPTION", "URL", "DTSTART", "DTEND"].includes(key) && current[key.toLowerCase()] === undefined) current[key.toLowerCase()] = value;
    });
    return events.slice(0, Lms.LIMITS.events).map(event => Object.freeze({uid: unescapeIcs(event.uid).slice(0, 260), title: Lms.sanitizeDisplayText(unescapeIcs(event.summary), 240) || "Moodle calendar event", description: Lms.sanitizeDisplayText(unescapeIcs(event.description), 12000), dueDate: parseIcsDate(event.dtstart), cutoffDate: parseIcsDate(event.dtend), status: "IN_PROGRESS", submissionStatus: "UNKNOWN", url: event.url || null}));
}

function stateFromCapabilities(capabilities, configured) {
    if (!configured) return "CONFIG_REQUIRED";
    const reads = Object.entries(capabilities || {}).filter(([key]) => !Lms.WRITE_CAPABILITIES.includes(key)).map(([, value]) => value);
    const supported = reads.filter(value => value === "SUPPORTED").length;
    if (supported && (supported < 3 || reads.some(value => ["UNSUPPORTED", "NOT_EXPOSED", "PERMISSION_DENIED"].includes(value)))) return "PARTIAL";
    if (supported) return "READY";
    return "CONFIG_REQUIRED";
}

class StudLmsRuntime {
    constructor(options = {}) {
        if (!options.store) throw new Error("STUD LMS runtime requires the canonical academic store.");
        this.store = options.store;
        this.root = options.root;
        this.fetch = options.fetch || globalThis.fetch;
        this.shell = options.shell || shell;
        this.BrowserWindow = options.BrowserWindow || BrowserWindow;
        this.electronSession = options.session || session;
        this.vault = options.vault || new StudCredentialVault({root: this.root, safeStorage: options.safeStorage || safeStorage});
        this.controllers = new Map();
        this.documentRuntime = options.documentRuntime || null;
        this.allowLocalDevelopment = options.allowLocalDevelopment === true;
        this.syncTimer = null;
        this.authWindow = null;
        this.browserSessionConfigured = false;
        this.authBootstrapRunning = false;
        this.scheduleAutomaticSync();
    }

    setDocumentRuntime(runtime) { this.documentRuntime = runtime || null; }

    safeStatus(instance = this.store.getProviderInstance("stud_moodle_default")) {
        const credential = this.vault.status("stud_moodle_default");
        const sync = instance ? this.store.getProviderSyncPreference(instance.id) : Object.freeze({providerId: "stud_moodle_default", automaticSync: false, intervalMinutes: 360, nextSyncAt: null, lastResult: Object.freeze({}), updatedAt: null});
        if (!instance) return Object.freeze({id: "stud_moodle_default", providerType: "MOODLE", displayName: "UEL Moodle", baseUrl: DEFAULT_UEL_MOODLE_URL, status: "CONFIG_REQUIRED", capabilities: Lms.emptyCapabilities(), lastSuccessfulSync: null, lastAttempt: null, lastErrorCode: null, sync, browserSessionConfigured: this.browserSessionConfigured, ...credential});
        return Object.freeze({...instance, sync, browserSessionConfigured: this.browserSessionConfigured, ...credential});
    }

    status() { return this.safeStatus(); }

    configure(input = {}) {
        Lms.allowedKeys(input, ["baseUrl", "displayName", "token", "icsUrl", "clearToken", "clearIcsUrl"], "Moodle configuration");
        const existing = this.store.getProviderInstance("stud_moodle_default");
        const config = Lms.normalizeProviderConfig({id: "stud_moodle_default", providerType: "MOODLE", baseUrl: input.baseUrl || existing && existing.baseUrl, displayName: input.displayName || existing && existing.displayName || "Moodle", token: input.token, icsUrl: input.icsUrl}, {allowLocalDevelopment: this.allowLocalDevelopment});
        const secretChanges = {};
        if (typeof input.token === "string" && input.token.trim()) secretChanges.token = config.token;
        if (typeof input.icsUrl === "string" && input.icsUrl.trim()) secretChanges.icsUrl = config.icsUrl;
        if (input.clearToken === true) secretChanges.token = null;
        if (input.clearIcsUrl === true) secretChanges.icsUrl = null;
        if (Object.keys(secretChanges).length) this.vault.put(config.id, secretChanges);
        const secretStatus = this.vault.status(config.id);
        this.store.saveProviderInstance({id: config.id, providerType: config.providerType, displayName: config.displayName, baseUrl: config.baseUrl, status: secretStatus.tokenConfigured ? "CONFIG_REQUIRED" : secretStatus.icsConfigured ? "PARTIAL" : "CONFIG_REQUIRED", capabilities: existing && existing.capabilities || Lms.emptyCapabilities(), lastSuccessfulSync: existing && existing.lastSuccessfulSync || null, lastAttempt: existing && existing.lastAttempt || null, lastErrorCode: null});
        this.scheduleAutomaticSync();
        return this.status();
    }

    async configureSyncPreference(input = {}) {
        Lms.allowedKeys(input, ["automaticSync", "intervalMinutes"], "Moodle sync preference");
        const instance = this.store.getProviderInstance("stud_moodle_default");
        if (!instance) throw new Lms.LmsError("CONFIG_REQUIRED", "Configure Moodle before enabling automatic synchronization.");
        if (input.automaticSync === true && !this.vault.status(instance.id).tokenConfigured) {
            this.browserSessionConfigured = this.browserSessionConfigured || await this.hasBrowserSession(instance);
            if (!this.browserSessionConfigured) throw new Lms.LmsError("AUTH_REQUIRED", "Connect through the official Moodle sign-in window before enabling automatic synchronization.");
        }
        const minutes = input.intervalMinutes === undefined ? undefined : Math.max(15, Math.min(Number(input.intervalMinutes) || 360, 24 * 60));
        const preference = this.store.saveProviderSyncPreference({providerId: instance.id, automaticSync: input.automaticSync, intervalMinutes: minutes, nextSyncAt: input.automaticSync ? new Date(Date.now() + (minutes || this.store.getProviderSyncPreference(instance.id).intervalMinutes) * 60000).toISOString() : null});
        this.scheduleAutomaticSync();
        return preference;
    }

    async forgetAccount() {
        const instance = this.store.getProviderInstance("stud_moodle_default");
        if (this.syncTimer) { clearTimeout(this.syncTimer); this.syncTimer = null; }
        this.vault.forget("stud_moodle_default");
        this.browserSessionConfigured = false;
        try { await this.authSession().clearStorageData({storages: ["cookies", "localstorage", "indexdb", "serviceworkers"]}); } catch (error) {}
        if (instance) {
            this.store.saveProviderSyncPreference({providerId: instance.id, automaticSync: false, nextSyncAt: null, lastResult: {status: "ACCOUNT_FORGOTTEN", at: Model.now()}});
            this.persistState(instance, {status: "CONFIG_REQUIRED", capabilities: instance.capabilities, lastAttempt: instance.lastAttempt, lastSuccessfulSync: instance.lastSuccessfulSync, lastErrorCode: null});
        }
        // Canonical courses, files, documents and provenance deliberately remain
        // local. Forgetting an account only removes secure credentials and stops
        // future provider activity.
        return this.status();
    }

    recordSyncOutcome(instance, result) {
        const preference = this.store.getProviderSyncPreference(instance.id);
        const nextSyncAt = preference.automaticSync ? new Date(Date.now() + preference.intervalMinutes * 60000).toISOString() : null;
        this.store.saveProviderSyncPreference({providerId: instance.id, automaticSync: preference.automaticSync, intervalMinutes: preference.intervalMinutes, nextSyncAt, lastResult: result});
        this.scheduleAutomaticSync();
    }

    scheduleAutomaticSync() {
        if (this.syncTimer) { clearTimeout(this.syncTimer); this.syncTimer = null; }
        const instance = this.store.getProviderInstance("stud_moodle_default");
        if (!instance) return;
        const preference = this.store.getProviderSyncPreference(instance.id);
        if (!preference.automaticSync) return;
        const schedule = available => {
            if (!available || this.syncTimer) return;
            const due = preference.nextSyncAt ? new Date(preference.nextSyncAt).getTime() : Date.now() + preference.intervalMinutes * 60000;
            const delay = Math.max(1000, Math.min(Math.max(0, due - Date.now()), 0x7fffffff));
            this.syncTimer = setTimeout(() => { this.syncTimer = null; this.performSync(Lms.createRequestId("stud_moodle_auto"), true).catch(() => {}); }, delay);
            if (!preference.nextSyncAt) this.store.saveProviderSyncPreference({providerId: instance.id, automaticSync: true, intervalMinutes: preference.intervalMinutes, nextSyncAt: new Date(Date.now() + preference.intervalMinutes * 60000).toISOString()});
        };
        if (this.vault.status(instance.id).tokenConfigured) { schedule(true); return; }
        this.hasBrowserSession(instance).then(available => { this.browserSessionConfigured = available; schedule(available); }).catch(() => {});
    }

    requireInstance() {
        const instance = this.store.getProviderInstance("stud_moodle_default");
        const secret = this.vault.get("stud_moodle_default");
        if (!instance || !instance.baseUrl) throw new Lms.LmsError("CONFIG_REQUIRED", "Configure the Moodle base URL before probing capabilities.");
        return {instance, secret};
    }

    async hasBrowserSession(instance) {
        if (!instance || !instance.baseUrl) return false;
        try {
            const authSession = this.authSession();
            const cookies = await authSession.cookies.get({url: instance.baseUrl});
            // Cookie values are deliberately never read, returned, logged or
            // copied. This merely asks Chromium's protected profile whether
            // its own authorized session is still present.
            return Array.isArray(cookies) && cookies.some(cookie => /^MoodleSession|^MOODLEID_/i.test(String(cookie.name || "")));
        } catch (error) { return false; }
    }

    async requireConfigured() {
        const {instance, secret} = this.requireInstance();
        if (secret.token) return {instance, secret, authentication: "WEB_SERVICE_TOKEN"};
        const sessionAvailable = this.browserSessionConfigured || await this.hasBrowserSession(instance);
        if (!sessionAvailable) throw new Lms.LmsError("AUTH_REQUIRED", "Connect through the official Moodle sign-in window before synchronizing.");
        this.browserSessionConfigured = true;
        return {instance, secret, authentication: "BROWSER_SESSION"};
    }

    ensureDefaultInstance() {
        const existing = this.store.getProviderInstance("stud_moodle_default");
        if (existing) return existing;
        return this.store.saveProviderInstance({
            id: "stud_moodle_default", providerType: "MOODLE", displayName: "UEL Moodle", baseUrl: DEFAULT_UEL_MOODLE_URL,
            status: "CONFIG_REQUIRED", capabilities: Lms.emptyCapabilities(), lastSuccessfulSync: null, lastAttempt: null, lastErrorCode: null
        });
    }

    authSession() {
        if (!this.electronSession || typeof this.electronSession.fromPartition !== "function") throw new Lms.LmsError("OFFLINE", "The secure Moodle sign-in window is unavailable.");
        const authSession = this.electronSession.fromPartition(MOODLE_AUTH_PARTITION);
        // The partition belongs only to Aegis' Moodle sign-in window.  It never
        // imports browser cookies and cannot request device permissions.
        authSession.setPermissionCheckHandler(() => false);
        authSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
        return authSession;
    }

    isAllowedAuthUrl(value, baseUrl) {
        try {
            const target = new URL(value); const base = new URL(baseUrl);
            if (target.protocol !== "https:" || target.username || target.password) return false;
            const host = target.hostname.toLowerCase();
            return host === base.hostname || host.endsWith(".uel.ac.uk") || host === "login.microsoftonline.com" || host.endsWith(".microsoftonline.com") || host.endsWith(".microsoft.com");
        } catch (error) { return false; }
    }

    adapter(instance, secret, requestId, authentication = "WEB_SERVICE_TOKEN") {
        if (authentication === "BROWSER_SESSION") return new MoodleSessionAdapter({baseUrl: instance.baseUrl, session: this.authSession(), requestId, controllers: this.controllers, allowLocalDevelopment: this.allowLocalDevelopment});
        return new MoodleAdapter({baseUrl: instance.baseUrl, token: secret.token, fetch: this.fetch, requestId, controllers: this.controllers, allowLocalDevelopment: this.allowLocalDevelopment});
    }

    persistState(instance, patch = {}) {
        const merged = {...instance, ...patch};
        return this.store.saveProviderInstance({id: merged.id, providerType: "MOODLE", displayName: merged.displayName || "Moodle", baseUrl: merged.baseUrl, status: merged.status, capabilities: Lms.normalizeCapabilities(merged.capabilities || {}), lastSuccessfulSync: merged.lastSuccessfulSync || null, lastAttempt: merged.lastAttempt || null, lastErrorCode: merged.lastErrorCode || null});
    }

    async probe(payload = {}) {
        Lms.allowedKeys(payload, ["requestId"], "Moodle probe");
        const {instance, secret, authentication} = await this.requireConfigured();
        const requestId = payload.requestId || Lms.createRequestId(); const attemptedAt = Model.now();
        try {
            const result = await this.adapter(instance, secret, requestId, authentication).probe();
            const state = stateFromCapabilities(result.capabilities, true);
            const provider = this.persistState(instance, {status: state, capabilities: result.capabilities, lastAttempt: attemptedAt, lastErrorCode: null});
            return Object.freeze({provider: this.safeStatus(provider), probe: Object.freeze({instance: result.instance, capabilities: provider.capabilities, errors: result.errors, webServices: "AVAILABLE", mobileWebServices: result.instance.mobileService, rest: "AVAILABLE", writePolicy: "READ_ONLY / POLICY_DISABLED"})});
        } catch (error) {
            const probe = error.probe || null;
            const provider = this.persistState(instance, {status: error.code === "OFFLINE" ? "OFFLINE" : "ERROR", capabilities: probe && probe.capabilities || instance.capabilities, lastAttempt: attemptedAt, lastErrorCode: error.code || "SERVER_ERROR"});
            throw Object.assign(error, {provider: this.safeStatus(provider)});
        }
    }

    managedMoodleFile(bytes, resource) {
        const digest = crypto.createHash("sha256").update(bytes).digest("hex");
        const declaredPdf = String(resource.mimeType || "").toLowerCase() === "application/pdf";
        const isPdf = declaredPdf || bytes.subarray(0, 5).toString("ascii") === "%PDF-";
        const fileName = String(resource.title || "moodle-file").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "moodle-file";
        const requestedExtension = path.extname(fileName).toLowerCase();
        const extension = isPdf ? ".pdf" : (/^\.[a-z0-9]{1,12}$/.test(requestedExtension) ? requestedExtension : ".bin");
        const folder = isPdf ? "documents" : "moodle-files";
        const name = `${isPdf ? "moodle" : "moodle_file"}_${digest.slice(0, 16)}${extension}`;
        const reference = `${folder}/${name}`;
        const root = path.resolve(this.root);
        const directory = path.resolve(root, folder);
        const destination = path.resolve(directory, name);
        if (!destination.startsWith(`${directory}${path.sep}`)) throw new Lms.LmsError("POLICY_BLOCKED", "Managed Moodle file is outside STUD storage.");
        fs.mkdirSync(directory, {recursive: true, mode: 0o700});
        if (!fs.existsSync(destination)) {
            const temporary = path.join(directory, `.${name}.${process.pid}.${crypto.randomUUID()}.partial`);
            try {
                fs.writeFileSync(temporary, bytes, {mode: 0o600, flag: "wx"});
                fs.renameSync(temporary, destination);
            } catch (error) {
                try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch (cleanupError) {}
                throw new Lms.LmsError("LOCAL_STORAGE_ERROR", "Moodle file could not be stored in managed STUD storage.");
            }
        }
        return Object.freeze({reference, sha256: digest, size: bytes.length, mimeType: isPdf ? "application/pdf" : String(resource.mimeType || "application/octet-stream").slice(0, 120), isPdf});
    }

    async ingestMoodleFiles(instance, adapter, resources, requestId) {
        const summary = {declared: 0, downloaded: 0, classified: 0, documents: 0, skipped: 0, failed: 0};
        const errors = {};
        let totalBytes = 0;
        const namespace = `MOODLE_RESOURCE:${instance.id}`;
        for (const raw of (Array.isArray(resources) ? resources : []).filter(item => item && item.downloadUrl).slice(0, Lms.LIMITS.files)) {
            summary.declared += 1;
            if (Number(raw.fileSize) > Lms.LIMITS.fileBytes || totalBytes >= Lms.LIMITS.totalFileBytes) { summary.skipped += 1; continue; }
            try {
                const downloaded = await adapter.downloadResourceFile(raw);
                if (totalBytes + downloaded.bytes.length > Lms.LIMITS.totalFileBytes) { summary.skipped += 1; continue; }
                totalBytes += downloaded.bytes.length;
                const managed = this.managedMoodleFile(downloaded.bytes, {...raw, mimeType: downloaded.mimeType || raw.mimeType});
                const identifier = this.store.findByExternalIdentifier(namespace, String(raw.moodleId || ""))[0];
                if (!identifier) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle file did not correspond to a normalized resource.");
                const resource = this.store.getEntity("RESOURCE", identifier.entityId);
                if (!resource) throw new Lms.LmsError("MALFORMED_RESPONSE", "Normalized Moodle resource is unavailable.");
                this.store.updateEntity("RESOURCE", resource.id, {localReference: managed.reference, checksum: managed.sha256, mimeType: managed.mimeType});
                this.store.recordProviderObservation("RESOURCE", resource.id, "localReference", managed.reference, "MOODLE", `resource:${raw.moodleId}`, {providerId: instance.id, capability: "FILES", originalPathPersisted: false});
                this.store.recordProviderObservation("RESOURCE", resource.id, "checksum", managed.sha256, "MOODLE", `resource:${raw.moodleId}`, {providerId: instance.id, capability: "FILES"});
                summary.downloaded += 1; summary.classified += 1;
                if (!managed.isPdf) continue;
                const saved = this.store.saveAcademicDocument({reference: managed.reference, displayName: raw.title, mimeType: managed.mimeType, size: managed.size, sha256: managed.sha256}, {title: raw.title, documentType: "COURSE_MATERIAL", courseId: resource.courseId || null, assignmentId: resource.assignmentId || null, sourceResourceId: resource.id});
                this.store.createProvenance({entityType: "ACADEMIC_DOCUMENT", entityId: saved.document.id, field: "source", observedValue: "MOODLE_FILE", sourceType: "MOODLE", sourceId: `resource:${raw.moodleId}`, sourceAuthority: "AUTHORITATIVE", observedAt: Model.now(), metadata: {providerId: instance.id, resourceId: resource.id, originalPathPersisted: false}});
                // Downloading must not silently turn into a potentially costly
                // interpretation pass.  The managed PDF is READY FOR INDEX;
                // the analyst explicitly requests INDEX ALL COURSE MATERIAL
                // (or ANALYZE DOCUMENT) from the renderer when appropriate.
                summary.documents += saved.deduplicated ? 0 : 1;
            } catch (error) {
                if (error && error.code === "CANCELLED") throw error;
                summary.failed += 1;
                const code = error && error.code || "ERROR";
                errors[code] = (errors[code] || 0) + 1;
            }
        }
        return Object.freeze({summary: Object.freeze(summary), errors: Object.freeze(errors)});
    }

    async sync(payload = {}) {
        Lms.allowedKeys(payload, ["requestId"], "Moodle sync");
        const {instance, secret, authentication} = await this.requireConfigured();
        return this.performSync(payload.requestId || Lms.createRequestId(), false, {instance, secret, authentication});
    }

    async performSync(requestId, automatic = false, supplied = null) {
        const suppliedAuthentication = supplied && supplied.authentication;
        const configured = supplied || await this.requireConfigured();
        const {instance, secret, authentication = suppliedAuthentication || "WEB_SERVICE_TOKEN"} = configured;
        const attemptedAt = Model.now();
        try {
            const adapter = this.adapter(instance, secret, requestId, authentication);
            const result = await adapter.sync();
            const summary = this.store.syncMoodleObservations(instance, {...result, sourceType: "MOODLE"});
            const files = await this.ingestMoodleFiles(instance, adapter, result.resources, requestId);
            const capabilities = {...result.capabilities};
            if (files.summary.declared) capabilities.FILES = files.summary.downloaded || files.summary.skipped ? "SUPPORTED" : "UNKNOWN";
            const allErrors = {...result.errors, ...(Object.keys(files.errors).length ? {FILES: Object.keys(files.errors).join(",")} : {})};
            const state = stateFromCapabilities(capabilities, true);
            const provider = this.persistState(instance, {status: state, capabilities, lastSuccessfulSync: Model.now(), lastAttempt: attemptedAt, lastErrorCode: null});
            const changes = {courses: summary.newCourses + summary.updatedCourses, assignments: summary.newAssignments + summary.updatedAssignments, resources: summary.newResources + summary.updatedResources, files: files.summary.downloaded, documents: files.summary.documents};
            this.recordSyncOutcome(instance, {status: Object.keys(allErrors).length ? "PARTIAL" : "SUCCESS", at: Model.now(), automatic, changes, errors: Object.keys(allErrors)});
            return Object.freeze({provider: this.safeStatus(provider), summary, files: files.summary, calendarObservations: result.calendar, partial: Object.keys(allErrors).length > 0, errors: allErrors, changes});
        } catch (error) {
            const provider = this.persistState(instance, {status: error.code === "OFFLINE" ? "OFFLINE" : "ERROR", lastAttempt: attemptedAt, lastErrorCode: error.code || "SERVER_ERROR"});
            this.recordSyncOutcome(instance, {status: error.code || "SERVER_ERROR", at: Model.now(), automatic, changes: {}, errors: [error.code || "SERVER_ERROR"]});
            throw Object.assign(error, {provider: this.safeStatus(provider)});
        }
    }

    async syncIcs(payload = {}) {
        Lms.allowedKeys(payload, ["requestId"], "Moodle ICS sync");
        const {instance, secret} = this.requireInstance();
        if (!secret.icsUrl) throw new Lms.LmsError("CONFIG_REQUIRED", "Configure a Moodle calendar export URL before using the ICS fallback.");
        const requestId = payload.requestId || Lms.createRequestId(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000); this.controllers.set(requestId, controller);
        try {
            const response = await this.fetch(secret.icsUrl, {method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal});
            if (!response.ok) throw new Lms.LmsError("SERVER_ERROR", `Moodle ICS returned HTTP ${response.status}.`);
            const source = await response.text(); const assignments = parseIcs(source);
            const summary = this.store.syncMoodleObservations(instance, {sourceType: "MOODLE_ICS", courses: [], assignments, resources: []});
            const capabilities = {...instance.capabilities, CALENDAR: "SUPPORTED"};
            const provider = this.persistState(instance, {status: stateFromCapabilities(capabilities, true), capabilities, lastSuccessfulSync: Model.now(), lastAttempt: Model.now(), lastErrorCode: null});
            return Object.freeze({provider: this.safeStatus(provider), summary, calendarObservations: assignments.length});
        } catch (error) {
            if (controller.signal.aborted && !(error instanceof Lms.LmsError)) throw new Lms.LmsError("CANCELLED", "Moodle ICS synchronization was cancelled.");
            throw error instanceof Lms.LmsError ? error : new Lms.LmsError("OFFLINE", "Moodle ICS could not be reached from this device.");
        } finally { clearTimeout(timeout); if (this.controllers.get(requestId) === controller) this.controllers.delete(requestId); }
    }

    async openWeb() {
        const instance = this.ensureDefaultInstance();
        const url = `${Lms.deriveMoodleWebUrl(instance.baseUrl)}/login`;
        if (!this.BrowserWindow) throw new Lms.LmsError("OFFLINE", "The secure Moodle sign-in window is unavailable.");
        if (this.authWindow && !this.authWindow.isDestroyed()) { this.authWindow.show(); this.authWindow.focus(); return Object.freeze({opened: true, existing: true}); }
        const authSession = this.authSession();
        const window = new this.BrowserWindow({
            width: 1120, height: 800, minWidth: 860, minHeight: 620, title: "AegisUi — Connect Moodle",
            webPreferences: {session: authSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, devTools: false, webviewTag: false, nativeWindowOpen: false}
        });
        this.authWindow = window;
        const contents = window.webContents;
        const complete = target => {
            try {
                const parsed = new URL(target); const base = new URL(instance.baseUrl);
                if (parsed.hostname === base.hostname && !/^\/login(?:\/|$)/i.test(parsed.pathname)) {
                    this.browserSessionConfigured = true;
                    this.persistState(instance, {status: "PARTIAL", lastAttempt: Model.now(), lastErrorCode: null});
                    if (!this.authBootstrapRunning) {
                        this.authBootstrapRunning = true;
                        // Authentication is an explicit user action in the
                        // official window. Once it succeeds, the approved
                        // read-only probe and bounded first sync continue
                        // automatically; no technical token UI is required.
                        setTimeout(() => this.probe({requestId: Lms.createRequestId("stud_moodle_login_probe")})
                            .then(() => this.sync({requestId: Lms.createRequestId("stud_moodle_login_sync")}))
                            .then(() => { try { if (!window.isDestroyed()) window.close(); } catch (error) {} })
                            .catch(error => this.persistState(instance, {status: error.code === "OFFLINE" ? "OFFLINE" : "ERROR", lastAttempt: Model.now(), lastErrorCode: error.code || "SERVER_ERROR"}))
                            .finally(() => { this.authBootstrapRunning = false; }), 350);
                    }
                }
            } catch (error) {}
        };
        contents.setWindowOpenHandler(({url: target}) => {
            if (this.isAllowedAuthUrl(target, instance.baseUrl)) contents.loadURL(target).catch(() => {});
            return {action: "deny"};
        });
        contents.on("will-navigate", (event, target) => { if (!this.isAllowedAuthUrl(target, instance.baseUrl)) event.preventDefault(); });
        contents.on("did-navigate", (_event, target) => complete(target));
        contents.on("did-navigate-in-page", (_event, target) => complete(target));
        window.on("closed", () => { if (this.authWindow === window) this.authWindow = null; });
        try { await contents.loadURL(url); }
        catch (error) { try { if (!window.isDestroyed()) window.close(); } catch (_) {} throw new Lms.LmsError("OFFLINE", "The official Moodle sign-in page could not be opened."); }
        return Object.freeze({opened: true, existing: false});
    }

    cancel(requestId) { const controller = this.controllers.get(String(requestId || "")); if (controller) controller.abort(); return Object.freeze({cancelled: Boolean(controller)}); }
    dispose() { if (this.syncTimer) clearTimeout(this.syncTimer); this.syncTimer = null; this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); }
}

module.exports = {StudLmsRuntime, parseIcs, parseIcsDate, stateFromCapabilities, DEFAULT_UEL_MOODLE_URL, MOODLE_AUTH_PARTITION};
