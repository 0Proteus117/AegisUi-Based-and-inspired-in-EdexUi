const {
    MAP_LAYER_STATES,
    normalizeProviderError,
    sanitizeErrorMessage
} = require("../utils/mapLayerState.js");

function escapeHtml(value) {
    if (typeof window !== "undefined" && typeof window._escapeHtml === "function") {
        return window._escapeHtml(String(value == null ? "" : value));
    }
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

class BaseMapProvider {
    constructor(definition) {
        this.definition = definition;
        this.id = definition.id;
        this.status = MAP_LAYER_STATES.OFF;
        this.error = "";
        this.summary = "No data loaded while disabled";
        this.updatedAt = null;
        this.count = 0;
        this.active = false;
        this.onUpdate = null;
        this.resources = this.createResourceBag();
    }

    createResourceBag() {
        return {
            timers: [],
            abortControllers: [],
            leafletLayers: [],
            mapListeners: [],
            sockets: []
        };
    }

    bindUpdate(callback) {
        this.onUpdate = callback;
    }

    emitUpdate() {
        if (typeof this.onUpdate === "function") this.onUpdate(this.getStatus());
    }

    setStatus(status, options = {}) {
        this.status = status;
        if (Object.prototype.hasOwnProperty.call(options, "error")) {
            this.error = options.error ? sanitizeErrorMessage(options.error) : "";
        }
        if (Object.prototype.hasOwnProperty.call(options, "summary")) {
            this.summary = options.summary || "";
        }
        if (Object.prototype.hasOwnProperty.call(options, "count")) {
            this.count = Number.isFinite(Number(options.count)) ? Number(options.count) : 0;
        }
        if (options.updatedAt || status === MAP_LAYER_STATES.ONLINE) {
            this.updatedAt = options.updatedAt || new Date().toISOString();
        }
        this.emitUpdate();
    }

    getStatus() {
        return {
            id: this.id,
            status: this.status,
            error: this.error,
            summary: this.summary,
            updatedAt: this.updatedAt,
            count: this.count
        };
    }

    isConfigured() {
        return true;
    }

    async start(context) {
        this.active = true;
        this.context = context;
        this.setStatus(MAP_LAYER_STATES.LOADING, {
            error: "",
            summary: "Loading provider data",
            count: 0
        });
    }

    async refresh(context = this.context) {
        return this.start(context);
    }

    stop(context = this.context) {
        this.active = false;
        this.cleanup(context);
        this.setStatus(MAP_LAYER_STATES.OFF, {
            error: "",
            summary: "No data loaded while disabled",
            count: 0
        });
    }

    cleanup(context = this.context) {
        this.resources.timers.forEach(timer => clearInterval(timer));
        this.resources.timers = [];

        this.resources.abortControllers.forEach(controller => {
            try {
                controller.abort();
            } catch (error) {}
        });
        this.resources.abortControllers = [];

        this.removeLeafletLayers(context);

        this.resources.mapListeners.forEach(listener => {
            try {
                listener.map.off(listener.event, listener.handler);
            } catch (error) {}
        });
        this.resources.mapListeners = [];

        this.resources.sockets.forEach(socket => {
            try {
                if (socket && socket.readyState <= 1) socket.close();
            } catch (error) {}
        });
        this.resources.sockets = [];
    }

    removeLeafletLayers(context = this.context) {
        this.resources.leafletLayers.forEach(layer => {
            try {
                if (context && context.map && context.map.hasLayer(layer)) context.map.removeLayer(layer);
            } catch (error) {}
        });
        this.resources.leafletLayers = [];
    }

    rememberLeafletLayer(layer) {
        if (layer) this.resources.leafletLayers.push(layer);
        return layer;
    }

    rememberTimer(timer) {
        if (timer) this.resources.timers.push(timer);
        return timer;
    }

    rememberSocket(socket) {
        if (socket) this.resources.sockets.push(socket);
        return socket;
    }

    createAbortController() {
        const controller = new AbortController();
        this.resources.abortControllers.push(controller);
        return controller;
    }

    rememberMapListener(map, event, handler) {
        if (!map || typeof map.on !== "function") return;
        map.on(event, handler);
        this.resources.mapListeners.push({map, event, handler});
    }

    getMapBounds(context = this.context) {
        if (!context || !context.map || typeof context.map.getBounds !== "function") return null;
        const bounds = context.map.getBounds();
        return {
            south: Math.max(-90, bounds.getSouth()),
            west: Math.max(-180, bounds.getWest()),
            north: Math.min(90, bounds.getNorth()),
            east: Math.min(180, bounds.getEast())
        };
    }

    async fetchJson(url, options = {}) {
        const text = await this.fetchText(url, options);
        try {
            return JSON.parse(text);
        } catch (error) {
            throw error;
        }
    }

    async fetchText(url, options = {}) {
        if (typeof require === "function") {
            return this.fetchTextWithNode(url, options);
        }

        const response = await fetch(url, options);
        if (!response.ok) {
            const error = new Error(`Remote service returned ${response.status}`);
            error.status = response.status;
            error.statusText = response.statusText;
            throw error;
        }
        return response.text();
    }

    fetchTextWithNode(remoteUrl, options = {}) {
        return new Promise((resolve, reject) => {
            const https = require("https");
            const parsed = new URL(remoteUrl);
            const request = https.request(parsed, {
                method: options.method || "GET",
                headers: options.headers || {}
            }, response => {
                let body = "";
                response.setEncoding("utf8");
                response.on("data", chunk => body += chunk);
                response.on("end", () => {
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        const error = new Error(`Remote service returned ${response.statusCode}`);
                        error.status = response.statusCode;
                        error.statusText = response.statusMessage;
                        reject(error);
                        return;
                    }
                    resolve(body);
                });
            });

            request.setTimeout(options.timeoutMs || 10000, () => {
                request.destroy(new Error("Remote service timeout"));
            });
            request.on("error", reject);

            if (options.signal) {
                if (options.signal.aborted) {
                    request.destroy(new Error("Request aborted"));
                    return;
                }
                options.signal.addEventListener("abort", () => {
                    request.destroy(new Error("Request aborted"));
                }, {once: true});
            }

            if (options.body) request.write(String(options.body));
            request.end();
        });
    }

    applyProviderError(error, context = this.context, fallback = "Provider unavailable") {
        const status = normalizeProviderError(error, context);
        if (status === MAP_LAYER_STATES.OFF && !this.active) return;
        this.setStatus(status, {
            error: sanitizeErrorMessage(error, fallback),
            summary: fallback
        });
    }

    escapeHtml(value) {
        return escapeHtml(value);
    }
}

module.exports = {BaseMapProvider, escapeHtml};
