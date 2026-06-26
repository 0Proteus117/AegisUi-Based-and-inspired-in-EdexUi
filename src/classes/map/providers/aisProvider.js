const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

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
        course: finiteNumber(report.Cog == null ? report.CourseOverGround : report.Cog),
        speed: finiteNumber(report.Sog == null ? report.SpeedOverGround : report.Sog),
        heading: finiteNumber(report.TrueHeading == null ? report.Heading : report.TrueHeading),
        timestamp: meta.time_utc || meta.Time_UTC || meta.timestamp || new Date().toISOString()
    };
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
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);
        this.openSocket(context);
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
        const bounds = this.getMapBounds(context);
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

        const socket = new WebSocket(AISSTREAM_URL);
        this.socket = this.rememberSocket(socket);

        socket.onopen = () => {
            if (!this.active) return;
            socket.send(JSON.stringify({
                APIKey: this.getApiKey(context),
                BoundingBoxes: [[
                    [bounds.south, bounds.west],
                    [bounds.north, bounds.east]
                ]],
                FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"]
            }));
            this.setStatus(MAP_LAYER_STATES.ONLINE, {
                summary: "AISStream connected · waiting for vessel messages",
                count: this.vessels ? this.vessels.size : 0
            });
        };

        socket.onmessage = event => {
            if (!this.active) return;
            this.handleMessage(context, event.data);
        };

        socket.onerror = () => {
            if (!this.active) return;
            this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                error: "AISStream socket error",
                summary: "AIS provider unavailable"
            });
        };

        socket.onclose = () => {
            if (!this.active || this.intentionalClose) return;
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                error: "AISStream socket closed",
                summary: "AIS provider disconnected"
            });
        };
    }

    handleMessage(context, raw) {
        let payload = null;
        try {
            payload = JSON.parse(raw);
        } catch (error) {
            return;
        }

        const position = vesselPosition(payload);
        if (position.latitude === null || position.longitude === null) return;

        const identity = vesselIdentity(payload);
        const key = identity.mmsi || `${position.latitude}:${position.longitude}`;
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
            const marker = context.L.circleMarker([vessel.latitude, vessel.longitude], {
                radius: 4.5,
                color: "#7CCBFF",
                fillColor: "#3BA7FF",
                fillOpacity: 0.62,
                opacity: 0.92,
                weight: 1
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
            `, {className: "eng-map-provider-popup"});
            marker.addTo(this.layerGroup);
        });
        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: "AISStream live vessel messages",
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
