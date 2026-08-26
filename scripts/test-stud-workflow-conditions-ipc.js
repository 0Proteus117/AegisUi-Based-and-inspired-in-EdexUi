#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m4-ipc-"));
const handlers = new Map();
const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
const disposable = extra => Object.assign({dispose() {}}, extra || {});
const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/src/ui.html"}};
const untrusted = {sender: {isDestroyed: () => false, getURL: () => "https://example.invalid/"}};
let passed = 0;
const check = (name, operation) => { operation(); passed += 1; console.log(`${name}: PASS`); };

(async () => {
    const store = new StudAcademicStore({root, applicationVersion: "m4-ipc-test"}).initialize();
    const assignment = store.createEntity("ASSIGNMENT", {title: "Synthetic blocker IPC workflow"});
    const registration = Ipc.registerStudAcademicIpc({
        ipc, store, requirementsService: new StudRequirementsContractService({store}),
        researchRuntime: disposable(), lmsRuntime: disposable(), documentRuntime: disposable(), academicAiRuntime: disposable(), notebookRuntime: disposable(),
        computeRuntime: {}, toolCatalog: {}, app: {getVersion: () => "m4-ipc-test", getPath: () => root}
    });
    try {
        const expected = ["stud-workflow-conditions", "stud-workflow-blocker-impact", "stud-workflow-blocker-create", "stud-workflow-blocker-update", "stud-workflow-blocker-resolve", "stud-workflow-blocker-cancel", "stud-workflow-checkpoint-create", "stud-workflow-checkpoint-decide"];
        check("M4_FIXED_CHANNELS_ARE_ALLOWLISTED", () => expected.forEach(channel => assert.ok(registration.channels.includes(channel) && handlers.has(channel), channel)));

        const created = await handlers.get("stud-workflow-create")(trusted, {assignmentId: assignment.id, templateKey: "TECHNICAL_ENGINEERING", templateVersion: 1, allowNoContract: true, noContractReason: "Synthetic explicit IPC path."});
        check("WORKFLOW_CREATED_FOR_CONDITION_IPC", () => assert.ok(created.ok && created.data.graph.nodes.length > 3));
        const first = created.data.graph.nodes[0];

        const denied = await handlers.get("stud-workflow-blocker-create")(untrusted, {workflowId: created.data.id, nodeId: first.id, blockerType: "WAITING_DATA", title: "Denied", expectedWorkflowVersion: created.data.rowVersion});
        check("UNTRUSTED_SENDER_CANNOT_CREATE_BLOCKER", () => assert.strictEqual(denied.code, "POLICY_BLOCKED"));
        const malformed = await handlers.get("stud-workflow-blocker-create")(trusted, {workflowId: created.data.id, nodeId: first.id, blockerType: "WAITING_DATA", title: "Malformed", expectedWorkflowVersion: created.data.rowVersion, sql: "DROP TABLE"});
        check("ARBITRARY_BLOCKER_PAYLOAD_REJECTED", () => assert.strictEqual(malformed.code, "INVALID_INPUT"));

        const blocked = await handlers.get("stud-workflow-blocker-create")(trusted, {workflowId: created.data.id, nodeId: first.id, blockerType: "WAITING_DATA", title: "Awaiting measured data", expectedWorkflowVersion: created.data.rowVersion});
        check("TYPED_BLOCKER_CREATE_RETURNS_DERIVED_AVAILABILITY", () => assert.ok(blocked.ok && blocked.data.graph.nodes[0].state === "NOT_STARTED" && blocked.data.graph.nodes[0].availability === "DIRECT_BLOCKER"));
        const blocker = blocked.data.conditions.blockers[0];
        const impact = await handlers.get("stud-workflow-blocker-impact")(trusted, {workflowId: blocked.data.id, blockerId: blocker.id});
        check("IMPACT_QUERY_IS_WORKFLOW_SCOPED", () => assert.ok(impact.ok && impact.data.directNode.id === first.id && impact.data.affected.every(item => item.workflowId === undefined || item.workflowId === blocked.data.id)));
        const bypass = await handlers.get("stud-workflow-node-transition")(trusted, {workflowId: blocked.data.id, nodeId: first.id, action: "START", expectedWorkflowVersion: blocked.data.rowVersion, expectedNodeVersion: blocked.data.graph.nodes[0].rowVersion});
        check("RENDERER_CANNOT_BYPASS_OPEN_BLOCKER", () => assert.strictEqual(bypass.code, "INVALID_TRANSITION"));

        const updated = await handlers.get("stud-workflow-blocker-update")(trusted, {workflowId: blocked.data.id, blockerId: blocker.id, blockerType: "WAITING_FEEDBACK", title: "Awaiting reviewed data", expectedWorkflowVersion: blocked.data.rowVersion, expectedBlockerVersion: blocker.rowVersion});
        check("BLOCKER_UPDATE_IS_OPTIMISTIC_AND_TYPED", () => assert.ok(updated.ok && updated.data.conditions.blockers[0].blockerType === "WAITING_FEEDBACK"));
        const stale = await handlers.get("stud-workflow-blocker-resolve")(trusted, {workflowId: updated.data.id, blockerId: blocker.id, expectedWorkflowVersion: updated.data.rowVersion, expectedBlockerVersion: blocker.rowVersion});
        check("STALE_BLOCKER_WRITE_IS_REJECTED", () => assert.strictEqual(stale.code, "STALE_BLOCKER_VERSION"));
        const currentBlocker = updated.data.conditions.blockers[0];
        const resolved = await handlers.get("stud-workflow-blocker-resolve")(trusted, {workflowId: updated.data.id, blockerId: currentBlocker.id, note: "Data supplied explicitly.", expectedWorkflowVersion: updated.data.rowVersion, expectedBlockerVersion: currentBlocker.rowVersion});
        check("EXPLICIT_RESOLUTION_RECOMPUTES_WITHOUT_STARTING", () => assert.ok(resolved.ok && resolved.data.graph.nodes[0].displayState === "READY" && resolved.data.graph.nodes[0].state === "NOT_STARTED"));

        const checkpointCreated = await handlers.get("stud-workflow-checkpoint-create")(trusted, {workflowId: resolved.data.id, nodeId: first.id, title: "Review the supplied data", expectedWorkflowVersion: resolved.data.rowVersion});
        const checkpoint = checkpointCreated.data.conditions.checkpoints[0];
        check("PENDING_CHECKPOINT_REQUIRES_HUMAN_INPUT", () => assert.ok(checkpointCreated.ok && checkpointCreated.data.graph.nodes[0].availability === "HUMAN_INPUT_REQUIRED"));
        const approved = await handlers.get("stud-workflow-checkpoint-decide")(trusted, {workflowId: checkpointCreated.data.id, checkpointId: checkpoint.id, decision: "APPROVE", note: "Reviewed by the student.", expectedWorkflowVersion: checkpointCreated.data.rowVersion, expectedCheckpointVersion: checkpoint.rowVersion});
        check("EXPLICIT_CHECKPOINT_APPROVAL_DOES_NOT_COMPLETE_WORK", () => assert.ok(approved.ok && approved.data.graph.nodes[0].state === "NOT_STARTED" && approved.data.graph.nodes[0].displayState === "READY"));
        const conditions = await handlers.get("stud-workflow-conditions")(trusted, {workflowId: approved.data.id});
        check("CONDITION_HISTORY_REMAINS_QUERYABLE", () => assert.ok(conditions.ok && conditions.data.conditions.blockers[0].status === "RESOLVED" && conditions.data.conditions.checkpoints[0].status === "APPROVED"));

        const preload = fs.readFileSync(path.join(__dirname, "../src/preload.js"), "utf8");
        check("PRELOAD_HAS_FIXED_CHANNELS_WITHOUT_GENERIC_ESCAPE_HATCH", () => expected.forEach(channel => assert.ok(preload.includes(`\"${channel}\"`))));
        console.log(`STUD_WORKFLOW_CONDITIONS_IPC: PASS (${passed} checks)`);
    } finally { registration.dispose(); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; }).finally(() => fs.rmSync(root, {recursive: true, force: true}));
