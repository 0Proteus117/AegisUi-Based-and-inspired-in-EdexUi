(function celestrakProviderModule() {
const {BaseMapProvider} = typeof window !== "undefined" ? window.AegisBaseMapProvider : require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = typeof window !== "undefined" ? window.AegisMapLayerState : require("../utils/mapLayerState.js");
const satellite = typeof window !== "undefined" ? window.satellite : require("satellite.js");

const CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php";
const CELESTRAK_GROUPS = Object.freeze({
    "stations": "STATIONS",
    "active": "ACTIVE",
    "starlink": "STARLINK",
    "weather": "WEATHER",
    "gps-ops": "GPS-OPS",
    "visual": "VISUAL",
    "last-30-days": "LAST-30-DAYS",
    "geo": "GEO",
    "science": "SCIENCE"
});

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeLongitude(value) {
    let longitude = finiteNumber(value);
    if (longitude === null) return null;
    while (longitude > 180) longitude -= 360;
    while (longitude < -180) longitude += 360;
    return longitude;
}

function formatCoordinate(value) {
    const number = finiteNumber(value);
    return number === null ? "n/a" : number.toFixed(3);
}

function formatAltitudeKm(value) {
    const number = finiteNumber(value);
    return number === null ? "n/a" : `${Math.round(number)} km`;
}

function getObjectName(item) {
    return item.OBJECT_NAME
        || item.OBJECT_ID
        || item.OBJECT_NAME_FULL
        || (item.NORAD_CAT_ID ? `NORAD ${item.NORAD_CAT_ID}` : "Unknown satellite");
}

function parseTleCatalog(text, satelliteLib) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const records = [];

    for (let index = 0; index < lines.length; index += 1) {
        if (!/^1\s+\d+/.test(lines[index])) continue;
        const name = index > 0 && !/^2\s+\d+/.test(lines[index - 1])
            ? lines[index - 1]
            : `NORAD ${lines[index].slice(2, 7).trim()}`;
        const line1 = lines[index];
        const line2 = lines[index + 1] || "";
        if (!/^2\s+\d+/.test(line2)) continue;
        try {
            const satrec = satelliteLib.twoline2satrec(line1, line2);
            records.push({
                name,
                norad: satrec.satnum || line1.slice(2, 7).trim(),
                epoch: line1.slice(18, 32).trim(),
                source: "CelesTrak GP/TLE",
                satrec
            });
        } catch (error) {}
        index += 1;
    }

    return records;
}

function isCelesTrakNotUpdated(error) {
    const body = String(error && error.responseText ? error.responseText : "").toLowerCase();
    return Number(error && error.status) === 403
        && body.includes("gp data has not updated")
        && body.includes("last successful");
}

class CelesTrakProvider extends BaseMapProvider {
    constructor(definition) {
        super(definition);
        this.catalog = [];
        this.satrecs = [];
        this.layerGroup = null;
        this.moveRefreshTimer = null;
    }

    getGroup(context = this.context) {
        const configured = context && context.getEnv
            ? context.getEnv("CELESTRAK_GROUP") || context.getEnv("AEGISUI_CELESTRAK_GROUP")
            : "";
        const group = String(this.definition.defaultGroup || configured || "stations")
            .trim()
            .replace(/[^a-z0-9_-]/ig, "")
            .toLowerCase() || "stations";
        return Object.prototype.hasOwnProperty.call(CELESTRAK_GROUPS, group) ? group : "stations";
    }

    getCelesTrakGroupName(context = this.context) {
        return CELESTRAK_GROUPS[this.getGroup(context)] || CELESTRAK_GROUPS.stations;
    }

    async start(context) {
        await super.start(context);
        this.layerGroup = context.L.layerGroup();
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);

        this.rememberMapListener(context.map, "moveend", () => {
            if (!this.active) return;
            clearTimeout(this.moveRefreshTimer);
            this.moveRefreshTimer = setTimeout(() => {
                this.renderSatellitePositions(context);
            }, 900);
        });

        await this.refresh(context);

        if (this.active && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "CelesTrak refresh failed"
                ));
            }, this.definition.updateIntervalMs));
        }

        if (this.active && this.definition.positionUpdateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.renderSatellitePositions(context);
            }, this.definition.positionUpdateIntervalMs));
        }
    }

    stop(context = this.context) {
        clearTimeout(this.moveRefreshTimer);
        this.moveRefreshTimer = null;
        this.catalog = [];
        this.satrecs = [];
        super.stop(context);
        this.layerGroup = null;
    }

    async refresh(context = this.context) {
        if (!this.active) return;

        if (isOffline(context)) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · satellite catalog disabled"
            });
            return;
        }

        const group = this.getGroup(context);
        const celestrakGroup = this.getCelesTrakGroupName(context);
        const url = `${CELESTRAK_GP_URL}?GROUP=${encodeURIComponent(celestrakGroup)}&FORMAT=tle`;
        const controller = this.createAbortController();

        this.setStatus(MAP_LAYER_STATES.LOADING, {
            summary: `Loading CelesTrak GP data · ${celestrakGroup}`
        });

        try {
            const records = await context.cache.getOrFetch(
                `celestrak:${group}:${celestrakGroup}`,
                this.definition.cacheTtlMs,
                async () => {
                    const text = await this.fetchText(url, {
                        signal: controller.signal,
                        headers: {Accept: "text/plain"}
                    });
                    return this.buildSatelliteRecords(parseTleCatalog(text, satellite));
                }
            );
            const count = Array.isArray(records) ? records.length : 0;

            if (!count) {
                if (this.layerGroup) this.layerGroup.clearLayers();
                this.catalog = [];
                this.satrecs = [];
                this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                    summary: `CelesTrak returned no objects for ${celestrakGroup}`,
                    count: 0
                });
                return;
            }

            this.catalog = records;
            this.satrecs = records;
            this.renderSatellitePositions(context);
        } catch (error) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            if (isCelesTrakNotUpdated(error)) {
                this.setStatus(MAP_LAYER_STATES.RATE_LIMITED, {
                    error: "CelesTrak data has not updated since the last successful download",
                    summary: `CelesTrak cache window active · ${celestrakGroup}`,
                    count: 0
                });
                return;
            }
            this.applyProviderError(error, context, "CelesTrak service unavailable");
        }
    }

    buildSatelliteRecords(data) {
        const maxOrbitObjects = this.definition.maxOrbitObjects || 800;
        const records = [];
        const items = Array.isArray(data) ? data.slice(0, maxOrbitObjects) : [];

        items.forEach(item => {
            try {
                if (item.satrec) {
                    records.push(item);
                    return;
                }
                if (typeof satellite.json2satrec !== "function") return;
                const satrec = satellite.json2satrec(item);
                records.push({
                    name: getObjectName(item),
                    norad: item.NORAD_CAT_ID || satrec.satnum || "",
                    epoch: item.EPOCH || "",
                    source: "CelesTrak GP",
                    satrec
                });
            } catch (error) {}
        });

        return records;
    }

    renderSatellitePositions(context = this.context) {
        if (!this.active || !context || !context.L || !context.map) return;

        if (!satellite || typeof satellite.propagate !== "function") {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.setStatus(MAP_LAYER_STATES.POSITION_ENGINE_ERROR, {
                error: "satellite.js propagation engine unavailable",
                summary: "SGP4 position engine unavailable",
                count: 0
            });
            return;
        }

        if (!this.layerGroup) {
            this.layerGroup = context.L.layerGroup();
            this.rememberLeafletLayer(this.layerGroup);
            this.layerGroup.addTo(context.map);
        }

        if (!this.satrecs.length) {
            this.layerGroup.clearLayers();
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: "No valid CelesTrak orbital records available for SGP4",
                count: 0
            });
            return;
        }

        const now = new Date();
        const bounds = this.getMapBounds(context);
        let engineFailures = 0;
        const isInBounds = item => {
            if (!bounds) return true;
            return item.latitude >= bounds.south
                && item.latitude <= bounds.north
                && item.longitude >= bounds.west
                && item.longitude <= bounds.east;
        };
        const propagatedPositions = this.satrecs
            .map(record => {
                try {
                    const positionAndVelocity = satellite.propagate(record.satrec, now);
                    if (!positionAndVelocity || !positionAndVelocity.position) {
                        engineFailures += 1;
                        return null;
                    }

                    const geodetic = satellite.eciToGeodetic(
                        positionAndVelocity.position,
                        satellite.gstime(now)
                    );
                    const latitude = finiteNumber(satellite.degreesLat(geodetic.latitude));
                    const longitude = normalizeLongitude(satellite.degreesLong(geodetic.longitude));
                    const altitudeKm = finiteNumber(geodetic.height);
                    if (latitude === null || longitude === null) return null;

                    return {
                        ...record,
                        latitude,
                        longitude,
                        altitudeKm,
                        timestamp: now.toISOString()
                    };
                } catch (error) {
                    engineFailures += 1;
                    return null;
                }
            })
            .filter(Boolean);
        const visibleCount = propagatedPositions.filter(isInBounds).length;
        const positions = propagatedPositions
            .sort((a, b) => Number(isInBounds(b)) - Number(isInBounds(a)))
            .slice(0, this.definition.maxMarkers || 80);

        this.layerGroup.clearLayers();

        positions.forEach(item => {
            const icon = context.L.divIcon({
                className: "eng-satellite-div-icon",
                html: "<span></span>",
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            const marker = context.L.marker([item.latitude, item.longitude], {icon});
            marker.bindTooltip(this.escapeHtml(item.name), {
                direction: "top",
                className: "eng-map-provider-tooltip"
            });
            marker.bindPopup(`
                <strong>${this.escapeHtml(item.name)}</strong>
                <span>NORAD ${this.escapeHtml(item.norad || "n/a")}</span>
                <span>LAT ${this.escapeHtml(formatCoordinate(item.latitude))} · LON ${this.escapeHtml(formatCoordinate(item.longitude))}</span>
                <span>ALT ${this.escapeHtml(formatAltitudeKm(item.altitudeKm))}</span>
                <span>EPOCH ${this.escapeHtml(item.epoch || "n/a")}</span>
                <span>${this.escapeHtml(item.timestamp)}</span>
                <span>SRC ${this.escapeHtml(item.source)}</span>
            `, {className: "eng-map-provider-popup"});
            marker.addTo(this.layerGroup);
        });

        if (!propagatedPositions.length) {
            this.setStatus(engineFailures >= this.satrecs.length
                ? MAP_LAYER_STATES.POSITION_ENGINE_ERROR
                : MAP_LAYER_STATES.NO_DATA, {
                error: engineFailures >= this.satrecs.length ? "SGP4 failed for all loaded satellites" : "",
                summary: engineFailures >= this.satrecs.length
                    ? "SGP4 could not calculate satellite positions"
                    : "No valid CelesTrak satellite positions calculated",
                count: 0,
                updatedAt: now.toISOString()
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: `${propagatedPositions.length} real satellite positions · ${visibleCount} in current view`,
            count: positions.length,
            updatedAt: now.toISOString()
        });
    }
}

if (typeof module !== "undefined" && module.exports) module.exports = {CelesTrakProvider};
if (typeof window !== "undefined") window.AegisCelesTrakProvider = {CelesTrakProvider};
})();
