#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService} = require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudWorkflowService} = require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudArtifactOperationsService} = require("../src/classes/workspaces/studArtifactOperationsService.class.js");

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`${name}: PASS`); }
function expect(code, fn) { assert.throws(fn, error => error && error.code === code, code); }
function open(root) {
    const store = new StudAcademicStore({root, applicationVersion: "m6-test"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    const workflow = new StudWorkflowService({store, requirementsService: requirements, workingContextService: context});
    const operations = new StudArtifactOperationsService({store, workflowService: workflow, workingContextService: context});
    return {store, context, workflow, operations};
}
function fixture(store, workflow, title = "Synthetic engineering report") {
    const course = store.createEntity("COURSE", {title: `${title} course`});
    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title});
    const flow = workflow.create({assignmentId: assignment.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Synthetic M6 fixture."});
    const document = store.createEntity("ACADEMIC_DOCUMENT", {courseId: course.id, assignmentId: assignment.id, title: `${title} brief`, documentType: "COURSE_MATERIAL", extractionStatus: "READY"});
    const note = store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: `${title} note`, content: "Synthetic public-safe note."});
    const dataset = store.createEntity("DATASET", {courseId: course.id, assignmentId: assignment.id, title: `${title} dataset`, format: "CSV", managedReference: `datasets/${assignment.id}.csv`, rowCount: 2, columnsJson: "[]", summaryJson: "{}"});
    return {course, assignment, flow, document, note, dataset};
}
function stripV19(dbPath) {
    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA foreign_keys=OFF;
        DROP TABLE IF EXISTS stud_research_gaps;
        DROP TABLE IF EXISTS stud_topic_dossier_items;
        DROP TABLE IF EXISTS stud_research_question_requirements;
        DROP TABLE IF EXISTS stud_research_questions;
        DROP TABLE IF EXISTS stud_research_topic_requirements;
        DROP TABLE IF EXISTS stud_research_topics;
        DROP TABLE IF EXISTS stud_assignment_research_plans;
        DROP TABLE IF EXISTS stud_research_plans;
        ALTER TABLE stud_working_context DROP COLUMN active_research_topic_id;
        ALTER TABLE stud_working_context DROP COLUMN active_research_plan_id;
        DROP TABLE IF EXISTS stud_operation_event_artifacts;
        DROP TABLE IF EXISTS stud_operation_events;
        DROP TABLE IF EXISTS stud_operation_runs;
        DROP TABLE IF EXISTS stud_artifact_relationships;
        DROP TABLE IF EXISTS stud_assignment_artifacts;
        DELETE FROM stud_schema_migrations WHERE version IN (19,20);
        PRAGMA foreign_keys=ON;`);
    db.close();
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m6-"));
try {
    let env = open(path.join(root, "domain"));
    const {store, workflow, operations} = env;
    check("CURRENT_SCHEMA_AND_NO_FABRICATED_OPERATIONAL_STATE", () => {
        assert.strictEqual(store.schemaInfo().version, 25);
        ["stud_assignment_artifacts", "stud_artifact_relationships", "stud_operation_runs", "stud_operation_events"].forEach(table => assert.strictEqual(store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count, 0));
    });
    const base = fixture(store, workflow);
    const node = base.flow.graph.nodes[0];
    let documentArtifact;
    check("CANONICAL_ARTIFACT_REGISTRATION", () => {
        const result = operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "ACADEMIC_DOCUMENT", canonicalObjectId: base.document.id, origin: "USER_IMPORTED", producer: "USER", workflowId: base.flow.id, workflowNodeId: node.id, integrityHash: "a".repeat(64)});
        assert.strictEqual(result.created, true); documentArtifact = result.artifact;
        assert.strictEqual(documentArtifact.canonicalObjectId, base.document.id);
        assert.strictEqual(documentArtifact.integrityHash, "a".repeat(64));
    });
    check("ARTIFACT_REGISTRATION_IS_DEDUPLICATED", () => {
        const duplicate = operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "ACADEMIC_DOCUMENT", canonicalObjectId: base.document.id, origin: "UNKNOWN"});
        assert.strictEqual(duplicate.created, false); assert.strictEqual(duplicate.artifact.id, documentArtifact.id);
    });
    check("UNRELATED_CANONICAL_OBJECT_IS_REJECTED", () => {
        const orphan = store.createEntity("NOTE", {title: "Unrelated note", content: "Not linked."});
        expect("CONTEXT_RELATION_REQUIRED", () => operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: orphan.id}));
    });
    check("INVALID_AND_CROSS_ASSIGNMENT_REFERENCES_FAIL", () => {
        expect("NOT_FOUND", () => operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: "stud_note_missing"}));
        const other = fixture(store, workflow, "Humanities essay");
        expect("CONTEXT_RELATION_REQUIRED", () => operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: other.note.id}));
    });
    const noteArtifact = operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: base.note.id, origin: "USER_CREATED"}).artifact;
    const dataArtifact = operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "DATASET", canonicalObjectId: base.dataset.id, artifactType: "DATASET", origin: "USER_IMPORTED"}).artifact;
    check("ARTIFACT_UPDATE_IS_VERSIONED", () => {
        const updated = operations.updateArtifact({assignmentId: base.assignment.id, artifactId: dataArtifact.id, expectedVersion: dataArtifact.rowVersion, availabilityState: "OFFLINE"});
        assert.strictEqual(updated.rowVersion, dataArtifact.rowVersion + 1); assert.strictEqual(updated.availabilityState, "OFFLINE");
        expect("STALE_ARTIFACT_VERSION", () => operations.updateArtifact({assignmentId: base.assignment.id, artifactId: dataArtifact.id, expectedVersion: dataArtifact.rowVersion, availabilityState: "AVAILABLE"}));
    });
    check("SECRET_BEARING_METADATA_IS_REJECTED", () => {
        expect("POLICY_BLOCKED", () => operations.updateArtifact({assignmentId: base.assignment.id, artifactId: noteArtifact.id, expectedVersion: noteArtifact.rowVersion, metadata: {accessToken: "secret"}}));
        expect("POLICY_BLOCKED", () => operations.updateArtifact({assignmentId: base.assignment.id, artifactId: noteArtifact.id, expectedVersion: noteArtifact.rowVersion, metadata: {source: "https://example.org/file?token=secret"}}));
        expect("POLICY_BLOCKED", () => operations.updateArtifact({assignmentId: base.assignment.id, artifactId: noteArtifact.id, expectedVersion: noteArtifact.rowVersion, metadata: {credentialLecturerReviewSessionId: "stud_review_hidden"}}));
    });
    let derived;
    check("ARTIFACT_RELATIONSHIPS_ARE_EXPLICIT", () => {
        derived = operations.relateArtifacts({assignmentId: base.assignment.id, fromArtifactId: noteArtifact.id, relationshipType: "DERIVED_FROM", toArtifactId: documentArtifact.id, producer: "USER"});
        assert.strictEqual(derived.assignmentId, base.assignment.id);
        assert.strictEqual(operations.relationships({assignmentId: base.assignment.id, artifactId: noteArtifact.id}).length, 1);
    });
    check("SELF_DUPLICATE_AND_CYCLE_RELATIONSHIPS_FAIL", () => {
        expect("INVALID_ARTIFACT_RELATIONSHIP", () => operations.relateArtifacts({assignmentId: base.assignment.id, fromArtifactId: noteArtifact.id, relationshipType: "USES", toArtifactId: noteArtifact.id}));
        expect("DUPLICATE_ARTIFACT_RELATIONSHIP", () => operations.relateArtifacts({assignmentId: base.assignment.id, fromArtifactId: noteArtifact.id, relationshipType: "DERIVED_FROM", toArtifactId: documentArtifact.id}));
        expect("ARTIFACT_RELATIONSHIP_CYCLE", () => operations.relateArtifacts({assignmentId: base.assignment.id, fromArtifactId: documentArtifact.id, relationshipType: "DERIVED_FROM", toArtifactId: noteArtifact.id}));
    });
    check("CROSS_ASSIGNMENT_RELATIONSHIP_FAILS", () => {
        const other = fixture(store, workflow, "Law case analysis");
        const otherArtifact = operations.registerArtifact({assignmentId: other.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: other.note.id}).artifact;
        expect("CROSS_ASSIGNMENT_ARTIFACT", () => operations.relateArtifacts({assignmentId: base.assignment.id, fromArtifactId: noteArtifact.id, relationshipType: "REFERENCES", toArtifactId: otherArtifact.id}));
    });
    check("SUPERSESSION_PRESERVES_BOTH_ARTIFACTS", () => {
        const relation = operations.relateArtifacts({assignmentId: base.assignment.id, fromArtifactId: noteArtifact.id, relationshipType: "SUPERSEDES", toArtifactId: dataArtifact.id});
        assert.strictEqual(relation.relationshipType, "SUPERSEDES");
        assert.ok(operations.artifact({assignmentId: base.assignment.id, artifactId: dataArtifact.id}));
    });

    let run;
    check("RUN_CREATED_WITHOUT_FAKE_PROGRESS", () => {
        run = operations.createRun({assignmentId: base.assignment.id, workflowId: base.flow.id, workflowNodeId: node.id, operationType: "DOCUMENT_INDEX", actor: "SYSTEM", progressMode: "NONE", statusSummary: "Awaiting explicit start", canPause: true, canCancel: true});
        assert.strictEqual(run.state, "CREATED"); assert.strictEqual(run.progressCurrent, null); assert.strictEqual(run.progressTotal, null);
    });
    check("RUN_ARTIFACT_ASSOCIATION_IS_AN_EXACT_EVENT_LINK", () => {
        const result = operations.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: base.note.id, artifactType: "GENERIC_MANUAL", origin: "UNKNOWN", workflowId: base.flow.id, workflowNodeId: node.id, runId: run.id});
        const linked = operations.events({assignmentId: base.assignment.id, runId: run.id, limit: 20}).find(event => event.eventType === "ARTIFACT_REGISTERED");
        assert.strictEqual(result.created, true);
        assert.deepStrictEqual(linked.artifactIds, [result.artifact.id]);
        assert.deepStrictEqual(operations.runArtifacts({assignmentId: base.assignment.id, runId: run.id}).map(item => item.id), [result.artifact.id]);
    });
    check("INVALID_PROGRESS_SEMANTICS_FAIL", () => {
        expect("INVALID_PROGRESS", () => operations.createRun({assignmentId: base.assignment.id, operationType: "BAD", progressMode: "DETERMINATE", progressCurrent: 4, progressTotal: 3}));
        expect("INVALID_PROGRESS", () => operations.createRun({assignmentId: base.assignment.id, operationType: "BAD", progressMode: "INDETERMINATE", progressCurrent: 1}));
    });
    check("DETERMINATE_RUN_LIFECYCLE", () => {
        run = operations.transitionRun({runId: run.id, action: "START", expectedVersion: run.rowVersion, progressMode: "DETERMINATE", progressCurrent: 0, progressTotal: 42, progressUnit: "documents", statusSummary: "Indexing 0 / 42 documents"});
        assert.strictEqual(run.state, "RUNNING"); assert.ok(run.startedAt); assert.strictEqual(run.progressTotal, 42);
        run = operations.transitionRun({runId: run.id, action: "PAUSE", expectedVersion: run.rowVersion, progressCurrent: 17, statusSummary: "Paused after 17 / 42 documents"});
        assert.strictEqual(run.state, "PAUSED");
        run = operations.transitionRun({runId: run.id, action: "RESUME", expectedVersion: run.rowVersion});
        run = operations.transitionRun({runId: run.id, action: "COMPLETE", expectedVersion: run.rowVersion, progressCurrent: 42, statusSummary: "Indexed 42 / 42 documents"});
        assert.strictEqual(run.state, "COMPLETED"); assert.ok(run.finishedAt);
    });
    check("INVALID_AND_STALE_RUN_TRANSITIONS_FAIL", () => {
        expect("INVALID_RUN_TRANSITION", () => operations.transitionRun({runId: run.id, action: "START", expectedVersion: run.rowVersion}));
        const limited = operations.createRun({assignmentId: base.assignment.id, operationType: "BOUNDED_READ", progressMode: "INDETERMINATE", canPause: false, canCancel: false});
        const started = operations.transitionRun({runId: limited.id, action: "START", expectedVersion: limited.rowVersion});
        expect("RUN_CONTROL_UNAVAILABLE", () => operations.transitionRun({runId: started.id, action: "PAUSE", expectedVersion: started.rowVersion}));
        expect("RUN_CONTROL_UNAVAILABLE", () => operations.transitionRun({runId: started.id, action: "CANCEL", expectedVersion: started.rowVersion}));
        const failed = operations.transitionRun({runId: started.id, action: "FAIL", expectedVersion: started.rowVersion, errorSummary: "Synthetic bounded failure"});
        expect("STALE_RUN_VERSION", () => operations.repository.updateRun({id: failed.id, expectedVersion: started.rowVersion, state: "FAILED", progress: {mode: "INDETERMINATE", current: null, total: null, unit: null}, statusSummary: null, errorSummary: "stale", startedAt: started.startedAt, finishedAt: failed.finishedAt}));
    });
    check("FAILED_RUN_REQUIRES_ERROR_SUMMARY", () => {
        let value = operations.createRun({assignmentId: base.assignment.id, operationType: "FAILURE_CASE", progressMode: "NONE"});
        value = operations.transitionRun({runId: value.id, action: "START", expectedVersion: value.rowVersion});
        expect("INVALID_INPUT", () => operations.transitionRun({runId: value.id, action: "FAIL", expectedVersion: value.rowVersion}));
    });
    check("EVENTS_ARE_ORDERED_BOUNDED_AND_LINKED", () => {
        const events = operations.events({assignmentId: base.assignment.id, runId: run.id, limit: 50});
        assert.ok(events.length >= 5); assert.ok(events.every((event, index) => index === 0 || event.eventSequence < events[index - 1].eventSequence));
        assert.ok(operations.events({assignmentId: base.assignment.id, limit: 2}).length <= 2);
        assert.ok(operations.events({assignmentId: base.assignment.id, limit: 200}).length >= events.length);
    });
    check("EVENT_PAYLOAD_BOUND_AND_SECRET_POLICY", () => {
        expect("PAYLOAD_TOO_LARGE", () => operations.appendEvent({assignmentId: base.assignment.id, eventType: "STAGE_ENTERED", summary: "Too large", payload: {value: "x".repeat(17000)}}));
        expect("POLICY_BLOCKED", () => operations.appendEvent({assignmentId: base.assignment.id, eventType: "STAGE_ENTERED", summary: "Secret", payload: {password: "secret"}}));
    });
    check("EVENT_CANONICAL_AND_WORKFLOW_REFERENCES_ARE_VALIDATED", () => {
        const other = store.createEntity("ASSIGNMENT", {title: "Unrelated operational assignment"});
        expect("CONTEXT_RELATION_REQUIRED", () => operations.appendEvent({assignmentId: base.assignment.id, eventType: "STAGE_ENTERED", summary: "Wrong object", canonicalObjectType: "ASSIGNMENT", canonicalObjectId: other.id}));
        expect("INVALID_INPUT", () => operations.appendEvent({assignmentId: base.assignment.id, eventType: "STAGE_ENTERED", summary: "Missing source event", workflowId: base.flow.id, sourceWorkflowEventId: "stud_workflow_event_missing"}));
    });
    check("MISSION_CONTROL_COMPOSES_AUTHORITATIVE_M3_M4_STATE", () => {
        const state = operations.missionState({assignmentId: base.assignment.id});
        assert.strictEqual(state.workflow.id, base.flow.id); assert.ok(state.recentRuns.length >= 3); assert.ok(state.artifacts.length >= 3);
        assert.ok(state.workflow.graph.nodes.every(item => Object.prototype.hasOwnProperty.call(item, "availability")));
    });
    check("M1_M2_M3_M4_AUTHORITIES_ARE_NOT_DUPLICATED", () => {
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_requirement_contracts").get().count, 0);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_working_context").get().count, 0);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances WHERE assignment_id=?").get(base.assignment.id).count, 1);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_blockers WHERE workflow_id=?").get(base.flow.id).count, 0);
    });
    check("ASSIGNMENT_SCOPED_QUERIES_DO_NOT_HYDRATE_GLOBAL_HISTORY", () => {
        assert.ok(operations.listArtifacts({assignmentId: base.assignment.id, limit: 2}).length <= 2);
        assert.ok(operations.runs({assignmentId: base.assignment.id, limit: 2}).length <= 2);
        expect("INVALID_INPUT", () => operations.listArtifacts({assignmentId: base.assignment.id, limit: 101}));
        expect("INVALID_INPUT", () => operations.events({assignmentId: base.assignment.id, limit: 201}));
    });

    const disciplines = ["Engineering CFD design report", "Humanities archival essay", "Law case analysis", "Social science research project", "Group project awaiting team data", "Generic manual Assignment"];
    disciplines.forEach(title => { const value = fixture(store, workflow, title); operations.registerArtifact({assignmentId: value.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: value.note.id, origin: "USER_CREATED"}); });
    check("DISCIPLINE_NEUTRAL_ARTIFACT_REGISTRY", () => assert.strictEqual(store.db.prepare("SELECT COUNT(DISTINCT assignment_id) count FROM stud_assignment_artifacts").get().count, disciplines.length + 2));
    check("M6_FOREIGN_KEY_INTEGRITY", () => assert.deepStrictEqual(store.db.prepare("PRAGMA foreign_key_check").all(), []));

    store.close();
    env = open(path.join(root, "domain"));
    check("ARTIFACT_RUN_EVENT_HISTORY_SURVIVES_RESTART", () => {
        assert.strictEqual(env.operations.artifact({assignmentId: base.assignment.id, artifactId: documentArtifact.id}).canonicalObjectId, base.document.id);
        assert.strictEqual(env.operations.run({assignmentId: base.assignment.id, runId: run.id}).state, "COMPLETED");
        assert.ok(env.operations.events({assignmentId: base.assignment.id, runId: run.id}).length >= 5);
    });
    env.store.close();

    const migrationRoot = path.join(root, "migration");
    let migration = open(migrationRoot); const legacyAssignment = migration.store.createEntity("ASSIGNMENT", {title: "Existing v18 Assignment"}); migration.store.close(); stripV19(path.join(migrationRoot, "academic.sqlite"));
    migration = open(migrationRoot);
    check("V18_TO_V19_MIGRATION_PRESERVES_ASSIGNMENT_WITHOUT_FABRICATION", () => {
        assert.strictEqual(migration.store.schemaInfo().version, 25); assert.ok(migration.store.getEntity("ASSIGNMENT", legacyAssignment.id));
        assert.strictEqual(migration.store.db.prepare("SELECT COUNT(*) count FROM stud_assignment_artifacts").get().count, 0);
        assert.strictEqual(migration.store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count, 0);
    });
    migration.store.close();
    console.log(`STUD_ARTIFACT_MISSION_CONTROL: PASS (${passed} checks)`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
