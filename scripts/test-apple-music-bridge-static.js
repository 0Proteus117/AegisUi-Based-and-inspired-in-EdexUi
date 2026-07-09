#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = [
    "src/_boot.js",
    "src/classes/engineeringDashboard.class.js",
    "scripts/test-apple-music-runtime.js"
];

function print(name, value, detail = "") {
    console.log(`${name}: ${value}${detail ? ` · ${detail}` : ""}`);
}

let failed = false;

for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
        print("APPLE_MUSIC_FILE", "FAIL", `${file} missing`);
        failed = true;
        continue;
    }
    print("APPLE_MUSIC_FILE", "OK", file);
}

const boot = fs.readFileSync(path.join(root, "src/_boot.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "src/classes/engineeringDashboard.class.js"), "utf8");
const runtime = fs.readFileSync(path.join(root, "scripts/test-apple-music-runtime.js"), "utf8");

const bridgeSource = `${boot}\n${runtime}`;
const usesSystemEvents = /System Events/i.test(bridgeSource);
print("APPLE_MUSIC_SYSTEM_EVENTS", usesSystemEvents ? "FAIL" : "NO");
if (usesSystemEvents) failed = true;

const hasJxa = boot.includes("/usr/bin/osascript")
    && boot.includes("\"-l\", \"JavaScript\"");
print("APPLE_MUSIC_JXA_BRIDGE", hasJxa ? "OK" : "FAIL");
if (!hasJxa) failed = true;

const targetsBundleId = /Application\(['"]com\.apple\.Music['"]\)/.test(boot);
print("APPLE_MUSIC_TARGET", targetsBundleId ? "OK" : "FAIL", targetsBundleId ? "com.apple.Music" : "Music target missing");
if (!targetsBundleId) failed = true;

const allowedCommands = ["previousTrack", "playpause", "nextTrack", "shuffleEnabled", "songRepeat"];
const missingCommands = allowedCommands.filter(command => !boot.includes(command));
print("APPLE_MUSIC_ALLOWLISTED_COMMANDS", missingCommands.length ? "FAIL" : "OK", missingCommands.join(", "));
if (missingCommands.length) failed = true;

const hasBlockedState = /AUTOMATION_BLOCKED/.test(boot) && /AUTOMATION BLOCKED/.test(dashboard);
print("APPLE_MUSIC_AUTOMATION_BLOCKED_STATE", hasBlockedState ? "OK" : "FAIL");
if (!hasBlockedState) failed = true;

const destructivePatterns = [/rm\\s+-rf/, /delete\\s+playlist/i, /delete\\s+track/i, /erase/i];
const destructive = destructivePatterns.some(pattern => pattern.test(boot));
print("APPLE_MUSIC_DESTRUCTIVE_PERMISSIONS", destructive ? "FAIL" : "NO");
if (destructive) failed = true;

if (failed) process.exit(1);
print("APPLE_MUSIC_BRIDGE_STATIC", "OK");
