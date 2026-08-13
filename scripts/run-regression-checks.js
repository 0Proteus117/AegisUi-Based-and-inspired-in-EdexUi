#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CHECKS = [
    "scripts/test-aegisui-branding.js",
    "scripts/test-aegis-theme-integrity.js",
    "scripts/test-calendar-theme-integrity.js",
    "scripts/test-packaged-calendar-helper.js",
    "scripts/test-boot-splash-integrity.js",
    "scripts/test-packaged-node-pty-helper.js",
    "scripts/release-health-check.js",
    "scripts/test-assistant-ollama.js",
    "scripts/test-assistant-routing-classifier.js",
    "scripts/test-assistant-memory-bootstrap.js",
    "scripts/test-assistant-chat-session.js",
    "scripts/test-assistant-command-router.js",
    "scripts/test-assistant-ai-provider.js",
    "scripts/test-eng-workspace-registry.js",
    "scripts/test-eng-command-router.js",
    "scripts/test-eng-calculators.js",
    "scripts/test-stud-academic-core.js",
    "scripts/test-stud-phase14-reproducibility.js",
    "scripts/test-stud-phase14-acceptance.js",
    "scripts/test-stud-workspace.js",
    "scripts/test-stud-command-center.js",
    "scripts/test-stud-tool-catalog.js",
    "scripts/test-stud-academic-ai.js",
    "scripts/test-osint-workspace.js",
    "scripts/test-osint-provider-registry.js",
    "scripts/test-osint-reference-only-policy.js",
    "scripts/test-osint-tool-access-panel.js",
    "scripts/test-osint-native-access-foundation.js",
    "scripts/test-osint-provider-runtime.js",
    "scripts/test-osint-geospatial-verification.js",
    "scripts/test-osint-visual-media-verification.js",
    "scripts/test-osint-domain-infrastructure.js",
    "scripts/test-osint-research-source-verification.js",
    "scripts/test-osint-entity-resolution.js",
    "scripts/test-osint-investigation-orchestration.js",
    "scripts/test-osint-analyst-desk-milestone.js",
    "scripts/test-osint-cases.js",
    "scripts/test-osint-case-ipc.js",
    "scripts/test-osint-case-ui.js",
    "scripts/test-osint-case-layout.js",
    "scripts/test-aegis-gearlab-standalone.js",
    "scripts/test-apple-music-bridge-static.js",
    "scripts/test-apple-music-runtime.js",
    "scripts/test-map-providers.js",
    "scripts/test-sat-celestrak.js"
];

function runCheck(script) {
    const file = path.join(ROOT, script);
    if (!fs.existsSync(file)) {
        console.log(`${script}: SKIPPED`);
        return {status: "SKIPPED"};
    }

    const result = spawnSync(process.execPath, [file], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180000
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error) {
        console.log(`${script}: FAIL ${result.error.message}`);
        return {status: "FAIL"};
    }

    if (result.status === 0) {
        console.log(`${script}: OK`);
        return {status: "OK"};
    }

    console.log(`${script}: FAIL exit=${result.status}`);
    return {status: "FAIL"};
}

const results = CHECKS.map(runCheck);
const failed = results.filter(item => item.status === "FAIL").length;
const skipped = results.filter(item => item.status === "SKIPPED").length;

if (failed) {
    console.log("REGRESSION_CHECKS: FAIL");
    process.exit(1);
}

console.log(`REGRESSION_CHECKS: ${skipped ? "WARN" : "OK"}`);
if (skipped) process.exitCode = 0;
