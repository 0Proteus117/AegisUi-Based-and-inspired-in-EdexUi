const signale = require("signale");
const {app, BrowserWindow, dialog, shell, nativeImage, WebContentsView, session} = require("electron");
const {execFile, execFileSync} = require("child_process");
const {promisify} = require("util");

process.on("uncaughtException", e => {
    signale.fatal(e);
    dialog.showErrorBox("eDEX-UI crashed", e.message || "Cannot retrieve error message.");
    if (tty) {
        tty.close();
    }
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    process.exit(1);
});

signale.start(`Starting EdexUi-Eng v${app.getVersion()}`);
signale.info(`With Node ${process.versions.node} and Electron ${process.versions.electron}`);
signale.info(`Renderer is Chrome ${process.versions.chrome}`);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    signale.fatal("Error: Another instance of EdexUi-Eng is already running. Cannot proceed.");
    app.exit(1);
}

signale.time("Startup");

const electron = require("electron");
const remoteMain = require('@electron/remote/main');
remoteMain.initialize();
const ipc = electron.ipcMain;
const path = require("path");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");
const which = require("which");
const Terminal = require("./classes/terminal.class.js").Terminal;
const OsintToolsRegistry = require("./classes/workspaces/osintTools.registry.js");

ipc.on("log", (e, type, content) => {
    signale[type](content);
});

var win, tty, extraTtys;
let osintSourceView = null;
let osintSourceMetadata = null;
let osintSourceSession = null;
const settingsFile = path.join(electron.app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(electron.app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(electron.app.getPath("userData"), "lastWindowState.json");
const projectsFile = path.join(electron.app.getPath("userData"), "projects.json");
const musicPlaylistsFile = path.join(electron.app.getPath("userData"), "music-playlists.json");
const mapLayersFile = path.join(electron.app.getPath("userData"), "map-layers.json");
const launchBayGamesFile = path.join(electron.app.getPath("userData"), "launch-bay-games.json");
const developerDeckFile = path.join(electron.app.getPath("userData"), "developer-deck.json");
const agentCommandFile = path.join(electron.app.getPath("userData"), "agent-command.json");
const workspaceStateFile = path.join(electron.app.getPath("userData"), "workspace-state.json");
const themesDir = path.join(electron.app.getPath("userData"), "themes");
const innerThemesDir = path.join(__dirname, "assets/themes");
const kblayoutsDir = path.join(electron.app.getPath("userData"), "keyboards");
const innerKblayoutsDir = path.join(__dirname, "assets/kb_layouts");
const fontsDir = path.join(electron.app.getPath("userData"), "fonts");
const innerFontsDir = path.join(__dirname, "assets/fonts");
let geoLookup = null;
let geoLookupReady = false;
let applicationsCache = null;
let knownApplications = new Set();
const execFileAsync = promisify(execFile);
const musicArtworkCache = new Map();

function envFlag(name) {
    return /^(1|true|yes|on)$/i.test(String(process.env[name] || ""));
}

function defaultMapLayersConfig() {
    return {
        version: 1,
        storageKey: "aegisui-map-layers-v1",
        layers: {
            ROAD_TRAFFIC: {active: false, opacity: 1, mode: "live"},
            WEATHER_RADAR: {active: true, opacity: 0.55, mode: "live"},
            AIR_TRAFFIC: {active: false, opacity: 1, mode: "placeholder"},
            MARITIME_AIS: {active: false, opacity: 1, mode: "placeholder"},
            MARINE_WEATHER: {active: false, opacity: 1, mode: "live"},
            SATELLITES: {active: false, opacity: 1, mode: "placeholder"},
            OCEAN_ALERTS: {active: false, opacity: 1, mode: "placeholder"}
        }
    };
}

function sanitizeMapLayersConfig(input = {}) {
    const allowedLayers = Object.keys(defaultMapLayersConfig().layers);
    const sourceLayers = input && typeof input === "object" && input.layers && typeof input.layers === "object"
        ? input.layers
        : input;
    const defaults = defaultMapLayersConfig();
    const layers = {};

    allowedLayers.forEach(id => {
        const source = sourceLayers && sourceLayers[id] && typeof sourceLayers[id] === "object"
            ? sourceLayers[id]
            : {};
        const fallback = defaults.layers[id];
        const opacity = Number(source.opacity);
        layers[id] = {
            active: typeof source.active === "boolean" ? source.active : fallback.active,
            opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : fallback.opacity,
            mode: typeof source.mode === "string" ? source.mode.slice(0, 32) : fallback.mode
        };
    });

    return {
        version: 1,
        storageKey: defaults.storageKey,
        updatedAt: new Date().toISOString(),
        layers
    };
}

function readMapLayersConfig() {
    try {
        if (!fs.existsSync(mapLayersFile)) return defaultMapLayersConfig();
        return sanitizeMapLayersConfig(JSON.parse(fs.readFileSync(mapLayersFile, "utf8")));
    } catch (error) {
        return defaultMapLayersConfig();
    }
}

function writeMapLayersConfig(input) {
    const cleanConfig = sanitizeMapLayersConfig(input);
    const temporaryFile = `${mapLayersFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(cleanConfig, null, 4), {encoding: "utf8"});
    fs.renameSync(temporaryFile, mapLayersFile);
    return cleanConfig;
}

function defaultLaunchBayGames() {
    return {
        version: 1,
        description: "Manual local game library for AegisUi Launch Bay. Keep personal paths local and do not commit this file.",
        games: [
            {
                id: "steam-game-example",
                title: "Add Steam Game",
                platform: "Steam",
                launchUrl: "",
                coverPath: "",
                heroPath: "",
                status: "missing",
                tags: ["steam", "example", "configure"]
            },
            {
                id: "manual-game-example",
                title: "Manual Game Slot",
                platform: "Manual",
                launchUrl: "",
                coverPath: "",
                heroPath: "",
                status: "missing",
                tags: ["manual", "example"]
            }
        ]
    };
}

function cleanLaunchText(value, fallback, maximum) {
    const text = String(value || "").trim().slice(0, maximum);
    return text || fallback;
}

function makeLaunchBayId(value, index) {
    return cleanLaunchText(value, `game-${index + 1}`, 80)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || `game-${index + 1}`;
}

function localImageFileUrl(filePath) {
    const value = String(filePath || "").trim();
    if (!value || !path.isAbsolute(value)) return "";
    const extension = path.extname(value).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "";
    if (!fs.existsSync(value)) return "";
    return url.pathToFileURL(value).toString();
}

function sanitizeLaunchUrl(value) {
    const launchUrl = String(value || "").trim().slice(0, 2048);
    if (!launchUrl) return "";

    const parsed = new URL(launchUrl);
    const allowedProtocols = new Set([
        "steam:",
        "https:",
        "com.epicgames.launcher:",
        "goggalaxy:",
        "battlenet:"
    ]);
    if (!allowedProtocols.has(parsed.protocol)) {
        throw new Error("Launch URL protocol is not allowed.");
    }

    const steamRoute = `${parsed.hostname}${parsed.pathname}`.replace(/^\/+/, "");
    if (parsed.protocol === "steam:" && !/^(rungameid\/\d+|open\/games)$/i.test(steamRoute)) {
        throw new Error("Steam launch URLs must use steam://rungameid/<APP_ID> or steam://open/games.");
    }

    if (parsed.protocol === "https:" && !parsed.hostname) {
        throw new Error("HTTPS launch URL must include a host.");
    }

    return parsed.toString();
}

function getOsintSource(sourceId) {
    const source = OsintToolsRegistry && OsintToolsRegistry.getEmbeddedTool
        ? OsintToolsRegistry.getEmbeddedTool(String(sourceId || ""))
        : null;
    return source || null;
}

function isAllowedOsintSourceUrl(target, source) {
    try {
        const parsed = new URL(String(target || ""));
        if (parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase();
        return (source.allowedHosts || []).some(allowed => {
            const allowedHost = String(allowed || "").toLowerCase();
            return host === allowedHost || host.endsWith(`.${allowedHost}`);
        });
    } catch (error) {
        return false;
    }
}

function sendOsintSourceEvent(payload = {}) {
    if (!win || win.isDestroyed()) return;
    win.webContents.send("osint-source-event", payload);
}

function getOsintSourceSession() {
    if (osintSourceSession) return osintSourceSession;
    osintSourceSession = session.fromPartition("persist:aegis-osint-sources");
    osintSourceSession.setPermissionCheckHandler(() => false);
    osintSourceSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    return osintSourceSession;
}

function closeOsintSourceView() {
    if (!osintSourceView) return;
    try {
        if (win && !win.isDestroyed()) win.contentView.removeChildView(osintSourceView);
        if (!osintSourceView.webContents.isDestroyed()) osintSourceView.webContents.close();
    } catch (error) {
        signale.warn(`OSINT source close warning: ${error.message}`);
    }
    osintSourceView = null;
    osintSourceMetadata = null;
}

function setOsintSourceBounds(bounds = {}) {
    if (!osintSourceView || !win || win.isDestroyed()) return false;
    const contentBounds = win.getContentBounds();
    const width = Math.max(1, Math.min(Number(bounds.width) || 1, contentBounds.width));
    const height = Math.max(1, Math.min(Number(bounds.height) || 1, contentBounds.height));
    const x = Math.max(0, Math.min(Number(bounds.x) || 0, contentBounds.width - 1));
    const y = Math.max(0, Math.min(Number(bounds.y) || 0, contentBounds.height - 1));
    osintSourceView.setBounds({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.min(width, contentBounds.width - x)),
        height: Math.round(Math.min(height, contentBounds.height - y))
    });
    return true;
}

function openOsintSourceView(source) {
    if (!win || win.isDestroyed()) throw new Error("AegisUi window is not available.");
    closeOsintSourceView();
    const view = new WebContentsView({
        webPreferences: {
            session: getOsintSourceSession(),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: false,
            webviewTag: false,
            nativeWindowOpen: false
        }
    });
    const contents = view.webContents;
    contents.__aegisOsintSource = source;
    contents.setWindowOpenHandler(({url: target}) => {
        if (/^https:/i.test(String(target || ""))) shell.openExternal(target).catch(() => {});
        return {action: "deny"};
    });
    contents.on("will-navigate", (event, target) => {
        if (isAllowedOsintSourceUrl(target, source)) return;
        event.preventDefault();
        if (/^https:/i.test(String(target || ""))) shell.openExternal(target).catch(() => {});
    });
    contents.on("did-start-loading", () => sendOsintSourceEvent({sourceId: source.id, status: "LOADING"}));
    contents.on("did-finish-load", () => sendOsintSourceEvent({sourceId: source.id, status: "READY"}));
    contents.on("did-fail-load", (_event, code, description, validatedURL) => {
        if (code === -3) return;
        sendOsintSourceEvent({
            sourceId: source.id,
            status: "ERROR",
            error: `Source load failed (${code}): ${description}`,
            url: validatedURL
        });
    });

    osintSourceView = view;
    osintSourceMetadata = source;
    win.contentView.addChildView(view);
    setOsintSourceBounds({x: 0, y: 0, width: 1, height: 1});
    contents.loadURL(source.url).catch(error => {
        sendOsintSourceEvent({sourceId: source.id, status: "ERROR", error: error.message || "Source load failed."});
    });
}

async function queryWaybackAvailability(query) {
    let target = String(query || "").trim().slice(0, 2048);
    if (!target) throw new Error("A URL is required.");
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    const parsedTarget = new URL(target);
    if (!["http:", "https:"].includes(parsedTarget.protocol)) throw new Error("Only HTTP and HTTPS URLs can be checked.");

    const endpoint = `https://archive.org/wayback/available?url=${encodeURIComponent(parsedTarget.toString())}`;
    const response = await getJSON(endpoint);
    const closest = response && response.archived_snapshots && response.archived_snapshots.closest;
    if (!closest || !closest.available) {
        return {
            available: false,
            message: "No public snapshot was returned for this URL."
        };
    }
    const rawSnapshotUrl = String(closest.url || "");
    let snapshot;
    try {
        snapshot = new URL(rawSnapshotUrl);
    } catch (_error) {
        throw new Error("Archive provider returned an invalid snapshot URL.");
    }
    // The availability API still returns legacy http://web.archive.org links for
    // some captures. Accept only that exact host, then upgrade it before the
    // renderer ever receives the URL.
    if (snapshot.hostname.toLowerCase() !== "web.archive.org" || !["http:", "https:"].includes(snapshot.protocol)) {
        throw new Error("Archive provider returned an unexpected snapshot URL.");
    }
    snapshot.protocol = "https:";
    const snapshotUrl = snapshot.toString();
    return {
        available: true,
        status: String(closest.status || "AVAILABLE"),
        timestamp: String(closest.timestamp || ""),
        snapshotUrl
    };
}

function sanitizeLaunchBayGames(input = {}) {
    const sourceGames = input && Array.isArray(input.games) ? input.games : [];
    const usedIds = new Set();
    const games = sourceGames.slice(0, 200).map((game, index) => {
        const item = game && typeof game === "object" ? game : {};
        let id = makeLaunchBayId(item.id || item.title, index);
        let suffix = 2;
        while (usedIds.has(id)) id = `${id}-${suffix++}`;
        usedIds.add(id);

        let launchUrl = "";
        try {
            launchUrl = sanitizeLaunchUrl(item.launchUrl);
        } catch (error) {
            launchUrl = "";
        }

        const status = ["installed", "missing", "external"].includes(item.status)
            ? item.status
            : (launchUrl ? "external" : "missing");

        return {
            id,
            title: cleanLaunchText(item.title, `GAME ${index + 1}`, 90),
            platform: cleanLaunchText(item.platform, "Manual", 40),
            launchUrl,
            coverPath: String(item.coverPath || "").trim().slice(0, 1024),
            heroPath: String(item.heroPath || "").trim().slice(0, 1024),
            coverUrl: localImageFileUrl(item.coverPath),
            heroUrl: localImageFileUrl(item.heroPath),
            status,
            tags: Array.isArray(item.tags)
                ? item.tags.slice(0, 12).map(tag => cleanLaunchText(tag, "", 32)).filter(Boolean)
                : []
        };
    });

    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        games
    };
}

function readLaunchBayGames() {
    try {
        if (!fs.existsSync(launchBayGamesFile)) return sanitizeLaunchBayGames(defaultLaunchBayGames());
        return sanitizeLaunchBayGames(JSON.parse(fs.readFileSync(launchBayGamesFile, "utf8")));
    } catch (error) {
        return sanitizeLaunchBayGames(defaultLaunchBayGames());
    }
}

function defaultDeveloperDeckConfig() {
    const fallbackProject = process.env.AEGISUI_DEVELOPER_PROJECT
        || path.resolve(__dirname, "..");
    return {
        version: 1,
        description: "Local Developer Deck preferences. Do not store secrets here.",
        activeProjectPath: fallbackProject,
        favoriteScripts: ["start", "dev", "test", "build", "security:audit"],
        maxModifiedFiles: 30
    };
}

function sanitizeDeveloperDeckConfig(input = {}) {
    const defaults = defaultDeveloperDeckConfig();
    const requestedPath = String(input.activeProjectPath || defaults.activeProjectPath || "").trim();
    const activeProjectPath = path.isAbsolute(requestedPath) && fs.existsSync(requestedPath)
        ? requestedPath
        : defaults.activeProjectPath;
    const favorites = Array.isArray(input.favoriteScripts)
        ? input.favoriteScripts
        : defaults.favoriteScripts;
    const maxModifiedFiles = Number(input.maxModifiedFiles);

    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        activeProjectPath,
        favoriteScripts: favorites
            .map(script => String(script || "").trim().slice(0, 80))
            .filter(script => /^[A-Za-z0-9:_-]+$/.test(script))
            .slice(0, 16),
        maxModifiedFiles: Number.isFinite(maxModifiedFiles)
            ? Math.max(5, Math.min(100, Math.round(maxModifiedFiles)))
            : defaults.maxModifiedFiles
    };
}

function readDeveloperDeckConfig() {
    try {
        if (!fs.existsSync(developerDeckFile)) return sanitizeDeveloperDeckConfig(defaultDeveloperDeckConfig());
        return sanitizeDeveloperDeckConfig(JSON.parse(fs.readFileSync(developerDeckFile, "utf8")));
    } catch (error) {
        return sanitizeDeveloperDeckConfig(defaultDeveloperDeckConfig());
    }
}

function isSensitiveProjectPath(filePath) {
    const base = path.basename(filePath).toLowerCase();
    return base === ".env"
        || base.startsWith(".env.")
        || /token|secret|credential|password|cookie|session|private|keychain/.test(base)
        || /\.(pem|key|p8|p12|crt|cer|mobileprovision)$/i.test(base);
}

function safeRelativeProjectPath(projectPath, target) {
    const relative = String(target || "").trim();
    if (!relative || relative.includes("\0") || path.isAbsolute(relative)) {
        throw new Error("Invalid project path.");
    }
    const resolved = path.resolve(projectPath, relative);
    const normalizedProject = path.resolve(projectPath);
    if (resolved !== normalizedProject && !resolved.startsWith(`${normalizedProject}${path.sep}`)) {
        throw new Error("Path is outside the active project.");
    }
    if (isSensitiveProjectPath(resolved)) {
        throw new Error("Sensitive files are not opened from Developer Deck.");
    }
    return resolved;
}

async function runReadOnlyCommand(command, args, options = {}) {
    try {
        const result = await execFileAsync(command, args, {
            cwd: options.cwd,
            timeout: options.timeout || 3500,
            maxBuffer: options.maxBuffer || 512 * 1024
        });
        return {ok: true, stdout: result.stdout || "", stderr: result.stderr || ""};
    } catch (error) {
        return {
            ok: false,
            stdout: error.stdout || "",
            stderr: error.stderr || "",
            error: error.message || "Command unavailable."
        };
    }
}

async function getDeveloperGitStatus(projectPath, maximumFiles) {
    const status = await runReadOnlyCommand("git", ["-C", projectPath, "status", "--porcelain=v1", "--branch"], {
        cwd: projectPath
    });
    if (!status.ok) {
        return {
            available: false,
            clean: false,
            branch: "UNAVAILABLE",
            lastCommit: "",
            modifiedCount: 0,
            files: [],
            error: status.error
        };
    }

    const lines = status.stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines.find(line => line.startsWith("## ")) || "";
    const files = lines
        .filter(line => !line.startsWith("## "))
        .map(line => ({
            status: line.slice(0, 2).trim() || "??",
            path: line.slice(3).trim()
        }))
        .filter(file => !isSensitiveProjectPath(file.path));
    const last = await runReadOnlyCommand(
        "git",
        ["-C", projectPath, "log", "-1", "--pretty=format:%h%x09%s%x09%cr"],
        {cwd: projectPath}
    );

    return {
        available: true,
        clean: files.length === 0,
        branch: branchLine.replace(/^##\s*/, "").split("...")[0] || "DETACHED",
        lastCommit: last.ok ? last.stdout.trim() : "No commit data",
        modifiedCount: files.length,
        files: files.slice(0, maximumFiles),
        error: ""
    };
}

function getDeveloperScripts(projectPath, favoriteScripts) {
    const packageFile = path.join(projectPath, "package.json");
    if (!fs.existsSync(packageFile)) return {available: false, scripts: []};
    try {
        const manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));
        const scripts = manifest && manifest.scripts && typeof manifest.scripts === "object"
            ? Object.keys(manifest.scripts).map(name => ({
                name,
                command: String(manifest.scripts[name] || "").slice(0, 240),
                favorite: favoriteScripts.includes(name),
                state: "DRAFT_ONLY",
                executable: false
            }))
            : [];
        scripts.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
        return {available: true, scripts: scripts.slice(0, 24)};
    } catch (error) {
        return {available: false, scripts: [], error: error.message};
    }
}

function getDeveloperStructure(projectPath) {
    const entries = [
        "README.md",
        "CHANGELOG.md",
        "CONFIGURATION.md",
        "SECURITY.md",
        "GAME_DECK.md",
        "COMMS_DECK.md",
        "MAP_LAYERS.md",
        "package.json",
        "src",
        "src/config",
        "src/classes",
        "tools",
        "build",
        "docs"
    ];

    return entries
        .map(entry => {
            const fullPath = path.join(projectPath, entry);
            if (!fs.existsSync(fullPath) || isSensitiveProjectPath(fullPath)) return null;
            const stat = fs.statSync(fullPath);
            return {
                label: entry,
                path: entry,
                type: stat.isDirectory() ? "directory" : "file"
            };
        })
        .filter(Boolean);
}

async function getDeveloperHealth(projectPath) {
    const npmVersion = await runReadOnlyCommand("npm", ["--version"], {cwd: projectPath, timeout: 2500});
    const gitVersion = await runReadOnlyCommand("git", ["--version"], {cwd: projectPath, timeout: 2500});
    let dependencyCount = 0;
    let devDependencyCount = 0;
    let packageManager = "UNKNOWN";
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8"));
        dependencyCount = manifest.dependencies ? Object.keys(manifest.dependencies).length : 0;
        devDependencyCount = manifest.devDependencies ? Object.keys(manifest.devDependencies).length : 0;
        if (manifest.packageManager) packageManager = String(manifest.packageManager).slice(0, 80);
    } catch (error) {}
    if (packageManager === "UNKNOWN") {
        if (fs.existsSync(path.join(projectPath, "package-lock.json"))) packageManager = "npm";
        else if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) packageManager = "pnpm";
        else if (fs.existsSync(path.join(projectPath, "yarn.lock"))) packageManager = "yarn";
    }

    return {
        node: process.version,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        npm: npmVersion.ok ? npmVersion.stdout.trim() : "UNAVAILABLE",
        git: gitVersion.ok ? gitVersion.stdout.trim() : "UNAVAILABLE",
        packageManager,
        packageLock: fs.existsSync(path.join(projectPath, "package-lock.json")),
        nodeModules: fs.existsSync(path.join(projectPath, "node_modules")),
        dependencyCount,
        devDependencyCount,
        audit: "MANUAL ONLY · run npm audit explicitly"
    };
}

async function getDeveloperDeckData() {
    const config = readDeveloperDeckConfig();
    const projectPath = config.activeProjectPath;
    const git = await getDeveloperGitStatus(projectPath, config.maxModifiedFiles);
    const scripts = getDeveloperScripts(projectPath, config.favoriteScripts);
    const health = await getDeveloperHealth(projectPath);
    return {
        config,
        projectPath,
        git,
        scripts,
        structure: getDeveloperStructure(projectPath),
        health,
        logs: [
            "Developer Deck loaded in read-only foundation mode.",
            "Quick scripts are detected but not executed automatically.",
            "Git actions are read-only; commit/push buttons are placeholders.",
            "Sensitive files such as .env, keys and tokens are hidden."
        ]
    };
}

function cleanAgentText(value, fallback = "", maxLength = 240) {
    const text = String(value || fallback || "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.slice(0, maxLength);
}

function agentPermission(level) {
    const safeLevel = level === 1 ? 1 : 0;
    return {
        level: safeLevel,
        label: safeLevel === 1 ? "DRAFT" : "READ ONLY",
        canReadContext: true,
        canDraftText: safeLevel >= 1,
        canApplyChanges: false,
        canRunCommands: false,
        canCommit: false,
        canPush: false,
        canShareCloudContext: false
    };
}

function defaultAgentDefinitions() {
    return [
        {
            id: "architect",
            name: "Architect Agent",
            role: "ARCHITECTURE",
            description: "Analyses architecture, dependencies, structure and design risk.",
            basePrompt: "Review the selected context as a software architect. Identify dependencies, boundaries, risks and a safe implementation plan.",
            permissionLevel: 0,
            status: "IDLE",
            assignedContext: ["src/config", "src/classes", "README.md"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Ready to propose architecture. No external AI provider is connected in this foundation."
        },
        {
            id: "builder",
            name: "Builder Agent",
            role: "BUILD",
            description: "Drafts concrete implementation proposals without applying changes automatically.",
            basePrompt: "Draft a minimal implementation plan and proposed code changes as text only. Do not write files or run commands.",
            permissionLevel: 1,
            status: "WAITING",
            assignedContext: ["active task", "approved architecture notes"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Draft mode only. File writes are disabled until a future explicit approval flow exists."
        },
        {
            id: "reviewer",
            name: "Reviewer Agent",
            role: "REVIEW",
            description: "Checks consistency, regressions, edge cases and maintainability.",
            basePrompt: "Review proposed changes. Find inconsistencies, likely regressions, unclear assumptions and safer alternatives.",
            permissionLevel: 0,
            status: "IDLE",
            assignedContext: ["diff drafts", "task result"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Ready for review handoff."
        },
        {
            id: "security",
            name: "Security Agent",
            role: "SECURITY",
            description: "Reviews secrets, permissions, Electron/webview boundaries and external APIs.",
            basePrompt: "Review security posture. Look for secrets, unsafe permissions, risky Electron settings, webviews, network calls and data leakage.",
            permissionLevel: 0,
            status: "REVIEWING",
            assignedContext: [".gitignore", "SECURITY.md", "src/_boot.js"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Security boundary active: no tokens, no command execution, no automatic file writes."
        },
        {
            id: "tester",
            name: "Tester Agent",
            role: "TESTING",
            description: "Proposes tests, validation steps and failure scenarios.",
            basePrompt: "Create a validation checklist for the proposed change. Include smoke tests, regression tests and offline/failure states.",
            permissionLevel: 0,
            status: "IDLE",
            assignedContext: ["package scripts", "manual QA notes"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Ready to generate validation plans."
        },
        {
            id: "docs",
            name: "Docs Agent",
            role: "DOCUMENTATION",
            description: "Drafts README, changelog, configuration and sharing documentation.",
            basePrompt: "Draft clear user-facing documentation for the selected change. Keep setup, security and limitations explicit.",
            permissionLevel: 1,
            status: "IDLE",
            assignedContext: ["README.md", "CHANGELOG.md", "docs"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Documentation drafts stay local until the user approves."
        },
        {
            id: "ux",
            name: "UX Agent",
            role: "UX",
            description: "Reviews navigation, visual coherence, feedback, legibility and abrupt transitions.",
            basePrompt: "Review the user experience. Focus on navigation context, visual continuity, readability, feedback and cockpit cohesion.",
            permissionLevel: 0,
            status: "IDLE",
            assignedContext: ["workspace UI", "CSS", "user flow"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Ready to inspect interface flow."
        },
        {
            id: "performance",
            name: "Performance Agent",
            role: "PERFORMANCE",
            description: "Checks CPU, RAM, polling, timers, leaks and unnecessary re-renders.",
            basePrompt: "Review performance risk. Identify polling, timers, memory leaks, heavy rendering and low-consumption alternatives.",
            permissionLevel: 0,
            status: "IDLE",
            assignedContext: ["timers", "polling", "rendering"],
            provider: {name: "NOT CONFIGURED", model: "FUTURE"},
            history: [],
            output: "Ready to flag expensive work."
        }
    ].map(agent => ({
        ...agent,
        permissions: agentPermission(agent.permissionLevel)
    }));
}

function defaultAgentCommandConfig() {
    return {
        version: 1,
        description: "Local Agent Command preferences and placeholder task board. Do not store secrets here.",
        mode: "visual-foundation",
        autonomyEnabled: false,
        allowedPermissionLevels: [0, 1],
        agents: defaultAgentDefinitions(),
        tasks: [
            {
                id: "task-modal-context-flow",
                title: "Example: preserve workspace context after modal close",
                priority: "HIGH",
                type: "UX",
                status: "WAITING REVIEW",
                assignedAgent: "ux",
                result: "Architect → Builder → Reviewer → Tester → Security handoff model prepared. No automatic changes are applied in this phase."
            },
            {
                id: "task-agent-security-boundary",
                title: "Define safe permissions for Agent Command",
                priority: "CRITICAL",
                type: "SECURITY",
                status: "ACTIVE",
                assignedAgent: "security",
                result: "Only READ ONLY and DRAFT are enabled. Apply/autonomy levels remain future-only."
            },
            {
                id: "task-docs-agent-command",
                title: "Document Agent Command foundation",
                priority: "MEDIUM",
                type: "DOCUMENTATION",
                status: "BACKLOG",
                assignedAgent: "docs",
                result: "Documentation should explain roles, approvals, local config and future AI integration limits."
            }
        ],
        approvalFlow: [
            "Architect proposes cause and boundaries.",
            "Builder drafts a solution as text only.",
            "Reviewer checks regression risk.",
            "Tester proposes validation steps.",
            "Security confirms no secret or permission exposure.",
            "User explicitly approves before any future apply step."
        ],
        safetyLocks: [
            "No external AI provider is connected.",
            "No commands are executed by agents.",
            "No files are written by agents.",
            "No commits or pushes are performed by agents.",
            "No context is sent to cloud services without future explicit confirmation."
        ]
    };
}

function sanitizeAgentCommandConfig(input = {}) {
    const defaults = defaultAgentCommandConfig();
    const allowedStates = new Set(["IDLE", "WAITING", "THINKING", "REVIEWING", "DONE", "ERROR", "DISABLED", "NOT CONFIGURED"]);
    const allowedTaskStates = new Set(["BACKLOG", "ACTIVE", "WAITING REVIEW", "APPROVED", "REJECTED", "DONE", "BLOCKED"]);
    const allowedTaskTypes = new Set(["ARCHITECTURE", "BUILD", "REVIEW", "SECURITY", "TESTING", "DOCUMENTATION", "UX", "PERFORMANCE"]);
    const allowedPriorities = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    const defaultAgentsById = new Map(defaults.agents.map(agent => [agent.id, agent]));
    const sourceAgents = Array.isArray(input.agents) ? input.agents : defaults.agents;
    const agents = sourceAgents
        .map((agent, index) => {
            const fallback = defaultAgentsById.get(String(agent && agent.id || "")) || defaults.agents[index] || defaults.agents[0];
            const id = cleanAgentText(agent && agent.id, fallback.id, 48)
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, "-");
            const permissionLevel = Number(agent && agent.permissionLevel);
            const provider = agent && typeof agent.provider === "object" ? agent.provider : fallback.provider;
            return {
                id,
                name: cleanAgentText(agent && agent.name, fallback.name, 80),
                role: cleanAgentText(agent && agent.role, fallback.role, 40).toUpperCase(),
                description: cleanAgentText(agent && agent.description, fallback.description, 220),
                basePrompt: cleanAgentText(agent && agent.basePrompt, fallback.basePrompt, 1200),
                permissionLevel: Number.isFinite(permissionLevel) && permissionLevel === 1 ? 1 : 0,
                permissions: agentPermission(Number.isFinite(permissionLevel) && permissionLevel === 1 ? 1 : 0),
                status: allowedStates.has(String(agent && agent.status || "").toUpperCase())
                    ? String(agent.status).toUpperCase()
                    : fallback.status,
                assignedContext: Array.isArray(agent && agent.assignedContext)
                    ? agent.assignedContext.slice(0, 12).map(item => cleanAgentText(item, "", 120)).filter(Boolean)
                    : fallback.assignedContext,
                provider: {
                    name: cleanAgentText(provider && provider.name, "NOT CONFIGURED", 80),
                    model: cleanAgentText(provider && provider.model, "FUTURE", 80)
                },
                history: Array.isArray(agent && agent.history)
                    ? agent.history.slice(-20).map(item => cleanAgentText(item, "", 400)).filter(Boolean)
                    : [],
                output: cleanAgentText(agent && agent.output, fallback.output, 1600)
            };
        })
        .filter(agent => agent.id)
        .slice(0, 12);
    const agentIds = agents.map(agent => agent.id);
    const sourceTasks = Array.isArray(input.tasks) ? input.tasks : defaults.tasks;
    const tasks = sourceTasks.map((task, index) => {
        const fallback = defaults.tasks[index] || defaults.tasks[0];
        const type = cleanAgentText(task && task.type, fallback.type, 40).toUpperCase();
        const status = cleanAgentText(task && task.status, fallback.status, 40).toUpperCase();
        const priority = cleanAgentText(task && task.priority, fallback.priority, 40).toUpperCase();
        const assignedAgent = agentIds.includes(task && task.assignedAgent)
            ? task.assignedAgent
            : (fallback.assignedAgent && agentIds.includes(fallback.assignedAgent) ? fallback.assignedAgent : agentIds[0]);
        return {
            id: cleanAgentText(task && task.id, `task-${index + 1}`, 80).replace(/[^A-Za-z0-9:_-]/g, "-"),
            title: cleanAgentText(task && task.title, fallback.title, 160),
            priority: allowedPriorities.has(priority) ? priority : "MEDIUM",
            type: allowedTaskTypes.has(type) ? type : "REVIEW",
            status: allowedTaskStates.has(status) ? status : "BACKLOG",
            assignedAgent,
            result: cleanAgentText(task && task.result, fallback.result, 1600)
        };
    }).slice(0, 40);

    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        description: cleanAgentText(input.description, defaults.description, 200),
        mode: "visual-foundation",
        autonomyEnabled: false,
        allowedPermissionLevels: [0, 1],
        agents,
        tasks,
        approvalFlow: Array.isArray(input.approvalFlow)
            ? input.approvalFlow.slice(0, 10).map(step => cleanAgentText(step, "", 240)).filter(Boolean)
            : defaults.approvalFlow,
        safetyLocks: Array.isArray(input.safetyLocks)
            ? input.safetyLocks.slice(0, 10).map(lock => cleanAgentText(lock, "", 240)).filter(Boolean)
            : defaults.safetyLocks
    };
}

function readAgentCommandConfig() {
    try {
        if (!fs.existsSync(agentCommandFile)) return sanitizeAgentCommandConfig(defaultAgentCommandConfig());
        return sanitizeAgentCommandConfig(JSON.parse(fs.readFileSync(agentCommandFile, "utf8")));
    } catch (error) {
        return sanitizeAgentCommandConfig(defaultAgentCommandConfig());
    }
}

function writeAgentCommandConfig(config) {
    const sanitized = sanitizeAgentCommandConfig(config);
    fs.writeFileSync(agentCommandFile, JSON.stringify(sanitized, null, 4));
    return sanitized;
}

function updateAgentCommandTask(taskId, action) {
    const config = readAgentCommandConfig();
    const index = config.tasks.findIndex(task => task.id === taskId);
    if (index === -1) throw new Error("Task not found.");
    const task = config.tasks[index];
    if (action === "mark-reviewed") {
        task.status = task.status === "DONE" ? "DONE" : "APPROVED";
        task.result = cleanAgentText(`${task.result} Reviewed by user in Agent Command.`, task.result, 1600);
    } else if (action === "route-next-agent") {
        const currentAgentIndex = config.agents.findIndex(agent => agent.id === task.assignedAgent);
        const nextAgent = config.agents[(currentAgentIndex + 1 + config.agents.length) % config.agents.length];
        task.assignedAgent = nextAgent.id;
        task.status = "ACTIVE";
        task.result = cleanAgentText(`${task.result} Routed to ${nextAgent.name} for the next read-only/draft pass.`, task.result, 1600);
    } else {
        throw new Error("Unsupported task action.");
    }
    return writeAgentCommandConfig(config);
}

function defaultWorkspaceState() {
    return {
        version: 1,
        activeWorkspace: "hub",
        lastNonHubWorkspace: "",
        navigationMode: "pinned-hub-scroll-rail"
    };
}

function sanitizeWorkspaceState(input = {}) {
    const cleanId = value => {
        const id = String(value || "").trim().toLowerCase();
        return /^[a-z0-9_-]{1,80}$/.test(id) ? id : "";
    };
    const activeWorkspace = cleanId(input.activeWorkspace) || "hub";
    const lastNonHubWorkspace = cleanId(input.lastNonHubWorkspace);
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        activeWorkspace,
        lastNonHubWorkspace: lastNonHubWorkspace === "hub" ? "" : lastNonHubWorkspace,
        navigationMode: "pinned-hub-scroll-rail"
    };
}

function readWorkspaceState() {
    try {
        if (!fs.existsSync(workspaceStateFile)) return sanitizeWorkspaceState(defaultWorkspaceState());
        return sanitizeWorkspaceState(JSON.parse(fs.readFileSync(workspaceStateFile, "utf8")));
    } catch (error) {
        return sanitizeWorkspaceState(defaultWorkspaceState());
    }
}

function writeWorkspaceState(input = {}) {
    const current = readWorkspaceState();
    const next = sanitizeWorkspaceState({...current, ...input});
    fs.writeFileSync(workspaceStateFile, JSON.stringify(next, null, 4));
    return next;
}

function loadLocalEnvFile() {
    const candidates = [
        process.env.AEGISUI_ENV_FILE,
        path.join(process.cwd(), ".env.local"),
        path.join(process.cwd(), ".env"),
        path.join(__dirname, "..", ".env.local"),
        path.join(__dirname, "..", ".env")
    ];
    try {
        candidates.push(path.join(app.getPath("userData"), ".env.local"));
        candidates.push(path.join(app.getPath("userData"), ".env"));
    } catch (error) {}

    const seen = new Set();
    candidates.filter(Boolean).forEach(filePath => {
        const normalized = path.resolve(filePath);
        if (seen.has(normalized) || !fs.existsSync(normalized)) return;
        seen.add(normalized);

        try {
            fs.readFileSync(normalized, "utf8").split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) return;
                const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
                if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) return;
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"'))
                    || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[match[1]] = value;
            });
            signale.info(`Loaded local environment from ${normalized}`);
        } catch (error) {
            signale.warn(`Could not load local environment from ${normalized}: ${error.message}`);
        }
    });
}

loadLocalEnvFile();

const TOMTOM_ENV_ALIASES = [
    "TOMTOM_API_KEY",
    "AEGISUI_TOMTOM_API_KEY",
    "TOMTOM_KEY",
    "VITE_TOMTOM_API_KEY",
    "REACT_APP_TOMTOM_API_KEY"
];

function firstEnvValue(names = []) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function getTomTomApiKey() {
    return firstEnvValue(TOMTOM_ENV_ALIASES);
}

function maskSecret(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return `••••${text.slice(-4)}`;
}

function tomTomDiagnosticStatusFromHttp(statusCode) {
    if (statusCode >= 200 && statusCode < 300) {
        return {ok: true, keyStatus: "CONFIGURED", serviceStatus: "ONLINE"};
    }
    if (statusCode === 401 || statusCode === 403) {
        return {ok: false, keyStatus: "INVALID", serviceStatus: "API_KEY_INVALID"};
    }
    if (statusCode === 429) {
        return {ok: false, keyStatus: "CONFIGURED", serviceStatus: "RATE_LIMITED"};
    }
    if (statusCode >= 500) {
        return {ok: false, keyStatus: "CONFIGURED", serviceStatus: "SERVICE_UNAVAILABLE"};
    }
    return {ok: false, keyStatus: "CONFIGURED", serviceStatus: "ERROR"};
}

ipc.handle("runtime-config", () => ({
    tomtomApiKey: getTomTomApiKey(),
    tomtomKeyStatus: getTomTomApiKey() ? "CONFIGURED" : "MISSING",
    tomtomKeyLast4: maskSecret(getTomTomApiKey()),
    offlineMode: envFlag("AEGISUI_OFFLINE_MODE"),
    disableUpdateCheck: envFlag("AEGISUI_DISABLE_UPDATE_CHECK")
}));

async function initGeoIP(settings = {}) {
    try {
        const maxmind = require("maxmind");
        const cacheDir = path.join(electron.app.getPath("userData"), "geoIPcache");
        const databasePath = path.join(cacheDir, "GeoLite2-City.mmdb");

        if (fs.existsSync(databasePath)) {
            geoLookup = await maxmind.open(databasePath);
        } else if (settings.offlineMode || envFlag("AEGISUI_OFFLINE_MODE")) {
            signale.warn("GeoIP database missing and offline mode is enabled; location lookup disabled.");
        } else {
            const geolite2 = await import("geolite2-redist");
            await geolite2.downloadDbs({
                dbList: ["GeoLite2-City"],
                path: cacheDir
            });
            geoLookup = await geolite2.open("GeoLite2-City", dbPath => maxmind.open(dbPath), cacheDir);
        }
        signale.success("GeoIP database ready");
    } catch (e) {
        signale.warn(`GeoIP database unavailable: ${e.message}`);
    } finally {
        geoLookupReady = true;
    }
}

ipc.handle("geoip-ready", () => geoLookupReady);
ipc.handle("geoip-lookup", (e, ip) => geoLookup ? geoLookup.get(ip) : null);

function getJSON(remoteUrl) {
    return new Promise((resolve, reject) => {
        const request = require("https").get(remoteUrl, response => {
            let body = "";
            response.on("data", chunk => body += chunk);
            response.on("end", () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`Remote service returned ${response.statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
        request.setTimeout(8000, () => {
            request.destroy(new Error("Remote service timeout"));
        });
        request.on("error", reject);
    });
}

function getHttpStatus(remoteUrl) {
    return new Promise((resolve, reject) => {
        const request = require("https").get(remoteUrl, response => {
            let body = "";
            response.on("data", chunk => {
                if (body.length < 400) body += chunk;
            });
            response.on("end", () => {
                resolve({
                    statusCode: response.statusCode,
                    statusMessage: response.statusMessage,
                    body
                });
            });
        });
        request.setTimeout(8000, () => {
            request.destroy(new Error("Remote service timeout"));
        });
        request.on("error", reject);
    });
}

ipc.handle("tomtom-diagnostic", async (event, candidateKey = "") => {
    const key = String(candidateKey || getTomTomApiKey() || "").trim();
    if (!key) {
        return {
            ok: false,
            keyStatus: "MISSING",
            serviceStatus: "CONFIG_REQUIRED",
            summary: "TomTom key missing"
        };
    }

    const url = `https://api.tomtom.com/map/1/tile/basic/main/0/0/0.png?tileSize=256&key=${encodeURIComponent(key)}`;
    try {
        const response = await getHttpStatus(url);
        const status = tomTomDiagnosticStatusFromHttp(response.statusCode);
        return {
            ...status,
            last4: maskSecret(key),
            httpStatus: response.statusCode,
            summary: status.ok
                ? "TomTom base map endpoint reachable"
                : `TomTom base map returned HTTP ${response.statusCode}`
        };
    } catch (error) {
        return {
            ok: false,
            keyStatus: "CONFIGURED",
            serviceStatus: "ERROR",
            last4: maskSecret(key),
            summary: error.message || "TomTom diagnostic failed"
        };
    }
});

ipc.handle("tomtom-traffic-diagnostic", async (event, candidateKey = "") => {
    const key = String(candidateKey || getTomTomApiKey() || "").trim();
    if (!key) {
        return {
            ok: false,
            keyStatus: "MISSING",
            serviceStatus: "API_KEY_MISSING",
            summary: "TomTom traffic key missing"
        };
    }

    const url = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/5/15/10.png?tileSize=256&key=${encodeURIComponent(key)}`;
    try {
        const response = await getHttpStatus(url);
        const status = tomTomDiagnosticStatusFromHttp(response.statusCode);
        return {
            ...status,
            last4: maskSecret(key),
            httpStatus: response.statusCode,
            summary: status.ok
                ? "TomTom traffic endpoint reachable"
                : `TomTom traffic returned HTTP ${response.statusCode}`
        };
    } catch (error) {
        return {
            ok: false,
            keyStatus: "CONFIGURED",
            serviceStatus: "SERVICE_UNAVAILABLE",
            last4: maskSecret(key),
            summary: error.message || "TomTom traffic diagnostic failed"
        };
    }
});

ipc.handle("rainviewer-metadata", async () => {
    try {
        return {
            ok: true,
            data: await getJSON("https://api.rainviewer.com/public/weather-maps.json")
        };
    } catch (error) {
        return {ok: false, error: error.message};
    }
});

function collectApplications(root, depth = 0) {
    if (!fs.existsSync(root) || depth > 2) return [];

    let entries = [];
    try {
        entries = fs.readdirSync(root, {withFileTypes: true});
    } catch (error) {
        return [];
    }

    return entries.flatMap(entry => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory() && entry.name.endsWith(".app")) {
            return [{name: entry.name.replace(/\.app$/i, ""), path: entryPath}];
        }
        if (entry.isDirectory() && depth < 2) {
            return collectApplications(entryPath, depth + 1);
        }
        return [];
    });
}

async function listApplications() {
    if (applicationsCache) return applicationsCache;

    const roots = [
        "/Applications",
        "/System/Applications",
        path.join(app.getPath("home"), "Applications")
    ];
    const byPath = new Map();
    roots.flatMap(root => collectApplications(root)).forEach(application => {
        byPath.set(application.path, application);
    });

    const applications = Array.from(byPath.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 100);

    applicationsCache = await Promise.all(applications.map(async application => {
        try {
            const plistPath = path.join(application.path, "Contents", "Info.plist");
            const resourcesPath = path.join(application.path, "Contents", "Resources");
            const iconCachePath = path.join(app.getPath("userData"), "application-icons");
            let iconName = "";
            try {
                iconName = execFileSync("/usr/bin/plutil", [
                    "-extract", "CFBundleIconFile", "raw", "-o", "-", plistPath
                ], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
            } catch (error) {}

            if (iconName && !path.extname(iconName)) iconName += ".icns";
            let sourceIconPath = iconName ? path.join(resourcesPath, iconName) : "";
            if (!sourceIconPath || !fs.existsSync(sourceIconPath)) {
                const candidates = fs.existsSync(resourcesPath)
                    ? fs.readdirSync(resourcesPath).filter(file => file.endsWith(".icns"))
                    : [];
                if (candidates.length) sourceIconPath = path.join(resourcesPath, candidates[0]);
            }

            let icon = nativeImage.createEmpty();
            if (sourceIconPath && fs.existsSync(sourceIconPath)) {
                fs.mkdirSync(iconCachePath, {recursive: true});
                const modified = fs.statSync(sourceIconPath).mtimeMs;
                const cacheName = crypto.createHash("sha1")
                    .update(`${sourceIconPath}:${modified}`)
                    .digest("hex") + ".png";
                const cachedIconPath = path.join(iconCachePath, cacheName);
                if (!fs.existsSync(cachedIconPath)) {
                    execFileSync("/usr/bin/sips", [
                        "-z", "128", "128",
                        "-s", "format", "png",
                        sourceIconPath,
                        "--out", cachedIconPath
                    ], {stdio: "ignore"});
                }
                icon = nativeImage.createFromPath(cachedIconPath);
            }
            if (icon.isEmpty()) icon = await app.getFileIcon(application.path, {size: "normal"});
            return {
                ...application,
                icon: icon.resize({width: 64, height: 64}).toDataURL()
            };
        } catch (error) {
            return {...application, icon: null};
        }
    }));
    knownApplications = new Set(applicationsCache.map(application => application.path));
    return applicationsCache;
}

ipc.handle("applications-list", () => listApplications());
ipc.handle("launch-application", async (e, applicationPath) => {
    if (!knownApplications.has(applicationPath)) {
        return {ok: false, error: "Unknown application"};
    }
    const error = await shell.openPath(applicationPath);
    return error ? {ok: false, error} : {ok: true};
});

const musicStatusScript = `
const Music = Application("com.apple.Music");
function normalizeRepeat(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("one")) return "one";
    if (text.includes("all")) return "all";
    return "off";
}
if (!Music.running()) {
    JSON.stringify({
        running: false,
        state: "stopped",
        appStatus: "NOT_RUNNING",
        connectionStatus: "NOT_RUNNING",
        lastError: ""
    });
} else {
    let result = {
        running: true,
        state: String(Music.playerState()),
        appStatus: "RUNNING",
        connectionStatus: "CONNECTED",
        lastError: ""
    };
    try {
        result.shuffle = Boolean(Music.shuffleEnabled());
    } catch (error) {}
    try {
        result.repeat = normalizeRepeat(Music.songRepeat());
    } catch (error) {}
    try {
        const track = Music.currentTrack();
        const properties = track.properties();
        result = Object.assign(result, {
            title: properties.name || "Unknown track",
            artist: properties.artist || "Unknown artist",
            album: properties.album || "",
            duration: Number(properties.duration || 0),
            position: Number(Music.playerPosition() || 0),
            artworkId: String(properties.persistentID || properties.databaseID || [
                properties.name || "",
                properties.artist || "",
                properties.album || ""
            ].join("|"))
        });
    } catch (error) {}
    JSON.stringify(result);
}
`;

const musicArtworkScript = `
const Music = Application("com.apple.Music");
if (!Music.running()) {
    JSON.stringify({running: false});
} else {
    let result = {running: true, artworkId: "", rawData: ""};
    try {
        const track = Music.currentTrack();
        const properties = track.properties();
        result.artworkId = String(properties.persistentID || properties.databaseID || [
            properties.name || "",
            properties.artist || "",
            properties.album || ""
        ].join("|"));
        const artworks = track.artworks();
        if (artworks.length) result.rawData = String(artworks[0].rawData());
    } catch (error) {}
    JSON.stringify(result);
}
`;

async function isMusicAppRunning() {
    if (process.platform !== "darwin") return false;
    try {
        await execFileAsync("/usr/bin/pgrep", ["-x", "Music"], {timeout: 3000});
        return true;
    } catch (error) {
        return false;
    }
}

function normalizeMusicAutomationError(message = "") {
    const text = String(message || "");
    if (/-1743|not authorized|not authorised|no est[aá]s autorizado|not permitted to send apple events/i.test(text)) {
        return {
            status: "AUTOMATION_BLOCKED",
            connectionStatus: "AUTOMATION_BLOCKED",
            permissionDenied: true,
            permissionTarget: "Music",
            technicalCode: "-1743",
            safeMessage: "macOS Automation permission required for EdexUi-Eng to control Music."
        };
    }
    return {
        status: "ERROR",
        connectionStatus: "ERROR",
        permissionDenied: false,
        permissionTarget: "",
        technicalCode: "",
        safeMessage: text || "Automation request failed."
    };
}

async function runAutomation(script, timeout = 20000, maxBuffer = 1024 * 1024) {
    if (process.platform !== "darwin") {
        return {ok: false, status: "UNAVAILABLE", error: "This integration is available on macOS only."};
    }
    try {
        const {stdout} = await execFileAsync("/usr/bin/osascript", [
            "-l", "JavaScript", "-e", script
        ], {timeout, maxBuffer});
        const data = JSON.parse(stdout.trim() || "null");
        return {ok: true, data};
    } catch (error) {
        const message = (error.stderr || error.message || "").trim();
        const normalized = normalizeMusicAutomationError(message);
        const running = await isMusicAppRunning();
        return {
            ok: false,
            ...normalized,
            appStatus: running ? "RUNNING" : "NOT_RUNNING",
            error: normalized.safeMessage,
            rawError: message || "Automation request failed."
        };
    }
}

ipc.handle("calendar-events", async (event, requestedRange = {}) => {
    if (process.platform !== "darwin") {
        return {ok: false, error: "Calendar integration is available on macOS only."};
    }

    const start = Number(requestedRange.start);
    const end = Number(requestedRange.end);
    const maximumRange = 370 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > maximumRange) {
        return {ok: false, error: "Invalid calendar date range."};
    }

    const packagedHelperBundle = app.isPackaged
        ? path.join(process.resourcesPath, "EdexUiEngCalendar.app")
        : path.join(__dirname, "native", "EdexUiEngCalendar.app");
    const helperBundle = path.join(app.getPath("userData"), "EdexUiEngCalendar.app");
    const outputFile = path.join(app.getPath("temp"), `edex-calendar-${process.pid}-${Date.now()}.json`);
    try {
        if (!fs.existsSync(packagedHelperBundle)) {
            throw new Error("The native Calendar helper is missing.");
        }
        const sourceExecutable = path.join(
            packagedHelperBundle,
            "Contents", "MacOS", "calendar-helper"
        );
        const installedExecutable = path.join(
            helperBundle,
            "Contents", "MacOS", "calendar-helper"
        );
        const sourceHash = crypto.createHash("sha256")
            .update(fs.readFileSync(sourceExecutable))
            .digest("hex");
        const installedHash = fs.existsSync(installedExecutable)
            ? crypto.createHash("sha256").update(fs.readFileSync(installedExecutable)).digest("hex")
            : "";
        if (sourceHash !== installedHash) {
            fs.rmSync(helperBundle, {recursive: true, force: true});
            fs.cpSync(packagedHelperBundle, helperBundle, {recursive: true});
            fs.chmodSync(installedExecutable, 0o755);
        }
        await execFileAsync("/usr/bin/open", [
            "-W",
            "-n",
            "-a", helperBundle,
            "--args",
            String(start),
            String(end),
            outputFile
        ], {timeout: 60000, maxBuffer: 1024 * 1024});
        if (!fs.existsSync(outputFile)) {
            throw new Error("Calendar did not return any data.");
        }
        const data = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        if (!data.authorized) {
            return {
                ok: false,
                permissionDenied: true,
                error: data.error || "Calendar access was not granted."
            };
        }
        return {ok: true, data};
    } catch (error) {
        return {
            ok: false,
            permissionDenied: /not granted|denied|authorization/i.test(error.message || ""),
            error: error.message || "Calendar request failed."
        };
    } finally {
        try {
            if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
        } catch (error) {}
    }
});
ipc.handle("music-status", () => runAutomation(musicStatusScript, 8000));
ipc.handle("music-open", async () => {
    if (process.platform !== "darwin") return {ok: false, status: "UNAVAILABLE", error: "Music.app is available on macOS only."};
    try {
        await execFileAsync("/usr/bin/open", ["-a", "Music"], {timeout: 8000});
        return {ok: true, status: "OPEN_REQUESTED"};
    } catch (error) {
        return {ok: false, status: "ERROR", error: (error.message || "Unable to open Music.app").slice(0, 180)};
    }
});
ipc.handle("music-artwork", async (event, requestedArtworkId) => {
    const artworkId = typeof requestedArtworkId === "string"
        ? requestedArtworkId.slice(0, 256)
        : "";
    if (artworkId && musicArtworkCache.has(artworkId)) {
        return {ok: true, data: {artworkId, image: musicArtworkCache.get(artworkId)}};
    }

    const response = await runAutomation(musicArtworkScript, 12000, 12 * 1024 * 1024);
    if (!response.ok) return response;

    const data = response.data || {};
    const rawData = typeof data.rawData === "string" ? data.rawData : "";
    const match = rawData.match(/\$([0-9a-f]+)\$/i);
    if (!match || !data.artworkId) {
        return {ok: true, data: {artworkId: data.artworkId || artworkId, image: null}};
    }

    try {
        const buffer = Buffer.from(match[1], "hex");
        if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
            throw new Error("Artwork size is not supported.");
        }
        let mime = "image/jpeg";
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
            mime = "image/png";
        }
        const image = `data:${mime};base64,${buffer.toString("base64")}`;
        musicArtworkCache.set(data.artworkId, image);
        if (musicArtworkCache.size > 12) {
            musicArtworkCache.delete(musicArtworkCache.keys().next().value);
        }
        return {ok: true, data: {artworkId: data.artworkId, image}};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("workspace-open-link", async (event, target) => {
    try {
        const launchUrl = sanitizeLaunchUrl(target);
        if (!launchUrl) return {ok: false, status: "NOT CONFIGURED", error: "Launcher is not configured."};
        await shell.openExternal(launchUrl);
        const parsed = new URL(launchUrl);
        return {
            ok: true,
            status: parsed.protocol === "https:" ? "EXTERNAL" : "READY",
            target: launchUrl
        };
    } catch (error) {
        return {ok: false, status: "ERROR", error: error.message || "Cannot open this launcher."};
    }
});
ipc.handle("osint-source-open", async (_event, sourceId) => {
    try {
        const source = getOsintSource(sourceId);
        if (!source || !isAllowedOsintSourceUrl(source.url, source)) {
            return {ok: false, status: "SOURCE_DENIED", error: "OSINT source is not allowlisted."};
        }
        openOsintSourceView(source);
        return {ok: true, status: "LOADING", source: {id: source.id, title: source.title}};
    } catch (error) {
        return {ok: false, status: "SOURCE_UNAVAILABLE", error: error.message || "Cannot open this isolated source."};
    }
});
ipc.handle("osint-source-layout", (_event, bounds) => ({ok: setOsintSourceBounds(bounds)}));
ipc.handle("osint-source-reload", () => {
    if (!osintSourceView || osintSourceView.webContents.isDestroyed()) return {ok: false, status: "SOURCE_CLOSED"};
    osintSourceView.webContents.reloadIgnoringCache();
    return {ok: true, status: "RELOADING"};
});
ipc.handle("osint-source-close", () => {
    closeOsintSourceView();
    return {ok: true, status: "CLOSED"};
});
ipc.handle("osint-native-query", async (_event, request = {}) => {
    try {
        const providerId = String(request.providerId || "");
        if (providerId !== "wayback-availability") {
            return {ok: false, status: "PROVIDER_UNAVAILABLE", error: "This native provider is not enabled."};
        }
        return {ok: true, status: "READY", data: await queryWaybackAvailability(request.query)};
    } catch (error) {
        return {ok: false, status: "PROVIDER_UNAVAILABLE", error: error.message || "Native provider query failed."};
    }
});
ipc.handle("calendar-open-accounts", () => {
    return shell.openExternal("x-apple.systempreferences:com.apple.Internet-Accounts-Settings.extension");
});
ipc.handle("calendar-open-privacy", () => {
    return shell.openExternal(
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Calendars"
    );
});
ipc.handle("traffic-open-key-page", () => {
    return shell.openExternal("https://developer.tomtom.com/platform/documentation/my-tomtom/how-to-get-a-tomtom-api-key");
});
ipc.handle("map-layers-read", () => {
    try {
        return {ok: true, data: readMapLayersConfig()};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("map-layers-save", (event, payload) => {
    try {
        return {ok: true, data: writeMapLayersConfig(payload)};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("launch-bay-games", () => {
    try {
        return {ok: true, data: readLaunchBayGames()};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("launch-bay-open-config", async () => {
    const error = await shell.openPath(launchBayGamesFile);
    return error ? {ok: false, error} : {ok: true};
});
ipc.handle("launch-bay-launch", async (event, target) => {
    try {
        const launchUrl = sanitizeLaunchUrl(target);
        if (!launchUrl) throw new Error("NOT CONFIGURED");
        await shell.openExternal(launchUrl);
        return {ok: true};
    } catch (error) {
        return {ok: false, error: error.message || "Cannot launch this game."};
    }
});
ipc.handle("developer-deck-data", async () => {
    try {
        return {ok: true, data: await getDeveloperDeckData()};
    } catch (error) {
        return {ok: false, error: error.message || "Developer Deck data unavailable."};
    }
});
ipc.handle("developer-open-config", async () => {
    const error = await shell.openPath(developerDeckFile);
    return error ? {ok: false, error} : {ok: true};
});
ipc.handle("developer-open-project-file", async (event, target) => {
    try {
        const config = readDeveloperDeckConfig();
        const filePath = safeRelativeProjectPath(config.activeProjectPath, target);
        if (!fs.existsSync(filePath)) throw new Error("Project path does not exist.");
        const error = await shell.openPath(filePath);
        return error ? {ok: false, error} : {ok: true};
    } catch (error) {
        return {ok: false, error: error.message || "Cannot open project file."};
    }
});
ipc.handle("developer-run-script", async () => {
    return {
        ok: false,
        error: "APPROVAL REQUIRED · Script execution is disabled in Developer Deck. Run scripts manually in the terminal."
    };
});
ipc.handle("agent-command-data", () => {
    try {
        return {ok: true, data: readAgentCommandConfig()};
    } catch (error) {
        return {ok: false, error: error.message || "Agent Command data unavailable."};
    }
});
ipc.handle("agent-command-open-config", async () => {
    const error = await shell.openPath(agentCommandFile);
    return error ? {ok: false, error} : {ok: true};
});
ipc.handle("agent-command-update-task", (event, payload = {}) => {
    try {
        return {ok: true, data: updateAgentCommandTask(payload.taskId, payload.action)};
    } catch (error) {
        return {ok: false, error: error.message || "Cannot update Agent Command task."};
    }
});
ipc.handle("agent-command-run-agent", async () => {
    return {
        ok: false,
        error: "AI provider integration is not connected in Agent Command foundation. Agents can only hold local prompts, roles and draft placeholders."
    };
});
ipc.handle("workspace-state-read", () => {
    try {
        return {ok: true, data: readWorkspaceState()};
    } catch (error) {
        return {ok: false, error: error.message || "Workspace state unavailable."};
    }
});
ipc.handle("workspace-state-save", (event, payload = {}) => {
    try {
        return {ok: true, data: writeWorkspaceState(payload)};
    } catch (error) {
        return {ok: false, error: error.message || "Cannot save workspace state."};
    }
});
ipc.handle("engineering-projects", () => {
    try {
        return {ok: true, data: JSON.parse(fs.readFileSync(projectsFile, "utf8"))};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("engineering-save-projects", (event, payload) => {
    try {
        if (!payload || !Array.isArray(payload.projects)) {
            throw new Error("Project data is not valid.");
        }
        if (payload.projects.length > 100) {
            throw new Error("A maximum of 100 projects is supported.");
        }

        const usedIds = new Set();
        const cleanText = (value, fallback, maximum) => {
            const text = String(value || "").trim().slice(0, maximum);
            return text || fallback;
        };
        const makeId = (value, index) => {
            const base = String(value || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 48) || `project-${index + 1}`;
            let id = base;
            let suffix = 2;
            while (usedIds.has(id)) id = `${base}-${suffix++}`;
            usedIds.add(id);
            return id;
        };

        const projects = payload.projects.map((project, projectIndex) => {
            if (!project || typeof project !== "object") {
                throw new Error(`Project ${projectIndex + 1} is not valid.`);
            }
            const milestones = Array.isArray(project.milestones) ? project.milestones : [];
            if (milestones.length > 200) {
                throw new Error(`Project ${projectIndex + 1} has too many milestones.`);
            }
            const name = cleanText(project.name, `PROJECT ${projectIndex + 1}`, 80);
            return {
                id: makeId(project.id || name, projectIndex),
                name,
                description: cleanText(project.description, "", 240),
                milestones: milestones.map((milestone, milestoneIndex) => {
                    const item = milestone && typeof milestone === "object" ? milestone : {};
                    const status = ["pending", "active", "complete", "blocked"].includes(item.status)
                        ? item.status
                        : "pending";
                    return {
                        name: cleanText(item.name, `Milestone ${milestoneIndex + 1}`, 120),
                        status
                    };
                })
            };
        });

        const temporaryFile = `${projectsFile}.tmp`;
        const backupFile = path.join(path.dirname(projectsFile), "projects.backup.json");
        if (fs.existsSync(projectsFile)) fs.copyFileSync(projectsFile, backupFile);
        fs.writeFileSync(temporaryFile, JSON.stringify({projects}, null, 4), {encoding: "utf8"});
        fs.renameSync(temporaryFile, projectsFile);
        return {ok: true, data: {projects}};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("engineering-open-projects", async () => {
    const error = await shell.openPath(projectsFile);
    return error ? {ok: false, error} : {ok: true};
});
ipc.handle("music-playlists", () => {
    try {
        const playlists = JSON.parse(fs.readFileSync(musicPlaylistsFile, "utf8"));
        return {ok: true, data: Array.isArray(playlists) ? playlists : []};
    } catch (error) {
        return {ok: false, error: error.message};
    }
});
ipc.handle("music-open-playlists", async () => {
    const error = await shell.openPath(musicPlaylistsFile);
    return error ? {ok: false, error} : {ok: true};
});
ipc.handle("music-play-playlist", async (e, playlistName) => {
    let playlists = [];
    try {
        playlists = JSON.parse(fs.readFileSync(musicPlaylistsFile, "utf8"));
    } catch (error) {}
    const allowedNames = new Set(playlists.map(playlist => {
        return typeof playlist === "string" ? playlist : playlist.name;
    }));
    if (typeof playlistName !== "string" || !allowedNames.has(playlistName)) {
        return {ok: false, error: "Unknown playlist"};
    }
    const safeName = JSON.stringify(playlistName);
    const script = `
const Music = Application("com.apple.Music");
const playlist = Music.userPlaylists.byName(${safeName});
if (!playlist.exists()) {
    JSON.stringify({played: false, error: "Playlist not found"});
} else {
    Music.play(playlist);
    JSON.stringify({played: true});
}`;
    return runAutomation(script, 12000);
});
ipc.handle("music-control", async (e, command, options = {}) => {
    const simpleCommands = {
        previous: "Application('com.apple.Music').previousTrack(); JSON.stringify({ok:true});",
        toggle: "Application('com.apple.Music').playpause(); JSON.stringify({ok:true});",
        next: "Application('com.apple.Music').nextTrack(); JSON.stringify({ok:true});"
    };
    if (simpleCommands[command]) return runAutomation(simpleCommands[command], 8000);

    if (command === "shuffle") {
        const enabled = Boolean(options && options.shuffle);
        return runAutomation(`
const Music = Application("com.apple.Music");
Music.shuffleEnabled = ${enabled ? "true" : "false"};
let shuffle = ${enabled ? "true" : "false"};
try { shuffle = Boolean(Music.shuffleEnabled()); } catch (error) {}
JSON.stringify({ok: true, shuffle});
`, 8000);
    }

    if (command === "repeat") {
        const repeat = ["off", "all", "one"].includes(options && options.repeat)
            ? options.repeat
            : "off";
        const safeRepeat = JSON.stringify(repeat);
        return runAutomation(`
const Music = Application("com.apple.Music");
function normalizeRepeat(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("one")) return "one";
    if (text.includes("all")) return "all";
    return "off";
}
Music.songRepeat = ${safeRepeat};
let repeat = ${safeRepeat};
try { repeat = normalizeRepeat(Music.songRepeat()); } catch (error) {}
JSON.stringify({ok: true, repeat});
`, 8000);
    }

    return {ok: false, error: "Unknown music command"};
});

// Unset proxy env variables to avoid connection problems on the internal websockets
// See #222
if (process.env.http_proxy) delete process.env.http_proxy;
if (process.env.https_proxy) delete process.env.https_proxy;

// Bypass GPU acceleration blocklist, trading a bit of stability for a great deal of performance, mostly on Linux
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-video-decode");

// Fix userData folder not setup on Windows
try {
    fs.mkdirSync(electron.app.getPath("userData"));
    signale.info(`Created config dir at ${electron.app.getPath("userData")}`);
} catch(e) {
    signale.info(`Base config dir is ${electron.app.getPath("userData")}`);
}
if (!fs.existsSync(projectsFile)) {
    fs.writeFileSync(projectsFile, JSON.stringify({
        projects: [
            {
                id: "car",
                name: "COCHE",
                description: "Proyecto de ingeniería y puesta a punto",
                milestones: [
                    {name: "Definir alcance", status: "complete"},
                    {name: "Diagnóstico y piezas", status: "active"},
                    {name: "Compra de componentes", status: "pending"},
                    {name: "Montaje y pruebas", status: "pending"}
                ]
            },
            {
                id: "tfg",
                name: "TFG",
                description: "Trabajo de Fin de Grado",
                milestones: [
                    {name: "Tema y alcance", status: "active"},
                    {name: "Investigación", status: "pending"},
                    {name: "Desarrollo", status: "pending"},
                    {name: "Redacción y defensa", status: "pending"}
                ]
            },
            {
                id: "ux-polish",
                name: "UX POLISH",
                description: "Usability refinements for the AegisUi cockpit",
                milestones: [
                    {name: "Preserve workspace context after modal close", status: "complete"}
                ]
            },
            {
                id: "media-player",
                name: "MEDIA PLAYER",
                description: "Playback controls and Apple Music integration",
                milestones: [
                    {name: "Add shuffle/repeat controls", status: "complete"}
                ]
            },
            {
                id: "situational-awareness",
                name: "SITUATIONAL AWARENESS",
                description: "Modular Local Situation map layers for global awareness",
                milestones: [
                    {name: "Map layer architecture", status: "complete"},
                    {name: "Situational awareness toggles", status: "complete"},
                    {name: "Future layer placeholders", status: "complete"},
                    {name: "Map layers documentation", status: "complete"}
                ]
            }
        ]
    }, null, 4));
    signale.info(`Default project timelines written to ${projectsFile}`);
}
function ensureTimelineMilestone(options) {
    try {
        const data = JSON.parse(fs.readFileSync(projectsFile, "utf8"));
        const projects = Array.isArray(data.projects) ? data.projects : [];
        let changed = false;
        let timelineProject = projects.find(project => {
            return project && (
                project.id === options.projectId
                || String(project.name || "").toLowerCase() === options.projectName.toLowerCase()
            );
        });

        if (!timelineProject) {
            timelineProject = {
                id: options.projectId,
                name: options.projectName,
                description: options.description,
                milestones: []
            };
            projects.push(timelineProject);
            changed = true;
        }

        timelineProject.milestones = Array.isArray(timelineProject.milestones) ? timelineProject.milestones : [];
        const existingMilestone = timelineProject.milestones.find(milestone => {
            return String(milestone && milestone.name || "") === options.milestoneName;
        });
        if (!existingMilestone) {
            timelineProject.milestones.push({
                name: options.milestoneName,
                status: options.status || "complete"
            });
            changed = true;
        } else if (options.status && existingMilestone.status !== options.status) {
            existingMilestone.status = options.status;
            changed = true;
        }

        if (changed) {
            const backupFile = path.join(path.dirname(projectsFile), "projects.backup.json");
            if (fs.existsSync(projectsFile)) fs.copyFileSync(projectsFile, backupFile);
            fs.writeFileSync(projectsFile, JSON.stringify({projects}, null, 4), {encoding: "utf8"});
            signale.info(`${options.projectName} timeline task added to local project data`);
        }
    } catch (error) {
        signale.warn(`Could not update ${options.projectName} timeline task: ${error.message}`);
    }
}
ensureTimelineMilestone({
    projectId: "ux-polish",
    projectName: "UX POLISH",
    description: "Usability refinements for the AegisUi cockpit",
    milestoneName: "Preserve workspace context after modal close"
});
ensureTimelineMilestone({
    projectId: "media-player",
    projectName: "MEDIA PLAYER",
    description: "Playback controls and Apple Music integration",
    milestoneName: "Add shuffle/repeat controls"
});
[
    {name: "Map layer architecture", status: "complete"},
    {name: "Situational awareness toggles", status: "complete"},
    {name: "Future layer placeholders", status: "complete"},
    {name: "Map layers documentation", status: "complete"}
].forEach(milestone => {
    ensureTimelineMilestone({
        projectId: "situational-awareness",
        projectName: "SITUATIONAL AWARENESS",
        description: "Modular Local Situation map layers for global awareness",
        milestoneName: milestone.name,
        status: milestone.status
    });
});
if (!fs.existsSync(mapLayersFile)) {
    fs.writeFileSync(mapLayersFile, JSON.stringify(defaultMapLayersConfig(), null, 4));
    signale.info(`Default map layer preferences written to ${mapLayersFile}`);
}
if (!fs.existsSync(launchBayGamesFile)) {
    fs.writeFileSync(launchBayGamesFile, JSON.stringify(defaultLaunchBayGames(), null, 4));
    signale.info(`Default Launch Bay game library written to ${launchBayGamesFile}`);
}
if (!fs.existsSync(developerDeckFile)) {
    fs.writeFileSync(developerDeckFile, JSON.stringify(defaultDeveloperDeckConfig(), null, 4));
    signale.info(`Default Developer Deck preferences written to ${developerDeckFile}`);
}
if (!fs.existsSync(agentCommandFile)) {
    fs.writeFileSync(agentCommandFile, JSON.stringify(defaultAgentCommandConfig(), null, 4));
    signale.info(`Default Agent Command deck written to ${agentCommandFile}`);
}
if (!fs.existsSync(workspaceStateFile)) {
    fs.writeFileSync(workspaceStateFile, JSON.stringify(defaultWorkspaceState(), null, 4));
    signale.info(`Default workspace state written to ${workspaceStateFile}`);
}
if (!fs.existsSync(musicPlaylistsFile)) {
    fs.writeFileSync(musicPlaylistsFile, JSON.stringify([], null, 4));
    signale.info(`Default music playlist index written to ${musicPlaylistsFile}`);
}
// Create default settings file
if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
        shell: (process.platform === "win32") ? "powershell.exe" : (process.env.SHELL || "/bin/zsh"),
        shellArgs: '',
        cwd: electron.app.getPath("userData"),
        keyboard: "en-US",
        theme: "tron",
        termFontSize: 15,
        audio: true,
        audioVolume: 1.0,
        disableFeedbackAudio: false,
        clockHours: 24,
        pingAddr: "1.1.1.1",
        port: 3000,
        nointro: false,
        nocursor: false,
        forceFullscreen: true,
        allowWindowed: false,
        excludeThreadsFromToplist: true,
        hideDotfiles: false,
        fsListView: false,
        experimentalGlobeFeatures: false,
        experimentalFeatures: false,
        offlineMode: envFlag("AEGISUI_OFFLINE_MODE"),
        disableUpdateCheck: envFlag("AEGISUI_DISABLE_UPDATE_CHECK"),
        tomtomApiKey: getTomTomApiKey()
    }, "", 4));
    signale.info(`Default settings written to ${settingsFile}`);
}
// Create default shortcuts file
if (!fs.existsSync(shortcutsFile)) {
    fs.writeFileSync(shortcutsFile, JSON.stringify([
        { type: "app", trigger: "Ctrl+Shift+C", action: "COPY", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+V", action: "PASTE", enabled: true },
        { type: "app", trigger: "Ctrl+Tab", action: "NEXT_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+Tab", action: "PREVIOUS_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+X", action: "TAB_X", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+S", action: "SETTINGS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+K", action: "SHORTCUTS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+F", action: "FUZZY_SEARCH", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+L", action: "FS_LIST_VIEW", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+H", action: "FS_DOTFILES", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+P", action: "KB_PASSMODE", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+I", action: "DEV_DEBUG", enabled: false },
        { type: "app", trigger: "Ctrl+Shift+F5", action: "DEV_RELOAD", enabled: true },
        { type: "shell", trigger: "Ctrl+Shift+Alt+Space", action: "neofetch", linebreak: true, enabled: false }
    ], "", 4));
    signale.info(`Default keymap written to ${shortcutsFile}`);
}
//Create default window state file
if(!fs.existsSync(lastWindowStateFile)) {
    fs.writeFileSync(lastWindowStateFile, JSON.stringify({
        useFullscreen: true
    }, "", 4));
    signale.info(`Default last window state written to ${lastWindowStateFile}`);
}

// Copy default themes & keyboard layouts & fonts
signale.pending("Mirroring internal assets...");
const installDefaultAssets = (sourceDirectory, destinationDirectory) => {
    fs.mkdirSync(destinationDirectory, {recursive: true});
    fs.readdirSync(sourceDirectory).forEach(fileName => {
        const destination = path.join(destinationDirectory, fileName);
        if (!fs.existsSync(destination)) {
            fs.copyFileSync(path.join(sourceDirectory, fileName), destination);
        }
    });
};
installDefaultAssets(innerThemesDir, themesDir);
installDefaultAssets(innerKblayoutsDir, kblayoutsDir);
installDefaultAssets(innerFontsDir, fontsDir);

// Version history logging
const versionHistoryPath = path.join(electron.app.getPath("userData"), "versions_log.json");
var versionHistory = fs.existsSync(versionHistoryPath) ? require(versionHistoryPath) : {};
var version = app.getVersion();
if (typeof versionHistory[version] === "undefined") {
	versionHistory[version] = {
		firstSeen: Date.now(),
		lastSeen: Date.now()
	};
} else {
	versionHistory[version].lastSeen = Date.now();
}
fs.writeFileSync(versionHistoryPath, JSON.stringify(versionHistory, 0, 2), {encoding:"utf-8"});

function createWindow(settings) {
    signale.info("Creating window...");

    let display;
    if (!isNaN(settings.monitor)) {
        display = electron.screen.getAllDisplays()[settings.monitor] || electron.screen.getPrimaryDisplay();
    } else {
        display = electron.screen.getPrimaryDisplay();
    }
    let {x, y, width, height} = display.bounds;
    width++; height++;
    win = new BrowserWindow({
        title: "EdexUi-Eng",
        x,
        y,
        width,
        height,
        show: false,
        resizable: true,
        movable: settings.allowWindowed || false,
        fullscreen: settings.forceFullscreen || false,
        autoHideMenuBar: true,
        frame: settings.allowWindowed || false,
        backgroundColor: '#000000',
        webPreferences: {
            devTools: true,
            contextIsolation: false,
            backgroundThrottling: false,
            webSecurity: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: settings.experimentalFeatures || false
        }
    });

    remoteMain.enable(win.webContents);

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'ui.html'),
        protocol: 'file:',
        slashes: true
    }));

    signale.complete("Frontend window created!");
    win.show();
    if (!settings.allowWindowed) {
        win.setResizable(false);
    } else if (!require(lastWindowStateFile)["useFullscreen"]) {
        win.setFullScreen(false);
    }

    signale.watch("Waiting for frontend connection...");
}

app.on('ready', async () => {
    signale.pending(`Loading settings file...`);
    let settings = require(settingsFile);
    settings.offlineMode = Boolean(settings.offlineMode || envFlag("AEGISUI_OFFLINE_MODE"));
    settings.disableUpdateCheck = Boolean(settings.disableUpdateCheck || envFlag("AEGISUI_DISABLE_UPDATE_CHECK"));
    signale.pending(`Resolving shell path...`);
    settings.shell = await which(settings.shell).catch(e => { throw(e) });
    signale.info(`Shell found at ${settings.shell}`);
    signale.success(`Settings loaded!`);
    initGeoIP(settings);

    if (!require("fs").existsSync(settings.cwd)) throw new Error("Configured cwd path does not exist.");

    // See #366
    let cleanEnv = Object.assign({}, process.env);
    if (process.platform === "darwin") {
        cleanEnv.PATH = Array.from(new Set([
            ...(cleanEnv.PATH || "").split(":"),
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin"
        ].filter(Boolean))).join(":");
    } else {
        try {
            cleanEnv = await require("shell-env")(settings.shell);
        } catch (error) {
            signale.warn(`${error.message}; using the current process environment`);
        }
    }

    Object.assign(cleanEnv, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "EdexUi-Eng",
        TERM_PROGRAM_VERSION: app.getVersion()
    }, settings.env);

    signale.pending(`Creating new terminal process on port ${settings.port || '3000'}`);
    tty = new Terminal({
        role: "server",
        shell: settings.shell,
        params: settings.shellArgs || '',
        cwd: settings.cwd,
        env: cleanEnv,
        port: settings.port || 3000
    });
    signale.success(`Terminal back-end initialized!`);
    tty.onclosed = (code, signal) => {
        tty.ondisconnected = () => {};
        signale.complete("Terminal exited", code, signal);
        app.quit();
    };
    tty.onopened = () => {
        signale.success("Connected to frontend!");
        signale.timeEnd("Startup");
    };
    tty.onresized = (cols, rows) => {
        signale.info("Resized TTY to ", cols, rows);
    };
    tty.ondisconnected = () => {
        signale.error("Lost connection to frontend");
        signale.watch("Waiting for frontend connection...");
    };

    // Support for multithreaded systeminformation calls
    signale.pending("Starting multithreaded calls controller...");
    require("./_multithread.js");

    createWindow(settings);

    // Support for more terminals, used for creating tabs (currently limited to 4 extra terms)
    extraTtys = {};
    let basePort = settings.port || 3000;
    basePort = Number(basePort) + 2;

    for (let i = 0; i < 4; i++) {
        extraTtys[basePort+i] = null;
    }

    ipc.on("ttyspawn", (e, arg) => {
        let port = null;
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] === null && port === null) {
                extraTtys[key] = {};
                port = key;
            }
        });

        if (port === null) {
            signale.error("TTY spawn denied (Reason: exceeded max TTYs number)");
            e.sender.send("ttyspawn-reply", "ERROR: max number of ttys reached");
        } else {
            signale.pending(`Creating new TTY process on port ${port}`);
            let term = new Terminal({
                role: "server",
                shell: settings.shell,
                params: settings.shellArgs || '',
                cwd: tty.tty._cwd || settings.cwd,
                env: cleanEnv,
                port: port
            });
            signale.success(`New terminal back-end initialized at ${port}`);
            term.onclosed = (code, signal) => {
                term.ondisconnected = () => {};
                term.wss.close();
                signale.complete(`TTY exited at ${port}`, code, signal);
                extraTtys[term.port] = null;
                term = null;
            };
            term.onopened = pid => {
                signale.success(`TTY ${port} connected to frontend (process PID ${pid})`);
            };
            term.onresized = () => {};
            term.ondisconnected = () => {
                term.onclosed = () => {};
                term.close();
                term.wss.close();
                extraTtys[term.port] = null;
                term = null;
            };

            extraTtys[port] = term;
            e.sender.send("ttyspawn-reply", "SUCCESS: "+port);
        }
    });

    // Backend support for theme and keyboard hotswitch
    let themeOverride = null;
    let kbOverride = null;
    ipc.on("getThemeOverride", (e, arg) => {
        e.sender.send("getThemeOverride", themeOverride);
    });
    ipc.on("getKbOverride", (e, arg) => {
        e.sender.send("getKbOverride", kbOverride);
    });
    ipc.on("setThemeOverride", (e, arg) => {
        themeOverride = arg;
    });
    ipc.on("setKbOverride", (e, arg) => {
        kbOverride = arg;
    });
});

app.on('web-contents-created', (e, contents) => {
    // Prevent creating more than one window; open external URLs in default browser
    contents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (["https:", "mailto:"].includes(parsed.protocol)) {
                shell.openExternal(parsed.toString());
            }
        } catch (error) {}
        return { action: 'deny' };
    });

    // Prevent loading something else than the UI
    contents.on('will-navigate', (e, url) => {
        if (contents.__aegisOsintSource) return;
        if (url !== contents.getURL()) e.preventDefault();
    });
});

app.on('window-all-closed', () => {
    signale.info("All windows closed");
    app.quit();
});

app.on('before-quit', () => {
    closeOsintSourceView();
    if (tty) tty.close();
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    signale.complete("Shutting down...");
});
