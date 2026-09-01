"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studArtifactOperationsModel.class.js");
const {StudArtifactOperationsRepository} = require("./studArtifactOperationsRepository.class.js");

const DEFAULT_ARTIFACT_TYPE = Object.freeze({
    ACADEMIC_DOCUMENT: "ACADEMIC_DOCUMENT", RESEARCH_PAPER: "RESEARCH_PAPER", NOTE: "NOTE",
    RESOURCE: "SOURCE_DOCUMENT", DATASET: "DATASET", NOTEBOOK: "NOTEBOOK",
    REPOSITORY_REFERENCE: "REPOSITORY_CODE", COMPUTE_RESULT: "COMPUTE_RESULT", REVISION_ITEM: "REVISION_ITEM"
});
const RUN_TRANSITIONS = Object.freeze({
    CREATED: Object.freeze({START: "RUNNING", CANCEL: "CANCELLED"}),
    RUNNING: Object.freeze({PAUSE: "PAUSED", COMPLETE: "COMPLETED", FAIL: "FAILED", CANCEL: "CANCELLED"}),
    PAUSED: Object.freeze({RESUME: "RUNNING", FAIL: "FAILED", CANCEL: "CANCELLED"}),
    COMPLETED: Object.freeze({}), FAILED: Object.freeze({}), CANCELLED: Object.freeze({})
});
const TRANSITION_EVENTS = Object.freeze({START: "OPERATION_STARTED", PAUSE: "OPERATION_PAUSED", RESUME: "OPERATION_RESUMED", COMPLETE: "OPERATION_COMPLETED", FAIL: "OPERATION_FAILED", CANCEL: "OPERATION_CANCELLED"});
const TERMINAL_RUN_STATES = Object.freeze(["COMPLETED", "FAILED", "CANCELLED"]);

function labelFor(object) { return String(object.title || object.displayName || object.prompt || object.id || "Academic artifact").trim().slice(0, Domain.LIMITS.label); }
function sensitiveKey(key) { return /(?:token|secret|password|credential|cookie|authorization|signedurl|session)/i.test(String(key)); }
function assertSafeValue(value, path = "metadata", depth = 0) {
    if (depth > 5) throw new Academic.StudError("INVALID_INPUT", `${path} nesting is too deep.`);
    if (Array.isArray(value)) { if (value.length > 100) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${path} has too many items.`); value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`, depth + 1)); return; }
    if (value && typeof value === "object") { Object.entries(value).forEach(([key, item]) => { const canonicalSessionReference = ["lecturerReviewSessionId", "correctionSessionId", "humanisationSessionId"].includes(String(key)) && typeof item === "string" && /^stud_[a-z0-9_]{3,95}$/i.test(item); if (sensitiveKey(key) && !canonicalSessionReference) throw new Academic.StudError("POLICY_BLOCKED", `${path} cannot persist secret-bearing field ${key}.`); assertSafeValue(item, `${path}.${key}`, depth + 1); }); return; }
    if (typeof value === "string") {
        if (value.length > 4000) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${path} text is too long.`);
        if (/^[a-z]+:\/\//i.test(value)) {
            let url; try { url = new URL(value); } catch (error) { throw new Academic.StudError("INVALID_INPUT", `${path} contains an invalid URL.`); }
            if (url.username || url.password || [...url.searchParams.keys()].some(sensitiveKey)) throw new Academic.StudError("POLICY_BLOCKED", `${path} cannot persist credentials or signed/tokenized URLs.`);
        }
    }
}

class StudArtifactOperationsService {
    constructor(options = {}) {
        if (!options.store) throw new Error("StudAcademicStore is required.");
        this.store = options.store;
        this.repository = options.repository || new StudArtifactOperationsRepository(this.store);
        this.workflow = options.workflowService || null;
        this.workingContext = options.workingContextService || null;
    }

    assignment(id) { const value = this.store.getEntity("ASSIGNMENT", Academic.safeId(id, "Assignment ID")); if (!value) throw new Academic.StudError("NOT_FOUND", "Assignment does not exist."); return value; }
    scopedArtifact(assignmentId, artifactId) { const assignment = this.assignment(assignmentId); const artifact = this.repository.requireArtifact(artifactId); if (artifact.assignmentId !== assignment.id) throw new Academic.StudError("CROSS_ASSIGNMENT_ARTIFACT", "Artifact does not belong to this Assignment."); return artifact; }
    scopedRun(assignmentId, runId) { const assignment = this.assignment(assignmentId); const run = this.repository.requireRun(runId); if (run.assignmentId !== assignment.id) throw new Academic.StudError("INVALID_INPUT", "Operation Run does not belong to this Assignment."); return run; }
    canonical(type, id) {
        if (String(type || "").toUpperCase() === "DRAFT_VERSION") {
            const objectId = Academic.safeId(id, "Draft Version ID");
            const row = this.repository.db.prepare(`SELECT v.id,v.draft_id,v.assignment_id,v.version_number,v.content_hash,v.created_at,d.title
                FROM stud_draft_versions v JOIN stud_draft_documents d ON d.id=v.draft_id WHERE v.id=?`).get(objectId);
            if (!row) throw new Academic.StudError("NOT_FOUND", "Canonical Draft Version does not exist.");
            return Object.freeze({id: row.id, draftId: row.draft_id, assignmentId: row.assignment_id, versionNumber: row.version_number, contentHash: row.content_hash, createdAt: row.created_at, title: `${row.title} · V${row.version_number}`, entityType: "DRAFT_VERSION"});
        }
        const entityType = Academic.validateEntityType(type);
        if (["COURSE", "ASSIGNMENT"].includes(entityType)) throw new Academic.StudError("INVALID_INPUT", "Course and Assignment records are context, not Artifact Bay entries.");
        const value = this.store.getEntity(entityType, Academic.safeId(id, "Canonical object ID"));
        if (!value) throw new Academic.StudError("NOT_FOUND", "Canonical academic object does not exist.");
        return Object.freeze({...value, entityType});
    }
    scopeObject(assignment, object) {
        const scope = this.workingContext && this.workingContext.relationshipScope(object.entityType, object, assignment.courseId || null, assignment.id);
        if (!scope) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED", "Artifact must already belong to the Assignment or its Course.");
        return scope;
    }
    workflowScope(assignmentId, workflowId, nodeId) {
        if (!workflowId && nodeId) throw new Academic.StudError("INVALID_INPUT", "Workflow node requires a Workflow.");
        if (!workflowId) return {workflowId: null, workflowNodeId: null};
        const workflow = this.repository.db.prepare("SELECT id,assignment_id FROM stud_workflow_instances WHERE id=?").get(Academic.safeId(workflowId, "Workflow ID"));
        if (!workflow || workflow.assignment_id !== assignmentId) throw new Academic.StudError("INVALID_INPUT", "Workflow does not belong to this Assignment.");
        if (nodeId) {
            const node = this.repository.db.prepare("SELECT id FROM stud_workflow_nodes WHERE id=? AND workflow_id=?").get(Academic.safeId(nodeId, "Workflow node ID"), workflow.id);
            if (!node) throw new Academic.StudError("INVALID_INPUT", "Workflow node does not belong to this Workflow.");
        }
        return {workflowId: workflow.id, workflowNodeId: nodeId || null};
    }
    eventCanonical(assignment, type, id) {
        if (!type && !id) return {canonicalObjectType: null, canonicalObjectId: null};
        if (!type || !id) throw new Academic.StudError("INVALID_INPUT", "Event canonical object type and ID must be supplied together.");
        if (String(type || "").toUpperCase() === "DRAFT_VERSION") {
            const object = this.canonical("DRAFT_VERSION", id);
            if (object.assignmentId !== assignment.id) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED", "Event Draft Version belongs to another Assignment.");
            return {canonicalObjectType: "DRAFT_VERSION", canonicalObjectId: object.id};
        }
        const entityType = Academic.validateEntityType(type);
        const objectId = Academic.safeId(id, "Canonical object ID");
        const object = this.store.getEntity(entityType, objectId);
        if (!object) throw new Academic.StudError("NOT_FOUND", "Event canonical object does not exist.");
        if (entityType === "ASSIGNMENT" && object.id !== assignment.id) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED", "Event Assignment does not match the operational Assignment.");
        if (entityType === "COURSE" && object.id !== assignment.courseId) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED", "Event Course does not match the operational Assignment.");
        if (!["ASSIGNMENT", "COURSE"].includes(entityType)) this.scopeObject(assignment, Object.freeze({...object, entityType}));
        return {canonicalObjectType: entityType, canonicalObjectId: object.id};
    }

    registerArtifact(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "canonicalObjectType", "canonicalObjectId", "artifactType", "label", "origin", "producer", "workflowId", "workflowNodeId", "runId", "parentArtifactId", "metadata", "integrityHash", "availabilityState"], "Artifact registration");
        const assignment = this.assignment(input.assignmentId);
        const object = this.canonical(input.canonicalObjectType, input.canonicalObjectId);
        if (object.entityType === "DRAFT_VERSION") {
            if (object.assignmentId !== assignment.id) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED", "Draft Version Artifact belongs to another Assignment.");
        } else this.scopeObject(assignment, object);
        const workflow = this.workflowScope(assignment.id, input.workflowId || null, input.workflowNodeId || null);
        const artifactType = Academic.enumValue(input.artifactType || DEFAULT_ARTIFACT_TYPE[object.entityType] || "GENERIC_MANUAL", Domain.ARTIFACT_TYPES, "Artifact type");
        const existing = this.repository.db.prepare("SELECT id FROM stud_assignment_artifacts WHERE assignment_id=? AND canonical_object_type=? AND canonical_object_id=? AND artifact_type=?").get(assignment.id, object.entityType, object.id, artifactType);
        if (existing) return Object.freeze({artifact: this.repository.requireArtifact(existing.id), created: false});
        let parentArtifactId = null;
        if (input.parentArtifactId) { const parent = this.repository.requireArtifact(input.parentArtifactId); if (parent.assignmentId !== assignment.id) throw new Academic.StudError("CROSS_ASSIGNMENT_ARTIFACT", "Parent Artifact belongs to another Assignment."); parentArtifactId = parent.id; }
        const metadata = input.metadata || null; if (metadata) assertSafeValue(metadata);
        const value = {
            assignmentId: assignment.id, courseId: assignment.courseId || null, ...workflow,
            canonicalObjectType: object.entityType, canonicalObjectId: object.id, artifactType,
            label: input.label ? Academic.requiredText(input.label, "Artifact label", Domain.LIMITS.label) : labelFor(object),
            lifecycle: "ACTIVE", origin: Academic.enumValue(input.origin || "UNKNOWN", Domain.ARTIFACT_ORIGINS, "Artifact origin", "UNKNOWN"),
            producer: Academic.optionalText(input.producer, "Artifact producer", Domain.LIMITS.producer) || "USER",
            parentArtifactId, metadataJson: Domain.boundedJson(metadata, "Artifact metadata", Domain.LIMITS.metadataBytes),
            integrityHash: input.integrityHash ? Academic.requiredText(input.integrityHash, "Artifact integrity hash", 128) : null,
            availabilityState: Academic.enumValue(input.availabilityState || "AVAILABLE", Domain.ARTIFACT_AVAILABILITY, "Artifact availability", "AVAILABLE")
        };
        return this.repository.transaction(() => {
            const artifact = this.repository.insertArtifact(value);
            const actor = value.origin === "MODEL_GENERATED" ? "MODEL" : value.origin === "SYSTEM_GENERATED" ? "SYSTEM" : "USER";
            this.appendEvent({assignmentId: assignment.id, ...workflow, runId: input.runId || null, eventType: "ARTIFACT_REGISTERED", actor, severity: "INFO", summary: `Registered ${artifact.label}`, artifactIds: [artifact.id], canonicalObjectType: object.entityType, canonicalObjectId: object.id, payload: {artifactType: artifact.artifactType, origin: artifact.origin}});
            return Object.freeze({artifact, created: true});
        });
    }

    updateArtifact(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "artifactId", "expectedVersion", "label", "lifecycle", "availabilityState", "metadata", "integrityHash"], "Artifact update");
        const current = this.scopedArtifact(input.assignmentId, input.artifactId);
        const metadata = input.metadata === undefined ? current.metadata : input.metadata; if (metadata) assertSafeValue(metadata);
        const value = {
            id: current.id, expectedVersion: Number(input.expectedVersion),
            label: input.label === undefined ? current.label : Academic.requiredText(input.label, "Artifact label", Domain.LIMITS.label),
            lifecycle: input.lifecycle === undefined ? current.lifecycle : Academic.enumValue(input.lifecycle, Domain.ARTIFACT_LIFECYCLES, "Artifact lifecycle"),
            availabilityState: input.availabilityState === undefined ? current.availabilityState : Academic.enumValue(input.availabilityState, Domain.ARTIFACT_AVAILABILITY, "Artifact availability"),
            metadataJson: Domain.boundedJson(metadata, "Artifact metadata", Domain.LIMITS.metadataBytes),
            integrityHash: input.integrityHash === undefined ? current.integrityHash : Academic.optionalText(input.integrityHash, "Artifact integrity hash", 128)
        };
        if (!Number.isInteger(value.expectedVersion) || value.expectedVersion < 1) throw new Academic.StudError("INVALID_INPUT", "Expected Artifact version is required.");
        return this.repository.transaction(() => {
            const artifact = this.repository.updateArtifact(value);
            this.appendEvent({assignmentId: artifact.assignmentId, workflowId: artifact.workflowId, workflowNodeId: artifact.workflowNodeId, eventType: "ARTIFACT_UPDATED", actor: "USER", severity: "INFO", summary: `Updated ${artifact.label}`, artifactIds: [artifact.id], canonicalObjectType: artifact.canonicalObjectType, canonicalObjectId: artifact.canonicalObjectId, payload: {lifecycle: artifact.lifecycle, availability: artifact.availabilityState}});
            return artifact;
        });
    }

    listArtifacts(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "artifactType", "origin", "workflowNodeId", "availabilityState", "beforeCreatedAt", "limit"], "Artifact query");
        const assignment = this.assignment(input.assignmentId);
        return this.repository.listArtifacts({assignmentId: assignment.id, artifactType: input.artifactType ? Academic.enumValue(input.artifactType, Domain.ARTIFACT_TYPES, "Artifact type") : null, origin: input.origin ? Academic.enumValue(input.origin, Domain.ARTIFACT_ORIGINS, "Artifact origin") : null, workflowNodeId: input.workflowNodeId ? Academic.safeId(input.workflowNodeId, "Workflow node ID") : null, availabilityState: input.availabilityState ? Academic.enumValue(input.availabilityState, Domain.ARTIFACT_AVAILABILITY, "Artifact availability") : null, beforeCreatedAt: input.beforeCreatedAt ? Academic.optionalDate(input.beforeCreatedAt, "Artifact cursor") : null, limit: Domain.positiveLimit(input.limit, 50, Domain.LIMITS.list)});
    }
    artifact(input = {}) { Academic.assertAllowedKeys(input, ["assignmentId", "artifactId"], "Artifact read"); return this.scopedArtifact(input.assignmentId, input.artifactId); }

    relateArtifacts(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "fromArtifactId", "relationshipType", "toArtifactId", "producer", "metadata"], "Artifact relationship");
        const from = this.scopedArtifact(input.assignmentId, input.fromArtifactId); const to = this.scopedArtifact(input.assignmentId, input.toArtifactId);
        if (from.id === to.id) throw new Academic.StudError("INVALID_ARTIFACT_RELATIONSHIP", "An Artifact cannot relate to itself.");
        if (from.assignmentId !== to.assignmentId) throw new Academic.StudError("CROSS_ASSIGNMENT_ARTIFACT", "Artifact relationships cannot cross Assignments.");
        const relationshipType = Academic.enumValue(input.relationshipType, Domain.ARTIFACT_RELATIONSHIPS, "Artifact relationship type");
        if (this.repository.relationshipExists(from.id, relationshipType, to.id)) throw new Academic.StudError("DUPLICATE_ARTIFACT_RELATIONSHIP", "Artifact relationship already exists.");
        if (Domain.ACYCLIC_RELATIONSHIPS.includes(relationshipType) && this.repository.reaches(to.id, from.id)) throw new Academic.StudError("ARTIFACT_RELATIONSHIP_CYCLE", "This relationship would create an invalid derivation cycle.");
        if (input.metadata) assertSafeValue(input.metadata);
        return this.repository.transaction(() => {
            const relation = this.repository.insertRelationship({assignmentId: from.assignmentId, fromArtifactId: from.id, relationshipType, toArtifactId: to.id, producer: Academic.optionalText(input.producer, "Relationship producer", Domain.LIMITS.producer) || "USER", metadataJson: Domain.boundedJson(input.metadata || null, "Relationship metadata", Domain.LIMITS.metadataBytes)});
            if (relationshipType === "SUPERSEDES") this.appendEvent({assignmentId: from.assignmentId, workflowId: from.workflowId || to.workflowId, workflowNodeId: from.workflowNodeId || to.workflowNodeId, eventType: "ARTIFACT_SUPERSEDED", actor: "USER", severity: "INFO", summary: `${from.label} supersedes ${to.label}`, artifactIds: [from.id, to.id], payload: {relationshipType}});
            return relation;
        });
    }
    relationships(input = {}) { Academic.assertAllowedKeys(input, ["assignmentId", "artifactId", "limit"], "Artifact relationship query"); return this.repository.listRelationships(this.scopedArtifact(input.assignmentId, input.artifactId).id, Domain.positiveLimit(input.limit, 50, Domain.LIMITS.list)); }

    createRun(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "workflowId", "workflowNodeId", "operationType", "actor", "progressMode", "progressCurrent", "progressTotal", "progressUnit", "statusSummary", "parentRunId", "canPause", "canCancel"], "Operation Run creation");
        const assignment = this.assignment(input.assignmentId); const workflow = this.workflowScope(assignment.id, input.workflowId || null, input.workflowNodeId || null);
        let parentRunId = null; if (input.parentRunId) { const parent = this.repository.requireRun(input.parentRunId); if (parent.assignmentId !== assignment.id) throw new Academic.StudError("INVALID_INPUT", "Parent Run belongs to another Assignment."); parentRunId = parent.id; }
        const progress = Domain.normalizeProgress(input);
        return this.repository.transaction(() => {
            const run = this.repository.insertRun({assignmentId: assignment.id, ...workflow, operationType: Academic.requiredText(input.operationType, "Operation type", Domain.LIMITS.operationType).toUpperCase().replace(/[^A-Z0-9_]+/g, "_"), actor: Academic.enumValue(input.actor || "SYSTEM", Domain.EVENT_ACTORS, "Run actor", "SYSTEM"), progress, statusSummary: Academic.optionalText(input.statusSummary, "Run status", Domain.LIMITS.status), parentRunId, canPause: input.canPause === true, canCancel: input.canCancel === true});
            this.appendEvent({assignmentId: assignment.id, ...workflow, runId: run.id, eventType: "OPERATION_CREATED", actor: run.actor, severity: "INFO", summary: run.statusSummary || `Created ${run.operationType}`, payload: {progressMode: run.progressMode}});
            return run;
        });
    }

    transitionRun(input = {}) {
        Academic.assertAllowedKeys(input, ["runId", "action", "expectedVersion", "progressMode", "progressCurrent", "progressTotal", "progressUnit", "statusSummary", "errorSummary"], "Operation Run transition");
        const current = this.repository.requireRun(input.runId); const action = String(input.action || "").trim().toUpperCase();
        const state = RUN_TRANSITIONS[current.state] && RUN_TRANSITIONS[current.state][action];
        if (!state) throw new Academic.StudError("INVALID_RUN_TRANSITION", `Operation Run cannot ${action || "transition"} from ${current.state}.`);
        if (action === "PAUSE" && !current.canPause) throw new Academic.StudError("RUN_CONTROL_UNAVAILABLE", "This operation does not support pause.");
        if (action === "CANCEL" && !current.canCancel) throw new Academic.StudError("RUN_CONTROL_UNAVAILABLE", "This operation does not support cancellation.");
        const progress = Domain.normalizeProgress({progressMode: input.progressMode === undefined ? current.progressMode : input.progressMode, progressCurrent: input.progressCurrent === undefined ? current.progressCurrent : input.progressCurrent, progressTotal: input.progressTotal === undefined ? current.progressTotal : input.progressTotal, progressUnit: input.progressUnit === undefined ? current.progressUnit : input.progressUnit});
        const timestamp = Academic.now();
        const value = {id: current.id, expectedVersion: Number(input.expectedVersion), state, progress, statusSummary: input.statusSummary === undefined ? current.statusSummary : Academic.optionalText(input.statusSummary, "Run status", Domain.LIMITS.status), errorSummary: input.errorSummary === undefined ? current.errorSummary : Academic.optionalText(input.errorSummary, "Run error", Domain.LIMITS.error), startedAt: current.startedAt || (state === "RUNNING" ? timestamp : null), finishedAt: TERMINAL_RUN_STATES.includes(state) ? timestamp : null};
        if (!Number.isInteger(value.expectedVersion) || value.expectedVersion < 1) throw new Academic.StudError("INVALID_INPUT", "Expected Run version is required.");
        if (state === "FAILED" && !value.errorSummary) throw new Academic.StudError("INVALID_INPUT", "Failed Runs require a bounded error summary.");
        return this.repository.transaction(() => {
            const run = this.repository.updateRun(value);
            this.appendEvent({assignmentId: run.assignmentId, workflowId: run.workflowId, workflowNodeId: run.workflowNodeId, runId: run.id, eventType: TRANSITION_EVENTS[action], actor: run.actor, severity: state === "FAILED" ? "ERROR" : "INFO", summary: run.statusSummary || `${run.operationType} ${state.toLowerCase()}`, payload: {state, progressMode: run.progressMode, progressCurrent: run.progressCurrent, progressTotal: run.progressTotal, progressUnit: run.progressUnit, error: run.errorSummary || undefined}});
            return run;
        });
    }

    appendEvent(input = {}) {
        const assignment = this.assignment(input.assignmentId); const workflow = this.workflowScope(assignment.id, input.workflowId || null, input.workflowNodeId || null);
        let runId = null; if (input.runId) {
            const run = this.repository.requireRun(input.runId);
            if (run.assignmentId !== assignment.id) throw new Academic.StudError("INVALID_INPUT", "Event Run belongs to another Assignment.");
            if (run.workflowId && workflow.workflowId && run.workflowId !== workflow.workflowId) throw new Academic.StudError("INVALID_INPUT", "Event Workflow does not match its Run.");
            if (run.workflowNodeId && workflow.workflowNodeId && run.workflowNodeId !== workflow.workflowNodeId) throw new Academic.StudError("INVALID_INPUT", "Event Workflow node does not match its Run.");
            runId = run.id;
        }
        const artifactIds = Object.freeze((input.artifactIds || []).map(id => { const artifact = this.repository.requireArtifact(id); if (artifact.assignmentId !== assignment.id) throw new Academic.StudError("CROSS_ASSIGNMENT_ARTIFACT", "Event Artifact belongs to another Assignment."); return artifact.id; }).slice(0, 20));
        const payload = input.payload || null; if (payload) assertSafeValue(payload, "event payload");
        const canonical = this.eventCanonical(assignment, input.canonicalObjectType || null, input.canonicalObjectId || null);
        let sourceWorkflowEventId = null;
        if (input.sourceWorkflowEventId) {
            sourceWorkflowEventId = Academic.safeId(input.sourceWorkflowEventId, "Source Workflow event ID");
            const source = this.repository.db.prepare("SELECT workflow_id FROM stud_workflow_events WHERE id=?").get(sourceWorkflowEventId);
            if (!source || !workflow.workflowId || source.workflow_id !== workflow.workflowId) throw new Academic.StudError("INVALID_INPUT", "Source Workflow event does not belong to this operational Workflow.");
        }
        return this.repository.transaction(() => this.repository.insertEvent({assignmentId: assignment.id, ...workflow, runId, eventType: Academic.enumValue(input.eventType, Domain.EVENT_TYPES, "Event type"), actor: Academic.enumValue(input.actor || "SYSTEM", Domain.EVENT_ACTORS, "Event actor", "SYSTEM"), severity: Academic.enumValue(input.severity || "INFO", Domain.EVENT_SEVERITIES, "Event severity", "INFO"), payloadJson: Domain.boundedJson(payload, "Event payload", Domain.LIMITS.eventPayloadBytes), ...canonical, sourceWorkflowEventId, summary: Academic.requiredText(input.summary, "Event summary", Domain.LIMITS.status), artifactIds}));
    }

    missionState(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "historyLimit", "artifactLimit"], "Mission Control request");
        const assignment = this.assignment(input.assignmentId);
        const activeRuns = this.repository.activeRuns(assignment.id, 10);
        const recentRuns = this.repository.listRuns({assignmentId: assignment.id, state: null, beforeCreatedAt: null, limit: Domain.positiveLimit(input.historyLimit, 20, 50)});
        const artifacts = this.repository.listArtifacts({assignmentId: assignment.id, artifactType: null, origin: null, workflowNodeId: null, availabilityState: null, beforeCreatedAt: null, limit: Domain.positiveLimit(input.artifactLimit, 30, 50)});
        const workflowState = this.workflow ? this.workflow.assignmentState({assignmentId: assignment.id, historyLimit: 50}) : null;
        return Object.freeze({assignment, activeRuns, recentRuns, artifacts, workflow: workflowState && workflowState.current || null, resting: activeRuns.length === 0});
    }
    run(input = {}) { Academic.assertAllowedKeys(input, ["assignmentId", "runId"], "Operation Run read"); return this.scopedRun(input.assignmentId, input.runId); }
    runs(input = {}) { Academic.assertAllowedKeys(input, ["assignmentId", "state", "beforeCreatedAt", "limit"], "Operation Run query"); const assignment = this.assignment(input.assignmentId); return this.repository.listRuns({assignmentId: assignment.id, state: input.state ? Academic.enumValue(input.state, Domain.RUN_STATES, "Run state") : null, beforeCreatedAt: input.beforeCreatedAt ? Academic.optionalDate(input.beforeCreatedAt, "Run cursor") : null, limit: Domain.positiveLimit(input.limit, 25, 50)}); }
    events(input = {}) { Academic.assertAllowedKeys(input, ["assignmentId", "runId", "beforeSequence", "limit"], "Operation event query"); const assignment = this.assignment(input.assignmentId); let runId = null; if (input.runId) { const run = this.repository.requireRun(input.runId); if (run.assignmentId !== assignment.id) throw new Academic.StudError("INVALID_INPUT", "Run does not belong to this Assignment."); runId = run.id; } const beforeSequence = input.beforeSequence === undefined ? null : Academic.optionalNonNegativeInteger(input.beforeSequence, "Event cursor", 1000000000); return this.repository.listEvents({assignmentId: assignment.id, runId, beforeSequence, limit: Domain.positiveLimit(input.limit, 50, Domain.LIMITS.eventPage)}); }
    runArtifacts(input = {}) { Academic.assertAllowedKeys(input, ["assignmentId", "runId", "limit"], "Operation Artifact query"); const run = this.scopedRun(input.assignmentId, input.runId); return this.repository.artifactsForRun(run.id, Domain.positiveLimit(input.limit, 50, 100)); }
}

module.exports = Object.freeze({StudArtifactOperationsService, DEFAULT_ARTIFACT_TYPE, RUN_TRANSITIONS, assertSafeValue});
