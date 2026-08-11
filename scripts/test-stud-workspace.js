#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const config = fs.readFileSync(path.join(ROOT, "src/config/workspaces.config.js"), "utf8");
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const commandCenter = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studCommandCenter.class.js"), "utf8");
const research = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studResearchWorkspace.class.js"), "utf8");
const moodle = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studMoodleWorkspace.class.js"), "utf8");
const revision = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studRevisionWorkspace.class.js"), "utf8");
const documents = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studDocumentWorkspace.class.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
const theme = fs.readFileSync(path.join(ROOT, "src/assets/css/aegis_theme.css"), "utf8");
const multithread = fs.readFileSync(path.join(ROOT, "src/_multithread.js"), "utf8");
const files = [
    "src/classes/workspaces/studAcademicModel.class.js",
    "src/classes/workspaces/studAcademicStore.class.js",
    "src/classes/workspaces/studAcademicIpc.class.js",
    "src/classes/workspaces/studCommandCenter.class.js",
    "src/classes/workspaces/studComputeRuntime.class.js",
    "src/classes/workspaces/studComputeWorkspace.class.js",
    "src/classes/workspaces/studDocumentRuntime.class.js",
    "src/classes/workspaces/studDocumentWorkspace.class.js",
    "src/classes/workspaces/studResearchModel.class.js",
    "src/classes/workspaces/studResearchRuntime.class.js",
    "src/classes/workspaces/studResearchWorkspace.class.js",
    "src/classes/workspaces/studLmsModel.class.js",
    "src/classes/workspaces/studCredentialVault.class.js",
    "src/classes/workspaces/studMoodleAdapter.class.js",
    "src/classes/workspaces/studLmsRuntime.class.js",
    "src/classes/workspaces/studMoodleWorkspace.class.js",
    "src/classes/workspaces/studAcademicOrchestration.class.js",
    "src/classes/workspaces/studRevisionPlanner.class.js",
    "src/classes/workspaces/studRevisionWorkspace.class.js",
    "scripts/test-stud-moodle-integration.js",
    "scripts/test-stud-academic-orchestration.js",
    "scripts/validate-stud-phase4-live.js",
    "scripts/validate-stud-phase5-live.js",
    "scripts/test-stud-academic-core.js",
    "scripts/test-stud-revision-planning.js",
    "scripts/test-stud-engineering-compute.js",
    "scripts/test-stud-document-intelligence.js"
];

const checks = {
    STUD_ACTIVE_WORKSPACE: config.includes('id: "student"') && config.includes('navigationLabel: "STUD"') && config.includes('implementation: "student command center · local first"'),
    STUD_RENDERER_OWNS_NO_SQLITE: manager.includes("renderStudent(view, definition)") && !manager.includes("node:sqlite") && fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8").includes("studCommandCenter.class.js"),
    STUD_MAIN_PROCESS_BOUNDARY: multithread.includes("registerStudAcademicIpc") && multithread.includes("STUD persistence is a bounded main-process service"),
    STUD_COMMAND_CENTER_ACTIVE_SCREENS: commandCenter.includes("STUDENT COMMAND CENTER") && commandCenter.includes('"OVERVIEW", "MODULES", "ASSIGNMENTS", "REVISION", "RESEARCH", "DOCUMENTS", "NOTES", "TOOLS", "SERVICES", "MOODLE"'),
    STUD_FORMS_AND_PROVENANCE: commandCenter.includes("CREATE MODULE") && commandCenter.includes("CREATE ASSIGNMENT") && commandCenter.includes("PROVENANCE") && commandCenter.includes("LOCAL SEARCH"),
    STUD_CALENDAR_EMAIL_REFERENCE_ONLY: commandCenter.includes("EXPLICIT ONLY") && commandCenter.includes("STUD DOES NOT SCAN, OPEN OR COPY EXTERNAL CONTENT") && commandCenter.includes("STUD does not scan mailboxes, copy message bodies or send mail"),
    STUD_ORCHESTRATION_EXPLICIT: commandCenter.includes("ACADEMIC CONTEXT") && commandCenter.includes("FIND RELATED CALENDAR") && commandCenter.includes("FIND RELATED EMAIL") && commandCenter.includes("USER OVERRIDE") && !commandCenter.includes("calendar-events"),
    STUD_DARK_LIGHT_SAFE_TOKENS: css.includes("stud-command-center-grid") && css.includes(".stud-command-center-deck .aegis-input:focus") && css.includes("@media (max-width: 1230px)") && theme.includes("STUD Phase 2 keeps the Command Center semantic"),
    STUD_PROVIDER_RUNTIME_EXPLICIT: research.includes("stud-research-search") && research.includes("EPHEMERAL SEARCH") && !manager.includes("stud-fetch") && !multithread.includes("stud-network"),
    STUD_MOODLE_IS_EXPLICIT_READ_ONLY: moodle.includes("CAPABILITY PROBE") && moodle.includes("SYNC MOODLE") && moodle.includes("READ-ONLY POLICY") && moodle.includes("POLICY_DISABLED") && !moodle.includes("SUBMIT ASSIGNMENT"),
    STUD_MOODLE_LAYOUT_IS_RESPONSIVE: css.includes("stud-moodle-control-grid") && css.includes("stud-moodle-capability-grid") && css.includes("stud-moodle-data-grid"),
    STUD_REVISION_LOCAL_FIRST: revision.includes("TODAY / STUDY PLAN") && revision.includes("START STUDY SESSION") && revision.includes("LOCAL / EXPLICIT") && !revision.includes("fetch(") && !revision.includes("localStorage"),
    STUD_COMPUTE_TYPED_LOCAL_BOUNDARY: commandCenter.includes("StudComputeWorkspace") && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studComputeRuntime.class.js"), "utf8").includes("AEGIS_BOUNDED_LOCAL_COMPUTE"),
    STUD_DOCUMENT_TYPED_LOCAL_BOUNDARY: commandCenter.includes("StudDocumentWorkspace") && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studDocumentRuntime.class.js"), "utf8").includes("PDFJS_BUILT_IN") && !fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studDocumentRuntime.class.js"), "utf8").includes("fetch(") && documents.includes("sourceResourceId") && documents.includes("Associations are optional and explicit"),
    STUD_FILES_PRESENT: files.every(file => fs.existsSync(path.join(ROOT, file)))
};

Object.entries(checks).forEach(([name, value]) => {
    console.log(`${name}: ${value ? "PASS" : "FAIL"}`);
    assert.ok(value, name);
});
console.log("STUD_WORKSPACE: PASS");
