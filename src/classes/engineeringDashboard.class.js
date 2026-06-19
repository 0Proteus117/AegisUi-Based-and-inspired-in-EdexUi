class EngineeringDashboard {
    constructor(parentId) {
        if (!parentId) throw "Missing options";

        this.ipc = require("electron").ipcRenderer;
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML = `
            <section id="eng_map_panel" class="eng-panel eng-square" augmented-ui="tl-clip br-clip exe">
                <h3 class="title"><p>LOCAL SITUATION</p><p id="eng_map_status">INITIALIZING</p></h3>
                <div id="eng_map_canvas"></div>
                <div class="eng-map-controls">
                    <button id="eng_radar_toggle" class="active">RADAR</button>
                    <button id="eng_traffic_toggle">TRAFFIC</button>
                    <button id="eng_traffic_config">API KEY</button>
                </div>
                <form id="eng_traffic_form">
                    <label for="eng_traffic_key">TOMTOM TRAFFIC KEY</label>
                    <input id="eng_traffic_key" type="password" autocomplete="off" spellcheck="false">
                    <button type="submit">SAVE</button>
                    <button type="button" id="eng_traffic_cancel">CANCEL</button>
                </form>
            </section>
            <section id="eng_calendar_panel" class="eng-panel eng-square" augmented-ui="tr-clip bl-clip exe">
                <h3 class="title"><p>CALENDAR</p><p>NEXT 7 DAYS</p></h3>
                <div id="eng_calendar_content"></div>
            </section>
            <section id="eng_music_panel" class="eng-panel eng-wide" augmented-ui="tl-clip br-clip exe">
                <h3 class="title"><p>APPLE MUSIC</p><p id="eng_music_state">DISCONNECTED</p></h3>
                <div id="eng_music_content"></div>
            </section>
            <section id="eng_apps_panel" class="eng-panel eng-apps" augmented-ui="tr-clip bl-clip exe">
                <h3 class="title"><p>APPLICATIONS</p><p>MACOS LAUNCH GRID</p></h3>
                <div id="eng_apps_content"></div>
            </section>`;

        this.mapPanel = new EngineeringMapPanel();
        this.calendarPanel = new EngineeringCalendarPanel();
        this.musicPanel = new EngineeringMusicPanel();
        this.applications = new ApplicationsDisplay("eng_apps_content");
    }
}

class EngineeringMapPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.status = document.getElementById("eng_map_status");
        this.trafficLayer = null;
        this.radarLayer = null;
        this.locationApplied = false;
        this.trafficVisible = Boolean(window.settings.tomtomApiKey);
        this.radarVisible = true;

        this.map = L.map("eng_map_canvas", {
            zoomControl: false,
            attributionControl: true,
            preferCanvas: true
        }).setView([40.4168, -3.7038], 10);
        this.map.attributionControl.setPrefix(false);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© OpenStreetMap",
            className: "eng-base-map"
        }).addTo(this.map);
        L.control.zoom({position: "bottomright"}).addTo(this.map);
        L.circleMarker([40.4168, -3.7038], {
            radius: 5,
            color: `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
            fillColor: `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
            fillOpacity: 0.7,
            weight: 1
        }).addTo(this.map);

        document.getElementById("eng_radar_toggle").addEventListener("click", () => {
            this.radarVisible = !this.radarVisible;
            document.getElementById("eng_radar_toggle").classList.toggle("active", this.radarVisible);
            if (this.radarLayer) {
                if (this.radarVisible) this.radarLayer.addTo(this.map);
                else this.map.removeLayer(this.radarLayer);
            }
        });

        document.getElementById("eng_traffic_toggle").addEventListener("click", () => {
            if (!window.settings.tomtomApiKey) {
                this.showTrafficForm();
                return;
            }
            this.trafficVisible = !this.trafficVisible;
            document.getElementById("eng_traffic_toggle").classList.toggle("active", this.trafficVisible);
            if (this.trafficLayer) {
                if (this.trafficVisible) this.trafficLayer.addTo(this.map);
                else this.map.removeLayer(this.trafficLayer);
            }
        });

        document.getElementById("eng_traffic_config").addEventListener("click", () => this.showTrafficForm());
        document.getElementById("eng_traffic_cancel").addEventListener("click", () => this.hideTrafficForm());
        document.getElementById("eng_traffic_form").addEventListener("submit", event => {
            event.preventDefault();
            this.saveTrafficKey();
        });

        this.loadRadar();
        this.enableTraffic();
        this.updateLocation();
        this.locationTimer = setInterval(() => this.updateLocation(), 3000);
        setTimeout(() => this.map.invalidateSize(), 400);
    }

    async loadRadar() {
        const response = await this.ipc.invoke("rainviewer-metadata");
        if (!response.ok || !response.data.radar || !response.data.radar.past.length) {
            this.status.innerText = "MAP ONLINE · RADAR UNAVAILABLE";
            return;
        }

        const frame = response.data.radar.past[response.data.radar.past.length - 1];
        const tileUrl = `${response.data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
        this.radarLayer = L.tileLayer(tileUrl, {
            opacity: 0.55,
            maxNativeZoom: 7,
            maxZoom: 18,
            zIndex: 20,
            className: "eng-radar-map"
        });
        if (this.radarVisible) this.radarLayer.addTo(this.map);
        this.status.innerText = window.settings.tomtomApiKey ? "RADAR + TRAFFIC LIVE" : "RADAR LIVE · ADD TRAFFIC KEY";
    }

    enableTraffic() {
        if (this.trafficLayer) this.map.removeLayer(this.trafficLayer);
        this.trafficLayer = null;
        if (!window.settings.tomtomApiKey) {
            document.getElementById("eng_traffic_toggle").classList.remove("active");
            return;
        }

        const key = encodeURIComponent(window.settings.tomtomApiKey);
        this.trafficLayer = L.tileLayer(
            `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?tileSize=256&key=${key}`,
            {opacity: 0.9, maxZoom: 22, zIndex: 30, className: "eng-traffic-map"}
        );
        this.trafficVisible = true;
        document.getElementById("eng_traffic_toggle").classList.add("active");
        this.trafficLayer.addTo(this.map);
        this.status.innerText = "RADAR + TRAFFIC LIVE";
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
                fillColor: `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                fillOpacity: 0.9,
                weight: 2
            }).addTo(this.map);
        } else {
            this.locationMarker.setLatLng(coordinates);
        }
    }

    showTrafficForm() {
        const form = document.getElementById("eng_traffic_form");
        document.getElementById("eng_traffic_key").value = window.settings.tomtomApiKey || "";
        form.classList.add("visible");
        document.getElementById("eng_traffic_key").focus();
    }

    hideTrafficForm() {
        document.getElementById("eng_traffic_form").classList.remove("visible");
    }

    saveTrafficKey() {
        window.settings.tomtomApiKey = document.getElementById("eng_traffic_key").value.trim();
        const path = require("path");
        const settingsPath = path.join(require("@electron/remote").app.getPath("userData"), "settings.json");
        require("fs").writeFileSync(settingsPath, JSON.stringify(window.settings, null, 4));
        this.hideTrafficForm();
        this.enableTraffic();
    }
}

class EngineeringCalendarPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_calendar_content");
        this.renderConnect();
        if (localStorage.getItem("edexui-eng-calendar-connected") === "true") this.load();
    }

    renderConnect(message = "LOCAL CALENDAR ACCESS IS OFF") {
        this.content.innerHTML = `
            <div class="eng-connect-state">
                <div class="eng-calendar-glyph"><span></span><strong>${new Date().getDate()}</strong></div>
                <p>${message}</p>
                <button id="eng_calendar_connect">CONNECT CALENDAR</button>
                <small>MACOS WILL ASK FOR AUTOMATION PERMISSION ONCE</small>
            </div>`;
        document.getElementById("eng_calendar_connect").addEventListener("click", () => this.load(true));
    }

    async load(userInitiated = false) {
        this.content.innerHTML = `<div class="eng-loading"><span class="eng-scanline"></span>READING UPCOMING EVENTS</div>`;
        const response = await this.ipc.invoke("calendar-events");
        if (!response.ok) {
            localStorage.removeItem("edexui-eng-calendar-connected");
            const message = response.permissionDenied ? "CALENDAR PERMISSION DENIED" : "CALENDAR LINK UNAVAILABLE";
            this.renderConnect(message);
            return;
        }

        localStorage.setItem("edexui-eng-calendar-connected", "true");
        this.renderEvents(response.data || []);
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.load(), 5 * 60 * 1000);
        if (userInitiated) window.audioManager.scan.play();
    }

    renderEvents(events) {
        if (!events.length) {
            this.content.innerHTML = `
                <div class="eng-empty-state">
                    <strong>AGENDA CLEAR</strong>
                    NO EVENTS IN THE NEXT 7 DAYS
                </div>`;
            return;
        }

        const dayFormatter = new Intl.DateTimeFormat(undefined, {weekday: "short", day: "2-digit", month: "short"});
        const timeFormatter = new Intl.DateTimeFormat(undefined, {hour: "2-digit", minute: "2-digit"});
        this.content.innerHTML = `<div class="eng-event-list"></div>`;
        const list = this.content.querySelector(".eng-event-list");

        events.forEach((event, index) => {
            const start = new Date(event.start);
            const row = document.createElement("article");
            row.className = "eng-event";
            row.innerHTML = `
                <div class="eng-event-index">${String(index + 1).padStart(2, "0")}</div>
                <div class="eng-event-time">
                    <strong>${dayFormatter.format(start).toUpperCase()}</strong>
                    <span>${event.allDay ? "ALL DAY" : timeFormatter.format(start)}</span>
                </div>
                <div class="eng-event-main">
                    <strong>${window._escapeHtml(String(event.title))}</strong>
                    <span>${window._escapeHtml(String(event.location || event.calendar || ""))}</span>
                </div>`;
            list.appendChild(row);
        });
    }
}

class EngineeringMusicPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_music_content");
        this.stateLabel = document.getElementById("eng_music_state");
        this.playing = false;
        this.renderConnect();
        this.startVisualizer();
        if (localStorage.getItem("edexui-eng-music-connected") === "true") this.connect();
    }

    renderConnect(message = "NATIVE MUSIC LINK IS OFF") {
        this.content.innerHTML = `
            <div class="eng-music-connect">
                <div class="eng-record"><span></span></div>
                <div>
                    <p>${message}</p>
                    <button id="eng_music_connect">CONNECT APPLE MUSIC</button>
                    <small>TRACK DATA + PLAYBACK CONTROLS · NO AUDIO IS CAPTURED</small>
                </div>
            </div>
            <div id="eng_equalizer" class="idle"></div>`;
        this.createBars();
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
        this.pollTimer = setInterval(() => this.updateStatus(), 2000);
        if (userInitiated) window.audioManager.scan.play();
    }

    renderPlayer() {
        this.content.innerHTML = `
            <div class="eng-now-playing">
                <div class="eng-album-visual">
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
                        <button data-command="previous">◀◀</button>
                        <button data-command="toggle" class="primary" id="eng_music_toggle">▶</button>
                        <button data-command="next">▶▶</button>
                    </div>
                </div>
            </div>
            <div id="eng_equalizer" class="idle"></div>`;
        this.createBars();
        this.content.querySelectorAll("[data-command]").forEach(button => {
            button.addEventListener("click", async () => {
                await this.ipc.invoke("music-control", button.dataset.command);
                setTimeout(() => this.updateStatus(), 300);
            });
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
            const bars = document.querySelectorAll("#eng_equalizer > i");
            bars.forEach((bar, index) => {
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
        const equalizer = document.getElementById("eng_equalizer");
        if (equalizer) equalizer.classList.toggle("idle", !this.playing);

        const title = document.getElementById("eng_track_title");
        if (!title) return;
        title.innerText = status.title || "APPLE MUSIC";
        document.getElementById("eng_track_artist").innerText = status.artist || (status.running ? "NO ACTIVE TRACK" : "OPEN THE MUSIC APP");
        document.getElementById("eng_track_album").innerText = status.album || "";
        document.getElementById("eng_album_initial").innerText = (status.album || status.title || "M").slice(0, 1).toUpperCase();
        document.getElementById("eng_music_toggle").innerText = this.playing ? "Ⅱ" : "▶";
        const duration = Number(status.duration || 0);
        const position = Number(status.position || 0);
        document.getElementById("eng_music_progress").style.width = duration > 0 ? `${Math.min(100, position / duration * 100)}%` : "0%";
    }
}

module.exports = {
    EngineeringDashboard
};
