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

async function main() {
    const memory = new AssistantMemoryBootstrap({projectRoot, userDataPath});
    const chat = new AssistantLocalChat({projectRoot, userDataPath, memory});
    const config = chat.loadConfig();
    const memoryStatus = memory.status();
    const status = await chat.checkLocalAIStatus({force: true});

    print("ASSISTANT_AI_CONFIG", fs.existsSync(configPath) ? "OK" : "MISSING");
    print("ASSISTANT_AI_CONFIG_PATH", configPath);
    print("CHAT_ENABLED", config.enabled ? "YES" : "NO");
    print("OLLAMA_ENDPOINT", config.endpoint);
    print("OLLAMA_MODEL", config.model);
    print("OLLAMA_STATUS", status.status);
    print("OLLAMA_REACHABLE", status.ok ? "YES" : "NO");
    print("OLLAMA_MODELS", status.models && status.models.length ? status.models.join(",") : "NONE");
    print("MEMORY_BOOTSTRAP", memoryStatus.status === "READY" ? "OK" : "FAIL");
    print("MEMORY_FILES", memoryStatus.files || 0);
    print("COMMAND_ROUTER", "OFFLINE");
    print("VOICE", "OFFLINE");
    print("LAST_ERROR", status.lastError || "NONE");
    print("READY_FOR_WRITTEN_CHAT", status.ok && memoryStatus.status === "READY" ? "YES" : "NO");
}

main().catch(error => {
    print("ASSISTANT_LOCAL_AI_DIAGNOSIS", "FAIL");
    print("LAST_ERROR", error.message || String(error));
    process.exit(1);
});
