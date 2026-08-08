#!/usr/bin/env node

"use strict";

/* Calendar is a native, read-only integration.  This check protects the
 * boundary discovered during the v2.4.2 correction: appearance changes are
 * presentation-only and cannot alter its IPC route, local connection state or
 * fallback decision.  A packaged live probe validates the helper separately. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(ROOT, "src", "classes", "engineeringDashboard.class.js"), "utf8");
const renderer = fs.readFileSync(path.join(ROOT, "src", "_renderer.js"), "utf8");
const theme = fs.readFileSync(path.join(ROOT, "src", "assets", "css", "aegis_theme.css"), "utf8");
const failures = [];

function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

check("CALENDAR_IPC_ROUTE", dashboard.includes('this.ipc.invoke("calendar-events"'));
check("CALENDAR_FALLBACK_REQUIRES_UNAVAILABLE_RESPONSE", /if \(!response\.ok\)\s*\{[\s\S]{0,400}renderConnect\(message\)/.test(dashboard));
check("CALENDAR_CONNECTION_STATE_OWNERSHIP", dashboard.includes('"edexui-eng-calendar-native-connected"')
    && !renderer.includes("edexui-eng-calendar-native-connected"));
check("CALENDAR_APPEARANCE_LIFECYCLE_DECOUPLED", !renderer.includes('calendar-events')
    && !renderer.includes('engineeringDashboard.calendarPanel'));
check("CALENDAR_LIGHT_SURFACES_SEMANTIC", [
    ".eng-calendar-picker",
    "button.eng-calendar-choice",
    "--aegis-surface-raised",
    "--aegis-surface-selected"
].every(token => theme.includes(token)));
check("CALENDAR_THEME_NO_VISIBILITY_OVERRIDE", !/\.eng-calendar[^\{]*\{[^}]*\b(?:display|visibility)\s*:/.test(theme));

console.log(`CALENDAR_THEME_INTEGRITY: ${failures.length ? "FAIL" : "OK"}`);
if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
}
