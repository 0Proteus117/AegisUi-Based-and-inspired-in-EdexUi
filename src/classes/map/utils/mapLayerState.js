const MAP_LAYER_STATES = Object.freeze({
    OFF: "OFF",
    LOADING: "LOADING",
    ONLINE: "ONLINE",
    OFFLINE: "OFFLINE",
    API_KEY_MISSING: "API_KEY_MISSING",
    CONFIG_REQUIRED: "CONFIG_REQUIRED",
    RATE_LIMITED: "RATE_LIMITED",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    ERROR: "ERROR",
    DISABLED: "DISABLED",
    NO_DATA: "NO_DATA",
    CONNECTING: "CONNECTING",
    POSITION_ENGINE_REQUIRED: "POSITION_ENGINE_REQUIRED",
    POSITION_ENGINE_ERROR: "POSITION_ENGINE_ERROR"
});

const ATTENTION_STATES = new Set([
    MAP_LAYER_STATES.OFFLINE,
    MAP_LAYER_STATES.API_KEY_MISSING,
    MAP_LAYER_STATES.CONFIG_REQUIRED,
    MAP_LAYER_STATES.RATE_LIMITED,
    MAP_LAYER_STATES.SERVICE_UNAVAILABLE,
    MAP_LAYER_STATES.ERROR,
    MAP_LAYER_STATES.POSITION_ENGINE_ERROR
]);

const INFORMATIVE_STATES = new Set([
    MAP_LAYER_STATES.NO_DATA,
    MAP_LAYER_STATES.POSITION_ENGINE_REQUIRED,
    MAP_LAYER_STATES.DISABLED
]);

function isOffline(context = {}) {
    const offlineMode = typeof context.offlineMode === "function"
        ? context.offlineMode()
        : Boolean(context.offlineMode);
    return offlineMode || (typeof navigator !== "undefined" && navigator.onLine === false);
}

function sanitizeErrorMessage(error, fallback = "Provider unavailable") {
    if (!error) return fallback;
    if (typeof error === "string") return error.slice(0, 180);
    return String(error.message || error.error || error.statusText || fallback).slice(0, 180);
}

function normalizeProviderError(error, context = {}) {
    if (isOffline(context)) return MAP_LAYER_STATES.OFFLINE;
    if (!error) return MAP_LAYER_STATES.ERROR;

    const statusCode = Number(error.status || error.statusCode || error.code);
    const message = sanitizeErrorMessage(error, "").toLowerCase();

    if (error.name === "AbortError") return MAP_LAYER_STATES.OFF;
    if (statusCode === 429 || message.includes("rate") || message.includes("too many")) {
        return MAP_LAYER_STATES.RATE_LIMITED;
    }
    if ([401, 403].includes(statusCode)
        || message.includes("unauthorized")
        || message.includes("forbidden")
        || message.includes("api key")
        || message.includes("apikey")
        || message.includes("credential")) {
        return MAP_LAYER_STATES.API_KEY_MISSING;
    }
    if (statusCode >= 500
        || message.includes("timeout")
        || message.includes("network")
        || message.includes("service")
        || message.includes("fetch failed")
        || message.includes("load failed")) {
        return MAP_LAYER_STATES.SERVICE_UNAVAILABLE;
    }
    return MAP_LAYER_STATES.ERROR;
}

function formatMapTimestamp(value) {
    if (!value) return "";
    try {
        return new Date(value).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
    } catch (error) {
        return "";
    }
}

function statusNeedsAttention(status) {
    return ATTENTION_STATES.has(status);
}

function statusIsInformative(status) {
    return INFORMATIVE_STATES.has(status);
}

module.exports = {
    MAP_LAYER_STATES,
    isOffline,
    normalizeProviderError,
    sanitizeErrorMessage,
    formatMapTimestamp,
    statusNeedsAttention,
    statusIsInformative
};
