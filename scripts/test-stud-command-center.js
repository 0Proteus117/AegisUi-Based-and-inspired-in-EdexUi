#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Model = require("../src/classes/workspaces/studAcademicModel.class.js");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");

const ROOT = path.resolve(__dirname, "..");
const commandCenter = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studCommandCenter.class.js"), "utf8");
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const ipc = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
const theme = fs.readFileSync(path.join(ROOT, "src/assets/css/aegis_theme.css"), "utf8");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase2-"));
const store = new StudAcademicStore({root, applicationVersion: "test"});
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); console.log(`${name}: PASS`); };

try {
    store.initialize();
    const course = store.createEntity("COURSE", {title: "Synthetic Engineering Methods", code: "SYN201", status: "ACTIVE"});
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const distant = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const urgent = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Known deadline", dueDate: tomorrow, status: "NOT_STARTED", localProgress: 0});
    const manual = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Manual priority", dueDate: distant, status: "IN_PROGRESS", localProgress: 67, priority: "HIGH"});

    check("SCHEMA_CURRENT_PRIORITY", () => assert.strictEqual(store.schemaInfo().version, Model.SCHEMA_VERSION));
    check("LOCAL_PROGRESS_NUMERIC_BOUNDED", () => {
        assert.strictEqual(store.getEntity("ASSIGNMENT", manual.id).localProgress, 67);
        assert.throws(() => store.updateEntity("ASSIGNMENT", manual.id, {localProgress: 101}), /between 0 and 100/);
    });
    check("OVERVIEW_DERIVES_LOCAL_PRIORITY", () => {
        const overview = store.getCommandCenter({now: new Date().toISOString(), limit: 20});
        assert.strictEqual(overview.priority.find(item => item.id === urgent.id).priorityPresentation, "URGENT");
        assert.strictEqual(overview.priority.find(item => item.id === manual.id).priorityPresentation, "HIGH");
        assert.ok(overview.moduleStatus.some(item => item.id === course.id));
        assert.ok(overview.upcoming.some(item => item.id === urgent.id));
    });
    check("COURSE_RELATIONS_ARE_CANONICAL", () => {
        const note = store.createEntity("NOTE", {courseId: course.id, title: "Local note", content: "Bounded note."});
        store.createRelationship({fromType: "COURSE", fromId: course.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
        const resource = store.createEntity("RESOURCE", {courseId: course.id, assignmentId: urgent.id, title: "Local resource", type: "REFERENCE"});
        store.createRelationship({fromType: "ASSIGNMENT", fromId: urgent.id, relationType: "HAS_RESOURCE", toType: "RESOURCE", toId: resource.id, source: "USER"});
        const context = store.getCourseContext(course.id, {limit: 20});
        assert.ok(context.assignments.some(item => item.id === urgent.id));
        assert.ok(context.notes.some(item => item.id === note.id));
        assert.ok(context.resources.some(item => item.id === resource.id));
    });
    check("CALENDAR_EMAIL_REFERENCE_IDS_ONLY", () => {
        const calendar = store.linkReference({entityType: "ASSIGNMENT", entityId: urgent.id, kind: "CALENDAR", externalId: "synthetic-event-1"});
        const email = store.linkReference({entityType: "ASSIGNMENT", entityId: urgent.id, kind: "EMAIL", externalId: "synthetic-message-1"});
        const references = store.listReferences("ASSIGNMENT", urgent.id);
        assert.deepStrictEqual(references.map(item => item.kind).sort(), ["CALENDAR", "EMAIL"]);
        assert.strictEqual(references.some(item => "body" in item || "credentials" in item), false);
        assert.throws(() => store.unlinkReference({entityType: "ASSIGNMENT", entityId: urgent.id, identifierId: calendar.identifier.id}), /explicit confirmation/);
        store.unlinkReference({entityType: "ASSIGNMENT", entityId: urgent.id, identifierId: email.identifier.id, confirmation: true});
        assert.strictEqual(store.listReferences("ASSIGNMENT", urgent.id).length, 1);
    });
    check("COMMAND_CENTER_RENDERER_BOUNDARY", () => {
        assert.ok(manager.includes("new StudCommandCenter"));
        assert.ok(commandCenter.includes("STUDENT COMMAND CENTER"));
        assert.ok(commandCenter.includes('"RESEARCH", "NOTES", "SERVICES", "MOODLE"'));
        assert.ok(commandCenter.includes("FTS5 searches only local canonical academic records"));
        assert.ok(commandCenter.includes("STUD DOES NOT SCAN, OPEN OR COPY EXTERNAL CONTENT"));
        assert.ok(!commandCenter.includes("fetch("));
        assert.ok(!commandCenter.includes("localStorage"));
    });
    check("IPC_IS_NARROW_AND_EXPLICIT", () => {
        assert.ok(ipc.includes('"stud-command-center"'));
        assert.ok(ipc.includes('"stud-reference-link"'));
        assert.ok(ipc.includes('"stud-research-search"'));
        assert.ok(ipc.includes('"stud-moodle-probe"'));
        assert.ok(ipc.includes('"stud-moodle-sync"'));
        assert.ok(ipc.includes('"stud-moodle-ics-sync"'));
        assert.ok(!ipc.includes("generic-proxy"));
        assert.ok(!ipc.includes("stud-moodle-request"));
        assert.ok(!ipc.includes("stud-calendar-open"));
        assert.ok(!ipc.includes("stud-email-open"));
    });
    check("COMMAND_CENTER_LAYOUT_THEME_CONTRACT", () => {
        assert.ok(css.includes("stud-command-center-grid"));
        assert.ok(css.includes("stud-overview-grid"));
        assert.ok(css.includes("stud-dialog"));
        assert.ok(css.includes("@media (max-width: 1230px)"));
        assert.ok(theme.includes("STUD Phase 2 keeps the Command Center semantic"));
    });
    console.log(`STUD_COMMAND_CENTER: ${checks.length} checks passed`);
} finally {
    store.close();
    fs.rmSync(root, {recursive: true, force: true});
}
