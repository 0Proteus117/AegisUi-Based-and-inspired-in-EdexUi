#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const config = fs.readFileSync(path.join(ROOT, "src/config/workspaces.config.js"), "utf8");
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const commandCenter = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studCommandCenter.class.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
const theme = fs.readFileSync(path.join(ROOT, "src/assets/css/aegis_theme.css"), "utf8");
const multithread = fs.readFileSync(path.join(ROOT, "src/_multithread.js"), "utf8");
const files = [
    "src/classes/workspaces/studAcademicModel.class.js",
    "src/classes/workspaces/studAcademicStore.class.js",
    "src/classes/workspaces/studAcademicIpc.class.js",
    "src/classes/workspaces/studCommandCenter.class.js",
    "scripts/test-stud-academic-core.js"
];

const checks = {
    STUD_ACTIVE_WORKSPACE: config.includes('id: "student"') && config.includes('navigationLabel: "STUD"') && config.includes('implementation: "student command center · local first"'),
    STUD_RENDERER_OWNS_NO_SQLITE: manager.includes("renderStudent(view, definition)") && !manager.includes("node:sqlite") && fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8").includes("studCommandCenter.class.js"),
    STUD_MAIN_PROCESS_BOUNDARY: multithread.includes("registerStudAcademicIpc") && multithread.includes("STUD persistence is a bounded main-process service"),
    STUD_COMMAND_CENTER_ACTIVE_SCREENS: commandCenter.includes("STUDENT COMMAND CENTER") && commandCenter.includes('"OVERVIEW", "MODULES", "ASSIGNMENTS"') && commandCenter.includes("PHASE 3"),
    STUD_FORMS_AND_PROVENANCE: commandCenter.includes("CREATE MODULE") && commandCenter.includes("CREATE ASSIGNMENT") && commandCenter.includes("PROVENANCE") && commandCenter.includes("LOCAL SEARCH"),
    STUD_CALENDAR_EMAIL_REFERENCE_ONLY: commandCenter.includes("EXPLICIT ONLY") && commandCenter.includes("STUD DOES NOT SCAN, OPEN OR COPY EXTERNAL CONTENT") && commandCenter.includes("STUD cannot inspect, search or copy email content"),
    STUD_DARK_LIGHT_SAFE_TOKENS: css.includes("stud-command-center-grid") && css.includes(".stud-command-center-deck .aegis-input:focus") && css.includes("@media (max-width: 1230px)") && theme.includes("STUD Phase 2 keeps the Command Center semantic"),
    STUD_NO_PROVIDER_OR_NETWORK_RUNTIME: !manager.includes("stud-provider") && !manager.includes("stud-fetch") && !multithread.includes("stud-network"),
    STUD_FILES_PRESENT: files.every(file => fs.existsSync(path.join(ROOT, file)))
};

Object.entries(checks).forEach(([name, value]) => {
    console.log(`${name}: ${value ? "PASS" : "FAIL"}`);
    assert.ok(value, name);
});
console.log("STUD_WORKSPACE: PASS");
