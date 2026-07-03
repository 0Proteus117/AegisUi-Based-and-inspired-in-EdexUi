const {MapLayerRegistry} = require(require("path").join(__dirname, "classes/map/mapLayerRegistry.js"));
const {
    MAP_LAYER_STATES,
    formatMapTimestamp,
    statusNeedsAttention,
    statusIsInformative
} = require(require("path").join(__dirname, "classes/map/utils/mapLayerState.js"));

const MAP_SATELLITE_GROUPS = Object.freeze({
    "stations": {
        label: "Stations",
        description: "Few objects, clean view: ISS, Tiangong and crewed station-related objects."
    },
    "active": {
        label: "Active",
        description: "Large active catalog. Use medium/high density carefully."
    },
    "starlink": {
        label: "Starlink",
        description: "Starlink constellation objects from CelesTrak."
    },
    "weather": {
        label: "Weather",
        description: "Weather and meteorological satellites."
    },
    "gps-ops": {
        label: "GPS OPS",
        description: "Operational GPS spacecraft."
    },
    "visual": {
        label: "Visual",
        description: "Objects commonly visible under favorable sky conditions."
    },
    "last-30-days": {
        label: "Last 30 days",
        description: "Objects launched or updated in the last 30 days."
    },
    "geo": {
        label: "GEO",
        description: "Geostationary and near-geostationary objects."
    },
    "science": {
        label: "Science",
        description: "Scientific spacecraft and research missions."
    }
});

const MAP_SATELLITE_DENSITIES = Object.freeze({
    LOW: {maxOrbitObjects: 200, maxMarkers: 40, description: "Fast and tidy"},
    MEDIUM: {maxOrbitObjects: 800, maxMarkers: 80, description: "Balanced cockpit default"},
    HIGH: {maxOrbitObjects: 2000, maxMarkers: 200, description: "Dense view; higher CPU/GPU load"},
    CUSTOM: {maxOrbitObjects: 800, maxMarkers: 80, description: "Manual limits"}
});

function clampMapNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function selectMapOption(value, allowed, fallback) {
    const normalized = String(value || "").trim();
    return allowed.includes(normalized) ? normalized : fallback;
}

function cloneMapData(value) {
    try {
        return JSON.parse(JSON.stringify(value || {}));
    } catch (error) {
        return {};
    }
}

function maskMapSecret(value) {
    const text = String(value || "").trim();
    return text ? `••••${text.slice(-4)}` : "";
}

class EngineeringDashboard {
    constructor(parentId) {
        if (!parentId) throw "Missing options";

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML = `
            <section id="eng_map_panel" class="eng-panel" augmented-ui="tl-clip br-clip exe">
                <h3 class="title"><p>LOCAL SITUATION</p><p id="eng_map_status">INITIALIZING</p></h3>
                <div id="eng_map_canvas"></div>
                <div class="eng-map-controls" id="eng_map_layer_controls"></div>
                <div class="eng-map-layer-readout" id="eng_map_layer_readout"></div>
                <div class="eng-map-config-actions">
                    <button id="eng_map_location" class="eng-map-icon-button" title="Return to my location" aria-label="Return to my location">⌖</button>
                    <button id="eng_map_expand" class="eng-map-icon-button" title="Expand map" aria-label="Expand map">⛶</button>
                    <button id="eng_map_settings" class="eng-map-icon-button" title="Map layer settings" aria-label="Map layer settings">⚙</button>
                    <button id="eng_traffic_config">API KEY</button>
                </div>
                <form id="eng_traffic_form">
                    <label for="eng_traffic_key">TOMTOM TRAFFIC KEY</label>
                    <input id="eng_traffic_key" type="password" autocomplete="off" spellcheck="false">
                    <button type="submit">SAVE</button>
                    <button type="button" id="eng_traffic_get_key">GET FREE KEY</button>
                    <button type="button" id="eng_traffic_cancel">CANCEL</button>
                    <small>Free daily allowance. The key stays only on this Mac.</small>
                </form>
            </section>
            <section id="eng_calendar_panel" class="eng-panel" augmented-ui="tr-clip bl-clip exe">
                <h3 class="title"><p>CALENDAR</p><p id="eng_calendar_status">NEXT 7 DAYS</p></h3>
                <div id="eng_calendar_content"></div>
            </section>
            <section id="eng_projects_panel" class="eng-panel" augmented-ui="tl-clip br-clip exe">
                <h3 class="title"><p>PROJECT TIMELINES</p><p>CONTROL CENTER</p></h3>
                <div id="eng_projects_content"></div>
            </section>
            <section id="eng_music_panel" class="eng-panel" augmented-ui="tl-clip br-clip exe">
                <h3 class="title"><p>APPLE MUSIC</p><p id="eng_music_state">DISCONNECTED</p></h3>
                <div id="eng_music_content"></div>
            </section>
            <section id="eng_apps_panel" class="eng-panel" augmented-ui="tr-clip bl-clip exe">
                <h3 class="title"><p>APPLICATIONS</p><p>MACOS LAUNCH GRID</p></h3>
                <div id="eng_apps_content"></div>
            </section>`;

        this.mapPanel = new EngineeringMapPanel();
        this.calendarPanel = new EngineeringCalendarPanel();
        this.projectsPanel = new EngineeringProjectsPanel();
        this.musicPanel = new EngineeringMusicPanel();
        this.applications = new ApplicationsDisplay("eng_apps_content");
    }
}

class EngineeringMapPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.panel = document.getElementById("eng_map_panel");
        this.status = document.getElementById("eng_map_status");
        this.controls = document.getElementById("eng_map_layer_controls");
        this.readout = document.getElementById("eng_map_layer_readout");
        this.locationApplied = false;
        this.localEnv = this.loadLocalEnvSnapshot();
        this.trafficKey = "";
        this.offlineMode = Boolean(window.settings.offlineMode);
        this.layerStorageKey = "aegisui-map-layers-v1";
        this.settingsStorageKey = "aegisui-map-settings-v1";
        this.mapSettings = this.loadMapSettings();
        this.tomTomDiagnostic = {
            keyStatus: this.getTrafficKey() ? "CONFIGURED" : "MISSING",
            serviceStatus: "UNKNOWN",
            last4: maskMapSecret(this.getTrafficKey()),
            summary: "TomTom diagnostic not run yet"
        };
        this.baseMapStatus = {
            provider: "FALLBACK",
            status: "LOADING",
            summary: "Base map initializing"
        };
        this.expanded = false;
        this.settingsOverlay = null;
        this.layerPreferences = this.loadLayerPreferences();
        this.hasLocalLayerPreferences = Object.keys(this.layerPreferences).length > 0;
        this.layerDefinitions = this.createLayerDefinitions();

        this.map = L.map("eng_map_canvas", {
            zoomControl: false,
            attributionControl: true,
            preferCanvas: true
        }).setView([40.4168, -3.7038], 10);
        this.map.attributionControl.setPrefix(false);

        this.baseLayer = null;
        this.applyBaseMapProvider();
        L.control.zoom({position: "bottomright"}).addTo(this.map);

        document.getElementById("eng_map_settings").addEventListener("click", () => this.openSettingsModal());
        document.getElementById("eng_map_expand").addEventListener("click", () => this.toggleExpandedMap());
        document.getElementById("eng_map_location").addEventListener("click", () => this.returnToMyLocation());
        document.getElementById("eng_traffic_config").addEventListener("click", () => this.showTrafficForm());
        document.getElementById("eng_traffic_get_key").addEventListener("click", () => {
            this.ipc.invoke("traffic-open-key-page");
        });
        document.getElementById("eng_traffic_cancel").addEventListener("click", () => this.hideTrafficForm());
        document.getElementById("eng_traffic_form").addEventListener("submit", event => {
            event.preventDefault();
            this.saveTrafficKey();
        });

        this.initializeLayerRegistry();
        this.renderLayerControls();
        this.applyInitialLayerState();
        this.syncLayerPreferencesFile();
        this.loadRuntimeConfig();
        this.updateLocation();
        this.locationTimer = setInterval(() => this.updateLocation(), 3000);
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            if (this.settingsOverlay) {
                this.closeSettingsModal();
                return;
            }
            if (this.expanded) this.toggleExpandedMap(false);
        });
        setTimeout(() => this.map.invalidateSize(), 400);
    }

    defaultMapSettings() {
        return {
            baseMap: {
                provider: "auto",
                fallbackEnabled: true
            },
            satellite: {
                group: "stations",
                density: "MEDIUM",
                customMaxOrbitObjects: MAP_SATELLITE_DENSITIES.MEDIUM.maxOrbitObjects,
                customMaxMarkers: MAP_SATELLITE_DENSITIES.MEDIUM.maxMarkers
            },
            air: {
                maxMarkers: 100,
                refreshIntervalMs: 60 * 1000,
                boundsMode: "visible"
            },
            sea: {
                provider: "AISStream",
                areaMode: "CURRENT_VIEW",
                maxVessels: 150,
                refreshIntervalMs: 60 * 1000,
                clusterVessels: false,
                showLabels: false,
                showWake: true
            },
            marineWeather: {
                active: false,
                mode: "preset",
                preset: "IBERIAN_ATLANTIC",
                maxMarkers: 4
            },
            ocean: {
                source: "ndbc-active",
                filterMode: "visible",
                maxStations: 500
            },
            radar: {
                provider: "auto",
                opacity: 0.55,
                seaCoverage: "precipitation-mosaic"
            },
            traffic: {
                provider: "auto",
                preset: "MADRID",
                opacity: 0.9
            },
            uiSounds: true,
            defaultLocation: {
                mode: "current",
                customLat: "",
                customLon: ""
            }
        };
    }

    sanitizeMapSettings(input = {}) {
        const defaults = this.defaultMapSettings();
        const baseMap = input.baseMap && typeof input.baseMap === "object" ? input.baseMap : {};
        const satellite = input.satellite && typeof input.satellite === "object" ? input.satellite : {};
        const air = input.air && typeof input.air === "object" ? input.air : {};
        const sea = input.sea && typeof input.sea === "object" ? input.sea : {};
        const marineWeather = input.marineWeather && typeof input.marineWeather === "object"
            ? input.marineWeather
            : {};
        const ocean = input.ocean && typeof input.ocean === "object" ? input.ocean : {};
        const radar = input.radar && typeof input.radar === "object" ? input.radar : {};
        const traffic = input.traffic && typeof input.traffic === "object" ? input.traffic : {};
        const defaultLocation = input.defaultLocation && typeof input.defaultLocation === "object"
            ? input.defaultLocation
            : {};

        return {
            baseMap: {
                provider: selectMapOption(baseMap.provider, ["auto", "tomtom", "osm"], defaults.baseMap.provider),
                fallbackEnabled: typeof baseMap.fallbackEnabled === "boolean"
                    ? baseMap.fallbackEnabled
                    : defaults.baseMap.fallbackEnabled
            },
            satellite: {
                group: selectMapOption(
                    satellite.group,
                    Object.keys(MAP_SATELLITE_GROUPS),
                    defaults.satellite.group
                ),
                density: selectMapOption(
                    String(satellite.density || "").toUpperCase(),
                    Object.keys(MAP_SATELLITE_DENSITIES),
                    defaults.satellite.density
                ),
                customMaxOrbitObjects: clampMapNumber(
                    satellite.customMaxOrbitObjects,
                    defaults.satellite.customMaxOrbitObjects,
                    50,
                    5000
                ),
                customMaxMarkers: clampMapNumber(
                    satellite.customMaxMarkers,
                    defaults.satellite.customMaxMarkers,
                    10,
                    500
                )
            },
            air: {
                maxMarkers: clampMapNumber(air.maxMarkers, defaults.air.maxMarkers, 25, 200),
                refreshIntervalMs: clampMapNumber(
                    air.refreshIntervalMs,
                    defaults.air.refreshIntervalMs,
                    30 * 1000,
                    120 * 1000
                ),
                boundsMode: selectMapOption(air.boundsMode, ["visible", "wide"], defaults.air.boundsMode)
            },
            sea: {
                provider: "AISStream",
                areaMode: selectMapOption(
                    sea.areaMode,
                    [
                        "CURRENT_VIEW",
                        "MEDITERRANEAN",
                        "GIBRALTAR",
                        "NORTH_SEA",
                        "ENGLISH_CHANNEL",
                        "SINGAPORE_STRAIT",
                        "CARIBBEAN",
                        "US_EAST_COAST",
                        "US_WEST_COAST",
                        "JAPAN",
                        "AUSTRALIA_EAST",
                        "WORLD_SAMPLE",
                        "visible",
                        "mediterranean"
                    ],
                    defaults.sea.areaMode
                ),
                maxVessels: clampMapNumber(sea.maxVessels, defaults.sea.maxVessels, 50, 250),
                refreshIntervalMs: clampMapNumber(
                    sea.refreshIntervalMs,
                    defaults.sea.refreshIntervalMs,
                    60 * 1000,
                    300 * 1000
                ),
                clusterVessels: typeof sea.clusterVessels === "boolean" ? sea.clusterVessels : defaults.sea.clusterVessels,
                showLabels: typeof sea.showLabels === "boolean" ? sea.showLabels : defaults.sea.showLabels,
                showWake: typeof sea.showWake === "boolean" ? sea.showWake : defaults.sea.showWake
            },
            marineWeather: {
                active: typeof marineWeather.active === "boolean"
                    ? marineWeather.active
                    : defaults.marineWeather.active,
                mode: selectMapOption(
                    marineWeather.mode,
                    ["visible", "nearest", "preset"],
                    defaults.marineWeather.mode
                ),
                preset: selectMapOption(
                    marineWeather.preset,
                    [
                        "NEAREST_SEA",
                        "IBERIAN_ATLANTIC",
                        "BAY_OF_BISCAY",
                        "MEDITERRANEAN_WEST",
                        "GIBRALTAR",
                        "BALEARIC_SEA",
                        "NORTH_ATLANTIC",
                        "CARIBBEAN",
                        "iberian",
                        "mediterranean",
                        "atlantic",
                        "global-low"
                    ],
                    defaults.marineWeather.preset
                ),
                maxMarkers: clampMapNumber(marineWeather.maxMarkers, defaults.marineWeather.maxMarkers, 1, 12)
            },
            ocean: {
                source: selectMapOption(ocean.source, ["ndbc-active", "dart"], defaults.ocean.source),
                filterMode: selectMapOption(
                    ocean.filterMode,
                    ["visible", "global", "coastal"],
                    defaults.ocean.filterMode
                ),
                maxStations: clampMapNumber(ocean.maxStations, defaults.ocean.maxStations, 100, 1500)
            },
            radar: {
                provider: selectMapOption(radar.provider, ["auto", "rainviewer"], defaults.radar.provider),
                opacity: clampMapNumber(radar.opacity, defaults.radar.opacity, 0.15, 0.95),
                seaCoverage: "precipitation-mosaic"
            },
            traffic: {
                provider: selectMapOption(traffic.provider, ["auto", "tomtom-tiles", "tomtom-segments"], defaults.traffic.provider),
                preset: selectMapOption(traffic.preset, ["CURRENT_VIEW", "MADRID", "LONDON", "PARIS"], defaults.traffic.preset),
                opacity: clampMapNumber(traffic.opacity, defaults.traffic.opacity, 0.25, 1)
            },
            uiSounds: typeof input.uiSounds === "boolean" ? input.uiSounds : defaults.uiSounds,
            defaultLocation: {
                mode: selectMapOption(defaultLocation.mode, ["current", "custom", "city"], defaults.defaultLocation.mode),
                customLat: String(defaultLocation.customLat || "").slice(0, 24),
                customLon: String(defaultLocation.customLon || "").slice(0, 24)
            }
        };
    }

    loadMapSettings() {
        try {
            return this.sanitizeMapSettings(JSON.parse(localStorage.getItem(this.settingsStorageKey) || "{}"));
        } catch (error) {
            return this.sanitizeMapSettings({});
        }
    }

    saveMapSettings() {
        try {
            localStorage.setItem(this.settingsStorageKey, JSON.stringify(this.mapSettings));
        } catch (error) {}
    }

    getTomTomKey() {
        return this.getTrafficKey();
    }

    setBaseMapStatus(provider, status, summary = "") {
        this.baseMapStatus = {provider, status, summary};
        if (!this.layers || !Array.from(this.layers.values()).some(layer => layer.active)) {
            this.status.innerText = `BASE MAP: ${provider} · ${status}`;
        }
    }

    removeBaseLayer() {
        if (!this.baseLayer) return;
        try {
            if (this.map && this.map.hasLayer(this.baseLayer)) this.map.removeLayer(this.baseLayer);
        } catch (error) {}
        this.baseLayer = null;
    }

    applyBaseMapProvider() {
        const provider = this.mapSettings.baseMap.provider;
        const key = this.getTomTomKey();
        if ((provider === "auto" || provider === "tomtom") && key) {
            this.useTomTomBaseMap(key);
            this.runTomTomDiagnostic(key);
            return;
        }
        this.useOsmFallbackBaseMap(key ? "OSM selected" : "TomTom key missing");
        if (!key) {
            this.tomTomDiagnostic = {
                keyStatus: "MISSING",
                serviceStatus: "CONFIG_REQUIRED",
                last4: "",
                summary: "TomTom key missing"
            };
        }
    }

    useTomTomBaseMap(key) {
        this.removeBaseLayer();
        const encodedKey = encodeURIComponent(key);
        const layer = L.tileLayer(
            `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?tileSize=256&key=${encodedKey}`,
            {
                maxZoom: 22,
                attribution: "© TomTom",
                className: "eng-base-map eng-base-map-tomtom"
            }
        );
        layer.on("tileload", () => {
            if (this.baseLayer !== layer) return;
            this.setBaseMapStatus("TOMTOM", "ONLINE", "TomTom base tiles loaded");
        });
        layer.on("tileerror", () => {
            if (this.baseLayer !== layer) return;
            this.tomTomDiagnostic = {
                ...this.tomTomDiagnostic,
                keyStatus: this.tomTomDiagnostic.keyStatus === "MISSING" ? "MISSING" : "CONFIGURED",
                serviceStatus: "ERROR",
                summary: "TomTom tile error; fallback map active"
            };
            if (this.mapSettings.baseMap.fallbackEnabled) this.useOsmFallbackBaseMap("TomTom tile error");
            else this.setBaseMapStatus("TOMTOM", "ERROR", "TomTom tile error");
        });
        this.baseLayer = layer.addTo(this.map);
        this.setBaseMapStatus("TOMTOM", "LOADING", "TomTom base tiles requested");
    }

    useOsmFallbackBaseMap(summary = "Fallback base map") {
        this.removeBaseLayer();
        const layer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
            className: "eng-base-map eng-base-map-osm"
        });
        layer.on("tileload", () => {
            this.setBaseMapStatus("FALLBACK", "ONLINE", summary);
        });
        layer.on("tileerror", () => {
            this.setBaseMapStatus("OFFLINE", "ERROR", "Fallback base map unavailable");
        });
        this.baseLayer = layer.addTo(this.map);
        this.setBaseMapStatus("FALLBACK", "LOADING", summary);
    }

    async runTomTomDiagnostic(key = this.getTomTomKey()) {
        if (!key || !this.ipc || !this.ipc.invoke) return;
        try {
            const result = await this.ipc.invoke("tomtom-diagnostic", key);
            this.tomTomDiagnostic = {
                keyStatus: result.keyStatus || "CONFIGURED",
                serviceStatus: result.serviceStatus || (result.ok ? "ONLINE" : "ERROR"),
                last4: result.last4 || maskMapSecret(key),
                httpStatus: result.httpStatus || "",
                summary: result.summary || ""
            };
            if (result.ok) {
                this.setBaseMapStatus("TOMTOM", "ONLINE", result.summary || "TomTom online");
            } else if (this.mapSettings.baseMap.fallbackEnabled) {
                this.useOsmFallbackBaseMap(result.summary || "TomTom diagnostic failed");
            } else {
                this.setBaseMapStatus("TOMTOM", this.tomTomDiagnostic.serviceStatus, this.tomTomDiagnostic.summary);
            }
            if (this.settingsOverlay) this.refreshSettingsStatusBadges();
        } catch (error) {
            this.tomTomDiagnostic = {
                keyStatus: key ? "CONFIGURED" : "MISSING",
                serviceStatus: "ERROR",
                last4: maskMapSecret(key),
                summary: error.message || "TomTom diagnostic failed"
            };
            if (this.mapSettings.baseMap.fallbackEnabled) this.useOsmFallbackBaseMap("TomTom diagnostic failed");
        }
    }

    getSatelliteLimits(settings = this.mapSettings) {
        const density = settings.satellite.density;
        if (density === "CUSTOM") {
            return {
                maxOrbitObjects: settings.satellite.customMaxOrbitObjects,
                maxMarkers: settings.satellite.customMaxMarkers
            };
        }
        return MAP_SATELLITE_DENSITIES[density] || MAP_SATELLITE_DENSITIES.MEDIUM;
    }

    createLayerDefinitions() {
        const satelliteLimits = this.getSatelliteLimits();
        return [
            {
                id: "ROAD_TRAFFIC",
                label: "TRAFFIC",
                name: "Road traffic",
                description: "Live road traffic flow overlay.",
                providerType: "TomTom traffic tiles",
                providerCandidates: ["TomTom Traffic API"],
                requiresApiKey: true,
                defaultActive: Boolean(this.getTrafficKey()),
                available: true,
                updateIntervalMs: 90 * 1000,
                cacheTtlMs: 0,
                zIndex: 30,
                opacity: this.mapSettings.traffic.opacity,
                provider: this.mapSettings.traffic.provider,
                preset: this.mapSettings.traffic.preset,
                fallbackVisual: "Traffic unavailable state in the Local Situation status bar.",
                mode: "live"
            },
            {
                id: "WEATHER_RADAR",
                label: "RADAR",
                name: "Weather radar",
                description: "RainViewer weather radar overlay.",
                providerType: "RainViewer public weather maps",
                providerCandidates: ["RainViewer public weather maps"],
                requiresApiKey: false,
                defaultActive: !this.offlineMode,
                available: true,
                updateIntervalMs: 5 * 60 * 1000,
                cacheTtlMs: 5 * 60 * 1000,
                zIndex: 20,
                fallbackVisual: "Radar unavailable state in the Local Situation status bar.",
                mode: "live",
                provider: this.mapSettings.radar.provider,
                opacity: this.mapSettings.radar.opacity,
                seaCoverage: this.mapSettings.radar.seaCoverage
            },
            {
                id: "AIR_TRAFFIC",
                label: "AIR",
                name: "Air traffic",
                description: "Live ADS-B aircraft state vectors in the visible map area.",
                providerType: "OpenSky Network state vectors",
                providerCandidates: ["OpenSky Network"],
                requiresApiKey: false,
                defaultActive: false,
                available: true,
                updateIntervalMs: this.mapSettings.air.refreshIntervalMs,
                cacheTtlMs: Math.max(25 * 1000, Math.min(this.mapSettings.air.refreshIntervalMs - 5 * 1000, 60 * 1000)),
                maxMarkers: this.mapSettings.air.maxMarkers,
                boundsMode: this.mapSettings.air.boundsMode,
                zIndex: 45,
                fallbackVisual: "OpenSky status/readout with no fake aircraft markers.",
                mode: "live"
            },
            {
                id: "MARITIME_AIS",
                label: "SEA",
                name: "Maritime AIS",
                description: "Live AIS vessel messages from a configured provider.",
                providerType: "AISStream WebSocket",
                providerCandidates: ["AISStream"],
                requiresApiKey: true,
                defaultActive: false,
                available: true,
                updateIntervalMs: 0,
                cacheTtlMs: 0,
                maxMarkers: this.mapSettings.sea.maxVessels,
                areaMode: this.mapSettings.sea.areaMode,
                refreshIntervalMs: this.mapSettings.sea.refreshIntervalMs,
                clusterVessels: this.mapSettings.sea.clusterVessels,
                showLabels: this.mapSettings.sea.showLabels,
                showWake: this.mapSettings.sea.showWake,
                zIndex: 42,
                fallbackVisual: "CONFIG_REQUIRED until AISSTREAM_API_KEY is configured.",
                mode: "live"
            },
            {
                id: "MARINE_WEATHER",
                label: "MARINE",
                name: "Marine weather",
                description: "Open-Meteo Marine sea-state conditions from real ocean forecast cells.",
                providerType: "Open-Meteo Marine",
                providerCandidates: ["Open-Meteo Marine"],
                requiresApiKey: false,
                defaultActive: Boolean(this.mapSettings.marineWeather.active),
                available: true,
                updateIntervalMs: 15 * 60 * 1000,
                cacheTtlMs: 15 * 60 * 1000,
                maxMarkers: this.mapSettings.marineWeather.maxMarkers,
                mode: this.mapSettings.marineWeather.mode,
                preset: this.mapSettings.marineWeather.preset,
                zIndex: 39,
                fallbackVisual: "NO_MARINE_CELL_IN_VIEW or real Open-Meteo Marine markers.",
                source: "open-meteo"
            },
            {
                id: "SATELLITES",
                label: "SAT",
                name: "Satellites",
                description: "Real CelesTrak GP catalog data propagated with SGP4 satellite positions.",
                providerType: "CelesTrak GP JSON + SGP4",
                providerCandidates: ["CelesTrak GP JSON", "satellite.js SGP4"],
                requiresApiKey: false,
                defaultActive: false,
                available: true,
                updateIntervalMs: 6 * 60 * 60 * 1000,
                positionUpdateIntervalMs: 60 * 1000,
                cacheTtlMs: 6 * 60 * 60 * 1000,
                defaultGroup: this.mapSettings.satellite.group,
                maxOrbitObjects: satelliteLimits.maxOrbitObjects,
                maxMarkers: satelliteLimits.maxMarkers,
                zIndex: 40,
                fallbackVisual: "SERVICE_UNAVAILABLE, POSITION_ENGINE_ERROR or NO_DATA when real positions cannot be calculated.",
                mode: "live"
            },
            {
                id: "OCEAN_ALERTS",
                label: "OCEAN",
                name: "Ocean alerts",
                description: "NOAA/NDBC active stations and buoy metadata in the visible map area.",
                providerType: "NOAA NDBC active stations",
                providerCandidates: ["NOAA NDBC / DART"],
                requiresApiKey: false,
                defaultActive: false,
                available: true,
                updateIntervalMs: 10 * 60 * 1000,
                cacheTtlMs: 10 * 60 * 1000,
                maxMarkers: this.mapSettings.ocean.maxStations,
                source: this.mapSettings.ocean.source,
                filterMode: this.mapSettings.ocean.filterMode,
                zIndex: 38,
                fallbackVisual: "NO_DATA when no NOAA station exists in the current map view.",
                mode: "live"
            }
        ];
    }

    initializeLayerRegistry() {
        this.layerRegistry = new MapLayerRegistry({
            definitions: this.layerDefinitions,
            preferences: this.layerPreferences,
            context: {
                map: this.map,
                L,
                ipc: this.ipc,
                offlineMode: () => this.offlineMode,
                getTrafficKey: () => this.getTrafficKey(),
                onTrafficKeyRequired: () => this.showTrafficForm(),
                getEnv: name => this.getEnv(name)
            },
            onLayerChange: () => this.renderLayerState()
        });
        this.layers = this.layerRegistry.layers;
    }

    loadLayerPreferences() {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.layerStorageKey) || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    saveLayerPreferences() {
        const data = this.layerRegistry ? this.layerRegistry.serialize() : {};
        try {
            localStorage.setItem(this.layerStorageKey, JSON.stringify(data));
        } catch (error) {}
        if (this.ipc && this.ipc.invoke) {
            this.ipc.invoke("map-layers-save", {
                version: 1,
                storageKey: this.layerStorageKey,
                layers: data
            }).catch(() => {});
        }
    }

    applyMapSettingsToRegistry() {
        if (!this.layers) return;
        const satelliteLimits = this.getSatelliteLimits();
        const updates = {
            ROAD_TRAFFIC: {
                definition: {
                    provider: this.mapSettings.traffic.provider,
                    preset: this.mapSettings.traffic.preset,
                    updateIntervalMs: 90 * 1000,
                    opacity: this.mapSettings.traffic.opacity
                },
                opacity: this.mapSettings.traffic.opacity
            },
            WEATHER_RADAR: {
                definition: {
                    provider: this.mapSettings.radar.provider,
                    opacity: this.mapSettings.radar.opacity,
                    seaCoverage: this.mapSettings.radar.seaCoverage
                },
                opacity: this.mapSettings.radar.opacity
            },
            AIR_TRAFFIC: {
                definition: {
                    maxMarkers: this.mapSettings.air.maxMarkers,
                    updateIntervalMs: this.mapSettings.air.refreshIntervalMs,
                    cacheTtlMs: Math.max(25 * 1000, Math.min(this.mapSettings.air.refreshIntervalMs - 5 * 1000, 60 * 1000)),
                    boundsMode: this.mapSettings.air.boundsMode
                }
            },
            MARITIME_AIS: {
                definition: {
                    maxMarkers: this.mapSettings.sea.maxVessels,
                    areaMode: this.mapSettings.sea.areaMode,
                    refreshIntervalMs: this.mapSettings.sea.refreshIntervalMs,
                    clusterVessels: this.mapSettings.sea.clusterVessels,
                    showLabels: this.mapSettings.sea.showLabels,
                    showWake: this.mapSettings.sea.showWake
                }
            },
            MARINE_WEATHER: {
                definition: {
                    maxMarkers: this.mapSettings.marineWeather.maxMarkers,
                    mode: this.mapSettings.marineWeather.mode,
                    preset: this.mapSettings.marineWeather.preset
                }
            },
            SATELLITES: {
                definition: {
                    defaultGroup: this.mapSettings.satellite.group,
                    maxOrbitObjects: satelliteLimits.maxOrbitObjects,
                    maxMarkers: satelliteLimits.maxMarkers
                }
            },
            OCEAN_ALERTS: {
                definition: {
                    maxMarkers: this.mapSettings.ocean.maxStations,
                    source: this.mapSettings.ocean.source,
                    filterMode: this.mapSettings.ocean.filterMode
                }
            }
        };

        Object.entries(updates).forEach(([id, config]) => {
            const layer = this.layers.get(id);
            if (!layer) return;
            Object.assign(layer.definition, config.definition || {});
            if (config.opacity !== undefined) layer.opacity = config.opacity;
            if (layer.provider) layer.provider.definition = layer.definition;
        });
    }

    settingsChangedLayerIds(previousSettings = {}) {
        const before = this.sanitizeMapSettings(previousSettings);
        const after = this.mapSettings;
        const changed = new Set();

        if (JSON.stringify(before.baseMap) !== JSON.stringify(after.baseMap)) changed.add("BASE_MAP");
        if (JSON.stringify(before.satellite) !== JSON.stringify(after.satellite)) changed.add("SATELLITES");
        if (JSON.stringify(before.air) !== JSON.stringify(after.air)) changed.add("AIR_TRAFFIC");
        if (JSON.stringify(before.sea) !== JSON.stringify(after.sea)) changed.add("MARITIME_AIS");
        if (JSON.stringify(before.marineWeather) !== JSON.stringify(after.marineWeather)) changed.add("MARINE_WEATHER");
        if (JSON.stringify(before.ocean) !== JSON.stringify(after.ocean)) changed.add("OCEAN_ALERTS");
        if (JSON.stringify(before.radar) !== JSON.stringify(after.radar)) changed.add("WEATHER_RADAR");
        if (JSON.stringify(before.traffic) !== JSON.stringify(after.traffic)) changed.add("ROAD_TRAFFIC");

        return changed;
    }

    restartLayer(id) {
        const layer = this.layers.get(id);
        if (!layer || !layer.active) return;
        this.layerRegistry.deactivate(id);
        this.layerRegistry.activate(id, {persist: false, userInitiated: false}).finally(() => {
            this.saveLayerPreferences();
            this.renderLayerState();
        });
    }

    applySavedMapSettings(previousSettings = {}, requestedActive = {}) {
        const changed = this.settingsChangedLayerIds(previousSettings);
        this.applyMapSettingsToRegistry();
        if (changed.has("BASE_MAP")) this.applyBaseMapProvider();

        this.layers.forEach((layer, id) => {
            if (!Object.prototype.hasOwnProperty.call(requestedActive, id)) return;
            const shouldBeActive = Boolean(requestedActive[id]);
            if (shouldBeActive && !layer.active) {
                this.activateLayer(id, {persist: false, userInitiated: true});
                return;
            }
            if (!shouldBeActive && layer.active) {
                this.deactivateLayer(id, {persist: false});
                return;
            }
            if (shouldBeActive && layer.active && changed.has(id)) this.restartLayer(id);
        });

        this.saveLayerPreferences();
        this.renderLayerState();
    }

    async syncLayerPreferencesFile() {
        if (this.hasLocalLayerPreferences) {
            this.saveLayerPreferences();
            return;
        }

        try {
            const response = await this.ipc.invoke("map-layers-read");
            const fileLayers = response && response.ok && response.data && response.data.layers;
            if (!fileLayers || typeof fileLayers !== "object") return;

            Object.entries(fileLayers).forEach(([id, preferences]) => {
                const layer = this.layers.get(id);
                if (!layer || !preferences || typeof preferences !== "object") return;

                const opacity = Number(preferences.opacity);
                if (Number.isFinite(opacity)) layer.opacity = Math.max(0, Math.min(1, opacity));

                if (typeof preferences.active !== "boolean" || preferences.active === layer.active) return;
                if (preferences.active) this.activateLayer(id, {persist: false, userInitiated: false});
                else this.deactivateLayer(id, {persist: false});
            });
            this.saveLayerPreferences();
        } catch (error) {}
    }

    renderLayerControls() {
        this.controls.innerHTML = "";
        this.layers.forEach(layer => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "eng-map-layer-toggle";
            button.dataset.layer = layer.definition.id;
            button.title = `${layer.definition.name} · ${layer.definition.description}`;
            button.innerHTML = `
                <strong>${window._escapeHtml(layer.definition.label)}</strong>
                <small>${layer.status}</small>`;
            button.addEventListener("click", () => this.toggleLayer(layer.definition.id, true));
            this.controls.appendChild(button);
        });
        this.renderLayerState();
    }

    layerStatus(id) {
        const layer = this.layers && this.layers.get(id);
        if (!layer) return {status: MAP_LAYER_STATES.DISABLED, summary: "Layer unavailable", active: false};
        return {
            status: layer.status,
            summary: layer.summary || layer.definition.description,
            active: layer.active,
            count: layer.count || 0,
            updatedAt: layer.updatedAt || ""
        };
    }

    renderLayerSwitch(id, label) {
        const layer = this.layers.get(id);
        const status = this.layerStatus(id);
        return `
            <label class="eng-map-settings-switch">
                <input type="checkbox" data-layer-active="${window._escapeHtml(id)}" ${status.active ? "checked" : ""}>
                <span>${window._escapeHtml(label)}</span>
                <em data-state="${window._escapeHtml(status.status)}">${window._escapeHtml(status.status)}</em>
                <small>${window._escapeHtml(status.summary || layer.definition.providerType)}</small>
            </label>`;
    }

    mapSettingsOptions(options, selected) {
        return options.map(option => {
            const value = typeof option === "string" ? option : option.value;
            const label = typeof option === "string" ? option : option.label;
            return `<option value="${window._escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${window._escapeHtml(label)}</option>`;
        }).join("");
    }

    mapOptionLabel(options, selected) {
        const match = options.find(option => String(typeof option === "string" ? option : option.value) === String(selected));
        if (!match) return String(selected || "");
        return typeof match === "string" ? match : match.label;
    }

    renderCockpitSelect(id, options, selected) {
        const selectedLabel = this.mapOptionLabel(options, selected);
        return `
            <div class="eng-cockpit-select" data-cockpit-select="${window._escapeHtml(id)}">
                <input type="hidden" id="${window._escapeHtml(id)}" value="${window._escapeHtml(String(selected))}">
                <button type="button" class="eng-cockpit-select-trigger" aria-haspopup="listbox" aria-expanded="false">
                    <span>${window._escapeHtml(selectedLabel)}</span>
                    <em>▾</em>
                </button>
                <div class="eng-cockpit-select-menu" role="listbox">
                    ${options.map(option => {
                        const value = typeof option === "string" ? option : option.value;
                        const label = typeof option === "string" ? option : option.label;
                        const description = typeof option === "string" ? "" : (option.description || "");
                        return `
                            <button type="button" role="option" data-value="${window._escapeHtml(String(value))}" ${String(value) === String(selected) ? "aria-selected=\"true\"" : ""}>
                                <strong>${window._escapeHtml(label)}</strong>
                                ${description ? `<small>${window._escapeHtml(description)}</small>` : ""}
                            </button>`;
                    }).join("")}
                </div>
            </div>`;
    }

    bindCockpitSelects(overlay) {
        const closeAll = except => {
            overlay.querySelectorAll(".eng-cockpit-select.open").forEach(select => {
                if (select === except) return;
                select.classList.remove("open");
                const trigger = select.querySelector(".eng-cockpit-select-trigger");
                if (trigger) trigger.setAttribute("aria-expanded", "false");
            });
        };

        overlay.querySelectorAll(".eng-cockpit-select").forEach(select => {
            const input = select.querySelector("input[type='hidden']");
            const trigger = select.querySelector(".eng-cockpit-select-trigger");
            const label = trigger && trigger.querySelector("span");
            if (!input || !trigger) return;

            trigger.addEventListener("click", event => {
                event.preventDefault();
                const shouldOpen = !select.classList.contains("open");
                closeAll(select);
                select.classList.toggle("open", shouldOpen);
                trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
            });

            select.querySelectorAll(".eng-cockpit-select-menu button[data-value]").forEach(option => {
                option.addEventListener("click", event => {
                    event.preventDefault();
                    input.value = option.dataset.value || "";
                    if (label) label.innerText = option.querySelector("strong").innerText;
                    select.querySelectorAll("[aria-selected]").forEach(node => node.removeAttribute("aria-selected"));
                    option.setAttribute("aria-selected", "true");
                    select.classList.remove("open");
                    trigger.setAttribute("aria-expanded", "false");
                    input.dispatchEvent(new Event("change", {bubbles: true}));
                });
            });

            select.addEventListener("keydown", event => {
                const options = Array.from(select.querySelectorAll(".eng-cockpit-select-menu button[data-value]"));
                const selectedIndex = Math.max(0, options.findIndex(option => option.getAttribute("aria-selected") === "true"));
                if (event.key === "Escape") {
                    select.classList.remove("open");
                    trigger.setAttribute("aria-expanded", "false");
                    event.stopPropagation();
                    return;
                }
                if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
                event.preventDefault();
                if (event.key === "Enter" || event.key === " ") {
                    trigger.click();
                    return;
                }
                const nextIndex = event.key === "ArrowDown"
                    ? Math.min(options.length - 1, selectedIndex + 1)
                    : Math.max(0, selectedIndex - 1);
                if (options[nextIndex]) options[nextIndex].click();
            });
        });

        overlay.addEventListener("click", event => {
            if (!event.target.closest(".eng-cockpit-select")) closeAll();
        });
        overlay.addEventListener("keydown", event => {
            if (event.key === "Escape" && overlay.querySelector(".eng-cockpit-select.open")) {
                closeAll();
                event.stopPropagation();
            }
        });
    }

    settingValue(overlay, id) {
        const element = overlay.querySelector(`#${id}`);
        return element ? element.value : "";
    }

    refreshSettingsStatusBadges() {
        if (!this.settingsOverlay) return;
        const tomtom = this.settingsOverlay.querySelector("#eng_setting_tomtom_status");
        if (tomtom) {
            const diag = this.tomTomDiagnostic || {};
            tomtom.classList.toggle("ready", diag.keyStatus === "CONFIGURED" && diag.serviceStatus === "ONLINE");
            tomtom.classList.toggle("missing", diag.keyStatus === "MISSING" || diag.keyStatus === "INVALID");
            tomtom.innerHTML = `
                <strong>TOMTOM KEY</strong>
                <span>${window._escapeHtml(diag.keyStatus || "UNKNOWN")} ${diag.last4 ? `· ${window._escapeHtml(diag.last4)}` : ""}</span>
                <small>TOMTOM SERVICE: ${window._escapeHtml(diag.serviceStatus || "UNKNOWN")} · ${window._escapeHtml(diag.summary || "")}</small>`;
        }
        const base = this.settingsOverlay.querySelector("#eng_setting_base_status");
        if (base) {
            base.innerText = `BASE MAP: ${this.baseMapStatus.provider} · ${this.baseMapStatus.status}`;
        }
    }

    openSettingsModal() {
        this.closeSettingsModal();
        const settings = this.mapSettings;
        const group = MAP_SATELLITE_GROUPS[settings.satellite.group] || MAP_SATELLITE_GROUPS.stations;
        const density = MAP_SATELLITE_DENSITIES[settings.satellite.density] || MAP_SATELLITE_DENSITIES.MEDIUM;
        const hasAisKey = Boolean(this.getEnv("AISSTREAM_API_KEY")
            || this.getEnv("AEGISUI_AISSTREAM_API_KEY")
            || this.getEnv("AEGISUI_AIS_API_KEY"));
        const hasOpenSkyCredentials = Boolean(this.getEnv("OPENSKY_ACCESS_TOKEN")
            || this.getEnv("AEGISUI_OPENSKY_ACCESS_TOKEN")
            || (this.getEnv("OPENSKY_CLIENT_ID") && this.getEnv("OPENSKY_CLIENT_SECRET")));
        const satGroupOptions = Object.entries(MAP_SATELLITE_GROUPS).map(([value, item]) => ({
            value,
            label: `${item.label} · ${value}`,
            description: item.description
        }));
        const satDensityOptions = Object.entries(MAP_SATELLITE_DENSITIES).map(([value, item]) => ({
            value,
            label: `${value} · ${item.maxOrbitObjects}/${item.maxMarkers}`,
            description: item.description
        }));

        const overlay = document.createElement("div");
        overlay.id = "eng_map_settings_overlay";
        overlay.innerHTML = `
            <form id="eng_map_settings_modal" augmented-ui="tl-clip br-clip exe">
                <header class="eng-map-settings-header">
                    <div>
                        <small>LOCAL SITUATION</small>
                        <h1>MAP LAYER SETTINGS</h1>
                    </div>
                    <button type="button" id="eng_map_settings_close" aria-label="Close map settings">×</button>
                </header>
                <div class="eng-map-settings-body">
                    <section class="eng-map-settings-section">
                        <h2>BASE MAP</h2>
                        <div id="eng_setting_tomtom_status" class="eng-map-settings-status ${this.tomTomDiagnostic.keyStatus === "CONFIGURED" ? "ready" : "missing"}">
                            <strong>TOMTOM KEY</strong>
                            <span>${window._escapeHtml(this.tomTomDiagnostic.keyStatus)} ${this.tomTomDiagnostic.last4 ? `· ${window._escapeHtml(this.tomTomDiagnostic.last4)}` : ""}</span>
                            <small>TOMTOM SERVICE: ${window._escapeHtml(this.tomTomDiagnostic.serviceStatus)} · ${window._escapeHtml(this.tomTomDiagnostic.summary || "")}</small>
                        </div>
                        <small id="eng_setting_base_status">BASE MAP: ${window._escapeHtml(this.baseMapStatus.provider)} · ${window._escapeHtml(this.baseMapStatus.status)}</small>
                        <label>
                            <span>Base provider</span>
                            ${this.renderCockpitSelect("eng_setting_base_provider", [
                                {value: "auto", label: "AUTO · TomTom then fallback", description: "Use TomTom when valid; OSM if unavailable."},
                                {value: "tomtom", label: "TomTom primary", description: "Requires a configured TomTom key."},
                                {value: "osm", label: "OSM fallback", description: "No key required; traffic remains TomTom-only."}
                            ], settings.baseMap.provider)}
                        </label>
                        <label class="eng-map-settings-switch">
                            <input id="eng_setting_base_fallback" type="checkbox" ${settings.baseMap.fallbackEnabled ? "checked" : ""}>
                            <span>Fallback base map</span>
                            <em>${settings.baseMap.fallbackEnabled ? "ON" : "OFF"}</em>
                            <small>Fallback is only for base tiles; it does not invent TomTom traffic.</small>
                        </label>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>SATELLITES</h2>
                        ${this.renderLayerSwitch("SATELLITES", "Enable SAT layer")}
                        <label>
                            <span>Satellite Group</span>
                            ${this.renderCockpitSelect("eng_setting_sat_group", satGroupOptions, settings.satellite.group)}
                            <small id="eng_setting_sat_group_help">${window._escapeHtml(group.description)}</small>
                        </label>
                        <label>
                            <span>Density</span>
                            ${this.renderCockpitSelect("eng_setting_sat_density", satDensityOptions, settings.satellite.density)}
                            <small id="eng_setting_sat_density_help">${window._escapeHtml(density.description)}</small>
                        </label>
                        <div class="eng-map-settings-pair">
                            <label>
                                <span>Custom process max</span>
                                <input id="eng_setting_sat_custom_orbits" type="number" min="50" max="5000" step="50" value="${window._escapeHtml(String(settings.satellite.customMaxOrbitObjects))}">
                            </label>
                            <label>
                                <span>Custom marker max</span>
                                <input id="eng_setting_sat_custom_markers" type="number" min="10" max="500" step="10" value="${window._escapeHtml(String(settings.satellite.customMaxMarkers))}">
                            </label>
                        </div>
                        <p class="eng-map-settings-warning">HIGH density is real SGP4 data, but can cost more CPU/GPU on dense groups like ACTIVE or STARLINK.</p>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>AIR TRAFFIC</h2>
                        ${this.renderLayerSwitch("AIR_TRAFFIC", "Enable AIR layer")}
                        <label>
                            <span>Max aircraft markers</span>
                            ${this.renderCockpitSelect("eng_setting_air_max", ["25", "50", "100", "200"], String(settings.air.maxMarkers))}
                        </label>
                        <label>
                            <span>Refresh interval</span>
                            ${this.renderCockpitSelect("eng_setting_air_refresh", [
                                {value: "30000", label: "30s"},
                                {value: "60000", label: "60s"},
                                {value: "120000", label: "120s"}
                            ], String(settings.air.refreshIntervalMs))}
                        </label>
                        <label>
                            <span>Bounding box mode</span>
                            ${this.renderCockpitSelect("eng_setting_air_bounds", [
                                {value: "visible", label: "Visible map bounds"},
                                {value: "wide", label: "Wider area"}
                            ], settings.air.boundsMode)}
                        </label>
                        <small>${hasOpenSkyCredentials ? "OpenSky credentials detected." : "OpenSky public mode · rate-limit aware."}</small>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>MARITIME AIS</h2>
                        ${this.renderLayerSwitch("MARITIME_AIS", "Enable SEA layer")}
                        <div class="eng-map-settings-status ${hasAisKey ? "ready" : "missing"}">
                            <strong>AISStream</strong>
                            <span>${hasAisKey ? "API key configured" : "CONFIG REQUIRED · AISSTREAM_API_KEY missing"}</span>
                        </div>
                        <label>
                            <span>Area mode</span>
                            ${this.renderCockpitSelect("eng_setting_sea_area", [
                                {value: "CURRENT_VIEW", label: "Current View"},
                                {value: "MEDITERRANEAN", label: "Mediterranean"},
                                {value: "GIBRALTAR", label: "Gibraltar"},
                                {value: "NORTH_SEA", label: "North Sea"},
                                {value: "ENGLISH_CHANNEL", label: "English Channel"},
                                {value: "SINGAPORE_STRAIT", label: "Singapore Strait"},
                                {value: "CARIBBEAN", label: "Caribbean"},
                                {value: "US_EAST_COAST", label: "US East Coast"},
                                {value: "US_WEST_COAST", label: "US West Coast"},
                                {value: "JAPAN", label: "Japan"},
                                {value: "AUSTRALIA_EAST", label: "Australia East"},
                                {value: "WORLD_SAMPLE", label: "World Sample"}
                            ], settings.sea.areaMode)}
                        </label>
                        <label>
                            <span>Max visible vessels</span>
                            ${this.renderCockpitSelect("eng_setting_sea_max", ["50", "100", "150", "250"], String(settings.sea.maxVessels))}
                        </label>
                        <label>
                            <span>Refresh interval</span>
                            ${this.renderCockpitSelect("eng_setting_sea_refresh", [
                                {value: "60000", label: "60s"},
                                {value: "120000", label: "120s"},
                                {value: "300000", label: "300s"}
                            ], String(settings.sea.refreshIntervalMs))}
                        </label>
                        <label class="eng-map-checkbox">
                            <input type="checkbox" id="eng_setting_sea_cluster" ${settings.sea.clusterVessels ? "checked" : ""}>
                            <span>Cluster vessels</span>
                        </label>
                        <label class="eng-map-checkbox">
                            <input type="checkbox" id="eng_setting_sea_labels" ${settings.sea.showLabels ? "checked" : ""}>
                            <span>Show vessel labels</span>
                        </label>
                        <label class="eng-map-checkbox">
                            <input type="checkbox" id="eng_setting_sea_wake" ${settings.sea.showWake ? "checked" : ""}>
                            <span>Show heading wake</span>
                        </label>
                        <button type="button" id="eng_setting_sea_test">TEST CONNECTION</button>
                        <small id="eng_setting_sea_test_result">No WebSocket is opened unless SEA is enabled.</small>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>MARINE WEATHER</h2>
                        ${this.renderLayerSwitch("MARINE_WEATHER", "Enable MARINE WX layer")}
                        <div class="eng-map-settings-status ready">
                            <strong>Open-Meteo Marine</strong>
                            <span>NO API KEY REQUIRED</span>
                            <small>Sea-state forecast cells; separate from AIS vessels and precipitation radar.</small>
                        </div>
                        <label>
                            <span>Mode</span>
                            ${this.renderCockpitSelect("eng_setting_marine_mode", [
                                {value: "visible", label: "Visible sea cells", description: "Shows NO_MARINE_CELL_IN_VIEW inland."},
                                {value: "nearest", label: "Nearest sea cell", description: "Queries nearest sea cell around map center."},
                                {value: "preset", label: "Preset area", description: "Uses configured maritime preset."}
                            ], settings.marineWeather.mode)}
                        </label>
                        <label>
                            <span>Preset</span>
                            ${this.renderCockpitSelect("eng_setting_marine_preset", [
                                {value: "NEAREST_SEA", label: "Nearest Sea"},
                                {value: "IBERIAN_ATLANTIC", label: "Iberian Atlantic"},
                                {value: "BAY_OF_BISCAY", label: "Bay of Biscay"},
                                {value: "MEDITERRANEAN_WEST", label: "Mediterranean West"},
                                {value: "GIBRALTAR", label: "Gibraltar"},
                                {value: "BALEARIC_SEA", label: "Balearic Sea"},
                                {value: "NORTH_ATLANTIC", label: "North Atlantic"},
                                {value: "CARIBBEAN", label: "Caribbean"}
                            ], settings.marineWeather.preset)}
                        </label>
                        <label>
                            <span>Max marine markers</span>
                            ${this.renderCockpitSelect("eng_setting_marine_max", ["1", "4", "8", "12"], String(settings.marineWeather.maxMarkers))}
                        </label>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>OCEAN / NOAA</h2>
                        ${this.renderLayerSwitch("OCEAN_ALERTS", "Enable OCEAN layer")}
                        <label>
                            <span>Station source</span>
                            ${this.renderCockpitSelect("eng_setting_ocean_source", [
                                {value: "ndbc-active", label: "NDBC active stations"},
                                {value: "dart", label: "DART tsunami buoys"}
                            ], settings.ocean.source)}
                        </label>
                        <label>
                            <span>Filter mode</span>
                            ${this.renderCockpitSelect("eng_setting_ocean_filter", [
                                {value: "visible", label: "Visible map bounds"},
                                {value: "global", label: "Global"},
                                {value: "coastal", label: "Coastal only"}
                            ], settings.ocean.filterMode)}
                        </label>
                        <label>
                            <span>Max stations</span>
                            ${this.renderCockpitSelect("eng_setting_ocean_max", ["100", "500", "1500"], String(settings.ocean.maxStations))}
                        </label>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>RADAR / TRAFFIC</h2>
                        ${this.renderLayerSwitch("WEATHER_RADAR", "Enable RADAR layer")}
                        <label>
                            <span>Radar provider</span>
                            ${this.renderCockpitSelect("eng_setting_radar_provider", [
                                {value: "auto", label: "AUTO · RainViewer"},
                                {value: "rainviewer", label: "RainViewer precip"}
                            ], settings.radar.provider)}
                        </label>
                        <label>
                            <span>Radar opacity</span>
                            <input id="eng_setting_radar_opacity" type="range" min="0.15" max="0.95" step="0.05" value="${window._escapeHtml(String(settings.radar.opacity))}">
                            <small>Radar precip coverage depends on RainViewer mosaic; marine conditions are handled by Marine Weather.</small>
                        </label>
                        ${this.renderLayerSwitch("ROAD_TRAFFIC", "Enable TRAFFIC layer")}
                        <label>
                            <span>Traffic provider</span>
                            ${this.renderCockpitSelect("eng_setting_traffic_provider", [
                                {value: "auto", label: "Auto · tiles then segments"},
                                {value: "tomtom-tiles", label: "TomTom Tiles"},
                                {value: "tomtom-segments", label: "TomTom Segments"}
                            ], settings.traffic.provider)}
                        </label>
                        <label>
                            <span>Traffic preset</span>
                            ${this.renderCockpitSelect("eng_setting_traffic_preset", [
                                {value: "CURRENT_VIEW", label: "Current View"},
                                {value: "MADRID", label: "Madrid"},
                                {value: "LONDON", label: "London"},
                                {value: "PARIS", label: "Paris"}
                            ], settings.traffic.preset)}
                        </label>
                        <label>
                            <span>Traffic opacity</span>
                            <input id="eng_setting_traffic_opacity" type="range" min="0.25" max="1" step="0.05" value="${window._escapeHtml(String(settings.traffic.opacity))}">
                        </label>
                        <button type="button" id="eng_setting_traffic_test">TEST TOMTOM</button>
                        <small id="eng_setting_traffic_test_result">Runs real TomTom traffic diagnostics; key is never printed.</small>
                        <small>Traffic remains TomTom-only and requires a valid TomTom key.</small>
                    </section>

                    <section class="eng-map-settings-section">
                        <h2>CONTROLS / PRIVACY</h2>
                        <label class="eng-map-settings-switch">
                            <input id="eng_setting_ui_sounds" type="checkbox" ${settings.uiSounds ? "checked" : ""}>
                            <span>UI sounds</span>
                            <em>${settings.uiSounds ? "ON" : "OFF"}</em>
                            <small>Uses the local cockpit expand sound at low volume.</small>
                        </label>
                        <label>
                            <span>Default map location</span>
                            ${this.renderCockpitSelect("eng_setting_location_mode", [
                                {value: "current", label: "Current location when allowed"},
                                {value: "custom", label: "Custom local coordinates"},
                                {value: "city", label: "City default"}
                            ], settings.defaultLocation.mode)}
                        </label>
                        <div class="eng-map-settings-pair">
                            <label>
                                <span>Custom latitude</span>
                                <input id="eng_setting_location_lat" type="number" step="0.000001" value="${window._escapeHtml(settings.defaultLocation.customLat)}">
                            </label>
                            <label>
                                <span>Custom longitude</span>
                                <input id="eng_setting_location_lon" type="number" step="0.000001" value="${window._escapeHtml(settings.defaultLocation.customLon)}">
                            </label>
                        </div>
                        <small>Coordinates are stored only in localStorage on this Mac, never in Git.</small>
                    </section>
                </div>
                <footer class="eng-map-settings-footer">
                    <span id="eng_map_settings_state">LOCAL SETTINGS ONLY · NO API KEYS STORED HERE</span>
                    <button type="button" id="eng_map_settings_cancel">CANCEL</button>
                    <button type="submit" class="primary">SAVE / APPLY</button>
                </footer>
            </form>`;

        document.body.appendChild(overlay);
        this.settingsOverlay = overlay;
        this.bindSettingsModalEvents(overlay);
        if (window.audioManager && window.audioManager.panels && this.mapSettings.uiSounds) {
            window.audioManager.panels.play();
        }
    }

    bindSettingsModalEvents(overlay) {
        const close = () => this.closeSettingsModal();
        this.bindCockpitSelects(overlay);
        this.refreshSettingsStatusBadges();
        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });
        overlay.querySelector("#eng_map_settings_close").addEventListener("click", close);
        overlay.querySelector("#eng_map_settings_cancel").addEventListener("click", close);

        overlay.querySelector("#eng_setting_sat_group").addEventListener("change", event => {
            const item = MAP_SATELLITE_GROUPS[event.target.value] || MAP_SATELLITE_GROUPS.stations;
            overlay.querySelector("#eng_setting_sat_group_help").innerText = item.description;
        });
        overlay.querySelector("#eng_setting_sat_density").addEventListener("change", event => {
            const item = MAP_SATELLITE_DENSITIES[event.target.value] || MAP_SATELLITE_DENSITIES.MEDIUM;
            overlay.querySelector("#eng_setting_sat_density_help").innerText = item.description;
        });
        overlay.querySelector("#eng_setting_sea_test").addEventListener("click", () => {
            const result = overlay.querySelector("#eng_setting_sea_test_result");
            const hasKey = Boolean(this.getEnv("AISSTREAM_API_KEY")
                || this.getEnv("AEGISUI_AISSTREAM_API_KEY")
                || this.getEnv("AEGISUI_AIS_API_KEY"));
            result.innerText = hasKey
                ? "CONFIG READY · enable SEA to open AISStream safely."
                : "CONFIG_REQUIRED · add AISSTREAM_API_KEY in your private environment.";
        });
        overlay.querySelector("#eng_setting_traffic_test").addEventListener("click", async () => {
            const result = overlay.querySelector("#eng_setting_traffic_test_result");
            result.innerText = "Testing TomTom traffic endpoints…";
            try {
                const layer = this.layers.get("ROAD_TRAFFIC");
                const provider = layer && layer.provider;
                const diagnostic = provider && provider.runTomTomTrafficDiagnostics
                    ? await provider.runTomTomTrafficDiagnostics(this.layerRegistry.buildContext("ROAD_TRAFFIC"), this.getTrafficKey())
                    : null;
                result.innerText = diagnostic
                    ? `TRAFFIC ${diagnostic.status || "UNKNOWN"} · ${diagnostic.mode || "OFFLINE"} · ${diagnostic.summary || ""}`
                    : "TRAFFIC diagnostic unavailable";
            } catch (error) {
                result.innerText = `TRAFFIC ERROR · ${error.message || "diagnostic failed"}`;
            }
        });

        overlay.querySelector("#eng_map_settings_modal").addEventListener("submit", event => {
            event.preventDefault();
            this.saveSettingsFromModal(overlay);
        });
    }

    closeSettingsModal() {
        if (!this.settingsOverlay) return;
        this.settingsOverlay.remove();
        this.settingsOverlay = null;
    }

    saveSettingsFromModal(overlay) {
        const previousSettings = cloneMapData(this.mapSettings);
        const requestedActive = {};
        overlay.querySelectorAll("[data-layer-active]").forEach(input => {
            requestedActive[input.dataset.layerActive] = Boolean(input.checked);
        });

        this.mapSettings = this.sanitizeMapSettings({
            baseMap: {
                provider: this.settingValue(overlay, "eng_setting_base_provider"),
                fallbackEnabled: overlay.querySelector("#eng_setting_base_fallback").checked
            },
            satellite: {
                group: this.settingValue(overlay, "eng_setting_sat_group"),
                density: this.settingValue(overlay, "eng_setting_sat_density"),
                customMaxOrbitObjects: overlay.querySelector("#eng_setting_sat_custom_orbits").value,
                customMaxMarkers: overlay.querySelector("#eng_setting_sat_custom_markers").value
            },
            air: {
                maxMarkers: this.settingValue(overlay, "eng_setting_air_max"),
                refreshIntervalMs: this.settingValue(overlay, "eng_setting_air_refresh"),
                boundsMode: this.settingValue(overlay, "eng_setting_air_bounds")
            },
            sea: {
                areaMode: this.settingValue(overlay, "eng_setting_sea_area"),
                maxVessels: this.settingValue(overlay, "eng_setting_sea_max"),
                refreshIntervalMs: this.settingValue(overlay, "eng_setting_sea_refresh"),
                clusterVessels: Boolean(overlay.querySelector("#eng_setting_sea_cluster") && overlay.querySelector("#eng_setting_sea_cluster").checked),
                showLabels: Boolean(overlay.querySelector("#eng_setting_sea_labels") && overlay.querySelector("#eng_setting_sea_labels").checked),
                showWake: Boolean(overlay.querySelector("#eng_setting_sea_wake") && overlay.querySelector("#eng_setting_sea_wake").checked)
            },
            marineWeather: {
                active: Boolean(requestedActive.MARINE_WEATHER),
                mode: this.settingValue(overlay, "eng_setting_marine_mode"),
                preset: this.settingValue(overlay, "eng_setting_marine_preset"),
                maxMarkers: this.settingValue(overlay, "eng_setting_marine_max")
            },
            ocean: {
                source: this.settingValue(overlay, "eng_setting_ocean_source"),
                filterMode: this.settingValue(overlay, "eng_setting_ocean_filter"),
                maxStations: this.settingValue(overlay, "eng_setting_ocean_max")
            },
            radar: {
                provider: this.settingValue(overlay, "eng_setting_radar_provider"),
                opacity: overlay.querySelector("#eng_setting_radar_opacity").value
            },
            traffic: {
                provider: this.settingValue(overlay, "eng_setting_traffic_provider"),
                preset: this.settingValue(overlay, "eng_setting_traffic_preset"),
                opacity: overlay.querySelector("#eng_setting_traffic_opacity").value
            },
            uiSounds: overlay.querySelector("#eng_setting_ui_sounds").checked,
            defaultLocation: {
                mode: this.settingValue(overlay, "eng_setting_location_mode"),
                customLat: overlay.querySelector("#eng_setting_location_lat").value,
                customLon: overlay.querySelector("#eng_setting_location_lon").value
            }
        });

        this.saveMapSettings();
        this.applySavedMapSettings(previousSettings, requestedActive);
        this.closeSettingsModal();
    }

    applyInitialLayerState() {
        this.layers.forEach(layer => {
            if (this.offlineMode) {
                layer.active = false;
                layer.status = MAP_LAYER_STATES.OFFLINE;
            }
            if (layer.active) this.activateLayer(layer.definition.id, {persist: false, userInitiated: false});
            else this.deactivateLayer(layer.definition.id, {persist: false});
        });
        this.renderLayerState();
    }

    toggleLayer(id, userInitiated = false) {
        const layer = this.layers.get(id);
        if (!layer) return;
        if (layer.active) {
            this.deactivateLayer(id, {persist: true});
        } else {
            this.activateLayer(id, {persist: true, userInitiated});
        }
    }

    activateLayer(id, options = {}) {
        if (!this.layerRegistry) return;
        this.layerRegistry.activate(id, options).finally(() => {
            if (options.persist !== false) this.saveLayerPreferences();
            this.renderLayerState();
        });
    }

    deactivateLayer(id, options = {}) {
        if (!this.layerRegistry) return;
        this.layerRegistry.deactivate(id);
        if (options.persist !== false) this.saveLayerPreferences();
        this.renderLayerState();
    }

    async loadRuntimeConfig() {
        try {
            const config = await this.ipc.invoke("runtime-config");
            if (config && config.tomtomApiKey) {
                this.trafficKey = config.tomtomApiKey;
                this.tomTomDiagnostic = {
                    keyStatus: config.tomtomKeyStatus || "CONFIGURED",
                    serviceStatus: "UNKNOWN",
                    last4: config.tomtomKeyLast4 || maskMapSecret(config.tomtomApiKey),
                    summary: "TomTom key loaded from runtime config"
                };
                this.applyBaseMapProvider();
                const layer = this.layers.get("ROAD_TRAFFIC");
                const hasSavedTrafficPreference = Object.prototype.hasOwnProperty.call(
                    this.layerPreferences,
                    "ROAD_TRAFFIC"
                );
                if (layer && (layer.active || !hasSavedTrafficPreference)) {
                    layer.active = true;
                    this.activateLayer("ROAD_TRAFFIC", {persist: false, userInitiated: false});
                    this.saveLayerPreferences();
                }
            }
            if (config && config.offlineMode && !this.offlineMode) {
                this.offlineMode = true;
                this.status.innerText = "OFFLINE MODE · LOCAL DATA";
                this.layers.forEach(layer => {
                    this.deactivateLayer(layer.definition.id, {persist: true});
                });
            }
        } catch (error) {}
    }

    getTrafficKey() {
        return this.getEnv("TOMTOM_API_KEY")
            || this.getEnv("AEGISUI_TOMTOM_API_KEY")
            || this.getEnv("TOMTOM_KEY")
            || this.getEnv("VITE_TOMTOM_API_KEY")
            || this.getEnv("REACT_APP_TOMTOM_API_KEY")
            || this.trafficKey
            || window.settings.tomtomApiKey
            || "";
    }

    getEnv(name) {
        if (!name) return "";
        if (typeof process !== "undefined" && process.env && process.env[name]) return process.env[name];
        if (this.localEnv && this.localEnv[name]) return this.localEnv[name];
        return "";
    }

    loadLocalEnvSnapshot() {
        try {
            const fs = require("fs");
            const path = require("path");
            let userDataDir = "";
            try {
                userDataDir = require("@electron/remote").app.getPath("userData");
            } catch (error) {}
            const roots = Array.from(new Set([
                typeof process !== "undefined" && process.cwd ? process.cwd() : "",
                userDataDir,
                __dirname,
                path.join(__dirname, ".."),
                path.join(__dirname, "..", "..")
            ].filter(Boolean)));
            const candidates = roots.flatMap(root => [
                path.join(root, ".env.local"),
                path.join(root, ".env")
            ]);
            const values = {};
            candidates.forEach(file => {
                if (!fs.existsSync(file)) return;
                fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(raw => {
                    const line = raw.trim();
                    if (!line || line.startsWith("#") || !line.includes("=")) return;
                    const index = line.indexOf("=");
                    const key = line.slice(0, index).trim();
                    let value = line.slice(index + 1).trim();
                    if ((value.startsWith("\"") && value.endsWith("\""))
                        || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (key && value && !values[key]) values[key] = value;
                });
            });
            return values;
        } catch (error) {
            return {};
        }
    }

    layerDisplayStatus(layer) {
        if (!layer) return MAP_LAYER_STATES.DISABLED;
        const summary = String(layer.summary || "");
        if (layer.status === MAP_LAYER_STATES.ONLINE) {
            if (layer.definition.id === "ROAD_TRAFFIC") {
                if (/segment/i.test(summary)) return "ONLINE / SEGMENTS";
                if (/tile/i.test(summary)) return "ONLINE / TILES";
                return "ONLINE";
            }
            if (layer.definition.id === "MARITIME_AIS") {
                if (/current view/i.test(summary)) return "ONLINE / CURRENT VIEW";
                if (/world sample/i.test(summary)) return "ONLINE / WORLD SAMPLE";
                if (/visible/i.test(summary) || /buffered/i.test(summary)) return "ONLINE / AISSTREAM";
                return "ONLINE / AISSTREAM";
            }
            if (layer.definition.id === "WEATHER_RADAR") return "ONLINE / RAINVIEWER";
            if (layer.definition.id === "MARINE_WEATHER") return "ONLINE / OPEN-METEO";
        }
        if (layer.definition.id === "MARITIME_AIS" && layer.status === MAP_LAYER_STATES.CONFIG_REQUIRED) {
            return "GLOBAL KEY REQUIRED";
        }
        if (layer.definition.id === "MARITIME_AIS" && layer.status === MAP_LAYER_STATES.NO_DATA) {
            return "NO VESSELS";
        }
        if (layer.definition.id === "WEATHER_RADAR" && layer.status === MAP_LAYER_STATES.NO_DATA) {
            return "NO PRECIP";
        }
        if (layer.definition.id === "MARINE_WEATHER" && layer.status === MAP_LAYER_STATES.NO_DATA) {
            return "NO SEA CELL";
        }
        if (layer.definition.id === "ROAD_TRAFFIC" && layer.status === MAP_LAYER_STATES.API_KEY_INVALID) {
            return "KEY_INVALID";
        }
        return layer.status;
    }

    renderLayerState() {
        this.layers.forEach(layer => {
            const button = this.controls.querySelector(`[data-layer="${layer.definition.id}"]`);
            if (!button) return;
            button.classList.toggle("active", layer.active);
            button.classList.toggle("placeholder", false);
            button.classList.toggle("error", statusNeedsAttention(layer.status));
            button.classList.toggle("informative", statusIsInformative(layer.status));
            button.dataset.state = layer.status;
            button.title = `${layer.definition.name} · ${layer.summary || layer.definition.description}`;
            const state = button.querySelector("small");
            if (state) state.innerText = this.layerDisplayStatus(layer);
        });

        const active = Array.from(this.layers.values()).filter(layer => layer.active);
        const online = active.filter(layer => layer.status === MAP_LAYER_STATES.ONLINE).map(layer => layer.definition.label);
        const informative = active.filter(layer => statusIsInformative(layer.status)).map(layer => `${layer.definition.label} ${layer.status}`);
        const warnings = active.filter(layer => statusNeedsAttention(layer.status));

        if (this.readout) {
            if (!active.length) {
                this.readout.innerHTML = `<strong>NO ACTIVE OPTIONAL LAYERS</strong><span>No data loaded while disabled</span>`;
            } else {
                this.readout.innerHTML = active.map(layer => `
                    <article data-state="${layer.status}">
                        <strong>${window._escapeHtml(layer.definition.label)}</strong>
                        <span>${window._escapeHtml(this.layerDisplayStatus(layer))}</span>
                        <em>${window._escapeHtml(layer.summary || layer.error || layer.definition.providerType)}</em>
                        ${layer.count ? `<small>${window._escapeHtml(String(layer.count))} items</small>` : ""}
                        ${layer.updatedAt ? `<small>${window._escapeHtml(formatMapTimestamp(layer.updatedAt))}</small>` : ""}
                    </article>`).join("");
            }
        }

        if (warnings.length) {
            this.status.innerText = warnings.map(layer => `${layer.definition.label} ${layer.status}`).join(" · ");
        } else if (online.length && informative.length) {
            this.status.innerText = `${online.join("+")} ONLINE · ${informative.join(" · ")}`;
        } else if (online.length) {
            this.status.innerText = `${online.join(" + ")} ONLINE`;
        } else if (informative.length) {
            this.status.innerText = informative.join(" · ");
        } else if (this.offlineMode) {
            this.status.innerText = "OFFLINE MODE · LOCAL DATA";
        } else {
            this.status.innerText = "MAP ONLINE · OPTIONAL LAYERS OFF";
        }
    }

    updateLocation() {
        const geo = window.mods.netstat && window.mods.netstat.ipinfo && window.mods.netstat.ipinfo.geo;
        if (!geo || !Number.isFinite(Number(geo.latitude)) || !Number.isFinite(Number(geo.longitude))) return;

        const coordinates = [Number(geo.latitude), Number(geo.longitude)];
        if (!this.locationApplied) {
            this.map.setView(coordinates, 11);
            this.locationApplied = true;
        }
        if (!this.locationMarker) {
            this.locationMarker = L.circleMarker(coordinates, {
                radius: 6,
                color: "#ffffff",
                fillColor: "#3BA7FF",
                fillOpacity: 0.9,
                weight: 2
            }).addTo(this.map);
        } else {
            this.locationMarker.setLatLng(coordinates);
        }
    }

    playMapUiSound(sound = "expand") {
        if (!this.mapSettings.uiSounds || !window.audioManager) return;
        const target = window.audioManager[sound] || window.audioManager.expand;
        if (target && typeof target.play === "function") target.play();
    }

    invalidateMapSoon() {
        [80, 240, 520].forEach(delay => {
            setTimeout(() => {
                if (this.map && typeof this.map.invalidateSize === "function") this.map.invalidateSize();
            }, delay);
        });
    }

    toggleExpandedMap(forceState = null) {
        const nextState = typeof forceState === "boolean" ? forceState : !this.expanded;
        if (nextState === this.expanded) return;

        this.expanded = nextState;
        this.panel.classList.toggle("eng-map-expanded", this.expanded);
        document.body.classList.toggle("eng-map-expanded-active", this.expanded);
        const button = document.getElementById("eng_map_expand");
        if (button) {
            button.classList.toggle("active", this.expanded);
            button.innerText = this.expanded ? "↙" : "⛶";
            button.title = this.expanded ? "Collapse map" : "Expand map";
            button.setAttribute("aria-label", button.title);
        }
        this.playMapUiSound("expand");
        this.invalidateMapSoon();
    }

    centerMapAt(coordinates, zoom = 11, summary = "") {
        if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
        const latitude = Number(coordinates[0]);
        const longitude = Number(coordinates[1]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

        this.map.setView([latitude, longitude], zoom);
        if (!this.locationMarker) {
            this.locationMarker = L.circleMarker([latitude, longitude], {
                radius: 6,
                color: "#ffffff",
                fillColor: "#3BA7FF",
                fillOpacity: 0.9,
                weight: 2
            }).addTo(this.map);
        } else {
            this.locationMarker.setLatLng([latitude, longitude]);
        }
        if (summary) this.status.innerText = summary;
        this.invalidateMapSoon();
        return true;
    }

    fallbackMapLocation(message = "LOCATION FALLBACK") {
        const settings = this.mapSettings.defaultLocation;
        if (settings.mode === "custom") {
            const latitude = Number(settings.customLat);
            const longitude = Number(settings.customLon);
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
                return this.centerMapAt([latitude, longitude], 11, `${message} · CUSTOM`);
            }
        }

        const geo = window.mods.netstat && window.mods.netstat.ipinfo && window.mods.netstat.ipinfo.geo;
        if (settings.mode === "current"
            && geo
            && Number.isFinite(Number(geo.latitude))
            && Number.isFinite(Number(geo.longitude))) {
            return this.centerMapAt([Number(geo.latitude), Number(geo.longitude)], 11, `${message} · IP GEO`);
        }

        return this.centerMapAt([40.4168, -3.7038], 10, `${message} · CITY DEFAULT`);
    }

    returnToMyLocation() {
        this.playMapUiSound("scan");
        this.status.innerText = "LOCATING…";

        if (typeof navigator === "undefined" || !navigator.geolocation) {
            this.status.innerText = "LOCATION PERMISSION REQUIRED";
            this.fallbackMapLocation("LOCATION UNAVAILABLE");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                const coordinates = [
                    Number(position.coords.latitude),
                    Number(position.coords.longitude)
                ];
                this.centerMapAt(coordinates, 12, "LOCATION LOCKED");
            },
            error => {
                const permissionDenied = error && error.code === error.PERMISSION_DENIED;
                this.status.innerText = permissionDenied
                    ? "LOCATION PERMISSION REQUIRED"
                    : "LOCATION SERVICE UNAVAILABLE";
                this.fallbackMapLocation(permissionDenied ? "LOCATION PERMISSION REQUIRED" : "LOCATION FALLBACK");
            },
            {
                enableHighAccuracy: false,
                timeout: 6000,
                maximumAge: 5 * 60 * 1000
            }
        );
    }

    showTrafficForm() {
        document.getElementById("eng_traffic_key").value = this.getTrafficKey();
        document.getElementById("eng_traffic_form").classList.add("visible");
        document.getElementById("eng_traffic_key").focus();
    }

    hideTrafficForm() {
        document.getElementById("eng_traffic_form").classList.remove("visible");
    }

    saveTrafficKey() {
        this.trafficKey = document.getElementById("eng_traffic_key").value.trim();
        window.settings.tomtomApiKey = this.trafficKey;
        const settingsPath = require("path").join(
            require("@electron/remote").app.getPath("userData"),
            "settings.json"
        );
        require("fs").writeFileSync(settingsPath, JSON.stringify(window.settings, null, 4));
        this.hideTrafficForm();
        this.tomTomDiagnostic = {
            keyStatus: this.trafficKey ? "CONFIGURED" : "MISSING",
            serviceStatus: "UNKNOWN",
            last4: maskMapSecret(this.trafficKey),
            summary: this.trafficKey ? "TomTom key saved locally" : "TomTom key removed"
        };
        this.applyBaseMapProvider();
        const layer = this.layers.get("ROAD_TRAFFIC");
        if (layer) {
            layer.active = Boolean(this.trafficKey);
            if (layer.active) this.activateLayer("ROAD_TRAFFIC", {persist: false, userInitiated: false});
            else this.deactivateLayer("ROAD_TRAFFIC", {persist: true});
            this.saveLayerPreferences();
        }
    }
}

class EngineeringCalendarPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_calendar_content");
        this.status = document.getElementById("eng_calendar_status");
        this.viewMode = localStorage.getItem("edexui-eng-calendar-view") === "month" ? "month" : "week";
        this.cursor = new Date();
        this.cursor.setHours(12, 0, 0, 0);
        this.activeCalendars = new Set();
        this.selectionLoaded = false;
        this.renderConnect();
        if (localStorage.getItem("edexui-eng-calendar-native-connected") === "true") this.load();
    }

    renderConnect(message = "LOCAL CALENDAR ACCESS IS OFF") {
        const permissionRequired = message.includes("FULL ACCESS");
        this.content.innerHTML = `
            <div class="eng-connect-state">
                <div class="eng-calendar-glyph"><span></span><strong>${new Date().getDate()}</strong></div>
                <p>${message}</p>
                <div class="eng-connect-actions">
                    <button id="eng_calendar_connect">CONNECT CALENDARS</button>
                    <button id="eng_calendar_settings">${permissionRequired ? "CALENDAR PRIVACY" : "MANAGE ACCOUNTS"}</button>
                </div>
                <small>Native read-only access for iCloud, Outlook, Exchange and recurring events.</small>
            </div>`;
        document.getElementById("eng_calendar_connect").addEventListener("click", () => this.load(true));
        document.getElementById("eng_calendar_settings").addEventListener("click", () => {
            this.ipc.invoke(permissionRequired ? "calendar-open-privacy" : "calendar-open-accounts");
        });
    }

    startOfWeek(date) {
        const result = new Date(date);
        const day = (result.getDay() + 6) % 7;
        result.setDate(result.getDate() - day);
        result.setHours(0, 0, 0, 0);
        return result;
    }

    getRange() {
        if (this.viewMode === "week") {
            const start = this.startOfWeek(this.cursor);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);
            return {start, end};
        }

        const first = new Date(this.cursor.getFullYear(), this.cursor.getMonth(), 1);
        const start = this.startOfWeek(first);
        const last = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + 1, 0);
        const end = this.startOfWeek(last);
        end.setDate(end.getDate() + 7);
        return {start, end};
    }

    async load(userInitiated = false) {
        const range = this.getRange();
        this.content.innerHTML = `<div class="eng-loading"><span class="eng-scanline"></span>LOADING NATIVE CALENDAR</div>`;
        const response = await this.ipc.invoke("calendar-events", {
            start: range.start.getTime(),
            end: range.end.getTime()
        });
        if (!response.ok) {
            localStorage.removeItem("edexui-eng-calendar-native-connected");
            const message = response.permissionDenied
                ? "CALENDAR FULL ACCESS REQUIRED"
                : "CALENDAR LINK UNAVAILABLE";
            this.renderConnect(message);
            return;
        }

        localStorage.setItem("edexui-eng-calendar-native-connected", "true");
        this.calendarData = response.data || {calendars: [], events: []};
        this.range = range;
        const availableIds = new Set(this.calendarData.calendars.map(calendar => calendar.id));
        const savedValue = localStorage.getItem("edexui-eng-calendar-selection");
        let savedSelection = [];
        try {
            savedSelection = JSON.parse(savedValue || "[]");
        } catch (error) {}
        const validSelection = savedSelection.filter(id => availableIds.has(id));
        if (!this.selectionLoaded) {
            this.activeCalendars = new Set(
                savedValue === null ? Array.from(availableIds) : validSelection
            );
            this.selectionLoaded = true;
        } else {
            this.activeCalendars = new Set(
                Array.from(this.activeCalendars).filter(id => availableIds.has(id))
            );
        }
        this.status.innerText = `${this.calendarData.events.length} EVENTS · ${this.viewMode.toUpperCase()}`;
        this.renderCalendar();
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.load(), 5 * 60 * 1000);
        if (userInitiated) window.audioManager.scan.play();
    }

    saveSelection() {
        localStorage.setItem(
            "edexui-eng-calendar-selection",
            JSON.stringify(Array.from(this.activeCalendars))
        );
    }

    dateKey(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    isToday(date) {
        const today = new Date();
        return this.dateKey(date) === this.dateKey(today);
    }

    filteredEvents() {
        const data = this.calendarData || {calendars: [], events: []};
        return data.events.filter(event => this.activeCalendars.has(event.calendarId));
    }

    periodLabel() {
        if (this.viewMode === "month") {
            return new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric"
            }).format(this.cursor).toUpperCase();
        }
        const end = new Date(this.range.end);
        end.setDate(end.getDate() - 1);
        const formatter = new Intl.DateTimeFormat(undefined, {
            day: "2-digit",
            month: "short"
        });
        return `${formatter.format(this.range.start)} — ${formatter.format(end)}`.toUpperCase();
    }

    renderCalendar() {
        this.status.innerText = `${this.filteredEvents().length} EVENTS · ${this.viewMode.toUpperCase()}`;
        this.content.innerHTML = `
            <div class="eng-calendar-toolbar">
                <div class="eng-calendar-nav">
                    <button id="eng_calendar_previous" aria-label="Previous period">‹</button>
                    <button id="eng_calendar_today">TODAY</button>
                    <button id="eng_calendar_next" aria-label="Next period">›</button>
                </div>
                <strong>${window._escapeHtml(this.periodLabel())}</strong>
                <div class="eng-calendar-actions">
                    <button id="eng_calendar_week" class="${this.viewMode === "week" ? "active" : ""}">WEEK</button>
                    <button id="eng_calendar_month" class="${this.viewMode === "month" ? "active" : ""}">MONTH</button>
                    <button id="eng_calendar_picker_button">CALENDARS ${this.activeCalendars.size}/${this.calendarData.calendars.length}</button>
                </div>
            </div>
            <div id="eng_calendar_picker" class="eng-calendar-picker hidden"></div>
            <div id="eng_calendar_grid" class="eng-calendar-${this.viewMode}"></div>`;

        document.getElementById("eng_calendar_previous").addEventListener("click", () => this.navigate(-1));
        document.getElementById("eng_calendar_today").addEventListener("click", () => {
            this.cursor = new Date();
            this.cursor.setHours(12, 0, 0, 0);
            this.load();
        });
        document.getElementById("eng_calendar_next").addEventListener("click", () => this.navigate(1));
        document.getElementById("eng_calendar_week").addEventListener("click", () => this.changeView("week"));
        document.getElementById("eng_calendar_month").addEventListener("click", () => this.changeView("month"));
        document.getElementById("eng_calendar_picker_button").addEventListener("click", () => {
            document.getElementById("eng_calendar_picker").classList.toggle("hidden");
        });

        this.renderPicker();
        if (this.viewMode === "month") this.renderMonth();
        else this.renderWeek();
    }

    navigate(direction) {
        if (this.viewMode === "month") this.cursor.setMonth(this.cursor.getMonth() + direction);
        else this.cursor.setDate(this.cursor.getDate() + (direction * 7));
        this.load();
    }

    changeView(mode) {
        if (mode === this.viewMode) return;
        this.viewMode = mode;
        localStorage.setItem("edexui-eng-calendar-view", mode);
        this.load();
    }

    renderPicker() {
        const picker = document.getElementById("eng_calendar_picker");
        const eventCounts = new Map();
        this.calendarData.events.forEach(event => {
            eventCounts.set(event.calendarId, (eventCounts.get(event.calendarId) || 0) + 1);
        });
        picker.innerHTML = `
            <header>
                <strong>VISIBLE CALENDARS</strong>
                <button id="eng_calendar_select_all">ALL</button>
                <button id="eng_calendar_select_none">NONE</button>
                <button id="eng_calendar_manage_accounts">ACCOUNTS</button>
            </header>
            <div class="eng-calendar-picker-list"></div>`;
        const list = picker.querySelector(".eng-calendar-picker-list");
        this.calendarData.calendars.forEach(calendar => {
            const button = document.createElement("button");
            const active = this.activeCalendars.has(calendar.id);
            button.className = `eng-calendar-choice${active ? " active" : ""}`;
            button.innerHTML = `
                <i style="--calendar-color:${window._escapeHtml(calendar.color || "#3BA7FF")}"></i>
                <span>
                    <strong>${window._escapeHtml(calendar.name)}</strong>
                    <small>${window._escapeHtml(calendar.account || "Local")} · ${eventCounts.get(calendar.id) || 0} EVENTS</small>
                </span>
                <em>${active ? "ON" : "OFF"}</em>`;
            button.addEventListener("click", () => {
                if (this.activeCalendars.has(calendar.id)) this.activeCalendars.delete(calendar.id);
                else this.activeCalendars.add(calendar.id);
                this.saveSelection();
                this.renderCalendar();
                document.getElementById("eng_calendar_picker").classList.remove("hidden");
            });
            list.appendChild(button);
        });
        document.getElementById("eng_calendar_select_all").addEventListener("click", () => {
            this.activeCalendars = new Set(this.calendarData.calendars.map(calendar => calendar.id));
            this.saveSelection();
            this.renderCalendar();
            document.getElementById("eng_calendar_picker").classList.remove("hidden");
        });
        document.getElementById("eng_calendar_select_none").addEventListener("click", () => {
            this.activeCalendars.clear();
            this.saveSelection();
            this.renderCalendar();
            document.getElementById("eng_calendar_picker").classList.remove("hidden");
        });
        document.getElementById("eng_calendar_manage_accounts").addEventListener("click", () => {
            this.ipc.invoke("calendar-open-accounts");
        });
    }

    eventsByDay() {
        const grouped = new Map();
        this.filteredEvents().forEach(event => {
            const key = this.dateKey(new Date(event.start));
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(event);
        });
        return grouped;
    }

    eventChip(event, compact = false) {
        const calendar = this.calendarData.calendars.find(item => item.id === event.calendarId) || {};
        const start = new Date(event.start);
        const time = event.allDay
            ? "ALL DAY"
            : new Intl.DateTimeFormat(undefined, {hour: "2-digit", minute: "2-digit"}).format(start);
        const chip = document.createElement("div");
        chip.className = `eng-calendar-event-chip${compact ? " compact" : ""}`;
        chip.style.setProperty("--calendar-color", calendar.color || "#3BA7FF");
        chip.title = `${event.title} · ${event.calendar}${event.location ? " · " + event.location : ""}`;
        chip.innerHTML = `
            <time>${time}</time>
            <strong>${window._escapeHtml(event.title)}</strong>`;
        return chip;
    }

    renderWeek() {
        const grid = document.getElementById("eng_calendar_grid");
        const grouped = this.eventsByDay();
        const dayName = new Intl.DateTimeFormat(undefined, {weekday: "short"});
        for (let index = 0; index < 7; index++) {
            const date = new Date(this.range.start);
            date.setDate(date.getDate() + index);
            const column = document.createElement("section");
            column.className = `eng-calendar-day${this.isToday(date) ? " today" : ""}`;
            column.innerHTML = `
                <header>
                    <span>${dayName.format(date).toUpperCase()}</span>
                    <strong>${date.getDate()}</strong>
                </header>
                <div class="eng-calendar-day-events"></div>`;
            const events = grouped.get(this.dateKey(date)) || [];
            const container = column.querySelector(".eng-calendar-day-events");
            events.forEach(event => container.appendChild(this.eventChip(event)));
            if (!events.length) container.innerHTML = `<span class="eng-calendar-day-empty">—</span>`;
            grid.appendChild(column);
        }
    }

    renderMonth() {
        const grid = document.getElementById("eng_calendar_grid");
        const grouped = this.eventsByDay();
        const dayName = new Intl.DateTimeFormat(undefined, {weekday: "narrow"});
        for (let index = 0; index < 7; index++) {
            const date = new Date(this.range.start);
            date.setDate(date.getDate() + index);
            const heading = document.createElement("span");
            heading.className = "eng-calendar-month-heading";
            heading.innerText = dayName.format(date).toUpperCase();
            grid.appendChild(heading);
        }
        const days = Math.round((this.range.end - this.range.start) / (24 * 60 * 60 * 1000));
        for (let index = 0; index < days; index++) {
            const date = new Date(this.range.start);
            date.setDate(date.getDate() + index);
            const events = grouped.get(this.dateKey(date)) || [];
            const cell = document.createElement("section");
            cell.className = [
                "eng-calendar-month-day",
                date.getMonth() !== this.cursor.getMonth() ? "outside" : "",
                this.isToday(date) ? "today" : ""
            ].filter(Boolean).join(" ");
            cell.innerHTML = `<strong>${date.getDate()}</strong><div></div>`;
            const eventContainer = cell.querySelector("div");
            events.slice(0, 3).forEach(event => eventContainer.appendChild(this.eventChip(event, true)));
            if (events.length > 3) {
                const more = document.createElement("span");
                more.className = "eng-calendar-more";
                more.innerText = `+${events.length - 3}`;
                eventContainer.appendChild(more);
            }
            grid.appendChild(cell);
        }
    }
}

class EngineeringProjectsPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_projects_content");
        this.projects = [];
        this.selectedProject = 0;
        this.dirty = false;
        this.closeArmed = false;
        this.deleteArmed = false;
        this.load();
    }

    async load() {
        this.content.innerHTML = `<div class="eng-loading"><span class="eng-scanline"></span>READING PROJECT DATA</div>`;
        const response = await this.ipc.invoke("engineering-projects");
        if (!response.ok) {
            this.content.innerHTML = `
                <div class="eng-empty-state">
                    <strong>PROJECT DATA ERROR</strong>
                    ${window._escapeHtml(response.error || "Cannot read project data")}
                    <button id="eng_projects_retry">RETRY</button>
                </div>`;
            document.getElementById("eng_projects_retry").addEventListener("click", () => this.load());
            return;
        }
        this.projects = this.cloneProjects(response.data.projects || []);
        this.render();
    }

    cloneProjects(projects) {
        return (Array.isArray(projects) ? projects : []).map((project, projectIndex) => {
            const source = project && typeof project === "object" ? project : {};
            return {
                id: String(source.id || ""),
                name: String(source.name || `PROJECT ${projectIndex + 1}`),
                description: String(source.description || ""),
                milestones: (Array.isArray(source.milestones) ? source.milestones : []).map((milestone, milestoneIndex) => {
                    const item = milestone && typeof milestone === "object" ? milestone : {};
                    return {
                        name: String(item.name || `Milestone ${milestoneIndex + 1}`),
                        status: ["pending", "active", "complete", "blocked"].includes(item.status)
                            ? item.status
                            : "pending"
                    };
                })
            };
        });
    }

    render() {
        this.content.innerHTML = `
            <div class="eng-project-toolbar">
                <span>${this.projects.length} PROJECTS LOADED</span>
                <button id="eng_projects_reload">RELOAD</button>
                <button id="eng_projects_manage" class="primary">PROJECT CONTROL</button>
            </div>
            <div class="eng-project-list"></div>`;
        document.getElementById("eng_projects_reload").addEventListener("click", () => this.load());
        document.getElementById("eng_projects_manage").addEventListener("click", () => this.openEditor());

        const list = this.content.querySelector(".eng-project-list");
        if (!this.projects.length) {
            list.innerHTML = `
                <div class="eng-empty-state">
                    <strong>NO ACTIVE PROJECTS</strong>
                    OPEN PROJECT CONTROL TO CREATE ONE
                </div>`;
            return;
        }
        this.projects.forEach((project, projectIndex) => {
            const milestones = Array.isArray(project.milestones) ? project.milestones : [];
            const completed = milestones.filter(item => item.status === "complete").length;
            const active = milestones.filter(item => item.status === "active").length;
            const progress = milestones.length
                ? Math.round(((completed + active * 0.5) / milestones.length) * 100)
                : 0;
            const article = document.createElement("article");
            article.className = "eng-project";
            article.innerHTML = `
                <header>
                    <span>${String(projectIndex + 1).padStart(2, "0")}</span>
                    <div>
                        <h2>${window._escapeHtml(String(project.name || "PROJECT"))}</h2>
                        <p>${window._escapeHtml(String(project.description || ""))}</p>
                    </div>
                    <strong>${progress}%</strong>
                </header>
                <div class="eng-project-progress"><span style="width:${progress}%"></span></div>
                <div class="eng-milestones"></div>`;
            const milestonesContainer = article.querySelector(".eng-milestones");
            milestones.forEach((milestone, index) => {
                const status = ["pending", "active", "complete", "blocked"].includes(milestone.status)
                    ? milestone.status
                    : "pending";
                const item = document.createElement("div");
                item.className = `eng-milestone ${status}`;
                item.innerHTML = `
                    <i></i>
                    <span>${String(index + 1).padStart(2, "0")}</span>
                    <strong>${window._escapeHtml(String(milestone.name || "Milestone"))}</strong>
                    <em>${status.toUpperCase()}</em>`;
                milestonesContainer.appendChild(item);
            });
            article.title = "Open project in Project Control";
            article.addEventListener("click", () => this.openEditor(projectIndex));
            list.appendChild(article);
        });
    }

    openEditor(projectIndex = 0, options = {}) {
        this.removeEditor();
        this.editorProjects = this.cloneProjects(this.projects);
        this.selectedProject = Math.max(0, Math.min(projectIndex, this.editorProjects.length - 1));
        this.dirty = false;
        this.closeArmed = false;
        this.deleteArmed = false;
        this.returnWorkspaceId = options.returnWorkspaceId
            || (window.workspaceManager && window.workspaceManager.getActiveWorkspace
                ? window.workspaceManager.getActiveWorkspace()
                : document.body.dataset.workspace || "hub");

        const overlay = document.createElement("div");
        overlay.id = "eng_project_editor_overlay";
        overlay.innerHTML = `
            <section id="eng_project_editor" augmented-ui="tl-clip tr-clip br-clip bl-clip exe">
                <header class="eng-project-editor-header">
                    <div>
                        <small>ENGINEERING DASHBOARD / LOCAL DATA</small>
                        <h1>PROJECT CONTROL</h1>
                    </div>
                    <div class="eng-project-editor-header-actions">
                        <span id="eng_project_editor_state">ALL CHANGES SAVED</span>
                        <button id="eng_project_editor_close" aria-label="Close project editor">CLOSE ×</button>
                    </div>
                </header>
                <div class="eng-project-editor-body">
                    <aside class="eng-project-navigator">
                        <div class="eng-project-navigator-title">
                            <span>PROJECT INDEX</span>
                            <strong id="eng_project_editor_count">00</strong>
                        </div>
                        <div id="eng_project_editor_projects"></div>
                        <button id="eng_project_add" class="primary">＋ NEW PROJECT</button>
                    </aside>
                    <main class="eng-project-workspace">
                        <div id="eng_project_editor_empty">
                            <strong>NO PROJECT SELECTED</strong>
                            <p>Create a project to begin defining its engineering timeline.</p>
                            <button id="eng_project_empty_add" class="primary">CREATE FIRST PROJECT</button>
                        </div>
                        <form id="eng_project_form">
                            <div class="eng-project-fields">
                                <label>
                                    <span>PROJECT NAME</span>
                                    <input id="eng_project_name" maxlength="80" autocomplete="off">
                                </label>
                                <label>
                                    <span>DESCRIPTION</span>
                                    <input id="eng_project_description" maxlength="240" autocomplete="off">
                                </label>
                            </div>
                            <div class="eng-milestone-editor-title">
                                <div>
                                    <small>SEQUENCE / STATUS / PROGRESS</small>
                                    <h2>PROJECT MILESTONES</h2>
                                </div>
                                <button id="eng_milestone_add" type="button">＋ ADD MILESTONE</button>
                            </div>
                            <div id="eng_milestone_editor_list"></div>
                        </form>
                    </main>
                </div>
                <footer class="eng-project-editor-footer">
                    <button id="eng_project_delete" class="danger">DELETE PROJECT</button>
                    <span>Data stays locally on this Mac · an automatic backup is kept</span>
                    <button id="eng_project_discard">DISCARD CHANGES</button>
                    <button id="eng_project_save" class="primary">SAVE CHANGES</button>
                </footer>
            </section>`;
        document.body.appendChild(overlay);
        this.overlay = overlay;

        document.getElementById("eng_project_editor_close").addEventListener("click", () => this.closeEditor());
        document.getElementById("eng_project_add").addEventListener("click", () => this.addProject());
        document.getElementById("eng_project_empty_add").addEventListener("click", () => this.addProject());
        document.getElementById("eng_project_delete").addEventListener("click", () => this.deleteProject());
        document.getElementById("eng_project_discard").addEventListener("click", () => this.discardChanges());
        document.getElementById("eng_project_save").addEventListener("click", () => this.saveChanges());
        document.getElementById("eng_milestone_add").addEventListener("click", () => this.addMilestone());
        document.getElementById("eng_project_form").addEventListener("submit", event => event.preventDefault());
        document.getElementById("eng_project_name").addEventListener("input", event => {
            const project = this.currentProject();
            if (!project) return;
            project.name = event.target.value;
            this.markDirty();
            this.renderNavigator();
        });
        document.getElementById("eng_project_description").addEventListener("input", event => {
            const project = this.currentProject();
            if (!project) return;
            project.description = event.target.value;
            this.markDirty();
        });
        overlay.addEventListener("mousedown", event => {
            if (event.target === overlay) this.closeEditor();
        });
        this.escapeHandler = event => {
            if (event.key === "Escape") this.closeEditor();
        };
        window.addEventListener("keydown", this.escapeHandler);

        this.renderEditor();
        window.audioManager.expand.play();
    }

    currentProject() {
        return this.editorProjects[this.selectedProject] || null;
    }

    renderEditor() {
        const project = this.currentProject();
        document.getElementById("eng_project_form").hidden = !project;
        document.getElementById("eng_project_editor_empty").hidden = Boolean(project);
        document.getElementById("eng_project_delete").disabled = !project;
        this.renderNavigator();
        if (!project) return;

        document.getElementById("eng_project_name").value = project.name || "";
        document.getElementById("eng_project_description").value = project.description || "";
        this.renderMilestones();
    }

    renderNavigator() {
        const container = document.getElementById("eng_project_editor_projects");
        if (!container) return;
        container.innerHTML = "";
        document.getElementById("eng_project_editor_count").innerText =
            String(this.editorProjects.length).padStart(2, "0");

        this.editorProjects.forEach((project, index) => {
            const milestones = Array.isArray(project.milestones) ? project.milestones : [];
            const completed = milestones.filter(item => item.status === "complete").length;
            const button = document.createElement("button");
            button.type = "button";
            button.className = `eng-project-nav-item${index === this.selectedProject ? " active" : ""}`;
            button.innerHTML = `
                <span>${String(index + 1).padStart(2, "0")}</span>
                <div>
                    <strong>${window._escapeHtml(String(project.name || "UNTITLED PROJECT"))}</strong>
                    <small>${completed}/${milestones.length} MILESTONES COMPLETE</small>
                </div>`;
            button.addEventListener("click", () => {
                this.selectedProject = index;
                this.deleteArmed = false;
                this.renderEditor();
            });
            container.appendChild(button);
        });
    }

    renderMilestones() {
        const project = this.currentProject();
        const container = document.getElementById("eng_milestone_editor_list");
        container.innerHTML = "";
        if (!project.milestones.length) {
            container.innerHTML = `
                <div class="eng-milestone-editor-empty">
                    NO MILESTONES YET · ADD THE FIRST STEP IN THIS PROJECT
                </div>`;
            return;
        }

        project.milestones.forEach((milestone, index) => {
            const row = document.createElement("div");
            row.className = `eng-milestone-editor-row ${milestone.status || "pending"}`;
            row.innerHTML = `
                <span class="eng-milestone-editor-index">${String(index + 1).padStart(2, "0")}</span>
                <input maxlength="120" aria-label="Milestone name">
                <select aria-label="Milestone status">
                    <option value="pending">PENDING</option>
                    <option value="active">ACTIVE</option>
                    <option value="complete">COMPLETE</option>
                    <option value="blocked">BLOCKED</option>
                </select>
                <div class="eng-milestone-editor-actions">
                    <button type="button" data-action="up" title="Move up">↑</button>
                    <button type="button" data-action="down" title="Move down">↓</button>
                    <button type="button" data-action="remove" class="danger" title="Delete milestone">×</button>
                </div>`;
            const input = row.querySelector("input");
            const select = row.querySelector("select");
            input.value = milestone.name || "";
            select.value = ["pending", "active", "complete", "blocked"].includes(milestone.status)
                ? milestone.status
                : "pending";
            input.addEventListener("input", event => {
                milestone.name = event.target.value;
                this.markDirty();
            });
            select.addEventListener("change", event => {
                milestone.status = event.target.value;
                this.markDirty();
                this.renderMilestones();
                this.renderNavigator();
            });
            row.querySelectorAll("button").forEach(button => {
                button.addEventListener("click", () => this.milestoneAction(index, button.dataset.action));
            });
            container.appendChild(row);
        });
    }

    addProject() {
        this.editorProjects.push({
            id: "",
            name: `NEW PROJECT ${this.editorProjects.length + 1}`,
            description: "",
            milestones: []
        });
        this.selectedProject = this.editorProjects.length - 1;
        this.markDirty();
        this.renderEditor();
        setTimeout(() => {
            const input = document.getElementById("eng_project_name");
            input.focus();
            input.select();
        }, 0);
    }

    deleteProject() {
        if (!this.currentProject()) return;
        const button = document.getElementById("eng_project_delete");
        if (!this.deleteArmed) {
            this.deleteArmed = true;
            button.innerText = "CONFIRM DELETE";
            setTimeout(() => {
                this.deleteArmed = false;
                if (button.isConnected) button.innerText = "DELETE PROJECT";
            }, 3000);
            return;
        }
        this.editorProjects.splice(this.selectedProject, 1);
        this.selectedProject = Math.min(this.selectedProject, this.editorProjects.length - 1);
        this.deleteArmed = false;
        this.markDirty();
        this.renderEditor();
    }

    addMilestone() {
        const project = this.currentProject();
        if (!project) return;
        project.milestones.push({name: `New milestone ${project.milestones.length + 1}`, status: "pending"});
        this.markDirty();
        this.renderMilestones();
        this.renderNavigator();
        const inputs = document.querySelectorAll("#eng_milestone_editor_list input");
        const input = inputs[inputs.length - 1];
        if (input) {
            input.focus();
            input.select();
        }
    }

    milestoneAction(index, action) {
        const project = this.currentProject();
        if (!project || !project.milestones[index]) return;
        if (action === "remove") project.milestones.splice(index, 1);
        if (action === "up" && index > 0) {
            [project.milestones[index - 1], project.milestones[index]] =
                [project.milestones[index], project.milestones[index - 1]];
        }
        if (action === "down" && index < project.milestones.length - 1) {
            [project.milestones[index + 1], project.milestones[index]] =
                [project.milestones[index], project.milestones[index + 1]];
        }
        this.markDirty();
        this.renderMilestones();
        this.renderNavigator();
    }

    markDirty() {
        this.dirty = true;
        this.closeArmed = false;
        const state = document.getElementById("eng_project_editor_state");
        if (state) {
            state.innerText = "UNSAVED CHANGES";
            state.className = "dirty";
        }
    }

    discardChanges() {
        this.editorProjects = this.cloneProjects(this.projects);
        this.selectedProject = Math.min(this.selectedProject, this.editorProjects.length - 1);
        this.dirty = false;
        const state = document.getElementById("eng_project_editor_state");
        state.innerText = "CHANGES DISCARDED";
        state.className = "";
        this.renderEditor();
    }

    async saveChanges() {
        const saveButton = document.getElementById("eng_project_save");
        const state = document.getElementById("eng_project_editor_state");
        saveButton.disabled = true;
        saveButton.innerText = "SAVING...";
        state.innerText = "VALIDATING PROJECT DATA";
        state.className = "";
        const response = await this.ipc.invoke("engineering-save-projects", {
            projects: this.editorProjects
        });
        saveButton.disabled = false;
        saveButton.innerText = "SAVE CHANGES";
        if (!response.ok) {
            state.innerText = `SAVE FAILED · ${response.error || "UNKNOWN ERROR"}`;
            state.className = "error";
            window.audioManager.denied.play();
            return;
        }

        this.projects = this.cloneProjects(response.data.projects || []);
        this.editorProjects = this.cloneProjects(this.projects);
        this.selectedProject = Math.min(this.selectedProject, this.editorProjects.length - 1);
        this.dirty = false;
        state.innerText = "SAVED LOCALLY";
        state.className = "saved";
        this.render();
        this.renderEditor();
        window.audioManager.scan.play();
    }

    closeEditor() {
        if (this.dirty && !this.closeArmed) {
            this.closeArmed = true;
            const state = document.getElementById("eng_project_editor_state");
            state.innerText = "UNSAVED · CLOSE AGAIN TO DISCARD";
            state.className = "error";
            setTimeout(() => {
                this.closeArmed = false;
                if (state.isConnected && this.dirty) {
                    state.innerText = "UNSAVED CHANGES";
                    state.className = "dirty";
                }
            }, 3000);
            return;
        }
        const returnWorkspaceId = this.returnWorkspaceId;
        this.removeEditor();
        this.restoreWorkspaceContext(returnWorkspaceId);
        window.audioManager.denied.play();
    }

    removeEditor() {
        if (this.escapeHandler) window.removeEventListener("keydown", this.escapeHandler);
        this.escapeHandler = null;
        const overlay = document.getElementById("eng_project_editor_overlay");
        if (overlay) overlay.remove();
        this.overlay = null;
        this.returnWorkspaceId = null;
    }

    restoreWorkspaceContext(workspaceId) {
        if (!workspaceId || !window.workspaceManager || !window.workspaceManager.restoreWorkspace) return;
        window.workspaceManager.restoreWorkspace(workspaceId);
    }
}

class EngineeringMusicPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_music_content");
        this.stateLabel = document.getElementById("eng_music_state");
        this.playing = false;
        this.shuffleEnabled = localStorage.getItem("edexui-eng-music-shuffle") === "true";
        this.repeatMode = this.normalizeRepeatMode(localStorage.getItem("edexui-eng-music-repeat"));
        this.artworkTrackId = "";
        this.artworkRequestId = "";
        this.failedArtworkId = "";
        this.lastMusicStatus = null;
        this.renderConnect();
        this.startVisualizer();
        if (localStorage.getItem("edexui-eng-music-connected") === "true") this.connect();
    }

    renderConnect(message = "NATIVE MUSIC LINK IS OFF", status = {}) {
        const diagnostic = status || {};
        const appStatus = diagnostic.appStatus || (diagnostic.running ? "RUNNING" : "NOT RUNNING");
        const connectionStatus = diagnostic.connectionStatus || diagnostic.status || "NOT CONNECTED";
        const lastError = diagnostic.lastError || diagnostic.error || "";
        this.content.innerHTML = `
            <div class="eng-music-main">
                <div class="eng-music-connect">
                    <div class="eng-record"><span></span></div>
                    <div>
                        <p>${message}</p>
                        <div class="eng-music-diagnostics">
                            <span>MUSIC APP</span><strong>${window._escapeHtml(String(appStatus).replace(/_/g, " "))}</strong>
                            <span>APPLE MUSIC</span><strong>${window._escapeHtml(String(connectionStatus).replace(/_/g, " "))}</strong>
                            <span>LAST ERROR</span><strong>${window._escapeHtml(lastError || "none")}</strong>
                        </div>
                        <div class="eng-music-connect-actions">
                            <button id="eng_music_connect">CONNECT APPLE MUSIC</button>
                            <button id="eng_music_open">OPEN MUSIC</button>
                            <button id="eng_music_refresh">REFRESH</button>
                        </div>
                        <div class="eng-music-controls eng-music-controls-fallback">
                            <button class="eng-music-toggle ${this.shuffleEnabled ? "active" : ""}" disabled>SHUF</button>
                            <button class="eng-music-toggle ${this.repeatMode !== "off" ? "active" : ""}" disabled>${this.repeatButtonLabel()}</button>
                        </div>
                        <small>TRACK DATA + PLAYBACK CONTROLS · NO AUDIO IS CAPTURED</small>
                    </div>
                </div>
                <div id="eng_equalizer" class="idle"></div>
            </div>
            <aside id="eng_playlists"></aside>`;
        this.createBars();
        this.loadPlaylists();
        document.getElementById("eng_music_connect").addEventListener("click", () => this.connect(true));
        document.getElementById("eng_music_open").addEventListener("click", async () => {
            this.stateLabel.innerText = "OPENING";
            await this.ipc.invoke("music-open");
            setTimeout(() => this.connect(true), 1000);
        });
        document.getElementById("eng_music_refresh").addEventListener("click", () => this.connect(false));
    }

    async connect(userInitiated = false) {
        this.stateLabel.innerText = "CONNECTING";
        const response = await this.ipc.invoke("music-status");
        if (!response.ok) {
            localStorage.removeItem("edexui-eng-music-connected");
            this.stateLabel.innerText = response.permissionDenied ? "PERMISSION REQUIRED" : "ERROR";
            this.renderConnect(
                response.permissionDenied ? "APPLE MUSIC PERMISSION REQUIRED" : "MUSIC LINK ERROR",
                {
                    appStatus: "UNKNOWN",
                    connectionStatus: response.permissionDenied ? "PERMISSION_REQUIRED" : "ERROR",
                    lastError: response.error || ""
                }
            );
            return;
        }

        const data = response.data || {};
        if (!data.running) {
            localStorage.removeItem("edexui-eng-music-connected");
            this.stateLabel.innerText = "NOT RUNNING";
            this.renderConnect("MUSIC APP IS NOT RUNNING", data);
            return;
        }

        localStorage.setItem("edexui-eng-music-connected", "true");
        this.renderPlayer();
        this.applyStatus(data);
        clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this.updateStatus(), 2000);
        if (userInitiated) window.audioManager.scan.play();
    }

    renderPlayer() {
        this.content.innerHTML = `
            <div class="eng-music-main">
                <div class="eng-now-playing">
                    <div class="eng-album-visual">
                        <img id="eng_album_artwork" alt="">
                        <span id="eng_album_initial">M</span>
                        <i></i>
                    </div>
                    <div class="eng-track-data">
                        <small>NOW PLAYING</small>
                        <h2 id="eng_track_title">APPLE MUSIC</h2>
                        <h3 id="eng_track_artist">WAITING FOR PLAYBACK</h3>
                        <p id="eng_track_album"></p>
                        <div class="eng-progress"><span id="eng_music_progress"></span></div>
                        <div class="eng-music-controls">
                            <button data-command="open">OPEN MUSIC</button>
                            <button data-command="refresh">REFRESH</button>
                            <button data-command="shuffle" class="eng-music-toggle" id="eng_music_shuffle">SHUF</button>
                            <button data-command="previous">◀◀</button>
                            <button data-command="toggle" class="primary" id="eng_music_toggle">▶</button>
                            <button data-command="next">▶▶</button>
                            <button data-command="repeat" class="eng-music-toggle" id="eng_music_repeat">${this.repeatButtonLabel()}</button>
                        </div>
                    </div>
                </div>
                <div id="eng_equalizer" class="idle"></div>
            </div>
            <aside id="eng_playlists"></aside>`;
        this.createBars();
        this.loadPlaylists();
        this.content.querySelectorAll("[data-command]").forEach(button => {
            button.addEventListener("click", async () => {
                if (button.dataset.command === "open") {
                    await this.ipc.invoke("music-open");
                    setTimeout(() => this.updateStatus(), 1000);
                } else if (button.dataset.command === "refresh") {
                    await this.updateStatus();
                } else if (button.dataset.command === "shuffle") {
                    await this.toggleShuffle();
                } else if (button.dataset.command === "repeat") {
                    await this.cycleRepeat();
                } else {
                    await this.ipc.invoke("music-control", button.dataset.command);
                    setTimeout(() => this.updateStatus(), 300);
                }
            });
        });
        this.updateAdvancedControls();
    }

    normalizeRepeatMode(mode) {
        return ["off", "all", "one"].includes(mode) ? mode : "off";
    }

    repeatButtonLabel() {
        if (this.repeatMode === "all") return "REPEAT ALL";
        if (this.repeatMode === "one") return "REPEAT ONE";
        return "REPEAT OFF";
    }

    saveAdvancedControls() {
        localStorage.setItem("edexui-eng-music-shuffle", String(Boolean(this.shuffleEnabled)));
        localStorage.setItem("edexui-eng-music-repeat", this.repeatMode);
    }

    applyAdvancedControls(state = {}) {
        if (typeof state.shuffle === "boolean") this.shuffleEnabled = state.shuffle;
        if (typeof state.repeat === "string") this.repeatMode = this.normalizeRepeatMode(state.repeat);
        this.saveAdvancedControls();
        this.updateAdvancedControls();
    }

    updateAdvancedControls() {
        const shuffle = document.getElementById("eng_music_shuffle");
        const repeat = document.getElementById("eng_music_repeat");
        if (shuffle) {
            shuffle.classList.toggle("active", this.shuffleEnabled);
            shuffle.setAttribute("aria-pressed", String(this.shuffleEnabled));
            shuffle.title = this.shuffleEnabled ? "Shuffle ON" : "Shuffle OFF";
        }
        if (repeat) {
            repeat.innerText = this.repeatButtonLabel();
            repeat.classList.toggle("active", this.repeatMode !== "off");
            repeat.dataset.mode = this.repeatMode;
            repeat.setAttribute("aria-pressed", String(this.repeatMode !== "off"));
            repeat.title = this.repeatMode === "off"
                ? "Repeat OFF"
                : (this.repeatMode === "all" ? "Repeat all" : "Repeat one");
        }
    }

    async toggleShuffle() {
        const nextShuffle = !this.shuffleEnabled;
        this.applyAdvancedControls({shuffle: nextShuffle});
        const response = await this.ipc.invoke("music-control", "shuffle", {shuffle: nextShuffle});
        if (response.ok && response.data) this.applyAdvancedControls(response.data);
        else this.stateLabel.innerText = "SHUFFLE LOCAL";
        setTimeout(() => this.updateStatus(), 300);
    }

    async cycleRepeat() {
        const nextMode = this.repeatMode === "off"
            ? "all"
            : (this.repeatMode === "all" ? "one" : "off");
        this.applyAdvancedControls({repeat: nextMode});
        const response = await this.ipc.invoke("music-control", "repeat", {repeat: nextMode});
        if (response.ok && response.data) this.applyAdvancedControls(response.data);
        else this.stateLabel.innerText = "REPEAT LOCAL";
        setTimeout(() => this.updateStatus(), 300);
    }

    async loadPlaylists() {
        const container = document.getElementById("eng_playlists");
        if (!container) return;
        container.innerHTML = `<h3>PLAYLISTS</h3><div class="eng-playlist-loading">READING LOCAL INDEX</div>`;
        const response = await this.ipc.invoke("music-playlists");
        const playlists = response.ok ? response.data : [];
        container.innerHTML = `
            <h3>PLAYLISTS</h3>
            <div class="eng-playlist-list"></div>
            <footer>
                <button id="eng_playlists_reload">↻</button>
                <button id="eng_playlists_edit">EDIT</button>
            </footer>`;

        const list = container.querySelector(".eng-playlist-list");
        if (!playlists.length) {
            list.innerHTML = `<div class="eng-playlist-empty">ADD PLAYLIST NAMES TO<br>MUSIC-PLAYLISTS.JSON</div>`;
        }

        playlists.forEach((playlist, index) => {
            const name = typeof playlist === "string" ? playlist : playlist.name;
            if (!name) return;
            const label = typeof playlist === "string" ? playlist : (playlist.label || playlist.name);
            const button = document.createElement("button");
            button.className = "eng-playlist";
            button.innerHTML = `
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${window._escapeHtml(String(label))}</strong>`;
            button.title = name;
            button.addEventListener("click", async () => {
                container.querySelectorAll(".eng-playlist").forEach(item => item.classList.remove("active"));
                button.classList.add("loading");
                const result = await this.ipc.invoke("music-play-playlist", name);
                button.classList.remove("loading");
                if (result.ok && result.data && result.data.played) {
                    button.classList.add("active");
                    localStorage.setItem("edexui-eng-last-playlist", name);
                    setTimeout(() => this.updateStatus(), 750);
                } else {
                    button.classList.add("failed");
                }
            });
            if (localStorage.getItem("edexui-eng-last-playlist") === name) button.classList.add("active");
            list.appendChild(button);
        });

        document.getElementById("eng_playlists_reload").addEventListener("click", () => this.loadPlaylists());
        document.getElementById("eng_playlists_edit").addEventListener("click", () => {
            this.ipc.invoke("music-open-playlists");
        });
    }

    createBars() {
        const equalizer = document.getElementById("eng_equalizer");
        if (!equalizer) return;
        equalizer.innerHTML = "";
        for (let i = 0; i < 42; i++) {
            const bar = document.createElement("i");
            bar.style.height = `${18 + (Math.sin(i * 0.7) + 1) * 8}%`;
            equalizer.appendChild(bar);
        }
    }

    startVisualizer() {
        this.visualizerTimer = setInterval(() => {
            document.querySelectorAll("#eng_equalizer > i").forEach((bar, index) => {
                const idle = 17 + (Math.sin(Date.now() / 700 + index * 0.62) + 1) * 8;
                const live = 12 + Math.random() * 83;
                bar.style.height = `${this.playing ? live : idle}%`;
            });
        }, 110);
    }

    async updateStatus() {
        const response = await this.ipc.invoke("music-status");
        if (response.ok) {
            const data = response.data || {};
            if (!data.running) {
                localStorage.removeItem("edexui-eng-music-connected");
                clearInterval(this.pollTimer);
                this.stateLabel.innerText = "NOT RUNNING";
                this.renderConnect("MUSIC APP IS NOT RUNNING", data);
                return;
            }
            this.applyStatus(data);
            return;
        }
        this.stateLabel.innerText = response.permissionDenied ? "PERMISSION REQUIRED" : "ERROR";
    }

    applyStatus(status) {
        this.lastMusicStatus = status;
        this.playing = status.state === "playing";
        this.stateLabel.innerText = status.running
            ? (status.connectionStatus === "CONNECTED" ? status.state.toUpperCase() : status.connectionStatus || "CONNECTED")
            : "NOT RUNNING";
        this.applyAdvancedControls(status);
        const equalizer = document.getElementById("eng_equalizer");
        if (equalizer) equalizer.classList.toggle("idle", !this.playing);

        const title = document.getElementById("eng_track_title");
        if (!title) return;
        title.innerText = status.title || "APPLE MUSIC";
        document.getElementById("eng_track_artist").innerText = status.artist
            || (status.running ? "NO ACTIVE TRACK" : "OPEN THE MUSIC APP");
        document.getElementById("eng_track_album").innerText = status.album || "";
        document.getElementById("eng_album_initial").innerText =
            (status.album || status.title || "M").slice(0, 1).toUpperCase();
        const artworkId = String(status.artworkId || "");
        if (artworkId
            && artworkId !== this.artworkTrackId
            && artworkId !== this.artworkRequestId
            && artworkId !== this.failedArtworkId) {
            this.loadArtwork(artworkId);
        } else if (!artworkId) {
            this.failedArtworkId = "";
            this.clearArtwork();
        }
        document.getElementById("eng_music_toggle").innerText = this.playing ? "Ⅱ" : "▶";
        const duration = Number(status.duration || 0);
        const position = Number(status.position || 0);
        document.getElementById("eng_music_progress").style.width =
            duration > 0 ? `${Math.min(100, position / duration * 100)}%` : "0%";
    }

    async loadArtwork(artworkId) {
        this.artworkRequestId = artworkId;
        const response = await this.ipc.invoke("music-artwork", artworkId);
        if (this.artworkRequestId !== artworkId) return;
        this.artworkRequestId = "";
        if (!response.ok || !response.data || response.data.artworkId !== artworkId || !response.data.image) {
            this.clearArtwork();
            this.failedArtworkId = artworkId;
            return;
        }

        const image = document.getElementById("eng_album_artwork");
        const initial = document.getElementById("eng_album_initial");
        if (!image || !initial) return;
        image.src = response.data.image;
        image.classList.add("visible");
        initial.classList.add("hidden");
        this.artworkTrackId = artworkId;
        this.failedArtworkId = "";
    }

    clearArtwork() {
        const image = document.getElementById("eng_album_artwork");
        const initial = document.getElementById("eng_album_initial");
        if (image) {
            image.removeAttribute("src");
            image.classList.remove("visible");
        }
        if (initial) initial.classList.remove("hidden");
        this.artworkTrackId = "";
    }
}

module.exports = {
    EngineeringDashboard
};
