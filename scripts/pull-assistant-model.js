#!/usr/bin/env node

const {spawnSync} = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const userDataPath = path.join(os.homedir(), "Library", "Application Support", "EdexUi-Eng");
const configPath = path.join(userDataPath, "assistant", "config", "assistant-ai.json");

function readModel() {
    try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        return String(config.model || "llama3.2:3b").trim() || "llama3.2:3b";
    } catch (error) {
        return "llama3.2:3b";
    }
}

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function main() {
    const check = spawnSync("ollama", ["--version"], {encoding: "utf8"});
    if (check.status !== 0) {
        print("OLLAMA_CLI_NOT_FOUND", "YES");
        process.exit(1);
    }

    const model = readModel();
    print("OLLAMA_CLI", "OK");
    print("OLLAMA_PULL_MODEL", model);
    const pull = spawnSync("ollama", ["pull", model], {stdio: "inherit"});
    if (pull.status !== 0) {
        print("OLLAMA_PULL", "FAIL");
        process.exit(pull.status || 1);
    }
    print("OLLAMA_PULL", "OK");
}

main();
