const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

const OPEN_SKY_URL = "https://opensky-network.org/api/states/all";
const OPEN_SKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatAltitude(meters) {
    const value = finiteNumber(meters);
    return value === null ? "n/a" : `${Math.round(value)} m`;
}

function formatVelocity(ms) {
    const value = finiteNumber(ms);
    return value === null ? "n/a" : `${Math.round(value * 3.6)} km/h`;
}

class OpenSkyProvider extends BaseMapProvider {
    async start(context) {
        await super.start(context);
        this.layerGroup = context.L.layerGroup();
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);

        this.moveRefreshTimer = null;
        this.rememberMapListener(context.map, "moveend", () => {
            if (!this.active) return;
            clearTimeout(this.moveRefreshTimer);
            this.moveRefreshTimer = setTimeout(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "OpenSky refresh failed"
                ));
            }, 1800);
        });

        await this.refresh(context);

        if (this.active && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "OpenSky refresh failed"
                ));
            }, this.definition.updateIntervalMs));
        }
    }

    stop(context = this.context) {
        clearTimeout(this.moveRefreshTimer);
        this.moveRefreshTimer = null;
        super.stop(context);
        this.layerGroup = null;
    }

    async refresh(context = this.context) {
        if (!this.active) return;

        if (isOffline(context)) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · air traffic disabled"
            });
            return;
        }

        const bounds = this.getMapBounds(context);
        if (!bounds) {
            this.setStatus(MAP_LAYER_STATES.ERROR, {
                error: "Map bounds unavailable",
                summary: "Cannot request OpenSky without map bounds"
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.LOADING, {
            summary: "Loading OpenSky aircraft state vectors"
        });

        const roundedBounds = [
            bounds.south,
            bounds.west,
            bounds.north,
            bounds.east
        ].map(value => Number(value).toFixed(2));
        const cacheKey = `opensky:${roundedBounds.join(":")}`;
        const url = `${OPEN_SKY_URL}?lamin=${roundedBounds[0]}&lomin=${roundedBounds[1]}&lamax=${roundedBounds[2]}&lomax=${roundedBounds[3]}`;
        const controller = this.createAbortController();
        const headers = await this.getRequestHeaders(context);

        try {
            const data = await context.cache.getOrFetch(cacheKey, this.definition.cacheTtlMs, () => {
                return this.fetchJson(url, {headers, signal: controller.signal});
            });
            this.renderAircraft(context, data);
        } catch (error) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.applyProviderError(error, context, "OpenSky service unavailable");
        }
    }

    renderAircraft(context, data) {
        const states = Array.isArray(data && data.states) ? data.states : [];
        const aircraft = states
            .map(state => ({
                icao24: state[0],
                callsign: String(state[1] || "").trim(),
                originCountry: state[2],
                lastContact: state[4],
                longitude: finiteNumber(state[5]),
                latitude: finiteNumber(state[6]),
                altitude: finiteNumber(state[7] == null ? state[13] : state[7]),
                velocity: finiteNumber(state[9]),
                heading: finiteNumber(state[10])
            }))
            .filter(item => item.latitude !== null && item.longitude !== null)
            .sort((a, b) => Number(b.lastContact || 0) - Number(a.lastContact || 0))
            .slice(0, this.definition.maxMarkers);

        if (!this.layerGroup) {
            this.layerGroup = context.L.layerGroup();
            this.rememberLeafletLayer(this.layerGroup);
            this.layerGroup.addTo(context.map);
        }
        this.layerGroup.clearLayers();

        aircraft.forEach(item => {
            const heading = finiteNumber(item.heading) || 0;
            const icon = context.L.divIcon({
                className: "eng-aircraft-div-icon",
                html: `<span style="transform: rotate(${heading}deg)"></span>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            const marker = context.L.marker([item.latitude, item.longitude], {icon});
            marker.bindTooltip(this.escapeHtml(item.callsign || item.icao24 || "AIRCRAFT"), {
                direction: "top",
                className: "eng-map-provider-tooltip"
            });
            marker.bindPopup(`
                <strong>${this.escapeHtml(item.callsign || "Unknown callsign")}</strong>
                <span>ICAO24 ${this.escapeHtml(item.icao24 || "n/a")}</span>
                <span>${this.escapeHtml(item.originCountry || "Unknown origin")}</span>
                <span>ALT ${this.escapeHtml(formatAltitude(item.altitude))}</span>
                <span>VEL ${this.escapeHtml(formatVelocity(item.velocity))}</span>
                <span>HDG ${Math.round(heading)}°</span>
            `, {className: "eng-map-provider-popup"});
            marker.addTo(this.layerGroup);
        });

        if (!aircraft.length) {
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: "OpenSky returned no aircraft in current map view",
                count: 0
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: `OpenSky aircraft in view · limited to ${this.definition.maxMarkers}`,
            count: aircraft.length
        });
    }

    async getRequestHeaders(context) {
        const headers = {Accept: "application/json"};
        const staticToken = context.getEnv("OPENSKY_ACCESS_TOKEN")
            || context.getEnv("AEGISUI_OPENSKY_ACCESS_TOKEN");
        if (staticToken) {
            headers.Authorization = `Bearer ${staticToken}`;
            return headers;
        }

        const clientId = context.getEnv("OPENSKY_CLIENT_ID") || context.getEnv("AEGISUI_OPENSKY_CLIENT_ID");
        const clientSecret = context.getEnv("OPENSKY_CLIENT_SECRET") || context.getEnv("AEGISUI_OPENSKY_CLIENT_SECRET");
        if (!clientId || !clientSecret) return headers;

        const token = await context.cache.getOrFetch("opensky:oauth-token", 25 * 60 * 1000, async () => {
            const body = new URLSearchParams();
            body.set("grant_type", "client_credentials");
            body.set("client_id", clientId);
            body.set("client_secret", clientSecret);

            const data = await this.fetchJson(OPEN_SKY_TOKEN_URL, {
                method: "POST",
                headers: {"Content-Type": "application/x-www-form-urlencoded"},
                body
            });
            if (!data || !data.access_token) throw new Error("OpenSky auth token missing");
            return data.access_token;
        });

        headers.Authorization = `Bearer ${token}`;
        return headers;
    }
}

module.exports = {OpenSkyProvider};
