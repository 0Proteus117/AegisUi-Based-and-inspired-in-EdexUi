#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
    const file = path.join(ROOT, relativePath);
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runGit(args, options = {}) {
    try {
        return {
            ok: true,
            stdout: execFileSync("git", args, {
                cwd: ROOT,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
                timeout: options.timeout || 8000
            }).trim()
        };
    } catch (error) {
        return {
            ok: false,
            stdout: String(error.stdout || "").trim(),
            stderr: String(error.stderr || error.message || "").trim()
        };
    }
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function main() {
    const failures = [];
    const pkg = readJson("package.json");
    const srcPkg = readJson("src/package.json");
    const versionsMatch = pkg.version === srcPkg.version;
    const aegisUiBranding = pkg.productName === "AegisUi"
        && srcPkg.productName === "AegisUi"
        && exists("media/aegisui-mark.svg")
        && exists("media/aegisui-icon.icns")
        && exists("scripts/test-aegisui-branding.js");

    const privateTracked = runGit(["ls-files", "assistant/memory/private"], {timeout: 5000});
    const privateTrackedNo = privateTracked.ok && !privateTracked.stdout;

    const privateIgnored = runGit(["check-ignore", "assistant/memory/private/bootstrap/00_index.md"], {timeout: 5000});
    const privateIgnoredYes = privateIgnored.ok && privateIgnored.stdout.includes("assistant/memory/private/");

    const chatTracked = runGit(["ls-files", "assistant/chat"], {timeout: 5000});
    const chatTrackedNo = chatTracked.ok && !chatTracked.stdout;

    const stagedSensitive = runGit(["diff", "--cached", "--name-only", "--", ".env", ".env.local", "assistant/memory/private", "assistant/chat"], {timeout: 5000});
    const secretsStagedNo = stagedSensitive.ok && !stagedSensitive.stdout;

    const assistantLocalAi = exists("src/classes/assistant/assistantLocalChat.class.js")
        && exists("src/classes/assistant/assistantOllamaClient.class.js")
        && exists("src/classes/assistant/assistantAIProvider.class.js")
        && exists("src/classes/assistant/assistantChatSession.class.js")
        && exists("src/classes/assistant/assistantCommandRouter.class.js")
        && exists("scripts/test-assistant-routing-classifier.js")
        && exists("assistant/config/assistant-ai.example.json");

    const appleMusicBridge = exists("scripts/test-apple-music-runtime.js")
        && exists("scripts/test-apple-music-bridge-static.js")
        && exists("scripts/diagnose-macos-automation-identity.js")
        && exists("src/classes/engineeringDashboard.class.js");

    const mapProviders = [
        "src/classes/map/providers/trafficProvider.js",
        "src/classes/map/providers/aisProvider.js",
        "src/classes/map/providers/weatherRadarProvider.js",
        "src/classes/map/providers/marineWeatherProvider.js",
        "src/classes/map/providers/celestrakProvider.js",
        "src/classes/map/providers/openSkyProvider.js",
        "src/classes/map/providers/noaaOceanProvider.js"
    ].every(exists);
    const engWorkspace = exists("src/classes/workspaces/engineeringTools.registry.js")
        && exists("scripts/test-eng-workspace-registry.js")
        && exists("scripts/test-eng-command-router.js")
        && exists("scripts/test-eng-calculators.js");
    const osintFoundation = exists("src/classes/workspaces/osintTools.registry.js")
        && exists("src/classes/workspaces/osintProviderSchema.class.js")
        && exists("src/classes/workspaces/osintProviderPolicy.class.js")
        && exists("src/classes/workspaces/osintCapabilityRegistry.class.js")
        && exists("src/classes/workspaces/osintProviderRuntime.class.js")
        && exists("src/classes/workspaces/osintProviderAdapters.class.js")
        && exists("src/classes/workspaces/osintToolAccessPanel.class.js")
        && exists("src/classes/workspaces/osintAccess.class.js")
        && exists("scripts/test-osint-native-access-foundation.js")
        && exists("scripts/test-osint-provider-registry.js")
        && exists("scripts/test-osint-reference-only-policy.js")
        && exists("scripts/test-osint-tool-access-panel.js")
        && exists("scripts/test-osint-provider-runtime.js");

    if (!versionsMatch) failures.push("package versions do not match");
    if (!aegisUiBranding) failures.push("AegisUi visible branding files are missing");
    if (!privateTrackedNo) failures.push("private memory is tracked");
    if (!privateIgnoredYes) failures.push("private memory is not ignored");
    if (!chatTrackedNo) failures.push("assistant chat exports are tracked");
    if (!secretsStagedNo) failures.push("sensitive files are staged");
    if (!assistantLocalAi) failures.push("assistant local AI files missing");
    if (!appleMusicBridge) failures.push("Apple Music bridge validation files missing");
    if (!mapProviders) failures.push("map provider files missing");
    if (!engWorkspace) failures.push("ENG workspace files missing");
    if (!osintFoundation) failures.push("OSINT native access foundation files missing");

    print("PACKAGE_VERSION", pkg.version || "UNKNOWN");
    print("SRC_PACKAGE_VERSION", srcPkg.version || "UNKNOWN");
    print("VERSIONS_MATCH", versionsMatch ? "YES" : "NO");
    print("AEGISUI_BRANDING", aegisUiBranding ? "PRESENT" : "MISSING");
    print("PRIVATE_MEMORY_TRACKED", privateTrackedNo ? "NO" : "YES");
    print("PRIVATE_MEMORY_IGNORED", privateIgnoredYes ? "YES" : "NO");
    print("CHAT_EXPORTS_TRACKED", chatTrackedNo ? "NO" : "YES");
    print("SECRETS_STAGED", secretsStagedNo ? "NO" : "YES");
    print("ASSISTANT_LOCAL_AI", assistantLocalAi ? "PRESENT" : "MISSING");
    print("ASSISTANT_AI_PROVIDER", exists("src/classes/assistant/assistantAIProvider.class.js") ? "PRESENT" : "MISSING");
    print("ASSISTANT_CHAT_SESSION", exists("src/classes/assistant/assistantChatSession.class.js") ? "PRESENT" : "MISSING");
    print("ASSISTANT_COMMAND_ROUTER", exists("src/classes/assistant/assistantCommandRouter.class.js") ? "PRESENT" : "MISSING");
    print("APPLE_MUSIC_BRIDGE", appleMusicBridge ? "PRESENT" : "MISSING");
    print("MAP_PROVIDERS", mapProviders ? "PRESENT" : "MISSING");
    print("ENG_WORKSPACE", engWorkspace ? "PRESENT" : "MISSING");
    print("OSINT_NATIVE_ACCESS", osintFoundation ? "PRESENT" : "MISSING");
    print("OSINT_PROVIDER_REGISTRY", exists("src/classes/workspaces/osintProviderSchema.class.js") && exists("src/classes/workspaces/osintProviderPolicy.class.js") && exists("src/classes/workspaces/osintToolAccessPanel.class.js") ? "PRESENT" : "MISSING");
    print("RELEASE_HEALTH", failures.length ? "FAIL" : "OK");

    if (failures.length) {
        failures.forEach(item => console.error(`- ${item}`));
        process.exit(1);
    }
}

main();
