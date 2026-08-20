#!/usr/bin/env node

"use strict";

/* Static contract by default; use --app /path/to/AegisUi.app after packaging
 * to prove the Calendar helper is physically present in the release artifact. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const build = fs.readFileSync(path.join(ROOT, "scripts", "build-local-dmg.js"), "utf8");
const requiredSourceFiles = [
    "src/native/calendar-helper.swift",
    "src/native/calendar-helper-Info.plist",
    "build/build-calendar-helper.js"
];
const failures = [];

function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

check("CALENDAR_HELPER_SOURCE", requiredSourceFiles.every(file => fs.existsSync(path.join(ROOT, file))));
check("CALENDAR_HELPER_BUILD", build.includes("build-calendar-helper.js") && build.includes("calendarHelperSource"));
check("CALENDAR_HELPER_RESOURCE_COPY", build.includes("copy(calendarHelperSource, calendarHelperDestination)"));
check("CALENDAR_HELPER_STAGE_GUARD", build.includes("Calendar helper executable missing from staged application."));
check("CALENDAR_HELPER_SIGNING", build.includes("calendarHelperDestination") && build.includes("codesign"));
check(
    "PACKAGING_TEMPLATE_REALPATH",
    build.includes("fs.realpathSync(configuredTemplate)") && build.includes("rewriteTemplateSymlinks(app, template, app)"),
    "Electron framework links are rebased from the physical template path"
);

const appIndex = process.argv.indexOf("--app");
if (appIndex >= 0) {
    const app = process.argv[appIndex + 1];
    const helper = path.join(app || "", "Contents", "Resources", "AegisUiCalendar.app");
    const executable = path.join(helper, "Contents", "MacOS", "calendar-helper");
    const info = path.join(helper, "Contents", "Info.plist");
    check("PACKAGED_CALENDAR_HELPER_BUNDLE", fs.existsSync(helper), helper || "missing --app path");
    check("PACKAGED_CALENDAR_HELPER_EXECUTABLE", fs.existsSync(executable), executable);
    check("PACKAGED_CALENDAR_HELPER_INFO", fs.existsSync(info), info);
}

console.log(`PACKAGED_CALENDAR_HELPER: ${failures.length ? "FAIL" : "OK"}`);
if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
}
