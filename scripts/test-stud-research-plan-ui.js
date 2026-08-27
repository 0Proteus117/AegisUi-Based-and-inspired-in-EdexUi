#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "src/ui.html"), "utf8");
const assignment = fs.readFileSync(path.join(root, "src/classes/workspaces/studAssignmentWorkspace.class.js"), "utf8");
const workspace = fs.readFileSync(path.join(root, "src/classes/workspaces/studResearchPlanWorkspace.class.js"), "utf8");
const css = fs.readFileSync(path.join(root, "src/assets/css/workspaces.css"), "utf8");
const preload = fs.readFileSync(path.join(root, "src/preload.js"), "utf8");
let passed = 0;
function check(name, value) { assert.ok(value, name); passed += 1; console.log(`${name}: PASS`); }
check("M7_WORKSPACE_LOADS_BEFORE_ASSIGNMENT_WORKSPACE", ui.indexOf("studResearchPlanWorkspace.class.js") > 0 && ui.indexOf("studResearchPlanWorkspace.class.js") < ui.indexOf("studAssignmentWorkspace.class.js"));
check("ASSIGNMENT_WORKSPACE_HAS_CONTEXTUAL_RESEARCH_PLAN_ACCESS", assignment.includes('data-stud-workspace-mode="RESEARCH_PLAN"'));
check("RESEARCH_SURFACE_HAS_NO_AUTOMATIC_PROVIDER_OR_AI_CHANNEL", !workspace.includes('request("stud-research-search"') && !workspace.includes('request("stud-ai-') && !workspace.includes('request("stud-moodle-'));
check("DOSSIER_REUSES_M5_PREVIEW_HANDOFF", workspace.includes('this.parent.openObject(material.type,material.id'));
check("DRAFT_REVIEW_SUPPORTS_TOPIC_AND_QUESTION_CORRECTION", workspace.includes("data-stud-research-topic-update") && workspace.includes("data-stud-research-question-update") && workspace.includes("requirementItemIds"));
check("COVERAGE_EXPLICITLY_REJECTS_FAKE_PERCENTAGE", workspace.includes("NO PERCENTAGE IS INFERRED"));
check("RESPONSIVE_M7_LAYOUT_EXISTS", css.includes(".stud-research-plan-body") && css.includes("@media (max-width: 960px)"));
check("PRELOAD_EXPOSES_ONLY_NAMED_M7_CHANNELS", preload.includes('"stud-research-plan-state"') && !preload.includes("invokeAny"));
console.log(`STUD M7 UI CONTRACT TESTS: ${passed} PASSED`);
