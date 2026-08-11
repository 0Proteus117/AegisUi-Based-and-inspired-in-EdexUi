#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const config = fs.readFileSync(path.join(ROOT, "src/config/workspaces.config.js"), "utf8");
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
const theme = fs.readFileSync(path.join(ROOT, "src/assets/css/aegis_theme.css"), "utf8");
const multithread = fs.readFileSync(path.join(ROOT, "src/_multithread.js"), "utf8");
const files = [
    "src/classes/workspaces/studAcademicModel.class.js",
    "src/classes/workspaces/studAcademicStore.class.js",
    "src/classes/workspaces/studAcademicIpc.class.js",
    "scripts/test-stud-academic-core.js"
];

const checks = {
    STUD_ACTIVE_WORKSPACE: config.includes('id: "student"') && config.includes('navigationLabel: "STUD"') && config.includes('implementation: "academic core · local first"'),
    STUD_RENDERER_OWNS_NO_SQLITE: manager.includes("renderStudent(view, definition)") && !manager.includes("node:sqlite"),
    STUD_MAIN_PROCESS_BOUNDARY: multithread.includes("registerStudAcademicIpc") && multithread.includes("STUD persistence is a bounded main-process service"),
    STUD_FORMS_AND_PROVENANCE: manager.includes("CREATE COURSE") && manager.includes("CREATE ASSIGNMENT") && manager.includes("FIELD-LEVEL PROVENANCE") && manager.includes("ACADEMIC SEARCH"),
    STUD_CALENDAR_EMAIL_REFERENCE_ONLY: manager.includes("Relationships can retain a bounded event identifier") && manager.includes("never copies mailbox bodies"),
    STUD_DARK_LIGHT_SAFE_TOKENS: css.includes("stud-academic-grid") && css.includes(".stud-form .aegis-input:focus") && css.includes("@media (max-width: 1240px)") && theme.includes("STUD academic records are ordinary cockpit data surfaces"),
    STUD_NO_PROVIDER_OR_NETWORK_RUNTIME: !manager.includes("stud-provider") && !manager.includes("stud-fetch") && !multithread.includes("stud-network"),
    STUD_FILES_PRESENT: files.every(file => fs.existsSync(path.join(ROOT, file)))
};

Object.entries(checks).forEach(([name, value]) => {
    console.log(`${name}: ${value ? "PASS" : "FAIL"}`);
    assert.ok(value, name);
});
console.log("STUD_WORKSPACE: PASS");
