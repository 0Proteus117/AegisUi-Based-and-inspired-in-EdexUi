#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {execFileSync, spawnSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";
const expectedBundleId = "com.edex.ui.eng";
const expectedProductName = "EdexUi-Eng";

const candidates = [
    path.join(ROOT, "dist", `manual-v${version}`, "EdexUi-Eng.app"),
    path.join(ROOT, "dist", "mac-arm64", "EdexUi-Eng.app"),
    "/Applications/EdexUi-Eng.app"
];

function print(key, value, detail = "") {
    console.log(`${key}: ${value}${detail ? ` · ${detail}` : ""}`);
}

function plist(appPath, key) {
    try {
        return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(appPath, "Contents", "Info.plist")], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 5000
        }).trim();
    } catch (error) {
        return "";
    }
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000
    });
    return {
        ok: result.status === 0,
        stdout: String(result.stdout || "").trim(),
        stderr: String(result.stderr || "").trim()
    };
}

function sourceContainsSystemEvents() {
    const files = [
        "src/_boot.js",
        "scripts/test-apple-music-runtime.js"
    ];
    return files.some(file => /System Events/i.test(fs.readFileSync(path.join(ROOT, file), "utf8")));
}

let warn = false;
let fail = false;
const appPath = candidates.find(candidate => fs.existsSync(candidate));
const dmgPath = path.join(ROOT, "dist", `EdexUi-Eng-${version}-arm64.dmg`);

print("PACKAGED_APP_FOUND", appPath ? "OK" : "FAIL", appPath || "No packaged app found for current version.");
if (!appPath) fail = true;

const bundleId = appPath ? plist(appPath, "CFBundleIdentifier") : "";
const bundleName = appPath ? plist(appPath, "CFBundleName") : "";
const displayName = appPath ? plist(appPath, "CFBundleDisplayName") : "";
const appVersion = appPath ? plist(appPath, "CFBundleShortVersionString") : "";

print("BUNDLE_ID", bundleId || "UNKNOWN");
print("PRODUCT_NAME", displayName || bundleName || "UNKNOWN");
print("VERSION", appVersion || "UNKNOWN");
print("DMG_FOUND", fs.existsSync(dmgPath) ? "OK" : "WARN", fs.existsSync(dmgPath) ? dmgPath : `Missing ${dmgPath}`);
if (!fs.existsSync(dmgPath)) warn = true;

const systemEvents = sourceContainsSystemEvents();
print("BRIDGE_SYSTEM_EVENTS", systemEvents ? "YES" : "NO");
if (systemEvents) fail = true;

print("EXPECTED_AUTOMATION_TARGET", "Music");
print("EXPECTED_BUNDLE_ID", expectedBundleId);
print("EXPECTED_PRODUCT_NAME", expectedProductName);

if (bundleId !== expectedBundleId) fail = true;
if ((displayName || bundleName) !== expectedProductName) fail = true;
if (appVersion !== version) warn = true;

if (appPath) {
    const verify = run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    print("CODESIGN_VERIFY", verify.ok ? "OK" : "WARN", verify.stderr || verify.stdout);
    if (!verify.ok) warn = true;
}

print("TCC_RESET_HELPER", "MANUAL_ONLY", "tccutil reset AppleEvents com.edex.ui.eng");
print("PACKAGED_FINAL_READY", fail ? "FAIL" : (warn ? "WARN" : "OK"));

if (fail) process.exit(1);
