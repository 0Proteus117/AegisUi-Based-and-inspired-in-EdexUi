"use strict";

const path = require("path");
const Model = require("./studAcademicModel.class.js");
const {StudAcademicStore} = require("./studAcademicStore.class.js");

const CHANNELS = Object.freeze([
    "stud-core-status",
    "stud-entity-list",
    "stud-entity-read",
    "stud-entity-create",
    "stud-entity-update",
    "stud-entity-archive",
    "stud-external-identifier-create",
    "stud-external-identifier-find",
    "stud-provenance-create",
    "stud-provenance-list",
    "stud-relationship-create",
    "stud-relationship-list",
    "stud-search"
]);

function senderIsTrusted(event) {
    if (!event || !event.sender || event.sender.isDestroyed()) return false;
    const location = String(event.sender.getURL ? event.sender.getURL() : "");
    return location.startsWith("file:") || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(location);
}

function errorResponse(error) {
    return {ok: false, code: error && error.code || "STUD_ERROR", message: error && error.message || "Academic storage is unavailable.", details: error && error.details || {}};
}

function assertPayload(payload, keys, label) {
    if (payload === null || payload === undefined) payload = {};
    Model.assertAllowedKeys(payload, keys, label);
    if (Model.bytesOf(payload) > Model.LIMITS.payloadBytes) throw new Model.StudError("PAYLOAD_TOO_LARGE", `${label} exceeds the permitted size.`);
    return payload;
}

function resolveStorageRoot(app, options = {}) {
    if (options.storageRoot) return path.resolve(options.storageRoot);
    if (!app || typeof app.getPath !== "function") throw new Model.StudError("STORAGE_UNAVAILABLE", "Academic storage is unavailable.");
    return path.join(app.getPath("userData"), "stud");
}

function createStore(app, options = {}) {
    return options.store || new StudAcademicStore({root: resolveStorageRoot(app, options), applicationVersion: options.applicationVersion || (app && app.getVersion ? app.getVersion() : "unknown")});
}

function registerStudAcademicIpc(options = {}) {
    const ipc = options.ipc;
    if (!ipc || typeof ipc.handle !== "function") throw new Error("ipcMain.handle is required for STUD academic IPC.");
    const store = createStore(options.app, options);
    store.initialize();
    const handlers = new Map();
    const add = (channel, keys, handler) => {
        if (handlers.has(channel)) throw new Error(`Duplicate STUD IPC channel: ${channel}`);
        const wrapped = async (event, payload = {}) => {
            try {
                if (!senderIsTrusted(event)) throw new Model.StudError("POLICY_BLOCKED", "This academic request is not available to the current renderer.");
                return {ok: true, data: await handler(assertPayload(payload, keys, `${channel} request`))};
            } catch (error) { return errorResponse(error); }
        };
        ipc.handle(channel, wrapped);
        handlers.set(channel, wrapped);
    };

    add("stud-core-status", [], () => store.schemaInfo());
    add("stud-entity-list", ["entityType", "courseId", "limit", "includeArchived"], payload => store.listEntities(payload.entityType, payload));
    add("stud-entity-read", ["entityType", "entityId", "includeArchived"], payload => store.getEntity(payload.entityType, payload.entityId, payload.includeArchived === true));
    add("stud-entity-create", ["entityType", "value", "provenance"], payload => store.createEntity(payload.entityType, payload.value, {provenance: payload.provenance || null}));
    add("stud-entity-update", ["entityType", "entityId", "value"], payload => store.updateEntity(payload.entityType, payload.entityId, payload.value));
    add("stud-entity-archive", ["entityType", "entityId", "confirmation"], payload => {
        if (payload.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Archiving requires explicit confirmation.");
        return store.archiveEntity(payload.entityType, payload.entityId);
    });
    add("stud-external-identifier-create", ["entityType", "entityId", "namespace", "externalId", "source"], payload => store.createExternalIdentifier(payload));
    add("stud-external-identifier-find", ["namespace", "externalId"], payload => store.findByExternalIdentifier(payload.namespace, payload.externalId));
    add("stud-provenance-create", ["entityType", "entityId", "field", "observedValue", "sourceType", "sourceId", "sourceAuthority", "observedAt", "metadata"], payload => store.createProvenance(payload));
    add("stud-provenance-list", ["entityType", "entityId", "field"], payload => store.listProvenance(payload.entityType, payload.entityId, payload.field || null));
    add("stud-relationship-create", ["fromType", "fromId", "relationType", "toType", "toId", "source"], payload => store.createRelationship(payload));
    add("stud-relationship-list", ["entityType", "entityId"], payload => store.listRelationships(payload.entityType, payload.entityId));
    add("stud-search", ["query", "options"], payload => store.search(payload.query, payload.options || {}));

    return Object.freeze({channels: CHANNELS, store, dispose: () => {
        if (typeof ipc.removeHandler === "function") handlers.forEach((_handler, channel) => ipc.removeHandler(channel));
        handlers.clear();
        store.close();
    }});
}

module.exports = {CHANNELS, senderIsTrusted, resolveStorageRoot, createStore, registerStudAcademicIpc};
