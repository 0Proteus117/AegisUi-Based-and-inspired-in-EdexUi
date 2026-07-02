const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

const OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const MARINE_HOURLY_FIELDS = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "sea_surface_temperature",
    "ocean_current_velocity",
    "ocean_current_direction",
    "sea_level_height_msl"
];

const MARINE_PRESETS = Object.freeze({
    NEAREST_SEA: [
        {label: "Nearest configured sea · Gulf of Cadiz", latitude: 36.55, longitude: -7.25}
    ],
    IBERIAN_ATLANTIC: [
        {label: "Gulf of Cadiz", latitude: 36.55, longitude: -7.25},
        {label: "Galicia Atlantic", latitude: 43.38, longitude: -8.52},
        {label: "Portuguese Coast", latitude: 39.0, longitude: -9.8},
        {label: "Canary Basin", latitude: 28.2, longitude: -16.4}
    ],
    BAY_OF_BISCAY: [
        {label: "Bay of Biscay West", latitude: 44.8, longitude: -5.5},
        {label: "Bay of Biscay East", latitude: 44.2, longitude: -2.2}
    ],
    MEDITERRANEAN_WEST: [
        {label: "Alboran Sea", latitude: 36.72, longitude: -4.42},
        {label: "Balearic Sea", latitude: 39.45, longitude: 2.55},
        {label: "Gulf of Lion", latitude: 42.5, longitude: 4.3}
    ],
    GIBRALTAR: [
        {label: "Gibraltar Strait", latitude: 35.95, longitude: -5.55},
        {label: "Alboran West", latitude: 36.2, longitude: -4.9}
    ],
    BALEARIC_SEA: [
        {label: "Mallorca Channel", latitude: 39.45, longitude: 2.55},
        {label: "Ibiza Channel", latitude: 38.9, longitude: 1.45}
    ],
    NORTH_ATLANTIC: [
        {label: "North Atlantic", latitude: 45.0, longitude: -25.0},
        {label: "Azores", latitude: 38.5, longitude: -28.0}
    ],
    CARIBBEAN: [
        {label: "Caribbean Sea", latitude: 15.5, longitude: -72.0},
        {label: "Lesser Antilles", latitude: 14.5, longitude: -61.5}
    ],
    iberian: [
        {label: "Alboran Sea", latitude: 36.72, longitude: -4.42},
        {label: "Gulf of Cadiz", latitude: 36.55, longitude: -7.25},
        {label: "Galicia Atlantic", latitude: 43.38, longitude: -8.52},
        {label: "Balearic Sea", latitude: 39.45, longitude: 2.55}
    ],
    mediterranean: [
        {label: "Alboran Sea", latitude: 36.72, longitude: -4.42},
        {label: "Balearic Sea", latitude: 39.45, longitude: 2.55},
        {label: "Tyrrhenian Sea", latitude: 40.25, longitude: 12.15},
        {label: "Ionian Sea", latitude: 37.2, longitude: 18.6},
        {label: "Aegean Sea", latitude: 37.7, longitude: 24.0}
    ],
    atlantic: [
        {label: "Portuguese Coast", latitude: 39.0, longitude: -9.8},
        {label: "Bay of Biscay", latitude: 44.8, longitude: -5.5},
        {label: "Canary Basin", latitude: 28.2, longitude: -16.4},
        {label: "North Atlantic", latitude: 45.0, longitude: -25.0},
        {label: "Central Atlantic", latitude: 25.0, longitude: -40.0}
    ],
    "global-low": [
        {label: "North Atlantic", latitude: 45.0, longitude: -25.0},
        {label: "South Atlantic", latitude: -25.0, longitude: -10.0},
        {label: "North Pacific", latitude: 35.0, longitude: -145.0},
        {label: "South Pacific", latitude: -30.0, longitude: -135.0},
        {label: "Indian Ocean", latitude: -20.0, longitude: 75.0},
        {label: "Mediterranean", latitude: 37.7, longitude: 18.6}
    ]
});

const ROUGH_MARINE_VIEW_BOXES = [
    {south: 35, west: -6.5, north: 38.5, east: 5.5},
    {south: 38, west: 0, north: 43.8, east: 6.5},
    {south: 35, west: -12, north: 44.5, east: -6},
    {south: 43, west: -12, north: 49, east: 4},
    {south: 27, west: -19, north: 30.5, east: -12}
];

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function intersects(a, b) {
    return a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;
}

function formatValue(value, unit = "") {
    const number = finiteNumber(value);
    if (number === null) return "n/a";
    return `${Math.round(number * 10) / 10}${unit ? ` ${unit}` : ""}`;
}

function nearestHourlyIndex(times = []) {
    if (!Array.isArray(times) || !times.length) return 0;
    const now = Date.now();
    let bestIndex = 0;
    let bestDistance = Infinity;
    times.forEach((time, index) => {
        const stamp = Date.parse(`${time}Z`);
        if (!Number.isFinite(stamp)) return;
        const distance = Math.abs(stamp - now);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    });
    return bestIndex;
}

class MarineWeatherProvider extends BaseMapProvider {
    async start(context) {
        await super.start(context);
        this.layerGroup = context.L.layerGroup();
        this.rememberLeafletLayer(this.layerGroup);
        this.layerGroup.addTo(context.map);
        this.moveRefreshTimer = null;

        this.rememberMapListener(context.map, "moveend", () => {
            if (!this.active || this.definition.mode !== "visible") return;
            clearTimeout(this.moveRefreshTimer);
            this.moveRefreshTimer = setTimeout(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "Open-Meteo marine refresh failed"
                ));
            }, 1400);
        });

        await this.refresh(context);

        if (this.active && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "Open-Meteo marine refresh failed"
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
                summary: "Offline mode · marine weather disabled"
            });
            return;
        }

        const points = this.resolveMarinePoints(context);
        if (!points.length) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: "NO_MARINE_CELL_IN_VIEW · choose nearest or a sea preset",
                count: 0
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.LOADING, {
            summary: "Loading Open-Meteo Marine conditions"
        });

        try {
            const maxMarkers = this.definition.maxMarkers || 8;
            const limitedPoints = points.slice(0, maxMarkers);
            const observations = [];

            for (const point of limitedPoints) {
                const observation = await this.loadMarinePoint(context, point);
                if (observation) observations.push(observation);
            }

            this.renderMarineWeather(context, observations);
        } catch (error) {
            if (this.layerGroup) this.layerGroup.clearLayers();
            this.applyProviderError(error, context, "Open-Meteo Marine service unavailable");
        }
    }

    resolveMarinePoints(context) {
        const mode = this.definition.mode || "visible";
        const preset = this.definition.preset || "IBERIAN_ATLANTIC";
        const bounds = this.getMapBounds(context);

        if (mode === "preset") return MARINE_PRESETS[preset] || MARINE_PRESETS.iberian;
        if (mode === "nearest") {
            const center = context.map && typeof context.map.getCenter === "function"
                ? context.map.getCenter()
                : {lat: 36.72, lng: -4.42};
            return [{label: "Nearest sea cell", latitude: center.lat, longitude: center.lng}];
        }

        if (!bounds || !ROUGH_MARINE_VIEW_BOXES.some(box => intersects(bounds, box))) {
            return MARINE_PRESETS.NEAREST_SEA || MARINE_PRESETS.IBERIAN_ATLANTIC;
        }
        const center = context.map.getCenter();
        return [{label: "Visible sea cell", latitude: center.lat, longitude: center.lng}];
    }

    async loadMarinePoint(context, point) {
        const latitude = finiteNumber(point.latitude);
        const longitude = finiteNumber(point.longitude);
        if (latitude === null || longitude === null) return null;

        const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            hourly: MARINE_HOURLY_FIELDS.join(","),
            forecast_days: "1",
            cell_selection: "sea",
            timezone: "GMT"
        });
        const cacheKey = `openmeteo:marine:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
        const data = await context.cache.getOrFetch(
            cacheKey,
            this.definition.cacheTtlMs,
            () => this.fetchJson(`${OPEN_METEO_MARINE_URL}?${params.toString()}`, {
                headers: {Accept: "application/json"}
            })
        );
        const hourly = data && data.hourly ? data.hourly : {};
        const index = nearestHourlyIndex(hourly.time);
        if (!hourly.time || !hourly.time.length) return null;

        return {
            label: point.label,
            requestedLatitude: latitude,
            requestedLongitude: longitude,
            latitude: finiteNumber(data.latitude),
            longitude: finiteNumber(data.longitude),
            timestamp: hourly.time[index],
            waveHeight: hourly.wave_height && hourly.wave_height[index],
            waveDirection: hourly.wave_direction && hourly.wave_direction[index],
            wavePeriod: hourly.wave_period && hourly.wave_period[index],
            seaSurfaceTemperature: hourly.sea_surface_temperature && hourly.sea_surface_temperature[index],
            currentVelocity: hourly.ocean_current_velocity && hourly.ocean_current_velocity[index],
            currentDirection: hourly.ocean_current_direction && hourly.ocean_current_direction[index],
            seaLevel: hourly.sea_level_height_msl && hourly.sea_level_height_msl[index],
            source: "Open-Meteo Marine"
        };
    }

    renderMarineWeather(context, observations) {
        if (!this.layerGroup) {
            this.layerGroup = context.L.layerGroup();
            this.rememberLeafletLayer(this.layerGroup);
            this.layerGroup.addTo(context.map);
        }
        this.layerGroup.clearLayers();

        const valid = observations.filter(item => item.latitude !== null && item.longitude !== null);
        valid.forEach(item => {
            const marker = context.L.circleMarker([item.latitude, item.longitude], {
                radius: 5.5,
                color: "#7CCBFF",
                fillColor: "#13263A",
                fillOpacity: 0.88,
                opacity: 0.95,
                weight: 1.4
            });
            marker.bindTooltip(this.escapeHtml(`${item.label} · ${formatValue(item.waveHeight, "m")}`), {
                direction: "top",
                className: "eng-map-provider-tooltip"
            });
            marker.bindPopup(`
                <strong>${this.escapeHtml(item.label || "Marine weather")}</strong>
                <span>LAT ${this.escapeHtml(String(item.latitude))} · LON ${this.escapeHtml(String(item.longitude))}</span>
                <span>WAVE ${this.escapeHtml(formatValue(item.waveHeight, "m"))} · ${this.escapeHtml(formatValue(item.waveDirection, "°"))}</span>
                <span>PERIOD ${this.escapeHtml(formatValue(item.wavePeriod, "s"))}</span>
                <span>SST ${this.escapeHtml(formatValue(item.seaSurfaceTemperature, "°C"))}</span>
                <span>CURRENT ${this.escapeHtml(formatValue(item.currentVelocity, "km/h"))} · ${this.escapeHtml(formatValue(item.currentDirection, "°"))}</span>
                <span>SEA LEVEL ${this.escapeHtml(formatValue(item.seaLevel, "m"))}</span>
                <span>${this.escapeHtml(item.timestamp || "n/a")}</span>
                <span>SRC ${this.escapeHtml(item.source)}</span>
            `, {className: "eng-map-provider-popup"});
            marker.addTo(this.layerGroup);
        });

        if (!valid.length) {
            this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                summary: "Open-Meteo Marine returned no usable sea cells",
                count: 0
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: `Open-Meteo Marine ${this.definition.mode || "visible"} · ${valid.length} real sea cells`,
            count: valid.length
        });
    }
}

module.exports = {MarineWeatherProvider};
