#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {pathToFileURL} = require("url");
const {isTrustedMainFrame, createTrustedIpcMain} = require("../src/classes/ipcSecurity.class.js");

const ROOT = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
let passed = 0;
const pending = [];
function check(name, assertion) {
    const result = assertion();
    if (result && typeof result.then === "function") {
        pending.push(result.then(() => { passed += 1; console.log(`PASS ${name}`); }));
    } else {
        passed += 1;
        console.log(`PASS ${name}`);
    }
}

const boot = read("src/_boot.js");
const preload = read("src/preload.js");
const renderer = read("src/_renderer.js");
const html = read("src/ui.html");
const sourceUi = path.join(ROOT, "src", "ui.html");

check("PRIMARY_WINDOW_NODE_INTEGRATION_DISABLED", () => assert.match(boot, /nodeIntegration:\s*false/));
check("PRIMARY_WINDOW_CONTEXT_ISOLATION_ENABLED", () => assert.match(boot, /contextIsolation:\s*true/));
check("PRIMARY_WINDOW_HAS_PRELOAD", () => assert.match(boot, /preload:\s*path\.join\(__dirname,\s*"preload\.js"\)/));
check("RENDERER_HAS_NO_REQUIRE_CALL", () => assert.doesNotMatch(renderer, /\brequire\s*\(/));
check("RENDERER_HAS_NO_NODE_PROCESS", () => assert.doesNotMatch(renderer, /\bprocess\s*\./));
check("RENDERER_HAS_NO_BUFFER", () => assert.doesNotMatch(renderer, /\bBuffer\b/));
check("LEGACY_PRIVILEGED_RENDERER_SCRIPTS_NOT_LOADED", () => {
    assert.doesNotMatch(html, /classes\/(?:terminal|filesystem)\.class\.js/);
    assert.doesNotMatch(html, /assistant\/(?:assistantLocalChat|assistantMemoryBootstrap|assistantChatSession|assistantOllamaClient)\.class\.js/);
});
check("RAW_IPC_RENDERER_NOT_EXPOSED", () => {
    // The preload may import ipcRenderer internally; it must never publish that
    // object (or an alias for it) into the page's global bridge.
    assert.doesNotMatch(preload, /\bipcRenderer\s*:/);
    assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer/);
});
check("RAW_ELECTRON_NOT_EXPOSED", () => assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*electron/i));
check("GENERIC_FILESYSTEM_NOT_EXPOSED", () => assert.doesNotMatch(preload, /\bfiles:\s*Object\.freeze/));
check("GENERIC_SHELL_NOT_EXPOSED", () => {
    assert.doesNotMatch(preload, /child_process|require\(["'](?:node:)?child_process["']\)/);
    assert.doesNotMatch(preload, /\bexec\s*\(|\bexec\s*:/);
});
check("GENERIC_NETWORK_PROXY_NOT_EXPOSED", () => assert.doesNotMatch(preload, /fetch\s*\(|https?\s*:/));
check("REMOTE_DEPENDENCY_REMOVED", () => {
    assert.doesNotMatch(read("src/package.json"), /@electron\/remote/);
    assert.doesNotMatch(read("src/package-lock.json"), /@electron\/remote/);
});

check("TRUSTED_MAIN_FRAME_EXACT_MATCH", () => {
    const trusted = {senderFrame: {url: pathToFileURL(sourceUi).href, parent: null}};
    assert.strictEqual(isTrustedMainFrame(trusted, sourceUi), true);
    assert.strictEqual(isTrustedMainFrame({senderFrame: {url: `${pathToFileURL(sourceUi).href}?x=1`, parent: null}}, sourceUi), false);
    assert.strictEqual(isTrustedMainFrame({senderFrame: {url: pathToFileURL(sourceUi).href, parent: {}}}, sourceUi), false);
    assert.strictEqual(isTrustedMainFrame({senderFrame: {url: "https://example.invalid/ui.html", parent: null}}, sourceUi), false);
});

check("TRUSTED_IPC_REJECTS_UNTRUSTED_SENDERS", async () => {
    const handlers = new Map();
    const fakeIpc = {handle: (channel, handler) => handlers.set(channel, handler), on() {}, once() {}, removeHandler() {}, removeListener() {}};
    createTrustedIpcMain(fakeIpc, sourceUi).handle("bounded-operation", () => "OK");
    const handler = handlers.get("bounded-operation");
    assert.strictEqual(await handler({senderFrame: {url: pathToFileURL(sourceUi).href, parent: null}}), "OK");
    assert.throws(
        () => handler({senderFrame: {url: "file:///tmp/evil.html", parent: null}}),
        error => error.code === "UNTRUSTED_RENDERER"
    );
});

check("GENERIC_FILESYSTEM_HANDLERS_ABSENT", () => {
    const runtime = read("src/classes/trustBoundaryRuntime.class.js");
    assert.doesNotMatch(runtime, /ipc\.(?:handle|on)\(["']aegis-files-/);
    assert.doesNotMatch(preload, /aegis-files-/);
});

check("RENDERER_BRIDGE_REJECTS_ARBITRARY_CHANNEL", async () => {
    const bridge = read("src/classes/rendererBridge.class.js");
    const context = {window: {aegis: {
        stud: {}, osint: {onSourceEvent() {}}, services: {},
        runtime: {bootstrap: {runtime: {platform: "test", appVersion: "test"}}, log() {}, setThemeOverride() {}, setKeyboardOverride() {}},
        terminal: {spawn: async () => "OK"}, system: {call: async () => ({})},
        crypto: {randomId: () => "id", sha256Text: () => "hash", utf8Bytes: () => 0}
    }}, console};
    vm.runInNewContext(bridge, context);
    await assert.rejects(context.window.aegisIpc.invoke("arbitrary-channel", {}), error => error.code === "IPC_NOT_EXPOSED");
});

Promise.all(pending).then(() => {
    console.log(`ELECTRON_TRUST_BOUNDARY: PASS (${passed} checks)`);
}).catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
