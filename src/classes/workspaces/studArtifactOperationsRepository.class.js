"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studArtifactOperationsModel.class.js");

function parseJson(value, fallback = null) { try { return value ? JSON.parse(value) : fallback; } catch (error) { return fallback; } }
function camel(row) {
    if (!row) return null;
    const result = {};
    Object.entries(row).forEach(([key, value]) => {
        const name = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
        result[name] = ["can_pause", "can_cancel"].includes(key) ? Boolean(value) : value;
    });
    if (Object.prototype.hasOwnProperty.call(result, "metadataJson")) result.metadata = parseJson(result.metadataJson, {});
    if (Object.prototype.hasOwnProperty.call(result, "payloadJson")) result.payload = parseJson(result.payloadJson, {});
    delete result.metadataJson; delete result.payloadJson;
    return result;
}

class StudArtifactOperationsRepository {
    constructor(store) {
        if (!store) throw new Error("StudAcademicStore is required.");
        this.store = store;
        this.store.initialize();
        this.db = store.db;
    }

    transaction(work) { return this.store.transaction(work); }
    artifactRow(id) { return camel(this.db.prepare("SELECT * FROM stud_assignment_artifacts WHERE id=?").get(Academic.safeId(id, "Artifact ID"))); }
    requireArtifact(id) { const value = this.artifactRow(id); if (!value) throw new Academic.StudError("NOT_FOUND", "Artifact does not exist."); return value; }
    runRow(id) { return camel(this.db.prepare("SELECT * FROM stud_operation_runs WHERE id=?").get(Academic.safeId(id, "Run ID"))); }
    requireRun(id) { const value = this.runRow(id); if (!value) throw new Academic.StudError("NOT_FOUND", "Operation Run does not exist."); return value; }

    insertArtifact(value) {
        const id = Academic.createId("artifact"); const timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_assignment_artifacts
            (id,assignment_id,course_id,workflow_id,workflow_node_id,canonical_object_type,canonical_object_id,artifact_type,label,lifecycle,origin,producer,parent_artifact_id,metadata_json,integrity_hash,availability_state,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
            .run(id, value.assignmentId, value.courseId, value.workflowId, value.workflowNodeId, value.canonicalObjectType, value.canonicalObjectId, value.artifactType, value.label, value.lifecycle, value.origin, value.producer, value.parentArtifactId, value.metadataJson, value.integrityHash, value.availabilityState, timestamp, timestamp);
        return this.requireArtifact(id);
    }

    updateArtifact(value) {
        const timestamp = Academic.now();
        const result = this.db.prepare(`UPDATE stud_assignment_artifacts SET label=?,lifecycle=?,availability_state=?,metadata_json=?,integrity_hash=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`)
            .run(value.label, value.lifecycle, value.availabilityState, value.metadataJson, value.integrityHash, timestamp, value.id, value.expectedVersion);
        if (!result.changes) throw new Academic.StudError("STALE_ARTIFACT_VERSION", "Artifact changed before this update.");
        return this.requireArtifact(value.id);
    }

    listArtifacts(input) {
        const where = ["assignment_id=?"]; const args = [input.assignmentId];
        if (input.artifactType) { where.push("artifact_type=?"); args.push(input.artifactType); }
        if (input.origin) { where.push("origin=?"); args.push(input.origin); }
        if (input.workflowNodeId) { where.push("workflow_node_id=?"); args.push(input.workflowNodeId); }
        if (input.availabilityState) { where.push("availability_state=?"); args.push(input.availabilityState); }
        if (input.beforeCreatedAt) { where.push("created_at<?"); args.push(input.beforeCreatedAt); }
        args.push(input.limit);
        return Object.freeze(this.db.prepare(`SELECT * FROM stud_assignment_artifacts WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ?`).all(...args).map(row => Object.freeze(camel(row))));
    }

    relationshipExists(fromId, type, toId) { return this.db.prepare("SELECT id FROM stud_artifact_relationships WHERE from_artifact_id=? AND relationship_type=? AND to_artifact_id=?").get(fromId, type, toId); }
    reaches(startId, targetId, types = Domain.ACYCLIC_RELATIONSHIPS) {
        const placeholders = types.map(() => "?").join(",");
        const rows = this.db.prepare(`WITH RECURSIVE walk(id) AS (
            SELECT to_artifact_id FROM stud_artifact_relationships WHERE from_artifact_id=? AND relationship_type IN (${placeholders})
            UNION SELECT r.to_artifact_id FROM stud_artifact_relationships r JOIN walk w ON r.from_artifact_id=w.id WHERE r.relationship_type IN (${placeholders})
        ) SELECT 1 found FROM walk WHERE id=? LIMIT 1`).get(startId, ...types, ...types, targetId);
        return Boolean(rows);
    }
    insertRelationship(value) {
        const id = Academic.createId("artifact_relation");
        this.db.prepare("INSERT INTO stud_artifact_relationships (id,assignment_id,from_artifact_id,relationship_type,to_artifact_id,producer,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
            .run(id, value.assignmentId, value.fromArtifactId, value.relationshipType, value.toArtifactId, value.producer, value.metadataJson, Academic.now());
        return Object.freeze(camel(this.db.prepare("SELECT * FROM stud_artifact_relationships WHERE id=?").get(id)));
    }
    listRelationships(artifactId, limit) {
        return Object.freeze(this.db.prepare(`SELECT * FROM stud_artifact_relationships WHERE from_artifact_id=? OR to_artifact_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(artifactId, artifactId, limit).map(row => Object.freeze(camel(row))));
    }

    insertRun(value) {
        const id = Academic.createId("operation_run"); const timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_operation_runs
            (id,assignment_id,workflow_id,workflow_node_id,operation_type,state,actor,progress_mode,progress_current,progress_total,progress_unit,status_summary,error_summary,parent_run_id,can_pause,can_cancel,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,'CREATED',?,?,?,?,?,?,?,?,?,?,1,?,?)`)
            .run(id, value.assignmentId, value.workflowId, value.workflowNodeId, value.operationType, value.actor, value.progress.mode, value.progress.current, value.progress.total, value.progress.unit, value.statusSummary, null, value.parentRunId, value.canPause ? 1 : 0, value.canCancel ? 1 : 0, timestamp, timestamp);
        return this.requireRun(id);
    }

    updateRun(value) {
        const timestamp = Academic.now();
        const result = this.db.prepare(`UPDATE stud_operation_runs SET state=?,progress_mode=?,progress_current=?,progress_total=?,progress_unit=?,status_summary=?,error_summary=?,started_at=?,finished_at=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`)
            .run(value.state, value.progress.mode, value.progress.current, value.progress.total, value.progress.unit, value.statusSummary, value.errorSummary, value.startedAt, value.finishedAt, timestamp, value.id, value.expectedVersion);
        if (!result.changes) throw new Academic.StudError("STALE_RUN_VERSION", "Operation Run changed before this update.");
        return this.requireRun(value.id);
    }

    listRuns(input) {
        const where = ["assignment_id=?"]; const args = [input.assignmentId];
        if (input.state) { where.push("state=?"); args.push(input.state); }
        if (input.beforeCreatedAt) { where.push("created_at<?"); args.push(input.beforeCreatedAt); }
        args.push(input.limit);
        return Object.freeze(this.db.prepare(`SELECT * FROM stud_operation_runs WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ?`).all(...args).map(row => Object.freeze(camel(row))));
    }
    activeRuns(assignmentId, limit = 10) { return Object.freeze(this.db.prepare("SELECT * FROM stud_operation_runs WHERE assignment_id=? AND state IN ('CREATED','RUNNING','PAUSED') ORDER BY created_at DESC,id DESC LIMIT ?").all(assignmentId, limit).map(row => Object.freeze(camel(row)))); }

    insertEvent(value) {
        const id = Academic.createId("operation_event");
        const sequence = Number(this.db.prepare("SELECT COALESCE(MAX(event_sequence),0)+1 sequence FROM stud_operation_events WHERE assignment_id=?").get(value.assignmentId).sequence);
        this.db.prepare(`INSERT INTO stud_operation_events
            (id,assignment_id,workflow_id,workflow_node_id,run_id,event_sequence,event_type,actor,severity,payload_json,canonical_object_type,canonical_object_id,source_workflow_event_id,summary,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id, value.assignmentId, value.workflowId, value.workflowNodeId, value.runId, sequence, value.eventType, value.actor, value.severity, value.payloadJson, value.canonicalObjectType, value.canonicalObjectId, value.sourceWorkflowEventId, value.summary, Academic.now());
        (value.artifactIds || []).forEach(artifactId => this.db.prepare("INSERT INTO stud_operation_event_artifacts (event_id,artifact_id) VALUES (?,?)").run(id, artifactId));
        return this.event(id);
    }
    event(id) {
        const row = camel(this.db.prepare("SELECT * FROM stud_operation_events WHERE id=?").get(id));
        if (!row) return null;
        const artifacts = this.db.prepare("SELECT artifact_id FROM stud_operation_event_artifacts WHERE event_id=? ORDER BY artifact_id").all(id).map(item => item.artifact_id);
        return Object.freeze({...row, artifactIds: Object.freeze(artifacts)});
    }
    listEvents(input) {
        const where = ["assignment_id=?"]; const args = [input.assignmentId];
        if (input.runId) { where.push("run_id=?"); args.push(input.runId); }
        if (input.beforeSequence) { where.push("event_sequence<?"); args.push(input.beforeSequence); }
        args.push(input.limit);
        const rows = this.db.prepare(`SELECT * FROM stud_operation_events WHERE ${where.join(" AND ")} ORDER BY event_sequence DESC LIMIT ?`).all(...args);
        return Object.freeze(rows.map(row => this.event(row.id)));
    }

    artifactsForRun(runId, limit) {
        return Object.freeze(this.db.prepare(`SELECT a.*,MAX(e.event_sequence) related_event_sequence
            FROM stud_assignment_artifacts a
            JOIN stud_operation_event_artifacts ea ON ea.artifact_id=a.id
            JOIN stud_operation_events e ON e.id=ea.event_id
            WHERE e.run_id=?
            GROUP BY a.id
            ORDER BY related_event_sequence DESC,a.created_at DESC,a.id DESC
            LIMIT ?`).all(runId, limit).map(row => {
                const value = camel(row);
                delete value.relatedEventSequence;
                return Object.freeze(value);
            }));
    }
}

module.exports = Object.freeze({StudArtifactOperationsRepository});
