"use strict";

const path = require("path");
const Model = require("./studAcademicModel.class.js");
const {StudAcademicStore} = require("./studAcademicStore.class.js");
const {StudResearchRuntime} = require("./studResearchRuntime.class.js");
const {StudLmsRuntime} = require("./studLmsRuntime.class.js");

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
    "stud-search",
    "stud-command-center",
    "stud-course-context",
    "stud-reference-list",
    "stud-reference-link",
    "stud-reference-unlink",
    "stud-orchestration-context",
    "stud-orchestration-propose-reference",
    "stud-orchestration-confirm-reference",
    "stud-orchestration-user-override",
    "stud-revision-overview",
    "stud-revision-list",
    "stud-revision-context",
    "stud-revision-plan",
    "stud-revision-schedule",
    "stud-study-session-start",
    "stud-study-session-transition",
    "stud-study-session-history",
    "stud-research-status",
    "stud-research-search",
    "stud-research-resolve-crossref",
    "stud-research-resolve-datacite",
    "stud-research-open-access",
    "stud-research-cancel",
    "stud-research-save",
    "stud-research-library",
    "stud-research-context",
    "stud-research-link",
    "stud-paper-import-pdf",
    "stud-paper-save-oa-pdf",
    "stud-paper-read-pdf",
    "stud-paper-read-oa-pdf",
    "stud-paper-set-oa",
    "stud-note-save-structured",
    "stud-citation-render",
    "stud-zotero-status",
    "stud-zotero-list",
    "stud-zotero-import",
    "stud-moodle-status",
    "stud-moodle-configure",
    "stud-moodle-probe",
    "stud-moodle-sync",
    "stud-moodle-ics-sync",
    "stud-moodle-cancel",
    "stud-moodle-open-web"
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
    let dialog = options.dialog || null;
    if (!dialog) { try { dialog = require("electron").dialog; } catch (error) {} }
    const runtime = options.researchRuntime || new StudResearchRuntime({root: resolveStorageRoot(options.app, options), dialog, env: options.env || process.env, fetch: options.fetch});
    const lmsRuntime = options.lmsRuntime || new StudLmsRuntime({store, root: resolveStorageRoot(options.app, options), fetch: options.fetch, safeStorage: options.safeStorage, shell: options.shell, allowLocalDevelopment: options.allowLocalDevelopment === true});
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
    add("stud-entity-list", ["entityType", "courseId", "assignmentId", "limit", "includeArchived"], payload => store.listEntities(payload.entityType, payload));
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
    add("stud-command-center", ["now", "limit"], payload => store.getCommandCenter(payload));
    add("stud-course-context", ["courseId", "limit"], payload => store.getCourseContext(payload.courseId, {limit: payload.limit}));
    add("stud-reference-list", ["entityType", "entityId"], payload => store.listReferences(payload.entityType, payload.entityId));
    add("stud-reference-link", ["entityType", "entityId", "kind", "externalId"], payload => store.linkReference(payload));
    add("stud-reference-unlink", ["entityType", "entityId", "identifierId", "confirmation"], payload => store.unlinkReference(payload));
    // These local-only actions are intentionally bounded. They cannot query a
    // provider, inspect a mailbox or mutate Calendar/Moodle.
    add("stud-orchestration-context", ["assignmentId"], payload => store.assignmentOrchestrationContext(payload.assignmentId));
    add("stud-orchestration-propose-reference", ["assignmentId", "kind", "externalId", "title", "courseCode", "dueDate", "startDate", "endDate"], payload => store.proposeReferenceCandidate(payload));
    add("stud-orchestration-confirm-reference", ["assignmentId", "kind", "externalId", "title", "courseCode", "dueDate", "startDate", "endDate", "confirmation"], payload => store.confirmReferenceCandidate(payload));
    add("stud-orchestration-user-override", ["entityType", "entityId", "field", "value", "note"], payload => store.applyUserOverride(payload));
    // Revision planning is local-only. These typed calls cannot invoke Moodle,
    // Calendar, Email, providers, shell commands or arbitrary filesystem access.
    add("stud-revision-overview", ["now", "limit"], payload => store.revisionOverview(payload));
    add("stud-revision-list", ["courseId", "assignmentId", "status", "priority", "scheduled", "overdue", "query", "sort", "limit", "includeArchived"], payload => store.listRevisionItems(payload));
    add("stud-revision-context", ["revisionItemId", "historyLimit"], payload => store.revisionItemContext(payload.revisionItemId, payload));
    add("stud-revision-plan", ["now", "limit"], payload => store.studyPlan(payload));
    add("stud-revision-schedule", ["revisionItemId", "scheduledRevisionAt", "pinned", "planPosition", "dismissSuggestionUntil", "note"], payload => store.scheduleRevision(payload));
    add("stud-study-session-start", ["revisionItemId"], payload => store.startStudySession(payload));
    add("stud-study-session-transition", ["sessionId", "action", "difficulty", "confidence", "note", "scheduleNext"], payload => store.transitionStudySession(payload));
    add("stud-study-session-history", ["revisionItemId", "limit", "includeCancelled"], payload => store.listStudySessions(payload.revisionItemId, payload));
    add("stud-research-status", [], () => runtime.status());
    add("stud-research-search", ["query", "year", "limit", "requestId"], payload => runtime.searchOpenAlex(payload));
    add("stud-research-resolve-crossref", ["doi", "requestId"], payload => runtime.resolveCrossref(payload));
    add("stud-research-resolve-datacite", ["doi", "requestId"], payload => runtime.resolveDataCite(payload));
    add("stud-research-open-access", ["doi", "requestId"], payload => runtime.findOpenAccess(payload));
    add("stud-research-cancel", ["requestId"], payload => runtime.cancel(payload.requestId));
    add("stud-research-save", ["token", "courseId", "assignmentId"], payload => {
        const result = runtime.resolveToken(payload.token);
        return store.saveResearchObservation(result.normalized, {courseId: payload.courseId || null, assignmentId: payload.assignmentId || null, source: result.provider});
    });
    add("stud-research-library", ["limit"], payload => store.researchLibrary(payload));
    add("stud-research-context", ["paperId"], payload => store.researchContext(payload.paperId));
    add("stud-research-link", ["paperId", "courseId", "assignmentId"], payload => {
        store.linkPaperContext(Model.safeId(payload.paperId, "Paper ID"), {courseId: payload.courseId || null, assignmentId: payload.assignmentId || null, source: "USER"});
        return store.researchContext(payload.paperId);
    });
    add("stud-paper-import-pdf", ["paperId"], async payload => {
        const document = await runtime.chooseAndImportPdf({paperId: payload.paperId});
        if (document.cancelled) return document;
        const {cancelled, ...managedDocument} = document;
        return {document: managedDocument, paper: store.setPaperDocument(payload.paperId, managedDocument)};
    });
    add("stud-paper-save-oa-pdf", ["paperId", "pdfToken", "requestId"], async payload => {
        const document = await runtime.saveOaPdf(payload);
        return {document, paper: store.setPaperDocument(payload.paperId, document)};
    });
    add("stud-paper-read-oa-pdf", ["pdfToken", "requestId"], payload => runtime.readOaPdf(payload));
    add("stud-paper-read-pdf", ["paperId"], payload => {
        const paper = store.getEntity("RESEARCH_PAPER", payload.paperId);
        if (!paper || !paper.localDocumentReference) throw new Model.StudError("DOCUMENT_MISSING", "This research object has no managed local PDF.");
        return runtime.readManagedPdf(paper.localDocumentReference);
    });
    add("stud-paper-set-oa", ["paperId", "oa"], payload => store.setPaperOpenAccess(payload.paperId, payload.oa));
    add("stud-note-save-structured", ["noteId", "title", "document", "courseId", "assignmentId", "paperIds", "selectionProvenance"], payload => store.saveStructuredNote(payload));
    add("stud-citation-render", ["paperIds", "style"], payload => {
        const ids = Array.isArray(payload.paperIds) ? payload.paperIds.slice(0, 100) : [];
        const papers = ids.map(id => store.getEntity("RESEARCH_PAPER", id)).filter(Boolean);
        if (!papers.length) throw new Model.StudError("INVALID_INPUT", "Select at least one saved research object.");
        return runtime.citation(papers, payload.style);
    });
    add("stud-zotero-status", ["requestId"], payload => runtime.checkZotero(payload));
    add("stud-zotero-list", ["requestId", "limit"], payload => runtime.listZotero(payload));
    add("stud-zotero-import", ["token", "courseId", "assignmentId"], payload => {
        const result = runtime.resolveToken(payload.token);
        if (result.provider !== "ZOTERO_LOCAL") throw new Model.StudError("POLICY_BLOCKED", "Only an explicitly selected Zotero local item can be imported here.");
        const saved = store.saveResearchObservation(result.normalized, {courseId: payload.courseId || null, assignmentId: payload.assignmentId || null, source: "ZOTERO_LOCAL"});
        try { store.createExternalIdentifier({entityType: "RESEARCH_PAPER", entityId: saved.paper.id, namespace: "ZOTERO", externalId: result.normalized.providerRecordId, source: "ZOTERO_LOCAL"}); } catch (error) { if (error.code !== "DUPLICATE_EXTERNAL_IDENTIFIER") throw error; }
        return saved;
    });
    // Moodle is an explicitly configured, capability-driven provider. These
    // channels never expose a secret back to the renderer or accept an endpoint,
    // HTTP method or headers outside the adapter's fixed contract.
    add("stud-moodle-status", [], () => lmsRuntime.status());
    add("stud-moodle-configure", ["baseUrl", "displayName", "token", "icsUrl", "clearToken", "clearIcsUrl"], payload => lmsRuntime.configure(payload));
    add("stud-moodle-probe", ["requestId"], payload => lmsRuntime.probe(payload));
    add("stud-moodle-sync", ["requestId"], payload => lmsRuntime.sync(payload));
    add("stud-moodle-ics-sync", ["requestId"], payload => lmsRuntime.syncIcs(payload));
    add("stud-moodle-cancel", ["requestId"], payload => lmsRuntime.cancel(payload.requestId));
    add("stud-moodle-open-web", [], () => lmsRuntime.openWeb());

    return Object.freeze({channels: CHANNELS, store, dispose: () => {
        if (typeof ipc.removeHandler === "function") handlers.forEach((_handler, channel) => ipc.removeHandler(channel));
        handlers.clear();
        runtime.dispose();
        lmsRuntime.dispose();
        store.close();
    }});
}

module.exports = {CHANNELS, senderIsTrusted, resolveStorageRoot, createStore, registerStudAcademicIpc};
