"use strict";

const path = require("path");
const {CaseService, safeError} = require("./osintCaseServices.class.js");
const Model = require("./osintCaseModel.class.js");

const CHANNELS = Object.freeze([
    "osint-case-list",
    "osint-case-create",
    "osint-case-read",
    "osint-case-update",
    "osint-case-archive",
    "osint-evidence-create",
    "osint-evidence-read",
    "osint-evidence-remove",
    "osint-evidence-verify",
    "osint-evidence-export",
    "osint-case-note-create",
    "osint-case-note-update",
    "osint-case-export"
]);

function senderIsTrusted(event) {
    if (!event || !event.sender || event.sender.isDestroyed()) return false;
    const url = String(event.sender.getURL ? event.sender.getURL() : "");
    return url.startsWith("file:") || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
}

function assertSender(event) {
    if (!senderIsTrusted(event)) throw new Model.CaseError("POLICY_BLOCKED", "This request is not available to the current renderer.");
}

function assertPayload(payload, max = Model.LIMITS.payloadBytes) {
    if (payload === null || payload === undefined) return;
    Model.rejectUnsafeObject(payload);
    if (Model.bytesOf(payload) > max) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Request payload exceeds the permitted size.");
}

function assertPayloadKeys(payload, keys, label) {
    assertPayload(payload);
    Model.assertAllowedKeys(payload || {}, keys, label);
}

function resolveStorageRoot(app, options = {}) {
    if (options.storageRoot) return path.resolve(options.storageRoot);
    if (!app || typeof app.getPath !== "function") throw new Model.CaseError("STORAGE_UNAVAILABLE", "Local case storage is unavailable.");
    return path.join(app.getPath("userData"), "osint");
}

function createService(app, options = {}) {
    return options.service || new CaseService({root: resolveStorageRoot(app, options), applicationVersion: options.applicationVersion || (app && app.getVersion ? app.getVersion() : "unknown")});
}

function registerOsintCaseIpc(options = {}) {
    const ipc = options.ipc;
    if (!ipc || typeof ipc.handle !== "function") throw new Error("ipcMain.handle is required for OSINT case IPC.");
    const service = createService(options.app, options);
    const dialog = options.dialog || null;
    const handlers = new Map();
    const add = (channel, handler) => {
        if (handlers.has(channel)) throw new Error(`Duplicate OSINT case IPC channel: ${channel}`);
        const wrapped = async (event, payload = {}) => {
            try {
                assertSender(event);
                return await handler(payload, event);
            } catch (error) {
                return safeError(error);
            }
        };
        ipc.handle(channel, wrapped);
        handlers.set(channel, wrapped);
    };

    add("osint-case-list", async payload => {
        assertPayloadKeys(payload, [], "Case list request");
        return service.list();
    });
    add("osint-case-create", async payload => {
        assertPayloadKeys(payload, ["title", "description", "priority", "tags"], "Case create request");
        return service.create(payload);
    });
    add("osint-case-read", async payload => {
        assertPayloadKeys(payload, ["caseId"], "Case read request");
        return service.read(Model.safeId(payload.caseId, "case"));
    });
    add("osint-case-update", async payload => {
        assertPayloadKeys(payload, ["caseId", "patch"], "Case update request");
        return service.update(Model.safeId(payload.caseId, "case"), payload.patch);
    });
    add("osint-case-archive", async payload => {
        assertPayloadKeys(payload, ["caseId", "confirmation"], "Case archive request");
        if (payload.confirmation !== true) throw new Model.CaseError("POLICY_BLOCKED", "Case archive requires explicit confirmation.");
        return service.archive(Model.safeId(payload.caseId, "case"));
    });
    add("osint-evidence-create", async payload => {
        assertPayloadKeys(payload, ["caseId", "normalizedResult", "draft", "manual"], "Evidence create request");
        return service.createEvidence(Model.safeId(payload.caseId, "case"), payload);
    });
    add("osint-evidence-read", async payload => {
        assertPayloadKeys(payload, ["caseId", "evidenceId"], "Evidence read request");
        return service.readEvidence(Model.safeId(payload.caseId, "case"), Model.safeId(payload.evidenceId, "evidence"));
    });
    add("osint-evidence-remove", async payload => {
        assertPayloadKeys(payload, ["caseId", "evidenceId", "confirmation"], "Evidence remove request");
        return service.removeEvidence(Model.safeId(payload.caseId, "case"), Model.safeId(payload.evidenceId, "evidence"), payload.confirmation === true);
    });
    add("osint-evidence-verify", async payload => {
        assertPayloadKeys(payload, ["caseId", "evidenceId"], "Evidence verify request");
        return service.verifyEvidence(Model.safeId(payload.caseId, "case"), Model.safeId(payload.evidenceId, "evidence"));
    });
    add("osint-evidence-export", async payload => {
        assertPayloadKeys(payload, ["caseId", "evidenceId", "format"], "Evidence export request");
        const caseId = Model.safeId(payload.caseId, "case");
        const evidenceId = Model.safeId(payload.evidenceId, "evidence");
        if (!["json", "markdown"].includes(payload.format)) throw new Model.CaseError("EXPORT_FAILED", "Export format is invalid.");
        if (!dialog || typeof dialog.showSaveDialog !== "function") throw new Model.CaseError("EXPORT_FAILED", "The secure export destination selector is unavailable.");
        const extension = payload.format === "json" ? "json" : "md";
        const response = await dialog.showSaveDialog({title: "Export OSINT evidence", buttonLabel: "Export Evidence", filters: [{name: payload.format === "json" ? "JSON" : "Markdown", extensions: [extension]}], properties: ["createDirectory", "showOverwriteConfirmation"]});
        if (response.canceled || !response.filePath) return {ok: false, code: "EXPORT_CANCELLED", message: "Export cancelled."};
        return service.exportEvidence(caseId, evidenceId, payload.format, response.filePath);
    });
    add("osint-case-note-create", async payload => {
        assertPayloadKeys(payload, ["caseId", "evidenceId", "text", "tags"], "Case note request");
        return service.addNote(Model.safeId(payload.caseId, "case"), payload);
    });
    add("osint-case-note-update", async payload => {
        assertPayloadKeys(payload, ["caseId", "noteId", "patch"], "Case note update request");
        return service.updateNote(Model.safeId(payload.caseId, "case"), Model.safeId(payload.noteId, "note"), payload.patch);
    });
    add("osint-case-export", async payload => {
        assertPayloadKeys(payload, ["caseId", "format"], "Case export request");
        const caseId = Model.safeId(payload.caseId, "case");
        if (!["json", "markdown"].includes(payload.format)) throw new Model.CaseError("EXPORT_FAILED", "Export format is invalid.");
        if (!dialog || typeof dialog.showSaveDialog !== "function") throw new Model.CaseError("EXPORT_FAILED", "The secure export destination selector is unavailable.");
        const extension = payload.format === "json" ? "json" : "md";
        const response = await dialog.showSaveDialog({title: "Export OSINT case", buttonLabel: "Export Case", filters: [{name: payload.format === "json" ? "JSON" : "Markdown", extensions: [extension]}], properties: ["createDirectory", "showOverwriteConfirmation"]});
        if (response.canceled || !response.filePath) return {ok: false, code: "EXPORT_CANCELLED", message: "Export cancelled."};
        return service.exportCase(caseId, payload.format, response.filePath);
    });

    return Object.freeze({channels: CHANNELS, service, dispose: () => {
        if (typeof ipc.removeHandler === "function") handlers.forEach((_handler, channel) => ipc.removeHandler(channel));
        handlers.clear();
    }});
}

module.exports = {CHANNELS, senderIsTrusted, assertSender, assertPayload, assertPayloadKeys, resolveStorageRoot, createService, registerOsintCaseIpc};
