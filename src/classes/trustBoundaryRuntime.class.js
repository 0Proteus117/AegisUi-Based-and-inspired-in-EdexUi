"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const net = require("net");
const {spawn} = require("child_process");
const {pathToFileURL} = require("url");

const SAFE_NAME = /^[A-Za-z0-9._ -]{1,128}$/;

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
    fs.renameSync(temporary, file);
}

function boundedText(value, limit = 512) {
    return String(value == null ? "" : value).trim().slice(0, limit);
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizeSettings(settings = {}) {
    const result = clone(settings) || {};
    delete result.env;
    delete result.tomtomApiKey;
    delete result.aisApiKey;
    result.environmentConfigured = Boolean(settings.env && Object.keys(settings.env).length);
    result.tomtomKeyConfigured = Boolean(settings.tomtomApiKey);
    return result;
}

function validateSettingsUpdate(input = {}, existing = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Settings payload must be an object.");
    const textFields = ["shell", "shellArgs", "cwd", "username", "keyboard", "theme", "iface", "pingAddr", "aegisAppearance"];
    const booleanFields = ["audio", "disableFeedbackAudio", "nointro", "nocursor", "allowWindowed", "keepGeometry", "excludeThreadsFromToplist", "hideDotfiles", "fsListView", "experimentalGlobeFeatures", "experimentalFeatures"];
    const numberFields = ["termFontSize", "audioVolume", "port", "monitor", "clockHours"];
    const next = {...existing};
    textFields.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(input, key)) return;
        const value = boundedText(input[key], key === "cwd" ? 1024 : 256);
        if (key === "aegisAppearance" && !["light", "dark", "system"].includes(value)) throw new TypeError("Invalid appearance mode.");
        if (["theme", "keyboard"].includes(key) && !SAFE_NAME.test(value)) throw new TypeError(`Invalid ${key}.`);
        next[key] = value;
    });
    booleanFields.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(input, key)) next[key] = Boolean(input[key]);
    });
    numberFields.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(input, key)) return;
        const value = Number(input[key]);
        if (!Number.isFinite(value)) throw new TypeError(`Invalid ${key}.`);
        next[key] = value;
    });
    if (Object.prototype.hasOwnProperty.call(input, "tomtomApiKey")) {
        const key = String(input.tomtomApiKey || "").trim();
        if (key.length > 256 || /[\u0000-\u001f\s]/.test(key)) throw new TypeError("Invalid TomTom credential.");
        next.tomtomApiKey = key;
    }
    if (next.port && (next.port < 1024 || next.port > 65530)) throw new TypeError("Terminal port is outside the permitted range.");
    if (next.audioVolume != null) next.audioVolume = Math.max(0, Math.min(1, next.audioVolume));
    if (next.termFontSize != null) next.termFontSize = Math.max(8, Math.min(48, next.termFontSize));
    return next;
}

function fetchJson(url, options = {}, maxBytes = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, options, response => {
            let size = 0;
            const chunks = [];
            response.on("data", chunk => {
                size += chunk.length;
                if (size > maxBytes) {
                    request.destroy(new Error("Response exceeded the bounded size."));
                    return;
                }
                chunks.push(chunk);
            });
            response.on("end", () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
            });
        });
        request.setTimeout(8000, () => request.destroy(new Error("Request timed out.")));
        request.on("error", reject);
    });
}

function registerTrustBoundaryRuntime(options = {}) {
    const {ipc, app, dialog, shell, screen, globalShortcut, getWindow} = options;
    const files = options.files;
    const settingsFile = files.settings;
    const shortcutsFile = files.shortcuts;
    const lastWindowStateFile = files.lastWindowState;
    const themesDir = files.themes;
    const keyboardsDir = files.keyboards;
    const fontsDir = files.fonts;
    const sourceRoot = files.sourceRoot;
    const {AssistantMemoryBootstrap} = require("./assistant/assistantMemoryBootstrap.class.js");
    const {AssistantChatSession} = require("./assistant/assistantChatSession.class.js");
    const {AssistantLocalChat} = require("./assistant/assistantLocalChat.class.js");
    const assistantMemory = new AssistantMemoryBootstrap({projectRoot: path.resolve(sourceRoot, ".."), userDataPath: app.getPath("userData")});
    const assistantSession = new AssistantChatSession({userDataPath: app.getPath("userData")});
    const assistantChat = new AssistantLocalChat({projectRoot: path.resolve(sourceRoot, ".."), userDataPath: app.getPath("userData"), memory: assistantMemory, chatSession: assistantSession});

    function namedJson(directory, name, fallback = {}) {
        const safe = boundedText(name, 128);
        if (!SAFE_NAME.test(safe)) throw new TypeError("Invalid named asset.");
        return readJson(path.join(directory, `${safe}.json`), fallback);
    }

    function bootstrap() {
        const rawSettings = readJson(settingsFile, {});
        const settings = sanitizeSettings(rawSettings);
        const theme = namedJson(themesDir, rawSettings.theme || "tron", {});
        const keyboard = namedJson(keyboardsDir, rawSettings.keyboard || "en-US", {});
        const fontUrl = family => pathToFileURL(path.join(fontsDir, `${String(family || "").toLowerCase().replace(/ /g, "_")}.woff2`)).href;
        return {
            settings,
            shortcuts: readJson(shortcutsFile, []),
            lastWindowState: readJson(lastWindowStateFile, {}),
            theme,
            keyboard,
            themes: fs.readdirSync(themesDir).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5)).sort(),
            keyboards: fs.readdirSync(keyboardsDir).filter(name => name.endsWith(".json")).map(name => name.slice(0, -5)).sort(),
            icons: readJson(path.join(sourceRoot, "assets", "icons", "file-icons.json"), {}),
            globeGrid: readJson(path.join(sourceRoot, "assets", "misc", "grid.json"), []),
            bootLog: fs.readFileSync(path.join(sourceRoot, "assets", "misc", "boot_log.txt"), "utf8").split("\n"),
            fonts: {
                main: fontUrl(theme.cssvars && theme.cssvars.font_main),
                light: fontUrl(theme.cssvars && theme.cssvars.font_main_light),
                terminal: fontUrl(theme.terminal && theme.terminal.fontFamily)
            },
            runtime: {
                appVersion: app.getVersion(),
                platform: process.platform,
                osType: os.type(),
                osRelease: os.release(),
                arch: os.arch(),
                uptime: Math.floor(os.uptime()),
                nointro: process.argv.includes("--nointro"),
                nocursor: process.argv.includes("--nocursor"),
                displayCount: screen.getAllDisplays().length,
                displayName: boundedText(rawSettings.username || os.userInfo().username, 120)
            }
        };
    }

    ipc.on("aegis-bootstrap-state", event => { event.returnValue = bootstrap(); });
    ipc.on("aegis-keyboard-layout", (event, name) => { event.returnValue = namedJson(keyboardsDir, name, {}); });
    ipc.handle("aegis-settings-save", (_event, payload) => {
        const next = validateSettingsUpdate(payload, readJson(settingsFile, {}));
        atomicJson(settingsFile, next);
        return sanitizeSettings(next);
    });
    ipc.handle("aegis-settings-open", () => shell.openPath(settingsFile));
    ipc.handle("aegis-shortcuts-open", () => shell.openPath(shortcutsFile));
    ipc.handle("aegis-window-action", (_event, payload = {}) => {
        const win = getWindow();
        if (!win || win.isDestroyed()) return false;
        const action = boundedText(payload.action, 32);
        if (action === "FOCUS") win.focus();
        else if (action === "MINIMIZE") win.minimize();
        else if (action === "DEVTOOLS") win.webContents.toggleDevTools();
        else if (action === "RELAUNCH") { app.relaunch(); app.quit(); }
        else if (action === "QUIT") app.quit();
        else if (action === "TOGGLE_FULLSCREEN") win.setFullScreen(!win.isFullScreen());
        else if (action === "NORMALIZE_GEOMETRY") {
            if (!win.isFullScreen()) {
                const [width, height] = win.getSize();
                if (width >= height) win.setSize(width, Math.round(width * 9 / 16));
                else win.setSize(Math.round(height * 16 / 9), height);
            }
        } else if (action === "SET_COMPACT") win.setSize(960, 540);
        else throw new TypeError("Unknown window action.");
        return {fullScreen: win.isFullScreen(), maximized: win.isMaximized(), size: win.getSize()};
    });
    ipc.handle("aegis-window-state-save", (_event, payload = {}) => {
        const next = {useFullscreen: Boolean(payload.useFullscreen)};
        atomicJson(lastWindowStateFile, next);
        return next;
    });

    ipc.handle("aegis-shortcuts-register", event => {
        globalShortcut.unregisterAll();
        const definitions = readJson(shortcutsFile, []).filter(item => item && item.enabled && ["app", "shell"].includes(item.type));
        definitions.forEach(item => {
            const trigger = boundedText(item.trigger, 80);
            if (!trigger) return;
            const register = (accelerator, action) => {
                try { globalShortcut.register(accelerator, () => event.sender.send("aegis-shortcut-triggered", action)); } catch (error) {}
            };
            if (item.type === "app" && item.action === "TAB_X") {
                for (let index = 1; index <= 5; index += 1) register(trigger.replace("X", index), {type: "app", action: `TAB_${index}`});
            } else if (item.type === "app") register(trigger, {type: "app", action: boundedText(item.action, 64)});
            else register(trigger, {type: "shell", action: boundedText(item.action, 4096), linebreak: Boolean(item.linebreak)});
        });
        return {registered: definitions.length};
    });
    ipc.handle("aegis-shortcuts-unregister", () => { globalShortcut.unregisterAll(); return true; });

    ipc.handle("aegis-network-external-ip", async () => {
        const data = await fetchJson("https://myexternalip.com/json", {headers: {"User-Agent": `AegisUi/${app.getVersion()}`}}, 64 * 1024);
        const ip = boundedText(data && data.ip, 64);
        if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) throw new Error("External IP provider returned malformed data.");
        return {ip};
    });
    ipc.handle("aegis-network-ping", () => new Promise((resolve, reject) => {
        const configured = boundedText(readJson(settingsFile, {}).pingAddr || "1.1.1.1", 253);
        const host = configured;
        const port = 80;
        if (!/^(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/.test(host) && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) throw new TypeError("Invalid ping host.");
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Invalid ping port.");
        const started = process.hrtime.bigint();
        const socket = net.createConnection({host, port});
        socket.setTimeout(3000);
        socket.once("connect", () => { const ms = Number(process.hrtime.bigint() - started) / 1e6; socket.destroy(); resolve(ms); });
        socket.once("timeout", () => socket.destroy(new Error("Ping timed out.")));
        socket.once("error", reject);
    }));

    ipc.handle("aegis-update-check", async () => {
        const releases = await fetchJson("https://api.github.com/repos/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/releases", {headers: {"User-Agent": `AegisUi/${app.getVersion()}`, Accept: "application/vnd.github+json"}}, 1024 * 1024);
        const release = Array.isArray(releases) ? releases.find(item => item && !item.draft && /^edexui-eng-v\d+\.\d+\.\d+$/.test(String(item.tag_name || ""))) : null;
        return release ? {current: app.getVersion(), tag: release.tag_name, url: release.html_url} : {current: app.getVersion(), tag: null, url: null};
    });
    ipc.handle("aegis-update-open", (_event, payload = {}) => {
        const target = new URL(String(payload.url || ""));
        if (target.protocol !== "https:" || target.hostname !== "github.com" || !target.pathname.startsWith("/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/")) throw new TypeError("Update URL rejected.");
        return shell.openExternal(target.href);
    });

    ipc.on("aegis-assistant-sync", (event, payload = {}) => {
        const operation = boundedText(payload.operation, 48);
        const profile = ["gustav", "angie", "ares", "aphrodite"].includes(payload.profile) ? payload.profile : "gustav";
        try {
            if (operation === "CONFIG") event.returnValue = assistantChat.loadConfig();
            else if (operation === "SAVE_CONFIG") event.returnValue = assistantChat.saveConfig(payload.value || {});
            else if (operation === "MEMORY_STATUS") event.returnValue = assistantMemory.status();
            else if (operation === "MEMORY_INSTALL") event.returnValue = assistantMemory.install();
            else if (operation === "CONVERSATION_STATUS") event.returnValue = assistantChat.conversationStatus(profile);
            else if (operation === "CONVERSATION_MESSAGES") event.returnValue = assistantChat.conversationMessages(profile, Math.max(1, Math.min(Number(payload.limit || 40), 160)));
            else if (operation === "CONVERSATION_CLEAR") event.returnValue = assistantChat.clearConversation(profile);
            else if (operation === "CONVERSATION_EXPORT") event.returnValue = assistantChat.exportConversation(profile);
            else throw new TypeError("Unknown assistant operation.");
        } catch (error) {
            event.returnValue = {ok: false, status: "ERROR", error: boundedText(error.message || error, 240)};
        }
    });
    ipc.handle("aegis-assistant-status", (_event, payload = {}) => assistantChat.checkLocalAIStatus({force: Boolean(payload.force)}));
    ipc.handle("aegis-assistant-send", (_event, payload = {}) => assistantChat.sendMessage({
        text: boundedText(payload.text, 12000),
        assistantId: boundedText(payload.assistantId, 24),
        mode: boundedText(payload.mode, 24)
    }));
    ipc.handle("aegis-assistant-open", (_event, payload = {}) => {
        const target = boundedText(payload.target, 24);
        if (target === "memory") return assistantMemory.openFolder();
        if (target === "chat") return assistantChat.openChatFolder();
        throw new TypeError("Unknown assistant folder target.");
    });

    function gearLabRoot() {
        const candidates = [
            path.resolve(sourceRoot, "..", "tools", "aegis-gearlab"),
            path.resolve(sourceRoot, "..", "..", "tools", "aegis-gearlab"),
            process.resourcesPath ? path.join(process.resourcesPath, "aegis-gearlab") : ""
        ].filter(Boolean);
        return candidates.find(candidate => fs.existsSync(path.join(candidate, "run_api.sh"))) || null;
    }
    ipc.handle("aegis-gearlab-status", () => {
        const root = gearLabRoot();
        return {installed: Boolean(root), backendReady: Boolean(root && fs.existsSync(path.join(root, ".venv", "bin", "python")))};
    });
    ipc.handle("aegis-gearlab-start", () => {
        const root = gearLabRoot();
        if (!root) throw new Error("GearLab module path is unavailable.");
        if (!fs.existsSync(path.join(root, ".venv", "bin", "python"))) throw new Error("GearLab local backend is not installed.");
        const child = spawn("/bin/zsh", [path.join(root, "run_api.sh")], {cwd: root, detached: true, stdio: "ignore", env: {PATH: process.env.PATH || "/usr/bin:/bin"}});
        child.unref();
        return {started: true};
    });
    ipc.handle("aegis-gearlab-open", (_event, payload = {}) => {
        const target = boundedText(payload.target, 16);
        if (target === "app") return shell.openExternal("http://127.0.0.1:8765/");
        const root = gearLabRoot();
        if (!root || !["docs", "exports"].includes(target)) throw new Error("GearLab target is unavailable.");
        return shell.openPath(target === "docs" ? path.join(root, "README.md") : path.join(root, "exports"));
    });

    return {bootstrap};
}

module.exports = {registerTrustBoundaryRuntime, sanitizeSettings, validateSettingsUpdate};
