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
const {StudArtifactOperationsService} = require("../src/classes/workspaces/studArtifactOperationsService.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m6-scale-"));
function elapsed(start) { return Number((performance.now() - start).toFixed(1)); }
function services() {
    const store = new StudAcademicStore({root, applicationVersion: "m6-scale"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    const workflow = new StudWorkflowService({store, requirementsService: requirements, workingContextService: context});
    return {store, workflow, operations: new StudArtifactOperationsService({store, workflowService: workflow, workingContextService: context})};
}
try {
    let {store, workflow, operations} = services();
    const started = performance.now(); const assignments = []; const workflows = [];
    for (let c = 0; c < 100; c += 1) {
        const course = store.createEntity("COURSE", {title: `Synthetic scale course ${c + 1}`});
        for (let a = 0; a < 10; a += 1) {
            const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: `Synthetic assignment ${c + 1}.${a + 1}`}); assignments.push(assignment);
            if (assignments.length <= 300) workflows.push(workflow.create({assignmentId: assignment.id, templateKey: "GENERIC_MANUAL", allowNoContract: true, noContractReason: "Synthetic M6 scale fixture."}));
            for (let n = 0; n < 5; n += 1) {
                const note = store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: `Artifact ${n + 1} for ${assignment.title}`, content: "Synthetic bounded scale content."});
                operations.registerArtifact({assignmentId: assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: note.id, artifactType: n === 0 ? "DRAFT_VERSION" : "NOTE", origin: "USER_CREATED"});
            }
        }
    }
    for (let index = 0; index < 500; index += 1) {
        const assignment = assignments[index % assignments.length]; const flow = index < workflows.length ? workflows[index] : null;
        const run = operations.createRun({assignmentId: assignment.id, workflowId: flow && flow.id || null, workflowNodeId: flow && flow.graph.nodes[0].id || null, operationType: "SCALE_VALIDATION", progressMode: index % 2 ? "INDETERMINATE" : "DETERMINATE", progressCurrent: index % 2 ? null : 0, progressTotal: index % 2 ? null : 40, progressUnit: index % 2 ? null : "items"});
        store.transaction(() => { for (let event = 1; event < 40; event += 1) operations.appendEvent({assignmentId: assignment.id, workflowId: flow && flow.id || null, workflowNodeId: flow && flow.graph.nodes[0].id || null, runId: run.id, eventType: "STAGE_ENTERED", actor: "SYSTEM", severity: "INFO", summary: `Synthetic bounded event ${event}`, payload: {step: event}}); });
    }
    const populatedMs = elapsed(started);
    const counts = {
        courses: store.db.prepare("SELECT COUNT(*) count FROM stud_courses").get().count,
        assignments: store.db.prepare("SELECT COUNT(*) count FROM stud_assignments").get().count,
        workflows: store.db.prepare("SELECT COUNT(*) count FROM stud_workflow_instances").get().count,
        artifacts: store.db.prepare("SELECT COUNT(*) count FROM stud_assignment_artifacts").get().count,
        runs: store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,
        events: store.db.prepare("SELECT COUNT(*) count FROM stud_operation_events").get().count
    };
    assert.deepStrictEqual(counts, {courses: 100, assignments: 1000, workflows: 300, artifacts: 5000, runs: 500, events: 25000});
    const target = assignments[0];
    let t = performance.now(); const initial = operations.listArtifacts({assignmentId: target.id, limit: 50}); const artifactMs = elapsed(t);
    t = performance.now(); const filtered = operations.listArtifacts({assignmentId: target.id, artifactType: "DRAFT_VERSION", limit: 50}); const filteredMs = elapsed(t);
    t = performance.now(); const current = operations.missionState({assignmentId: target.id, historyLimit: 20, artifactLimit: 30}); const missionMs = elapsed(t);
    const run = current.activeRuns[0];
    t = performance.now(); const history = operations.runs({assignmentId: target.id, limit: 25}); const historyMs = elapsed(t);
    t = performance.now(); const events = operations.events({assignmentId: target.id, runId: run.id, limit: 50}); const eventMs = elapsed(t);
    t = performance.now(); const nextPage = operations.events({assignmentId: target.id, runId: run.id, beforeSequence: events[events.length - 1].eventSequence, limit: 50}); const pageMs = elapsed(t);
    assert.strictEqual(initial.length, 5); assert.strictEqual(filtered.length, 1); assert.ok(current.activeRuns.length >= 1); assert.ok(history.length >= 1); assert.strictEqual(events.length, 40); assert.strictEqual(nextPage.length, 0);
    const plan = store.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM stud_operation_events WHERE assignment_id=? AND run_id=? ORDER BY event_sequence DESC LIMIT 50").all(target.id, run.id).map(item => item.detail).join(" ");
    assert.match(plan, /INDEX/i);
    store.close();
    t = performance.now(); ({store, workflow, operations} = services()); const restartMs = elapsed(t);
    t = performance.now(); const restored = operations.missionState({assignmentId: target.id, historyLimit: 20, artifactLimit: 30}); const hydrateMs = elapsed(t);
    assert.strictEqual(restored.artifacts.length, 5); assert.ok(restored.activeRuns.length >= 1);
    store.close();
    console.log(`STUD_ARTIFACT_MISSION_CONTROL_SCALE: PASS ${JSON.stringify({counts,populatedMs,artifactMs,filteredMs,missionMs,historyMs,eventMs,pageMs,restartMs,hydrateMs})}`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
