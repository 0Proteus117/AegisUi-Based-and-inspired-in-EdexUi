const os = require("os");
const path = require("path");

const DEFAULT_APP_DATA_DIR = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "EdexUi-Eng"
);

const USER_DATA_DIR = process.env.AEGISUI_USER_DATA_DIR || DEFAULT_APP_DATA_DIR;

const EXPORTABLE_JSON_FILES = [
    "settings.json",
    "shortcuts.json",
    "lastWindowState.json",
    "projects.json",
    "music-playlists.json",
    "map-layers.json",
    "launch-bay-games.json"
];

const SENSITIVE_KEYS = new Set([
    "apiKey",
    "apikey",
    "api_key",
    "tomtomApiKey",
    "token",
    "accessToken",
    "refreshToken",
    "secret",
    "clientSecret",
    "password",
    "cookie",
    "session"
]);

function redactSensitiveData(value) {
    if (Array.isArray(value)) return value.map(redactSensitiveData);
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (SENSITIVE_KEYS.has(key)) return [key, ""];
        return [key, redactSensitiveData(item)];
    }));
}

function mergeWithoutSecrets(existing, incoming) {
    if (!incoming || typeof incoming !== "object") return incoming;
    if (!existing || typeof existing !== "object") return redactSensitiveData(incoming);

    const cleaned = redactSensitiveData(incoming);
    for (const key of SENSITIVE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(existing, key)) {
            cleaned[key] = existing[key];
        }
    }
    return cleaned;
}

module.exports = {
    DEFAULT_APP_DATA_DIR,
    EXPORTABLE_JSON_FILES,
    SENSITIVE_KEYS,
    USER_DATA_DIR,
    mergeWithoutSecrets,
    redactSensitiveData
};
