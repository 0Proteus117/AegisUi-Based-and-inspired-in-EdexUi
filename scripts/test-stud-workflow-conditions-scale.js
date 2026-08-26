#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {performance} = require("perf_hooks");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService} = require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudWorkflowService} = require("../src/classes/workspaces/studWorkflowService.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m4-scale-"));
const open = () => {
    const store = new StudAcademicStore({root, applicationVersion: "m4-scale"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    return {store, workflow: new StudWorkflowService({store, requirementsService: requirements, workingContextService: context})};
};
let passed = 0;
const check = (name, operation) => { operation(); passed += 1; console.log(`${name}: PASS`); };

try {
    let {store, workflow} = open();
    const courses = [];
    for (let index = 0; index < 100; index += 1) courses.push(store.createEntity("COURSE", {title: `Synthetic course ${String(index + 1).padStart(3, "0")}`, code: `SYN${index + 1}`}));
    const assignments = [];
    for (let index = 0; index < 1000; index += 1) assignments.push(store.createEntity("ASSIGNMENT", {courseId: courses[index % courses.length].id, title: `Synthetic assignment ${String(index + 1).padStart(4, "0")}`}));

    const templates = ["STANDARD_WRITTEN_COURSEWORK", "TECHNICAL_ENGINEERING", "EXAM_PREPARATION", "GROUP_PROJECT", "GENERIC_MANUAL"];
    const workflows = [];
    const buildStarted = performance.now();
    for (let index = 0; index < 300; index += 1) {
        let value = workflow.create({assignmentId: assignments[index].id, templateKey: templates[index % templates.length], allowNoContract: true, noContractReason: "Synthetic bounded scale fixture."});
        const first = value.graph.nodes[0];
        const second = value.graph.nodes[1] || first;
        value = workflow.createBlocker({workflowId: value.id, nodeId: first.id, blockerType: index % 2 ? "WAITING_DATA" : "WAITING_FEEDBACK", title: `Scale blocker A ${index}`, expectedWorkflowVersion: value.rowVersion});
        value = workflow.createBlocker({workflowId: value.id, nodeId: first.id, blockerType: "WAITING_RESOURCE", title: `Scale blocker B ${index}`, expectedWorkflowVersion: value.rowVersion});
        value = workflow.createCheckpoint({workflowId: value.id, nodeId: second.id, title: `Scale checkpoint A ${index}`, expectedWorkflowVersion: value.rowVersion});
        value = workflow.createCheckpoint({workflowId: value.id, nodeId: second.id, title: `Scale checkpoint B ${index}`, expectedWorkflowVersion: value.rowVersion});
        workflows.push(value.id);
    }
    const buildMs = performance.now() - buildStarted;
    const counts = {
        courses: store.db.prepare("SELECT COUNT(*) count FROM stud_courses").get().count,
        assignments: store.db.prepare("SELECT COUNT(*) count FROM stud_assignments").get().count,
        workflows: store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances").get().count,
        nodes: store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_nodes").get().count,
        blockers: store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_blockers").get().count,
        checkpoints: store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_checkpoints").get().count,
        events: store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_events").get().count
    };
    check("BOUNDED_SCALE_DATASET_CREATED", () => {
        assert.deepStrictEqual([counts.courses, counts.assignments, counts.workflows, counts.blockers, counts.checkpoints], [100, 1000, 300, 600, 600]);
        assert.ok(counts.nodes >= 1500 && counts.nodes <= 2400, counts.nodes);
        assert.ok(counts.events >= 1800, counts.events);
    });

    const sampleId = workflows[149];
    let started = performance.now();
    const sample = workflow.read({workflowId: sampleId});
    const readMs = performance.now() - started;
    const blocker = sample.conditions.blockers[0];
    started = performance.now();
    const impact = workflow.blockerImpact({workflowId: sampleId, blockerId: blocker.id});
    const impactMs = performance.now() - started;
    check("SCOPED_READINESS_AND_IMPACT_REMAIN_BOUNDED", () => {
        assert.strictEqual(sample.conditions.blockers.length, 2);
        assert.ok(impact.directNode && impact.affected.length <= sample.graph.nodes.length);
        assert.ok(readMs < 500, `read ${readMs.toFixed(1)}ms`);
        assert.ok(impactMs < 500, `impact ${impactMs.toFixed(1)}ms`);
    });
    check("SCOPED_LOOKUPS_USE_INDEXES", () => {
        const blockerPlan = store.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM stud_workflow_blockers WHERE workflow_id=? ORDER BY created_at").all(sampleId).map(row => row.detail).join(" ");
        const checkpointPlan = store.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM stud_workflow_checkpoints WHERE workflow_id=? ORDER BY created_at").all(sampleId).map(row => row.detail).join(" ");
        assert.match(blockerPlan, /stud_workflow_blockers_workflow_index/);
        assert.match(checkpointPlan, /stud_workflow_checkpoints_workflow_index/);
    });

    store.close();
    started = performance.now();
    ({store, workflow} = open());
    const reopened = workflow.read({workflowId: sampleId});
    const restartReadMs = performance.now() - started;
    check("RESTART_HYDRATION_PRESERVES_BOUNDED_CONDITIONS", () => {
        assert.strictEqual(reopened.conditions.blockers.length, 2);
        assert.strictEqual(reopened.conditions.checkpoints.length, 2);
        assert.ok(restartReadMs < 1000, `restart/read ${restartReadMs.toFixed(1)}ms`);
    });
    console.log(`STUD_WORKFLOW_CONDITIONS_SCALE: PASS (${passed} checks; build=${buildMs.toFixed(1)}ms read=${readMs.toFixed(1)}ms impact=${impactMs.toFixed(1)}ms restart=${restartReadMs.toFixed(1)}ms nodes=${counts.nodes} events=${counts.events})`);
    store.close();
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
