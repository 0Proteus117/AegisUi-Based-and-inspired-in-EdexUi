#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {execFileSync} = require("child_process");
const {AssistantChatSession} = require("../src/classes/assistant/assistantChatSession.class.js");

const ROOT = path.resolve(__dirname, "..");
const userDataPath = path.join(os.homedir(), "Library", "Application Support", "EdexUi-Eng");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function git(args) {
    try {
        return execFileSync("git", args, {cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 8000}).trim();
    } catch (error) {
        return "";
    }
}

function main() {
    const session = new AssistantChatSession({userDataPath});
    const root = session.rootDir();
    session.clear("gustav");
    session.addMessage("gustav", "user", "session test ping");
    session.addMessage("gustav", "assistant", "session test pong");

    const restored = session.loadProfile("gustav");
    const exportResult = session.exportMarkdown("gustav");
    const privateTracked = git(["ls-files", "assistant/chat"]);
    const staged = git(["diff", "--cached", "--name-only", "--", "assistant/chat"]);

    const ok = fs.existsSync(root)
        && restored.messages.length >= 2
        && exportResult.ok
        && fs.existsSync(exportResult.file)
        && !privateTracked
        && !staged;

    print("CHAT_SESSION_FOLDER", fs.existsSync(root) ? "OK" : "FAIL");
    print("CHAT_SESSION_WRITE_READ", restored.messages.length >= 2 ? "OK" : "FAIL");
    print("CHAT_SESSION_RESTORE", restored.messages.some(item => item.text === "session test ping") ? "OK" : "FAIL");
    print("CHAT_SESSION_EXPORT", exportResult.ok ? "OK" : "FAIL");
    print("CHAT_EXPORTS_TRACKED", privateTracked ? "YES" : "NO");
    print("CHAT_EXPORTS_STAGED", staged ? "YES" : "NO");
    print("CHAT_SESSION", ok ? "OK" : "FAIL");
    if (!ok) process.exit(1);
}

main();
