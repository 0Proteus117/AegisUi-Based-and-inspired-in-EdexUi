#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const {AssistantMemoryBootstrap} = require("../src/classes/assistant/assistantMemoryBootstrap.class.js");
const {AssistantLocalChat} = require("../src/classes/assistant/assistantLocalChat.class.js");

const projectRoot = path.resolve(__dirname, "..");
const userDataPath = path.join(os.homedir(), "Library", "Application Support", "EdexUi-Eng");
const configPath = path.join(userDataPath, "assistant", "config", "assistant-ai.json");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function readConfig() {
    if (!fs.existsSync(configPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (error) {
        return {};
    }
}

async function main() {
    const memory = new AssistantMemoryBootstrap({projectRoot, userDataPath});
    const chat = new AssistantLocalChat({projectRoot, userDataPath, memory});
    const config = chat.sanitizeConfig(readConfig());

    const health = await chat.client.checkHealth();
    print("OLLAMA_HEALTH", health.ok ? "OK" : "FAIL");
    if (!health.ok) {
        print("OLLAMA_STATUS", health.status);
        print("READY_FOR_WRITTEN_CHAT", "NO");
        process.exit(1);
    }

    const model = await chat.client.ensureModelAvailable(config.model);
    print("OLLAMA_MODEL", model.ok ? "OK" : "MISSING");
    print("OLLAMA_MODEL_NAME", config.model);
    if (!model.ok) {
        print("READY_FOR_WRITTEN_CHAT", "NO");
        process.exit(1);
    }

    const memoryStatus = memory.status();
    print("MEMORY_BOOTSTRAP", memoryStatus.status === "READY" ? "OK" : "FAIL");
    print("MEMORY_FILES", memoryStatus.files || 0);
    if (memoryStatus.status !== "READY") {
        print("READY_FOR_WRITTEN_CHAT", "NO");
        process.exit(1);
    }

    const original = config.enabled;
    if (!original) chat.saveConfig({enabled: true});
    const result = await chat.sendMessage({
        text: "Responde en español con una sola frase: sistema local listo.",
        assistantId: "ares",
        mode: "private"
    });
    if (!original) chat.saveConfig({enabled: false});

    print("LOCAL_CHAT", result.ok && result.response ? "OK" : "FAIL");
    if (result.response) print("LOCAL_CHAT_RESPONSE", result.response.replace(/\s+/g, " ").slice(0, 160));
    print("READY_FOR_WRITTEN_CHAT", result.ok ? "YES" : "NO");
    if (!result.ok) process.exit(1);
}

main().catch(error => {
    print("LOCAL_CHAT", "FAIL");
    print("RAW_ERROR", error.message || String(error));
    print("READY_FOR_WRITTEN_CHAT", "NO");
    process.exit(1);
});
