#!/usr/bin/env node

"use strict";

/* Theme contract checks intentionally assert semantic capabilities and policy
 * boundaries, not screenshot pixels from one display. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const renderer = fs.readFileSync(path.join(ROOT, "src", "_renderer.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "src", "ui.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src", "assets", "css", "aegis_theme.css"), "utf8");
const workspaceManager = fs.readFileSync(path.join(ROOT, "src", "classes", "workspaceManager.class.js"), "utf8");
const failures = [];

function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

check("THEME_STYLESHEET_LOADED_LAST", html.indexOf("assets/css/aegis_theme.css") > html.indexOf("assets/css/assistant-panel.css"));
check("THEME_SEMANTIC_TOKENS", [
    "--aegis-app-bg", "--aegis-surface", "--aegis-border", "--aegis-text",
    "--aegis-accent", "--aegis-success", "--aegis-warning", "--aegis-danger",
    "--aegis-surface-status", "--aegis-surface-selected", "--aegis-surface-visual"
].every(token => css.includes(token)));
check("THEME_DARK_BASELINE", css.includes(":root") && css.includes('html[data-aegis-appearance="dark"]'));
check("THEME_LIGHT_PALETTE", css.includes('html[data-aegis-appearance="light"]') && css.includes("color-scheme: light"));
check("THEME_LEGACY_VARIABLE_BRIDGE", ["--color_r", "--color_g", "--color_b", "--color_light_black", "--color_grey"].every(token => css.includes(token)));
check("THEME_SETTINGS_SINGLE_STORE", renderer.includes("settingsFile") && renderer.includes("settings.aegisAppearance") && !renderer.includes("aegisAppearance.json"));
check("THEME_MODE_ENUM", renderer.includes('new Set(["light", "dark", "system"])'));
check("THEME_SYSTEM_MEDIA_QUERY", renderer.includes('matchMedia("(prefers-color-scheme: dark)")') && renderer.includes('aegisAppearanceMedia.addEventListener("change"'));
check("THEME_LIVE_SWITCH", renderer.includes("window.setAegisAppearance") && renderer.includes("window.applyAegisAppearance"));
check("THEME_BOOT_ALIGNMENT", renderer.includes("window.__aegisBootMode = resolved"));
check("THEME_SETTINGS_CONTROL", renderer.includes('settingsEditor-aegisAppearance') && renderer.includes("Cockpit appearance: follows macOS, light or dark"));
check("THEME_TERMINAL_INTENTIONAL", css.includes("terminal itself intentionally stays dark"));
check("THEME_OSINT_CASE_SURFACES", [".osint-case-active", ".osint-evidence-detail-header", ".osint-evidence-detail-section"].every(selector => css.includes(selector)));
check("THEME_ASSISTANT_SURFACES", css.includes(".assistant-panel") && css.includes(".assistant-chat-expanded"));
check("THEME_MAP_PRESENTATION_ONLY", css.includes("Provider URLs, keys, layers") && css.includes(".eng-base-map"));
check("THEME_HUB_LEGACY_SURFACE_CORRECTION", [
    ".eng-map-layer-toggle", ".eng-project", ".eng-music-diagnostics", "#eng_playlists"
].every(selector => css.includes(selector)));
check("THEME_WORKSPACE_NESTED_SURFACE_CORRECTION", [
    ".workspace-nav-button", ".launch-bay-card", ".eng-command-hero",
    ".eng-detail-panel > header", "#eng_project_editor", ".agent-command-task-card"
].every(selector => css.includes(selector)));
check("THEME_POPUP_SURFACE_CORRECTION", [
    ".eng-detail-overlay", "#eng_project_editor_overlay", ".osint-detail-overlay",
    ".assistant-chat-overlay", "#eng_map_settings_modal", ".eng-map-settings-section"
].every(selector => css.includes(selector)));
check("THEME_NO_PROVIDER_RUNTIME_CHANGE", !renderer.includes("beginOSINTQuery(") && !renderer.includes("workspace-open-link"));
check("THEME_NO_CASE_MODEL_CHANGE", !renderer.includes("createCase(") && !renderer.includes("promoteEvidence("));
check("THEME_OSINT_POLICY_STILL_PRESENT", workspaceManager.includes("canLaunch") && workspaceManager.includes("REFERENCE_ONLY"));

console.log(`AEGIS_THEME_INTEGRITY: ${failures.length ? "FAIL" : "OK"}`);
if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
}
