#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m7-ipc-"));
const handlers = new Map();
const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
const disposable = extra => Object.assign({dispose() {}}, extra || {});
const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/src/ui.html"}};
const untrusted = {sender: {isDestroyed: () => false, getURL: () => "https://evil.example/"}};
let passed = 0;
function check(name, operation) { operation(); passed += 1; console.log(`${name}: PASS`); }

(async () => {
    const store = new StudAcademicStore({root, applicationVersion: "m7-ipc"}).initialize();
    const registration = Ipc.registerStudAcademicIpc({ipc, store, app: {getVersion: () => "m7-ipc", getPath: () => root}, researchRuntime: disposable(), lmsRuntime: disposable(), documentRuntime: disposable(), academicAiRuntime: disposable(), notebookRuntime: disposable(), computeRuntime: {}, toolCatalog: {}});
    try {
        const expected = ["stud-research-plan-state", "stud-research-plan-create-draft", "stud-research-plan-update-topic", "stud-research-plan-review", "stud-topic-dossier-list", "stud-topic-dossier-add", "stud-topic-dossier-update", "stud-research-gap-add", "stud-research-gap-resolve", "stud-research-coverage"];
        check("M7_TYPED_CHANNELS_REGISTERED", () => expected.forEach(channel => assert.ok(registration.channels.includes(channel) && handlers.has(channel), channel)));
        check("NO_GENERIC_RESEARCH_PERSIST_OR_PROVIDER_CHANNEL", () => assert.ok(!registration.channels.some(channel => /research-(?:invoke|persist|provider|network|sql|log)/i.test(channel))));
        let response = await handlers.get("stud-research-plan-state")(untrusted, {assignmentId: "stud_assignment_invalid"});
        check("UNTRUSTED_SENDER_REJECTED", () => assert.strictEqual(response.code, "POLICY_BLOCKED"));
        response = await handlers.get("stud-research-plan-state")(trusted, {assignmentId: "bad;DROP TABLE stud_assignments"});
        check("INVALID_ID_REJECTED_IN_MAIN", () => assert.strictEqual(response.code, "INVALID_INPUT"));
        response = await handlers.get("stud-research-plan-state")(trusted, {assignmentId: "stud_assignment_valid", arbitrarySql: "SELECT *"});
        check("ARBITRARY_PAYLOAD_KEY_REJECTED", () => assert.strictEqual(response.code, "INVALID_INPUT"));
        response = await handlers.get("stud-research-plan-create-draft")(trusted, {assignmentId: "stud_assignment_valid", origin: "AI_ASSISTED"});
        check("RENDERER_CANNOT_FORGE_PLAN_ORIGIN", () => assert.strictEqual(response.code, "INVALID_INPUT"));
        response = await handlers.get("stud-topic-dossier-add")(trusted, {planId: "stud_research_plan_valid", topicId: "stud_research_topic_valid", canonicalObjectType: "NOTE", canonicalObjectId: "stud_note_valid", membershipOrigin: "SYSTEM_SUGGESTED"});
        check("RENDERER_CANNOT_FORGE_DOSSIER_ORIGIN", () => assert.strictEqual(response.code, "INVALID_INPUT"));
        console.log(`STUD M7 IPC TESTS: ${passed} PASSED`);
    } finally { registration.dispose(); store.close(); fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
