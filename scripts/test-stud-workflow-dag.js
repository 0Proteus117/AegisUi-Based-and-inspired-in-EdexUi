#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const WorkflowModel = require(path.join(ROOT, "src/classes/workspaces/studWorkflowModel.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const {StudRequirementsContractService} = require(path.join(ROOT, "src/classes/workspaces/studRequirementsContractService.class.js"));
const {StudWorkingContextService} = require(path.join(ROOT, "src/classes/workspaces/studWorkingContextService.class.js"));
const {StudWorkflowTemplateRegistry} = require(path.join(ROOT, "src/classes/workspaces/studWorkflowTemplateRegistry.class.js"));
const {StudWorkflowRepository} = require(path.join(ROOT, "src/classes/workspaces/studWorkflowRepository.class.js"));
const {StudWorkflowService} = require(path.join(ROOT, "src/classes/workspaces/studWorkflowService.class.js"));

let passed = 0;
function check(name, operation) { operation(); passed += 1; console.log(`${name}: PASS`); }
function expect(code, operation) { assert.throws(operation, error => error && error.code === code, code); }
function storeAt(root) { return new StudAcademicStore({root, applicationVersion: "m3-test"}).initialize(); }
function services(store) {
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    const workflow = new StudWorkflowService({store, requirementsService: requirements, workingContextService: context});
    return {requirements, context, workflow};
}
function approvedContract(requirements, assignmentId, incomplete = false) {
    let draft = requirements.createDraft(assignmentId);
    for (const candidate of draft.candidates.filter(item => item.disposition === "PENDING")) draft = requirements.reviewCandidate({contractId: draft.id, candidateId: candidate.id, disposition: "INCLUDED", expectedVersion: draft.rowVersion});
    draft = requirements.addManualRequirement({contractId: draft.id, expectedVersion: draft.rowVersion, requirement: {type: "DEPENDENCY", label: incomplete ? "External data pending" : "Reviewed scope", displayValue: incomplete ? "Not yet supplied" : "Scope reviewed", resolutionState: incomplete ? "UNRESOLVED" : "RESOLVED"}});
    return requirements.approve({contractId: draft.id, expectedVersion: draft.rowVersion, approveAsIncomplete: incomplete});
}
function stripV17(dbPath) {
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
        DROP TABLE IF EXISTS stud_workflow_events;
        DROP TABLE IF EXISTS stud_workflow_edges;
        DROP TABLE IF EXISTS stud_workflow_nodes;
        DROP TABLE IF EXISTS stud_workflow_instances;
        DROP TABLE IF EXISTS stud_workflow_template_edges;
        DROP TABLE IF EXISTS stud_workflow_template_nodes;
        DROP TABLE IF EXISTS stud_workflow_template_versions;
        DROP TABLE IF EXISTS stud_workflow_templates;
        ALTER TABLE stud_working_context DROP COLUMN active_workflow_node_id;
        ALTER TABLE stud_working_context DROP COLUMN active_workflow_id;
        DELETE FROM stud_schema_migrations WHERE version IN (17,18,19,20);
        PRAGMA foreign_keys=ON;`);
    db.close();
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m3-"));
try {
    const root = path.join(temp, "domain");
    const store = storeAt(root);
    const {requirements, context, workflow} = services(store);

    check("CURRENT_SCHEMA_AND_NO_FABRICATED_WORKFLOW", () => {
        assert.strictEqual(store.schemaInfo().version, 20);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances").get().count, 0);
    });
    check("NORMALIZED_WORKFLOW_TABLES", () => {
        const names = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stud_workflow_%'").all().map(row => row.name);
        ["stud_workflow_templates", "stud_workflow_template_versions", "stud_workflow_template_nodes", "stud_workflow_template_edges", "stud_workflow_instances", "stud_workflow_nodes", "stud_workflow_edges", "stud_workflow_events"].forEach(name => assert.ok(names.includes(name), name));
        const templateId = store.db.prepare("SELECT id FROM stud_workflow_template_versions LIMIT 1").get().id;
        assert.throws(() => store.db.prepare("INSERT INTO stud_workflow_instances (id,assignment_id,template_version_id,template_fingerprint,no_contract_reason,lifecycle,is_current,row_version,created_at,updated_at) VALUES (?,?,?,?,?,'HISTORICAL',1,1,?,?)").run("stud_workflow_invalid_lifecycle", store.createEntity("ASSIGNMENT", {title: "Lifecycle constraint fixture"}).id, templateId, "x", "reason", Model.now(), Model.now()), /CHECK constraint failed/);
    });

    const templates = workflow.templates({}).templates;
    check("FIVE_DISCIPLINE_NEUTRAL_VERSIONED_TEMPLATES", () => {
        assert.deepStrictEqual(templates.map(item => item.templateKey).sort(), ["EXAM_PREPARATION", "GENERIC_MANUAL", "GROUP_PROJECT", "STANDARD_WRITTEN_COURSEWORK", "TECHNICAL_ENGINEERING"]);
        assert.ok(templates.every(item => item.version === 1 && /^[a-f0-9]{64}$/.test(item.fingerprint)));
    });
    check("BRANCH_AND_CONVERGENCE_EXIST_IN_TEMPLATE", () => {
        const technical = templates.find(item => item.templateKey === "TECHNICAL_ENGINEERING");
        const outgoing = technical.edges.filter(edge => edge.fromNodeKey === "technical_planning");
        const incoming = technical.edges.filter(edge => edge.toNodeKey === "evidence_results");
        assert.strictEqual(outgoing.length, 2); assert.strictEqual(incoming.length, 2);
    });
    check("PUBLISHED_TEMPLATE_VERSION_IS_IMMUTABLE", () => {
        const repository = new StudWorkflowRepository(store);
        const changed = WorkflowModel.normalizeTemplate({key: "GENERIC_MANUAL", version: 1, title: "Changed illegally", description: null, nodes: [{key: "one", title: "One", semanticType: "OTHER", order: 0}], edges: []});
        expect("TEMPLATE_REGISTRY_DRIFT", () => repository.seedTemplate(changed));
        assert.strictEqual(repository.templateVersionByKey("GENERIC_MANUAL").title, "Generic / manual");
    });

    const engineeringCourse = store.createEntity("COURSE", {title: "Engineering Systems", code: "ENG100"});
    const engineering = store.createEntity("ASSIGNMENT", {courseId: engineeringCourse.id, title: "Control system analysis", description: "Technical report with evidence."});
    const approvedIncomplete = approvedContract(requirements, engineering.id, true);
    let engineeringWorkflow = workflow.create({assignmentId: engineering.id, templateKey: "TECHNICAL_ENGINEERING", contractId: approvedIncomplete.id});
    check("INSTANTIATION_RECORDS_EXACT_INCOMPLETE_APPROVED_CONTRACT", () => {
        assert.strictEqual(engineeringWorkflow.contractId, approvedIncomplete.id);
        assert.strictEqual(engineeringWorkflow.contractRevision, approvedIncomplete.revision);
        assert.strictEqual(engineeringWorkflow.contractHash, approvedIncomplete.contractHash);
        assert.strictEqual(engineeringWorkflow.contract.completeness, "INCOMPLETE");
        assert.strictEqual(engineeringWorkflow.graph.nodes.length, 11);
    });
    check("WORKFLOW_CREATION_DOES_NOT_MUTATE_CONTRACT", () => {
        const after = requirements.state(engineering.id).current;
        assert.strictEqual(after.contractHash, approvedIncomplete.contractHash);
        assert.strictEqual(after.rowVersion, approvedIncomplete.rowVersion);
    });
    check("NO_SECOND_CURRENT_WORKFLOW_IS_CREATED", () => expect("WORKFLOW_ALREADY_EXISTS", () => workflow.create({assignmentId: engineering.id, templateKey: "GENERIC_MANUAL", contractId: approvedIncomplete.id})));

    const manual = store.createEntity("ASSIGNMENT", {title: "Manual institution-neutral assignment"});
    check("NO_CONTRACT_PATH_IS_EXPLICIT", () => expect("REVIEWED_CONTRACT_REQUIRED", () => workflow.create({assignmentId: manual.id, templateKey: "GENERIC_MANUAL"})));
    let manualWorkflow = workflow.create({assignmentId: manual.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "The paper brief has not yet been reviewed."});
    check("MANUAL_ASSIGNMENT_WORKFLOW_WITH_HONEST_REASON", () => {
        assert.strictEqual(manualWorkflow.contractId, null);
        assert.strictEqual(manualWorkflow.noContractReason, "The paper brief has not yet been reviewed.");
        assert.strictEqual(manualWorkflow.integrity, undefined);
    });
    check("INITIAL_READY_IS_DERIVED_NOT_PERSISTED", () => {
        assert.strictEqual(manualWorkflow.graph.nodes[0].state, "NOT_STARTED");
        assert.strictEqual(manualWorkflow.graph.nodes[0].displayState, "READY");
        assert.strictEqual(store.db.prepare("SELECT state FROM stud_workflow_nodes WHERE id=?").get(manualWorkflow.graph.nodes[0].id).state, "NOT_STARTED");
    });
    check("DEPENDENT_STAGE_CANNOT_START_EARLY", () => {
        const node = manualWorkflow.graph.nodes[1];
        expect("INVALID_TRANSITION", () => workflow.transition({workflowId: manualWorkflow.id, nodeId: node.id, action: "START", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: node.rowVersion}));
    });

    const first = manualWorkflow.graph.nodes[0];
    manualWorkflow = workflow.transition({workflowId: manualWorkflow.id, nodeId: first.id, action: "START", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: first.rowVersion});
    check("READY_TO_IN_PROGRESS", () => assert.strictEqual(manualWorkflow.graph.nodes[0].state, "IN_PROGRESS"));
    check("STALE_NODE_AND_WORKFLOW_WRITES_REJECTED", () => {
        expect("STALE_WORKFLOW_VERSION", () => workflow.transition({workflowId: manualWorkflow.id, nodeId: first.id, action: "COMPLETE", expectedWorkflowVersion: 1, expectedNodeVersion: manualWorkflow.graph.nodes[0].rowVersion}));
        expect("STALE_WORKFLOW_NODE_VERSION", () => workflow.transition({workflowId: manualWorkflow.id, nodeId: first.id, action: "COMPLETE", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: first.rowVersion}));
    });
    let currentFirst = manualWorkflow.graph.nodes[0];
    manualWorkflow = workflow.transition({workflowId: manualWorkflow.id, nodeId: currentFirst.id, action: "COMPLETE", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: currentFirst.rowVersion});
    check("COMPLETION_UNLOCKS_NEXT_DERIVED_READY", () => {
        assert.strictEqual(manualWorkflow.graph.nodes[0].state, "COMPLETE");
        assert.strictEqual(manualWorkflow.graph.nodes[1].displayState, "READY");
    });
    let second = manualWorkflow.graph.nodes[1];
    manualWorkflow = workflow.transition({workflowId: manualWorkflow.id, nodeId: second.id, action: "SKIP", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: second.rowVersion});
    check("EXPLICIT_SKIP_IS_TERMINAL_AND_AUDITABLE", () => {
        assert.strictEqual(manualWorkflow.graph.nodes[1].state, "SKIPPED");
        assert.strictEqual(manualWorkflow.graph.summary.skipped, 1);
        assert.ok(manualWorkflow.history.some(event => event.eventType === "NODE_SKIPPED"));
    });
    check("PREDECESSOR_REOPEN_REJECTED_WHILE_DOWNSTREAM_PROGRESS_EXISTS", () => {
        const node = manualWorkflow.graph.nodes[0];
        assert.ok(!node.availableActions.includes("REOPEN"));
        expect("DOWNSTREAM_PROGRESS_EXISTS", () => workflow.transition({workflowId: manualWorkflow.id, nodeId: node.id, action: "REOPEN", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: node.rowVersion}));
    });
    second = manualWorkflow.graph.nodes[1];
    manualWorkflow = workflow.transition({workflowId: manualWorkflow.id, nodeId: second.id, action: "REOPEN", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: second.rowVersion});
    currentFirst = manualWorkflow.graph.nodes[0];
    manualWorkflow = workflow.transition({workflowId: manualWorkflow.id, nodeId: currentFirst.id, action: "REOPEN", expectedWorkflowVersion: manualWorkflow.rowVersion, expectedNodeVersion: currentFirst.rowVersion});
    check("ORDERED_REOPEN_PRESERVES_DEPENDENCY_TRUTH", () => {
        assert.strictEqual(manualWorkflow.graph.nodes[0].displayState, "READY");
        assert.strictEqual(manualWorkflow.graph.nodes[1].readiness, "DEPENDENCIES_PENDING");
    });
    const completionAssignment = store.createEntity("ASSIGNMENT", {title: "Completion rule fixture"});
    let completion = workflow.create({assignmentId: completionAssignment.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Synthetic completion rule fixture."});
    while (!completion.graph.summary.workflowComplete) {
        const ready = completion.graph.nodes.find(node => node.displayState === "READY");
        assert.ok(ready, "A valid linear workflow should expose a ready node.");
        if (ready === completion.graph.nodes.at(-1)) completion = workflow.transition({workflowId: completion.id, nodeId: ready.id, action: "SKIP", expectedWorkflowVersion: completion.rowVersion, expectedNodeVersion: ready.rowVersion});
        else {
            completion = workflow.transition({workflowId: completion.id, nodeId: ready.id, action: "START", expectedWorkflowVersion: completion.rowVersion, expectedNodeVersion: ready.rowVersion});
            const active = completion.graph.nodes.find(node => node.id === ready.id);
            completion = workflow.transition({workflowId: completion.id, nodeId: active.id, action: "COMPLETE", expectedWorkflowVersion: completion.rowVersion, expectedNodeVersion: active.rowVersion});
        }
    }
    check("WORKFLOW_COMPLETE_MEANS_EVERY_NODE_TERMINAL", () => {
        assert.strictEqual(completion.graph.summary.workflowComplete, true);
        assert.strictEqual(completion.graph.summary.terminal, completion.graph.summary.total);
        assert.strictEqual(completion.graph.summary.skipped, 1);
    });
    check("TOPOLOGY_LOCKS_AFTER_EXPLICIT_WORK", () => expect("WORKFLOW_TOPOLOGY_LOCKED", () => workflow.addNode({workflowId: completion.id, expectedWorkflowVersion: completion.rowVersion, node: {title: "Late mutation", semanticType: "OTHER", order: 99}})));

    const topologyAssignment = store.createEntity("ASSIGNMENT", {title: "Topology fixture"});
    let topology = workflow.create({assignmentId: topologyAssignment.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Synthetic graph integrity fixture."});
    const originalEdgeCount = topology.graph.edges.length;
    topology = workflow.addNode({workflowId: topology.id, expectedWorkflowVersion: topology.rowVersion, node: {title: "Independent evidence", semanticType: "RESEARCH", order: 2}});
    const added = topology.graph.nodes.find(node => node.title === "Independent evidence");
    check("STABLE_NODE_ID_SURVIVES_RENAME", () => {
        const before = added.id;
        topology = workflow.renameNode({workflowId: topology.id, nodeId: added.id, title: "Independent source review", expectedWorkflowVersion: topology.rowVersion, expectedNodeVersion: added.rowVersion});
        assert.strictEqual(topology.graph.nodes.find(node => node.title === "Independent source review").id, before);
    });
    const renamed = topology.graph.nodes.find(node => node.id === added.id);
    topology = workflow.addEdge({workflowId: topology.id, fromNodeId: topology.graph.nodes[0].id, toNodeId: renamed.id, expectedWorkflowVersion: topology.rowVersion});
    check("VALID_BRANCH_EDGE_ADDED_TRANSACTIONALLY", () => assert.strictEqual(topology.graph.edges.length, originalEdgeCount + 1));
    check("SELF_DUPLICATE_MISSING_AND_CYCLE_EDGES_REJECTED", () => {
        const firstNode = topology.graph.nodes[0]; const secondNode = topology.graph.nodes[1];
        expect("WORKFLOW_SELF_EDGE", () => workflow.addEdge({workflowId: topology.id, fromNodeId: firstNode.id, toNodeId: firstNode.id, expectedWorkflowVersion: topology.rowVersion}));
        expect("DUPLICATE_WORKFLOW_EDGE", () => workflow.addEdge({workflowId: topology.id, fromNodeId: firstNode.id, toNodeId: secondNode.id, expectedWorkflowVersion: topology.rowVersion}));
        expect("WORKFLOW_NODE_MISSING", () => workflow.addEdge({workflowId: topology.id, fromNodeId: "stud_workflow_node_missing", toNodeId: secondNode.id, expectedWorkflowVersion: topology.rowVersion}));
        expect("WORKFLOW_CYCLE", () => workflow.addEdge({workflowId: topology.id, fromNodeId: secondNode.id, toNodeId: firstNode.id, expectedWorkflowVersion: topology.rowVersion}));
    });
    const otherAssignment = store.createEntity("ASSIGNMENT", {title: "Cross workflow fixture"});
    const other = workflow.create({assignmentId: otherAssignment.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Synthetic isolation fixture."});
    check("CROSS_WORKFLOW_EDGE_REJECTED", () => expect("WORKFLOW_NODE_MISSING", () => workflow.addEdge({workflowId: topology.id, fromNodeId: topology.graph.nodes[0].id, toNodeId: other.graph.nodes[0].id, expectedWorkflowVersion: topology.rowVersion})));
    const removable = topology.graph.edges.find(edge => edge.toNodeId === renamed.id);
    topology = workflow.removeEdge({workflowId: topology.id, edgeId: removable.id, expectedWorkflowVersion: topology.rowVersion});
    check("EDGE_REMOVAL_RECORDED_IN_HISTORY", () => assert.ok(topology.history.some(event => event.eventType === "EDGE_REMOVED") && topology.graph.edges.length === originalEdgeCount));

    check("WORKING_CONTEXT_RESOLVES_ASSIGNMENT_WORKFLOW", () => {
        const value = context.update({assignmentId: manual.id, originSurface: "ASSIGNMENT"});
        assert.strictEqual(value.activeWorkflow.id, manualWorkflow.id);
        assert.strictEqual(value.activeWorkflowNode, null);
    });
    check("WORKFLOW_NODE_CONTEXT_IS_EXPLICIT_AND_VALIDATED", () => {
        const node = manualWorkflow.graph.nodes[0];
        const value = context.update({assignmentId: manual.id, workflowId: manualWorkflow.id, workflowNodeId: node.id, originSurface: "WORKFLOW"});
        assert.strictEqual(value.activeWorkflowNode.id, node.id);
        expect("INVALID_CONTEXT", () => context.update({assignmentId: manual.id, workflowId: manualWorkflow.id, workflowNodeId: other.graph.nodes[0].id, originSurface: "WORKFLOW"}));
    });
    check("CONTEXT_CHANGE_CAUSES_NO_PROVIDER_OR_AI_ACTIVITY", () => {
        const providersBefore = store.db.prepare("SELECT COUNT(*) count FROM stud_provider_instances").get().count;
        const packagesBefore = store.db.prepare("SELECT COUNT(*) count FROM stud_context_packages").get().count;
        context.update({assignmentId: manual.id, workflowId: manualWorkflow.id, workflowNodeId: manualWorkflow.graph.nodes[0].id, originSurface: "WORKFLOW"});
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_provider_instances").get().count, providersBefore);
        assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_context_packages").get().count, packagesBefore);
    });

    const contractHash = approvedIncomplete.contractHash;
    let replacement = requirements.createRevision({contractId: approvedIncomplete.id, expectedVersion: approvedIncomplete.rowVersion});
    for (const candidate of replacement.candidates) replacement = requirements.reviewCandidate({contractId: replacement.id, candidateId: candidate.id, disposition: "EXCLUDED", expectedVersion: replacement.rowVersion});
    replacement = requirements.approve({contractId: replacement.id, expectedVersion: replacement.rowVersion, approveAsIncomplete: true});
    engineeringWorkflow = workflow.assignmentState({assignmentId: engineering.id}).current;
    check("NEW_CONTRACT_REVISION_DOES_NOT_REWRITE_EXISTING_WORKFLOW", () => {
        assert.strictEqual(engineeringWorkflow.contractId, approvedIncomplete.id);
        assert.strictEqual(engineeringWorkflow.contractHash, contractHash);
        assert.strictEqual(engineeringWorkflow.integrity.contractRelation, "HISTORICAL_APPROVED_REVISION");
        assert.notStrictEqual(replacement.id, engineeringWorkflow.contractId);
    });
    const priorEngineeringWorkflow = engineeringWorkflow;
    engineeringWorkflow = workflow.create({
        assignmentId: engineering.id,
        templateKey: "STANDARD_WRITTEN_COURSEWORK",
        contractId: approvedIncomplete.id,
        replaceCurrent: true,
        replaceWorkflowId: priorEngineeringWorkflow.id,
        expectedWorkflowVersion: priorEngineeringWorkflow.rowVersion,
        replacementReason: "Explicitly use a written structure while preserving the first plan."
    });
    check("EXPLICIT_REPLACEMENT_PRESERVES_HISTORICAL_WORKFLOW", () => {
        const state = workflow.assignmentState({assignmentId: engineering.id});
        const prior = state.history.find(item => item.id === priorEngineeringWorkflow.id);
        assert.ok(prior && prior.lifecycle === "HISTORICAL" && prior.isCurrent === false);
        assert.strictEqual(prior.graph.nodes.length, priorEngineeringWorkflow.graph.nodes.length);
        assert.ok(prior.history.some(event => event.eventType === "WORKFLOW_REPLACED"));
        assert.strictEqual(state.current.id, engineeringWorkflow.id);
        assert.notStrictEqual(state.current.templateFingerprint, prior.templateFingerprint);
    });
    check("EXPLICIT_HISTORICAL_CONTRACT_REVISION_IS_RECORDED_EXACTLY", () => {
        assert.strictEqual(engineeringWorkflow.contractId, approvedIncomplete.id);
        assert.strictEqual(engineeringWorkflow.contractHash, approvedIncomplete.contractHash);
        assert.strictEqual(engineeringWorkflow.integrity, undefined);
        assert.notStrictEqual(engineeringWorkflow.contractId, replacement.id);
    });
    check("REPLACEMENT_REQUIRES_CURRENT_ID_VERSION_AND_REASON", () => {
        expect("WORKFLOW_ALREADY_EXISTS", () => workflow.create({assignmentId: engineering.id, templateKey: "GENERIC_MANUAL", contractId: replacement.id}));
        expect("INVALID_INPUT", () => workflow.create({assignmentId: engineering.id, templateKey: "GENERIC_MANUAL", contractId: replacement.id, replaceCurrent: true, replaceWorkflowId: engineeringWorkflow.id, expectedWorkflowVersion: engineeringWorkflow.rowVersion}));
        expect("STALE_WORKFLOW_VERSION", () => workflow.create({assignmentId: engineering.id, templateKey: "GENERIC_MANUAL", contractId: replacement.id, replaceCurrent: true, replaceWorkflowId: engineeringWorkflow.id, expectedWorkflowVersion: engineeringWorkflow.rowVersion + 99, replacementReason: "Stale replacement fixture."}));
    });

    check("DETERMINISTIC_TEMPLATE_SUGGESTIONS_ARE_CORRECTABLE", () => {
        const exam = store.createEntity("ASSIGNMENT", {title: "Timed exam"});
        store.db.prepare("INSERT INTO stud_assignment_classifications (assignment_id,classification,source_kind,source_detail,user_corrected,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(exam.id, "EXAM", "EXPLICIT", "fixture", 0, Model.now(), Model.now());
        assert.strictEqual(workflow.suggestions(exam.id)[0].key, "EXAM_PREPARATION");
        const lab = store.createEntity("ASSIGNMENT", {title: "Laboratory practical"});
        assert.strictEqual(workflow.suggestions(lab.id)[0].key, "TECHNICAL_ENGINEERING");
        assert.strictEqual(workflow.suggestions(store.createEntity("ASSIGNMENT", {title: "Opaque assessment"}).id)[0].key, "GENERIC_MANUAL");
    });

    const disciplines = [
        ["Engineering", "TECHNICAL_ENGINEERING"], ["Humanities", "STANDARD_WRITTEN_COURSEWORK"],
        ["Law and Criminology", "STANDARD_WRITTEN_COURSEWORK"], ["Social Science", "STANDARD_WRITTEN_COURSEWORK"],
        ["Group", "GROUP_PROJECT"], ["Exam", "EXAM_PREPARATION"], ["Generic", "GENERIC_MANUAL"]
    ];
    check("DISCIPLINE_NEUTRAL_WORKFLOW_INSTANTIATION", () => {
        disciplines.forEach(([title, templateKey]) => {
            const assignment = store.createEntity("ASSIGNMENT", {title: `${title} fixture`});
            const value = workflow.create({assignmentId: assignment.id, templateKey, allowNoContract: true, noContractReason: "Synthetic discipline-neutral validation."});
            assert.ok(value.graph.nodes.length >= 5);
        });
    });

    const workflowId = manualWorkflow.id;
    const eventCount = store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_events WHERE workflow_id=?").get(workflowId).count;
    store.close();
    const reopened = storeAt(root); const reopenedServices = services(reopened);
    check("WORKFLOW_HISTORY_AND_CONTEXT_SURVIVE_RESTART", () => {
        const restored = reopenedServices.workflow.read({workflowId});
        assert.strictEqual(restored.history.length, eventCount);
        assert.strictEqual(reopenedServices.context.read().activeWorkflow.id, workflowId);
        assert.ok(reopenedServices.context.read().activeWorkflowNode);
    });
    reopened.close();

    const migrationRoot = path.join(temp, "migration");
    let legacy = storeAt(migrationRoot); const legacyAssignment = legacy.createEntity("ASSIGNMENT", {title: "Existing v16 assignment"}); legacy.close();
    stripV17(path.join(migrationRoot, "academic.sqlite"));
    legacy = storeAt(migrationRoot);
    check("V16_TO_CURRENT_MIGRATION_HAS_NO_FABRICATED_STATE", () => {
        assert.strictEqual(legacy.schemaInfo().version, 20);
        assert.ok(legacy.getEntity("ASSIGNMENT", legacyAssignment.id));
        assert.strictEqual(legacy.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances").get().count, 0);
        assert.strictEqual(new StudWorkingContextService({store: legacy}).read().status, "EMPTY");
    });
    legacy.close();

    const rollbackRoot = path.join(temp, "rollback");
    let rollback = storeAt(rollbackRoot); rollback.close(); stripV17(path.join(rollbackRoot, "academic.sqlite"));
    const broken = new DatabaseSync(path.join(rollbackRoot, "academic.sqlite")); broken.exec("CREATE TABLE stud_workflow_templates (id TEXT PRIMARY KEY);"); broken.close();
    check("V17_MIGRATION_FAILURE_ROLLS_BACK", () => {
        assert.throws(() => storeAt(rollbackRoot), error => error.code === "DATABASE_OPEN_FAILED");
        const inspect = new DatabaseSync(path.join(rollbackRoot, "academic.sqlite"));
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_schema_migrations WHERE version=17").get().count, 0);
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='stud_workflow_instances'").get().count, 0);
        inspect.close();
    });

    const securityRoot = path.join(temp, "security"); const securityStore = storeAt(securityRoot); const securityServices = services(securityStore);
    check("MALFORMED_IDS_AND_OVERSIZED_PAYLOADS_FAIL_CLOSED", () => {
        expect("INVALID_INPUT", () => securityServices.workflow.assignmentState({assignmentId: "../../etc/passwd"}));
        expect("PAYLOAD_TOO_LARGE", () => WorkflowModel.validateEventDetails({value: "x".repeat(9000)}));
        expect("INVALID_INPUT", () => WorkflowModel.normalizeNodeMutation({title: "x", shell: "rm"}));
    });
    securityStore.close();

    const renderer = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studWorkflowWorkspace.class.js"), "utf8");
    const ipc = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"), "utf8");
    const preload = fs.readFileSync(path.join(ROOT, "src/preload.js"), "utf8");
    check("PRELOAD_READY_RENDERER_HAS_NO_NODE_OR_GENERIC_ESCAPE_HATCH", () => {
        assert.ok(!renderer.includes("require(")); assert.ok(!renderer.includes("fetch(")); assert.ok(!renderer.includes("localStorage")); assert.ok(!renderer.includes("ipcRenderer"));
        assert.ok(ipc.includes('"stud-workflow-node-transition"')); assert.ok(preload.includes('"stud-workflow-edge-add"'));
        assert.ok(!renderer.includes("node:sqlite")); assert.ok(!renderer.includes("child_process"));
    });

    console.log(`STUD_WORKFLOW_DAG: PASS (${passed} checks)`);
} finally {
    fs.rmSync(temp, {recursive: true, force: true});
}
