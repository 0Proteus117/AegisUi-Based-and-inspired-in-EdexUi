#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {performance} = require("perf_hooks");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkflowService} = require("../src/classes/workspaces/studWorkflowService.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m3-scale-"));
try {
    const store = new StudAcademicStore({root, applicationVersion: "m3-scale-test"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const workflow = new StudWorkflowService({store, requirementsService: requirements});
    const courses = [];
    for (let index = 0; index < 100; index += 1) courses.push(store.createEntity("COURSE", {title: `Synthetic course ${index}`, code: `SYN${String(index).padStart(3, "0")}`, academicYear: index < 60 ? "2026/27" : "2025/26", academicTerm: `Term ${(index % 3) + 1}`}));
    const assignments = [];
    const started = performance.now();
    for (let index = 0; index < 1000; index += 1) {
        const assignment = store.createEntity("ASSIGNMENT", {courseId: courses[index % courses.length].id, title: `Synthetic assessment ${index}`});
        assignments.push(assignment);
        if (index < 300) workflow.create({assignmentId: assignment.id, templateKey: index % 5 === 0 ? "TECHNICAL_ENGINEERING" : "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Synthetic bounded-scale fixture."});
    }
    const populationMs = performance.now() - started;
    const nodeCount = store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_nodes").get().count;
    const edgeCount = store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_edges").get().count;
    const eventCount = store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_events").get().count;
    assert.strictEqual(courses.length, 100);
    assert.strictEqual(assignments.length, 1000);
    assert.strictEqual(store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances").get().count, 300);
    assert.ok(nodeCount >= 1500 && edgeCount >= 1200 && eventCount >= 600);

    const queryStarted = performance.now();
    const selected = workflow.assignmentState({assignmentId: assignments[250].id, historyLimit: 25});
    const scopedQueryMs = performance.now() - queryStarted;
    assert.ok(selected.current && selected.current.graph.nodes.length <= 40);
    assert.ok(scopedQueryMs < 500, `Scoped workflow query took ${scopedQueryMs.toFixed(1)}ms`);

    const noWorkflowStarted = performance.now();
    const empty = workflow.assignmentState({assignmentId: assignments[900].id, historyLimit: 25});
    const noWorkflowQueryMs = performance.now() - noWorkflowStarted;
    assert.strictEqual(empty.current, null);
    assert.ok(empty.setup.templates.length === 5 && noWorkflowQueryMs < 500);

    console.log(`STUD_WORKFLOW_SCALE: PASS (100 courses, 1000 assignments, 300 workflows, ${nodeCount} nodes, ${edgeCount} edges, ${eventCount} events; populate ${populationMs.toFixed(1)}ms; scoped ${scopedQueryMs.toFixed(1)}ms; empty ${noWorkflowQueryMs.toFixed(1)}ms)`);
    store.close();
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
