#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService} = require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudWorkflowService} = require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudArtifactOperationsService} = require("../src/classes/workspaces/studArtifactOperationsService.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m6-ipc-"));
const handlers = new Map();
const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
const disposable = extra => Object.assign({dispose() {}}, extra || {});
const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/src/ui.html"}};
const untrusted = {sender: {isDestroyed: () => false, getURL: () => "https://example.invalid/"}};
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`${name}: PASS`); }

(async () => {
    const store = new StudAcademicStore({root, applicationVersion: "m6-ipc-test"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    const workflow = new StudWorkflowService({store, requirementsService: requirements, workingContextService: context});
    const operations = new StudArtifactOperationsService({store, workflowService: workflow, workingContextService: context});
    const course = store.createEntity("COURSE", {title: "Synthetic operational systems"});
    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Synthetic Mission Control"});
    const note = store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: "Observable note", content: "Synthetic."});
    const registration = Ipc.registerStudAcademicIpc({ipc, store, requirementsService: requirements, workingContextService: context, workflowService: workflow, artifactOperationsService: operations, researchRuntime: disposable(), lmsRuntime: disposable(), documentRuntime: disposable(), academicAiRuntime: disposable(), notebookRuntime: disposable(), computeRuntime: {}, toolCatalog: {}, app: {getVersion: () => "m6-ipc-test", getPath: () => root}});
    try {
        const expected = ["stud-artifact-list", "stud-artifact-read", "stud-artifact-register", "stud-artifact-update", "stud-artifact-relate", "stud-artifact-relationships", "stud-mission-control-state", "stud-operation-list", "stud-operation-read", "stud-operation-events", "stud-operation-artifacts"];
        check("M6_FIXED_CHANNELS_ARE_REGISTERED", () => expected.forEach(channel => assert.ok(registration.channels.includes(channel) && handlers.has(channel), channel)));
        check("NO_RENDERER_EVENT_OR_RUN_MUTATION_CHANNEL", () => {
            ["stud-operation-event-append", "stud-operation-create", "stud-operation-transition", "stud-log-append"].forEach(channel => assert.ok(!registration.channels.includes(channel) && !handlers.has(channel), channel));
        });
        let response = await handlers.get("stud-artifact-register")(untrusted, {assignmentId: assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: note.id});
        check("UNTRUSTED_SENDER_CANNOT_REGISTER_ARTIFACT", () => assert.strictEqual(response.code, "POLICY_BLOCKED"));
        response = await handlers.get("stud-artifact-register")(trusted, {assignmentId: assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: note.id, sql: "DROP TABLE"});
        check("ARBITRARY_ARTIFACT_PAYLOAD_IS_REJECTED", () => assert.strictEqual(response.code, "INVALID_INPUT"));
        const forged = await handlers.get("stud-artifact-register")(trusted, {assignmentId: assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: note.id, origin: "MODEL_GENERATED"});
        check("RENDERER_CANNOT_FORGE_ARTIFACT_ORIGIN", () => assert.strictEqual(forged.code, "INVALID_INPUT"));
        const registered = await handlers.get("stud-artifact-register")(trusted, {assignmentId: assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: note.id});
        check("TYPED_ARTIFACT_REGISTRATION_SUCCEEDS", () => assert.ok(registered.ok && registered.data.created && registered.data.artifact.canonicalObjectId === note.id && registered.data.artifact.origin === "UNKNOWN"));
        const listed = await handlers.get("stud-artifact-list")(trusted, {assignmentId: assignment.id, limit: 10});
        check("ARTIFACT_QUERY_IS_ASSIGNMENT_SCOPED", () => assert.ok(listed.ok && listed.data.length === 1 && listed.data[0].assignmentId === assignment.id));
        const oversized = await handlers.get("stud-artifact-update")(trusted, {assignmentId: assignment.id, artifactId: registered.data.artifact.id, expectedVersion: registered.data.artifact.rowVersion, metadata: {value: "x".repeat(140000)}});
        check("IPC_PAYLOAD_BOUND_PRECEDES_PERSISTENCE", () => assert.strictEqual(oversized.code, "PAYLOAD_TOO_LARGE"));
        const otherAssignment = store.createEntity("ASSIGNMENT", {title: "Other Assignment"});
        const crossRead = await handlers.get("stud-artifact-read")(trusted, {assignmentId: otherAssignment.id, artifactId: registered.data.artifact.id});
        check("ARTIFACT_READ_REAFFIRMS_ASSIGNMENT_SCOPE", () => assert.strictEqual(crossRead.code, "CROSS_ASSIGNMENT_ARTIFACT"));
        const run = operations.createRun({assignmentId: assignment.id, operationType: "SYNTHETIC_VALIDATION", progressMode: "INDETERMINATE"});
        const mission = await handlers.get("stud-mission-control-state")(trusted, {assignmentId: assignment.id});
        check("MISSION_CONTROL_READS_REAL_PERSISTED_RUN", () => assert.ok(mission.ok && mission.data.activeRuns.some(item => item.id === run.id) && mission.data.resting === false));
        const events = await handlers.get("stud-operation-events")(trusted, {assignmentId: assignment.id, runId: run.id, limit: 50});
        check("EVENT_FEED_IS_BOUNDED_AND_RUN_SCOPED", () => assert.ok(events.ok && events.data.length === 1 && events.data[0].runId === run.id));
        const runArtifacts = await handlers.get("stud-operation-artifacts")(trusted, {assignmentId: assignment.id, runId: run.id, limit: 50});
        check("RUN_ARTIFACT_QUERY_IS_FIXED_AND_BOUNDED", () => assert.ok(runArtifacts.ok && Array.isArray(runArtifacts.data)));
        const malformed = await handlers.get("stud-operation-events")(trusted, {assignmentId: assignment.id, runId: run.id, limit: 201});
        check("OVERSIZED_EVENT_PAGE_IS_REJECTED", () => assert.strictEqual(malformed.code, "INVALID_INPUT"));
        const preload = fs.readFileSync(path.join(__dirname, "../src/preload.js"), "utf8");
        check("PRELOAD_ALLOWLIST_HAS_NO_GENERIC_ESCAPE_HATCH", () => {
            expected.forEach(channel => assert.ok(preload.includes(`\"${channel}\"`), channel));
            assert.ok(!preload.includes("stud-operation-event-append")); assert.ok(!preload.includes("invokeAny"));
        });
        console.log(`STUD_ARTIFACT_MISSION_CONTROL_IPC: PASS (${passed} checks)`);
    } finally { registration.dispose(); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; }).finally(() => fs.rmSync(root, {recursive: true, force: true}));
