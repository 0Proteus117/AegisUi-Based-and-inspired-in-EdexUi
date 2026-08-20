"use strict";

const crypto = require("crypto");

const LMS_PROVIDER_TYPES = Object.freeze(["MOODLE"]);
const LMS_CONNECTION_STATES = Object.freeze(["UNCONFIGURED", "CONFIG_REQUIRED", "READY", "PARTIAL", "OFFLINE", "ERROR"]);
const LMS_CAPABILITY_STATES = Object.freeze(["SUPPORTED", "UNSUPPORTED", "NOT_EXPOSED", "PERMISSION_DENIED", "CONFIG_REQUIRED", "UNKNOWN", "POLICY_DISABLED"]);
const MOODLE_CAPABILITIES = Object.freeze([
    "SITE_INFO", "COURSES", "COURSE_CONTENT", "ASSIGNMENTS", "ASSIGNMENT_STATUS", "RESOURCES", "CALENDAR",
    "GRADES", "FEEDBACK", "COMPLETION", "FORUM_READ", "ANNOUNCEMENTS", "NOTIFICATIONS", "QUIZZES", "PARTICIPANTS", "FILES",
    "ASSIGNMENT_WRITE", "FORUM_WRITE", "MESSAGE_WRITE", "QUIZ_WRITE"
]);
const WRITE_CAPABILITIES = Object.freeze(["ASSIGNMENT_WRITE", "FORUM_WRITE", "MESSAGE_WRITE", "QUIZ_WRITE"]);
const ERROR_CODES = Object.freeze(["INVALID_TOKEN", "AUTH_REQUIRED", "PERMISSION_DENIED", "SERVICE_DISABLED", "PROTOCOL_DISABLED", "CAPABILITY_UNAVAILABLE", "OFFLINE", "TIMEOUT", "RATE_LIMITED", "SERVER_ERROR", "MALFORMED_RESPONSE", "CANCELLED", "CONFIG_REQUIRED", "SECURE_STORAGE_UNAVAILABLE", "LOCAL_STORAGE_ERROR", "POLICY_BLOCKED"]);
// These limits deliberately bound a user-initiated full Moodle sync. They are
// not a general file-transfer facility: only files advertised by the audited
// course-content response may cross this boundary.
const LIMITS = Object.freeze({
    baseUrl: 1024, displayName: 160, token: 4096, icsUrl: 4096,
    courses: 100, assignments: 1000, resources: 5000, events: 1000,
    responseBytes: 2 * 1024 * 1024,
    files: 2000, fileBytes: 40 * 1024 * 1024, totalFileBytes: 2 * 1024 * 1024 * 1024
});

class LmsError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "LmsError";
        this.code = code;
        this.details = details;
    }
}

function plainObject(value, label = "Value") {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new LmsError("INVALID_INPUT", `${label} must be a plain object.`);
    return value;
}

function allowedKeys(value, keys, label = "Value") {
    plainObject(value, label);
    Object.keys(value).forEach(key => { if (!keys.includes(key)) throw new LmsError("INVALID_INPUT", `${label} contains unsupported field: ${key}.`); });
    return value;
}

function text(value, label, max, required = false) {
    if (value === undefined || value === null || value === "") {
        if (required) throw new LmsError("INVALID_INPUT", `${label} is required.`);
        return null;
    }
    if (typeof value !== "string") throw new LmsError("INVALID_INPUT", `${label} must be text.`);
    const normalized = value.trim();
    if (!normalized && required) throw new LmsError("INVALID_INPUT", `${label} is required.`);
    if (normalized.length > max) throw new LmsError("INVALID_INPUT", `${label} is too long.`);
    return normalized || null;
}

function enumValue(value, allowed, label, fallback = null) {
    if (value === undefined || value === null || value === "") return fallback;
    const normalized = String(value).trim().toUpperCase();
    if (!allowed.includes(normalized)) throw new LmsError("INVALID_INPUT", `${label} is invalid.`);
    return normalized;
}

function safeId(value, label = "Provider ID") {
    const id = text(value, label, 96, true);
    if (!/^[a-z][a-z0-9_]{2,95}$/i.test(id)) throw new LmsError("INVALID_INPUT", `${label} is invalid.`);
    return id;
}

function normalizeBaseUrl(value, options = {}) {
    const raw = text(value, "Moodle base URL", LIMITS.baseUrl, true);
    let parsed;
    try { parsed = new URL(raw); } catch (error) { throw new LmsError("INVALID_INPUT", "Moodle base URL must be a valid HTTP(S) URL."); }
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port || !["https:", "http:"].includes(parsed.protocol)) throw new LmsError("INVALID_INPUT", "Moodle base URL must not contain credentials, a query, fragment or custom port.");
    if (parsed.protocol !== "https:" && !(options.allowLocalDevelopment === true && local)) throw new LmsError("INVALID_INPUT", "Moodle requires HTTPS except approved local development fixtures.");
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

function deriveMoodleEndpoint(baseUrl) { return `${normalizeBaseUrl(baseUrl, {allowLocalDevelopment: true})}/webservice/rest/server.php`; }
function deriveMoodleWebUrl(baseUrl) { return normalizeBaseUrl(baseUrl, {allowLocalDevelopment: true}); }

function emptyCapabilities() {
    const result = {};
    MOODLE_CAPABILITIES.forEach(capability => { result[capability] = WRITE_CAPABILITIES.includes(capability) ? "POLICY_DISABLED" : "UNKNOWN"; });
    return Object.freeze(result);
}

function normalizeCapabilities(value = {}) {
    plainObject(value, "Moodle capabilities");
    const normalized = {...emptyCapabilities()};
    Object.entries(value).forEach(([capability, state]) => {
        if (!MOODLE_CAPABILITIES.includes(capability)) throw new LmsError("INVALID_INPUT", `Unknown Moodle capability: ${capability}.`);
        normalized[capability] = enumValue(state, LMS_CAPABILITY_STATES, `${capability} state`);
    });
    WRITE_CAPABILITIES.forEach(capability => { normalized[capability] = "POLICY_DISABLED"; });
    return Object.freeze(normalized);
}

function normalizeProviderConfig(input = {}, options = {}) {
    allowedKeys(input, ["id", "providerType", "displayName", "baseUrl", "token", "icsUrl"], "Moodle configuration");
    const token = text(input.token, "Moodle token", LIMITS.token);
    const icsUrl = text(input.icsUrl, "Moodle ICS URL", LIMITS.icsUrl);
    if (icsUrl) {
        let parsed;
        try { parsed = new URL(icsUrl); } catch (error) { throw new LmsError("INVALID_INPUT", "Moodle ICS URL must be a valid HTTPS URL."); }
        const base = new URL(normalizeBaseUrl(input.baseUrl, options));
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hostname !== base.hostname) throw new LmsError("INVALID_INPUT", "Moodle ICS URL must use HTTPS and the configured Moodle host.");
    }
    return Object.freeze({
        id: input.id ? safeId(input.id, "Provider ID") : "stud_moodle_default",
        providerType: enumValue(input.providerType || "MOODLE", LMS_PROVIDER_TYPES, "Provider type", "MOODLE"),
        displayName: text(input.displayName, "Moodle display name", LIMITS.displayName) || "Moodle",
        baseUrl: normalizeBaseUrl(input.baseUrl, options),
        token,
        icsUrl
    });
}

function createRequestId(prefix = "stud_moodle") { return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`; }

function sanitizeDisplayText(value, max = 12000) {
    if (value === undefined || value === null) return null;
    const source = String(value);
    const stripped = source.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
    return stripped.slice(0, max) || null;
}

function safeReferenceUrl(value, baseUrl) {
    if (!value) return null;
    try {
        const candidate = new URL(value, `${deriveMoodleWebUrl(baseUrl)}/`);
        const base = new URL(deriveMoodleWebUrl(baseUrl));
        if (candidate.protocol !== "https:" || candidate.origin !== base.origin || candidate.username || candidate.password) return null;
        // Preserve only stable, non-secret Moodle object identifiers. Tokens,
        // session parameters and arbitrary query values never cross the
        // provider boundary into canonical STUD records.
        const safeQuery = new URLSearchParams();
        ["id", "course", "section", "cmid"].forEach(key => {
            const item = candidate.searchParams.get(key);
            if (item && /^\d{1,12}$/.test(item)) safeQuery.set(key, item);
        });
        candidate.search = safeQuery.toString();
        candidate.hash = "";
        return candidate.toString();
    } catch (error) { return null; }
}

function safeMoodleFileUrl(value, baseUrl) {
    if (!value) return null;
    try {
        const candidate = new URL(value, `${deriveMoodleWebUrl(baseUrl)}/`);
        const base = new URL(deriveMoodleWebUrl(baseUrl));
        const pathName = decodeURIComponent(candidate.pathname || "");
        // Moodle Web Service file access is deliberately the only accepted
        // authenticated file endpoint. Moodle's own Web Service exporters may
        // append the non-secret `forcedownload` presentation flag. Preserve
        // that flag, but reject tokens and every other query parameter.
        if (candidate.protocol !== "https:" || candidate.origin !== base.origin || candidate.username || candidate.password || candidate.hash || !/(?:^|\/)webservice\/pluginfile\.php\//i.test(pathName)) return null;
        const keys = [...candidate.searchParams.keys()];
        if (keys.some(key => key !== "forcedownload") || keys.length > 1) return null;
        const forceDownload = candidate.searchParams.get("forcedownload");
        if (forceDownload !== null && !["0", "1"].includes(forceDownload)) return null;
        return candidate.toString();
    } catch (error) { return null; }
}

function safeMoodleSessionFileUrl(value, baseUrl) {
    if (!value) return null;
    try {
        const candidate = new URL(value, `${deriveMoodleWebUrl(baseUrl)}/`);
        const base = new URL(deriveMoodleWebUrl(baseUrl));
        const pathName = decodeURIComponent(candidate.pathname || "");
        // Browser-session access is limited to the standard Moodle file route
        // already advertised by fixed course-content responses. It accepts no
        // query, token, redirect or arbitrary same-host path.
        if (candidate.protocol !== "https:" || candidate.origin !== base.origin || candidate.username || candidate.password || candidate.search || candidate.hash || !/(?:^|\/)pluginfile\.php\//i.test(pathName)) return null;
        return candidate.toString();
    } catch (error) { return null; }
}

function mapMoodleError(error = {}) {
    const code = String(error.errorcode || error.code || "").toLowerCase();
    const message = String(error.message || "").toLowerCase();
    if (code.includes("invalidtoken") || message.includes("invalid token")) return new LmsError("INVALID_TOKEN", "Moodle rejected the configured token.");
    if (code.includes("accessexception") || code.includes("nopermissions") || message.includes("permission")) return new LmsError("PERMISSION_DENIED", "Moodle denied this read capability for the current account.");
    if (code.includes("servicenotavailable") || message.includes("service is not enabled")) return new LmsError("SERVICE_DISABLED", "Moodle Web Services are not enabled for this account or service.");
    if (code.includes("invalidparameter") || message.includes("function is not available")) return new LmsError("CAPABILITY_UNAVAILABLE", "This Moodle capability is not exposed by the configured service.");
    return new LmsError("SERVER_ERROR", "Moodle returned a bounded service error.");
}

module.exports = Object.freeze({LMS_PROVIDER_TYPES, LMS_CONNECTION_STATES, LMS_CAPABILITY_STATES, MOODLE_CAPABILITIES, WRITE_CAPABILITIES, ERROR_CODES, LIMITS, LmsError, plainObject, allowedKeys, text, enumValue, safeId, normalizeBaseUrl, deriveMoodleEndpoint, deriveMoodleWebUrl, emptyCapabilities, normalizeCapabilities, normalizeProviderConfig, createRequestId, sanitizeDisplayText, safeReferenceUrl, safeMoodleFileUrl, safeMoodleSessionFileUrl, mapMoodleError});
