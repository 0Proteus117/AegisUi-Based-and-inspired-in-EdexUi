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

async function initGeoIP() {
    try {
        const geolite2 = await import("geolite2-redist");
        const maxmind = require("maxmind");
        const cacheDir = path.join(electron.app.getPath("userData"), "geoIPcache");

        await geolite2.downloadDbs({
            dbList: ["GeoLite2-City"],
            path: cacheDir
        });
        geoLookup = await geolite2.open("GeoLite2-City", dbPath => maxmind.open(dbPath), cacheDir);
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
        require("https").get(remoteUrl, response => {
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
        }).on("error", reject);
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

const calendarScript = `
const Calendar = Application("Calendar");
const now = new Date();
const horizon = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
const events = [];
const calendars = [];
Calendar.calendars().forEach(calendar => {
    const calendarName = calendar.name();
    let matches = [];
    try {
        matches = calendar.events.whose({
            startDate: {_greaterThan: now, _lessThan: horizon}
        })();
    } catch (error) {}
    calendars.push({name: calendarName, eventCount: matches.length});
    matches.forEach(event => {
        try {
            const start = new Date(event.startDate());
            events.push({
                title: event.summary() || "Untitled event",
                start: start.toISOString(),
                end: new Date(event.endDate()).toISOString(),
                location: String(event.location() || ""),
                calendar: calendarName,
                allDay: Boolean(event.alldayEvent())
            });
        } catch (error) {}
    });
});
events.sort((a, b) => a.start.localeCompare(b.start));
JSON.stringify({
    calendars,
    events: events.slice(0, 32)
});
`;

const musicStatusScript = `
const Music = Application("Music");
if (!Music.running()) {
    JSON.stringify({running: false, state: "stopped"});
} else {
    let result = {running: true, state: String(Music.playerState())};
    try {
        const track = Music.currentTrack();
        const properties = track.properties();
        result = Object.assign(result, {
            title: properties.name || "Unknown track",
            artist: properties.artist || "Unknown artist",
            album: properties.album || "",
            duration: Number(properties.duration || 0),
            position: Number(Music.playerPosition() || 0)
        });
    } catch (error) {}
    JSON.stringify(result);
}
`;

async function runAutomation(script, timeout = 20000) {
    if (process.platform !== "darwin") {
        return {ok: false, error: "This integration is available on macOS only."};
    }
    try {
        const {stdout} = await execFileAsync("/usr/bin/osascript", [
            "-l", "JavaScript", "-e", script
        ], {timeout, maxBuffer: 1024 * 1024});
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

ipc.handle("calendar-events", () => runAutomation(calendarScript));
ipc.handle("music-status", () => runAutomation(musicStatusScript, 8000));
ipc.handle("calendar-open-accounts", () => {
    return shell.openExternal("x-apple.systempreferences:com.apple.Internet-Accounts-Settings.extension");
});
ipc.handle("traffic-open-key-page", () => {
    return shell.openExternal("https://developer.tomtom.com/platform/documentation/my-tomtom/how-to-get-a-tomtom-api-key");
});
ipc.handle("engineering-projects", () => {
    try {
        return {ok: true, data: JSON.parse(fs.readFileSync(projectsFile, "utf8"))};
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
ipc.handle("music-control", async (e, command) => {
    const commands = {
        previous: "Application('Music').previousTrack(); JSON.stringify({ok:true});",
        toggle: "Application('Music').playpause(); JSON.stringify({ok:true});",
        next: "Application('Music').nextTrack(); JSON.stringify({ok:true});"
    };
    if (!commands[command]) return {ok: false, error: "Unknown music command"};
    return runAutomation(commands[command], 8000);
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
            }
        ]
    }, null, 4));
    signale.info(`Default project timelines written to ${projectsFile}`);
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
        tomtomApiKey: ""
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
try {
    fs.mkdirSync(themesDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerThemesDir).forEach(e => {
    fs.writeFileSync(path.join(themesDir, e), fs.readFileSync(path.join(innerThemesDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(kblayoutsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerKblayoutsDir).forEach(e => {
    fs.writeFileSync(path.join(kblayoutsDir, e), fs.readFileSync(path.join(innerKblayoutsDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(fontsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerFontsDir).forEach(e => {
    fs.writeFileSync(path.join(fontsDir, e), fs.readFileSync(path.join(innerFontsDir, e)));
});

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
    signale.pending(`Resolving shell path...`);
    settings.shell = await which(settings.shell).catch(e => { throw(e) });
    signale.info(`Shell found at ${settings.shell}`);
    signale.success(`Settings loaded!`);
    initGeoIP();

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
        shell.openExternal(url);
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
