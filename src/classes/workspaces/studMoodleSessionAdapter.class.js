"use strict";

const Lms = require("./studLmsModel.class.js");
const {MoodleAdapter, READ_FUNCTIONS} = require("./studMoodleAdapter.class.js");

function sessionError(payload) {
    const first = Array.isArray(payload) ? payload[0] : payload;
    if (first && (first.error || first.exception || first.errorcode)) return Lms.mapMoodleError(first.exception || first);
    return null;
}

class MoodleSessionAdapter extends MoodleAdapter {
    constructor(options = {}) {
        if (!options.session || typeof options.session.fetch !== "function") throw new Lms.LmsError("AUTH_REQUIRED", "The institution sign-in session is unavailable. Reauthenticate to continue.");
        super({...options, token: "session-bound", fetch: async () => { throw new Lms.LmsError("POLICY_BLOCKED", "Session requests use the audited Moodle adapter."); }});
        this.session = options.session;
        this.sesskey = null;
    }

    async dashboard() {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        this.controllers.set(this.requestId, controller);
        try {
            const response = await this.session.fetch(`${this.baseUrl}/my/`, {method: "GET", redirect: "error", cache: "no-store", headers: {accept: "text/html"}, signal: controller.signal});
            if (!response.ok) throw new Lms.LmsError("AUTH_REQUIRED", "The institutional Moodle session is no longer valid. Reauthenticate to continue.");
            const contentLength = Number(response.headers && response.headers.get && response.headers.get("content-length"));
            if (Number.isFinite(contentLength) && contentLength > Lms.LIMITS.responseBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "The Moodle session page exceeded the permitted size.");
            const text = await response.text();
            if (Buffer.byteLength(text, "utf8") > Lms.LIMITS.responseBytes || /(?:name=["']username|id=["']login)/i.test(text)) throw new Lms.LmsError("AUTH_REQUIRED", "The institutional Moodle session is no longer valid. Reauthenticate to continue.");
            const match = text.match(/["']sesskey["']\s*[:=]\s*["']([A-Za-z0-9]{10,128})["']/i) || text.match(/[?&]sesskey=([A-Za-z0-9]{10,128})/i) || text.match(/name=["']sesskey["']\s+value=["']([A-Za-z0-9]{10,128})["']/i);
            if (!match) throw new Lms.LmsError("AUTH_REQUIRED", "Moodle did not expose an active session key. Reauthenticate to continue.");
            this.sesskey = match[1];
        } catch (error) {
            if (error instanceof Lms.LmsError) throw error;
            if (controller.signal.aborted) throw new Lms.LmsError("CANCELLED", "Moodle session request was cancelled.");
            throw new Lms.LmsError("OFFLINE", "Moodle could not be reached from this device.");
        } finally { clearTimeout(timeout); if (this.controllers.get(this.requestId) === controller) this.controllers.delete(this.requestId); }
    }

    async call(functionName, parameters = {}) {
        if (!Object.values(READ_FUNCTIONS).includes(functionName)) throw new Lms.LmsError("POLICY_BLOCKED", "Aegis permits only audited Moodle read functions.");
        if (!this.sesskey) await this.dashboard();
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        this.controllers.set(this.requestId, controller);
        try {
            const endpoint = new URL(`${this.baseUrl}/lib/ajax/service.php`); endpoint.searchParams.set("sesskey", this.sesskey);
            const response = await this.session.fetch(endpoint.toString(), {
                method: "POST", redirect: "error", cache: "no-store",
                headers: {"content-type": "application/json", accept: "application/json"},
                body: JSON.stringify([{index: 0, methodname: functionName, args: parameters}]), signal: controller.signal
            });
            if (response.status === 401 || response.status === 403) throw new Lms.LmsError("AUTH_REQUIRED", "The institutional Moodle session is no longer valid. Reauthenticate to continue.");
            if (response.status === 429) throw new Lms.LmsError("RATE_LIMITED", "Moodle rate-limited this explicit read request.");
            if (!response.ok) throw new Lms.LmsError("SERVER_ERROR", `Moodle returned HTTP ${response.status}.`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.byteLength > Lms.LIMITS.responseBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle response exceeded the permitted size.");
            let payload; try { payload = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle returned invalid JSON."); }
            const error = sessionError(payload); if (error) throw error;
            const first = Array.isArray(payload) ? payload[0] : payload;
            return first && Object.prototype.hasOwnProperty.call(first, "data") ? first.data : payload;
        } catch (error) {
            if (error instanceof Lms.LmsError) throw error;
            if (controller.signal.aborted) throw new Lms.LmsError("CANCELLED", "Moodle session request was cancelled.");
            throw new Lms.LmsError("OFFLINE", "Moodle could not be reached from this device.");
        } finally { clearTimeout(timeout); if (this.controllers.get(this.requestId) === controller) this.controllers.delete(this.requestId); }
    }

    safeFileUrl(value) { return Lms.safeMoodleSessionFileUrl(value, this.baseUrl); }

    normalizeResources(contents, courseId) {
        // The inherited normalizer is kept for all field/provenance semantics;
        // only its fixed, session-bound file allowlist differs.
        return super.normalizeResources(contents, courseId);
    }

    async downloadResourceFile(resource = {}) {
        const url = this.safeFileUrl(resource.downloadUrl);
        if (!url) throw new Lms.LmsError("POLICY_BLOCKED", "Moodle resource is not an approved same-instance session file.");
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        this.controllers.set(this.requestId, controller);
        try {
            const response = await this.session.fetch(url, {method: "GET", redirect: "error", cache: "no-store", headers: {accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1"}, signal: controller.signal});
            if (response.status === 401 || response.status === 403) throw new Lms.LmsError("AUTH_REQUIRED", "The institutional Moodle session is no longer valid. Reauthenticate to continue.");
            if (!response.ok) throw new Lms.LmsError("SERVER_ERROR", `Moodle file download returned HTTP ${response.status}.`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (!bytes.length || bytes.length > Lms.LIMITS.fileBytes) throw new Lms.LmsError("MALFORMED_RESPONSE", "Moodle file exceeds the permitted size.");
            const type = Lms.sanitizeDisplayText(String(response.headers && response.headers.get && response.headers.get("content-type") || "").split(";", 1)[0], 120);
            if (/text\/html/i.test(type || "") || /^<!doctype html/i.test(bytes.subarray(0, 32).toString("utf8"))) throw new Lms.LmsError("AUTH_REQUIRED", "The institutional Moodle session is no longer valid. Reauthenticate to continue.");
            return Object.freeze({bytes, mimeType: type || resource.mimeType || "application/octet-stream"});
        } catch (error) {
            if (error instanceof Lms.LmsError) throw error;
            if (controller.signal.aborted) throw new Lms.LmsError("CANCELLED", "Moodle file request was cancelled.");
            throw new Lms.LmsError("OFFLINE", "Moodle file could not be reached from this device.");
        } finally { clearTimeout(timeout); if (this.controllers.get(this.requestId) === controller) this.controllers.delete(this.requestId); }
    }
}

module.exports = {MoodleSessionAdapter};
