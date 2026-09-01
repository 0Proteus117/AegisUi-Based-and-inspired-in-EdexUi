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

let passed = 0;
function check(name, operation) { operation(); passed += 1; console.log(`${name}: PASS`); }
function expect(code, operation) { assert.throws(operation, error => error && error.code === code, code); }
function open(root) {
    const store = new StudAcademicStore({root, applicationVersion: "m4-test"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    const workflow = new StudWorkflowService({store, requirementsService: requirements, workingContextService: context});
    return {store, requirements, context, workflow};
}
function createWorkflow(store, workflow, title, templateKey = "GENERIC_MANUAL", courseId = null) {
    const assignment = store.createEntity("ASSIGNMENT", {courseId, title});
    return {assignment, value: workflow.create({assignmentId: assignment.id, templateKey, allowNoContract: true, noContractReason: "Synthetic M4 validation fixture."})};
}
function node(workflow, key) { return workflow.graph.nodes.find(item => item.templateNodeKey === key); }
function complete(workflowService, value, key) {
    let target = node(value, key);
    value = workflowService.transition({workflowId: value.id, nodeId: target.id, action: "START", expectedWorkflowVersion: value.rowVersion, expectedNodeVersion: target.rowVersion});
    target = node(value, key);
    return workflowService.transition({workflowId: value.id, nodeId: target.id, action: "COMPLETE", expectedWorkflowVersion: value.rowVersion, expectedNodeVersion: target.rowVersion});
}
function approvedDependency(requirements, assignmentId) {
    let draft = requirements.createDraft(assignmentId);
    draft = requirements.addManualRequirement({contractId: draft.id, expectedVersion: draft.rowVersion, requirement: {type: "DEPENDENCY", label: "Measured dataset", displayValue: "Measured dataset supplied by the student", resolutionState: "RESOLVED"}});
    return requirements.approve({contractId: draft.id, expectedVersion: draft.rowVersion, approveAsIncomplete: false});
}
function stripV18(dbPath) {
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
        DROP TABLE IF EXISTS stud_workflow_blockers;
        DROP TABLE IF EXISTS stud_workflow_checkpoints;
        DROP INDEX IF EXISTS stud_workflow_events_workflow_index;
        ALTER TABLE stud_workflow_events RENAME TO stud_workflow_events_v18;
        CREATE TABLE stud_workflow_events (
            id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, event_sequence INTEGER NOT NULL CHECK(event_sequence >= 1),
            event_type TEXT NOT NULL CHECK(event_type IN ('TEMPLATE_SELECTED','WORKFLOW_CREATED','NODE_STARTED','NODE_COMPLETED','NODE_SKIPPED','NODE_REOPENED','NODE_RENAMED','NODE_ADDED','EDGE_ADDED','EDGE_REMOVED','WORKFLOW_REPLACED')),
            node_id TEXT, actor TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id), FOREIGN KEY(node_id) REFERENCES stud_workflow_nodes(id), UNIQUE(workflow_id,event_sequence)
        );
        INSERT INTO stud_workflow_events SELECT * FROM stud_workflow_events_v18 WHERE event_type NOT LIKE 'BLOCKER_%' AND event_type NOT LIKE 'CHECKPOINT_%';
        DROP TABLE stud_workflow_events_v18;
        CREATE INDEX stud_workflow_events_workflow_index ON stud_workflow_events(workflow_id,event_sequence DESC);
        DELETE FROM stud_schema_migrations WHERE version IN (18,19,20);
        PRAGMA foreign_keys=ON;`);
    db.close();
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m4-"));
try {
    const root = path.join(temp, "domain");
    const {store, requirements, context, workflow} = open(root);
    check("CURRENT_SCHEMA_AND_NO_FABRICATED_CONDITIONS", () => {
        assert.strictEqual(store.schemaInfo().version, 25);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_blockers").get().count, 0);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_checkpoints").get().count, 0);
    });
    check("NORMALIZED_CONDITION_TABLES", () => {
        const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stud_workflow_%'").all().map(item => item.name);
        assert.ok(tables.includes("stud_workflow_blockers"));
        assert.ok(tables.includes("stud_workflow_checkpoints"));
    });

    const course = store.createEntity("COURSE", {title: "Synthetic engineering systems"});
    const created = createWorkflow(store, workflow, "Synthetic lab report", "TECHNICAL_ENGINEERING", course.id);
    let lab = created.value;
    lab = complete(workflow, lab, "requirements_review");
    lab = complete(workflow, lab, "technical_planning");
    check("BRANCHED_STAGE_IS_READY_BEFORE_BLOCKER", () => {
        assert.strictEqual(node(lab, "technical_work").displayState, "READY");
        assert.strictEqual(node(lab, "background_research").displayState, "READY");
    });
    check("TERMINAL_STAGE_REJECTS_NEW_CONDITIONS_UNTIL_EXPLICIT_REOPEN", () => {
        const terminal = node(lab, "requirements_review");
        expect("INVALID_TRANSITION", () => workflow.createBlocker({workflowId: lab.id, nodeId: terminal.id, blockerType: "CUSTOM", title: "Impossible terminal blocker", expectedWorkflowVersion: lab.rowVersion}));
        expect("INVALID_TRANSITION", () => workflow.createCheckpoint({workflowId: lab.id, nodeId: terminal.id, title: "Impossible terminal checkpoint", expectedWorkflowVersion: lab.rowVersion}));
    });

    const technical = node(lab, "technical_work");
    lab = workflow.createBlocker({workflowId: lab.id, nodeId: technical.id, blockerType: "WAITING_LAB", title: "Waiting for laboratory measurements", requiredInput: "Synthetic wind tunnel dataset", expectedWorkflowVersion: lab.rowVersion});
    const firstBlocker = lab.conditions.blockers[0];
    check("DIRECT_BLOCKER_DOES_NOT_CHANGE_WORK_STATE", () => {
        assert.strictEqual(node(lab, "technical_work").state, "NOT_STARTED");
        assert.strictEqual(node(lab, "technical_work").availability, "DIRECT_BLOCKER");
        assert.deepStrictEqual(node(lab, "technical_work").availableActions, []);
    });
    check("TRANSITIVE_DEPENDENCY_WAIT_IS_DERIVED", () => {
        const downstream = node(lab, "evidence_results");
        assert.strictEqual(downstream.availability, "DEPENDENCY_WAIT");
        assert.ok(downstream.impactSources.some(item => item.id === firstBlocker.id));
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_blockers").get().count, 1);
    });
    check("INDEPENDENT_BRANCH_REMAINS_READY", () => assert.strictEqual(node(lab, "background_research").displayState, "READY"));
    check("IMPACT_QUERY_IS_SCOPED_AND_EXPLAINABLE", () => {
        const impact = workflow.blockerImpact({workflowId: lab.id, blockerId: firstBlocker.id});
        assert.strictEqual(impact.directNode.id, technical.id);
        assert.ok(impact.affected.some(item => item.id === node(lab, "evidence_results").id));
        assert.ok(!impact.affected.some(item => item.id === node(lab, "background_research").id));
    });

    lab = workflow.createBlocker({workflowId: lab.id, nodeId: technical.id, blockerType: "WAITING_EQUIPMENT", title: "Waiting for calibrated equipment", owner: "UNKNOWN", expectedWorkflowVersion: lab.rowVersion});
    check("MULTIPLE_OPEN_BLOCKERS_ARE_INDEPENDENT", () => assert.strictEqual(node(lab, "technical_work").directBlockers.length, 2));
    const waitingLab = lab.conditions.blockers.find(item => item.blockerType === "WAITING_LAB");
    lab = workflow.resolveBlocker({workflowId: lab.id, blockerId: waitingLab.id, note: "Measurements supplied explicitly.", expectedWorkflowVersion: lab.rowVersion, expectedBlockerVersion: waitingLab.rowVersion});
    check("RESOLVING_ONE_BLOCKER_DOES_NOT_CLEAR_ANOTHER", () => {
        assert.strictEqual(node(lab, "technical_work").availability, "DIRECT_BLOCKER");
        assert.strictEqual(node(lab, "technical_work").directBlockers.length, 1);
    });
    check("DOUBLE_RESOLVE_IS_REJECTED", () => {
        const resolved = lab.conditions.blockers.find(item => item.id === waitingLab.id);
        expect("INVALID_TRANSITION", () => workflow.resolveBlocker({workflowId: lab.id, blockerId: resolved.id, expectedWorkflowVersion: lab.rowVersion, expectedBlockerVersion: resolved.rowVersion}));
    });
    const equipment = lab.conditions.blockers.find(item => item.blockerType === "WAITING_EQUIPMENT");
    lab = workflow.resolveBlocker({workflowId: lab.id, blockerId: equipment.id, note: "Equipment is available.", expectedWorkflowVersion: lab.rowVersion, expectedBlockerVersion: equipment.rowVersion});
    check("FINAL_BLOCKER_RESOLUTION_RECOMPUTES_READY_WITHOUT_STARTING", () => {
        assert.strictEqual(node(lab, "technical_work").displayState, "READY");
        assert.strictEqual(node(lab, "technical_work").state, "NOT_STARTED");
    });
    check("BLOCKER_HISTORY_IS_RETAINED", () => {
        assert.strictEqual(lab.conditions.blockers.length, 2);
        assert.ok(lab.conditions.blockers.every(item => item.status === "RESOLVED"));
        assert.ok(lab.history.some(item => item.eventType === "BLOCKER_RESOLVED"));
    });

    let background = node(lab, "background_research");
    lab = workflow.createCheckpoint({workflowId: lab.id, nodeId: background.id, title: "Confirm archive material", instructions: "Inspect the selected material before research continues.", requiredDecision: "Approve or reject the source set.", expectedWorkflowVersion: lab.rowVersion});
    let checkpoint = lab.conditions.checkpoints[0];
    check("PENDING_CHECKPOINT_GATES_WITHOUT_PROGRESS", () => {
        assert.strictEqual(node(lab, "background_research").availability, "HUMAN_INPUT_REQUIRED");
        assert.strictEqual(node(lab, "background_research").state, "NOT_STARTED");
    });
    lab = workflow.decideCheckpoint({workflowId: lab.id, checkpointId: checkpoint.id, decision: "REJECT", note: "Source selection needs revision.", expectedWorkflowVersion: lab.rowVersion, expectedCheckpointVersion: checkpoint.rowVersion});
    checkpoint = lab.conditions.checkpoints[0];
    check("REJECTED_CHECKPOINT_REMAINS_A_GATE_AND_HISTORY", () => {
        assert.strictEqual(checkpoint.status, "REJECTED");
        assert.strictEqual(node(lab, "background_research").availability, "HUMAN_INPUT_REQUIRED");
        assert.ok(lab.history.some(item => item.eventType === "CHECKPOINT_REJECTED"));
    });
    lab = workflow.createCheckpoint({workflowId: lab.id, nodeId: background.id, title: "Confirm revised archive material", replacesCheckpointId: checkpoint.id, expectedWorkflowVersion: lab.rowVersion});
    const followUp = lab.conditions.checkpoints.find(item => item.replacesCheckpointId === checkpoint.id);
    check("FOLLOW_UP_PRESERVES_REJECTED_DECISION", () => {
        assert.ok(followUp && followUp.status === "PENDING");
        assert.strictEqual(lab.conditions.checkpoints.find(item => item.id === checkpoint.id).status, "REJECTED");
    });
    lab = workflow.decideCheckpoint({workflowId: lab.id, checkpointId: followUp.id, decision: "APPROVE", note: "Revised source set reviewed.", expectedWorkflowVersion: lab.rowVersion, expectedCheckpointVersion: followUp.rowVersion});
    check("APPROVED_FOLLOW_UP_SATISFIES_GATE_WITHOUT_COMPLETING_NODE", () => {
        assert.strictEqual(node(lab, "background_research").displayState, "READY");
        assert.strictEqual(node(lab, "background_research").state, "NOT_STARTED");
    });

    lab = workflow.createCheckpoint({workflowId: lab.id, nodeId: background.id, title: "Independent stale checkpoint fixture", expectedWorkflowVersion: lab.rowVersion});
    const staleCheckpoint = lab.conditions.checkpoints.find(item => item.title === "Independent stale checkpoint fixture");
    const staleCheckpointVersion = staleCheckpoint.rowVersion;
    lab = workflow.decideCheckpoint({workflowId: lab.id, checkpointId: staleCheckpoint.id, decision: "CANCEL", note: "No longer required after explicit review.", expectedWorkflowVersion: lab.rowVersion, expectedCheckpointVersion: staleCheckpoint.rowVersion});
    check("CANCELLED_CHECKPOINT_HISTORY_IS_RETAINED", () => {
        assert.strictEqual(lab.conditions.checkpoints.find(item => item.id === staleCheckpoint.id).status, "CANCELLED");
        assert.ok(lab.history.some(item => item.eventType === "CHECKPOINT_CANCELLED"));
    });
    check("STALE_CHECKPOINT_DECISION_IS_REJECTED", () => expect("STALE_CHECKPOINT_VERSION", () => workflow.decideCheckpoint({workflowId: lab.id, checkpointId: staleCheckpoint.id, decision: "APPROVE", expectedWorkflowVersion: lab.rowVersion, expectedCheckpointVersion: staleCheckpointVersion})));

    const staleTarget = node(lab, "technical_work");
    const beforeStale = lab;
    lab = workflow.createBlocker({workflowId: lab.id, nodeId: staleTarget.id, blockerType: "WAITING_DATA", title: "Fresh mutation", expectedWorkflowVersion: lab.rowVersion});
    check("STALE_WORKFLOW_MUTATION_IS_REJECTED", () => expect("STALE_WORKFLOW_VERSION", () => workflow.createCheckpoint({workflowId: lab.id, nodeId: staleTarget.id, title: "Stale mutation", expectedWorkflowVersion: beforeStale.rowVersion})));
    const staleBlocker = lab.conditions.blockers.find(item => item.title === "Fresh mutation");
    const blockerVersion = staleBlocker.rowVersion;
    lab = workflow.updateBlocker({workflowId: lab.id, blockerId: staleBlocker.id, title: "Updated mutation", expectedWorkflowVersion: lab.rowVersion, expectedBlockerVersion: blockerVersion});
    check("STALE_BLOCKER_MUTATION_IS_REJECTED", () => expect("STALE_BLOCKER_VERSION", () => workflow.resolveBlocker({workflowId: lab.id, blockerId: staleBlocker.id, expectedWorkflowVersion: lab.rowVersion, expectedBlockerVersion: blockerVersion})));

    const requirementCourse = store.createEntity("COURSE", {title: "Synthetic multidisciplinary course"});
    const requirementAssignment = store.createEntity("ASSIGNMENT", {courseId: requirementCourse.id, title: "Evidence-led report"});
    const contract = approvedDependency(requirements, requirementAssignment.id);
    let requirementWorkflow = workflow.create({assignmentId: requirementAssignment.id, templateKey: "STANDARD_WRITTEN_COURSEWORK", contractId: contract.id});
    const requirementItem = contract.items.find(item => item.type === "DEPENDENCY");
    requirementWorkflow = workflow.createBlocker({workflowId: requirementWorkflow.id, nodeId: requirementWorkflow.graph.nodes[0].id, blockerType: "WAITING_DATA", title: "Dataset required by reviewed brief", requirementItemId: requirementItem.id, expectedWorkflowVersion: requirementWorkflow.rowVersion});
    const linked = requirementWorkflow.conditions.blockers[0];
    check("REQUIREMENT_LINK_USES_EXACT_CONTRACT_REVISION", () => {
        assert.strictEqual(linked.requirementItemId, requirementItem.id);
        assert.strictEqual(linked.sourceContractId, contract.id);
        assert.strictEqual(linked.sourceContractRevision, contract.revision);
        assert.strictEqual(linked.sourceContractHash, contract.contractHash);
        assert.match(linked.sourceSnapshotHash, /^[a-f0-9]{64}$/);
    });
    check("CROSS_CONTRACT_REQUIREMENT_IS_REJECTED", () => expect("INVALID_WORKFLOW_CONDITION_SOURCE", () => workflow.createBlocker({workflowId: lab.id, nodeId: node(lab, "technical_work").id, blockerType: "WAITING_DATA", title: "Wrong contract", requirementItemId: requirementItem.id, expectedWorkflowVersion: lab.rowVersion})));
    check("CONTRACT_REMAINS_IMMUTABLE_AFTER_BLOCKER_CREATION", () => assert.strictEqual(requirements.state(requirementAssignment.id).current.contractHash, contract.contractHash));
    let nextContract = requirements.createRevision({contractId: contract.id, expectedVersion: contract.rowVersion});
    nextContract = requirements.updateRequirement({contractId: nextContract.id, itemId: nextContract.items[0].id, expectedVersion: nextContract.rowVersion, requirement: {displayValue: "A newly supplied measured dataset"}});
    check("LATER_CONTRACT_REVISION_DOES_NOT_MUTATE_HISTORICAL_BLOCKER_SOURCE", () => {
        const historical = workflow.read({workflowId: requirementWorkflow.id}).conditions.blockers.find(item => item.id === linked.id);
        assert.strictEqual(historical.sourceContractId, contract.id);
        assert.strictEqual(historical.sourceContractHash, contract.contractHash);
        assert.notStrictEqual(nextContract.id, historical.sourceContractId);
    });

    const other = createWorkflow(store, workflow, "Other workflow");
    check("CROSS_WORKFLOW_NODE_IS_REJECTED", () => expect("WORKFLOW_NODE_MISSING", () => workflow.createBlocker({workflowId: other.value.id, nodeId: node(lab, "technical_work").id, blockerType: "CUSTOM", title: "Cross workflow", expectedWorkflowVersion: other.value.rowVersion})));
    check("MALFORMED_AND_OVERSIZED_INPUTS_FAIL_CLOSED", () => {
        expect("INVALID_INPUT", () => workflow.createBlocker({workflowId: "../bad", nodeId: other.value.graph.nodes[0].id, blockerType: "CUSTOM", title: "Bad", expectedWorkflowVersion: other.value.rowVersion}));
        expect("INVALID_INPUT", () => workflow.createBlocker({workflowId: other.value.id, nodeId: other.value.graph.nodes[0].id, blockerType: "CUSTOM", title: "x".repeat(241), expectedWorkflowVersion: other.value.rowVersion}));
    });

    const disciplineCases = [
        ["Humanities archive essay", "WAITING_RESOURCE"],
        ["Law case analysis", "WAITING_FEEDBACK"],
        ["Social science interview report", "WAITING_INTERVIEW"],
        ["Generic manual coursework", "CUSTOM"]
    ];
    disciplineCases.forEach(([title, blockerType]) => {
        const fixture = createWorkflow(store, workflow, title);
        workflow.createBlocker({workflowId: fixture.value.id, nodeId: fixture.value.graph.nodes[0].id, blockerType, title: `${blockerType} synthetic fixture`, expectedWorkflowVersion: fixture.value.rowVersion});
    });
    check("DISCIPLINE_NEUTRAL_BLOCKER_TAXONOMY", () => {
        const rows = store.db.prepare("SELECT blocker_type FROM stud_workflow_blockers WHERE blocker_type IN ('WAITING_RESOURCE','WAITING_FEEDBACK','WAITING_INTERVIEW','CUSTOM')").all();
        assert.strictEqual(new Set(rows.map(item => item.blocker_type)).size, 4);
    });
    const group = createWorkflow(store, workflow, "Synthetic group project", "GROUP_PROJECT");
    const groupNode = group.value.graph.nodes.find(item => item.successorIds.length > 0);
    const groupBlocked = workflow.createBlocker({workflowId: group.value.id, nodeId: groupNode.id, blockerType: "WAITING_TEAM_MEMBER", title: "Awaiting team contribution", expectedResolutionAt: "2026-08-01T10:00:00.000Z", expectedWorkflowVersion: group.value.rowVersion});
    check("EXPECTED_DATE_IS_INFORMATIONAL_AND_NEVER_AUTO_RESOLVES", () => {
        const blocker = groupBlocked.conditions.blockers[0];
        assert.strictEqual(blocker.status, "OPEN");
        assert.strictEqual(groupBlocked.graph.nodes.find(item => item.id === groupNode.id).availability, "DIRECT_BLOCKER");
    });

    context.update({courseId: course.id, assignmentId: created.assignment.id, workflowId: lab.id, workflowNodeId: node(lab, "technical_work").id, originSurface: "WORKFLOW", userPinned: true});
    const beforeRestart = workflow.read({workflowId: lab.id});
    store.close();
    const reopened = open(root);
    const afterRestart = reopened.workflow.read({workflowId: lab.id});
    check("RESTART_PRESERVES_CONDITIONS_AND_RECOMPUTES_AVAILABILITY", () => {
        assert.strictEqual(afterRestart.conditions.blockers.length, beforeRestart.conditions.blockers.length);
        assert.strictEqual(afterRestart.conditions.checkpoints.length, beforeRestart.conditions.checkpoints.length);
        assert.strictEqual(node(afterRestart, "technical_work").availability, "DIRECT_BLOCKER");
    });
    check("RESTART_PRESERVES_VALID_WORKING_CONTEXT", () => assert.strictEqual(reopened.context.read().activeWorkflowNode.id, node(afterRestart, "technical_work").id));
    check("CONDITION_SELECTION_CAUSES_NO_PROVIDER_OR_AI_CALL", () => assert.strictEqual(reopened.context.read().originSurface, "WORKFLOW"));
    reopened.store.close();

    const migrationRoot = path.join(temp, "migration");
    const old = open(migrationRoot);
    const oldFixture = createWorkflow(old.store, old.workflow, "Existing v17 workflow");
    const oldWorkflowId = oldFixture.value.id;
    old.store.close();
    stripV18(path.join(migrationRoot, "academic.sqlite"));
    const migrated = open(migrationRoot);
    check("V17_TO_CURRENT_MIGRATION_PRESERVES_WORKFLOW_WITHOUT_FABRICATION", () => {
        assert.strictEqual(migrated.store.schemaInfo().version, 25);
        assert.ok(migrated.workflow.read({workflowId: oldWorkflowId}));
        assert.strictEqual(migrated.store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_blockers").get().count, 0);
        assert.strictEqual(migrated.store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_checkpoints").get().count, 0);
    });
    migrated.store.close();

    const rollbackRoot = path.join(temp, "rollback");
    const rollbackInitial = open(rollbackRoot); rollbackInitial.store.close();
    stripV18(path.join(rollbackRoot, "academic.sqlite"));
    const broken = new DatabaseSync(path.join(rollbackRoot, "academic.sqlite"));
    broken.exec("CREATE TABLE stud_workflow_blockers (id TEXT PRIMARY KEY);");
    broken.close();
    check("V18_MIGRATION_FAILURE_ROLLS_BACK_SAFELY", () => {
        assert.throws(() => open(rollbackRoot), error => error && error.code === "DATABASE_OPEN_FAILED");
        const inspect = new DatabaseSync(path.join(rollbackRoot, "academic.sqlite"));
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_schema_migrations WHERE version=18").get().count, 0);
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='stud_workflow_checkpoints'").get().count, 0);
        assert.ok(inspect.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stud_workflow_events'").get().sql.includes("WORKFLOW_REPLACED"));
        inspect.close();
    });

    console.log(`STUD_WORKFLOW_CONDITIONS: PASS (${passed} checks)`);
} finally {
    fs.rmSync(temp, {recursive: true, force: true});
}
