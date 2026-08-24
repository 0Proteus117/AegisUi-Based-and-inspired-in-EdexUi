(function noaaOceanProviderModule() {
const {BaseMapProvider} = typeof window !== "undefined" ? window.AegisBaseMapProvider : require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = typeof window !== "undefined" ? window.AegisMapLayerState : require("../utils/mapLayerState.js");

const NDBC_ACTIVE_STATIONS_URL = "https://www.ndbc.noaa.gov/activestations.xml";
const NDBC_REALTIME_URL = "https://www.ndbc.noaa.gov/data/realtime2";

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function parseStationXml(xmlText) {
    const parser = new DOMParser();
    const document = parser.parseFromString(xmlText, "application/xml");
    const parseError = document.querySelector("parsererror");
    if (parseError) throw new Error("NOAA station XML could not be parsed");

    return Array.from(document.querySelectorAll("station"))
        .map(node => ({
            id: node.getAttribute("id") || "",
            name: node.getAttribute("name") || "",
            latitude: finiteNumber(node.getAttribute("lat")),
            longitude: finiteNumber(node.getAttribute("lon")),
            owner: node.getAttribute("owner") || "",
            program: node.getAttribute("pgm") || "",
            type: node.getAttribute("type") || "",
            met: node.getAttribute("met") || "",
            currents: node.getAttribute("currents") || "",
            waterQuality: node.getAttribute("waterquality") || "",
            dart: node.getAttribute("dart") || ""
        }))
        .filter(station => station.id && station.latitude !== null && station.longitude !== null);
}

function parseRealtimeObservation(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const header = lines.find(line => /^#?YY\s+MM\s+DD\s+hh\s+mm/i.test(line));
    const data = lines.find(line => !line.startsWith("#"));
    if (!header || !data) return null;

    const keys = header.replace(/^#/, "").trim().split(/\s+/);
    const values = data.trim().split(/\s+/);
    const record = {};
    keys.forEach((key, index) => {
        record[key] = values[index];
    });
    return record;
}

function stationLooksCoastal(station) {
    const text = [
        station.owner,
        station.program,
        station.type,
        station.name
    ].join(" ").toLowerCase();
    return /coast|co-op|coops|ports|tide|water level|estuar|fixed|pier|shore|harbor|harbour/.test(text);
}

class NOAAOceanProvider extends BaseMapProvider {
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
                    "NOAA station refresh failed"
                ));
            }, 1200);
        });

        await this.refresh(context);

        if (this.active && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "NOAA station refresh failed"
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
                summary: "Offline mode · ocean observations disabled"
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.LOADING, {
            summary: `Loading NOAA/NDBC ${this.definition.source === "dart" ? "DART buoys" : "active stations"}`
        });

        const controller = this.createAbortController();

        try {
            const xmlText = await context.cache.getOrFetch(
                "noaa:ndbc-active-stations",
                this.definition.cacheTtlMs,
                () => this.fetchText(NDBC_ACTIVE_STATIONS_URL, {signal: controller.signal})
            );
            let stations = parseStationXml(xmlText);
            if (this.definition.source === "dart") {
                stations = stations.filter(station => String(station.dart || "").toLowerCase() === "y");
            }
            this.renderStations(context, stations);
        } catch (error) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.applyProviderError(error, context, "NOAA/NDBC service unavailable");
        }
    }

    renderStations(context, stations) {
        if (!this.layerGroup) {
            this.layerGroup = context.L.layerGroup();
            this.rememberLeafletLayer(this.layerGroup);
            this.layerGroup.addTo(context.map);
        }

        const bounds = this.getMapBounds(context);
        const filterMode = this.definition.filterMode || "visible";
        const visibleStations = stations
            .filter(station => {
                if (filterMode === "coastal" && !stationLooksCoastal(station)) return false;
                if (filterMode === "global" || !bounds) return true;
                return station.latitude >= bounds.south
                    && station.latitude <= bounds.north
                    && station.longitude >= bounds.west
                    && station.longitude <= bounds.east;
            })
            .slice(0, this.definition.maxMarkers || 500);

        this.layerGroup.clearLayers();

        visibleStations.forEach(station => {
            const marker = context.L.circleMarker([station.latitude, station.longitude], {
                radius: station.dart === "y" ? 6 : 4.5,
                color: station.dart === "y" ? "#FFB84D" : "#7CCBFF",
                fillColor: station.dart === "y" ? "#FFB84D" : "#3BA7FF",
                fillOpacity: 0.54,
                opacity: 0.9,
                weight: 1
            });
            marker.bindTooltip(this.escapeHtml(`${station.id} · ${station.type || "station"}`), {
                direction: "top",
                className: "eng-map-provider-tooltip"
            });
            marker.bindPopup(this.renderStationPopup(station), {className: "eng-map-provider-popup"});
            marker.on("click", async () => {
                marker.setPopupContent(`${this.renderStationPopup(station)}<span>Loading latest observation…</span>`);
                const latest = await this.loadLatestObservation(context, station.id);
                marker.setPopupContent(this.renderStationPopup(station, latest));
            });
            marker.addTo(this.layerGroup);
        });

        if (!visibleStations.length) {
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: `${stations.length} NOAA stations loaded · no ${filterMode} matches`,
                count: 0
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: `NOAA/NDBC ${this.definition.source === "dart" ? "DART" : "active"} stations · ${filterMode} · ${stations.length} loaded`,
            count: visibleStations.length
        });
    }

    async loadLatestObservation(context, stationId) {
        const safeId = String(stationId || "").replace(/[^a-z0-9_-]/ig, "").toUpperCase();
        if (!safeId) return null;

        try {
            const text = await context.cache.getOrFetch(
                `noaa:latest:${safeId}`,
                5 * 60 * 1000,
                () => this.fetchText(`${NDBC_REALTIME_URL}/${encodeURIComponent(safeId)}.txt`)
            );
            return parseRealtimeObservation(text);
        } catch (error) {
            return {error: "Latest observation unavailable"};
        }
    }

    renderStationPopup(station, latest = null) {
        const latestRows = latest && !latest.error
            ? [
                `WDIR ${latest.WDIR || "n/a"}`,
                `WSPD ${latest.WSPD || "n/a"}`,
                `WVHT ${latest.WVHT || "n/a"}`,
                `ATMP ${latest.ATMP || "n/a"}`,
                `WTMP ${latest.WTMP || "n/a"}`
            ]
            : [];

        return `
            <strong>${this.escapeHtml(station.id)} · ${this.escapeHtml(station.name || "NOAA station")}</strong>
            <span>${this.escapeHtml(station.type || "station")} · ${this.escapeHtml(station.owner || "NOAA/NDBC")}</span>
            <span>LAT ${station.latitude} · LON ${station.longitude}</span>
            <span>DART ${this.escapeHtml(station.dart || "n")}</span>
            ${latest && latest.error ? `<span>${this.escapeHtml(latest.error)}</span>` : ""}
            ${latestRows.map(row => `<span>${this.escapeHtml(row)}</span>`).join("")}
        `;
    }
}

if (typeof module !== "undefined" && module.exports) module.exports = {NOAAOceanProvider};
if (typeof window !== "undefined") window.AegisNOAAOceanProvider = {NOAAOceanProvider};
})();
