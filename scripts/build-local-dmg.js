#!/usr/bin/env node

"use strict";

/**
 * Local macOS packaging fallback.
 *
 * electron-builder normally performs this work, but its dependency collector
 * requires npm to be installed in the build environment. This controlled
 * fallback starts from electron-builder's downloaded Electron.app template,
 * stages the current source and runtime dependencies, ad-hoc signs it, then
 * creates the release DMG. It never uses an older AegisUi.app or DMG as input.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));
const version = pkg.version;
const dist = path.join(ROOT, "dist");
const template = process.env.AEGISUI_ELECTRON_TEMPLATE || path.join(dist, "mac-arm64", "Electron.app");
const outputDir = path.join(dist, "mac-arm64");
const app = path.join(outputDir, "AegisUi.app");
const appResources = path.join(app, "Contents", "Resources");
const stagedApp = path.join(appResources, "app");
const calendarHelperSource = path.join(ROOT, "src", "native", "EdexUiEngCalendar.app");
const calendarHelperDestination = path.join(appResources, "AegisUiCalendar.app");
const dmg = path.join(dist, `AegisUi-${version}-arm64.dmg`);

function run(file, args, options = {}) {
    return execFileSync(file, args, {cwd: ROOT, stdio: options.stdio || "inherit"});
}

function copy(source, destination, options = {}) {
    fs.cpSync(source, destination, {recursive: true, dereference: true, preserveTimestamps: true, ...options});
}

function replacePlist(key, value) {
    run("/usr/bin/plutil", ["-replace", key, "-string", value, path.join(app, "Contents", "Info.plist")]);
}

function findSpawnHelpers(root, matches = []) {
    fs.readdirSync(root, {withFileTypes: true}).forEach(entry => {
        const item = path.join(root, entry.name);
        if (entry.isDirectory()) findSpawnHelpers(item, matches);
        else if (entry.isFile() && entry.name === "spawn-helper") matches.push(item);
    });
    return matches;
}

function rewriteTemplateSymlinks(root, sourceRoot, targetRoot) {
    fs.readdirSync(root, {withFileTypes: true}).forEach(entry => {
        const item = path.join(root, entry.name);
        if (entry.isSymbolicLink()) {
            const link = fs.readlinkSync(item);
            if (link.startsWith(sourceRoot)) {
                const rewrittenTarget = path.join(targetRoot, path.relative(sourceRoot, link));
                fs.unlinkSync(item);
                fs.symlinkSync(path.relative(path.dirname(item), rewrittenTarget), item);
            }
            return;
        }
        if (entry.isDirectory()) rewriteTemplateSymlinks(item, sourceRoot, targetRoot);
    });
}

function sha256(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

if (!fs.existsSync(template)) {
    throw new Error(`Electron template not found: ${template}. Run electron-builder once to download it, or set AEGISUI_ELECTRON_TEMPLATE.`);
}
if (!fs.existsSync(path.join(ROOT, "src", "node_modules"))) {
    throw new Error("src/node_modules is required for local packaging.");
}

// electron-builder normally builds/copies this extra resource. The local
// fallback must preserve the same Calendar contract or the packaged renderer
// will correctly report CALENDAR LINK UNAVAILABLE because its native helper is
// absent. The helper is read-only and is signed again with the final bundle.
run(process.execPath, [path.join(ROOT, "build", "build-calendar-helper.js")]);
if (!fs.existsSync(calendarHelperSource)) {
    throw new Error("Calendar helper build did not produce EdexUiEngCalendar.app.");
}

fs.mkdirSync(outputDir, {recursive: true});
fs.rmSync(app, {recursive: true, force: true});
fs.rmSync(dmg, {force: true});
// Electron.framework contains internal relative symlinks. Preserve them; an
// eager dereference turns them into links back to the template and invalidates
// the final signature.
copy(template, app, {dereference: false});
rewriteTemplateSymlinks(app, template, app);

fs.rmSync(stagedApp, {recursive: true, force: true});
copy(path.join(ROOT, "src"), stagedApp, {
    filter: source => path.basename(source) !== "node_modules"
});
copy(path.join(ROOT, "src", "node_modules"), path.join(stagedApp, "node_modules"));
copy(calendarHelperSource, calendarHelperDestination);

const executable = path.join(app, "Contents", "MacOS", "Electron");
const brandedExecutable = path.join(app, "Contents", "MacOS", "AegisUi");
fs.renameSync(executable, brandedExecutable);
copy(path.join(ROOT, "media", "aegisui-icon.icns"), path.join(appResources, "aegisui-icon.icns"));
replacePlist("CFBundleDisplayName", "AegisUi");
replacePlist("CFBundleName", "AegisUi");
replacePlist("CFBundleExecutable", "AegisUi");
replacePlist("CFBundleIdentifier", "com.edex.ui.eng");
replacePlist("CFBundleShortVersionString", version);
replacePlist("CFBundleVersion", version);
replacePlist("CFBundleIconFile", "aegisui-icon.icns");
replacePlist("NSAppleEventsUsageDescription", "AegisUi uses Automation only when you connect Apple Music to show your current playback.");
replacePlist("NSCalendarsFullAccessUsageDescription", "AegisUi reads calendar events locally to display your weekly and monthly schedule.");

try {
    run("/usr/bin/xattr", ["-cr", app], {stdio: "ignore"});
} catch (error) {
    // Some external volumes do not support extended attributes. The app is
    // still ad-hoc signed below; do not turn that filesystem limitation into a
    // false packaging failure.
    console.warn("XATTR_CLEANUP: WARN external volume does not support recursive metadata cleanup");
}
const helpers = findSpawnHelpers(app);
if (!helpers.length) throw new Error("node-pty spawn-helper missing from staged application.");
helpers.forEach(helper => {
    fs.chmodSync(helper, 0o755);
    run("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", helper], {stdio: "ignore"});
});
const calendarHelperExecutable = path.join(calendarHelperDestination, "Contents", "MacOS", "calendar-helper");
if (!fs.existsSync(calendarHelperExecutable)) throw new Error("Calendar helper executable missing from staged application.");
fs.chmodSync(calendarHelperExecutable, 0o755);
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", calendarHelperDestination], {stdio: "ignore"});
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", app], {stdio: "ignore"});
run("/usr/bin/hdiutil", ["create", "-volname", `AegisUi ${version}`, "-srcfolder", app, "-ov", "-format", "UDZO", dmg]);

console.log(`PACKAGED_APP: ${app}`);
console.log(`DMG: ${dmg}`);
console.log(`SHA256: ${sha256(dmg)}`);
