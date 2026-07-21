#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const sourcePackageJson = JSON.parse(fs.readFileSync(path.join(root, "src", "package.json"), "utf8"));
const boot = fs.readFileSync(path.join(root, "src", "_boot.js"), "utf8");
const page = fs.readFileSync(path.join(root, "src", "ui.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "_renderer.js"), "utf8");

const checks = {
    AEGISUI_PRODUCT_NAME: packageJson.productName === "AegisUi" && sourcePackageJson.productName === "AegisUi",
    AEGISUI_BUNDLE_ARTIFACT: String(packageJson.build?.dmg?.artifactName || "").startsWith("AegisUi-"),
    AEGISUI_ICON_ICNS: packageJson.build?.mac?.icon === "media/aegisui-icon.icns"
        && fs.existsSync(path.join(root, "media", "aegisui-icon.icns")),
    AEGISUI_ICON_ICO: packageJson.build?.win?.icon === "media/aegisui-icon.ico"
        && fs.existsSync(path.join(root, "media", "aegisui-icon.ico")),
    AEGISUI_MARK_SOURCE: fs.existsSync(path.join(root, "media", "aegisui-mark.svg")),
    AEGISUI_WINDOW_TITLE: page.includes("<title>AegisUi</title>") && boot.includes('title: "AegisUi"'),
    AEGISUI_SHELL_HEADER: renderer.includes("<p>AEGISUI</p><p>SYSTEM</p>"),
    LEGACY_DATA_COMPATIBILITY: boot.includes('app.setPath("userData", path.join(app.getPath("appData"), "EdexUi-Eng"))')
};

let failed = false;
for (const [key, value] of Object.entries(checks)) {
    console.log(`${key}: ${value ? "OK" : "FAIL"}`);
    failed ||= !value;
}
console.log(`AEGISUI_BRANDING: ${failed ? "FAIL" : "OK"}`);
process.exitCode = failed ? 1 : 0;
