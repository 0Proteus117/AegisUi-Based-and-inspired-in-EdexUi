class WorkspaceManager {
    constructor(options = {}) {
        this.ipc = require("electron").ipcRenderer;
        this.definitions = Array.isArray(options.definitions) ? options.definitions : [];
        this.byId = new Map(this.definitions.map(definition => [definition.id, definition]));
        this.hub = document.getElementById(options.hubElementId);
        this.navigation = document.getElementById(options.navigationElementId);
        this.views = document.getElementById(options.viewsElementId);
        this.rendered = new Set();
        this.applicationIndex = null;
        this.activeId = "hub";

        if (!this.hub || !this.navigation || !this.views || !this.byId.has("hub")) {
            throw new Error("Workspace Manager could not find its required containers.");
        }

        this.buildNavigation();
        this.buildViews();
        this.bindKeyboardNavigation();

        const savedWorkspace = localStorage.getItem("edexui-eng-active-workspace");
        this.activate(this.byId.has(savedWorkspace) ? savedWorkspace : "hub", false);
        this.restorePersistedWorkspaceState();
    }

    escape(value) {
        return window._escapeHtml(String(value || ""));
    }

    buildNavigation() {
        this.navigation.innerHTML = "";
        this.navigation.classList.add("workspace-navigation-scalable");
        this.navigation.setAttribute("aria-label", "Workspace modes");
        const rail = document.createElement("div");
        rail.className = "workspace-nav-scroll";
        rail.setAttribute("aria-label", "Additional workspaces");

        this.definitions.forEach((definition, index) => {
            const button = document.createElement("button");
            const shortcut = this.shortcutForIndex(index);
            button.type = "button";
            button.className = "workspace-nav-button";
            if (definition.preserveExistingView || definition.id === "hub") button.classList.add("workspace-nav-hub");
            button.dataset.workspace = definition.id;
            button.dataset.navGroup = this.navigationGroup(definition);
            button.dataset.tooltip = `${definition.name} · ${shortcut}`;
            button.setAttribute("aria-controls", definition.preserveExistingView
                ? this.hub.id
                : `workspace_${definition.id}`);
            button.setAttribute("aria-label", `${definition.name}. ${shortcut}`);
            button.title = `${definition.name} · ${shortcut}`;
            button.innerHTML = `
                <span>${this.escape(this.shortcutKeyForIndex(index))}</span>
                <strong>${this.escape(this.compactNavigationLabel(definition))}</strong>`;
            button.addEventListener("click", () => this.activate(definition.id));
            if (button.classList.contains("workspace-nav-hub")) this.navigation.appendChild(button);
            else rail.appendChild(button);
        });

        this.navigation.appendChild(rail);
    }

    shortcutForIndex(index) {
        return index === 9 ? "⌘⌥0" : `⌘⌥${index + 1}`;
    }

    shortcutKeyForIndex(index) {
        return index === 9 ? "0" : String(index + 1);
    }

    compactNavigationLabel(definition) {
        const labels = {
            hub: "HUB",
            engineer: "ENG",
            osint: "OSINT",
            student: "STUD",
            artist: "ART",
            business: "BUS",
            comms: "COMMS",
            "launch-bay": "BAY",
            developer: "DEV",
            "agent-command": "AGENT"
        };
        return labels[definition.id] || definition.navigationLabel || definition.name || "MODE";
    }

    navigationGroup(definition) {
        if (definition.id === "hub") return "core";
        if (["engineer", "developer", "agent-command"].includes(definition.id)) return "build";
        if (["osint", "business", "comms"].includes(definition.id)) return "ops";
        if (["student", "artist", "launch-bay"].includes(definition.id)) return "creative";
        return "general";
    }

    buildViews() {
        this.definitions
            .filter(definition => !definition.preserveExistingView)
            .forEach(definition => {
                const view = document.createElement("section");
                view.id = `workspace_${definition.id}`;
                view.className = "workspace-view workspace-is-hidden";
                view.dataset.workspace = definition.id;
                view.setAttribute("aria-labelledby", `workspace_title_${definition.id}`);
                this.views.appendChild(view);
            });
    }

    bindKeyboardNavigation() {
        window.addEventListener("keydown", event => {
            if (!event.metaKey || !event.altKey) return;
            const index = event.key === "0" ? 9 : Number(event.key) - 1;
            if (!Number.isInteger(index) || !this.definitions[index]) return;
            event.preventDefault();
            this.activate(this.definitions[index].id);
        });
    }

    activate(workspaceId, playSound = true) {
        const definition = this.byId.get(workspaceId);
        if (!definition) return;

        const leavingHub = this.activeId === "hub" && workspaceId !== "hub";
        this.activeId = workspaceId;
        this.hub.classList.toggle("workspace-is-hidden", workspaceId !== "hub");

        this.views.querySelectorAll(".workspace-view").forEach(view => {
            view.classList.toggle("workspace-is-hidden", view.dataset.workspace !== workspaceId);
        });

        this.navigation.querySelectorAll(".workspace-nav-button").forEach(button => {
            const active = button.dataset.workspace === workspaceId;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
            if (active && !button.classList.contains("workspace-nav-hub")) {
                setTimeout(() => button.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center"
                }), 20);
            }
        });

        if (!definition.preserveExistingView && !this.rendered.has(workspaceId)) {
            this.renderWorkspace(definition);
            this.rendered.add(workspaceId);
        }

        document.body.dataset.workspace = workspaceId;
        localStorage.setItem("edexui-eng-active-workspace", workspaceId);
        if (workspaceId !== "hub") localStorage.setItem("edexui-eng-last-non-hub-workspace", workspaceId);
        this.persistWorkspaceState(workspaceId);
        const label = document.getElementById("workspace_active_label");
        if (label) label.innerText = definition.navigationLabel;

        if (workspaceId === "hub") {
            setTimeout(() => {
                const map = window.engineeringDashboard
                    && window.engineeringDashboard.mapPanel
                    && window.engineeringDashboard.mapPanel.map;
                if (map) map.invalidateSize();
            }, leavingHub ? 80 : 20);
        }

        if (playSound && window.audioManager) window.audioManager.folder.play();
    }

    async restorePersistedWorkspaceState() {
        try {
            const response = await this.ipc.invoke("workspace-state-read");
            if (!response.ok || !response.data) return;
            const storedWorkspace = response.data.activeWorkspace;
            if (this.byId.has(storedWorkspace) && storedWorkspace !== this.activeId) {
                this.activate(storedWorkspace, false);
            }
        } catch (error) {}
    }

    persistWorkspaceState(workspaceId) {
        if (!this.ipc || !this.ipc.invoke) return;
        this.ipc.invoke("workspace-state-save", {
            activeWorkspace: workspaceId,
            lastNonHubWorkspace: workspaceId === "hub"
                ? localStorage.getItem("edexui-eng-last-non-hub-workspace") || ""
                : workspaceId
        }).catch(() => {});
    }

    getActiveWorkspace() {
        return this.activeId;
    }

    restoreWorkspace(workspaceId) {
        if (!workspaceId || !this.byId.has(workspaceId) || this.activeId === workspaceId) return;
        this.activate(workspaceId, false);
    }

    renderWorkspace(definition) {
        const view = document.getElementById(`workspace_${definition.id}`);
        if (!view) return;

        view.innerHTML = `
            <header class="workspace-header">
                <div>
                    <span class="workspace-eyebrow">WORKSPACE / ${this.escape(definition.navigationLabel)}</span>
                    <h1 id="workspace_title_${this.escape(definition.id)}">${this.escape(definition.name)}</h1>
                    <p>${this.escape(definition.description)}</p>
                </div>
                <div class="workspace-header-status">
                    <small>IMPLEMENTATION</small>
                    <strong>${this.escape(definition.implementation || definition.status)}</strong>
                    <span>${this.escape((definition.categories || []).join(" · "))}</span>
                </div>
            </header>
            <section class="workspace-quickbar" aria-label="Quick actions"></section>
            <section class="workspace-grid"></section>
            <div class="workspace-toast" role="status" aria-live="polite"></div>`;

        this.renderQuickActions(view, definition.quickActions || []);
        if (definition.id === "engineer") this.renderEngineer(view, definition);
        else if (definition.id === "launch-bay") this.renderLaunchBay(view, definition);
        else if (definition.id === "developer") this.renderDeveloper(view, definition);
        else if (definition.id === "agent-command") this.renderAgentCommand(view, definition);
        else this.renderFoundation(view, definition);
    }

    renderQuickActions(view, actions) {
        const quickbar = view.querySelector(".workspace-quickbar");
        if (!actions.length) {
            quickbar.classList.add("empty");
            quickbar.innerHTML = "<span>NO QUICK ACTIONS CONFIGURED</span>";
            return;
        }

        actions.forEach(action => quickbar.appendChild(this.createActionButton(action, view, true)));
    }

    renderEngineer(view, definition) {
        const grid = view.querySelector(".workspace-grid");
        const projectWidget = definition.widgets.find(widget => widget.type === "project-status");
        const sourceWidget = definition.widgets.find(widget => widget.id === "engineering-sector-pulse");
        const researchWidget = definition.widgets.find(widget => widget.id === "engineering-research");
        const standardsWidget = definition.widgets.find(widget => widget.id === "engineering-standards");
        const roadmapWidget = definition.widgets.find(widget => widget.type === "roadmap");

        grid.classList.add("engineer-workspace-grid");
        grid.appendChild(this.createPanel(projectWidget, "workspace-projects"));
        grid.appendChild(this.createToolPanel(definition, view));
        grid.appendChild(this.createListPanel(sourceWidget, view));
        grid.appendChild(this.createListPanel(researchWidget, view));
        grid.appendChild(this.createListPanel(standardsWidget, view));
        grid.appendChild(this.createRoadmapPanel(roadmapWidget));

        const projectPanel = grid.querySelector(".workspace-projects .workspace-panel-content");
        this.loadEngineeringProjects(projectPanel, view);
    }

    renderFoundation(view, definition) {
        const grid = view.querySelector(".workspace-grid");
        grid.classList.add("foundation-workspace-grid");

        (definition.widgets || []).forEach(widget => {
            if (widget.type === "status-list") {
                grid.appendChild(this.createStatusListPanel(widget));
            } else if (widget.type === "link-list") {
                grid.appendChild(this.createListPanel(widget, view));
            } else {
                const panel = this.createPanel(widget, "");
                panel.querySelector(".workspace-panel-content").innerHTML = `
                    <div class="workspace-placeholder">
                        <span>${this.escape(widget.status || "future")}</span>
                        <strong>${this.escape(widget.name)}</strong>
                        <p>${this.escape(widget.description || "Module boundary defined and ready for a future integration.")}</p>
                    </div>`;
                grid.appendChild(panel);
            }
        });

        const tools = document.createElement("article");
        tools.className = "workspace-panel workspace-tools-overview";
        tools.innerHTML = `
            <header><h2>RECOMMENDED TOOLCHAIN</h2><span>CONFIGURED</span></header>
            <div class="workspace-panel-content"></div>`;
        const content = tools.querySelector(".workspace-panel-content");
        (definition.recommendedTools || []).forEach(group => {
            const section = document.createElement("section");
            section.className = "workspace-tool-group";
            section.innerHTML = `<h3>${this.escape(group.category)}</h3><div></div>`;
            group.items.forEach(item => section.querySelector("div").appendChild(
                this.createActionButton(item, view, false)
            ));
            content.appendChild(section);
        });
        grid.appendChild(tools);
    }

    async renderLaunchBay(view, definition) {
        view.classList.add("launch-bay-workspace");
        const grid = view.querySelector(".workspace-grid");
        grid.classList.add("launch-bay-grid");
        grid.innerHTML = `
            <div class="launch-bay-backdrop" aria-hidden="true"></div>
            <article class="launch-bay-stage workspace-panel">
                <header><h2>GAME LIBRARY</h2><span>LOCAL</span></header>
                <div class="workspace-panel-content">
                    <div class="workspace-loading">READING LOCAL GAME LIBRARY</div>
                </div>
            </article>
            <article class="launch-bay-detail workspace-panel">
                <header><h2>SELECTED TITLE</h2><span>STANDBY</span></header>
                <div class="workspace-panel-content"></div>
            </article>`;

        const response = await this.ipc.invoke("launch-bay-games");
        if (!response.ok) {
            grid.querySelector(".launch-bay-stage .workspace-panel-content").innerHTML =
                `<div class="workspace-empty">GAME LIBRARY UNAVAILABLE</div>`;
            return;
        }

        const games = Array.isArray(response.data.games) ? response.data.games : [];
        this.launchBayState = {
            games,
            index: Math.min(Number(localStorage.getItem("aegisui-launch-bay-index")) || 0, Math.max(games.length - 1, 0))
        };

        const render = () => this.renderLaunchBayState(view);
        render();

        if (!view.dataset.launchBayKeyboardBound) {
            view.dataset.launchBayKeyboardBound = "true";
            window.addEventListener("keydown", event => {
                if (this.activeId !== "launch-bay" || !this.launchBayState) return;
                if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    this.moveLaunchBaySelection(view, -1);
                } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    this.moveLaunchBaySelection(view, 1);
                } else if (event.key === "Enter") {
                    event.preventDefault();
                    this.launchSelectedGame(view);
                }
            });
        }
    }

    renderLaunchBayState(view) {
        const state = this.launchBayState || {games: [], index: 0};
        const stage = view.querySelector(".launch-bay-stage .workspace-panel-content");
        const detail = view.querySelector(".launch-bay-detail .workspace-panel-content");
        const detailStatus = view.querySelector(".launch-bay-detail > header span");
        const backdrop = view.querySelector(".launch-bay-backdrop");
        if (!stage || !detail || !backdrop) return;

        if (!state.games.length) {
            stage.innerHTML = `<div class="workspace-empty">NO GAMES CONFIGURED</div>`;
            detail.innerHTML = `
                <div class="workspace-placeholder">
                    <span>LOCAL CONFIG</span>
                    <strong>Launch Bay is empty</strong>
                    <p>Add games in launch-bay-games.json inside the app data folder.</p>
                </div>`;
            return;
        }

        const selected = state.games[state.index] || state.games[0];
        const safeHeroUrl = String(selected.heroUrl || "").replace(/"/g, "%22");
        backdrop.style.backgroundImage = safeHeroUrl
            ? `linear-gradient(115deg, rgba(7,11,16,.92), rgba(19,38,58,.66)), url("${safeHeroUrl}")`
            : "";
        backdrop.classList.toggle("has-image", Boolean(safeHeroUrl));

        stage.innerHTML = `
            <button class="launch-bay-nav previous" type="button" aria-label="Previous game">‹</button>
            <div class="launch-bay-carousel" aria-label="Configured games"></div>
            <button class="launch-bay-nav next" type="button" aria-label="Next game">›</button>`;
        stage.querySelector(".previous").addEventListener("click", () => this.moveLaunchBaySelection(view, -1));
        stage.querySelector(".next").addEventListener("click", () => this.moveLaunchBaySelection(view, 1));

        const carousel = stage.querySelector(".launch-bay-carousel");
        state.games.forEach((game, index) => {
            const offset = index - state.index;
            const card = document.createElement("button");
            card.type = "button";
            card.className = "launch-bay-card";
            card.dataset.offset = String(offset);
            card.classList.toggle("selected", index === state.index);
            card.classList.toggle("distant", Math.abs(offset) > 2);
            card.style.setProperty("--offset", String(Math.max(-3, Math.min(3, offset))));
            card.style.setProperty("--abs-offset", String(Math.min(3, Math.abs(offset))));

            const cover = document.createElement("div");
            cover.className = "launch-bay-cover";
            if (game.coverUrl) {
                const image = document.createElement("img");
                image.src = game.coverUrl;
                image.alt = "";
                image.loading = "lazy";
                cover.appendChild(image);
            } else {
                cover.innerHTML = `
                    <span>${this.escape(game.platform || "GAME")}</span>
                    <strong>${this.escape(game.title)}</strong>`;
            }

            const label = document.createElement("span");
            label.className = "launch-bay-card-label";
            label.innerText = game.title;
            card.appendChild(cover);
            card.appendChild(label);
            card.addEventListener("click", () => {
                state.index = index;
                localStorage.setItem("aegisui-launch-bay-index", String(index));
                this.renderLaunchBayState(view);
            });
            carousel.appendChild(card);
        });

        const status = selected.launchUrl
            ? String(selected.status || "external").toUpperCase()
            : "NOT CONFIGURED";
        if (detailStatus) {
            detailStatus.className = this.statusClass(status);
            detailStatus.innerText = status;
        }

        const tags = Array.isArray(selected.tags) ? selected.tags : [];
        detail.innerHTML = `
            <div class="launch-bay-selected">
                <span>${this.escape(selected.platform || "Manual")}</span>
                <h2>${this.escape(selected.title)}</h2>
                <p>${selected.launchUrl
                    ? this.escape(selected.launchUrl)
                    : "No launchUrl configured. Steam games can use steam://rungameid/<APP_ID>."}</p>
                <div class="launch-bay-tags">
                    ${tags.length ? tags.map(tag => `<em>${this.escape(tag)}</em>`).join("") : "<em>NO TAGS</em>"}
                </div>
                <div class="launch-bay-actions">
                    <button id="launch_bay_play" type="button">${selected.launchUrl ? "LAUNCH" : "NOT CONFIGURED"}</button>
                    <button id="launch_bay_config" type="button">OPEN CONFIG</button>
                </div>
                <small>Arrow keys select · Enter launches · config stays local.</small>
            </div>`;

        detail.querySelector("#launch_bay_play").addEventListener("click", () => this.launchSelectedGame(view));
        detail.querySelector("#launch_bay_config").addEventListener("click", async () => {
            const response = await this.ipc.invoke("launch-bay-open-config");
            this.showToast(view, response.ok ? "OPENING LOCAL GAME CONFIG" : response.error);
        });
    }

    moveLaunchBaySelection(view, direction) {
        const state = this.launchBayState;
        if (!state || !state.games.length) return;
        state.index = (state.index + direction + state.games.length) % state.games.length;
        localStorage.setItem("aegisui-launch-bay-index", String(state.index));
        this.renderLaunchBayState(view);
    }

    async launchSelectedGame(view) {
        const state = this.launchBayState;
        const selected = state && state.games[state.index];
        if (!selected || !selected.launchUrl) {
            this.showToast(view, "NOT CONFIGURED");
            return;
        }

        const response = await this.ipc.invoke("launch-bay-launch", selected.launchUrl);
        this.showToast(view, response.ok ? `LAUNCHING ${selected.title}` : response.error);
    }

    async renderDeveloper(view, definition) {
        view.classList.add("developer-workspace");
        const grid = view.querySelector(".workspace-grid");
        grid.classList.add("developer-grid");
        grid.innerHTML = `
            <article class="workspace-panel developer-terminal-panel">
                <header><h2>TERMINAL BRIDGE</h2><span>ACTIVE</span></header>
                <div class="workspace-panel-content">
                    <div class="workspace-loading">READING TERMINAL STATE</div>
                </div>
            </article>
            <article class="workspace-panel developer-git-panel">
                <header><h2>GIT STATUS</h2><span>LOADING</span></header>
                <div class="workspace-panel-content"></div>
            </article>
            <article class="workspace-panel developer-scripts-panel">
                <header><h2>QUICK SCRIPTS</h2><span>SAFE MODE</span></header>
                <div class="workspace-panel-content"></div>
            </article>
            <article class="workspace-panel developer-logs-panel">
                <header><h2>LOGS / CONSOLE</h2><span>READ ONLY</span></header>
                <div class="workspace-panel-content"></div>
            </article>
            <article class="workspace-panel developer-structure-panel">
                <header><h2>PROJECT STRUCTURE</h2><span>SUMMARY</span></header>
                <div class="workspace-panel-content"></div>
            </article>
            <article class="workspace-panel developer-health-panel">
                <header><h2>DEPENDENCY / HEALTH</h2><span>LOCAL</span></header>
                <div class="workspace-panel-content"></div>
            </article>`;

        await this.refreshDeveloper(view);
    }

    async refreshDeveloper(view) {
        const response = await this.ipc.invoke("developer-deck-data");
        if (!response.ok) {
            view.querySelector(".developer-terminal-panel .workspace-panel-content").innerHTML =
                `<div class="workspace-empty">DEVELOPER DATA UNAVAILABLE</div>`;
            this.showToast(view, response.error);
            return;
        }
        this.developerData = response.data;
        this.renderDeveloperTerminal(view, response.data);
        this.renderDeveloperGit(view, response.data);
        this.renderDeveloperScripts(view, response.data);
        this.renderDeveloperLogs(view, response.data);
        this.renderDeveloperStructure(view, response.data);
        this.renderDeveloperHealth(view, response.data);
    }

    renderDeveloperTerminal(view, data) {
        const content = view.querySelector(".developer-terminal-panel .workspace-panel-content");
        const term = window.term && window.term[window.currentTerm];
        const cwd = term && term.cwd ? term.cwd : "Terminal cwd unavailable";
        const process = term && term.process ? term.process : "interactive shell";
        content.innerHTML = `
            <div class="developer-terminal-readout">
                <div class="developer-terminal-screen">
                    <p><span>user@aegis</span>:<strong>~ developer</strong>$ terminal bridge --status</p>
                    <p>ACTIVE PROJECT: ${this.escape(data.projectPath || "UNCONFIGURED")}</p>
                    <p>CURRENT TERM: ${this.escape(String(window.currentTerm || 0))} · ${this.escape(process)}</p>
                    <p>CWD: ${this.escape(cwd)}</p>
                    <p>MODE: SAFE FOUNDATION · NO ARBITRARY COMMAND EXECUTION</p>
                </div>
                <div class="developer-terminal-actions">
                    <button id="developer_focus_terminal" type="button">FOCUS HUB TERMINAL</button>
                    <button id="developer_refresh" type="button">REFRESH STATUS</button>
                    <button id="developer_config" type="button">OPEN CONFIG</button>
                </div>
            </div>`;
        content.querySelector("#developer_focus_terminal").addEventListener("click", () => {
            this.activate("hub", false);
            setTimeout(() => {
                if (window.term && window.term[window.currentTerm]) window.term[window.currentTerm].term.focus();
            }, 80);
        });
        content.querySelector("#developer_refresh").addEventListener("click", () => this.refreshDeveloper(view));
        content.querySelector("#developer_config").addEventListener("click", async () => {
            const response = await this.ipc.invoke("developer-open-config");
            this.showToast(view, response.ok ? "OPENING DEVELOPER CONFIG" : response.error);
        });
    }

    renderDeveloperGit(view, data) {
        const panel = view.querySelector(".developer-git-panel");
        const content = panel.querySelector(".workspace-panel-content");
        const status = panel.querySelector("header span");
        const git = data.git || {};
        status.className = git.available ? (git.clean ? "online" : "login-required") : "offline";
        status.innerText = git.available ? (git.clean ? "CLEAN" : "DIRTY") : "UNAVAILABLE";

        content.innerHTML = `
            <div class="developer-git-summary">
                <div><small>BRANCH</small><strong>${this.escape(git.branch || "UNAVAILABLE")}</strong></div>
                <div><small>LAST COMMIT</small><strong>${this.escape(git.lastCommit || "NO DATA")}</strong></div>
                <div><small>MODIFIED</small><strong>${this.escape(String(git.modifiedCount || 0))}</strong></div>
            </div>
            <div class="developer-file-list"></div>
            <div class="developer-placeholder-actions">
                <button type="button">COMMIT PLACEHOLDER</button>
                <button type="button">PUSH PLACEHOLDER</button>
            </div>`;

        const list = content.querySelector(".developer-file-list");
        const files = Array.isArray(git.files) ? git.files : [];
        if (!git.available) {
            list.innerHTML = `<div class="workspace-empty">${this.escape(git.error || "NOT A GIT REPOSITORY")}</div>`;
        } else if (!files.length) {
            list.innerHTML = `<div class="workspace-empty">WORKTREE CLEAN</div>`;
        } else {
            files.forEach(file => {
                const row = document.createElement("div");
                row.innerHTML = `<span>${this.escape(file.status)}</span><strong>${this.escape(file.path)}</strong>`;
                list.appendChild(row);
            });
        }
        content.querySelectorAll(".developer-placeholder-actions button").forEach(button => {
            button.addEventListener("click", () => this.showToast(view, "GIT ACTIONS ARE PLACEHOLDERS IN THIS FOUNDATION"));
        });
    }

    renderDeveloperScripts(view, data) {
        const content = view.querySelector(".developer-scripts-panel .workspace-panel-content");
        const scripts = data.scripts && Array.isArray(data.scripts.scripts) ? data.scripts.scripts : [];
        if (!scripts.length) {
            content.innerHTML = `<div class="workspace-empty">NO PACKAGE SCRIPTS DETECTED</div>`;
            return;
        }

        content.innerHTML = `<div class="developer-script-list"></div>`;
        const list = content.querySelector(".developer-script-list");
        scripts.forEach(script => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = script.favorite ? "favorite" : "";
            button.innerHTML = `
                <strong>npm run ${this.escape(script.name)}</strong>
                <small>${this.escape(script.command)}</small>
                <em>${script.favorite ? "FAVORITE" : "DETECTED"}</em>`;
            button.addEventListener("click", async () => {
                const response = await this.ipc.invoke("developer-run-script", script.name);
                this.showToast(view, response.ok ? `RUNNING ${script.name}` : response.error);
            });
            list.appendChild(button);
        });
    }

    renderDeveloperLogs(view, data) {
        const content = view.querySelector(".developer-logs-panel .workspace-panel-content");
        const logs = Array.isArray(data.logs) ? data.logs : [];
        content.innerHTML = `<div class="developer-log-lines"></div>`;
        const lines = content.querySelector(".developer-log-lines");
        logs.forEach((line, index) => {
            const row = document.createElement("p");
            row.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span>${this.escape(line)}`;
            lines.appendChild(row);
        });
    }

    renderDeveloperStructure(view, data) {
        const content = view.querySelector(".developer-structure-panel .workspace-panel-content");
        const structure = Array.isArray(data.structure) ? data.structure : [];
        if (!structure.length) {
            content.innerHTML = `<div class="workspace-empty">NO PROJECT STRUCTURE FOUND</div>`;
            return;
        }

        content.innerHTML = `<div class="developer-structure-list"></div>`;
        const list = content.querySelector(".developer-structure-list");
        structure.forEach(entry => {
            const button = document.createElement("button");
            button.type = "button";
            button.innerHTML = `
                <span>${entry.type === "directory" ? "DIR" : "FILE"}</span>
                <strong>${this.escape(entry.label)}</strong>`;
            button.addEventListener("click", async () => {
                const response = await this.ipc.invoke("developer-open-project-file", entry.path);
                this.showToast(view, response.ok ? `OPENING ${entry.label}` : response.error);
            });
            list.appendChild(button);
        });
    }

    renderDeveloperHealth(view, data) {
        const content = view.querySelector(".developer-health-panel .workspace-panel-content");
        const health = data.health || {};
        const rows = [
            ["NODE", health.node || "UNAVAILABLE"],
            ["ELECTRON", health.electron || "UNAVAILABLE"],
            ["CHROME", health.chrome || "UNAVAILABLE"],
            ["NPM", health.npm || "UNAVAILABLE"],
            ["PACKAGE LOCK", health.packageLock ? "FOUND" : "MISSING"],
            ["NODE MODULES", health.nodeModules ? "FOUND" : "MISSING"],
            ["DEPENDENCIES", String(health.dependencyCount || 0)],
            ["DEV DEPENDENCIES", String(health.devDependencyCount || 0)],
            ["AUDIT", health.audit || "PLACEHOLDER"]
        ];

        content.innerHTML = `<div class="developer-health-list"></div>`;
        const list = content.querySelector(".developer-health-list");
        rows.forEach(([label, value]) => {
            const row = document.createElement("div");
            row.innerHTML = `<span>${this.escape(label)}</span><strong>${this.escape(value)}</strong>`;
            list.appendChild(row);
        });
    }

    async renderAgentCommand(view) {
        view.classList.add("agent-command-workspace");
        const grid = view.querySelector(".workspace-grid");
        grid.classList.add("agent-command-grid");
        grid.innerHTML = `
            <article class="workspace-panel agent-command-agents-panel">
                <header><h2>AGENT WINDOWS</h2><span>LOCAL</span></header>
                <div class="workspace-panel-content">
                    <div class="workspace-loading">LOADING AGENT PROFILES</div>
                </div>
            </article>
            <article class="workspace-panel agent-command-board-panel">
                <header><h2>TASK BOARD</h2><span>APPROVAL FIRST</span></header>
                <div class="workspace-panel-content"></div>
            </article>
            <article class="workspace-panel agent-command-output-panel">
                <header><h2>SELECTED AGENT</h2><span>PLACEHOLDER</span></header>
                <div class="workspace-panel-content"></div>
            </article>
            <article class="workspace-panel agent-command-safety-panel">
                <header><h2>CONTROL LOCKS</h2><span>ARMED</span></header>
                <div class="workspace-panel-content"></div>
            </article>`;

        await this.refreshAgentCommand(view);
    }

    async refreshAgentCommand(view) {
        const response = await this.ipc.invoke("agent-command-data");
        if (!response.ok) {
            view.querySelector(".agent-command-agents-panel .workspace-panel-content").innerHTML =
                `<div class="workspace-empty">AGENT COMMAND DATA UNAVAILABLE</div>`;
            this.showToast(view, response.error);
            return;
        }

        this.agentCommandState = response.data;
        const agents = Array.isArray(response.data.agents) ? response.data.agents : [];
        const storedAgent = localStorage.getItem("aegisui-agent-command-selected");
        if (!agents.some(agent => agent.id === storedAgent)) {
            localStorage.setItem("aegisui-agent-command-selected", agents[0] ? agents[0].id : "");
        }

        this.renderAgentCommandAgents(view);
        this.renderAgentCommandBoard(view);
        this.renderAgentCommandOutput(view);
        this.renderAgentCommandSafety(view);
    }

    selectedAgentCommandAgent() {
        const data = this.agentCommandState || {};
        const agents = Array.isArray(data.agents) ? data.agents : [];
        const selectedId = localStorage.getItem("aegisui-agent-command-selected");
        return agents.find(agent => agent.id === selectedId) || agents[0] || null;
    }

    renderAgentCommandAgents(view) {
        const content = view.querySelector(".agent-command-agents-panel .workspace-panel-content");
        const agents = Array.isArray(this.agentCommandState.agents) ? this.agentCommandState.agents : [];
        if (!agents.length) {
            content.innerHTML = `<div class="workspace-empty">NO AGENTS CONFIGURED</div>`;
            return;
        }

        const selected = this.selectedAgentCommandAgent();
        content.innerHTML = `<div class="agent-command-agent-list"></div>`;
        const list = content.querySelector(".agent-command-agent-list");
        agents.forEach(agent => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "agent-command-agent-card";
            button.classList.toggle("selected", selected && selected.id === agent.id);
            const status = String(agent.status || "IDLE").toUpperCase();
            button.innerHTML = `
                <span class="${this.statusClass(status)}">${this.escape(status)}</span>
                <strong>${this.escape(agent.name)}</strong>
                <small>${this.escape(agent.role)} · L${this.escape(String(agent.permissionLevel || 0))}</small>
                <p>${this.escape(agent.description)}</p>`;
            button.addEventListener("click", () => {
                localStorage.setItem("aegisui-agent-command-selected", agent.id);
                this.renderAgentCommandAgents(view);
                this.renderAgentCommandOutput(view);
            });
            list.appendChild(button);
        });
    }

    renderAgentCommandBoard(view) {
        const content = view.querySelector(".agent-command-board-panel .workspace-panel-content");
        const tasks = Array.isArray(this.agentCommandState.tasks) ? this.agentCommandState.tasks : [];
        const agents = new Map((this.agentCommandState.agents || []).map(agent => [agent.id, agent]));
        if (!tasks.length) {
            content.innerHTML = `<div class="workspace-empty">NO TASKS CONFIGURED</div>`;
            return;
        }

        content.innerHTML = `<div class="agent-command-task-board"></div>`;
        const board = content.querySelector(".agent-command-task-board");
        tasks.forEach(task => {
            const agent = agents.get(task.assignedAgent) || {};
            const row = document.createElement("section");
            row.className = "agent-command-task-card";
            row.innerHTML = `
                <div class="agent-command-task-main">
                    <span class="agent-command-priority ${this.statusClass(task.priority)}">${this.escape(task.priority)}</span>
                    <strong>${this.escape(task.title)}</strong>
                    <small>${this.escape(task.type)} · ${this.escape(agent.name || task.assignedAgent || "UNASSIGNED")}</small>
                    <p>${this.escape(task.result || "No result yet.")}</p>
                </div>
                <div class="agent-command-task-state">
                    <em class="${this.statusClass(task.status)}">${this.escape(task.status)}</em>
                    <button type="button" data-action="copy">COPY RESULT</button>
                    <button type="button" data-action="reviewed">MARK REVIEWED</button>
                    <button type="button" data-action="route">SEND TO NEXT AGENT</button>
                </div>`;
            row.querySelector('[data-action="copy"]').addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(task.result || "");
                    this.showToast(view, "TASK RESULT COPIED");
                } catch (error) {
                    this.showToast(view, "CLIPBOARD UNAVAILABLE");
                }
            });
            row.querySelector('[data-action="reviewed"]').addEventListener("click", async () => {
                const response = await this.ipc.invoke("agent-command-update-task", {
                    taskId: task.id,
                    action: "mark-reviewed"
                });
                if (response.ok) {
                    this.agentCommandState = response.data;
                    this.renderAgentCommandBoard(view);
                    this.renderAgentCommandSafety(view);
                }
                this.showToast(view, response.ok ? "TASK MARKED REVIEWED" : response.error);
            });
            row.querySelector('[data-action="route"]').addEventListener("click", async () => {
                const response = await this.ipc.invoke("agent-command-update-task", {
                    taskId: task.id,
                    action: "route-next-agent"
                });
                if (response.ok) {
                    this.agentCommandState = response.data;
                    this.renderAgentCommandAgents(view);
                    this.renderAgentCommandBoard(view);
                    this.renderAgentCommandOutput(view);
                }
                this.showToast(view, response.ok ? "TASK ROUTED TO NEXT AGENT" : response.error);
            });
            board.appendChild(row);
        });
    }

    renderAgentCommandOutput(view) {
        const panel = view.querySelector(".agent-command-output-panel");
        const content = panel.querySelector(".workspace-panel-content");
        const status = panel.querySelector("header span");
        const agent = this.selectedAgentCommandAgent();
        if (!agent) {
            content.innerHTML = `<div class="workspace-empty">NO AGENT SELECTED</div>`;
            return;
        }

        const agentStatus = String(agent.status || "IDLE").toUpperCase();
        status.className = this.statusClass(agentStatus);
        status.innerText = agentStatus;
        const contexts = Array.isArray(agent.assignedContext) ? agent.assignedContext : [];
        content.innerHTML = `
            <div class="agent-command-selected-agent">
                <div class="agent-command-agent-head">
                    <span>${this.escape(agent.role)}</span>
                    <strong>${this.escape(agent.name)}</strong>
                    <small>PERMISSION LEVEL ${this.escape(String(agent.permissionLevel || 0))} · ${agent.permissionLevel === 1 ? "DRAFT" : "READ ONLY"}</small>
                </div>
                <div class="agent-command-prompt">
                    <em>BASE PROMPT</em>
                    <p>${this.escape(agent.basePrompt)}</p>
                </div>
                <div class="agent-command-context">
                    ${contexts.length ? contexts.map(item => `<span>${this.escape(item)}</span>`).join("") : "<span>NO CONTEXT</span>"}
                </div>
                <div class="agent-command-output">
                    <em>CURRENT OUTPUT</em>
                    <p>${this.escape(agent.output)}</p>
                </div>
                <div class="agent-command-output-actions">
                    <button id="agent_command_request" type="button">REQUEST PROPOSAL</button>
                    <button id="agent_command_config" type="button">OPEN CONFIG</button>
                    <button id="agent_command_refresh" type="button">REFRESH</button>
                </div>
            </div>`;
        content.querySelector("#agent_command_request").addEventListener("click", async () => {
            const response = await this.ipc.invoke("agent-command-run-agent", agent.id);
            this.showToast(view, response.ok ? "AGENT REQUEST STARTED" : response.error);
        });
        content.querySelector("#agent_command_config").addEventListener("click", async () => {
            const response = await this.ipc.invoke("agent-command-open-config");
            this.showToast(view, response.ok ? "OPENING AGENT COMMAND CONFIG" : response.error);
        });
        content.querySelector("#agent_command_refresh").addEventListener("click", () => this.refreshAgentCommand(view));
    }

    renderAgentCommandSafety(view) {
        const content = view.querySelector(".agent-command-safety-panel .workspace-panel-content");
        const data = this.agentCommandState || {};
        const flow = Array.isArray(data.approvalFlow) ? data.approvalFlow : [];
        const locks = Array.isArray(data.safetyLocks) ? data.safetyLocks : [];
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        const approved = tasks.filter(task => task.status === "APPROVED" || task.status === "DONE").length;

        content.innerHTML = `
            <div class="agent-command-permissions">
                <div><strong>L0</strong><span>READ ONLY</span><p>Reads selected context and proposes.</p></div>
                <div><strong>L1</strong><span>DRAFT</span><p>Drafts text/diffs only. No file writes.</p></div>
                <div class="future"><strong>L2+</strong><span>FUTURE LOCKED</span><p>Apply/autonomy levels are disabled.</p></div>
            </div>
            <div class="agent-command-metrics">
                <div><small>MODE</small><strong>${this.escape(data.mode || "visual-foundation")}</strong></div>
                <div><small>AUTONOMY</small><strong>${data.autonomyEnabled ? "ENABLED" : "DISABLED"}</strong></div>
                <div><small>REVIEWED</small><strong>${approved}/${tasks.length}</strong></div>
            </div>
            <div class="agent-command-flow">
                <h3>APPROVAL FLOW</h3>
                ${flow.map((step, index) => `<p><span>${String(index + 1).padStart(2, "0")}</span>${this.escape(step)}</p>`).join("")}
            </div>
            <div class="agent-command-locks">
                <h3>SAFETY LOCKS</h3>
                ${locks.map(lock => `<p>${this.escape(lock)}</p>`).join("")}
            </div>`;
    }

    createPanel(widget = {}, extraClass = "") {
        const panel = document.createElement("article");
        panel.className = `workspace-panel ${extraClass}`.trim();
        panel.innerHTML = `
            <header>
                <h2>${this.escape(widget.name || "MODULE")}</h2>
                <span class="${this.escape(widget.status || "future")}">${this.escape(widget.status || "future")}</span>
            </header>
            <div class="workspace-panel-content"></div>`;
        return panel;
    }

    createToolPanel(definition, view) {
        const panel = this.createPanel({
            name: "CAD / CAE / Simulation launchpad",
            status: "active"
        }, "workspace-tool-launchpad");
        const content = panel.querySelector(".workspace-panel-content");

        (definition.recommendedTools || []).forEach(group => {
            const section = document.createElement("section");
            section.className = "workspace-tool-group";
            section.innerHTML = `<h3>${this.escape(group.category)}</h3><div></div>`;
            group.items.forEach(item => section.querySelector("div").appendChild(
                this.createActionButton(item, view, false)
            ));
            content.appendChild(section);
        });
        return panel;
    }

    createListPanel(widget = {}, view) {
        const panel = this.createPanel(widget);
        const content = panel.querySelector(".workspace-panel-content");
        if (widget.description) {
            const description = document.createElement("p");
            description.className = "workspace-panel-description";
            description.innerText = widget.description;
            content.appendChild(description);
        }
        const list = document.createElement("div");
        list.className = "workspace-link-list";
        (widget.items || []).forEach(item => list.appendChild(this.createActionButton(item, view, false)));
        content.appendChild(list);
        return panel;
    }

    createRoadmapPanel(widget = {}) {
        const panel = this.createPanel(widget);
        const content = panel.querySelector(".workspace-panel-content");
        content.classList.add("workspace-roadmap");
        (widget.items || []).forEach((item, index) => {
            const row = document.createElement("div");
            row.innerHTML = `
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${this.escape(item.label)}</strong>
                <em>${this.escape(item.status)}</em>`;
            content.appendChild(row);
        });
        return panel;
    }

    createStatusListPanel(widget = {}) {
        const panel = this.createPanel(widget);
        const content = panel.querySelector(".workspace-panel-content");
        content.classList.add("workspace-status-list");
        (widget.items || []).forEach(item => {
            const row = document.createElement("div");
            const status = String(item.status || "external").toUpperCase();
            row.innerHTML = `
                <strong>${this.escape(item.label)}</strong>
                <span class="${this.statusClass(status)}">${this.escape(status)}</span>
                <p>${this.escape(item.detail || "")}</p>`;
            content.appendChild(row);
        });
        return panel;
    }

    statusClass(status) {
        return String(status || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    createActionButton(action, view, prominent) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `workspace-action ${prominent ? "prominent" : ""}`.trim();
        const status = action.status
            ? String(action.status).toUpperCase()
            : (action.type === "application" ? "APP" : "EXTERNAL");
        button.innerHTML = `
            ${status ? `<em class="workspace-action-status ${this.statusClass(status)}">${this.escape(status)}</em>` : ""}
            <strong>${this.escape(action.label)}</strong>
            ${action.description ? `<small>${this.escape(action.description)}</small>` : ""}`;

        if (action.type === "application") {
            button.dataset.action = "application";
            button.addEventListener("click", () => this.launchApplication(action, view, button));
        } else {
            button.dataset.action = "link";
            button.addEventListener("click", () => this.openLink(action.url, view));
        }
        return button;
    }

    async loadEngineeringProjects(container, view) {
        if (!container) return;
        container.innerHTML = `<div class="workspace-loading">READING HUB PROJECTS</div>`;
        const response = await this.ipc.invoke("engineering-projects");
        if (!response.ok) {
            container.innerHTML = `<div class="workspace-empty">PROJECT DATA UNAVAILABLE</div>`;
            return;
        }

        const projects = Array.isArray(response.data.projects) ? response.data.projects : [];
        container.innerHTML = `<div class="workspace-project-list"></div>`;
        const list = container.querySelector(".workspace-project-list");
        projects.slice(0, 4).forEach(project => {
            const milestones = Array.isArray(project.milestones) ? project.milestones : [];
            const completed = milestones.filter(item => item.status === "complete").length;
            const active = milestones.filter(item => item.status === "active").length;
            const progress = milestones.length
                ? Math.round(((completed + active * 0.5) / milestones.length) * 100)
                : 0;
            const row = document.createElement("div");
            row.className = "workspace-project-row";
            row.innerHTML = `
                <div>
                    <strong>${this.escape(project.name || "PROJECT")}</strong>
                    <small>${completed}/${milestones.length} COMPLETE · ${active} ACTIVE</small>
                </div>
                <span>${progress}%</span>
                <i><b style="width:${progress}%"></b></i>`;
            list.appendChild(row);
        });

        const manage = document.createElement("button");
        manage.type = "button";
        manage.className = "workspace-manage-projects";
        manage.innerText = "OPEN PROJECT CONTROL";
        manage.addEventListener("click", () => {
            if (window.engineeringDashboard && window.engineeringDashboard.projectsPanel) {
                window.engineeringDashboard.projectsPanel.openEditor(0, {
                    returnWorkspaceId: this.getActiveWorkspace()
                });
            }
        });
        container.appendChild(manage);
    }

    async openLink(url, view) {
        const response = await this.ipc.invoke("workspace-open-link", url);
        this.showToast(view, response.ok
            ? `OPENED · ${response.status || "EXTERNAL"}`
            : `${response.status || "ERROR"} · ${response.error}`);
    }

    async launchApplication(action, view, button) {
        button.classList.add("loading");
        let applications;
        try {
            if (!this.applicationIndex) this.applicationIndex = this.ipc.invoke("applications-list");
            applications = await this.applicationIndex;
        } catch (error) {
            this.applicationIndex = null;
            button.classList.remove("loading");
            this.showToast(view, "APPLICATION INDEX IS UNAVAILABLE");
            return;
        }
        const aliases = (action.aliases || []).map(alias => alias.toLowerCase());
        const application = applications.find(candidate => {
            const name = String(candidate.name || "").toLowerCase();
            return aliases.some(alias => name === alias || name.includes(alias));
        });
        button.classList.remove("loading");

        if (!application) {
            this.showToast(view, `APP NOT FOUND · ${action.label}`);
            return;
        }

        const response = await this.ipc.invoke("launch-application", application.path);
        this.showToast(view, response.ok ? `LAUNCHING ${application.name}` : response.error);
    }

    showToast(view, message) {
        const toast = view.querySelector(".workspace-toast");
        if (!toast) return;
        toast.innerText = String(message || "ACTION UNAVAILABLE").toUpperCase();
        toast.classList.add("visible");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
    }
}

module.exports = {
    WorkspaceManager
};
