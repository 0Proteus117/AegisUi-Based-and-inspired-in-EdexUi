const {MapLayerRegistry} = require(require("path").join(__dirname, "classes/map/mapLayerRegistry.js"));
const {
    MAP_LAYER_STATES,
    formatMapTimestamp,
    statusNeedsAttention,
    statusIsInformative
} = require(require("path").join(__dirname, "classes/map/utils/mapLayerState.js"));

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
        this.status = document.getElementById("eng_map_status");
        this.controls = document.getElementById("eng_map_layer_controls");
        this.readout = document.getElementById("eng_map_layer_readout");
        this.locationApplied = false;
        this.trafficKey = window.settings.tomtomApiKey || "";
        this.offlineMode = Boolean(window.settings.offlineMode);
        this.layerStorageKey = "aegisui-map-layers-v1";
        this.layerPreferences = this.loadLayerPreferences();
        this.hasLocalLayerPreferences = Object.keys(this.layerPreferences).length > 0;
        this.layerDefinitions = this.createLayerDefinitions();

        this.map = L.map("eng_map_canvas", {
            zoomControl: false,
            attributionControl: true,
            preferCanvas: true
        }).setView([40.4168, -3.7038], 10);
        this.map.attributionControl.setPrefix(false);

        this.baseLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
            className: "eng-base-map"
        }).addTo(this.map);
        this.baseLayer.on("tileerror", () => {
            this.status.innerText = this.offlineMode
                ? "OFFLINE MODE · LOCAL DATA"
                : "BASE MAP SERVICE UNAVAILABLE";
        });
        L.control.zoom({position: "bottomright"}).addTo(this.map);

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
        setTimeout(() => this.map.invalidateSize(), 400);
    }

    createLayerDefinitions() {
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
                updateIntervalMs: 0,
                cacheTtlMs: 0,
                zIndex: 30,
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
                opacity: 0.55
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
                updateIntervalMs: 60 * 1000,
                cacheTtlMs: 45 * 1000,
                maxMarkers: 120,
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
                maxMarkers: 150,
                zIndex: 42,
                fallbackVisual: "CONFIG_REQUIRED until AISSTREAM_API_KEY is configured.",
                mode: "live"
            },
            {
                id: "SATELLITES",
                label: "SAT",
                name: "Satellites",
                description: "Real CelesTrak GP catalog data; map positions require a future orbital engine.",
                providerType: "CelesTrak GP JSON",
                providerCandidates: ["CelesTrak GP/TLE"],
                requiresApiKey: false,
                defaultActive: false,
                available: true,
                updateIntervalMs: 6 * 60 * 60 * 1000,
                cacheTtlMs: 6 * 60 * 60 * 1000,
                defaultGroup: "stations",
                zIndex: 40,
                fallbackVisual: "POSITION_ENGINE_REQUIRED until SGP4 propagation is approved.",
                mode: "catalog"
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
                maxMarkers: 180,
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
            if (config && config.tomtomApiKey && !this.trafficKey) {
                this.trafficKey = config.tomtomApiKey;
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
        return this.trafficKey || window.settings.tomtomApiKey || "";
    }

    getEnv(name) {
        if (!name) return "";
        if (typeof process !== "undefined" && process.env && process.env[name]) return process.env[name];
        return "";
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
            if (state) state.innerText = layer.status;
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
                        <span>${window._escapeHtml(layer.status)}</span>
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
        this.renderConnect();
        this.startVisualizer();
        if (localStorage.getItem("edexui-eng-music-connected") === "true") this.connect();
    }

    renderConnect(message = "NATIVE MUSIC LINK IS OFF") {
        this.content.innerHTML = `
            <div class="eng-music-main">
                <div class="eng-music-connect">
                    <div class="eng-record"><span></span></div>
                    <div>
                        <p>${message}</p>
                        <button id="eng_music_connect">CONNECT APPLE MUSIC</button>
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
    }

    async connect(userInitiated = false) {
        this.stateLabel.innerText = "CONNECTING";
        const response = await this.ipc.invoke("music-status");
        if (!response.ok) {
            localStorage.removeItem("edexui-eng-music-connected");
            this.stateLabel.innerText = "DISCONNECTED";
            this.renderConnect(response.permissionDenied ? "MUSIC PERMISSION DENIED" : "MUSIC LINK UNAVAILABLE");
            return;
        }

        localStorage.setItem("edexui-eng-music-connected", "true");
        this.renderPlayer();
        this.applyStatus(response.data || {});
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
                if (button.dataset.command === "shuffle") {
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
        if (response.ok) this.applyStatus(response.data || {});
    }

    applyStatus(status) {
        this.playing = status.state === "playing";
        this.stateLabel.innerText = status.running ? status.state.toUpperCase() : "MUSIC APP IDLE";
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
