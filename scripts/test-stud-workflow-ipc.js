#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m3-ipc-"));
const handlers = new Map();
const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
const disposable = extra => Object.assign({dispose() {}}, extra || {});
const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/src/ui.html"}};
const untrusted = {sender: {isDestroyed: () => false, getURL: () => "https://example.invalid/"}};
let passed = 0;
const check = (name, operation) => { operation(); passed += 1; console.log(`${name}: PASS`); };

(async () => {
    const store = new StudAcademicStore({root, applicationVersion: "m3-ipc-test"}).initialize();
    const assignment = store.createEntity("ASSIGNMENT", {title: "Synthetic IPC workflow"});
    const registration = Ipc.registerStudAcademicIpc({
        ipc, store, requirementsService: new StudRequirementsContractService({store}),
        researchRuntime: disposable(), lmsRuntime: disposable(), documentRuntime: disposable(), academicAiRuntime: disposable(), notebookRuntime: disposable(),
        computeRuntime: {}, toolCatalog: {}, app: {getVersion: () => "m3-ipc-test", getPath: () => root}
    });
    try {
        const expected = ["stud-workflow-templates", "stud-workflow-assignment-state", "stud-workflow-read", "stud-workflow-create", "stud-workflow-node-transition", "stud-workflow-node-rename", "stud-workflow-node-add", "stud-workflow-edge-add", "stud-workflow-edge-remove", "stud-workflow-history"];
        check("M3_FIXED_CHANNELS_ARE_ALLOWLISTED", () => expected.forEach(channel => assert.ok(registration.channels.includes(channel) && handlers.has(channel), channel)));
        const state = await handlers.get("stud-workflow-assignment-state")(trusted, {assignmentId: assignment.id});
        check("ASSIGNMENT_READ_DOES_NOT_AUTO_CREATE", () => assert.ok(state.ok && state.data.current === null && state.data.setup.templates.length === 5 && store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances").get().count === 0));
        const untrustedResult = await handlers.get("stud-workflow-create")(untrusted, {assignmentId: assignment.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Denied fixture"});
        check("UNTRUSTED_SENDER_CANNOT_CREATE_WORKFLOW", () => assert.strictEqual(untrustedResult.code, "POLICY_BLOCKED"));
        const malformed = await handlers.get("stud-workflow-create")(trusted, {assignmentId: assignment.id, templateKey: "GENERIC_MANUAL", arbitrarySql: "DROP TABLE"});
        check("ARBITRARY_WORKFLOW_PAYLOAD_REJECTED", () => assert.strictEqual(malformed.code, "INVALID_INPUT"));
        const created = await handlers.get("stud-workflow-create")(trusted, {assignmentId: assignment.id, templateKey: "GENERIC_MANUAL", templateVersion: 1, allowNoContract: true, noContractReason: "Synthetic explicit IPC path."});
        check("TYPED_CREATE_RETURNS_PERSISTENT_DAG", () => assert.ok(created.ok && created.data.graph.nodes.length === 5 && created.data.history.length === 2));
        const first = created.data.graph.nodes[0];
        const early = await handlers.get("stud-workflow-node-transition")(trusted, {workflowId: created.data.id, nodeId: created.data.graph.nodes[1].id, action: "START", expectedWorkflowVersion: created.data.rowVersion, expectedNodeVersion: created.data.graph.nodes[1].rowVersion});
        check("RENDERER_CANNOT_BYPASS_READINESS", () => assert.strictEqual(early.code, "INVALID_TRANSITION"));
        const started = await handlers.get("stud-workflow-node-transition")(trusted, {workflowId: created.data.id, nodeId: first.id, action: "START", expectedWorkflowVersion: created.data.rowVersion, expectedNodeVersion: first.rowVersion});
        check("VALID_TRANSITION_IS_MAIN_VALIDATED", () => assert.ok(started.ok && started.data.graph.nodes[0].state === "IN_PROGRESS"));
        const directState = await handlers.get("stud-workflow-node-transition")(trusted, {workflowId: created.data.id, nodeId: first.id, state: "COMPLETE", expectedWorkflowVersion: started.data.rowVersion, expectedNodeVersion: started.data.graph.nodes[0].rowVersion});
        check("DIRECT_RENDERER_STATE_WRITE_IS_IMPOSSIBLE", () => assert.strictEqual(directState.code, "INVALID_INPUT"));
        const context = await handlers.get("stud-working-context-update")(trusted, {assignmentId: assignment.id, workflowId: created.data.id, workflowNodeId: first.id, originSurface: "WORKFLOW"});
        check("WORKFLOW_CONTEXT_IS_TYPED_AND_RELATION_VALIDATED", () => assert.ok(context.ok && context.data.activeWorkflow.id === created.data.id && context.data.activeWorkflowNode.id === first.id));
        const fakeNode = await handlers.get("stud-working-context-update")(trusted, {assignmentId: assignment.id, workflowId: created.data.id, workflowNodeId: "stud_workflow_node_missing", originSurface: "WORKFLOW"});
        check("FABRICATED_WORKFLOW_CONTEXT_REJECTED", () => assert.strictEqual(fakeNode.code, "INVALID_CONTEXT"));
        const history = await handlers.get("stud-workflow-history")(trusted, {workflowId: created.data.id, limit: 20});
        check("HISTORY_IS_BOUNDED_AND_ORDERED", () => assert.ok(history.ok && history.data[0].eventSequence > history.data.at(-1).eventSequence));
        const replaced = await handlers.get("stud-workflow-create")(trusted, {assignmentId: assignment.id, templateKey: "EXAM_PREPARATION", templateVersion: 1, allowNoContract: true, noContractReason: "Synthetic replacement path.", replaceCurrent: true, replaceWorkflowId: created.data.id, expectedWorkflowVersion: started.data.rowVersion, replacementReason: "Explicit IPC replacement fixture."});
        check("EXPLICIT_REPLACEMENT_PRESERVES_HISTORY", () => {
            assert.ok(replaced.ok && replaced.data.id !== created.data.id);
            const prior = store.db.prepare("SELECT lifecycle,is_current FROM stud_workflow_instances WHERE id=?").get(created.data.id);
            assert.strictEqual(prior.lifecycle, "HISTORICAL");
            assert.strictEqual(prior.is_current, 0);
        });
        console.log(`STUD_WORKFLOW_IPC: PASS (${passed} checks)`);
    } finally { registration.dispose(); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; }).finally(() => fs.rmSync(root, {recursive: true, force: true}));
