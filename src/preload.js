"use strict";

const {contextBridge, ipcRenderer, clipboard} = require("electron");
const crypto = require("crypto");

const STUD_CHANNELS = Object.freeze([
    "stud-academic-ai-cancel", "stud-academic-ai-generate", "stud-academic-ai-revision-accept", "stud-academic-ai-revision-candidates", "stud-academic-ai-save-note", "stud-academic-ai-status",
    "stud-academic-context-build", "stud-academic-context-decide", "stud-academic-context-package-create", "stud-academic-context-package-list", "stud-academic-context-package-read", "stud-academic-context-search",
    "stud-assessment-classification-list", "stud-assessment-classification-set", "stud-assignment-requirements", "stud-citation-render", "stud-command-center", "stud-compute-capabilities", "stud-compute-list", "stud-compute-run", "stud-compute-save-result", "stud-core-status", "stud-course-context", "stud-course-organisation",
    "stud-dataset-analyze", "stud-dataset-import", "stud-dataset-list", "stud-dataset-read", "stud-document-analyze", "stud-document-cancel", "stud-document-capabilities", "stud-document-context", "stud-document-create-note", "stud-document-create-revision", "stud-document-import-pdf", "stud-document-list", "stud-document-read-pdf", "stud-document-search",
    "stud-entity-archive", "stud-entity-create", "stud-entity-list", "stud-entity-read", "stud-entity-update", "stud-external-identifier-create", "stud-external-identifier-find",
    "stud-github-cancel", "stud-github-create", "stud-github-list", "stud-github-metadata", "stud-github-normalize",
    "stud-moodle-cancel", "stud-moodle-configure", "stud-moodle-forget-account", "stud-moodle-ics-sync", "stud-moodle-open-web", "stud-moodle-probe", "stud-moodle-status", "stud-moodle-sync", "stud-moodle-sync-preferences",
    "stud-note-save-structured", "stud-notebook-capabilities", "stud-notebook-cell-create", "stud-notebook-cell-delete", "stud-notebook-cell-reorder", "stud-notebook-cell-update", "stud-notebook-create", "stud-notebook-list", "stud-notebook-output-clear", "stud-notebook-read", "stud-notebook-update",
    "stud-orchestration-confirm-reference", "stud-orchestration-context", "stud-orchestration-propose-reference", "stud-orchestration-user-override",
    "stud-paper-import-pdf", "stud-paper-read-oa-pdf", "stud-paper-read-pdf", "stud-paper-save-oa-pdf", "stud-paper-set-oa",
    "stud-progress-activity", "stud-progress-assessments", "stud-progress-metric-sources", "stud-progress-overview", "stud-progress-revision",
    "stud-provenance-create", "stud-provenance-list", "stud-reference-link", "stud-reference-list", "stud-reference-unlink", "stud-relationship-create", "stud-relationship-list",
    "stud-requirements-add-manual", "stud-requirements-approve", "stud-requirements-create-draft", "stud-requirements-create-revision", "stud-requirements-remove-item", "stud-requirements-review-candidate", "stud-requirements-source-preview", "stud-requirements-state", "stud-requirements-update-item",
    "stud-research-cancel", "stud-research-context", "stud-research-library", "stud-research-link", "stud-research-open-access", "stud-research-resolve-crossref", "stud-research-resolve-datacite", "stud-research-save", "stud-research-search", "stud-research-status",
    "stud-revision-context", "stud-revision-list", "stud-revision-overview", "stud-revision-plan", "stud-revision-schedule", "stud-search", "stud-study-session-history", "stud-study-session-start", "stud-study-session-transition",
    "stud-tool-catalog", "stud-tool-detail", "stud-tool-launch", "stud-tool-packs", "stud-tool-preference-update", "stud-tool-preferences-reset", "stud-tool-profile", "stud-tool-profile-update", "stud-working-context-clear", "stud-working-context-read", "stud-working-context-update",
    "stud-workflow-assignment-state", "stud-workflow-create", "stud-workflow-edge-add", "stud-workflow-edge-remove", "stud-workflow-history", "stud-workflow-node-add", "stud-workflow-node-rename", "stud-workflow-node-transition", "stud-workflow-read", "stud-workflow-templates",
    "stud-workflow-conditions", "stud-workflow-blocker-impact", "stud-workflow-blocker-create", "stud-workflow-blocker-update", "stud-workflow-blocker-resolve", "stud-workflow-blocker-cancel", "stud-workflow-checkpoint-create", "stud-workflow-checkpoint-decide",
    "stud-artifact-list", "stud-artifact-read", "stud-artifact-register", "stud-artifact-update", "stud-artifact-relate", "stud-artifact-relationships", "stud-mission-control-state", "stud-operation-list", "stud-operation-read", "stud-operation-events", "stud-operation-artifacts",
    "stud-research-plan-state", "stud-research-plan-create-draft", "stud-research-plan-update", "stud-research-plan-add-topic", "stud-research-plan-update-topic", "stud-research-plan-add-question", "stud-research-plan-update-question", "stud-research-plan-review", "stud-research-plan-create-revision", "stud-topic-dossier-list", "stud-topic-dossier-add", "stud-topic-dossier-update", "stud-research-gap-add", "stud-research-gap-resolve", "stud-research-coverage",
    "stud-zotero-import", "stud-zotero-list", "stud-zotero-status"
]);

const OSINT_CHANNELS = Object.freeze([
    "osint-case-archive", "osint-case-create", "osint-case-export", "osint-case-list", "osint-case-note-create", "osint-case-note-update", "osint-case-read", "osint-case-update",
    "osint-evidence-create", "osint-evidence-export", "osint-evidence-read", "osint-evidence-remove", "osint-evidence-verify",
    "osint-native-query", "osint-source-close", "osint-source-layout", "osint-source-open", "osint-source-reload"
]);

const SERVICE_CHANNELS = Object.freeze([
    "agent-command-data", "agent-command-open-config", "agent-command-run-agent", "agent-command-update-task",
    "applications-list", "calendar-events", "calendar-open-accounts", "calendar-open-privacy",
    "developer-deck-data", "developer-open-config", "developer-open-project-file", "developer-run-script",
    "engineering-open-projects", "engineering-projects", "engineering-save-projects", "geoip-lookup",
    "launch-application", "launch-bay-games", "launch-bay-launch", "launch-bay-open-config",
    "map-layers-read", "map-layers-save", "music-artwork", "music-control", "music-open", "music-open-playlists", "music-play-playlist", "music-playlists", "music-status",
    "rainviewer-metadata", "runtime-config", "tomtom-diagnostic", "tomtom-traffic-diagnostic", "traffic-open-key-page",
    "workspace-open-link", "workspace-state-read", "workspace-state-save"
]);

function fixedInvokes(channels) {
    const api = {};
    channels.forEach(channel => {
        Object.defineProperty(api, channel, {
            enumerable: true,
            value: (...args) => ipcRenderer.invoke(channel, ...args)
        });
    });
    return Object.freeze(api);
}

function safePort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new TypeError("Invalid terminal port.");
    return port;
}

function on(channel, callback) {
    if (typeof callback !== "function") throw new TypeError("Event callback is required.");
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

const bootstrap = ipcRenderer.sendSync("aegis-bootstrap-state");

contextBridge.exposeInMainWorld("aegis", Object.freeze({
    runtime: Object.freeze({
        bootstrap,
        keyboardLayout(name) { return ipcRenderer.sendSync("aegis-keyboard-layout", name); },
        saveSettings(payload) { return ipcRenderer.invoke("aegis-settings-save", payload); },
        openSettings() { return ipcRenderer.invoke("aegis-settings-open"); },
        openShortcuts() { return ipcRenderer.invoke("aegis-shortcuts-open"); },
        setThemeOverride(name) { ipcRenderer.send("setThemeOverride", name); },
        setKeyboardOverride(name) { ipcRenderer.send("setKbOverride", name); },
        log(type, message) { ipcRenderer.send("log", String(type || "info"), String(message || "").slice(0, 4096)); }
    }),
    window: Object.freeze({
        action(action) { return ipcRenderer.invoke("aegis-window-action", {action}); },
        saveState(state) { return ipcRenderer.invoke("aegis-window-state-save", state); },
        onResize(callback) { return on("aegis-window-resize", callback); },
        onLeaveFullscreen(callback) { return on("aegis-window-leave-full-screen", callback); }
    }),
    shortcuts: Object.freeze({
        register() { return ipcRenderer.invoke("aegis-shortcuts-register"); },
        unregister() { return ipcRenderer.invoke("aegis-shortcuts-unregister"); },
        onTriggered(callback) { return on("aegis-shortcut-triggered", callback); }
    }),
    terminal: Object.freeze({
        auth(port) { return ipcRenderer.sendSync(`terminal_auth-${safePort(port)}`); },
        send(port, action, ...args) {
            const allowed = new Set(["Renderer startup", "Resize", "Resend cwd", "Close"]);
            if (!allowed.has(action)) throw new TypeError("Invalid terminal operation.");
            ipcRenderer.send(`terminal_channel-${safePort(port)}`, action, ...args);
        },
        onMessage(port, callback) { return on(`terminal_channel-${safePort(port)}`, callback); },
        spawn() {
            return new Promise(resolve => {
                const listener = (_event, result) => { ipcRenderer.removeListener("ttyspawn-reply", listener); resolve(result); };
                ipcRenderer.on("ttyspawn-reply", listener);
                ipcRenderer.send("ttyspawn", "true");
            });
        }
    }),
    clipboard: Object.freeze({
        readText() { return clipboard.readText().slice(0, 64 * 1024); },
        writeText(value) { clipboard.writeText(String(value == null ? "" : value).slice(0, 64 * 1024)); return true; }
    }),
    system: Object.freeze({
        call(type, args = []) { return ipcRenderer.invoke("aegis-systeminformation-call", {type, args}); }
    }),
    network: Object.freeze({
        externalIp() { return ipcRenderer.invoke("aegis-network-external-ip"); },
        pingConfigured() { return ipcRenderer.invoke("aegis-network-ping"); }
    }),
    updates: Object.freeze({
        check() { return ipcRenderer.invoke("aegis-update-check"); },
        open(url) { return ipcRenderer.invoke("aegis-update-open", {url}); }
    }),
    gearlab: Object.freeze({
        status() { return ipcRenderer.invoke("aegis-gearlab-status"); },
        start() { return ipcRenderer.invoke("aegis-gearlab-start"); },
        open(target) { return ipcRenderer.invoke("aegis-gearlab-open", {target}); }
    }),
    assistant: Object.freeze({
        config() { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "CONFIG"}); },
        saveConfig(value) { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "SAVE_CONFIG", value}); },
        memoryStatus() { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "MEMORY_STATUS"}); },
        installMemory() { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "MEMORY_INSTALL"}); },
        conversationStatus(profile) { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "CONVERSATION_STATUS", profile}); },
        conversationMessages(profile, limit) { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "CONVERSATION_MESSAGES", profile, limit}); },
        clearConversation(profile) { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "CONVERSATION_CLEAR", profile}); },
        exportConversation(profile) { return ipcRenderer.sendSync("aegis-assistant-sync", {operation: "CONVERSATION_EXPORT", profile}); },
        status(force) { return ipcRenderer.invoke("aegis-assistant-status", {force: Boolean(force)}); },
        send(payload) { return ipcRenderer.invoke("aegis-assistant-send", payload); },
        open(target) { return ipcRenderer.invoke("aegis-assistant-open", {target}); }
    }),
    crypto: Object.freeze({
        sha256Text(value) {
            const text = String(value == null ? "" : value);
            if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new RangeError("Hash input exceeds limit.");
            return crypto.createHash("sha256").update(text, "utf8").digest("hex");
        },
        randomId() { return crypto.randomBytes(16).toString("base64url"); },
        utf8Bytes(value) { return Buffer.byteLength(String(value == null ? "" : value), "utf8"); }
    }),
    stud: fixedInvokes(STUD_CHANNELS),
    osint: Object.freeze({
        ...fixedInvokes(OSINT_CHANNELS),
        onSourceEvent(callback) { return on("osint-source-event", callback); }
    }),
    services: fixedInvokes(SERVICE_CHANNELS)
}));
