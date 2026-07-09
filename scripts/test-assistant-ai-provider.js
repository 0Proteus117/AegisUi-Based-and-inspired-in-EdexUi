#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {AssistantAIProviderLayer} = require("../src/classes/assistant/assistantAIProvider.class.js");
const {AssistantLocalChat} = require("../src/classes/assistant/assistantLocalChat.class.js");
const {AssistantMemoryBootstrap} = require("../src/classes/assistant/assistantMemoryBootstrap.class.js");

const projectRoot = path.resolve(__dirname, "..");
const userDataPath = path.join(os.homedir(), "Library", "Application Support", "EdexUi-Eng");
const configPath = path.join(userDataPath, "assistant", "config", "assistant-ai.json");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function readConfig() {
    try {
        if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (error) {}
    return {};
}

async function main() {
    const memory = new AssistantMemoryBootstrap({projectRoot, userDataPath});
    const chat = new AssistantLocalChat({projectRoot, userDataPath, memory});
    const config = chat.sanitizeConfig(readConfig());
    const layer = new AssistantAIProviderLayer({ollama: {client: chat.client}});
    const providers = layer.listProviders();
    const ollamaCaps = layer.getCapabilities("ollama");
    const appleCaps = layer.getCapabilities("apple-native");
    const health = await layer.checkHealth(config);
    const model = health.ok ? await chat.client.ensureModelAvailable(config.model) : {ok: false, status: health.status};
    let chatResult = {ok: false, status: "SKIPPED"};
    if (health.ok && model.ok) {
        chatResult = await layer.chat({
            provider: "ollama",
            endpoint: config.endpoint,
            model: config.model,
            temperature: 0.1,
            messages: [{role: "user", content: "Reply with exactly: provider ok"}]
        });
    }

    print("AI_PROVIDER_LAYER", providers.length >= 2 ? "OK" : "FAIL");
    print("ACTIVE_PROVIDER", config.provider || "ollama");
    print("OLLAMA_PROVIDER", ollamaCaps.localOnly ? (health.ok ? "OK" : "FAIL") : "FAIL");
    print("OLLAMA_STATUS", health.status || (health.ok ? "READY" : "UNKNOWN"));
    print("OLLAMA_MODEL", model.ok ? "OK" : "MISSING");
    print("APPLE_NATIVE_PROVIDER", appleCaps.planned ? "PLANNED" : "FAIL");
    print("PROVIDER_CAPABILITIES", ollamaCaps.chat && ollamaCaps.localOnly && appleCaps.planned ? "OK" : "FAIL");
    print("LOCAL_CHAT", chatResult.ok ? "OK" : "FAIL");
    print("SECURITY", ollamaCaps.tools === false && appleCaps.tools === false ? "OK" : "FAIL");

    const ok = providers.length >= 2 && ollamaCaps.chat && ollamaCaps.localOnly && appleCaps.planned;
    print("READY_FOR_AI_PROVIDER_LAYER", ok && health.ok && model.ok && chatResult.ok ? "YES" : "NO");
    if (!ok || !health.ok || !model.ok || !chatResult.ok) process.exit(1);
}

main().catch(error => {
    print("AI_PROVIDER_LAYER", "FAIL");
    print("RAW_ERROR", error.message || String(error));
    process.exit(1);
});
