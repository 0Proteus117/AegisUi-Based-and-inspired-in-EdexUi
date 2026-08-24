(function aisProviderModule() {
const {BaseMapProvider} = typeof window !== "undefined" ? window.AegisBaseMapProvider : require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = typeof window !== "undefined" ? window.AegisMapLayerState : require("../utils/mapLayerState.js");

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const AIS_BUFFER_CAP = 1000;
const AIS_STALE_TTL_MS = 15 * 60 * 1000;
const AIS_RENDER_THROTTLE_MS = 7000;
const AIS_DEFAULT_REFRESH_MS = 60 * 1000;

const AIS_PRESET_BOUNDS = Object.freeze({
    CURRENT_VIEW: null,
    MEDITERRANEAN: {south: 30, west: -6, north: 46, east: 37},
    GIBRALTAR: {south: 34.8, west: -6.8, north: 37.2, east: -3.5},
    NORTH_SEA: {south: 51, west: -5, north: 62, east: 10},
    ENGLISH_CHANNEL: {south: 48, west: -6, north: 52, east: 3},
    SINGAPORE_STRAIT: {south: 0.8, west: 103.2, north: 1.7, east: 104.5},
    CARIBBEAN: {south: 8, west: -90, north: 28, east: -58},
    US_EAST_COAST: {south: 24, west: -82, north: 46, east: -64},
    US_WEST_COAST: {south: 31, west: -128, north: 49, east: -116},
    JAPAN: {south: 30, west: 128, north: 46, east: 146},
    AUSTRALIA_EAST: {south: -44, west: 145, north: -10, east: 156}
});

const WORLD_SAMPLE_BOXES = Object.freeze([
    AIS_PRESET_BOUNDS.GIBRALTAR,
    AIS_PRESET_BOUNDS.ENGLISH_CHANNEL,
    AIS_PRESET_BOUNDS.SINGAPORE_STRAIT,
    AIS_PRESET_BOUNDS.US_EAST_COAST,
    AIS_PRESET_BOUNDS.JAPAN
]);

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function vesselIdentity(payload) {
    const meta = payload.MetaData || {};
    const message = payload.Message || {};
    const staticData = message.ShipStaticData || {};
    const report = message.PositionReport
        || message.StandardClassBPositionReport
        || message.ExtendedClassBPositionReport
        || {};

    const mmsi = meta.MMSI_String || meta.MMSI || report.UserID || report.MMSI || "";
    const name = meta.ShipName || staticData.Name || staticData.ShipName || "";
    return {mmsi: String(mmsi || "").trim(), name: String(name || "").trim()};
}

function vesselPosition(payload) {
    const meta = payload.MetaData || {};
    const message = payload.Message || {};
    const report = message.PositionReport
        || message.StandardClassBPositionReport
        || message.ExtendedClassBPositionReport
        || {};

    return {
        latitude: finiteNumber(report.Latitude == null ? meta.latitude || meta.Latitude : report.Latitude),
        longitude: finiteNumber(report.Longitude == null ? meta.longitude || meta.Longitude : report.Longitude),
        course: finiteNumber(report.Cog == null ? report.CourseOverGround || report.COG : report.Cog),
        speed: finiteNumber(report.Sog == null ? report.SpeedOverGround || report.SOG : report.Sog),
        heading: finiteNumber(report.TrueHeading == null ? report.Heading : report.TrueHeading),
        timestamp: meta.time_utc || meta.Time_UTC || meta.timestamp || new Date().toISOString()
    };
}

function aisRawMessageToText(raw) {
    if (raw == null) return "";
    if (typeof raw === "string") return raw;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) return raw.toString("utf8");
    if (raw instanceof ArrayBuffer && typeof Buffer !== "undefined") {
        return Buffer.from(raw).toString("utf8");
    }
    if (ArrayBuffer.isView(raw) && typeof Buffer !== "undefined") {
        return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8");
    }
    if (raw.data !== undefined) return aisRawMessageToText(raw.data);
    return String(raw);
}

function normalizeMode(mode) {
    const next = String(mode || "CURRENT_VIEW").toUpperCase();
    if (next === "VISIBLE") return "CURRENT_VIEW";
    if (next === "WORLD") return "WORLD_SAMPLE";
    if (next === "ATLANTIC") return "MEDITERRANEAN";
    if (AIS_PRESET_BOUNDS[next] !== undefined || next === "WORLD_SAMPLE") return next;
    return "CURRENT_VIEW";
}

function leafletBox(bounds) {
    if (!bounds) return null;
    return [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east]
    ];
}

function boundsContain(bounds, vessel) {
    if (!bounds || !vessel) return true;
    return vessel.latitude >= bounds.south
        && vessel.latitude <= bounds.north
        && vessel.longitude >= bounds.west
        && vessel.longitude <= bounds.east;
}

function boundsArea(bounds) {
    if (!bounds) return 0;
    return Math.abs(bounds.north - bounds.south) * Math.abs(bounds.east - bounds.west);
}

class AISProvider extends BaseMapProvider {
    constructor(definition) {
        super(definition);
        this.vessels = null;
        this.markers = null;
        this.layerGroup = null;
        this.socket = null;
        this.intentionalClose = false;
        this.renderTimer = null;
        this.subscriptionTimer = null;
        this.lastRenderAt = 0;
        this.lastSubscriptionAt = 0;
        this.lastManualMode = "";
        this.activeMode = normalizeMode(definition.areaMode);
        this.activeBoxes = [];
        this.visibleCount = 0;
        this.bufferedCount = 0;
        this.autoFallbackApplied = false;
    }

    isConfigured(context = this.context) {
        return Boolean(this.getApiKey(context));
    }

    getApiKey(context = this.context) {
        if (!context || !context.getEnv) return "";
        return context.getEnv("AISSTREAM_API_KEY")
            || context.getEnv("AEGISUI_AISSTREAM_API_KEY")
            || context.getEnv("AEGISUI_AIS_API_KEY")
            || "";
    }

    async start(context) {
        await super.start(context);

        if (isOffline(context)) {
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · maritime AIS disabled"
            });
            return;
        }

        if (!this.isConfigured(context)) {
            this.setStatus(MAP_LAYER_STATES.CONFIG_REQUIRED, {
                error: "AISStream API key missing",
                summary: "Set AISSTREAM_API_KEY in your private .env to enable AIS"
            });
            return;
        }

        this.vessels = new Map();
        this.markers = new Map();
        this.layerGroup = context.L.layerGroup();
        this.autoFallbackApplied = false;
        this.visibleCount = 0;
        this.bufferedCount = 0;
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);

        this.rememberMapListener(context.map, "moveend", () => this.scheduleSubscriptionUpdate(context, "viewport"));
        this.rememberMapListener(context.map, "zoomend", () => this.scheduleSubscriptionUpdate(context, "viewport"));
        this.rememberTimer(setInterval(() => this.pruneStaleVessels(context), AIS_DEFAULT_REFRESH_MS));
        this.rememberTimer(setInterval(() => this.updateStatusSummary(), 15 * 1000));

        this.openSocket(context, {force: true, reason: "start"});
    }

    stop(context = this.context) {
        this.intentionalClose = true;
        this.closeSocket();
        if (this.renderTimer) clearTimeout(this.renderTimer);
        if (this.subscriptionTimer) clearTimeout(this.subscriptionTimer);
        this.renderTimer = null;
        this.subscriptionTimer = null;
        this.markers = null;
        this.vessels = null;
        this.layerGroup = null;
        this.intentionalClose = false;
        super.stop(context);
    }

    refresh(context = this.context) {
        this.openSocket(context, {force: true, reason: "manual refresh"});
    }

    scheduleSubscriptionUpdate(context, reason = "viewport") {
        if (!this.active || normalizeMode(this.definition.areaMode) !== "CURRENT_VIEW") return;
        const refreshMs = this.refreshIntervalMs();
        const elapsed = Date.now() - this.lastSubscriptionAt;
        if (elapsed >= refreshMs) {
            this.openSocket(context, {force: true, reason});
            return;
        }
        if (this.subscriptionTimer) clearTimeout(this.subscriptionTimer);
        this.subscriptionTimer = this.rememberTimer(setTimeout(() => {
            this.subscriptionTimer = null;
            if (this.active) this.openSocket(context, {force: true, reason: "debounced viewport"});
        }, Math.max(1000, refreshMs - elapsed)));
    }

    openSocket(context, options = {}) {
        const mode = normalizeMode(this.definition.areaMode);
        const boxes = this.getSubscriptionBoxes(context, mode);
        if (!boxes.length) {
            this.setStatus(MAP_LAYER_STATES.ERROR, {
                error: "Map bounds unavailable",
                summary: "Cannot subscribe to AIS without map bounds"
            });
            return;
        }

        const refreshMs = this.refreshIntervalMs();
        const elapsed = Date.now() - this.lastSubscriptionAt;
        const modeUnchanged = this.lastManualMode === `${mode}:${JSON.stringify(boxes)}`;
        if (!options.force && modeUnchanged && elapsed < refreshMs) return;

        this.closeSocket();
        this.activeMode = mode;
        this.activeBoxes = boxes;
        this.lastManualMode = `${mode}:${JSON.stringify(boxes)}`;
        this.lastSubscriptionAt = Date.now();

        this.setStatus(MAP_LAYER_STATES.CONNECTING, {
            error: "",
            summary: `AISStream reconnecting · ${this.areaModeLabel(mode)}`
        });

        const WebSocketClient = typeof WebSocket !== "undefined" ? WebSocket : null;
        if (!WebSocketClient) {
            this.setStatus(MAP_LAYER_STATES.ERROR, {
                error: "No WebSocket implementation available",
                summary: "AISStream requires Node ws or browser WebSocket"
            });
            return;
        }

        const socket = new WebSocketClient(AISSTREAM_URL);
        this.socket = this.rememberSocket(socket);

        const handleOpen = () => {
            if (!this.active || socket !== this.socket) return;
            socket.send(JSON.stringify({
                APIKey: this.getApiKey(context),
                BoundingBoxes: boxes.map(leafletBox),
                FilterMessageTypes: [
                    "PositionReport",
                    "StandardClassBPositionReport",
                    "ExtendedClassBPositionReport",
                    "ShipStaticData"
                ]
            }));
            this.setStatus(MAP_LAYER_STATES.ONLINE, {
                error: "",
                summary: this.statusSummary("waiting for vessel messages"),
                count: this.visibleCount
            });
        };

        const isNodeSocket = typeof socket.on === "function";
        if (isNodeSocket) socket.on("open", handleOpen);
        else socket.onopen = handleOpen;

        const handleMessage = data => {
            if (!this.active || socket !== this.socket) return;
            this.handleMessage(context, data && data.data !== undefined ? data.data : data);
        };
        if (isNodeSocket) socket.on("message", handleMessage);
        else socket.onmessage = handleMessage;

        const handleError = error => {
            if (!this.active || socket !== this.socket) return;
            this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                error: error && error.message ? error.message : "AISStream socket error",
                summary: "AIS provider unavailable"
            });
        };
        if (isNodeSocket) socket.on("error", handleError);
        else socket.onerror = handleError;

        const handleClose = (code, reason) => {
            if (!this.active || this.intentionalClose || socket !== this.socket) return;
            this.socket = null;
            const hasBuffer = this.vessels && this.vessels.size > 0;
            this.setStatus(hasBuffer ? MAP_LAYER_STATES.ONLINE : MAP_LAYER_STATES.OFFLINE, {
                error: hasBuffer ? "" : "AISStream socket closed",
                summary: hasBuffer
                    ? this.statusSummary(`socket closed${code ? ` · ${code}` : ""}`)
                    : `AIS provider disconnected${code ? ` · ${code}` : ""}${reason ? ` · ${String(reason).slice(0, 60)}` : ""}`,
                count: this.visibleCount
            });
        };
        if (isNodeSocket) socket.on("close", handleClose);
        else socket.onclose = event => handleClose(event && event.code, event && event.reason);
    }

    closeSocket() {
        const socket = this.socket;
        if (!socket) return;
        this.intentionalClose = true;
        try {
            if (typeof socket.removeAllListeners === "function") socket.removeAllListeners();
        } catch (error) {}
        try {
            if (socket.readyState <= 1) socket.close();
        } catch (error) {}
        this.intentionalClose = false;
        this.socket = null;
        this.resources.sockets = this.resources.sockets.filter(item => item !== socket);
    }

    getSubscriptionBoxes(context, mode = normalizeMode(this.definition.areaMode)) {
        if (mode === "WORLD_SAMPLE") return WORLD_SAMPLE_BOXES.slice();
        if (mode === "CURRENT_VIEW") {
            const bounds = this.getMapBounds(context);
            if (!bounds) return [AIS_PRESET_BOUNDS.GIBRALTAR];
            if (boundsArea(bounds) > 1400) return WORLD_SAMPLE_BOXES.slice(0, 3);
            return [bounds];
        }
        return [AIS_PRESET_BOUNDS[mode] || AIS_PRESET_BOUNDS.GIBRALTAR].filter(Boolean);
    }

    refreshIntervalMs() {
        const value = Number(this.definition.refreshIntervalMs);
        return Number.isFinite(value) ? Math.max(AIS_DEFAULT_REFRESH_MS, value) : AIS_DEFAULT_REFRESH_MS;
    }

    maxVisibleVessels() {
        const value = Number(this.definition.maxMarkers);
        return Number.isFinite(value) ? Math.max(50, Math.min(250, value)) : 150;
    }

    areaModeLabel(mode = this.activeMode || this.definition.areaMode) {
        return normalizeMode(mode).replace(/_/g, " ");
    }

    handleMessage(context, raw) {
        let payload = null;
        try {
            const text = aisRawMessageToText(raw);
            payload = JSON.parse(text);
        } catch (error) {
            return;
        }

        const identity = vesselIdentity(payload);
        const position = vesselPosition(payload);
        if (position.latitude === null || position.longitude === null) {
            if (identity.mmsi && this.vessels && this.vessels.has(identity.mmsi)) {
                this.vessels.set(identity.mmsi, {
                    ...this.vessels.get(identity.mmsi),
                    ...identity,
                    updatedAt: Date.now()
                });
                this.scheduleRender(context);
            }
            return;
        }

        if (!identity.mmsi || !this.vessels) return;
        const existing = this.vessels.get(identity.mmsi) || {};
        this.vessels.set(identity.mmsi, {
            ...existing,
            ...identity,
            ...position,
            updatedAt: Date.now()
        });

        this.enforceBufferCap();
        this.scheduleRender(context);
    }

    enforceBufferCap() {
        if (!this.vessels || this.vessels.size <= AIS_BUFFER_CAP) return;
        const overflow = this.vessels.size - AIS_BUFFER_CAP;
        Array.from(this.vessels.entries())
            .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
            .slice(0, overflow)
            .forEach(([mmsi]) => this.vessels.delete(mmsi));
    }

    scheduleRender(context) {
        if (!this.active) return;
        const elapsed = Date.now() - this.lastRenderAt;
        if (elapsed >= AIS_RENDER_THROTTLE_MS) {
            this.renderVessels(context);
            return;
        }
        if (this.renderTimer) return;
        this.renderTimer = this.rememberTimer(setTimeout(() => {
            this.renderTimer = null;
            if (this.active) this.renderVessels(context);
        }, AIS_RENDER_THROTTLE_MS - elapsed));
    }

    visibleVessels(context = this.context) {
        if (!this.vessels) return [];
        const mode = normalizeMode(this.activeMode);
        const mapBounds = mode === "CURRENT_VIEW" ? this.getMapBounds(context) : null;
        return Array.from(this.vessels.values())
            .filter(vessel => boundsContain(mapBounds, vessel))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, this.maxVisibleVessels());
    }

    renderVessels(context = this.context) {
        if (!this.layerGroup || !this.vessels || !this.markers) return;
        this.lastRenderAt = Date.now();
        const visible = this.visibleVessels(context);
        const visibleIds = new Set(visible.map(vessel => vessel.mmsi));

        Array.from(this.markers.entries()).forEach(([mmsi, marker]) => {
            if (!visibleIds.has(mmsi)) {
                try {
                    this.layerGroup.removeLayer(marker);
                } catch (error) {}
                this.markers.delete(mmsi);
            }
        });

        visible.forEach(vessel => this.upsertMarker(context, vessel));
        this.visibleCount = visible.length;
        this.bufferedCount = this.vessels.size;

        if (!this.visibleCount && this.bufferedCount && normalizeMode(this.activeMode) === "CURRENT_VIEW") {
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: this.statusSummary("NO VESSELS IN CURRENT VIEW"),
                count: 0
            });
            return;
        }

        if (!this.visibleCount && !this.bufferedCount) {
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: this.statusSummary("waiting for vessel messages"),
                count: 0
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            error: "",
            summary: this.statusSummary(),
            count: this.visibleCount
        });
    }

    upsertMarker(context, vessel) {
        const heading = Number.isFinite(Number(vessel.heading))
            ? Number(vessel.heading)
            : (Number.isFinite(Number(vessel.course)) ? Number(vessel.course) : 0);
        const html = `<span class="eng-ais-vessel-icon" style="transform: rotate(${Math.round(heading)}deg)"><b></b><i></i></span>`;
        const icon = context.L.divIcon({
            className: "eng-ais-vessel-marker",
            html,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const existing = this.markers.get(vessel.mmsi);
        if (existing) {
            existing.setLatLng([vessel.latitude, vessel.longitude]);
            existing.setIcon(icon);
            existing.setPopupContent(this.popupHtml(vessel));
            return;
        }

        const marker = context.L.marker([vessel.latitude, vessel.longitude], {
            icon,
            keyboard: false
        });
        marker.bindTooltip(this.escapeHtml(vessel.name || vessel.mmsi || "VESSEL"), {
            direction: "top",
            className: "eng-map-provider-tooltip"
        });
        marker.bindPopup(this.popupHtml(vessel), {className: "eng-map-provider-popup"});
        marker.addTo(this.layerGroup);
        this.markers.set(vessel.mmsi, marker);
    }

    popupHtml(vessel) {
        return `
            <strong>${this.escapeHtml(vessel.name || "Unknown vessel")}</strong>
            <span>MMSI ${this.escapeHtml(vessel.mmsi || "n/a")}</span>
            <span>SOG ${vessel.speed == null ? "n/a" : this.escapeHtml(`${vessel.speed} kn`)}</span>
            <span>COG ${vessel.course == null ? "n/a" : this.escapeHtml(`${vessel.course}°`)}</span>
            <span>HDG ${vessel.heading == null ? "n/a" : this.escapeHtml(`${vessel.heading}°`)}</span>
            <span>LAT ${this.escapeHtml(Number(vessel.latitude).toFixed(4))}</span>
            <span>LON ${this.escapeHtml(Number(vessel.longitude).toFixed(4))}</span>
            <span>${this.escapeHtml(vessel.timestamp || "")}</span>
            <span>SRC AISStream</span>
        `;
    }

    statusSummary(suffix = "") {
        const base = `AISStream · ${this.areaModeLabel()} · ${this.visibleCount} visible / ${this.bufferedCount} buffered`;
        return suffix ? `${base} · ${suffix}` : base;
    }

    updateStatusSummary() {
        if (!this.active || !this.vessels) return;
        const status = this.visibleCount || this.bufferedCount ? MAP_LAYER_STATES.ONLINE : MAP_LAYER_STATES.NO_DATA;
        this.setStatus(status, {
            error: "",
            summary: this.statusSummary(this.socket ? "" : "socket idle"),
            count: this.visibleCount
        });
    }

    pruneStaleVessels(context) {
        if (!this.active || !this.vessels) return;
        const cutoff = Date.now() - AIS_STALE_TTL_MS;
        Array.from(this.vessels.entries()).forEach(([mmsi, vessel]) => {
            if (vessel.updatedAt < cutoff) this.vessels.delete(mmsi);
        });
        this.enforceBufferCap();
        this.renderVessels(context);

        if (!this.bufferedCount && !this.autoFallbackApplied && normalizeMode(this.definition.areaMode) === "CURRENT_VIEW") {
            this.autoFallbackApplied = true;
            this.definition.areaMode = "GIBRALTAR";
            this.openSocket(context, {force: true, reason: "no current-view vessels"});
        }
    }
}

if (typeof module !== "undefined" && module.exports) module.exports = {AISProvider};
if (typeof window !== "undefined") window.AegisAISProvider = {AISProvider};
})();
