const signale = require("signale");
const {app, BrowserWindow, dialog, shell, nativeImage} = require("electron");
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

ipc.on("log", (e, type, content) => {
    signale[type](content);
});

var win, tty, extraTtys;
const settingsFile = path.join(electron.app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(electron.app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(electron.app.getPath("userData"), "lastWindowState.json");
const projectsFile = path.join(electron.app.getPath("userData"), "projects.json");
const musicPlaylistsFile = path.join(electron.app.getPath("userData"), "music-playlists.json");
const mapLayersFile = path.join(electron.app.getPath("userData"), "map-layers.json");
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

function loadLocalEnvFile() {
    const candidates = [
        process.env.AEGISUI_ENV_FILE,
        path.join(process.cwd(), ".env"),
        path.join(__dirname, "..", ".env")
    ];
    try {
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

ipc.handle("runtime-config", () => ({
    tomtomApiKey: process.env.AEGISUI_TOMTOM_API_KEY || "",
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
const Music = Application("Music");
function normalizeRepeat(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("one")) return "one";
    if (text.includes("all")) return "all";
    return "off";
}
if (!Music.running()) {
    JSON.stringify({running: false, state: "stopped"});
} else {
    let result = {running: true, state: String(Music.playerState())};
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
const Music = Application("Music");
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

async function runAutomation(script, timeout = 20000, maxBuffer = 1024 * 1024) {
    if (process.platform !== "darwin") {
        return {ok: false, error: "This integration is available on macOS only."};
    }
    try {
        const {stdout} = await execFileAsync("/usr/bin/osascript", [
            "-l", "JavaScript", "-e", script
        ], {timeout, maxBuffer});
        return {ok: true, data: JSON.parse(stdout.trim() || "null")};
    } catch (error) {
        const message = (error.stderr || error.message || "").trim();
        return {
            ok: false,
            permissionDenied: message.includes("-1743"),
            error: message || "Automation request failed."
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
        const parsed = new URL(String(target || ""));
        if (parsed.protocol !== "https:") throw new Error("Only secure HTTPS links are allowed.");
        await shell.openExternal(parsed.toString());
        return {ok: true};
    } catch (error) {
        return {ok: false, error: error.message || "Cannot open this link."};
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
const Music = Application("Music");
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
        previous: "Application('Music').previousTrack(); JSON.stringify({ok:true});",
        toggle: "Application('Music').playpause(); JSON.stringify({ok:true});",
        next: "Application('Music').nextTrack(); JSON.stringify({ok:true});"
    };
    if (simpleCommands[command]) return runAutomation(simpleCommands[command], 8000);

    if (command === "shuffle") {
        const enabled = Boolean(options && options.shuffle);
        return runAutomation(`
const Music = Application("Music");
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
const Music = Application("Music");
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
        const hasMilestone = timelineProject.milestones.some(milestone => {
            return String(milestone && milestone.name || "") === options.milestoneName;
        });
        if (!hasMilestone) {
            timelineProject.milestones.push({
                name: options.milestoneName,
                status: options.status || "complete"
            });
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
if (!fs.existsSync(mapLayersFile)) {
    fs.writeFileSync(mapLayersFile, JSON.stringify(defaultMapLayersConfig(), null, 4));
    signale.info(`Default map layer preferences written to ${mapLayersFile}`);
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
        tomtomApiKey: process.env.AEGISUI_TOMTOM_API_KEY || ""
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
        if (url !== contents.getURL()) e.preventDefault();
    });
});

app.on('window-all-closed', () => {
    signale.info("All windows closed");
    app.quit();
});

app.on('before-quit', () => {
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
