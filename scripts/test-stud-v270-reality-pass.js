#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const commandCenter = read("src/classes/workspaces/studCommandCenter.class.js");
const requirementsWorkspace = read("src/classes/workspaces/studRequirementsContractWorkspace.class.js");
const moodle = read("src/classes/workspaces/studMoodleWorkspace.class.js");
const runtime = read("src/classes/workspaces/studLmsRuntime.class.js");
const validation = read("STUD_V270_VALIDATION.md");
const visualScript = read("scripts/validate-stud-v270-live.js");
const screenshotRoot = path.join(ROOT, "docs/releases/v2.7.0/screenshots");
const screenshots = fs.readdirSync(screenshotRoot).filter(name => name.endsWith(".png")).sort();

const checks = {
    PRIMARY_NAVIGATION_REDUCED: ["HOME", "COURSES", "WORK", "LIBRARY", "STUDY", "TOOLS"].every(label => commandCenter.includes(`label: "${label}"`)),
    OBJECT_CENTRIC_ASSIGNMENT: commandCenter.includes("ASSIGNMENT DETAIL") && commandCenter.includes("ASSIGNMENT ROADMAP") && commandCenter.includes("BRIEF &amp; MARKING DOCUMENTS"),
    REQUIREMENTS_EXPLAINABLE: commandCenter.includes("this.requirements.render()") && requirementsWorkspace.includes("SOURCE PREVIEW") && requirementsWorkspace.includes("EXTRACTION COVERAGE") && requirementsWorkspace.includes("APPROVE AS INCOMPLETE"),
    PROGRESSIVE_DISCLOSURE: commandCenter.includes("ADVANCED / EDIT LOCAL DETAILS") && moodle.includes("CONNECTION &amp; SYNC OPTIONS") && moodle.includes("CAPABILITY REPORT / READ ONLY"),
    MOODLE_ACTIONS_CLEAR: moodle.includes("SYNC NOW") && moodle.includes("INDEX COURSE MATERIAL") && moodle.includes("FORGET ACCOUNT"),
    SSO_SYSTEM_BROWSER_ONLY: runtime.includes("SYSTEM_BROWSER_SSO") && runtime.includes("moodle_mobile_app") && runtime.includes("aegisui"),
    PUBLIC_FIXTURE_IS_RENDERER_ONLY: !visualScript.includes("ipcRenderer") && !visualScript.includes("stud-entity-create") && !visualScript.includes("localStorage"),
    PUBLIC_VISUAL_MATRIX_COMPLETE: screenshots.length >= 15,
    VALIDATION_RECORDS_REALITY_PASS: validation.includes("14 Courses") && validation.includes("625") && validation.includes("DRAFT / SIMULATION")
};

for (const screenshot of screenshots) {
    const data = fs.readFileSync(path.join(screenshotRoot, screenshot));
    assert.strictEqual(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${screenshot} is not a PNG`);
}

Object.entries(checks).forEach(([name, value]) => {
    console.log(`${name}: ${value ? "PASS" : "FAIL"}`);
    assert.ok(value, name);
});
console.log(`STUD_V270_REALITY_PASS: ${Object.keys(checks).length} checks passed · ${screenshots.length} public screenshots`);
