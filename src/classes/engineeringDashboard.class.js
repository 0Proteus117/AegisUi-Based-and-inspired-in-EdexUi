class EngineeringDashboard {
    constructor(parentId) {
        if (!parentId) throw "Missing options";

        this.parent = document.getElementById(parentId);
        this.parent.innerHTML = `
            <section id="eng_map_panel" class="eng-panel" augmented-ui="tl-clip br-clip exe">
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
                <h3 class="title"><p>PROJECT TIMELINES</p><p>PROJECTS.JSON</p></h3>
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

        document.getElementById("eng_radar_toggle").addEventListener("click", () => {
            this.radarVisible = !this.radarVisible;
            document.getElementById("eng_radar_toggle").classList.toggle("active", this.radarVisible);
            if (!this.radarLayer) return;
            if (this.radarVisible) this.radarLayer.addTo(this.map);
            else this.map.removeLayer(this.radarLayer);
        });

        document.getElementById("eng_traffic_toggle").addEventListener("click", () => {
            if (!window.settings.tomtomApiKey) {
                this.showTrafficForm();
                return;
            }
            this.trafficVisible = !this.trafficVisible;
            document.getElementById("eng_traffic_toggle").classList.toggle("active", this.trafficVisible);
            if (!this.trafficLayer) return;
            if (this.trafficVisible) this.trafficLayer.addTo(this.map);
            else this.map.removeLayer(this.trafficLayer);
        });

        document.getElementById("eng_traffic_config").addEventListener("click", () => this.showTrafficForm());
        document.getElementById("eng_traffic_get_key").addEventListener("click", () => {
            this.ipc.invoke("traffic-open-key-page");
        });
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
        this.radarLayer = L.tileLayer(
            `${response.data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
            {
                opacity: 0.55,
                maxNativeZoom: 7,
                maxZoom: 18,
                zIndex: 20,
                className: "eng-radar-map"
            }
        );
        if (this.radarVisible) this.radarLayer.addTo(this.map);
        this.status.innerText = window.settings.tomtomApiKey
            ? "RADAR + TRAFFIC LIVE"
            : "RADAR LIVE · ADD TRAFFIC KEY";
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
                fillColor: "#3BA7FF",
                fillOpacity: 0.9,
                weight: 2
            }).addTo(this.map);
        } else {
            this.locationMarker.setLatLng(coordinates);
        }
    }

    showTrafficForm() {
        document.getElementById("eng_traffic_key").value = window.settings.tomtomApiKey || "";
        document.getElementById("eng_traffic_form").classList.add("visible");
        document.getElementById("eng_traffic_key").focus();
    }

    hideTrafficForm() {
        document.getElementById("eng_traffic_form").classList.remove("visible");
    }

    saveTrafficKey() {
        window.settings.tomtomApiKey = document.getElementById("eng_traffic_key").value.trim();
        const settingsPath = require("path").join(
            require("@electron/remote").app.getPath("userData"),
            "settings.json"
        );
        require("fs").writeFileSync(settingsPath, JSON.stringify(window.settings, null, 4));
        this.hideTrafficForm();
        this.enableTraffic();
    }
}

class EngineeringCalendarPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_calendar_content");
        this.status = document.getElementById("eng_calendar_status");
        this.activeCalendars = new Set();
        this.renderConnect();
        if (localStorage.getItem("edexui-eng-calendar-connected") === "true") this.load();
    }

    renderConnect(message = "LOCAL CALENDAR ACCESS IS OFF") {
        this.content.innerHTML = `
            <div class="eng-connect-state">
                <div class="eng-calendar-glyph"><span></span><strong>${new Date().getDate()}</strong></div>
                <p>${message}</p>
                <div class="eng-connect-actions">
                    <button id="eng_calendar_connect">CONNECT CALENDARS</button>
                    <button id="eng_calendar_accounts">MANAGE ACCOUNTS</button>
                </div>
                <small>Reads every account enabled in macOS Calendar: iCloud, Outlook and Exchange.</small>
            </div>`;
        document.getElementById("eng_calendar_connect").addEventListener("click", () => this.load(true));
        document.getElementById("eng_calendar_accounts").addEventListener("click", () => {
            this.ipc.invoke("calendar-open-accounts");
        });
    }

    async load(userInitiated = false) {
        this.content.innerHTML = `<div class="eng-loading"><span class="eng-scanline"></span>QUERYING THE NEXT 7 DAYS</div>`;
        const response = await this.ipc.invoke("calendar-events");
        if (!response.ok) {
            localStorage.removeItem("edexui-eng-calendar-connected");
            const message = response.permissionDenied
                ? "CALENDAR PERMISSION DENIED"
                : "CALENDAR LINK UNAVAILABLE";
            this.renderConnect(message);
            return;
        }

        localStorage.setItem("edexui-eng-calendar-connected", "true");
        this.calendarData = response.data || {calendars: [], events: []};
        this.activeCalendars = new Set(this.calendarData.calendars.map(calendar => calendar.name));
        this.status.innerText = `${this.calendarData.calendars.length} CALENDARS · 7 DAYS`;
        this.renderEvents();
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.load(), 5 * 60 * 1000);
        if (userInitiated) window.audioManager.scan.play();
    }

    renderEvents() {
        const data = this.calendarData || {calendars: [], events: []};
        const events = data.events.filter(event => this.activeCalendars.has(event.calendar));
        const dayFormatter = new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            day: "2-digit",
            month: "short"
        });
        const timeFormatter = new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        });

        this.content.innerHTML = `
            <div class="eng-calendar-sources"></div>
            <div class="eng-event-list"></div>`;
        const sources = this.content.querySelector(".eng-calendar-sources");
        const list = this.content.querySelector(".eng-event-list");

        data.calendars.forEach(calendar => {
            const button = document.createElement("button");
            button.className = this.activeCalendars.has(calendar.name) ? "active" : "";
            button.innerText = `${calendar.name} · ${calendar.eventCount}`;
            button.title = calendar.name;
            button.addEventListener("click", () => {
                if (this.activeCalendars.has(calendar.name)) this.activeCalendars.delete(calendar.name);
                else this.activeCalendars.add(calendar.name);
                this.renderEvents();
            });
            sources.appendChild(button);
        });

        const manage = document.createElement("button");
        manage.innerText = "ACCOUNTS";
        manage.addEventListener("click", () => this.ipc.invoke("calendar-open-accounts"));
        sources.appendChild(manage);

        if (!events.length) {
            list.innerHTML = `
                <div class="eng-empty-state">
                    <strong>AGENDA CLEAR</strong>
                    NO EVENTS FOR THE SELECTED CALENDARS
                </div>`;
            return;
        }

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
                    <span>${window._escapeHtml(String(event.calendar))}${event.location ? " · "+window._escapeHtml(String(event.location)) : ""}</span>
                </div>`;
            list.appendChild(row);
        });
    }
}

class EngineeringProjectsPanel {
    constructor() {
        this.ipc = require("electron").ipcRenderer;
        this.content = document.getElementById("eng_projects_content");
        this.load();
    }

    async load() {
        this.content.innerHTML = `<div class="eng-loading"><span class="eng-scanline"></span>READING PROJECTS.JSON</div>`;
        const response = await this.ipc.invoke("engineering-projects");
        if (!response.ok) {
            this.content.innerHTML = `
                <div class="eng-empty-state">
                    <strong>PROJECT DATA ERROR</strong>
                    ${window._escapeHtml(response.error || "Cannot read projects.json")}
                    <button id="eng_projects_edit">OPEN FILE</button>
                </div>`;
            document.getElementById("eng_projects_edit").addEventListener("click", () => {
                this.ipc.invoke("engineering-open-projects");
            });
            return;
        }
        this.render(response.data.projects || []);
    }

    render(projects) {
        this.content.innerHTML = `
            <div class="eng-project-toolbar">
                <span>${projects.length} PROJECTS LOADED</span>
                <button id="eng_projects_reload">RELOAD</button>
                <button id="eng_projects_edit">EDIT JSON</button>
            </div>
            <div class="eng-project-list"></div>`;
        document.getElementById("eng_projects_reload").addEventListener("click", () => this.load());
        document.getElementById("eng_projects_edit").addEventListener("click", () => {
            this.ipc.invoke("engineering-open-projects");
        });

        const list = this.content.querySelector(".eng-project-list");
        projects.forEach((project, projectIndex) => {
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
                    <span>0${projectIndex + 1}</span>
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
            list.appendChild(article);
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
            <div class="eng-music-main">
                <div class="eng-music-connect">
                    <div class="eng-record"><span></span></div>
                    <div>
                        <p>${message}</p>
                        <button id="eng_music_connect">CONNECT APPLE MUSIC</button>
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
                <div id="eng_equalizer" class="idle"></div>
            </div>
            <aside id="eng_playlists"></aside>`;
        this.createBars();
        this.loadPlaylists();
        this.content.querySelectorAll("[data-command]").forEach(button => {
            button.addEventListener("click", async () => {
                await this.ipc.invoke("music-control", button.dataset.command);
                setTimeout(() => this.updateStatus(), 300);
            });
        });
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
        document.getElementById("eng_music_toggle").innerText = this.playing ? "Ⅱ" : "▶";
        const duration = Number(status.duration || 0);
        const position = Number(status.position || 0);
        document.getElementById("eng_music_progress").style.width =
            duration > 0 ? `${Math.min(100, position / duration * 100)}%` : "0%";
    }
}

module.exports = {
    EngineeringDashboard
};
