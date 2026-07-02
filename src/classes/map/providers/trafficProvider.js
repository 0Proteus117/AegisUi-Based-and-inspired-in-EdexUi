const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

const TRAFFIC_TILE_TESTS = Object.freeze([
    {
        mode: "TOMTOM_FLOW_TILES",
        style: "relative0-dark",
        url: key => `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/12/2044/1360.png?key=${encodeURIComponent(key)}&tileSize=256`,
        template: key => `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}&tileSize=256`
    },
    {
        mode: "TOMTOM_FLOW_TILES",
        style: "relative0",
        url: key => `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/12/2044/1360.png?key=${encodeURIComponent(key)}&tileSize=256`,
        template: key => `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}&tileSize=256`
    }
]);

const TRAFFIC_PRESETS = Object.freeze({
    MADRID: [
        {label: "Madrid Centro", lat: 40.4168, lon: -3.7038},
        {label: "M-30 Norte", lat: 40.4620, lon: -3.6890},
        {label: "A-2", lat: 40.4495, lon: -3.6118},
        {label: "A-6", lat: 40.4589, lon: -3.7795},
        {label: "A-4", lat: 40.3528, lon: -3.6927}
    ],
    LONDON: [
        {label: "London City", lat: 51.5074, lon: -0.1278},
        {label: "A40", lat: 51.5165, lon: -0.2550},
        {label: "M25 West", lat: 51.4850, lon: -0.4400},
        {label: "A13", lat: 51.5161, lon: 0.0248}
    ],
    PARIS: [
        {label: "Paris Centre", lat: 48.8566, lon: 2.3522},
        {label: "Périphérique Nord", lat: 48.8990, lon: 2.3408},
        {label: "A6", lat: 48.7618, lon: 2.3708},
        {label: "A4", lat: 48.8299, lon: 2.4932}
    ]
});

function clampTrafficRatio(currentSpeed, freeFlowSpeed) {
    const current = Number(currentSpeed);
    const free = Number(freeFlowSpeed);
    if (!Number.isFinite(current) || !Number.isFinite(free) || free <= 0) return 1;
    return Math.max(0, Math.min(1.2, current / free));
}

function trafficColorForRatio(ratio) {
    if (ratio <= 0.35) return "#ff3355";
    if (ratio <= 0.65) return "#ff9d2e";
    return "#3BA7FF";
}

function normalizeSegmentCoordinates(segment = {}) {
    const coordinates = segment.coordinates && Array.isArray(segment.coordinates.coordinate)
        ? segment.coordinates.coordinate
        : [];
    return coordinates
        .map(point => {
            const lat = Number(point.latitude);
            const lon = Number(point.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return [lat, lon];
        })
        .filter(Boolean);
}

class TrafficProvider extends BaseMapProvider {
    isConfigured(context = this.context) {
        return Boolean(context && context.getTrafficKey && context.getTrafficKey());
    }

    async start(context) {
        await super.start(context);
        this.removeLeafletLayers(context);

        if (isOffline(context)) {
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · road traffic disabled"
            });
            return;
        }

        const trafficKey = context.getTrafficKey ? context.getTrafficKey() : "";
        if (!trafficKey) {
            if (context.userInitiated && typeof context.onTrafficKeyRequired === "function") {
                context.onTrafficKeyRequired();
            }
            this.setStatus(MAP_LAYER_STATES.API_KEY_MISSING, {
                error: "TomTom traffic key missing",
                summary: "Add a TomTom key to enable live road traffic"
            });
            return;
        }

        const diagnostic = await this.runTomTomTrafficDiagnostics(context, trafficKey);
        this.lastDiagnostic = diagnostic;

        if (diagnostic.status === MAP_LAYER_STATES.API_KEY_INVALID) {
            this.setStatus(MAP_LAYER_STATES.API_KEY_INVALID, {
                error: diagnostic.summary,
                summary: "TomTom traffic key rejected by provider"
            });
            return;
        }
        if (diagnostic.status === MAP_LAYER_STATES.RATE_LIMITED) {
            this.setStatus(MAP_LAYER_STATES.RATE_LIMITED, {
                error: diagnostic.summary,
                summary: "TomTom traffic rate limited"
            });
            return;
        }

        if (diagnostic.mode === "TOMTOM_FLOW_TILES" && diagnostic.tileTemplate) {
            this.startTileMode(context, diagnostic.tileTemplate, diagnostic);
            return;
        }

        if (diagnostic.mode === "TOMTOM_FLOW_SEGMENTS") {
            await this.startSegmentMode(context, trafficKey, diagnostic);
            return;
        }

        this.setStatus(diagnostic.status || MAP_LAYER_STATES.OFFLINE, {
            error: diagnostic.summary || "TomTom traffic unavailable",
            summary: diagnostic.summary || "TomTom traffic unavailable"
        });
    }

    startTileMode(context, tileTemplate, diagnostic = {}) {
        const layer = context.L.tileLayer(
            tileTemplate,
            {
                opacity: context.layer.opacity || 0.9,
                maxZoom: 22,
                zIndex: this.definition.zIndex,
                className: "eng-traffic-map"
            }
        );

        layer.on("tileerror", () => {
            if (!this.active) return;
            this.setStatus(MAP_LAYER_STATES.ERROR, {
                error: "Traffic tile service unavailable",
                summary: "TomTom traffic tiles failed after diagnostic"
            });
        });

        this.rememberLeafletLayer(layer);
        layer.addTo(context.map);
        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: `TomTom traffic tiles · ${diagnostic.tileStyle || "relative0"}`,
            count: 0
        });
    }

    async startSegmentMode(context, trafficKey, diagnostic = {}) {
        this.layerGroup = context.L.layerGroup();
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);

        await this.refreshSegments(context, trafficKey);
        if (this.active && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refreshSegments(context, trafficKey).catch(error => this.applyProviderError(
                    error,
                    context,
                    "TomTom flow segment refresh failed"
                ));
            }, this.definition.updateIntervalMs));
        }

        if (this.status !== MAP_LAYER_STATES.ONLINE && diagnostic.segmentOk) {
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: "TomTom Flow Segment online · no road geometry returned for sampled points",
                count: 0
            });
        }
    }

    async refreshSegments(context = this.context, trafficKey = context.getTrafficKey()) {
        if (!this.active || !trafficKey) return;
        if (!this.layerGroup) {
            this.layerGroup = context.L.layerGroup();
            this.rememberLeafletLayer(this.layerGroup);
            this.layerGroup.addTo(context.map);
        }

        const points = this.resolveSegmentSamplePoints(context).slice(0, 30);
        const seen = new Set();
        const segments = [];

        for (const point of points) {
            try {
                const segment = await this.fetchFlowSegment(context, trafficKey, point);
                const coords = normalizeSegmentCoordinates(segment);
                if (coords.length < 2) continue;
                const fingerprint = `${coords[0].join(",")}|${coords[coords.length - 1].join(",")}`;
                if (seen.has(fingerprint)) continue;
                seen.add(fingerprint);
                segments.push({point, segment, coords});
            } catch (error) {
                const status = this.statusFromHttpError(error);
                if (status === MAP_LAYER_STATES.API_KEY_INVALID || status === MAP_LAYER_STATES.RATE_LIMITED) {
                    this.setStatus(status, {
                        error: error.message,
                        summary: status === MAP_LAYER_STATES.API_KEY_INVALID
                            ? "TomTom traffic key rejected by Flow Segment"
                            : "TomTom Flow Segment rate limited"
                    });
                    return;
                }
            }
        }

        this.renderSegments(context, segments);
    }

    renderSegments(context, segments = []) {
        if (!this.layerGroup) return;
        this.layerGroup.clearLayers();

        segments.forEach(({segment, coords, point}) => {
            const ratio = clampTrafficRatio(segment.currentSpeed, segment.freeFlowSpeed);
            const color = trafficColorForRatio(ratio);
            const line = context.L.polyline(coords, {
                color,
                opacity: 0.88,
                weight: ratio <= 0.5 ? 5 : 3,
                className: "eng-traffic-segment"
            });
            line.bindTooltip(this.escapeHtml(`${point.label || "TomTom"} · ${Math.round(ratio * 100)}% free flow`), {
                direction: "top",
                className: "eng-map-provider-tooltip"
            });
            line.bindPopup(`
                <strong>TomTom Flow Segment</strong>
                <span>Current ${this.escapeHtml(String(segment.currentSpeed ?? "n/a"))}</span>
                <span>Free flow ${this.escapeHtml(String(segment.freeFlowSpeed ?? "n/a"))}</span>
                <span>Confidence ${this.escapeHtml(String(segment.confidence ?? "n/a"))}</span>
                <span>Road closure ${this.escapeHtml(String(segment.roadClosure ?? false))}</span>
                <span>SRC TomTom Flow Segment</span>
            `, {className: "eng-map-provider-popup"});
            line.addTo(this.layerGroup);
        });

        this.setStatus(segments.length ? MAP_LAYER_STATES.ONLINE : MAP_LAYER_STATES.NO_DATA, {
            summary: segments.length
                ? `TomTom traffic segments · ${segments.length} real road segments`
                : "TomTom Flow Segment online · no road segments in sampled area",
            count: segments.length
        });
    }

    resolveSegmentSamplePoints(context = this.context) {
        const preset = String(this.definition.preset || "MADRID").toUpperCase();
        if (preset !== "CURRENT_VIEW" && TRAFFIC_PRESETS[preset]) return TRAFFIC_PRESETS[preset];

        const bounds = this.getMapBounds(context);
        if (!bounds) return TRAFFIC_PRESETS.MADRID;
        const center = context.map && typeof context.map.getCenter === "function"
            ? context.map.getCenter()
            : {lat: 40.4168, lng: -3.7038};

        const overLikelyRoadArea = center.lat > 35 && center.lat < 60 && center.lng > -12 && center.lng < 20;
        if (!overLikelyRoadArea) return TRAFFIC_PRESETS.MADRID;

        const latSpan = Math.max(0.02, Math.min(0.18, (bounds.north - bounds.south) / 4));
        const lonSpan = Math.max(0.02, Math.min(0.18, (bounds.east - bounds.west) / 4));
        return [
            {label: "Current center", lat: center.lat, lon: center.lng},
            {label: "Current north", lat: center.lat + latSpan, lon: center.lng},
            {label: "Current south", lat: center.lat - latSpan, lon: center.lng},
            {label: "Current east", lat: center.lat, lon: center.lng + lonSpan},
            {label: "Current west", lat: center.lat, lon: center.lng - lonSpan},
            ...TRAFFIC_PRESETS.MADRID.slice(0, 2)
        ];
    }

    async fetchFlowSegment(context, trafficKey, point) {
        const zoom = Math.max(10, Math.min(20, Math.round(context.map && context.map.getZoom ? context.map.getZoom() : 12)));
        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/${zoom}/json?key=${encodeURIComponent(trafficKey)}&point=${encodeURIComponent(`${point.lat},${point.lon}`)}`;
        const data = await this.fetchJson(url, {headers: {Accept: "application/json"}});
        return data && data.flowSegmentData ? data.flowSegmentData : data;
    }

    async runTomTomTrafficDiagnostics(context, trafficKey) {
        const forcedProvider = String(this.definition.provider || "auto").toLowerCase();
        const tileTests = forcedProvider === "tomtom-segments" || forcedProvider === "segments"
            ? []
            : TRAFFIC_TILE_TESTS;

        let lastTileFailure = null;
        for (const test of tileTests) {
            const tile = await this.testTileUrl(test.url(trafficKey));
            if (tile.ok) {
                return {
                    mode: "TOMTOM_FLOW_TILES",
                    status: MAP_LAYER_STATES.ONLINE,
                    tileStyle: test.style,
                    tileTemplate: test.template(trafficKey),
                    tile
                };
            }
            lastTileFailure = tile;
            if (tile.status === 429) {
                return {
                    mode: "OFFLINE",
                    status: MAP_LAYER_STATES.RATE_LIMITED,
                    summary: "TomTom traffic tile rate limited",
                    tile
                };
            }
        }

        const segmentPoint = TRAFFIC_PRESETS.MADRID[0];
        try {
            const segment = await this.fetchFlowSegment(context, trafficKey, segmentPoint);
            return {
                mode: "TOMTOM_FLOW_SEGMENTS",
                status: MAP_LAYER_STATES.ONLINE,
                segmentOk: true,
                segmentHasGeometry: normalizeSegmentCoordinates(segment).length > 1,
                summary: "TomTom Flow Segment endpoint reachable"
            };
        } catch (error) {
            const status = this.statusFromHttpError(error);
            return {
                mode: "OFFLINE",
                status: status === MAP_LAYER_STATES.ERROR && lastTileFailure && [401, 403].includes(Number(lastTileFailure.status))
                    ? MAP_LAYER_STATES.API_KEY_INVALID
                    : status,
                summary: error.message
                    || (lastTileFailure && lastTileFailure.status
                        ? `TomTom traffic tile returned HTTP ${lastTileFailure.status}`
                        : "TomTom Flow Segment unavailable"),
                segmentOk: false
            };
        }
    }

    statusFromHttpError(error) {
        const status = Number(error && (error.status || error.statusCode));
        if (status === 401 || status === 403) return MAP_LAYER_STATES.API_KEY_INVALID;
        if (status === 429) return MAP_LAYER_STATES.RATE_LIMITED;
        if (status >= 500) return MAP_LAYER_STATES.SERVICE_UNAVAILABLE;
        return MAP_LAYER_STATES.ERROR;
    }

    testTileUrl(url) {
        if (typeof require === "function") return this.testTileUrlWithNode(url);
        return fetch(url)
            .then(async response => ({
                ok: response.ok
                    && String(response.headers.get("content-type") || "").includes("image/")
                    && (await response.arrayBuffer()).byteLength > 0,
                status: response.status,
                contentType: response.headers.get("content-type") || ""
            }))
            .catch(error => ({ok: false, error: error.message}));
    }

    testTileUrlWithNode(remoteUrl) {
        return new Promise(resolve => {
            const https = require("https");
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                resolve(result);
            };
            const request = https.get(remoteUrl, response => {
                let bytes = 0;
                response.on("data", chunk => {
                    bytes += chunk.length;
                });
                response.on("end", () => finish({
                    ok: response.statusCode >= 200
                        && response.statusCode < 300
                        && String(response.headers["content-type"] || "").includes("image/")
                        && bytes > 0,
                    status: response.statusCode,
                    contentType: response.headers["content-type"] || "",
                    bytes
                }));
            });
            request.setTimeout(8000, () => {
                request.destroy();
                finish({ok: false, error: "timeout"});
            });
            request.on("error", error => {
                finish({ok: false, error: error.message});
            });
        });
    }
}

module.exports = {TrafficProvider};
