#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {StudMissionControlWorkspace} = require("../src/classes/workspaces/studMissionControlWorkspace.class.js");

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`${name}: PASS`); }
const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character]));
const assignment = {id: "stud_assignment_synthetic", title: "Synthetic multidisciplinary Assignment"};
const workflow = {id: "stud_workflow_synthetic", graph: {nodes: [
    {id: "stud_workflow_node_research", title: "Research", state: "IN_PROGRESS", displayState: "IN_PROGRESS", availability: "AVAILABLE", directBlockers: [], gateCheckpoints: []},
    {id: "stud_workflow_node_analysis", title: "Analysis", state: "NOT_STARTED", displayState: "DIRECT_BLOCKER", availability: "DIRECT_BLOCKER", directBlockers: [{title: "Awaiting real dataset"}], gateCheckpoints: []},
    {id: "stud_workflow_node_review", title: "Human review", state: "NOT_STARTED", displayState: "HUMAN_INPUT_REQUIRED", availability: "HUMAN_INPUT_REQUIRED", directBlockers: [], gateCheckpoints: [{title: "Approve source selection"}]}
]}};
const artifact = {id: "stud_artifact_one", assignmentId: assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: "stud_note_one", artifactType: "NOTE", label: "Synthetic research note", lifecycle: "ACTIVE", origin: "USER_CREATED", producer: "USER", availabilityState: "AVAILABLE", rowVersion: 1, createdAt: "2026-08-26T10:00:00.000Z"};
const determinate = {id: "stud_operation_run_one", assignmentId: assignment.id, workflowId: workflow.id, workflowNodeId: workflow.graph.nodes[0].id, operationType: "DOCUMENT_INDEX", state: "RUNNING", actor: "SYSTEM", progressMode: "DETERMINATE", progressCurrent: 17, progressTotal: 42, progressUnit: "documents", statusSummary: "Indexed 17 / 42 documents", createdAt: "2026-08-26T10:00:00.000Z", startedAt: "2026-08-26T10:00:01.000Z", canPause: false, canCancel: false};
const indeterminate = {...determinate, id: "stud_operation_run_two", operationType: "LOCAL_EXTRACTION", progressMode: "INDETERMINATE", progressCurrent: null, progressTotal: null, progressUnit: null, statusSummary: "Inspecting a bounded local extraction"};
const failed = {...determinate, id: "stud_operation_run_three", state: "FAILED", operationType: "COMPUTE", progressMode: "NONE", progressCurrent: null, progressTotal: null, progressUnit: null, statusSummary: "Compute failed", errorSummary: "Synthetic dimensional mismatch", finishedAt: "2026-08-26T10:01:00.000Z"};
const events = [{id: "stud_operation_event_one", eventType: "OPERATION_STARTED", severity: "INFO", summary: "Started bounded document index", createdAt: "2026-08-26T10:00:01.000Z", artifactIds: []}, {id: "stud_operation_event_two", eventType: "DOCUMENT_INDEXED", severity: "NOTICE", summary: "Indexed 17 / 42 documents", createdAt: "2026-08-26T10:00:20.000Z", artifactIds: [artifact.id]}];
const commandCenter = {view: {}, render() {}, state: {workingContext: null}};
const assignmentWorkspace = {parent: commandCenter, assignment: () => assignment, activeObject: () => ({id: "stud_note_one", entityType: "NOTE", title: "Synthetic research note"}), workflow: () => workflow, selectedNode: () => workflow.graph.nodes[0], openObject: async () => {}};
const request = async (channel, payload) => {
    if (channel === "stud-mission-control-state") return {assignment, activeRuns: [], recentRuns: [], artifacts: [], workflow, resting: true};
    if (channel === "stud-operation-events") return events;
    if (channel === "stud-artifact-relationships") return [];
    if (channel === "stud-artifact-register") return {created: true, artifact};
    throw new Error(`Unexpected ${channel}`);
};
const view = new StudMissionControlWorkspace({request, escape: esc, parent: assignmentWorkspace});

check("RESTING_STATE_IS_CALM_AND_TRUTHFUL", () => {
    view.state.mode = "MISSION"; view.state.mission = {assignment, activeRuns: [], recentRuns: [], artifacts: [], workflow, resting: true};
    const html = view.render(); assert.match(html, /Nothing is running/); assert.match(html, /NO OPERATION HISTORY/); assert.ok(!/% complete|token|throughput|ETA|PAUSE|CANCEL/i.test(html));
});
check("ACTIVE_DETERMINATE_RUN_SHOWS_DEFENSIBLE_COUNTS", () => {
    view.state.mission = {assignment, activeRuns: [determinate], recentRuns: [determinate], artifacts: [artifact], workflow, resting: false}; view.state.selectedRunId = determinate.id; view.state.events = events;
    const html = view.render(); assert.match(html, /17<\/strong> \/ 42 documents/); assert.match(html, /value="17"/); assert.match(html, /DOCUMENT INDEXED/); assert.ok(!/\bETA\b|63%/i.test(html)); assert.ok(!/<button[^>]*>[^<]*(?:PAUSE|CANCEL)/i.test(html));
});
check("INDETERMINATE_RUN_HAS_NO_PERCENTAGE", () => {
    view.state.mission = {assignment, activeRuns: [indeterminate], recentRuns: [indeterminate], artifacts: [], workflow, resting: false}; view.state.selectedRunId = indeterminate.id; view.state.events = [];
    const html = view.render(); assert.match(html, /TOTAL UNKNOWN/); assert.ok(!/<progress|%/i.test(html));
});
check("FAILED_HISTORICAL_RUN_RETAINS_ERROR", () => {
    view.state.mission = {assignment, activeRuns: [], recentRuns: [failed], artifacts: [], workflow, resting: true}; view.state.selectedRunId = failed.id;
    const html = view.render(); assert.match(html, /MISSION CONTROL · HISTORY/); assert.match(html, /Synthetic dimensional mismatch/); assert.match(html, /FAILED/);
});
check("M4_BLOCKER_AND_HUMAN_INPUT_REMAIN_VISIBLE", () => {
    const blockedRun = {...determinate, workflowNodeId: workflow.graph.nodes[1].id}; view.state.mission = {assignment, activeRuns: [blockedRun], recentRuns: [blockedRun], artifacts: [], workflow, resting: false}; view.state.selectedRunId = blockedRun.id;
    assert.match(view.render(), /Awaiting real dataset/);
    const reviewRun = {...determinate, id: "stud_operation_run_review", workflowNodeId: workflow.graph.nodes[2].id}; view.state.mission = {assignment, activeRuns: [reviewRun], recentRuns: [reviewRun], artifacts: [], workflow, resting: false}; view.state.selectedRunId = reviewRun.id;
    assert.match(view.render(), /Approve source selection/);
});
check("ARTIFACT_BAY_IS_GROUPED_NOT_A_FILESYSTEM", () => {
    view.state.mode = "ARTIFACTS"; view.state.mission = {assignment, activeRuns: [], recentRuns: [], artifacts: [artifact], workflow, resting: true}; view.state.selectedArtifactId = artifact.id; view.state.relationships = [];
    const html = view.render(); assert.match(html, /What exists/); assert.match(html, /Synthetic research note/); assert.match(html, /CANONICAL OBJECT/); assert.ok(!/\/Users\/|file:\/\//.test(html));
});
check("EMPTY_ARTIFACT_BAY_DOES_NOT_SCAN_OR_INFER", () => {
    view.state.mission = {assignment, activeRuns: [], recentRuns: [], artifacts: [], workflow, resting: true}; const html = view.render(); assert.match(html, /ARTIFACT BAY IS EMPTY/); assert.match(html, /Nothing is scanned, imported or inferred/);
});
check("UI_SOURCE_HAS_NO_FAKE_ACTIVITY_TIMER", () => {
    const source = fs.readFileSync(path.join(__dirname, "../src/classes/workspaces/studMissionControlWorkspace.class.js"), "utf8");
    assert.ok(!/setInterval|requestAnimationFrame|Math\.random/.test(source));
});
check("M5_NORMAL_LOAD_DOES_NOT_HYDRATE_M6_HISTORY", () => {
    const source = fs.readFileSync(path.join(__dirname, "../src/classes/workspaces/studAssignmentWorkspace.class.js"), "utf8");
    const setState = source.slice(source.indexOf("setState("), source.indexOf("assignment()"));
    assert.ok(!setState.includes("stud-mission-control-state")); assert.ok(source.includes("data-stud-workspace-mode=\"ARTIFACTS\"")); assert.ok(source.includes("data-stud-workspace-mode=\"MISSION\""));
});
check("PREVIEW_HANDOFF_REUSES_M5_CANONICAL_OPEN", () => {
    const source = fs.readFileSync(path.join(__dirname, "../src/classes/workspaces/studMissionControlWorkspace.class.js"), "utf8");
    assert.match(source, /parent\.openObject\(artifact\.canonicalObjectType, artifact\.canonicalObjectId/); assert.ok(!/window\.open|fetch\(/.test(source));
});
console.log(`STUD_MISSION_CONTROL_WORKSPACE: PASS (${passed} checks)`);
