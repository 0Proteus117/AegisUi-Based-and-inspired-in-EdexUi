#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m2-ipc-"));
const handlers = new Map();
const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
const disposable = extra => Object.assign({dispose() {}}, extra || {});
const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/src/ui.html"}};
let passed = 0;
const check = (name, operation) => { operation(); passed += 1; console.log(`${name}: PASS`); };

(async () => {
    const store = new StudAcademicStore({root, applicationVersion: "m2-ipc-test"}).initialize();
    const course = store.createEntity("COURSE", {title: "Synthetic course", academicYear: "2025/26", academicTerm: "Term 1"});
    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Synthetic laboratory practical"});
    const registration = Ipc.registerStudAcademicIpc({
        ipc, store, requirementsService: new StudRequirementsContractService({store}),
        researchRuntime: disposable(), lmsRuntime: disposable(), documentRuntime: disposable(), academicAiRuntime: disposable(), notebookRuntime: disposable(),
        computeRuntime: {}, toolCatalog: {}, app: {getVersion: () => "m2-ipc-test", getPath: () => root}
    });
    try {
        check("M2_CHANNELS_ARE_ALLOWLISTED", () => ["stud-working-context-read", "stud-working-context-update", "stud-working-context-clear", "stud-course-organisation", "stud-assessment-classification-list", "stud-assessment-classification-set"].forEach(channel => assert.ok(registration.channels.includes(channel))));
        const update = await handlers.get("stud-working-context-update")(trusted, {courseId: course.id, assignmentId: assignment.id, originSurface: "ASSIGNMENT", userPinned: true});
        check("MAIN_PROCESS_VALIDATES_AND_PERSISTS_CONTEXT", () => assert.ok(update.ok && update.data.activeAssignment.id === assignment.id && update.data.userPinned));
        const malformed = await handlers.get("stud-working-context-update")(trusted, {courseId: course.id, arbitrarySql: "DROP TABLE"});
        check("ARBITRARY_CONTEXT_PAYLOAD_REJECTED", () => assert.strictEqual(malformed.code, "INVALID_INPUT"));
        const classification = await handlers.get("stud-assessment-classification-list")(trusted, {limit: 10});
        check("CLASSIFICATION_IS_LOCAL_READ_ONLY_DERIVATION", () => assert.ok(classification.ok && classification.data[0].classification === "LAB_PRACTICAL"));
        const override = await handlers.get("stud-assessment-classification-set")(trusted, {assignmentId: assignment.id, classification: "COURSEWORK", reason: "Synthetic correction"});
        check("CLASSIFICATION_CORRECTION_IS_TYPED", () => assert.ok(override.ok && override.data.userCorrected));
        const organisation = await handlers.get("stud-course-organisation")(trusted, {limit: 20});
        check("ORGANISATION_IS_BOUNDED_LOCAL_READ", () => assert.ok(organisation.ok && organisation.data.years.length === 1));
        console.log(`STUD_WORKING_CONTEXT_IPC: PASS (${passed} checks)`);
    } finally { registration.dispose(); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; }).finally(() => fs.rmSync(root, {recursive: true, force: true}));
