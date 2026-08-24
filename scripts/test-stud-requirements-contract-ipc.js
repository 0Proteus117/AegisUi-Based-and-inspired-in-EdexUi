#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m1-ipc-"));
const handlers = new Map();
const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
const disposable = extra => Object.assign({dispose() {}}, extra || {});
const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/src/ui.html"}};
const untrusted = {sender: {isDestroyed: () => false, getURL: () => "https://attacker.example/"}};
let passed = 0;
const check = (name, operation) => { operation(); passed += 1; console.log(`${name}: PASS`); };

(async () => {
    const store = new StudAcademicStore({root, applicationVersion: "m1-ipc-test"}).initialize();
    const assignment = store.createEntity("ASSIGNMENT", {title: "Synthetic IPC fixture", description: "Write a 1800 word report using Harvard referencing."});
    const requirementsService = new StudRequirementsContractService({store});
    const registration = Ipc.registerStudAcademicIpc({
        ipc, store, requirementsService,
        researchRuntime: disposable(), lmsRuntime: disposable(), documentRuntime: disposable(), academicAiRuntime: disposable(), notebookRuntime: disposable(),
        computeRuntime: {}, toolCatalog: {}, app: {getVersion: () => "m1-ipc-test", getPath: () => root}
    });
    try {
        check("M1_IPC_CHANNELS_ARE_EXPLICIT", () => {
            ["stud-requirements-state", "stud-requirements-create-draft", "stud-requirements-review-candidate", "stud-requirements-add-manual", "stud-requirements-update-item", "stud-requirements-remove-item", "stud-requirements-create-revision", "stud-requirements-approve", "stud-requirements-source-preview"].forEach(channel => assert.ok(registration.channels.includes(channel)));
            assert.strictEqual(registration.channels.some(channel => /sql|filesystem|proxy|shell|network/i.test(channel)), false);
        });
        const blocked = await handlers.get("stud-requirements-state")(untrusted, {assignmentId: assignment.id});
        check("UNTRUSTED_RENDERER_REJECTED", () => assert.strictEqual(blocked.code, "POLICY_BLOCKED"));
        const unknownField = await handlers.get("stud-requirements-create-draft")(trusted, {assignmentId: assignment.id, lifecycle: "APPROVED"});
        check("RENDERER_CANNOT_SET_LIFECYCLE", () => assert.strictEqual(unknownField.code, "INVALID_INPUT"));
        const created = await handlers.get("stud-requirements-create-draft")(trusted, {assignmentId: assignment.id});
        check("MAIN_PROCESS_CREATES_DRAFT", () => assert.ok(created.ok && created.data.lifecycle === "DRAFT" && created.data.candidates.length));
        const malformed = await handlers.get("stud-requirements-state")(trusted, {assignmentId: "../../etc/passwd"});
        check("MALFORMED_ID_REJECTED", () => assert.strictEqual(malformed.code, "INVALID_INPUT"));
        const candidate = created.data.candidates[0];
        const reviewed = await handlers.get("stud-requirements-review-candidate")(trusted, {contractId: created.data.id, candidateId: candidate.id, disposition: "INCLUDED", expectedVersion: created.data.rowVersion});
        check("TYPED_CANDIDATE_MUTATION", () => assert.ok(reviewed.ok && reviewed.data.rowVersion === created.data.rowVersion + 1));
        const stale = await handlers.get("stud-requirements-review-candidate")(trusted, {contractId: created.data.id, candidateId: created.data.candidates[1].id, disposition: "EXCLUDED", expectedVersion: created.data.rowVersion});
        check("STALE_ASYNC_WRITE_REJECTED", () => assert.strictEqual(stale.code, "STALE_CONTRACT_VERSION"));
        const bypass = await handlers.get("stud-requirements-approve")(trusted, {contractId: reviewed.data.id, expectedVersion: reviewed.data.rowVersion, approveAsIncomplete: true});
        check("MAIN_PROCESS_ENFORCES_COMPLETE_REVIEW", () => assert.strictEqual(bypass.code, "REVIEW_INCOMPLETE"));
        const source = candidate.sources[0];
        const preview = await handlers.get("stud-requirements-source-preview")(trusted, {sourceId: source.id});
        check("SOURCE_PREVIEW_RESOLVES_CANONICAL_RECORD", () => assert.ok(preview.ok && preview.data.source.snapshotHash === source.snapshotHash));
        console.log(`STUD_REQUIREMENTS_CONTRACT_IPC: PASS (${passed} checks)`);
    } finally {
        registration.dispose();
    }
})().catch(error => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
}).finally(() => fs.rmSync(root, {recursive: true, force: true}));
