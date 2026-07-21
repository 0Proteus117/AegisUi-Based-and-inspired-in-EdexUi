#!/usr/bin/env node

/* Prevent the branded AegisUi boot sequence from being silently replaced by
 * the upstream eDEX fallback during a packaging pass. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function expect(condition, label) {
    console.log(`${label}: ${condition ? "OK" : "FAIL"}`);
    if (!condition) failures.push(label);
}

const splashPath = path.join(root, "src/classes/bootSplash.class.js");
const splash = fs.existsSync(splashPath) ? read("src/classes/bootSplash.class.js") : "";
const renderer = read("src/_renderer.js");
const ui = read("src/ui.html");
const stylePath = path.join(root, "src/assets/css/aegis_boot_splash.css");
const style = fs.existsSync(stylePath) ? read("src/assets/css/aegis_boot_splash.css") : "";
const manifest = JSON.parse(read("package.json"));

expect(Boolean(splash), "BOOT_SPLASH_SOURCE");
expect(splash.includes("class BootParticleField") && splash.includes("revealDurationMs = this.reducedMotion ? 0 : 3500"), "BOOT_PARTICLE_SEQUENCE");
expect(splash.includes("minimumSequenceMs = 12000") && splash.includes("burstDurationMs = 2000"), "BOOT_TIMING");
expect(ui.includes('classes/bootSplash.class.js') && ui.includes('assets/css/aegis_boot_splash.css'), "BOOT_ASSET_LOADING");
expect(renderer.includes("startAegisBootSequence") && renderer.includes("minimumSequenceMs: 12000"), "BOOT_RENDERER_INTEGRATION");
expect(style.includes("aegisLogoBreathe") && style.includes("aegis-boot-exit"), "BOOT_VISUAL_STYLES");
expect(String(manifest.scripts["prebuild-darwin"] || "").includes("--delete"), "CLEAN_PREBUILD_SYNC");

if (failures.length) {
    console.log(`BOOT_SPLASH_INTEGRITY: FAIL (${failures.join(", ")})`);
    process.exitCode = 1;
} else {
    console.log("BOOT_SPLASH_INTEGRITY: OK");
}
