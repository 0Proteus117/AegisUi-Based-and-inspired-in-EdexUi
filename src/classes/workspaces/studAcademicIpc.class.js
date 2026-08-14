"use strict";

const path = require("path");
const Model = require("./studAcademicModel.class.js");
const {StudAcademicStore} = require("./studAcademicStore.class.js");
const {StudResearchRuntime} = require("./studResearchRuntime.class.js");
const {StudLmsRuntime} = require("./studLmsRuntime.class.js");
const {StudComputeRuntime} = require("./studComputeRuntime.class.js");
const {StudDocumentRuntime} = require("./studDocumentRuntime.class.js");
const {StudAcademicAssistantRuntime} = require("./studAcademicAssistantRuntime.class.js");
const {StudNotebookRuntime, normalizeGitHub} = require("./studNotebookRuntime.class.js");
const {StudToolCatalog} = require("./studToolCatalog.class.js");

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
    "stud-assignment-requirements",
    "stud-progress-overview",
    "stud-progress-assessments",
    "stud-progress-revision",
    "stud-progress-activity",
    "stud-progress-metric-sources",
    "stud-tool-catalog",
    "stud-tool-packs",
    "stud-tool-detail",
    "stud-tool-preference-update",
    "stud-tool-preferences-reset",
    "stud-tool-profile",
    "stud-tool-profile-update",
    "stud-tool-launch",
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
    "stud-compute-capabilities",
    "stud-compute-run",
    "stud-compute-save-result",
    "stud-compute-list",
    "stud-notebook-capabilities",
    "stud-notebook-list",
    "stud-notebook-create",
    "stud-notebook-read",
    "stud-notebook-update",
    "stud-notebook-cell-create",
    "stud-notebook-cell-update",
    "stud-notebook-cell-reorder",
    "stud-notebook-cell-delete",
    "stud-notebook-output-clear",
    "stud-dataset-import",
    "stud-dataset-list",
    "stud-dataset-read",
    "stud-dataset-analyze",
    "stud-github-normalize",
    "stud-github-create",
    "stud-github-list",
    "stud-github-metadata",
    "stud-github-cancel",
    "stud-document-capabilities",
    "stud-document-import-pdf",
    "stud-document-analyze",
    "stud-document-cancel",
    "stud-document-list",
    "stud-document-context",
    "stud-document-search",
    "stud-document-read-pdf",
    "stud-document-create-note",
    "stud-document-create-revision",
    "stud-academic-context-build",
    "stud-academic-context-search",
    "stud-academic-context-decide",
    "stud-academic-context-package-create",
    "stud-academic-context-package-list",
    "stud-academic-context-package-read",
    "stud-academic-ai-status",
    "stud-academic-ai-generate",
    "stud-academic-ai-cancel",
    "stud-academic-ai-save-note",
    "stud-academic-ai-revision-candidates",
    "stud-academic-ai-revision-accept",
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
    "stud-moodle-sync-preferences",
    "stud-moodle-forget-account",
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
    const lmsRuntime = options.lmsRuntime || new StudLmsRuntime({store, root: resolveStorageRoot(options.app, options), fetch: options.fetch, safeStorage: options.safeStorage, shell: options.shell, app: options.app, allowLocalDevelopment: options.allowLocalDevelopment === true});
    // The compute runtime is pure local code. It has no process spawning,
    // filesystem, provider or network capability.
    const computeRuntime = options.computeRuntime || new StudComputeRuntime();
    // Notebook/Data/GitHub is deliberately narrow: no interpreter, shell,
    // generic file bridge, generic HTTP client or renderer-controlled request.
    const notebookRuntime = options.notebookRuntime || new StudNotebookRuntime({root: resolveStorageRoot(options.app, options), dialog, fetch: options.fetch});
    // Document Intelligence is local-only. It receives managed PDF bytes from
    // the established explicit-selector runtime; it has no own filesystem,
    // shell, environment or network authority.
    const documentRuntime = options.documentRuntime || new StudDocumentRuntime({readManagedPdf: reference => runtime.readManagedPdf(reference)});
    // Moodle may classify explicitly synchronized PDFs through this already
    // bounded local-only runtime. The adapter never receives document-parser
    // authority, and no raw Moodle URL/token is exposed to it or the renderer.
    if (typeof lmsRuntime.setDocumentRuntime === "function") lmsRuntime.setDocumentRuntime(documentRuntime);
    // This runtime receives Context Package snapshots only. It has no generic
    // filesystem, provider, shell or tool bridge and may contact only a
    // configured loopback Ollama endpoint after an explicit user request.
    const academicAiRuntime = options.academicAiRuntime || new StudAcademicAssistantRuntime({store, userDataRoot: options.app && options.app.getPath ? options.app.getPath("userData") : ""});
    const toolCatalog = options.toolCatalog || new StudToolCatalog(store);
    let shell = options.shell || null;
    if (!shell) { try { shell = require("electron").shell; } catch (error) {} }
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
    add("stud-assignment-requirements", ["assignmentId"], payload => store.assignmentRequirements(payload.assignmentId));
    // Progress Analytics is a strictly derived local read surface. These
    // handlers cannot write, invoke providers, inspect Calendar/Email, or
    // create a background history.
    add("stud-progress-overview", ["now", "courseId"], payload => store.progress.overview(payload));
    add("stud-progress-assessments", ["courseId", "limit"], payload => store.progress.assessments(payload));
    add("stud-progress-revision", ["courseId", "limit"], payload => store.progress.revision(payload));
    add("stud-progress-activity", ["courseId", "limit"], payload => store.progress.activity(payload));
    add("stud-progress-metric-sources", ["scope", "courseId", "assignmentId"], payload => store.progress.metricSources(payload));
    // Catalog metadata is built into Aegis. The only mutable state is the
    // explicit local preference/profile store; no registry update or network
    // discovery route exists.
    add("stud-tool-catalog", ["filters"], payload => toolCatalog.catalog(payload));
    add("stud-tool-packs", [], () => toolCatalog.packs());
    add("stud-tool-detail", ["toolId"], payload => toolCatalog.detail(payload.toolId));
    add("stud-tool-preference-update", ["toolId", "favorite", "hidden", "pinned", "markUsed"], payload => store.updateToolPreference(payload));
    add("stud-tool-preferences-reset", [], () => store.resetToolPreferences());
    add("stud-tool-profile", [], () => store.listDisciplineProfile());
    add("stud-tool-profile-update", ["disciplines"], payload => store.replaceDisciplineProfile(payload));
    // The renderer supplies an ID, never a URL. The catalog service resolves
    // only its own HTTPS registry URL before opening the system browser.
    add("stud-tool-launch", ["toolId"], payload => toolCatalog.launch(payload.toolId, shell));
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
    add("stud-compute-capabilities", [], () => computeRuntime.capabilities());
    add("stud-compute-run", ["tool", "operation", "input"], payload => computeRuntime.run(payload));
    // The renderer supplies the same typed request again; main recomputes it
    // before persistence instead of accepting a renderer-provided result.
    add("stud-compute-save-result", ["request", "context"], payload => store.saveComputeResult(computeRuntime.run(payload.request), payload.context || {}));
    add("stud-compute-list", ["courseId", "assignmentId", "limit", "includeArchived"], payload => store.listComputeResults(payload));
    add("stud-notebook-capabilities", [], () => notebookRuntime.capabilities());
    add("stud-notebook-list", ["courseId", "assignmentId", "limit", "includeArchived"], payload => store.listNotebooks(payload));
    add("stud-notebook-create", ["title", "description", "notebookType", "language", "courseId", "assignmentId", "noteId", "resourceId", "documentId", "datasetId", "repositoryId"], payload => {
        const {courseId, assignmentId, noteId, resourceId, documentId, datasetId, repositoryId} = payload;
        return store.createNotebook(payload, {courseId, assignmentId, noteId, resourceId, documentId, datasetId, repositoryId});
    });
    add("stud-notebook-read", ["notebookId"], payload => store.notebookContext(payload.notebookId));
    add("stud-notebook-update", ["notebookId", "value"], payload => store.updateEntity("NOTEBOOK", payload.notebookId, payload.value));
    add("stud-notebook-cell-create", ["notebookId", "cellType", "source", "afterCellId"], payload => store.createNotebookCell(payload));
    add("stud-notebook-cell-update", ["notebookId", "cellId", "cellType", "source"], payload => store.updateNotebookCell(payload));
    add("stud-notebook-cell-reorder", ["notebookId", "cellIds"], payload => store.reorderNotebookCells(payload.notebookId, payload.cellIds));
    add("stud-notebook-cell-delete", ["notebookId", "cellId", "confirmation"], payload => {
        if (payload.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Deleting a notebook cell requires explicit confirmation.");
        return store.deleteNotebookCell(payload.notebookId, payload.cellId);
    });
    add("stud-notebook-output-clear", ["notebookId", "cellId", "confirmation"], payload => {
        if (payload.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Clearing notebook outputs requires explicit confirmation.");
        return store.clearNotebookOutputs(payload);
    });
    add("stud-dataset-import", ["title", "description", "courseId", "assignmentId", "resourceId", "notebookId"], async payload => {
        const managed = await notebookRuntime.chooseAndImportDataset();
        if (managed.cancelled) return managed;
        const {title, description, ...context} = payload;
        return store.saveDataset({...managed, title: title || managed.title}, {...context, description: description || null});
    });
    add("stud-dataset-list", ["courseId", "assignmentId", "limit", "includeArchived"], payload => store.listDatasets(payload));
    add("stud-dataset-read", ["datasetId"], payload => {
        const dataset = store.getEntity("DATASET", payload.datasetId);
        if (!dataset) throw new Model.StudError("NOT_FOUND", "Dataset does not exist.");
        const inspected = notebookRuntime.readManagedDataset(dataset.managedReference);
        return {dataset, preview: inspected.preview, columns: inspected.columns, summary: inspected.summary};
    });
    add("stud-dataset-analyze", ["datasetId", "operation", "input"], payload => {
        const dataset = store.getEntity("DATASET", payload.datasetId);
        if (!dataset) throw new Model.StudError("NOT_FOUND", "Dataset does not exist.");
        return notebookRuntime.analyzeDataset(dataset, payload.operation, payload.input || {});
    });
    add("stud-github-normalize", ["repository"], payload => normalizeGitHub(payload.repository));
    add("stud-github-create", ["repository", "selectedRef", "courseId", "assignmentId", "resourceId", "notebookId", "documentId", "datasetId"], payload => {
        const normalized = normalizeGitHub(payload.repository);
        const {repository, selectedRef, ...context} = payload;
        return store.saveRepositoryReference({...normalized, selectedRef: selectedRef || null}, context);
    });
    add("stud-github-list", ["courseId", "assignmentId", "limit", "includeArchived"], payload => store.listRepositoryReferences(payload));
    add("stud-github-metadata", ["repositoryId", "requestId"], async payload => {
        const reference = store.getEntity("REPOSITORY_REFERENCE", payload.repositoryId);
        if (!reference) throw new Model.StudError("NOT_FOUND", "Repository reference does not exist.");
        const observed = await notebookRuntime.githubMetadata({repository: reference.canonicalUrl, requestId: payload.requestId});
        const updated = store.updateEntity("REPOSITORY_REFERENCE", reference.id, {selectedRef: observed.selectedRef, commitSha: observed.commitSha, metadataJson: JSON.stringify(observed.metadata)});
        store.createProvenance({entityType: "REPOSITORY_REFERENCE", entityId: reference.id, field: "publicMetadata", observedValue: observed.title, sourceType: "GITHUB", sourceId: observed.canonicalUrl, sourceAuthority: "CORROBORATING", metadata: {provider: "GITHUB_PUBLIC_API", explicit: true}});
        return updated;
    });
    add("stud-github-cancel", ["requestId"], payload => notebookRuntime.cancel(payload.requestId));
    add("stud-document-capabilities", [], () => documentRuntime.capabilities());
    add("stud-document-import-pdf", ["title", "documentType", "courseId", "assignmentId", "sourcePaperId", "sourceResourceId"], async payload => {
        const managed = await runtime.chooseAndImportPdf({paperId: "document"});
        if (managed.cancelled) return managed;
        const {cancelled, ...document} = managed;
        return store.saveAcademicDocument(document, payload);
    });
    add("stud-document-analyze", ["documentId", "requestId"], async payload => {
        const document = store.getEntity("ACADEMIC_DOCUMENT", payload.documentId);
        if (!document) throw new Model.StudError("NOT_FOUND", "Academic document does not exist.");
        if (!document.managedReference) throw new Model.StudError("DOCUMENT_MISSING", "This academic document has no managed local PDF.");
        const extraction = await documentRuntime.analyze({document, requestId: payload.requestId});
        if (extraction.status === "CANCELLED") return extraction;
        return store.persistDocumentExtraction(document.id, extraction);
    });
    add("stud-document-cancel", ["requestId"], payload => documentRuntime.cancel(payload.requestId));
    add("stud-document-list", ["courseId", "assignmentId", "limit", "includeArchived"], payload => store.listAcademicDocuments(payload));
    add("stud-document-context", ["documentId", "page", "chunkLimit"], payload => {
        const {documentId, ...options} = payload;
        return store.documentContext(documentId, options);
    });
    add("stud-document-search", ["query", "documentId", "limit"], payload => store.searchDocumentChunks(payload.query, {documentId: payload.documentId || null, limit: payload.limit}));
    add("stud-document-read-pdf", ["documentId"], payload => {
        const document = store.getEntity("ACADEMIC_DOCUMENT", payload.documentId);
        if (!document || !document.managedReference) throw new Model.StudError("DOCUMENT_MISSING", "This academic document has no managed local PDF.");
        return runtime.readManagedPdf(document.managedReference);
    });
    add("stud-document-create-note", ["documentId", "chunkId", "title", "courseId", "assignmentId"], payload => store.createDocumentNote(payload));
    add("stud-document-create-revision", ["documentId", "chunkId", "title", "courseId"], payload => store.createDocumentRevision(payload));
    // Academic Intelligence only traverses canonical local STUD data. These
    // handlers neither call providers nor grant file/network/process access.
    add("stud-academic-context-build", ["rootType", "rootId", "options"], payload => store.buildAcademicContext(payload.rootType, payload.rootId, payload.options || {}));
    add("stud-academic-context-search", ["rootType", "rootId", "query", "options"], payload => store.searchAcademicContext(payload.rootType, payload.rootId, payload.query, payload.options || {}));
    add("stud-academic-context-decide", ["rootType", "rootId", "candidateType", "candidateId", "decision", "reason"], payload => store.decideAcademicContext(payload.rootType, payload.rootId, payload.candidateType, payload.candidateId, payload.decision, payload.reason || null));
    add("stud-academic-context-package-create", ["rootType", "rootId", "options"], payload => store.createAcademicContextPackage(payload.rootType, payload.rootId, payload.options || {}));
    add("stud-academic-context-package-list", ["rootType", "rootId", "limit"], payload => store.listAcademicContextPackages(payload.rootType, payload.rootId, payload.limit));
    add("stud-academic-context-package-read", ["packageId"], payload => store.getAcademicContextPackage(payload.packageId));
    add("stud-academic-ai-status", [], () => academicAiRuntime.status());
    add("stud-academic-ai-generate", ["packageId", "question", "mode", "requestId"], payload => academicAiRuntime.generate(payload));
    add("stud-academic-ai-cancel", ["requestId"], payload => academicAiRuntime.cancel(payload.requestId));
    add("stud-academic-ai-save-note", ["responseId", "title"], payload => academicAiRuntime.saveNote(payload));
    add("stud-academic-ai-revision-candidates", ["responseId"], payload => academicAiRuntime.revisionCandidates(payload));
    add("stud-academic-ai-revision-accept", ["responseId", "candidateIndex"], payload => academicAiRuntime.acceptRevision(payload));
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
    add("stud-moodle-sync-preferences", ["automaticSync", "intervalMinutes"], payload => lmsRuntime.configureSyncPreference(payload));
    add("stud-moodle-forget-account", [], () => lmsRuntime.forgetAccount());
    add("stud-moodle-ics-sync", ["requestId"], payload => lmsRuntime.syncIcs(payload));
    add("stud-moodle-cancel", ["requestId"], payload => lmsRuntime.cancel(payload.requestId));
    add("stud-moodle-open-web", [], () => lmsRuntime.openWeb());

    return Object.freeze({channels: CHANNELS, store, dispose: () => {
        if (typeof ipc.removeHandler === "function") handlers.forEach((_handler, channel) => ipc.removeHandler(channel));
        handlers.clear();
        runtime.dispose();
        lmsRuntime.dispose();
        documentRuntime.dispose();
        academicAiRuntime.dispose();
        notebookRuntime.dispose();
        store.close();
    }});
}

module.exports = {CHANNELS, senderIsTrusted, resolveStorageRoot, createStore, registerStudAcademicIpc};
