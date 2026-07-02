const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const AIS_PRESET_BOUNDS = Object.freeze({
    world: {south: -90, west: -180, north: 90, east: 180},
    WORLD_SAMPLE: {south: -90, west: -180, north: 90, east: 180},
    CURRENT_VIEW: null,
    ATLANTIC: {south: -45, west: -80, north: 70, east: 20},
    MEDITERRANEAN: {south: 30, west: -6, north: 46, east: 37},
    NORTH_SEA: {south: 51, west: -5, north: 62, east: 10},
    ENGLISH_CHANNEL: {south: 48, west: -6, north: 52, east: 3},
    GIBRALTAR: {south: 34.8, west: -6.8, north: 37.2, east: -3.5},
    CARIBBEAN: {south: 8, west: -90, north: 28, east: -58},
    US_EAST_COAST: {south: 24, west: -82, north: 46, east: -64},
    US_WEST_COAST: {south: 31, west: -128, north: 49, east: -116},
    SINGAPORE_STRAIT: {south: 0.8, west: 103.2, north: 1.7, east: 104.5},
    SOUTH_CHINA_SEA: {south: -1, west: 104, north: 23, east: 122},
    JAPAN: {south: 30, west: 128, north: 46, east: 146},
    AUSTRALIA_EAST: {south: -44, west: 145, north: -10, east: 156},
    mediterranean: {south: 30, west: -6, north: 46, east: 37},
    atlantic: {south: -45, west: -80, north: 70, east: 20},
    iberian: {south: 35, west: -12, north: 45, east: 6}
});

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function loadNodeWebSocket() {
    if (typeof require !== "function") return null;
    try {
        return require("ws");
    } catch (error) {
        return null;
    }
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

class AISProvider extends BaseMapProvider {
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
        this.layerGroup = context.L.layerGroup();
        this.autoFallbackApplied = false;
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);
        this.openSocket(context);
        this.rememberTimer(setTimeout(() => {
            if (!this.active || !this.vessels || this.vessels.size > 0) return;
            const mode = String(this.definition.areaMode || "").toUpperCase();
            if (!this.autoFallbackApplied && ["VISIBLE", "CURRENT_VIEW"].includes(mode)) {
                this.autoFallbackApplied = true;
                this.definition.areaMode = "WORLD_SAMPLE";
                try {
                    if (this.socket && this.socket.readyState <= 1) this.socket.close();
                } catch (error) {}
                this.openSocket(context);
                return;
            }
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: "AISStream online · no vessels received yet",
                count: 0
            });
        }, 20000));
        this.rememberTimer(setInterval(() => this.pruneStaleVessels(context), 60 * 1000));
    }

    stop(context = this.context) {
        this.intentionalClose = true;
        super.stop(context);
        this.intentionalClose = false;
        this.vessels = null;
        this.layerGroup = null;
    }

    openSocket(context) {
        const bounds = this.getSubscriptionBounds(context);
        if (!bounds) {
            this.setStatus(MAP_LAYER_STATES.ERROR, {
                error: "Map bounds unavailable",
                summary: "Cannot subscribe to AIS without map bounds"
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.CONNECTING, {
            summary: "Connecting to AISStream"
        });

        const WebSocketClient = loadNodeWebSocket()
            || (typeof WebSocket !== "undefined" ? WebSocket : null);
        if (!WebSocketClient) {
            this.setStatus(MAP_LAYER_STATES.ERROR, {
                error: "No WebSocket implementation available",
                summary: "AISStream requires Node ws or browser WebSocket"
            });
            return;
        }
        const socket = new WebSocketClient(AISSTREAM_URL);
        this.socket = this.rememberSocket(socket);
        this.lastClose = null;

        const handleOpen = () => {
            if (!this.active) return;
            socket.send(JSON.stringify({
                APIKey: this.getApiKey(context),
                BoundingBoxes: [[
                    [bounds.south, bounds.west],
                    [bounds.north, bounds.east]
                ]],
                FilterMessageTypes: [
                    "PositionReport",
                    "StandardClassBPositionReport",
                    "ExtendedClassBPositionReport",
                    "ShipStaticData"
                ]
            }));
            this.setStatus(MAP_LAYER_STATES.ONLINE, {
                summary: `AISStream global live · ${this.areaModeLabel()} · waiting for vessel messages`,
                count: this.vessels ? this.vessels.size : 0
            });
        };
        const isNodeSocket = typeof socket.on === "function";
        if (isNodeSocket) socket.on("open", handleOpen);
        else socket.onopen = handleOpen;

        const handleMessage = data => {
            if (!this.active) return;
            this.handleMessage(context, data && data.data !== undefined ? data.data : data);
        };
        if (isNodeSocket) socket.on("message", handleMessage);
        else socket.onmessage = handleMessage;

        const handleError = error => {
            if (!this.active) return;
            this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                error: error && error.message ? error.message : "AISStream socket error",
                summary: "AIS provider unavailable"
            });
        };
        if (isNodeSocket) socket.on("error", handleError);
        else socket.onerror = handleError;

        const handleClose = (code, reason) => {
            if (!this.active || this.intentionalClose) return;
            this.lastClose = {
                code,
                reason: reason ? String(reason).slice(0, 120) : ""
            };
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                error: "AISStream socket closed",
                summary: `AIS provider disconnected${code ? ` · ${code}` : ""}`
            });
        };
        if (isNodeSocket) socket.on("close", handleClose);
        else socket.onclose = event => handleClose(event && event.code, event && event.reason);
    }

    getSubscriptionBounds(context) {
        const mode = String(this.definition.areaMode || "WORLD_SAMPLE").toUpperCase();
        if (mode === "CURRENT_VIEW" || mode === "VISIBLE") return this.getMapBounds(context) || AIS_PRESET_BOUNDS.WORLD_SAMPLE;
        if (AIS_PRESET_BOUNDS[mode]) return AIS_PRESET_BOUNDS[mode];
        if (AIS_PRESET_BOUNDS[this.definition.areaMode]) return AIS_PRESET_BOUNDS[this.definition.areaMode];
        return this.getMapBounds(context);
    }

    areaModeLabel() {
        return String(this.definition.areaMode || "WORLD_SAMPLE").toUpperCase().replace(/_/g, " ");
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
                this.renderVessels(context);
            }
            return;
        }

        if (!identity.mmsi) return;
        const key = identity.mmsi;
        const existing = this.vessels.get(key) || {};
        const vessel = {
            ...existing,
            ...identity,
            ...position,
            updatedAt: Date.now()
        };
        this.vessels.set(key, vessel);

        if (this.vessels.size > this.definition.maxMarkers) {
            const oldest = Array.from(this.vessels.entries())
                .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
                .slice(0, this.vessels.size - this.definition.maxMarkers);
            oldest.forEach(([mmsi]) => this.vessels.delete(mmsi));
        }

        this.renderVessels(context);
    }

    renderVessels(context) {
        if (!this.layerGroup) return;
        this.layerGroup.clearLayers();
        this.vessels.forEach(vessel => {
            const heading = Number.isFinite(Number(vessel.heading))
                ? Number(vessel.heading)
                : (Number.isFinite(Number(vessel.course)) ? Number(vessel.course) : 0);
            const marker = context.L.marker([vessel.latitude, vessel.longitude], {
                icon: context.L.divIcon({
                    className: "eng-ais-vessel-marker",
                    html: `<span style="transform: rotate(${Math.round(heading)}deg)"></span>`,
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                }),
                keyboard: false
            });
            marker.bindTooltip(this.escapeHtml(vessel.name || vessel.mmsi || "VESSEL"), {
                direction: "top",
                className: "eng-map-provider-tooltip"
            });
            marker.bindPopup(`
                <strong>${this.escapeHtml(vessel.name || "Unknown vessel")}</strong>
                <span>MMSI ${this.escapeHtml(vessel.mmsi || "n/a")}</span>
                <span>SOG ${vessel.speed == null ? "n/a" : this.escapeHtml(`${vessel.speed} kn`)}</span>
                <span>COG ${vessel.course == null ? "n/a" : this.escapeHtml(`${vessel.course}°`)}</span>
                <span>HDG ${vessel.heading == null ? "n/a" : this.escapeHtml(`${vessel.heading}°`)}</span>
                <span>${this.escapeHtml(vessel.timestamp || "")}</span>
                <span>SRC AISStream</span>
            `, {className: "eng-map-provider-popup"});
            marker.addTo(this.layerGroup);
        });
        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: `AISStream global live · ${this.vessels.size} real vessels`,
            count: this.vessels.size
        });
    }

    pruneStaleVessels(context) {
        if (!this.active || !this.vessels) return;
        const cutoff = Date.now() - 15 * 60 * 1000;
        Array.from(this.vessels.entries()).forEach(([mmsi, vessel]) => {
            if (vessel.updatedAt < cutoff) this.vessels.delete(mmsi);
        });
        this.renderVessels(context);
    }
}

module.exports = {AISProvider};
