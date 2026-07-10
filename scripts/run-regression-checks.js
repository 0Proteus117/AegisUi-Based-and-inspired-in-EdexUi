#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CHECKS = [
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
