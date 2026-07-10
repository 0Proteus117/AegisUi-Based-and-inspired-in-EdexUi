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

    setActiveWorkspace(workspaceId) {
        const aliases = {
            HUB: "hub",
            ENGINEER: "engineer",
            ENG: "engineer",
            OSINT: "osint",
            STUDENT: "student",
            STUD: "student",
            ARTIST: "artist",
            ART: "artist",
            BUSINESS: "business",
            BUS: "business",
            COMMS: "comms",
            LAUNCH_BAY: "launch-bay",
            BAY: "launch-bay",
            DEVELOPER: "developer",
            DEV: "developer",
            AGENT_COMMAND: "agent-command",
            AGENT: "agent-command"
        };
        const requested = String(workspaceId || "");
        const normalized = aliases[requested] || aliases[requested.toUpperCase()] || requested;
        if (this.byId.has(normalized)) this.activate(normalized);
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
        view.classList.add("engineer-command-deck");
        grid.classList.add("engineer-command-grid");
        this.engineeringView = view;
        this.engineeringRegistry = window.EngineeringToolsRegistry;
        this.engineeringTools = (this.engineeringRegistry ? this.engineeringRegistry.TOOLS : []).map(tool => ({...tool}));
        this.engineeringAppIndex = null;

        const categoryTiles = (this.engineeringRegistry ? this.engineeringRegistry.CATEGORIES : []).map(category => `
            <button type="button" class="eng-category-tile" data-eng-category="${this.escape(category.id)}">
                <span>${this.escape(category.icon)}</span>
                <strong>${this.escape(category.title)}</strong>
                <small>${this.escape(category.description)}</small>
            </button>`).join("");

        grid.innerHTML = `
            <section class="eng-command-hero workspace-panel">
                <div class="eng-command-title">
                    <small>ENG / SPECIALIZED COMMAND DECK</small>
                    <h2>ENGINEERING COMMAND DECK</h2>
                    <p>CAD/CAM, CAE, manufacturing, calculators, materials, research and live project context.</p>
                </div>
                <div class="eng-command-stats">
                    <div><small>APPS</small><strong data-eng-stat="apps">DETECTING</strong></div>
                    <div><small>WEB</small><strong data-eng-stat="web">0</strong></div>
                    <div><small>TOOLS</small><strong data-eng-stat="internal">0</strong></div>
                    <div><small>PROJECTS</small><strong data-eng-stat="projects">HUB</strong></div>
                </div>
            </section>
            <section class="eng-category-strip">${categoryTiles}</section>
            <section class="eng-projects-card workspace-panel">
                <header><h2>ENGINEERING PROJECTS</h2><span>HUB LINK</span></header>
                <div class="workspace-panel-content"><div class="workspace-loading">READING HUB PROJECTS</div></div>
            </section>
            <section class="eng-calculators-card workspace-panel">
                <header><h2>QUICK CALCULATORS</h2><span>LOCAL</span></header>
                <div class="workspace-panel-content" data-eng-section="calculators"></div>
            </section>
            <section class="eng-tools-card workspace-panel">
                <header><h2>CAD / CAM / CAE</h2><span>DETECTING</span></header>
                <div class="workspace-panel-content" data-eng-section="cad-simulation"></div>
            </section>
            <section class="eng-manufacturing-card workspace-panel">
                <header><h2>MANUFACTURING / 3D PRINT</h2><span>ACTIVE</span></header>
                <div class="workspace-panel-content" data-eng-section="manufacturing"></div>
            </section>
            <section class="eng-materials-card workspace-panel">
                <header><h2>MATERIALS / REFERENCES</h2><span>READY</span></header>
                <div class="workspace-panel-content" data-eng-section="materials"></div>
            </section>
            <section class="eng-research-card workspace-panel">
                <header><h2>RESEARCH / STANDARDS</h2><span>WEB</span></header>
                <div class="workspace-panel-content" data-eng-section="research-standards"></div>
            </section>`;

        this.renderEngineeringToolSections(view);
        this.loadEngineeringProjects(grid.querySelector(".eng-projects-card .workspace-panel-content"), view);
        this.bindEngineeringDeck(view);
        this.detectEngineeringApps(view);
        this.updateEngineeringStats(view);
    }

    bindEngineeringDeck(view) {
        view.querySelectorAll("[data-eng-category]").forEach(button => {
            button.addEventListener("click", () => this.openEngineeringCategory(button.dataset.engCategory));
        });
        view.querySelectorAll("[data-eng-tool]").forEach(button => {
            button.addEventListener("click", event => {
                const action = event.target && event.target.dataset ? event.target.dataset.engAction : "";
                const toolId = button.dataset.engTool;
                if (action === "open") this.executeEngineeringTool(toolId, view);
                else this.openEngineeringToolById(toolId);
            });
        });
    }

    renderEngineeringToolSections(view) {
        const buckets = {
            "calculators": ["calculators"],
            "cad-simulation": ["cad", "simulation"],
            "manufacturing": ["manufacturing"],
            "materials": ["materials"],
            "research-standards": ["research", "standards"]
        };
        Object.entries(buckets).forEach(([sectionId, categories]) => {
            const container = view.querySelector(`[data-eng-section="${sectionId}"]`);
            if (!container) return;
            const tools = this.engineeringTools.filter(tool => categories.includes(tool.category));
            container.innerHTML = `<div class="eng-tool-grid">${tools.map(tool => this.engineeringToolCard(tool)).join("")}</div>`;
        });
    }

    engineeringToolCard(tool) {
        const status = this.engineeringToolStatus(tool);
        const actionLabel = tool.type === "app"
            ? (status === "INSTALLED" ? "OPEN" : "INFO")
            : (tool.type === "web" ? "OPEN WEB" : (tool.type === "planned" ? "PLANNED" : "OPEN"));
        return `
            <button type="button" class="eng-tool-card" data-eng-tool="${this.escape(tool.id)}" data-type="${this.escape(tool.type)}">
                <span class="eng-tool-icon">${this.escape(tool.icon || "▧")}</span>
                <em class="${this.statusClass(status)}">${this.escape(status)}</em>
                <strong>${this.escape(tool.title)}</strong>
                <small>${this.escape(tool.description || "")}</small>
                <i>
                    <b data-eng-action="open">${this.escape(actionLabel)}</b>
                    <b data-eng-action="expand">EXPAND</b>
                </i>
            </button>`;
    }

    engineeringToolStatus(tool) {
        if (!tool) return "UNKNOWN";
        if (tool.type === "app") return tool.installed ? "INSTALLED" : "NOT FOUND";
        if (tool.type === "web") return "WEB";
        if (tool.type === "internal") return "READY";
        return String(tool.status || "PLANNED").toUpperCase();
    }

    async detectEngineeringApps(view = this.engineeringView) {
        try {
            if (!this.applicationIndex) this.applicationIndex = this.ipc.invoke("applications-list");
            const applications = await this.applicationIndex;
            const list = Array.isArray(applications) ? applications : [];
            this.engineeringAppIndex = list;
            this.engineeringTools = this.engineeringTools.map(tool => {
                if (tool.type !== "app") return tool;
                const aliases = (tool.aliases || [tool.appName || tool.title]).map(alias => String(alias).toLowerCase());
                const match = list.find(candidate => {
                    const name = String(candidate.name || "").toLowerCase();
                    return aliases.some(alias => name === alias || name.includes(alias));
                });
                return {...tool, installed: Boolean(match), applicationPath: match && match.path, detectedName: match && match.name};
            });
            if (view) {
                this.renderEngineeringToolSections(view);
                this.bindEngineeringDeck(view);
                this.updateEngineeringStats(view);
            }
        } catch (error) {
            this.showToast(view, "APP DETECTION UNAVAILABLE");
        }
    }

    updateEngineeringStats(view = this.engineeringView) {
        if (!view || !this.engineeringTools) return;
        const installed = this.engineeringTools.filter(tool => tool.type === "app" && tool.installed).length;
        const apps = this.engineeringTools.filter(tool => tool.type === "app").length;
        const web = this.engineeringTools.filter(tool => tool.type === "web").length;
        const internal = this.engineeringTools.filter(tool => tool.type === "internal").length;
        const set = (key, value) => {
            const node = view.querySelector(`[data-eng-stat="${key}"]`);
            if (node) node.innerText = value;
        };
        set("apps", `${installed}/${apps}`);
        set("web", String(web));
        set("internal", String(internal));
    }

    openEngineeringCategory(categoryId) {
        const view = this.engineeringView || document.getElementById("workspace_engineer");
        if (!view || !this.engineeringRegistry) return;
        if (this.activeId !== "engineer") this.activate("engineer", false);
        const category = this.engineeringRegistry.CATEGORIES.find(item => item.id === categoryId);
        const tools = this.engineeringTools.filter(tool => tool.category === categoryId);
        this.openEngineeringDetail({
            title: category ? category.title : "Engineering category",
            icon: category ? category.icon : "▧",
            status: "ACTIVE",
            body: `
                <p>${this.escape(category ? category.description : "Engineering category tools.")}</p>
                <div class="eng-detail-tool-list">${tools.map(tool => this.engineeringToolCard(tool)).join("")}</div>`
        });
        this.bindEngineeringDetailToolActions();
    }

    openEngineeringToolById(toolId) {
        if (this.activeId !== "engineer") this.activate("engineer", false);
        const tool = this.engineeringTools && this.engineeringTools.find(item => item.id === toolId);
        if (!tool) return;
        const status = this.engineeringToolStatus(tool);
        const actions = `
            <button type="button" data-eng-detail-action="execute" data-tool-id="${this.escape(tool.id)}">${tool.type === "web" ? "OPEN WEB" : tool.type === "app" ? "OPEN / INFO" : "RUN TOOL"}</button>
            <button type="button" data-eng-detail-action="close">CLOSE</button>`;
        this.openEngineeringDetail({
            title: tool.title,
            icon: tool.icon,
            status,
            body: this.engineeringToolDetailBody(tool),
            actions
        });
        this.bindEngineeringDetailControls(tool);
    }

    openEngineeringCalculator(calculatorId) {
        const tool = this.engineeringTools.find(item => item.actionId === calculatorId || item.id === calculatorId);
        if (tool) this.openEngineeringToolById(tool.id);
    }

    engineeringToolDetailBody(tool) {
        if (tool.type === "internal") return this.engineeringInternalToolBody(tool);
        if (tool.type === "app") {
            const status = this.engineeringToolStatus(tool);
            return `
                <div class="eng-detail-readout">
                    <div><small>TYPE</small><strong>APPLICATION</strong></div>
                    <div><small>STATUS</small><strong>${this.escape(status)}</strong></div>
                    <div><small>DETECTED</small><strong>${this.escape(tool.detectedName || "NOT FOUND")}</strong></div>
                    <div><small>PATH</small><strong>${this.escape(tool.applicationPath || "UNAVAILABLE")}</strong></div>
                </div>
                <p>${this.escape(tool.description || "")}</p>
                ${tool.url ? `<p class="eng-detail-url">${this.escape(tool.url)}</p>` : ""}`;
        }
        if (tool.type === "web") {
            return `<p>${this.escape(tool.description || "")}</p><p class="eng-detail-url">${this.escape(tool.url || "")}</p>`;
        }
        return `<p>${this.escape(tool.description || "Planned engineering integration.")}</p>`;
    }

    engineeringSliderField(label, name, value, min, max, step, unit = "") {
        const safeName = this.escape(name);
        return `
            <div class="aegis-calc-control">
                <label for="eng_calc_${safeName}">
                    <span>${this.escape(label)}</span>
                    <em data-calc-live="${safeName}">${this.escape(String(value))}${unit ? ` ${this.escape(unit)}` : ""}</em>
                </label>
                <input class="aegis-slider" type="range" min="${this.escape(String(min))}" max="${this.escape(String(max))}" step="${this.escape(String(step))}" value="${this.escape(String(value))}" data-sync-input="${safeName}" data-default="${this.escape(String(value))}">
                <div class="aegis-inline-input">
                    <input id="eng_calc_${safeName}" class="aegis-number-input" name="${safeName}" type="number" step="${this.escape(String(step))}" value="${this.escape(String(value))}" data-default="${this.escape(String(value))}">
                    ${unit ? `<b>${this.escape(unit)}</b>` : ""}
                </div>
            </div>`;
    }

    engineeringInternalToolBody(tool) {
        const registry = this.engineeringRegistry;
        if (!registry) return `<p>Registry unavailable.</p>`;
        if (tool.actionId === "unit_converter") {
            const familyOptions = Object.entries(registry.unitFamilies).map(([id, family]) => `<option value="${this.escape(id)}">${this.escape(family.label)}</option>`).join("");
            return `
                <form class="eng-calc-form aegis-calc-panel" data-calc="unit_converter">
                    <section class="aegis-calc-diagram eng-diagram-unit">
                        <div class="eng-unit-column"><span data-unit-icon>↔</span><strong>SOURCE</strong><em data-unit-from>mm</em></div>
                        <div class="eng-unit-transfer" aria-hidden="true"><span>CONVERT</span><i>→</i><b></b></div>
                        <div class="eng-unit-column"><span data-unit-icon-target>↔</span><strong>TARGET</strong><em data-unit-to>cm</em></div>
                    </section>
                    <section class="aegis-calc-controls">
                        <label class="aegis-field">Family<select class="aegis-select" name="family">${familyOptions}</select></label>
                        ${this.engineeringSliderField("Value", "value", 1000, 0, 10000, 1)}
                        <label class="aegis-field">From<select class="aegis-select" name="from"></select></label>
                        <label class="aegis-field">To<select class="aegis-select" name="to"></select></label>
                    </section>
                    <section class="aegis-result-readout"><small>CONVERSION</small><output></output></section>
                    <div class="aegis-calc-actions"><button type="button" data-calc-action="reset">RESET</button><button type="button" data-calc-action="copy">COPY RESULT</button></div>
                </form>`;
        }
        if (tool.actionId === "torque_power_rpm") {
            return `
                <form class="eng-calc-form aegis-calc-panel" data-calc="torque_power_rpm">
                    <section class="aegis-calc-diagram eng-diagram-torque">
                        <div class="eng-powertrain-stage">
                            <svg class="eng-power-gauge" viewBox="0 0 240 240" aria-label="Powertrain RPM, torque and power gauge">
                                <circle class="eng-gauge-track" cx="120" cy="120" r="94"></circle>
                                <circle class="eng-power-ring" data-power-ring cx="120" cy="120" r="94"></circle>
                                <circle class="eng-rpm-arc" data-rpm-arc cx="120" cy="120" r="78"></circle>
                                <path class="eng-rpm-ticks" d="M120 25V38 M174 39L168 50 M213 78L202 84 M227 132H214 M207 185L196 178 M164 216L158 204 M76 213L82 201 M36 180L47 174 M14 128H28 M30 74L42 81 M72 37L79 50"></path>
                            </svg>
                            <div class="eng-rotor" data-rotor><span class="eng-rotor-shaft"></span><i class="eng-rotor-blades"></i></div>
                            <div class="eng-torque-vector" data-torque-vector><span>τ</span><i></i></div>
                            <div class="eng-powertrain-values">
                                <span><small>RPM</small><strong data-rpm-readout>3000</strong></span>
                                <span><small>TORQUE</small><strong data-torque-readout>250 Nm</strong></span>
                                <span><small>POWER</small><strong data-power-readout>78.54 kW</strong></span>
                            </div>
                        </div>
                        <div class="eng-formula"><strong>P = τω</strong><small data-torque-solved>INPUT: TORQUE + RPM</small></div>
                    </section>
                    <section class="aegis-calc-controls">
                        ${this.engineeringSliderField("Torque", "torqueNm", 250, 0, 1200, 1, "Nm")}
                        ${this.engineeringSliderField("Power", "powerKw", 78.54, 0, 500, 0.01, "kW")}
                        ${this.engineeringSliderField("RPM", "rpm", 3000, 0, 12000, 10, "rpm")}
                    </section>
                    <small class="aegis-calc-note">Enter any two values. Clear one numeric field to solve for it. P = τω.</small>
                    <section class="aegis-result-readout"><small>POWERTRAIN RELATION</small><output></output></section>
                    <div class="aegis-calc-actions"><button type="button" data-calc-action="reset">RESET</button><button type="button" data-calc-action="copy">COPY RESULT</button></div>
                </form>`;
        }
        if (tool.actionId === "material_mass") {
            const materials = Object.entries(registry.MATERIALS).map(([id, item]) => `<option value="${this.escape(id)}">${this.escape(item.label)}</option>`).join("");
            return `
                <form class="eng-calc-form aegis-calc-panel" data-calc="material_mass">
                    <section class="aegis-calc-diagram eng-diagram-mass">
                        <svg class="eng-material-part" viewBox="0 0 430 245" role="img" aria-label="Technical material block with dimensions">
                            <defs>
                                <linearGradient id="engMaterialFront" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".25"></stop><stop offset="1" stop-color="currentColor" stop-opacity=".08"></stop></linearGradient>
                                <marker id="engDimensionArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z"></path></marker>
                            </defs>
                            <g class="eng-material-shape" data-material-shape>
                                <polygon class="eng-material-face eng-material-front" data-material-front points="105,92 292,92 292,188 105,188"></polygon>
                                <polygon class="eng-material-face eng-material-top" data-material-top points="105,92 148,54 335,54 292,92"></polygon>
                                <polygon class="eng-material-face eng-material-side" data-material-side points="292,92 335,54 335,150 292,188"></polygon>
                            </g>
                            <g class="eng-material-dimensions">
                                <line data-material-length-line x1="105" y1="211" x2="292" y2="211"></line>
                                <text data-material-length x="198" y="230">L 46.4 mm</text>
                                <line data-material-height-line x1="78" y1="92" x2="78" y2="188"></line>
                                <text data-material-height x="63" y="143">H 46.4 mm</text>
                                <line data-material-width-line x1="307" y1="79" x2="350" y2="41"></line>
                                <text data-material-width x="353" y="42">W 46.4 mm</text>
                            </g>
                        </svg>
                        <div class="eng-material-meta">
                            <strong data-material-label>ALUMINIUM 6061-T6</strong>
                            <small data-material-density>2700 kg/m³</small>
                            <span><b data-material-volume>100 cm³</b><em data-material-source>DIRECT VOLUME</em></span>
                        </div>
                    </section>
                    <section class="aegis-calc-controls">
                        <label class="aegis-field">Material<select class="aegis-select" name="materialId">${materials}</select></label>
                        ${this.engineeringSliderField("Density", "density", 2700, 100, 9000, 1, "kg/m³")}
                        ${this.engineeringSliderField("Volume", "volumeCm3", 100, 0, 20000, 1, "cm³")}
                        ${this.engineeringSliderField("Length", "lengthMm", 0, 0, 1000, 1, "mm")}
                        ${this.engineeringSliderField("Width", "widthMm", 0, 0, 1000, 1, "mm")}
                        ${this.engineeringSliderField("Height", "heightMm", 0, 0, 1000, 1, "mm")}
                    </section>
                    <section class="aegis-result-readout"><small>MASS ESTIMATE</small><output></output></section>
                    <div class="aegis-calc-actions"><button type="button" data-calc-action="reset">RESET</button><button type="button" data-calc-action="copy">COPY RESULT</button></div>
                </form>`;
        }
        if (tool.actionId === "gear_ratio") {
            return `
                <form class="eng-calc-form aegis-calc-panel" data-calc="gear_ratio">
                    <section class="aegis-calc-diagram eng-diagram-gears">
                        <div class="eng-gear-node eng-gear-driver-node">
                            <strong>DRIVER</strong>
                            <div class="eng-gear eng-gear-driver"><span class="eng-gear-teeth" data-gear-teeth></span><i class="eng-gear-ring"></i><b class="eng-gear-hub"></b></div>
                            <small><b data-driver-teeth>20T</b><em data-driver-rpm>3000 rpm</em></small>
                        </div>
                        <div class="eng-gear-transfer" aria-hidden="true"><strong>→</strong><small>OPPOSITE ROTATION</small></div>
                        <div class="eng-gear-node eng-gear-driven-node">
                            <strong>DRIVEN</strong>
                            <div class="eng-gear eng-gear-driven"><span class="eng-gear-teeth" data-gear-teeth></span><i class="eng-gear-ring"></i><b class="eng-gear-hub"></b></div>
                            <small><b data-driven-teeth>60T</b><em data-driven-rpm>1000 rpm</em></small>
                        </div>
                        <div class="eng-gear-ratio-strip"><span>DRIVER</span><i>MECHANICAL MESH</i><span>DRIVEN</span></div>
                    </section>
                    <section class="aegis-calc-controls">
                        ${this.engineeringSliderField("Driver Teeth", "driverTeeth", 20, 5, 120, 1)}
                        ${this.engineeringSliderField("Driven Teeth", "drivenTeeth", 60, 5, 160, 1)}
                        ${this.engineeringSliderField("Input RPM", "inputRpm", 3000, 0, 16000, 10, "rpm")}
                    </section>
                    <section class="aegis-result-readout"><small>GEAR TRAIN OUTPUT</small><output></output></section>
                    <div class="aegis-calc-actions"><button type="button" data-calc-action="reset">RESET</button><button type="button" data-calc-action="copy">COPY RESULT</button></div>
                </form>`;
        }
        if (tool.actionId === "beam_deflection") {
            return `
                <form class="eng-calc-form aegis-calc-panel" data-calc="beam_deflection">
                    <section class="aegis-calc-diagram eng-diagram-beam">
                        <svg viewBox="0 0 420 150" role="img" aria-label="Simply supported beam center load">
                            <path class="beam-neutral" d="M35 82 H385"></path>
                            <path class="beam-deflected" data-beam-path d="M35 82 Q210 100 385 82"></path>
                            <path class="beam-load" data-beam-load d="M210 18 V74"></path>
                            <path class="beam-load-head" data-beam-load-head d="M198 62 L210 78 L222 62"></path>
                            <path class="beam-support" d="M52 92 L30 125 H74 Z M368 92 L346 125 H390 Z"></path>
                            <path class="beam-span" d="M52 135 H368 M52 130 V140 M368 130 V140"></path>
                            <text class="beam-span-label" x="210" y="147" text-anchor="middle" data-beam-span>500 mm SPAN</text>
                        </svg>
                        <small>SIMPLY SUPPORTED · CENTER LOAD · <b data-beam-visual-deflection>0.0000 mm</b> · APPROXIMATE</small>
                    </section>
                    <section class="aegis-calc-controls">
                        ${this.engineeringSliderField("Length", "lengthMm", 500, 50, 5000, 1, "mm")}
                        ${this.engineeringSliderField("Center Force", "forceN", 100, 0, 5000, 1, "N")}
                        ${this.engineeringSliderField("E", "elasticModulusGPa", 69, 1, 250, 0.1, "GPa")}
                        ${this.engineeringSliderField("I", "secondMomentMm4", 10000, 100, 1000000, 10, "mm⁴")}
                    </section>
                    <small class="aegis-calc-note">Approximate simply supported beam with center point load.</small>
                    <section class="aegis-result-readout"><small>DEFLECTION</small><output></output></section>
                    <div class="aegis-calc-actions"><button type="button" data-calc-action="reset">RESET</button><button type="button" data-calc-action="copy">COPY RESULT</button></div>
                </form>`;
        }
        if (tool.actionId === "thread_reference") {
            return `
                <section class="aegis-calc-panel eng-thread-panel" data-thread-reference>
                    <div class="aegis-calc-diagram eng-diagram-thread">
                        <svg class="eng-thread-technical" viewBox="0 0 440 190" role="img" aria-label="Metric screw thread technical profile">
                            <defs><marker id="engThreadArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z"></path></marker></defs>
                            <rect class="eng-thread-shank" x="94" y="70" width="270" height="58" rx="4"></rect>
                            <path class="eng-thread-head" d="M40 54H96V144H40L20 124V74Z"></path>
                            <path class="eng-thread-profile" data-thread-profile-top d=""></path>
                            <path class="eng-thread-profile" data-thread-profile-bottom d=""></path>
                            <line class="eng-thread-axis" x1="18" y1="99" x2="394" y2="99"></line>
                            <line class="eng-thread-pitch-line" data-thread-pitch-line x1="170" y1="42" x2="190" y2="42"></line>
                            <text class="eng-thread-pitch-label" data-thread-pitch-label x="180" y="31" text-anchor="middle">PITCH 0.5 mm</text>
                            <text class="eng-thread-size-label" data-thread-size-label x="230" y="104" text-anchor="middle">M3 × 0.5</text>
                        </svg>
                        <div class="eng-thread-readout">
                            <strong data-thread-active>M3 × 0.5</strong>
                            <span><small>PITCH</small><b data-thread-pitch>0.5 mm</b></span>
                            <span><small>TAP DRILL</small><b data-thread-tap>2.5 mm</b></span>
                            <span><small>CLEARANCE</small><b data-thread-clearance>3.4 mm</b></span>
                        </div>
                    </div>
                    <div class="eng-thread-table" role="table">
                        <div class="eng-thread-row eng-thread-header" role="row"><strong>THREAD</strong><span>PITCH</span><span>TAP DRILL</span><span>CLEARANCE</span></div>
                        ${registry.THREAD_REFERENCES.map((row, index) => `
                            <button type="button" class="eng-thread-row${index === 0 ? " active" : ""}" data-thread-index="${index}" role="row">
                                <strong>${this.escape(row.nominal)}</strong><span>${this.escape(String(row.pitch))} mm</span><span>${this.escape(String(row.tapDrill))} mm</span><span>${this.escape(String(row.clearance))} mm</span>
                            </button>`).join("")}
                    </div>
                </section>`;
        }
        if (tool.actionId === "material_card") {
            const material = registry.MATERIALS[tool.materialId] || {};
            return `
                <div class="eng-material-card-detail">
                    <strong>${this.escape(material.label || tool.title)}</strong>
                    <span>${this.escape(String(material.density || tool.density || "UNKNOWN"))} kg/m³</span>
                    <p>${this.escape(material.note || tool.description || "")}</p>
                </div>`;
        }
        if (tool.actionId === "project_control") {
            return `<p>Open the existing HUB Project Control without duplicating project logic.</p>`;
        }
        return `<p>${this.escape(tool.description || "Internal tool ready.")}</p>`;
    }

    openEngineeringDetail({title, icon, status, body, actions = ""}) {
        let overlay = document.getElementById("eng_tool_detail_overlay");
        if (!overlay) {
            overlay = document.createElement("section");
            overlay.id = "eng_tool_detail_overlay";
            overlay.className = "eng-detail-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.addEventListener("click", event => {
                if (event.target === overlay) this.closeEngineeringDetail();
            });
            overlay.addEventListener("mousedown", event => {
                if (event.target !== overlay) event.stopPropagation();
            });
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <article class="eng-detail-panel">
                <header>
                    <span>${this.escape(icon || "▧")}</span>
                    <div><small>ENGINEERING DETAIL</small><h2>${this.escape(title || "Engineering tool")}</h2></div>
                    <em class="${this.statusClass(status)}">${this.escape(status || "ACTIVE")}</em>
                    <button type="button" class="eng-detail-close" aria-label="Close engineering detail">×</button>
                </header>
                <section class="eng-detail-body">${body || ""}</section>
                <footer>${actions || `<button type="button" data-eng-detail-action="close">CLOSE</button>`}</footer>
            </article>`;
        overlay.classList.add("visible");
        const close = overlay.querySelector(".eng-detail-close");
        if (close) close.addEventListener("click", () => this.closeEngineeringDetail());
        overlay.querySelectorAll('[data-eng-detail-action="close"]').forEach(button => {
            button.addEventListener("click", () => this.closeEngineeringDetail());
        });
        this.bindEngineeringCalculators(overlay);
        document.addEventListener("keydown", this.boundEngineeringDetailEscape = this.boundEngineeringDetailEscape || (event => {
            if (event.key === "Escape") this.closeEngineeringDetail();
        }));
    }

    closeEngineeringDetail() {
        const overlay = document.getElementById("eng_tool_detail_overlay");
        if (overlay) overlay.classList.remove("visible");
    }

    bindEngineeringDetailControls(tool) {
        const overlay = document.getElementById("eng_tool_detail_overlay");
        if (!overlay) return;
        overlay.querySelectorAll('[data-eng-detail-action="execute"]').forEach(button => {
            button.addEventListener("click", () => this.executeEngineeringTool(tool.id, this.engineeringView));
        });
    }

    bindEngineeringDetailToolActions() {
        const overlay = document.getElementById("eng_tool_detail_overlay");
        if (!overlay) return;
        overlay.querySelectorAll("[data-eng-tool]").forEach(button => {
            button.addEventListener("click", event => {
                const action = event.target && event.target.dataset ? event.target.dataset.engAction : "";
                const toolId = button.dataset.engTool;
                if (action === "open") this.executeEngineeringTool(toolId, this.engineeringView);
                else this.openEngineeringToolById(toolId);
            });
        });
    }

    bindEngineeringCalculators(root) {
        root.querySelectorAll(".eng-calc-form").forEach(form => {
            const update = event => {
                const source = event && event.target;
                this.syncEngineeringCalcControls(form, source);
                this.updateEngineeringCalculator(form, source);
            };
            form.addEventListener("input", update);
            form.addEventListener("change", update);
            form.querySelectorAll('[data-calc-action="reset"]').forEach(button => {
                button.addEventListener("click", () => {
                    form.querySelectorAll("[data-default]").forEach(input => {
                        input.value = input.dataset.default || "";
                    });
                    this.syncEngineeringCalcControls(form);
                    this.updateEngineeringCalculator(form, null);
                });
            });
            form.querySelectorAll('[data-calc-action="copy"]').forEach(button => {
                button.addEventListener("click", async () => {
                    const text = form.querySelector("output") ? form.querySelector("output").innerText : "";
                    if (!text) return;
                    try {
                        await navigator.clipboard.writeText(text);
                        button.innerText = "COPIED";
                        setTimeout(() => button.innerText = "COPY RESULT", 900);
                    } catch (error) {
                        button.innerText = "COPY FAILED";
                        setTimeout(() => button.innerText = "COPY RESULT", 900);
                    }
                });
            });
            if (form.dataset.calc === "unit_converter") this.syncUnitConverterSelects(form);
            update();
        });
        root.querySelectorAll("[data-thread-reference]").forEach(panel => {
            if (panel.dataset.threadBound === "true") return;
            panel.dataset.threadBound = "true";
            panel.querySelectorAll("[data-thread-index]").forEach(button => {
                button.addEventListener("click", () => this.updateEngineeringThreadReference(panel, Number(button.dataset.threadIndex || 0)));
            });
            this.updateEngineeringThreadReference(panel, 0);
        });
    }

    syncEngineeringCalcControls(form, source = null) {
        if (!form) return;
        if (source && source.matches && source.matches(".aegis-slider[data-sync-input]")) {
            const target = form.elements[source.dataset.syncInput];
            if (target) target.value = source.value;
        } else if (source && source.name) {
            const slider = form.querySelector(`.aegis-slider[data-sync-input="${source.name}"]`);
            if (slider && source.value !== "") {
                const number = Number(source.value);
                if (Number.isFinite(number)) {
                    slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), number)));
                }
            }
        } else {
            form.querySelectorAll(".aegis-slider[data-sync-input]").forEach(slider => {
                const target = form.elements[slider.dataset.syncInput];
                if (target && target.value !== "") slider.value = target.value;
            });
        }
        form.querySelectorAll(".aegis-slider[data-sync-input]").forEach(slider => {
            const target = form.elements[slider.dataset.syncInput];
            const live = form.querySelector(`[data-calc-live="${slider.dataset.syncInput}"]`);
            if (live) {
                const suffix = target && target.parentElement ? target.parentElement.querySelector("b") : null;
                live.innerText = `${target ? target.value : slider.value}${suffix ? ` ${suffix.innerText}` : ""}`;
            }
        });
    }

    syncUnitConverterSelects(form) {
        const family = form.elements.family.value;
        const registry = this.engineeringRegistry;
        const units = registry && registry.unitFamilies[family] ? Object.keys(registry.unitFamilies[family].units) : [];
        ["from", "to"].forEach((name, index) => {
            const select = form.elements[name];
            const previous = select.value;
            select.innerHTML = units.map(unit => `<option value="${this.escape(unit)}">${this.escape(unit)}</option>`).join("");
            select.value = units.includes(previous) ? previous : (units[index] || units[0] || "");
        });
    }

    updateEngineeringCalculator(form, source = null) {
        const registry = this.engineeringRegistry;
        if (!registry) return;
        const values = Object.fromEntries(Array.from(new FormData(form).entries()));
        let result;
        if (form.dataset.calc === "unit_converter") {
            this.syncUnitConverterSelects(form);
            result = registry.convertUnit(values);
            form.querySelector("output").innerText = result.ok
                ? `${registry.round(result.input, 5)} ${result.from} = ${registry.round(result.result, 5)} ${result.to}`
                : result.error;
            this.updateEngineeringCalculatorVisual(form, result);
        }
        if (form.dataset.calc === "torque_power_rpm") {
            const missing = ["torqueNm", "powerKw", "rpm"].filter(name => values[name] === "");
            let solvedField = missing.length === 1 ? missing[0] : null;
            const calculationValues = {...values};
            if (!solvedField) {
                solvedField = source && source.name === "powerKw" ? "torqueNm" : "powerKw";
                calculationValues[solvedField] = undefined;
            } else {
                calculationValues[solvedField] = undefined;
            }
            result = registry.calculateTorquePowerRpm(calculationValues);
            if (result.ok && solvedField && form.elements[solvedField]) {
                const resultKey = solvedField === "torqueNm" ? "torqueNm" : solvedField === "powerKw" ? "powerKw" : "rpm";
                form.elements[solvedField].value = registry.round(result[resultKey], solvedField === "rpm" ? 1 : 3);
                this.syncEngineeringCalcControls(form, form.elements[solvedField]);
                form.dataset.solvedField = solvedField;
            }
            form.querySelector("output").innerText = result.ok
                ? `${registry.round(result.torqueNm, 3)} Nm · ${registry.round(result.powerKw, 3)} kW · ${registry.round(result.rpm, 1)} rpm`
                : result.error;
            this.updateEngineeringCalculatorVisual(form, result);
        }
        if (form.dataset.calc === "material_mass") {
            const material = registry.MATERIALS[values.materialId] || {};
            if ((source && source.name === "materialId" && material.density) || ((!values.density || Number(values.density) === 0) && material.density)) {
                form.elements.density.value = material.density;
                this.syncEngineeringCalcControls(form, form.elements.density);
            }
            result = registry.calculateMaterialMass({...Object.fromEntries(Array.from(new FormData(form).entries())), density: form.elements.density.value});
            form.querySelector("output").innerText = result.ok
                ? `${registry.round(result.massKg, 4)} kg · ${registry.round(result.massKg * 1000, 1)} g`
                : result.error;
            this.updateEngineeringCalculatorVisual(form, result);
        }
        if (form.dataset.calc === "gear_ratio") {
            result = registry.calculateGearRatio(values);
            form.querySelector("output").innerText = result.ok
                ? `Ratio ${registry.round(result.ratio, 4)}:1 · Output ${registry.round(result.outputRpm, 1)} rpm · Torque ×${registry.round(result.torqueMultiplier, 3)}`
                : result.error;
            this.updateEngineeringCalculatorVisual(form, result);
        }
        if (form.dataset.calc === "beam_deflection") {
            result = registry.calculateBeamDeflection(values);
            form.querySelector("output").innerText = result.ok
                ? `Deflection ≈ ${registry.round(result.deflectionMm, 4)} mm`
                : result.error;
            this.updateEngineeringCalculatorVisual(form, result);
        }
    }

    updateEngineeringCalculatorVisual(form, result = {}) {
        const values = Object.fromEntries(Array.from(new FormData(form).entries()));
        if (form.dataset.calc === "unit_converter") {
            const family = this.engineeringRegistry.unitFamilies[values.family] || {};
            const icon = family.icon || "↔";
            const from = form.querySelector("[data-unit-from]");
            const to = form.querySelector("[data-unit-to]");
            const sourceIcon = form.querySelector("[data-unit-icon]");
            const targetIcon = form.querySelector("[data-unit-icon-target]");
            if (from) from.innerText = values.from || "";
            if (to) to.innerText = values.to || "";
            if (sourceIcon) sourceIcon.innerText = icon;
            if (targetIcon) targetIcon.innerText = icon;
        }
        if (form.dataset.calc === "torque_power_rpm") {
            const diagram = form.querySelector(".eng-diagram-torque");
            const rotor = form.querySelector(".eng-rotor");
            const rpm = Math.max(0, Number(result.rpm ?? values.rpm ?? 0));
            const torque = Math.max(0, Number(result.torqueNm ?? values.torqueNm ?? 0));
            const power = Math.max(0, Number(result.powerKw ?? values.powerKw ?? 0));
            const rpmRatio = Math.min(1, rpm / 12000);
            const torqueRatio = Math.min(1, torque / 1200);
            const powerRatio = Math.min(1, power / 500);
            if (rotor) {
                rotor.style.setProperty("--rpm-speed", `${rpm > 0 ? Math.max(.65, Math.min(7, 9000 / Math.max(300, rpm))) : 0}s`);
                rotor.classList.toggle("stationary", rpm <= 0);
            }
            if (diagram) {
                diagram.style.setProperty("--rpm-ratio", String(rpmRatio));
                diagram.style.setProperty("--torque-ratio", String(torqueRatio));
                diagram.style.setProperty("--power-ratio", String(powerRatio));
            }
            const rpmArc = form.querySelector("[data-rpm-arc]");
            const powerRing = form.querySelector("[data-power-ring]");
            if (rpmArc) rpmArc.style.strokeDashoffset = String(490.09 * (1 - rpmRatio));
            if (powerRing) powerRing.style.strokeDashoffset = String(590.62 * (1 - powerRatio));
            const readouts = {
                "[data-rpm-readout]": `${this.engineeringRegistry.round(rpm, 1)}`,
                "[data-torque-readout]": `${this.engineeringRegistry.round(torque, 2)} Nm`,
                "[data-power-readout]": `${this.engineeringRegistry.round(power, 3)} kW`
            };
            Object.entries(readouts).forEach(([selector, text]) => {
                const node = form.querySelector(selector);
                if (node) node.innerText = text;
            });
            const solved = form.querySelector("[data-torque-solved]");
            if (solved) {
                const labels = {torqueNm: "TORQUE", powerKw: "POWER", rpm: "RPM"};
                solved.innerText = form.dataset.solvedField ? `SOLVED: ${labels[form.dataset.solvedField]}` : "INPUT: TORQUE + RPM";
            }
        }
        if (form.dataset.calc === "material_mass") {
            const material = this.engineeringRegistry.MATERIALS[values.materialId] || {};
            const label = form.querySelector("[data-material-label]");
            const density = form.querySelector("[data-material-density]");
            if (label) label.innerText = (material.label || "MATERIAL").toUpperCase();
            if (density) density.innerText = `${Number(form.elements.density.value || material.density || 0)} kg/m³`;
            const diagram = form.querySelector(".eng-diagram-mass");
            const accent = {
                aluminium: "#7ccfff", steel: "#a9c4d6", stainless: "#d8f1ff", titanium: "#a8bfff",
                carbon_fiber: "#67cfc2", pla: "#7cffb2", petg: "#71d6ff", abs: "#ffbf66", pa_cf: "#8db9c8"
            }[values.materialId] || "#7ccfff";
            if (diagram) diagram.style.setProperty("--material-accent", accent);
            const directVolume = Math.max(1, Number(values.volumeCm3 || 1));
            const derivedSide = Math.cbrt(directVolume) * 10;
            const dimensions = result.ok && result.dimensionsMm
                ? result.dimensionsMm
                : {length: derivedSide, width: derivedSide, height: derivedSide};
            const maxDimension = Math.max(1, dimensions.length, dimensions.width, dimensions.height);
            const frontWidth = 92 + 104 * dimensions.length / maxDimension;
            const frontHeight = 52 + 58 * dimensions.height / maxDimension;
            const depth = 28 + 46 * dimensions.width / maxDimension;
            const left = 190 - frontWidth / 2;
            const top = 92;
            const right = left + frontWidth;
            const bottom = top + frontHeight;
            const offsetX = depth;
            const offsetY = depth * .72;
            const points = {
                "[data-material-front]": `${left},${top} ${right},${top} ${right},${bottom} ${left},${bottom}`,
                "[data-material-top]": `${left},${top} ${left + offsetX},${top - offsetY} ${right + offsetX},${top - offsetY} ${right},${top}`,
                "[data-material-side]": `${right},${top} ${right + offsetX},${top - offsetY} ${right + offsetX},${bottom - offsetY} ${right},${bottom}`
            };
            Object.entries(points).forEach(([selector, value]) => {
                const node = form.querySelector(selector);
                if (node) node.setAttribute("points", value);
            });
            const lengthLine = form.querySelector("[data-material-length-line]");
            const heightLine = form.querySelector("[data-material-height-line]");
            const widthLine = form.querySelector("[data-material-width-line]");
            if (lengthLine) { lengthLine.setAttribute("x1", left); lengthLine.setAttribute("x2", right); lengthLine.setAttribute("y1", bottom + 24); lengthLine.setAttribute("y2", bottom + 24); }
            if (heightLine) { heightLine.setAttribute("x1", left - 24); heightLine.setAttribute("x2", left - 24); heightLine.setAttribute("y1", top); heightLine.setAttribute("y2", bottom); }
            if (widthLine) { widthLine.setAttribute("x1", right + 10); widthLine.setAttribute("y1", top - 8); widthLine.setAttribute("x2", right + offsetX + 12); widthLine.setAttribute("y2", top - offsetY - 8); }
            const dimensionText = {
                "[data-material-length]": {text: `L ${this.engineeringRegistry.round(dimensions.length, 1)} mm`, x: (left + right) / 2, y: bottom + 43},
                "[data-material-height]": {text: `H ${this.engineeringRegistry.round(dimensions.height, 1)} mm`, x: left - 39, y: (top + bottom) / 2},
                "[data-material-width]": {text: `W ${this.engineeringRegistry.round(dimensions.width, 1)} mm`, x: right + offsetX + 18, y: top - offsetY - 6}
            };
            Object.entries(dimensionText).forEach(([selector, item]) => {
                const node = form.querySelector(selector);
                if (!node) return;
                node.textContent = item.text;
                node.setAttribute("x", item.x);
                node.setAttribute("y", item.y);
            });
            const volume = form.querySelector("[data-material-volume]");
            const source = form.querySelector("[data-material-source]");
            if (volume) volume.innerText = `${this.engineeringRegistry.round(result.ok ? result.volumeCm3 : directVolume, 3)} cm³`;
            if (source) source.innerText = result.ok && result.source === "DIMENSIONS" ? "DIMENSION-DERIVED" : "DIRECT VOLUME";
        }
        if (form.dataset.calc === "gear_ratio") {
            const driverTeeth = Math.max(5, Number(values.driverTeeth || 20));
            const drivenTeeth = Math.max(5, Number(values.drivenTeeth || 60));
            const inputRpm = Math.max(0, Number(values.inputRpm || 0));
            const outputRpm = result.ok ? Math.max(0, Number(result.outputRpm || 0)) : 0;
            const maxTeeth = Math.max(driverTeeth, drivenTeeth);
            const driverNode = form.querySelector(".eng-gear-driver");
            const drivenNode = form.querySelector(".eng-gear-driven");
            const driverSize = 10 + 7 * driverTeeth / maxTeeth;
            const drivenSize = 10 + 7 * drivenTeeth / maxTeeth;
            const driverPeriod = inputRpm > 0 ? Math.max(.7, Math.min(7, 9000 / Math.max(300, inputRpm))) : 0;
            const drivenPeriod = outputRpm > 0 ? Math.max(.7, Math.min(9, 9000 / Math.max(300, outputRpm))) : 0;
            [[driverNode, driverTeeth, driverSize, driverPeriod], [drivenNode, drivenTeeth, drivenSize, drivenPeriod]].forEach(([node, teeth, size, period]) => {
                if (!node) return;
                node.style.setProperty("--gear-size", `${size}vh`);
                node.style.setProperty("--gear-period", `${period}s`);
                node.classList.toggle("stationary", period === 0);
                this.renderEngineeringGearTeeth(node, teeth);
            });
            const labels = {
                "[data-driver-teeth]": `${driverTeeth}T`,
                "[data-driven-teeth]": `${drivenTeeth}T`,
                "[data-driver-rpm]": `${this.engineeringRegistry.round(inputRpm, 1)} rpm`,
                "[data-driven-rpm]": `${this.engineeringRegistry.round(outputRpm, 1)} rpm`
            };
            Object.entries(labels).forEach(([selector, text]) => {
                const node = form.querySelector(selector);
                if (node) node.innerText = text;
            });
        }
        if (form.dataset.calc === "beam_deflection") {
            const path = form.querySelector("[data-beam-path]");
            const load = form.querySelector("[data-beam-load]");
            const loadHead = form.querySelector("[data-beam-load-head]");
            const span = form.querySelector("[data-beam-span]");
            const deflectionLabel = form.querySelector("[data-beam-visual-deflection]");
            const deflectionMm = result.ok ? Math.abs(Number(result.deflectionMm || 0)) : 0;
            const deflection = 7 + 45 * (1 - Math.exp(-deflectionMm / 4));
            if (path) {
                path.setAttribute("d", `M35 82 Q210 ${82 + deflection} 385 82`);
            }
            const loadEnd = 74 + deflection * .48;
            if (load) load.setAttribute("d", `M210 18 V${loadEnd}`);
            if (loadHead) loadHead.setAttribute("d", `M198 ${loadEnd - 12} L210 ${loadEnd + 4} L222 ${loadEnd - 12}`);
            if (span) span.textContent = `${this.engineeringRegistry.round(Number(values.lengthMm || 0), 1)} mm SPAN`;
            if (deflectionLabel) deflectionLabel.innerText = `${this.engineeringRegistry.round(deflectionMm, 4)} mm`;
        }
    }

    renderEngineeringGearTeeth(gear, actualTeeth) {
        const teethNode = gear && gear.querySelector("[data-gear-teeth]");
        if (!teethNode) return;
        const renderedTeeth = Math.max(12, Math.min(36, Math.round(Number(actualTeeth || 12) / 3)));
        if (Number(teethNode.dataset.renderedTeeth) === renderedTeeth) return;
        teethNode.dataset.renderedTeeth = String(renderedTeeth);
        teethNode.innerHTML = Array.from({length: renderedTeeth}, (_, index) =>
            `<i style="--tooth-angle:${index * 360 / renderedTeeth}deg"></i>`
        ).join("");
    }

    updateEngineeringThreadReference(panel, index = 0) {
        const rows = this.engineeringRegistry && this.engineeringRegistry.THREAD_REFERENCES;
        const row = rows && rows[index];
        if (!panel || !row) return;
        panel.querySelectorAll("[data-thread-index]").forEach(button => {
            button.classList.toggle("active", Number(button.dataset.threadIndex) === index);
        });
        const values = {
            "[data-thread-active]": row.thread,
            "[data-thread-pitch]": `${row.pitch} mm`,
            "[data-thread-tap]": `${row.tapDrill} mm`,
            "[data-thread-clearance]": `${row.clearance} mm`,
            "[data-thread-size-label]": row.thread,
            "[data-thread-pitch-label]": `PITCH ${row.pitch} mm`
        };
        Object.entries(values).forEach(([selector, text]) => {
            const node = panel.querySelector(selector);
            if (node) node.textContent = text;
        });
        const spacing = Math.max(11, Math.min(28, Number(row.pitch) * 18));
        const start = 94;
        const end = 364;
        let topPath = `M${start} 70`;
        let bottomPath = `M${start} 128`;
        for (let x = start; x < end; x += spacing) {
            const next = Math.min(end, x + spacing);
            const middle = Math.min(end, x + spacing / 2);
            topPath += ` L${middle} 60 L${next} 70`;
            bottomPath += ` L${middle} 138 L${next} 128`;
        }
        const top = panel.querySelector("[data-thread-profile-top]");
        const bottom = panel.querySelector("[data-thread-profile-bottom]");
        if (top) top.setAttribute("d", topPath);
        if (bottom) bottom.setAttribute("d", bottomPath);
        const pitchLine = panel.querySelector("[data-thread-pitch-line]");
        const pitchLabel = panel.querySelector("[data-thread-pitch-label]");
        if (pitchLine) {
            pitchLine.setAttribute("x1", start + 58);
            pitchLine.setAttribute("x2", start + 58 + spacing);
        }
        if (pitchLabel) pitchLabel.setAttribute("x", start + 58 + spacing / 2);
    }

    async executeEngineeringTool(toolId, view = this.engineeringView) {
        const tool = this.engineeringTools && this.engineeringTools.find(item => item.id === toolId);
        if (!tool) return;
        if (tool.type === "web" && tool.url) {
            await this.openLink(tool.url, view);
            return;
        }
        if (tool.type === "app") {
            if (tool.installed && tool.applicationPath) {
                const response = await this.ipc.invoke("launch-application", tool.applicationPath);
                this.showToast(view, response.ok ? `LAUNCHING ${tool.detectedName || tool.title}` : response.error);
                return;
            }
            if (tool.url) {
                await this.openLink(tool.url, view);
                this.showToast(view, `${tool.title} NOT FOUND · OPENED INFO`);
                return;
            }
            this.showToast(view, `${tool.title} NOT FOUND`);
            return;
        }
        if (tool.actionId === "project_control") {
            if (window.engineeringDashboard && window.engineeringDashboard.projectsPanel) {
                window.engineeringDashboard.projectsPanel.openEditor(0, {returnWorkspaceId: this.getActiveWorkspace()});
            }
            return;
        }
        this.openEngineeringToolById(tool.id);
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
                <button type="button">COMMIT LOCKED</button>
                <button type="button">PUSH LOCKED</button>
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
            button.addEventListener("click", () => this.showToast(view, "APPROVAL REQUIRED · GIT WRITE ACTIONS ARE LOCKED"));
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
                <em>${script.favorite ? "FAVORITE · DRAFT" : "DRAFT ONLY"}</em>`;
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
            ["GIT", health.git || "UNAVAILABLE"],
            ["PACKAGE MANAGER", health.packageManager || "UNKNOWN"],
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
                    <button id="agent_command_copy_prompt" type="button">COPY PROMPT</button>
                    <button id="agent_command_copy_output" type="button">COPY OUTPUT</button>
                    <button id="agent_command_request" type="button">REQUEST PROPOSAL</button>
                    <button id="agent_command_config" type="button">OPEN CONFIG</button>
                    <button id="agent_command_refresh" type="button">REFRESH</button>
                </div>
            </div>`;
        content.querySelector("#agent_command_copy_prompt").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(agent.basePrompt || "");
                this.showToast(view, "AGENT PROMPT COPIED");
            } catch (error) {
                this.showToast(view, "CLIPBOARD UNAVAILABLE");
            }
        });
        content.querySelector("#agent_command_copy_output").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(agent.output || "");
                this.showToast(view, "AGENT OUTPUT COPIED");
            } catch (error) {
                this.showToast(view, "CLIPBOARD UNAVAILABLE");
            }
        });
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
