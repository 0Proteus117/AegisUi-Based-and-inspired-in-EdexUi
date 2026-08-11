"use strict";

const {safeStorage, shell} = require("electron");
const Model = require("./studAcademicModel.class.js");
const Lms = require("./studLmsModel.class.js");
const {StudCredentialVault} = require("./studCredentialVault.class.js");
const {MoodleAdapter} = require("./studMoodleAdapter.class.js");

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
        this.vault = options.vault || new StudCredentialVault({root: this.root, safeStorage: options.safeStorage || safeStorage});
        this.controllers = new Map();
        this.allowLocalDevelopment = options.allowLocalDevelopment === true;
    }

    safeStatus(instance = this.store.getProviderInstance("stud_moodle_default")) {
        const credential = this.vault.status("stud_moodle_default");
        if (!instance) return Object.freeze({id: "stud_moodle_default", providerType: "MOODLE", displayName: "Moodle", baseUrl: null, status: "CONFIG_REQUIRED", capabilities: Lms.emptyCapabilities(), lastSuccessfulSync: null, lastAttempt: null, lastErrorCode: null, ...credential});
        return Object.freeze({...instance, ...credential});
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
        return this.status();
    }

    requireInstance() {
        const instance = this.store.getProviderInstance("stud_moodle_default");
        const secret = this.vault.get("stud_moodle_default");
        if (!instance || !instance.baseUrl) throw new Lms.LmsError("CONFIG_REQUIRED", "Configure the Moodle base URL before probing capabilities.");
        return {instance, secret};
    }

    requireConfigured() {
        const {instance, secret} = this.requireInstance();
        if (!secret.token) throw new Lms.LmsError("AUTH_REQUIRED", "A sanctioned Moodle Web Service token is required. Username/password authentication is not stored or automated by Aegis.");
        return {instance, secret};
    }

    adapter(instance, secret, requestId) { return new MoodleAdapter({baseUrl: instance.baseUrl, token: secret.token, fetch: this.fetch, requestId, controllers: this.controllers, allowLocalDevelopment: this.allowLocalDevelopment}); }

    persistState(instance, patch = {}) {
        const merged = {...instance, ...patch};
        return this.store.saveProviderInstance({id: merged.id, providerType: "MOODLE", displayName: merged.displayName || "Moodle", baseUrl: merged.baseUrl, status: merged.status, capabilities: Lms.normalizeCapabilities(merged.capabilities || {}), lastSuccessfulSync: merged.lastSuccessfulSync || null, lastAttempt: merged.lastAttempt || null, lastErrorCode: merged.lastErrorCode || null});
    }

    async probe(payload = {}) {
        Lms.allowedKeys(payload, ["requestId"], "Moodle probe");
        const {instance, secret} = this.requireConfigured();
        const requestId = payload.requestId || Lms.createRequestId(); const attemptedAt = Model.now();
        try {
            const result = await this.adapter(instance, secret, requestId).probe();
            const state = stateFromCapabilities(result.capabilities, true);
            const provider = this.persistState(instance, {status: state, capabilities: result.capabilities, lastAttempt: attemptedAt, lastErrorCode: null});
            return Object.freeze({provider: this.safeStatus(provider), probe: Object.freeze({instance: result.instance, capabilities: provider.capabilities, errors: result.errors, webServices: "AVAILABLE", mobileWebServices: result.instance.mobileService, rest: "AVAILABLE", writePolicy: "READ_ONLY / POLICY_DISABLED"})});
        } catch (error) {
            const probe = error.probe || null;
            const provider = this.persistState(instance, {status: error.code === "OFFLINE" ? "OFFLINE" : "ERROR", capabilities: probe && probe.capabilities || instance.capabilities, lastAttempt: attemptedAt, lastErrorCode: error.code || "SERVER_ERROR"});
            throw Object.assign(error, {provider: this.safeStatus(provider)});
        }
    }

    async sync(payload = {}) {
        Lms.allowedKeys(payload, ["requestId"], "Moodle sync");
        const {instance, secret} = this.requireConfigured();
        const requestId = payload.requestId || Lms.createRequestId(); const attemptedAt = Model.now();
        try {
            const result = await this.adapter(instance, secret, requestId).sync();
            const summary = this.store.syncMoodleObservations(instance, {...result, sourceType: "MOODLE"});
            const state = stateFromCapabilities(result.capabilities, true);
            const provider = this.persistState(instance, {status: state, capabilities: result.capabilities, lastSuccessfulSync: Model.now(), lastAttempt: attemptedAt, lastErrorCode: null});
            return Object.freeze({provider: this.safeStatus(provider), summary, calendarObservations: result.calendar, partial: Object.keys(result.errors).length > 0, errors: result.errors});
        } catch (error) {
            const provider = this.persistState(instance, {status: error.code === "OFFLINE" ? "OFFLINE" : "ERROR", lastAttempt: attemptedAt, lastErrorCode: error.code || "SERVER_ERROR"});
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
        const instance = this.store.getProviderInstance("stud_moodle_default");
        if (!instance || !instance.baseUrl) throw new Lms.LmsError("CONFIG_REQUIRED", "Configure Moodle before opening it in the system browser.");
        const url = Lms.deriveMoodleWebUrl(instance.baseUrl);
        if (!this.shell || typeof this.shell.openExternal !== "function") throw new Lms.LmsError("OFFLINE", "System browser access is unavailable.");
        await this.shell.openExternal(url);
        return Object.freeze({opened: true});
    }

    cancel(requestId) { const controller = this.controllers.get(String(requestId || "")); if (controller) controller.abort(); return Object.freeze({cancelled: Boolean(controller)}); }
    dispose() { this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); }
}

module.exports = {StudLmsRuntime, parseIcs, parseIcsDate, stateFromCapabilities};
