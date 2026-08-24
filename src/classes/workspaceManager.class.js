class WorkspaceManager {
    constructor(options = {}) {
        this.ipc = window.aegisIpc;
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

        if (this.activeId === "osint" && workspaceId !== "osint") this.disposeOSINTDeck();
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
        } else if (workspaceId === "osint") {
            this.bindOSINTDeck(this.osintView);
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
        else if (definition.id === "osint") this.renderOSINT(view, definition);
        else if (definition.id === "student") this.renderStudent(view, definition);
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
        this.gearLabStatus = this.gearLabStatus || "API OFFLINE";
        this.gearLabBaseUrl = "http://127.0.0.1:8765";

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
        setTimeout(() => this.checkGearLabHealth({silent: true}), 120);
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
            <button type="button" class="eng-tool-card${tool.id === "aegis-gearlab" ? " eng-tool-special" : ""}" data-eng-tool="${this.escape(tool.id)}" data-type="${this.escape(tool.type)}">
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
        if (tool.id === "aegis-gearlab") return this.gearLabStatus || "API OFFLINE";
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
        const actions = tool.id === "aegis-gearlab" ? `
            <button type="button" data-gearlab-action="start">START API</button>
            <button type="button" data-gearlab-action="health">HEALTH CHECK</button>
            <button type="button" data-gearlab-action="exports">OPEN EXPORTS</button>
            <button type="button" data-gearlab-action="docs">DOCS</button>
            <button type="button" data-eng-detail-action="close">CLOSE</button>` : `
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
        if (tool.id === "aegis-gearlab" || tool.actionId === "aegis_gearlab") return this.engineeringGearLabBody();
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

    engineeringGearLabBody() {
        return `
            <section class="gearlab-console" data-gearlab-console>
                <aside class="gearlab-parameters">
                    <div class="gearlab-section-title"><small>LOCAL API / CAD GENERATOR</small><strong>PARAMETERS</strong></div>
                    <form data-gearlab-form>
                        <label class="aegis-field">Gear type
                            <select class="aegis-select" name="gearType">
                                <option value="spur-external">Spur external</option>
                                <option value="spur-internal">Spur internal</option>
                                <option value="internal-gear-pair">Internal gear pair</option>
                                <option value="helical-external">Helical external</option>
                                <option value="herringbone-external">Herringbone external</option>
                            </select>
                        </label>
                        <label class="aegis-field">Name<input class="aegis-input" name="gearName" value="aegis_pinion_01" maxlength="80"></label>
                        <div class="gearlab-field-grid">
                            <label class="aegis-field">Module<input class="aegis-number-input" name="moduleMm" type="number" min="0.1" max="20" step="0.1" value="2"><b>mm</b></label>
                            <label class="aegis-field">Pressure angle<input class="aegis-number-input" name="pressureAngle" type="number" min="14.5" max="25" step="0.5" value="20"><b>deg</b></label>
                            <label class="aegis-field">Face width<input class="aegis-number-input" name="faceWidth" type="number" min="1" max="200" step="1" value="12"><b>mm</b></label>
                            <label class="aegis-field">Backlash<input class="aegis-number-input" name="backlash" type="number" min="0" max="2" step="0.01" value="0.08"><b>mm</b></label>
                            <label class="aegis-field" data-gearlab-field="teeth">Teeth<input class="aegis-number-input" name="teeth" type="number" min="8" max="240" step="1" value="24"></label>
                            <label class="aegis-field" data-gearlab-field="bore">Bore<input class="aegis-number-input" name="bore" type="number" min="0" max="200" step="0.5" value="8"><b>mm</b></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="outer">Outer diameter<input class="aegis-number-input" name="outerDiameter" type="number" min="1" max="1000" step="1" value="140"><b>mm</b></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="pinion-teeth">Pinion teeth<input class="aegis-number-input" name="pinionTeeth" type="number" min="8" max="120" step="1" value="20"></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="ring-teeth">Ring teeth<input class="aegis-number-input" name="ringTeeth" type="number" min="16" max="300" step="1" value="60"></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="ring-outer">Ring outer<input class="aegis-number-input" name="ringOuter" type="number" min="1" max="1000" step="1" value="140"><b>mm</b></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="helix">Helix angle<input class="aegis-number-input" name="helixAngle" type="number" min="0.1" max="44" step="0.5" value="20"><b>deg</b></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="hand">Helix hand<select class="aegis-select" name="helixHand"><option value="right">Right</option><option value="left">Left</option></select></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="module-type">Module type<select class="aegis-select" name="moduleType"><option value="normal">Normal</option><option value="transverse">Transverse</option></select></label>
                            <label class="aegis-field gearlab-hidden" data-gearlab-field="gap">Center gap<input class="aegis-number-input" name="centerGap" type="number" min="0" max="20" step="0.5" value="1"><b>mm</b></label>
                            <label class="aegis-field">Profile points<input class="aegis-number-input" name="profilePoints" type="number" min="8" max="96" step="1" value="24"></label>
                        </div>
                        <div class="gearlab-export-formats">
                            <small>EXPORTS</small>
                            <label><input type="checkbox" name="format" value="step" checked> STEP</label>
                            <label><input type="checkbox" name="format" value="stl"> STL</label>
                            <label><input type="checkbox" name="format" value="dxf"> DXF</label>
                            <label><input type="checkbox" name="format" value="json_report" checked> JSON REPORT</label>
                        </div>
                        <button type="submit" class="gearlab-generate">GENERATE CAD</button>
                    </form>
                </aside>
                <main class="gearlab-preview">
                    <div class="gearlab-section-title"><small>INVOLUTE PARAMETER VIEW</small><strong>TECHNICAL PREVIEW</strong></div>
                    <div class="gearlab-gear-viewport" data-gearlab-preview>
                        <div class="gearlab-preview-gear"><span data-gearlab-preview-teeth></span><i></i><b></b></div>
                        <svg viewBox="0 0 400 400" aria-label="Gear reference circles">
                            <circle class="gearlab-circle gearlab-addendum" cx="200" cy="200" r="145"></circle>
                            <circle class="gearlab-circle gearlab-pitch" cx="200" cy="200" r="126"></circle>
                            <circle class="gearlab-circle gearlab-base" cx="200" cy="200" r="118"></circle>
                            <circle class="gearlab-circle gearlab-root" cx="200" cy="200" r="108"></circle>
                            <path d="M40 200H360 M200 40V360"></path>
                        </svg>
                        <div class="gearlab-preview-readout">
                            <span><small>TYPE</small><strong data-gearlab-preview-type>SPUR EXTERNAL</strong></span>
                            <span><small>TEETH</small><strong data-gearlab-preview-count>24</strong></span>
                            <span><small>PITCH Ø</small><strong data-gearlab-preview-pitch>48.00 mm</strong></span>
                            <span><small>MODULE</small><strong data-gearlab-preview-module>2.00 mm</strong></span>
                        </div>
                    </div>
                    <small class="gearlab-preview-note">VECTOR PARAMETER PREVIEW · CAD SURFACE IS GENERATED BY OPEN CASCADE</small>
                </main>
                <aside class="gearlab-output">
                    <div class="gearlab-section-title"><small>127.0.0.1:8765</small><strong>STATUS / OUTPUT</strong></div>
                    <div class="gearlab-api-state">
                        <span data-gearlab-indicator></span>
                        <div><small>GEARLAB API 0.1.0</small><strong data-gearlab-status>${this.escape(this.gearLabStatus || "API OFFLINE")}</strong></div>
                    </div>
                    <div class="gearlab-output-message" data-gearlab-message>Run HEALTH CHECK or START API. Offline state never blocks AegisUi.</div>
                    <section class="gearlab-output-block"><header>CALCULATED GEOMETRY</header><div data-gearlab-geometry><small>NO GENERATION YET</small></div></section>
                    <section class="gearlab-output-block"><header>WARNINGS / ERRORS</header><div data-gearlab-warnings><small>NONE</small></div></section>
                    <section class="gearlab-output-block"><header>EXPORTS</header><div data-gearlab-files><small>NO FILES</small></div></section>
                </aside>
            </section>`;
    }

    bindEngineeringGearLab(root) {
        const consoleNode = root && root.querySelector("[data-gearlab-console]");
        if (!consoleNode || consoleNode.dataset.bound === "true") return;
        consoleNode.dataset.bound = "true";
        const form = consoleNode.querySelector("[data-gearlab-form]");
        const typeSelect = form && form.elements.gearType;
        const updatePreview = () => this.updateEngineeringGearLabPreview(consoleNode);
        if (form) {
            form.addEventListener("input", updatePreview);
            form.addEventListener("change", updatePreview);
            form.addEventListener("submit", event => {
                event.preventDefault();
                this.generateEngineeringGearLab(consoleNode, form);
            });
        }
        root.querySelectorAll("[data-gearlab-action]").forEach(button => {
            button.addEventListener("click", () => {
                const action = button.dataset.gearlabAction;
                if (action === "start") this.startGearLabApi(consoleNode);
                if (action === "health") this.checkGearLabHealth({consoleNode});
                if (action === "exports") this.openGearLabLocalTarget("exports", consoleNode);
                if (action === "docs") this.openGearLabLocalTarget("docs", consoleNode);
            });
        });
        if (typeSelect) typeSelect.addEventListener("change", updatePreview);
        updatePreview();
        this.checkGearLabHealth({consoleNode, silent: true});
    }

    updateEngineeringGearLabPreview(consoleNode) {
        const form = consoleNode && consoleNode.querySelector("[data-gearlab-form]");
        if (!form) return;
        const type = form.elements.gearType.value;
        const fieldsByType = {
            "spur-external": ["teeth", "bore"],
            "spur-internal": ["teeth", "outer"],
            "internal-gear-pair": ["pinion-teeth", "ring-teeth", "bore", "ring-outer"],
            "helical-external": ["teeth", "bore", "helix", "hand", "module-type"],
            "herringbone-external": ["teeth", "bore", "helix", "hand", "module-type", "gap"]
        };
        const visible = new Set(fieldsByType[type] || []);
        consoleNode.querySelectorAll("[data-gearlab-field]").forEach(field => {
            field.classList.toggle("gearlab-hidden", !visible.has(field.dataset.gearlabField));
        });
        const moduleValue = Math.max(0, Number(form.elements.moduleMm.value || 0));
        const teeth = type === "internal-gear-pair"
            ? Number(form.elements.pinionTeeth.value || 0)
            : Number(form.elements.teeth.value || 0);
        const labels = {
            "[data-gearlab-preview-type]": type.replaceAll("-", " ").toUpperCase(),
            "[data-gearlab-preview-count]": String(teeth),
            "[data-gearlab-preview-pitch]": `${(moduleValue * teeth).toFixed(2)} mm`,
            "[data-gearlab-preview-module]": `${moduleValue.toFixed(2)} mm`
        };
        Object.entries(labels).forEach(([selector, value]) => {
            const node = consoleNode.querySelector(selector);
            if (node) node.innerText = value;
        });
        const teethNode = consoleNode.querySelector("[data-gearlab-preview-teeth]");
        const rendered = Math.max(14, Math.min(42, Math.round(teeth / 2)));
        if (teethNode && Number(teethNode.dataset.count) !== rendered) {
            teethNode.dataset.count = String(rendered);
            teethNode.innerHTML = Array.from({length: rendered}, (_, index) => `<i style="--angle:${index * 360 / rendered}deg"></i>`).join("");
        }
    }

    gearLabRequestPayload(form) {
        const value = name => Number(form.elements[name].value);
        const type = form.elements.gearType.value;
        const exportFormats = Array.from(form.querySelectorAll('input[name="format"]:checked')).map(item => item.value);
        const common = {
            gear_name: String(form.elements.gearName.value || "aegis_gear").trim(),
            module_mm: value("moduleMm"),
            pressure_angle_deg: value("pressureAngle"),
            face_width_mm: value("faceWidth"),
            backlash_mm: value("backlash"),
            profile_shift: 0,
            number_of_profile_points: value("profilePoints"),
            export_formats: exportFormats.length ? exportFormats : ["step"]
        };
        if (type === "internal-gear-pair") {
            return {
                endpoint: type,
                payload: {
                    assembly_name: common.gear_name,
                    module_mm: common.module_mm,
                    pressure_angle_deg: common.pressure_angle_deg,
                    face_width_mm: common.face_width_mm,
                    pinion_teeth: value("pinionTeeth"),
                    ring_teeth: value("ringTeeth"),
                    pinion_bore_mm: value("bore"),
                    ring_outer_diameter_mm: value("ringOuter"),
                    backlash_mm: common.backlash_mm,
                    profile_shift_pinion: 0,
                    profile_shift_ring: 0,
                    number_of_profile_points: common.number_of_profile_points,
                    export_formats: common.export_formats,
                    export_mode: "assembly_and_parts"
                }
            };
        }
        const payload = {...common, teeth: value("teeth")};
        if (type === "spur-internal") payload.outer_diameter_mm = value("outerDiameter");
        else payload.bore_diameter_mm = value("bore");
        if (type === "helical-external" || type === "herringbone-external") {
            payload.helix_angle_deg = value("helixAngle");
            payload.helix_hand = form.elements.helixHand.value;
            payload.module_type = form.elements.moduleType.value;
        }
        if (type === "herringbone-external") {
            payload.center_gap_mm = value("centerGap");
            payload.continuous_v = false;
        }
        return {endpoint: type, payload};
    }

    async generateEngineeringGearLab(consoleNode, form) {
        const button = form.querySelector(".gearlab-generate");
        if (button && button.disabled) return;
        if (button) { button.disabled = true; button.innerText = "GENERATING · OPEN CASCADE"; }
        this.setGearLabStatus("API STARTING", consoleNode, "Submitting validated parameters to local CAD backend.");
        const request = this.gearLabRequestPayload(form);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);
            const response = await fetch(`${this.gearLabBaseUrl}/generate/${request.endpoint}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(request.payload),
                signal: controller.signal
            });
            clearTimeout(timeout);
            const payload = await response.json().catch(() => ({status: "error", code: "INVALID_RESPONSE", message: "GearLab returned invalid JSON."}));
            if (!response.ok || payload.status === "error") {
                const status = payload.code === "CAD_BACKEND_UNAVAILABLE" ? "CAD BACKEND MISSING" : "ERROR";
                this.setGearLabStatus(status, consoleNode, payload.message || `HTTP ${response.status}`);
                this.renderEngineeringGearLabResult(consoleNode, payload);
                return;
            }
            this.setGearLabStatus("API READY", consoleNode, `${payload.name} generated by ${payload.generator}.`);
            this.renderEngineeringGearLabResult(consoleNode, payload);
        } catch (error) {
            const message = error.name === "AbortError" ? "Generation timed out." : "Local GearLab API is offline.";
            this.setGearLabStatus("API OFFLINE", consoleNode, message);
            this.renderEngineeringGearLabResult(consoleNode, {status: "error", code: "API_OFFLINE", message});
        } finally {
            if (button) { button.disabled = false; button.innerText = "GENERATE CAD"; }
        }
    }

    renderEngineeringGearLabResult(consoleNode, payload = {}) {
        const geometry = consoleNode.querySelector("[data-gearlab-geometry]");
        const warningNode = consoleNode.querySelector("[data-gearlab-warnings]");
        const filesNode = consoleNode.querySelector("[data-gearlab-files]");
        if (geometry) {
            const entries = Object.entries(payload.calculated_geometry || {}).filter(([, value]) => typeof value !== "object").slice(0, 16);
            geometry.innerHTML = entries.length ? entries.map(([key, value]) => `<div><small>${this.escape(key.replaceAll("_", " "))}</small><strong>${this.escape(String(value))}</strong></div>`).join("") : "<small>NO GEOMETRY</small>";
        }
        if (warningNode) {
            if (payload.status === "error") {
                warningNode.innerHTML = `<article class="gearlab-fatal"><strong>${this.escape(payload.code || "ERROR")}</strong><p>${this.escape(payload.message || "Generation failed.")}</p></article>`;
            } else {
                const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
                warningNode.innerHTML = warnings.length ? warnings.map(item => `<article><strong>${this.escape(item.code || "WARNING")}</strong><p>${this.escape(item.message || "")}</p></article>`).join("") : "<small>NONE</small>";
            }
        }
        if (filesNode) {
            const files = Object.entries(payload.files || {});
            filesNode.innerHTML = files.length ? files.map(([format, path]) => `<button type="button" data-gearlab-file="${this.escape(path)}"><strong>${this.escape(format.toUpperCase())}</strong><small>${this.escape(String(path).split("/").pop())}</small></button>`).join("") : "<small>NO FILES</small>";
            filesNode.querySelectorAll("[data-gearlab-file]").forEach(button => {
                button.addEventListener("click", () => this.openGearLabUrl(`${this.gearLabBaseUrl}${button.dataset.gearlabFile}`, consoleNode));
            });
        }
    }

    setGearLabStatus(status, consoleNode = null, message = "") {
        this.gearLabStatus = status;
        const targets = [consoleNode, document].filter(Boolean);
        targets.forEach(root => root.querySelectorAll("[data-gearlab-status]").forEach(node => node.innerText = status));
        if (consoleNode) {
            const messageNode = consoleNode.querySelector("[data-gearlab-message]");
            if (messageNode && message) messageNode.innerText = message;
            consoleNode.dataset.apiState = status.toLowerCase().replaceAll(" ", "-");
        }
        document.querySelectorAll('[data-eng-tool="aegis-gearlab"] em').forEach(node => {
            node.className = this.statusClass(status);
            node.innerText = status;
        });
    }

    async checkGearLabHealth({consoleNode = null, silent = false} = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        try {
            const [healthResponse, capabilityResponse] = await Promise.all([
                fetch(`${this.gearLabBaseUrl}/health`, {signal: controller.signal}),
                fetch(`${this.gearLabBaseUrl}/capabilities`, {signal: controller.signal})
            ]);
            clearTimeout(timeout);
            if (!healthResponse.ok || !capabilityResponse.ok) throw new Error(`HTTP ${healthResponse.status}/${capabilityResponse.status}`);
            const health = await healthResponse.json();
            const capabilities = await capabilityResponse.json();
            const backendReady = capabilities.cad_backend !== "unavailable";
            const status = backendReady ? "API READY" : "CAD BACKEND MISSING";
            this.setGearLabStatus(status, consoleNode, `${health.service} ${health.version} · ${backendReady ? "CadQuery/OpenCascade ready" : "run setup_mac.sh"}`);
            return {ok: true, health, capabilities};
        } catch (error) {
            clearTimeout(timeout);
            this.setGearLabStatus("API OFFLINE", consoleNode, silent ? "" : "Aegis GearLab is not running on 127.0.0.1:8765.");
            return {ok: false, error: error.message || String(error)};
        }
    }

    gearLabLocalRoot() {
        return "MANAGED_BY_MAIN";
    }

    async startGearLabApi(consoleNode) {
        try {
            const status = await window.aegis.gearlab.status();
            if (!status.installed) {
                this.setGearLabStatus("ERROR", consoleNode, "GearLab module path is unavailable. Open DOCS for setup.");
                return;
            }
            if (!status.backendReady) {
                this.setGearLabStatus("CAD BACKEND MISSING", consoleNode, "Local venv is not installed. Run setup_mac.sh once.");
                return;
            }
            this.setGearLabStatus("API STARTING", consoleNode, "Starting fixed local GearLab service.");
            await window.aegis.gearlab.start();
            for (let attempt = 0; attempt < 12; attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 650));
                const health = await this.checkGearLabHealth({consoleNode, silent: true});
                if (health.ok) return;
            }
            this.setGearLabStatus("ERROR", consoleNode, "GearLab process started but health check did not become ready.");
        } catch (error) {
            this.setGearLabStatus("ERROR", consoleNode, error.message || "Cannot start GearLab API.");
        }
    }

    openGearLabUrl(target, consoleNode) {
        if (!/^http:\/\/127\.0\.0\.1:8765\//.test(String(target))) {
            this.setGearLabStatus("ERROR", consoleNode, "Rejected non-local GearLab URL.");
            return;
        }
        window.aegis.gearlab.open("app").catch(error => {
            this.setGearLabStatus("ERROR", consoleNode, error.message || "Cannot open GearLab URL.");
        });
    }

    openGearLabLocalTarget(target, consoleNode) {
        window.aegis.gearlab.open(target === "docs" ? "docs" : "exports").catch(error => {
            this.setGearLabStatus("ERROR", consoleNode, error.message || "Cannot open local GearLab target.");
        });
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
        if (tool.id === "aegis-gearlab") this.bindEngineeringGearLab(overlay);
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
        if (tool.id === "aegis-gearlab") {
            this.openEngineeringToolById(tool.id);
            return;
        }
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

    renderOSINT(view, definition) {
        view.classList.add("osint-command-deck");
        this.osintView = view;
        this.osintRegistry = window.OSINTToolsRegistry || {CATEGORIES: [], PROVIDERS: [], FEATURED: []};
        this.osintPolicy = window.OSINTProviderPolicy || null;
        this.osintProviderRegistry = this.osintProviderRegistry || (window.OSINTProviderRuntime
            ? new window.OSINTProviderRuntime.ProviderRegistry(this.osintRegistry)
            : null);
        this.osintCapabilityRegistry = this.osintCapabilityRegistry || (window.OSINTCapabilityRegistry && this.osintProviderRegistry
            ? new window.OSINTCapabilityRegistry.CapabilityRegistry(this.osintProviderRegistry)
            : null);
        this.osintAdapterFactory = this.osintAdapterFactory || (window.OSINTProviderAdapters && this.osintProviderRegistry
            ? new window.OSINTProviderAdapters.AdapterFactory({providerRegistry: this.osintProviderRegistry})
            : null);
        this.osintRuntime = this.osintRuntime || (window.OSINTProviderRuntime && this.osintProviderRegistry && this.osintAdapterFactory
            ? new window.OSINTProviderRuntime.ProviderRuntime({
                providerRegistry: this.osintProviderRegistry,
                capabilityRegistry: this.osintCapabilityRegistry,
                adapterFactory: this.osintAdapterFactory
            })
            : null);
        this.osintAccess = this.osintAccess || (window.OSINTToolAccessPanel
            ? new window.OSINTToolAccessPanel.SessionHistory({maxEntries: 50})
            : null);
        this.osintQueryDrafts = this.osintQueryDrafts || Object.create(null);
        this.osintLastNormalizedResults = this.osintLastNormalizedResults || Object.create(null);
        this.osintActiveQuery = this.osintActiveQuery || null;
        this.osintState = this.osintState || {
            categoryId: null,
            filters: {providerStatus: "", riskProfile: "", legalStatus: ""}
        };
        this.osintCaseState = this.osintCaseState || {
            mode: "CATALOG",
            loaded: false,
            loading: false,
            cases: [],
            activeCaseId: null,
            activeCase: null,
            lastError: null
        };
        this.osintGeoState = this.osintGeoState || {
            mode: "CATALOG",
            input: "",
            phase: "IDLE",
            verification: null,
            selectedCandidateIndex: 0,
            activeRequestId: null,
            lastError: null,
            investigatorNote: "",
            investigatorAssessment: "INCONCLUSIVE",
            handoff: null
        };
        this.osintMediaState = this.osintMediaState || {
            mode: "CATALOG", phase: "IDLE", result: null, previewUrl: null,
            analystObservation: "", lastError: null, selectedFile: null
        };
        this.osintDomainState = this.osintDomainState || {
            mode: "CATALOG", input: "", phase: "IDLE", verification: null,
            activeRequestId: null, lastError: null, analystObservation: "", selectedPublicIp: ""
        };
        this.osintResearchState = this.osintResearchState || {
            mode: "CATALOG", sourceKind: "URL", input: "", phase: "IDLE", context: null,
            activeRequestId: null, lastError: null, analystObservation: "", excerpt: "", excerptLocation: "",
            claimRelationship: "UNKNOWN", selectedFile: null
        };
        this.osintEntityState = this.osintEntityState || (window.OSINTEntityResolution
            ? window.OSINTEntityResolution.createState({mode: "CATALOG"})
            : {mode: "CATALOG", entities: [], relationships: [], selectedEntityId: null, analystNote: "", filters: {type: "", status: "", relationshipType: ""}, lastError: null});
        this.osintInvestigationContext = this.osintInvestigationContext || (window.OSINTInvestigationOrchestration
            ? window.OSINTInvestigationOrchestration.createContext({activeCaseId: this.osintCaseState.activeCaseId})
            : null);
        this.osintState.filters = {...{providerStatus: "", riskProfile: "", legalStatus: ""}, ...(this.osintState.filters || {})};
        this.renderOSINTState(view, definition);
        this.ensureOSINTCasesLoaded();
    }

    renderOSINTState(view = this.osintView, definition = this.byId.get("osint")) {
        if (!view || !definition) return;
        const registry = this.osintRegistry || {CATEGORIES: [], PROVIDERS: [], FEATURED: []};
        const grid = view.querySelector(".workspace-grid");
        if (!grid) return;
        const activeCategory = registry.CATEGORIES.find(category => category.id === this.osintState.categoryId);
        const selectedProvider = this.getSelectedOSINTProvider();
        grid.className = "workspace-grid osint-command-grid";

        if (this.osintCaseState && this.osintCaseState.mode === "OVERVIEW") {
            this.renderOSINTCaseOverview(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (this.osintCaseState && this.osintCaseState.mode === "CASE") {
            this.renderOSINTCaseWorkspace(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (this.osintGeoState && this.osintGeoState.mode === "GEO") {
            this.renderOSINTGeospatialWorkspace(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (this.osintMediaState && this.osintMediaState.mode === "MEDIA") {
            this.renderOSINTVisualMediaWorkspace(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (this.osintDomainState && this.osintDomainState.mode === "DOMAIN") {
            this.renderOSINTDomainInfrastructureWorkspace(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (this.osintResearchState && this.osintResearchState.mode === "SOURCE") {
            this.renderOSINTResearchSourceWorkspace(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (this.osintEntityState && this.osintEntityState.mode === "ENTITY") {
            this.renderOSINTEntityWorkspace(grid);
            this.bindOSINTDeck(view);
            return;
        }

        if (!activeCategory) {
            const featured = typeof registry.getFeaturedProviders === "function"
                ? registry.getFeaturedProviders()
                : this.getOSINTProviders().filter(provider => (registry.FEATURED || []).includes(provider.id));
            const providers = this.getOSINTProviders();
            grid.innerHTML = `
                <section class="osint-command-hero workspace-panel">
                    <div>
                        <small>PUBLIC-SOURCE / EVIDENCE-AWARE RESEARCH</small>
                        <h2>OSINT TOOL CATALOG</h2>
                        <p>Choose an investigation domain. Every entry carries an explicit access and policy state before any external resource can be launched.</p>
                        <div class="osint-hero-actions"><button type="button" class="osint-case-workspace-button" data-osint-case-action="workspace">CASE WORKSPACE</button><button type="button" class="osint-case-workspace-button" data-osint-geo-action="open">GEO VERIFICATION</button><button type="button" class="osint-case-workspace-button" data-osint-media-action="open">VISUAL VERIFICATION</button><button type="button" class="osint-case-workspace-button" data-osint-domain-action="open">DOMAIN CONTEXT</button><button type="button" class="osint-case-workspace-button" data-osint-research-action="open">SOURCE VERIFICATION</button><button type="button" class="osint-case-workspace-button" data-osint-entity-action="open">ENTITY RESOLUTION</button></div>
                    </div>
                    <div class="osint-command-stats">
                        <div><small>CATEGORIES</small><strong>${registry.CATEGORIES.length}</strong></div>
                        <div><small>TOOLS</small><strong>${providers.length}</strong></div>
                        <div><small>CASES</small><strong>${this.osintCaseState && this.osintCaseState.cases ? this.osintCaseState.cases.length : 0}</strong></div>
                    </div>
                </section>
                <section class="osint-category-deck" aria-label="OSINT categories">
                    ${registry.CATEGORIES.map(category => this.osintCategoryTile(category)).join("")}
                </section>
                <section class="osint-featured-panel workspace-panel">
                    <header><h2>CORE TOOLCHAIN</h2><span>QUICK ACCESS</span></header>
                    <div class="workspace-panel-content osint-featured-grid" role="listbox" aria-label="Featured OSINT providers">
                        ${featured.map(tool => this.osintToolCard(tool, true)).join("")}
                    </div>
                </section>
                <section class="osint-scope-panel workspace-panel">
                    <header><h2>TOOL ACCESS</h2><span>${this.escape(this.formatOSINTEnum(this.getOSINTPanelSnapshot().panelState))}</span></header>
                    <div class="workspace-panel-content">${this.renderOSINTToolAccessPanel(selectedProvider)}</div>
                </section>`;
        } else {
            const allCategoryProviders = this.getOSINTProviders({category: activeCategory.id});
            const providers = this.getOSINTProviders({...this.getOSINTFilters(), category: activeCategory.id});
            grid.innerHTML = `
                <section class="osint-category-header workspace-panel">
                    <button type="button" class="osint-back-button" data-osint-back>‹ ALL DOMAINS</button>
                    <div class="osint-hero-actions"><button type="button" class="osint-case-workspace-button" data-osint-case-action="workspace">CASE WORKSPACE</button>${activeCategory.id === "geospatial" ? `<button type="button" class="osint-case-workspace-button" data-osint-geo-action="open">GEO VERIFICATION</button><button type="button" class="osint-case-workspace-button" data-osint-media-action="open">VISUAL VERIFICATION</button>` : ""}${activeCategory.id === "infrastructure" ? `<button type="button" class="osint-case-workspace-button" data-osint-domain-action="open">DOMAIN CONTEXT</button>` : ""}${["discovery", "archives"].includes(activeCategory.id) ? `<button type="button" class="osint-case-workspace-button" data-osint-research-action="open">SOURCE VERIFICATION</button>` : ""}${activeCategory.id === "entities" ? `<button type="button" class="osint-case-workspace-button" data-osint-entity-action="open">ENTITY RESOLUTION</button>` : ""}</div>
                    <span class="osint-category-icon">${this.escape(activeCategory.icon)}</span>
                    <div><small>OSINT DOMAIN / ${this.escape(activeCategory.id)}</small><h2>${this.escape(activeCategory.title)}</h2><p>${this.escape(activeCategory.description)}</p></div>
                    <strong>${providers.length} / ${allCategoryProviders.length} SOURCES</strong>
                </section>
                <section class="osint-tool-catalog" role="listbox" aria-label="${this.escape(activeCategory.title)} tools">
                    ${providers.length ? providers.map(provider => this.osintToolCard(provider)).join("") : `<div class="osint-empty-state"><strong>NO PROVIDERS MATCH THE CURRENT POLICY FILTERS</strong><span>Clear or adjust provider, risk or legal-status filters.</span></div>`}
                </section>
                <aside class="osint-category-notes workspace-panel">
                    <header><h2>TOOL ACCESS</h2><span>${this.escape(this.formatOSINTEnum(this.getOSINTPanelSnapshot().panelState))}</span></header>
                    <div class="workspace-panel-content">
                        ${this.osintPolicyFilterControls()}
                        ${this.renderOSINTToolAccessPanel(selectedProvider)}
                    </div>
                </aside>`;
        }
        this.bindOSINTDeck(view);
    }

    osintCategoryTile(category) {
        const count = this.getOSINTProviders({category: category.id}).length;
        return `
            <button type="button" class="osint-category-tile" data-osint-category="${this.escape(category.id)}">
                <span>${this.escape(category.icon)}</span>
                <strong>${this.escape(category.title)}</strong>
                <small>${this.escape(category.description)}</small>
                <em>${count} TOOLS</em>
            </button>`;
    }

    getOSINTProviders(filters = {}) {
        const registry = this.osintRegistry || {};
        if (typeof registry.getProviders === "function") return registry.getProviders(filters);
        const providers = registry.PROVIDERS || registry.TOOLS || [];
        return providers.filter(provider => Object.entries(filters).every(([key, value]) => !value || provider[key] === value));
    }

    getOSINTFilters() {
        return {...(this.osintState && this.osintState.filters || {})};
    }

    getOSINTPanelSnapshot() {
        if (this.osintAccess && typeof this.osintAccess.snapshot === "function") return this.osintAccess.snapshot();
        return {panelState: "IDLE", queryState: "IDLE", history: [], activeProviderId: null, previewProviderId: null, clearArmed: false, providerHealth: "UNKNOWN", lastResult: null, lastError: null};
    }

    getSelectedOSINTProvider() {
        const snapshot = this.getOSINTPanelSnapshot();
        if (!snapshot.activeProviderId) return null;
        return this.osintRegistry && typeof this.osintRegistry.getProvider === "function"
            ? this.osintRegistry.getProvider(snapshot.activeProviderId)
            : this.getOSINTProviders().find(provider => provider.id === snapshot.activeProviderId) || null;
    }

    formatOSINTEnum(value, fallback = "NOT AVAILABLE") {
        if (window.OSINTToolAccessPanel && typeof window.OSINTToolAccessPanel.formatEnum === "function") {
            return window.OSINTToolAccessPanel.formatEnum(value, fallback);
        }
        return value ? String(value).replace(/_/g, " ") : fallback;
    }

    formatOSINTList(values, fallback = "NOT DECLARED") {
        if (window.OSINTToolAccessPanel && typeof window.OSINTToolAccessPanel.formatList === "function") {
            return window.OSINTToolAccessPanel.formatList(values, fallback);
        }
        return Array.isArray(values) && values.length ? values.join(" · ") : fallback;
    }

    osintPolicyFilterControls() {
        const filters = this.getOSINTFilters();
        const enumValues = this.osintRegistry && this.osintRegistry.ENUMS || {};
        const label = value => this.formatOSINTEnum(value, "");
        const select = (key, title, values) => `
            <label class="osint-policy-filter"><span>${title}</span>
                <select class="aegis-select" data-osint-filter="${key}">
                    <option value="">ALL</option>
                    ${(values || []).map(value => `<option value="${this.escape(value)}"${filters[key] === value ? " selected" : ""}>${this.escape(label(value))}</option>`).join("")}
                </select>
            </label>`;
        return `<section class="osint-policy-filters" aria-label="OSINT provider policy filters">
            ${select("providerStatus", "STATUS", enumValues.providerStatus)}
            ${select("riskProfile", "RISK", enumValues.riskProfile)}
            ${select("legalStatus", "LEGAL", enumValues.legalStatus)}
            <button type="button" class="osint-filter-clear" data-osint-filter-clear>CLEAR FILTERS</button>
        </section>`;
    }

    osintBadgeLabel(provider, limit = 3) {
        const policy = this.osintPolicy;
        const badges = [policy && policy.displayAccess ? policy.displayAccess(provider) : "EXTERNAL"];
        if (provider.riskProfile === "HIGH_ABUSE_POTENTIAL" || provider.riskProfile === "SENSITIVE") badges.push("SENSITIVE");
        else if (provider.riskProfile === "API_KEY_REQUIRED") badges.push("KEY");
        else if (provider.riskProfile === "COMMERCIAL") badges.push("PAID");
        else if (provider.riskProfile === "ACCOUNT_REQUIRED") badges.push("AUTH REQUIRED");
        if (provider.legalStatus !== "GENERALLY_LEGAL") badges.push(String(provider.legalStatus).replace(/_/g, " "));
        return [...new Set(badges)].slice(0, limit);
    }

    osintToolCard(provider, featured = false) {
        const referenceOnly = Boolean(this.osintPolicy && this.osintPolicy.isReferenceOnly && this.osintPolicy.isReferenceOnly(provider));
        const badges = this.osintBadgeLabel(provider);
        const selected = this.getOSINTPanelSnapshot().activeProviderId === provider.id;
        return `
            <button type="button" role="option" aria-selected="${selected ? "true" : "false"}" aria-pressed="${selected ? "true" : "false"}" class="osint-tool-card${featured ? " featured" : ""}${referenceOnly ? " reference-only" : ""}${selected ? " selected" : ""}" data-osint-tool="${this.escape(provider.id)}">
                <span class="osint-tool-icon">${this.escape(provider.icon || "◌")}</span>
                <em>${this.escape(badges[0] || "EXTERNAL")}</em>
                <strong>${this.escape(provider.name)}</strong>
                <small>${this.escape(provider.description || "Public-source research tool.")}</small>
                <i>${badges.slice(1).map(badge => `<b>${this.escape(badge)}</b>`).join("")}${(provider.tags || []).slice(0, Math.max(0, 3 - badges.length)).map(tag => `<b>${this.escape(tag)}</b>`).join("")}</i>
                <u>${referenceOnly ? "REFERENCE INFO" : "SELECT PROVIDER"}</u>
            </button>`;
    }

    bindOSINTDeck(view = this.osintView) {
        if (!view || view.dataset.osintDeckBound === "true") return;
        this.boundOSINTDeckClick = event => {
            const target = event.target.closest("[data-osint-category], [data-osint-back], [data-osint-filter-clear], [data-osint-tool], [data-osint-panel-action], [data-osint-history-clear], [data-osint-query-cancel], [data-osint-save-result], [data-osint-case-action], [data-osint-geo-action], [data-osint-media-action], [data-osint-domain-action], [data-osint-research-action], [data-osint-entity-action], [data-osint-investigation-action]");
            if (!target || !view.contains(target)) return;
            if (target.matches("[data-osint-category]")) {
                this.osintState.categoryId = target.dataset.osintCategory;
                this.renderOSINTState(view);
                return;
            }
            if (target.matches("[data-osint-back]")) {
                this.osintState.categoryId = null;
                this.renderOSINTState(view);
                return;
            }
            if (target.matches("[data-osint-filter-clear]")) {
                this.osintState.filters = {providerStatus: "", riskProfile: "", legalStatus: ""};
                this.renderOSINTState(view);
                return;
            }
            if (target.matches("[data-osint-tool]")) {
                this.selectOSINTProviderById(target.dataset.osintTool, target);
                return;
            }
            if (target.matches("[data-osint-history-clear]")) {
                this.clearOSINTSessionHistory();
                return;
            }
            if (target.matches("[data-osint-query-cancel]")) {
                this.cancelActiveOSINTQuery();
                return;
            }
            if (target.matches("[data-osint-save-result]")) {
                this.openOSINTEvidencePromotion(target.dataset.osintSaveResult, target);
                return;
            }
            if (target.matches("[data-osint-case-action]")) {
                this.handleOSINTCaseAction(target.dataset.osintCaseAction, target);
                return;
            }
            if (target.matches("[data-osint-geo-action]")) {
                this.handleOSINTGeoAction(target.dataset.osintGeoAction, target);
                return;
            }
            if (target.matches("[data-osint-media-action]")) {
                this.handleOSINTMediaAction(target.dataset.osintMediaAction, target);
                return;
            }
            if (target.matches("[data-osint-domain-action]")) {
                this.handleOSINTDomainAction(target.dataset.osintDomainAction, target);
                return;
            }
            if (target.matches("[data-osint-research-action]")) {
                this.handleOSINTResearchAction(target.dataset.osintResearchAction, target);
                return;
            }
            if (target.matches("[data-osint-entity-action]")) {
                this.handleOSINTEntityAction(target.dataset.osintEntityAction, target);
                return;
            }
            if (target.matches("[data-osint-investigation-action]")) {
                this.handleOSINTInvestigationAction(target.dataset.osintInvestigationAction, target);
                return;
            }
            if (target.matches("[data-osint-panel-action]")) this.handleOSINTPanelAction(target.dataset.osintPanelAction, target);
        };
        this.boundOSINTDeckChange = event => {
            const mediaFile = event.target.closest("[data-osint-media-file]");
            if (mediaFile && view.contains(mediaFile)) {
                const selected = mediaFile.files && mediaFile.files[0];
                if (selected) this.inspectOSINTMediaFile(selected);
                return;
            }
            const researchFile = event.target.closest("[data-osint-research-file]");
            if (researchFile && view.contains(researchFile)) {
                const selected = researchFile.files && researchFile.files[0];
                if (selected) this.inspectOSINTResearchPdf(selected);
                return;
            }
            const researchKind = event.target.closest("[data-osint-research-kind]");
            if (researchKind && view.contains(researchKind)) {
                this.setOSINTResearchKind(researchKind.value);
                return;
            }
            const geoCandidate = event.target.closest("[data-osint-geo-candidate]");
            if (geoCandidate && view.contains(geoCandidate)) {
                this.osintGeoState.selectedCandidateIndex = Math.max(0, Number(geoCandidate.value) || 0);
                this.rebuildOSINTGeoVerification();
                this.renderOSINTState(view);
                return;
            }
            const geoAssessment = event.target.closest("[data-osint-geo-assessment]");
            if (geoAssessment && view.contains(geoAssessment)) {
                this.osintGeoState.investigatorAssessment = geoAssessment.value;
                return;
            }
            const domainIp = event.target.closest("[data-osint-domain-ip]");
            if (domainIp && view.contains(domainIp)) {
                this.osintDomainState.selectedPublicIp = domainIp.value;
                return;
            }
            const entityFilter = event.target.closest("[data-osint-entity-filter]");
            if (entityFilter && view.contains(entityFilter)) {
                if (entityFilter.dataset.osintEntityFilter === "type") this.osintEntityState.typeFilter = entityFilter.value;
                if (entityFilter.dataset.osintEntityFilter === "relationshipStatus") this.osintEntityState.relationshipFilter = entityFilter.value;
                this.renderOSINTState(view);
                return;
            }
            const select = event.target.closest("[data-osint-filter]");
            if (!select || !view.contains(select)) return;
            this.osintState.filters[select.dataset.osintFilter] = select.value;
            this.renderOSINTState(view);
        };
        this.boundOSINTDeckInput = event => {
            const mediaObservation = event.target.closest("[data-osint-media-observation]");
            if (mediaObservation && view.contains(mediaObservation)) {
                this.osintMediaState.analystObservation = mediaObservation.value.slice(0, 4000);
                return;
            }
            const geoInput = event.target.closest("[data-osint-geo-input]");
            if (geoInput && view.contains(geoInput)) {
                this.osintGeoState.input = geoInput.value.slice(0, 240);
                return;
            }
            const geoNote = event.target.closest("[data-osint-geo-note]");
            if (geoNote && view.contains(geoNote)) {
                this.osintGeoState.investigatorNote = geoNote.value.slice(0, 1200);
                return;
            }
            const domainInput = event.target.closest("[data-osint-domain-input]");
            if (domainInput && view.contains(domainInput)) {
                this.osintDomainState.input = domainInput.value.slice(0, 512);
                return;
            }
            const domainNote = event.target.closest("[data-osint-domain-note]");
            if (domainNote && view.contains(domainNote)) {
                this.osintDomainState.analystObservation = domainNote.value.slice(0, 4000);
                return;
            }
            const researchInput = event.target.closest("[data-osint-research-input]");
            if (researchInput && view.contains(researchInput)) {
                this.osintResearchState.input = researchInput.value.slice(0, 2048);
                return;
            }
            const researchNote = event.target.closest("[data-osint-research-note]");
            if (researchNote && view.contains(researchNote)) {
                this.osintResearchState.analystObservation = researchNote.value.slice(0, 4000);
                return;
            }
            const researchExcerpt = event.target.closest("[data-osint-research-excerpt]");
            if (researchExcerpt && view.contains(researchExcerpt)) {
                this.osintResearchState.excerpt = researchExcerpt.value.slice(0, 4000);
                return;
            }
            const researchLocation = event.target.closest("[data-osint-research-excerpt-location]");
            if (researchLocation && view.contains(researchLocation)) {
                this.osintResearchState.excerptLocation = researchLocation.value.slice(0, 240);
                return;
            }
            const entityNote = event.target.closest("[data-osint-entity-note]");
            if (entityNote && view.contains(entityNote)) {
                this.osintEntityState.analystNote = entityNote.value.slice(0, 4000);
                return;
            }
            const researchRelation = event.target.closest("[data-osint-research-claim-relation]");
            if (researchRelation && view.contains(researchRelation)) {
                this.osintResearchState.claimRelationship = researchRelation.value;
                return;
            }
            const input = event.target.closest("[data-osint-query-input]");
            if (!input || !view.contains(input)) return;
            this.osintQueryDrafts[input.dataset.osintQueryInput] = input.value.slice(0, 2048);
            const provider = this.osintProviderRegistry && this.osintProviderRegistry.getProvider(input.dataset.osintQueryInput);
            const form = input.closest("form");
            const submit = form && form.querySelector('button[type="submit"]');
            if (submit && provider) submit.disabled = !this.validateOSINTQueryDraft(provider, input.value).valid || Boolean(this.osintActiveQuery);
        };
        this.boundOSINTDeckSubmit = event => {
            const geoForm = event.target.closest("[data-osint-geo-form]");
            if (geoForm && view.contains(geoForm)) {
                event.preventDefault();
                this.beginOSINTGeoVerification();
                return;
            }
            const geoObservationForm = event.target.closest("[data-osint-geo-observation-form]");
            if (geoObservationForm && view.contains(geoObservationForm)) {
                event.preventDefault();
                this.addOSINTGeoInvestigatorObservation(geoObservationForm);
                return;
            }
            const domainForm = event.target.closest("[data-osint-domain-form]");
            if (domainForm && view.contains(domainForm)) {
                event.preventDefault();
                this.beginOSINTDomainInfrastructureVerification();
                return;
            }
            const researchForm = event.target.closest("[data-osint-research-form]");
            if (researchForm && view.contains(researchForm)) {
                event.preventDefault();
                this.beginOSINTResearchSourceVerification();
                return;
            }
            const entityCreateForm = event.target.closest("[data-osint-entity-create-form]");
            if (entityCreateForm && view.contains(entityCreateForm)) {
                event.preventDefault();
                this.submitOSINTEntityCreateForm(entityCreateForm);
                return;
            }
            const entityRelationshipForm = event.target.closest("[data-osint-entity-relationship-form]");
            if (entityRelationshipForm && view.contains(entityRelationshipForm)) {
                event.preventDefault();
                this.submitOSINTEntityRelationshipForm(entityRelationshipForm);
                return;
            }
            const form = event.target.closest("[data-osint-query-form]");
            if (form && view.contains(form)) {
                event.preventDefault();
                const provider = this.osintProviderRegistry && this.osintProviderRegistry.getProvider(form.dataset.osintQueryForm);
                if (provider) this.beginOSINTQuery(provider);
                return;
            }
            const noteForm = event.target.closest("[data-osint-case-note-form]");
            if (!noteForm || !view.contains(noteForm)) return;
            event.preventDefault();
            this.submitOSINTCaseNote(noteForm);
        };
        this.boundOSINTDeckOver = event => {
            const card = event.target.closest("[data-osint-tool]");
            if (!card || !view.contains(card) || card.contains(event.relatedTarget)) return;
            this.previewOSINTProviderById(card.dataset.osintTool);
        };
        this.boundOSINTDeckOut = event => {
            const card = event.target.closest("[data-osint-tool]");
            if (!card || !view.contains(card) || card.contains(event.relatedTarget)) return;
            this.clearOSINTProviderPreview();
        };
        view.addEventListener("click", this.boundOSINTDeckClick);
        view.addEventListener("change", this.boundOSINTDeckChange);
        view.addEventListener("input", this.boundOSINTDeckInput);
        view.addEventListener("submit", this.boundOSINTDeckSubmit);
        view.addEventListener("pointerover", this.boundOSINTDeckOver);
        view.addEventListener("pointerout", this.boundOSINTDeckOut);
        view.dataset.osintDeckBound = "true";
    }

    disposeOSINTDeck() {
        const view = this.osintView;
        if (view && view.dataset.osintDeckBound === "true") {
            view.removeEventListener("click", this.boundOSINTDeckClick);
            view.removeEventListener("change", this.boundOSINTDeckChange);
            view.removeEventListener("input", this.boundOSINTDeckInput);
            view.removeEventListener("submit", this.boundOSINTDeckSubmit);
            view.removeEventListener("pointerover", this.boundOSINTDeckOver);
            view.removeEventListener("pointerout", this.boundOSINTDeckOut);
            delete view.dataset.osintDeckBound;
        }
        // Every provider-backed OSINT surface owns an AbortController through
        // the shared runtime. Leaving the workspace must cancel each active
        // request, even if its delegated DOM bindings were already removed.
        this.cancelActiveOSINTQuery({reason: "WORKSPACE_CLOSED", render: false});
        this.cancelOSINTGeoVerification(false);
        this.cancelOSINTDomainInfrastructureVerification(false);
        this.cancelOSINTResearchVerification(false);
        this.releaseOSINTMediaPreview();
        this.closeOSINTDetail();
        this.closeOSINTCaseDialog();
    }

    openOSINTToolById(toolId) {
        return this.selectOSINTProviderById(toolId);
    }

    selectOSINTProviderById(toolId, trigger = null) {
        const provider = this.osintRegistry && typeof this.osintRegistry.getProvider === "function"
            ? this.osintRegistry.getProvider(toolId)
            : this.getOSINTProviders().find(item => item.id === toolId);
        if (!provider || !this.osintAccess) return null;
        if (this.osintActiveQuery && this.osintActiveQuery.providerId !== provider.id) this.cancelActiveOSINTQuery({reason: "PROVIDER_CHANGED", render: false});
        this.osintSelectionTrigger = trigger;
        this.osintAccess.select(provider);
        this.osintState.categoryId = provider.category;
        this.renderOSINTState();
        const selectedCard = this.osintView && this.osintView.querySelector(`[data-osint-tool="${provider.id}"]`);
        if (selectedCard && trigger) selectedCard.focus({preventScroll: true});
        return provider;
    }

    previewOSINTProviderById(toolId) {
        if (!this.osintAccess) return;
        const provider = this.osintRegistry && typeof this.osintRegistry.getProvider === "function" ? this.osintRegistry.getProvider(toolId) : null;
        if (!provider) return;
        this.osintAccess.hover(provider);
        const preview = this.osintView && this.osintView.querySelector("[data-osint-panel-preview]");
        if (!preview) return;
        preview.hidden = false;
        preview.innerHTML = `<small>HOVER PREVIEW</small><strong>${this.escape(provider.name)}</strong><span>${this.escape(provider.description)}</span><em>${this.escape(this.osintBadgeLabel(provider, 1)[0] || "EXTERNAL")} · ${this.escape(this.formatOSINTEnum(provider.providerStatus))}</em>`;
    }

    clearOSINTProviderPreview() {
        if (this.osintAccess) this.osintAccess.clearHover();
        const preview = this.osintView && this.osintView.querySelector("[data-osint-panel-preview]");
        if (!preview) return;
        preview.hidden = true;
        preview.innerHTML = "";
    }

    osintPolicyDecision(name, provider) {
        const policy = this.osintPolicy;
        if (!policy || typeof policy[name] !== "function") return {allowed: false, code: "POLICY_UNAVAILABLE", message: "OSINT provider policy is unavailable."};
        return policy[name](provider);
    }

    getOSINTProviderRuntimeState(provider) {
        if (!provider || !this.osintRuntime || typeof this.osintRuntime.getProviderState !== "function") {
            return {health: "UNKNOWN", rateLimit: null};
        }
        return this.osintRuntime.getProviderState(provider.id);
    }

    getOSINTQueryDecision(provider) {
        return this.osintPolicyDecision("canQuery", provider);
    }

    validateOSINTQueryDraft(provider, value) {
        const draft = String(value || "");
        const decision = this.getOSINTQueryDecision(provider);
        if (!decision.allowed) return {valid: false, error: decision};
        try {
            const adapter = this.osintAdapterFactory && this.osintAdapterFactory.createAdapter(provider.id);
            if (!adapter || typeof adapter.validateInput !== "function") {
                return {valid: false, error: {code: "ADAPTER_NOT_FOUND", message: "No native query adapter is available for this provider."}};
            }
            return {valid: true, value: adapter.validateInput(draft)};
        } catch (error) {
            return {valid: false, error: {code: error.code || "INVALID_INPUT", message: error.message || "Enter a valid manual query."}};
        }
    }

    renderOSINTNativeQuery(provider, snapshot) {
        const decision = this.getOSINTQueryDecision(provider);
        if (!decision.allowed) return "";
        const draft = this.osintQueryDrafts[provider.id] || "";
        const validation = this.validateOSINTQueryDraft(provider, draft);
        const runtimeState = this.getOSINTProviderRuntimeState(provider);
        const active = this.osintActiveQuery && this.osintActiveQuery.providerId === provider.id;
        const lastResult = snapshot.lastResult && snapshot.lastResult.providerId === provider.id ? snapshot.lastResult : null;
        const error = snapshot.lastError && snapshot.lastError.providerId === provider.id ? snapshot.lastError : null;
        const health = this.formatOSINTEnum(runtimeState.health || snapshot.providerHealth || "UNKNOWN");
        const promotable = lastResult && ["SUCCESS", "EMPTY", "PARTIAL"].includes(lastResult.status) && this.osintLastNormalizedResults && this.osintLastNormalizedResults[provider.id];
        const resultMarkup = lastResult && ["SUCCESS", "EMPTY", "PARTIAL"].includes(lastResult.status)
            ? `<section class="osint-native-result" data-osint-native-result><header><small>LAST RESULT</small><strong>${this.escape(this.formatOSINTEnum(lastResult.status))}</strong></header><div><small>ARCHIVE</small><strong>${lastResult.available ? "SNAPSHOT AVAILABLE" : "NO SNAPSHOT AVAILABLE"}</strong></div><div><small>CANONICAL URL</small><strong>${this.escape(lastResult.canonicalUrl || "NOT RETURNED")}</strong></div><div><small>SNAPSHOT TIME</small><strong>${this.escape(lastResult.snapshotTimestamp || "NOT RETURNED")}</strong></div>${(lastResult.warnings || []).length ? `<p>${this.escape(lastResult.warnings.join(" · "))}</p>` : ""}<small>Snapshot links are informational only and never open automatically.</small>${promotable ? `<button type="button" data-osint-save-result="${this.escape(provider.id)}">SAVE TO CASE</button>` : ""}</section>`
            : error
                ? `<section class="osint-native-result error"><header><small>QUERY RESULT</small><strong>${this.escape(this.formatOSINTEnum(error.code))}</strong></header><p>${this.escape(error.message)}</p></section>`
                : `<section class="osint-native-result idle"><small>ONE MANUAL URL OR DOMAIN · NO BULK QUERY · NO AUTO-OPEN</small></section>`;
        return `<section class="osint-native-query" data-osint-native-query><header><div><small>NATIVE CAPABILITY</small><strong>HISTORICAL ARCHIVE</strong></div><em>HEALTH · ${this.escape(health)}</em></header><form data-osint-query-form="${this.escape(provider.id)}" novalidate><label><span>URL OR DOMAIN</span><input class="aegis-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2048" value="${this.escape(draft)}" placeholder="example.org" data-osint-query-input="${this.escape(provider.id)}" aria-describedby="osint_query_help"></label><div class="osint-native-query-actions"><button type="submit" ${!validation.valid || active ? "disabled" : ""}>${active ? "QUERYING…" : "QUERY WAYBACK"}</button>${active ? `<button type="button" data-osint-query-cancel="${this.escape(provider.id)}">CANCEL</button>` : ""}</div><small id="osint_query_help">User-initiated availability check only. The provider receives the manual URL or domain you enter.</small></form>${resultMarkup}</section>`;
    }

    async beginOSINTQuery(provider) {
        const decision = this.getOSINTQueryDecision(provider);
        const draft = this.osintQueryDrafts[provider.id] || "";
        const validation = this.validateOSINTQueryDraft(provider, draft);
        if (!decision.allowed || !validation.valid || !this.osintRuntime || !this.osintAccess) {
            const error = !decision.allowed ? decision : validation.error || {code: "ADAPTER_NOT_FOUND", message: "Native query runtime is unavailable."};
            this.osintAccess.recordError(provider, error.code || "INVALID_INPUT", error.message || "Manual query is unavailable.");
            this.renderOSINTState();
            return null;
        }
        this.cancelActiveOSINTQuery({reason: "SUPERSEDED", render: false});
        this.osintAccess.beginQuery(provider, {querySummary: "Manual historical-archive query"});
        const context = {
            capability: "HISTORICAL_ARCHIVE",
            locale: navigator.language || "en",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            networkAllowed: true,
            userInitiated: true,
            privacyMode: "EPHEMERAL"
        };
        const pending = this.osintRuntime.startQuery(provider.id, validation.value, context);
        this.osintActiveQuery = {requestId: pending.requestId, providerId: provider.id};
        this.renderOSINTState();
        pending.promise.then(result => {
            const stillCurrent = this.osintActiveQuery && this.osintActiveQuery.requestId === pending.requestId;
            if (stillCurrent) this.osintActiveQuery = null;
            this.osintLastNormalizedResults[provider.id] = result;
            if (this.osintAccess) this.osintAccess.recordQueryResult(provider, result, {
                querySummary: "Manual historical-archive query",
                providerHealth: this.getOSINTProviderRuntimeState(provider).health
            });
            if (this.getSelectedOSINTProvider() && this.getSelectedOSINTProvider().id === provider.id) this.renderOSINTState();
        });
        return pending;
    }

    cancelActiveOSINTQuery({reason = "USER_CANCELLED", render = true} = {}) {
        if (!this.osintActiveQuery || !this.osintRuntime) return false;
        const active = this.osintActiveQuery;
        const cancelled = this.osintRuntime.cancel(active.requestId, reason);
        if (render) this.renderOSINTState();
        return cancelled;
    }

    renderOSINTToolAccessPanel(provider = this.getSelectedOSINTProvider()) {
        const snapshot = this.getOSINTPanelSnapshot();
        const history = snapshot.history || [];
        const previewProvider = snapshot.previewProviderId && this.osintRegistry && typeof this.osintRegistry.getProvider === "function"
            ? this.osintRegistry.getProvider(snapshot.previewProviderId)
            : null;
        const previewMarkup = `<section class="osint-panel-hover-preview" data-osint-panel-preview${previewProvider ? "" : " hidden"}>${previewProvider ? `<small>HOVER PREVIEW</small><strong>${this.escape(previewProvider.name)}</strong><span>${this.escape(previewProvider.description)}</span><em>${this.escape(this.osintBadgeLabel(previewProvider, 1)[0] || "EXTERNAL")} · ${this.escape(this.formatOSINTEnum(previewProvider.providerStatus))}</em>` : ""}</section>`;
        const state = this.escape(this.formatOSINTEnum(snapshot.panelState, "IDLE"));
        const historyMarkup = history.length
            ? `<ol class="osint-session-history" aria-label="OSINT session history">${history.slice(-5).reverse().map(event => `<li><strong>${this.escape(this.formatOSINTEnum(event.action))}</strong><span>${this.escape(event.providerName)} · ${this.escape(this.formatOSINTEnum(event.state))}</span><small>${this.escape(new Date(event.timestamp).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", second: "2-digit"}))}</small></li>`).join("")}</ol>`
            : `<p class="osint-panel-muted">No OSINT session actions yet.</p>`;
        const historyButton = history.length
            ? `<button type="button" class="osint-panel-quiet-action${snapshot.clearArmed ? " confirm" : ""}" data-osint-history-clear>${snapshot.clearArmed ? "CONFIRM CLEAR" : "CLEAR SESSION"}</button>`
            : "";
        const runtimeState = provider ? this.getOSINTProviderRuntimeState(provider) : null;
        const stateReadout = `<section class="osint-panel-state-readout" aria-label="Tool access state"><div><small>PANEL</small><strong>${state}</strong></div><div><small>QUERY</small><strong>${this.escape(this.formatOSINTEnum(snapshot.queryState, "IDLE"))}</strong></div>${provider ? `<div><small>PROVIDER</small><strong>${this.escape(this.formatOSINTEnum(provider.providerStatus))}</strong></div><div><small>HEALTH</small><strong>${this.escape(this.formatOSINTEnum(runtimeState && runtimeState.health || snapshot.providerHealth || "UNKNOWN"))}</strong></div><div><small>LEGAL</small><strong>${this.escape(this.formatOSINTEnum(provider.legalStatus))}</strong></div>` : ""}</section>`;
        const caseReadout = this.renderOSINTCaseReadout();
        if (!provider) return `<div class="osint-tool-access" data-osint-tool-access data-panel-state="IDLE">${stateReadout}${caseReadout}${previewMarkup}<section class="osint-panel-idle"><strong>SELECT A PROVIDER</strong><p>Choose a catalog entry to inspect its access method, policies, risk context and allowed actions.</p></section><section class="osint-panel-history"><header><small>SESSION HISTORY</small>${historyButton}</header>${historyMarkup}</section></div>`;

        const referenceOnly = Boolean(this.osintPolicy && this.osintPolicy.isReferenceOnly && this.osintPolicy.isReferenceOnly(provider));
        const actions = this.renderOSINTPanelActions(provider, referenceOnly);
        return `<div class="osint-tool-access${referenceOnly ? " reference-only" : ""}" data-osint-tool-access data-panel-state="${this.escape(snapshot.panelState)}">${stateReadout}${caseReadout}${previewMarkup}<section class="osint-panel-identity"><div><small>ACTIVE PROVIDER</small><h3>${this.escape(provider.name)}</h3><span>${this.escape(provider.shortName)}</span></div><em>${this.escape(referenceOnly ? "REFERENCE ONLY" : this.osintPolicy && this.osintPolicy.displayAccess ? this.osintPolicy.displayAccess(provider) : provider.accessMode)}</em><p>${this.escape(provider.description)}</p><div class="osint-category-tags">${(provider.tags || []).slice(0, 8).map(tag => `<span>${this.escape(tag)}</span>`).join("")}</div></section>${this.renderOSINTProviderMetadata(provider, referenceOnly)}${this.renderOSINTNativeQuery(provider, snapshot)}${snapshot.lastError ? `<section class="osint-panel-error"><strong>${this.escape(this.formatOSINTEnum(snapshot.lastError.code))}</strong><p>${this.escape(snapshot.lastError.message)}</p><small>${this.escape(new Date(snapshot.lastError.timestamp).toLocaleTimeString())}</small></section>` : ""}<section class="osint-panel-actions" aria-label="Allowed provider actions">${actions}</section><section class="osint-panel-history"><header><small>SESSION HISTORY</small>${historyButton}</header>${historyMarkup}</section></div>`;
    }

    getOSINTGeoModule() { return window.OSINTGeospatialVerification || null; }

    getOSINTGeoProvider() {
        return this.osintProviderRegistry && this.osintProviderRegistry.getProvider("open-meteo-geocoding");
    }

    getOSINTVisualMediaModule() { return window.OSINTVisualMediaVerification || null; }

    getOSINTVisualMediaProvider() {
        return this.osintProviderRegistry && this.osintProviderRegistry.getProvider("local-media-inspection");
    }

    releaseOSINTMediaPreview() {
        const state = this.osintMediaState;
        // Preview data is an ephemeral FileReader data URL. Do not retain the
        // selected File or a filesystem path after the visible session state is cleared.
        if (state) state.previewUrl = null;
    }

    createOSINTMediaPreview(file) {
        return new Promise((resolve, reject) => {
            if (typeof FileReader === "undefined") {
                reject(Object.assign(new Error("Local preview support is unavailable."), {code: "PREVIEW_UNAVAILABLE"}));
                return;
            }
            const reader = new FileReader();
            reader.onerror = () => reject(Object.assign(new Error("The selected image could not be prepared for preview."), {code: "PREVIEW_UNAVAILABLE"}));
            reader.onload = () => {
                const source = typeof reader.result === "string" ? reader.result : null;
                if (!source) return reject(Object.assign(new Error("The selected image could not be prepared for preview."), {code: "PREVIEW_UNAVAILABLE"}));
                const preview = new Image();
                preview.onload = () => resolve(source);
                preview.onerror = () => reject(Object.assign(new Error("The selected image metadata was read, but its preview could not be decoded."), {code: "PREVIEW_UNAVAILABLE"}));
                preview.src = source;
            };
            reader.readAsDataURL(file);
        });
    }

    handleOSINTMediaAction(action, trigger = null) {
        const state = this.osintMediaState;
        if (!state) return;
        if (action === "open") {
            state.mode = "MEDIA";
            this.osintState.categoryId = "geospatial";
            this.renderOSINTState();
            return;
        }
        if (action === "catalog") {
            this.releaseOSINTMediaPreview();
            this.osintMediaState = {mode: "CATALOG", phase: "IDLE", result: null, previewUrl: null, analystObservation: "", lastError: null, selectedFile: null};
            this.renderOSINTState();
            return;
        }
        if (action === "clear") {
            this.releaseOSINTMediaPreview();
            this.osintMediaState = {mode: "MEDIA", phase: "IDLE", result: null, previewUrl: null, analystObservation: "", lastError: null, selectedFile: null};
            this.renderOSINTState();
            return;
        }
        if (action === "verify-location") {
            const geo = state.result && state.result.geo;
            if (!geo) return this.showToast(this.osintView, "NO IMAGE METADATA LOCATION AVAILABLE");
            return this.beginOSINTInvestigationHandoff({
                id: "media-gps-handoff", type: "MEDIA", label: state.result.file && state.result.file.displayLabel || "Selected media",
                capability: "VISUAL_MEDIA_VERIFICATION", payload: {latitude: geo.latitude, longitude: geo.longitude},
                provenance: {sourceCapability: "VISUAL_MEDIA_VERIFICATION", sourceType: "IMAGE_METADATA"}
            }, "VERIFY_LOCATION");
        }
        if (action === "save") this.promoteOSINTMediaEvidence(trigger);
    }

    async inspectOSINTMediaFile(file) {
        const Media = this.getOSINTVisualMediaModule();
        const state = this.osintMediaState;
        if (!Media || !state || !file || typeof file.arrayBuffer !== "function") return;
        this.releaseOSINTMediaPreview();
        state.phase = "INSPECTING";
        state.lastError = null;
        state.result = null;
        state.selectedFile = null;
        this.renderOSINTState();
        try {
            const bytes = await file.arrayBuffer();
            const result = await Media.inspectMedia({name: file.name, type: file.type, bytes});
            state.result = result;
            state.phase = "COMPLETE";
            state.selectedFile = {name: Media.safeLabel(file.name), type: result.file.mediaType, size: result.file.byteSize};
            try {
                state.previewUrl = await this.createOSINTMediaPreview(file);
            } catch (previewError) {
                state.previewUrl = null;
                result.warnings = [...(result.warnings || []), {
                    code: "PREVIEW_UNAVAILABLE",
                    message: "Metadata was read locally, but a visual preview could not be decoded."
                }];
            }
        } catch (error) {
            state.phase = "ERROR";
            state.lastError = {code: error && error.code || "ERROR", message: error && error.userMessage || error && error.message || "The selected media could not be inspected."};
        }
        this.renderOSINTState();
    }

    renderOSINTVisualMediaWorkspace(grid) {
        const state = this.osintMediaState || {};
        const result = state.result;
        const media = result && result.file;
        const image = result && result.image;
        const exif = result && result.exif;
        const geo = result && result.geo;
        const software = result && result.software;
        const integrity = result && result.integrity;
        const hasGeo = Boolean(geo && Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude));
        const status = state.phase === "INSPECTING" ? "INSPECTING" : state.lastError ? state.lastError.code || "ERROR" : result ? result.status : "READY";
        const readout = (label, value, fallback = "ABSENT") => `<div><small>${this.escape(label)}</small><strong>${this.escape(value === null || value === undefined || value === "" ? fallback : String(value))}</strong></div>`;
        const preview = state.previewUrl ? `<img src="${this.escape(state.previewUrl)}" alt="Explicitly selected visual evidence preview">` : `<div class="osint-media-preview-empty"><strong>NO MEDIA SELECTED</strong><span>Select one JPEG, PNG or WebP file for local inspection.</span></div>`;
        const warningMarkup = result && result.warnings && result.warnings.length
            ? `<ul>${result.warnings.map(warning => `<li>${this.escape(warning.message || warning.code || warning)}</li>`).join("")}</ul>`
            : `<p>Metadata is contextual. Its presence or absence does not prove authenticity, location, capture time or editing history.</p>`;
        grid.innerHTML = `<section class="osint-media-header workspace-panel"><button type="button" class="osint-back-button" data-osint-media-action="catalog">‹ OSINT CATALOG</button><div><small>OSINT / VISUAL &amp; MEDIA VERIFICATION</small><h2>PASSIVE MEDIA CONTEXT</h2><p>One explicit local image. Inspection and SHA-256 run in-process; no upload, background query, hidden path history or automatic map action.</p></div><div class="osint-media-status"><small>STATE</small><strong>${this.escape(this.formatOSINTEnum(status))}</strong><span>${this.escape(result && result.confidence || "LOW")} CONFIDENCE</span></div></section>
            <section class="osint-media-input workspace-panel"><header><h2>MEDIA INPUT</h2><span>EXPLICIT / LOCAL</span></header><div class="workspace-panel-content"><label class="osint-media-file-input"><span>JPEG · PNG · WEBP · 20 MB MAX</span><input class="aegis-input" type="file" accept="image/jpeg,image/png,image/webp" data-osint-media-file></label>${state.selectedFile ? `<small class="osint-media-selected-file">SELECTED · ${this.escape(state.selectedFile.name)} · ${this.escape(state.selectedFile.type)} · ${this.escape(state.selectedFile.size)} BYTES</small>` : ""}<p>Only the selected file bytes are inspected. Original media remains outside Aegis persistence; ADD TO CASE stores a redaction-reviewable normalized record, not the image.</p><footer><button type="button" data-osint-media-action="clear"${state.phase === "INSPECTING" ? " disabled" : ""}>CLEAR</button></footer>${state.lastError ? `<section class="osint-panel-error"><strong>${this.escape(this.formatOSINTEnum(state.lastError.code))}</strong><p>${this.escape(state.lastError.message)}</p></section>` : ""}</div></section>
            <section class="osint-media-preview workspace-panel"><header><h2>VISUAL PREVIEW</h2><span>${this.escape(media && media.displayLabel || "NO FILE")}</span></header><div class="workspace-panel-content"><figure>${preview}<figcaption>Preview is bounded to preserve analytical context and does not alter the original supplied bytes.</figcaption></figure></div></section>
            <section class="osint-media-metadata workspace-panel"><header><h2>VERIFICATION CONTEXT</h2><span>${this.escape(this.formatOSINTEnum(result && result.status || "UNVERIFIED"))}</span></header><div class="workspace-panel-content"><section class="osint-media-readout"><div class="osint-media-readout-group"><header>FILE</header>${readout("TYPE", media && media.mediaType)}${readout("SIZE", media ? `${media.byteSize} BYTES` : null)}${readout("DIMENSIONS", image ? `${image.width} × ${image.height}` : null)}${readout("ASPECT", image && image.aspectRatio)}</div><div class="osint-media-readout-group"><header>CAPTURE</header>${readout("TIMESTAMP", exif && exif.captureTimestamp)}${readout("TIMEZONE", exif && exif.timezoneStatus)}${readout("CAMERA", [exif && exif.cameraMake, exif && exif.cameraModel].filter(Boolean).join(" ") || null)}${readout("LENS", exif && exif.lens)}</div><div class="osint-media-readout-group"><header>LOCATION</header>${readout("GPS", hasGeo ? `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}` : null)}${readout("ALTITUDE", geo && geo.altitudeM !== null && geo.altitudeM !== undefined ? `${geo.altitudeM} M` : null)}${readout("DIRECTION", geo && geo.directionDegrees !== null && geo.directionDegrees !== undefined ? `${geo.directionDegrees}°` : null)}${readout("SOURCE", geo && geo.source)}</div><div class="osint-media-readout-group"><header>INTEGRITY</header>${readout("SHA-256", integrity && integrity.originalMediaHash)}${readout("HASH SCOPE", integrity && integrity.scope)}${readout("SOFTWARE TAG", software && software.tag)}</div></section><section class="osint-media-warnings"><small>ASSESSMENT LIMITS</small>${warningMarkup}</section><footer><button type="button" data-osint-media-action="verify-location"${hasGeo ? "" : " disabled"}>VERIFY LOCATION</button>${result ? `<button type="button" data-osint-media-action="save">ADD TO CASE</button>` : ""}</footer></div></section>
            <section class="osint-media-observation workspace-panel"><header><h2>ANALYST OBSERVATION</h2><span>EPHEMERAL UNTIL ADD TO CASE</span></header><div class="workspace-panel-content"><label><span>ANALYST NOTE · NOT EXTRACTED FACT</span><textarea class="aegis-input" data-osint-media-observation maxlength="4000" ${result ? "" : "disabled"}>${this.escape(state.analystObservation || "")}</textarea></label><p>Observation text cannot change verification status and triggers no provider query. Sensitive metadata can be redacted during the established Evidence Preview.</p></div></section>
            <aside class="osint-media-policy workspace-panel"><header><h2>MEDIA POLICY</h2><span>PASSIVE / FAIL-CLOSED</span></header><div class="workspace-panel-content"><p>No facial recognition, person identification, reverse-image upload, OCR-driven account search, directory scan or hidden persistence is available here.</p><p>GPS handoff is explicit. It transfers normalized coordinates with <strong>IMAGE METADATA</strong> provenance only after you choose VERIFY LOCATION; it does not query a provider or mutate the global map.</p><small>ORIGINAL MEDIA ATTACHMENT · DEFERRED</small></div></aside>`;
    }

    promoteOSINTMediaEvidence(trigger = null) {
        const Media = this.getOSINTVisualMediaModule();
        const state = this.osintMediaState;
        const provider = this.getOSINTVisualMediaProvider();
        if (!Media || !state || !state.result || !provider) return this.showToast(this.osintView, "NO PROMOTABLE MEDIA RESULT");
        const data = Media.toEvidenceData(state.result, state.analystObservation || "");
        this.osintLastNormalizedResults[provider.id] = Object.freeze({requestId: `media-evidence-${Date.now().toString(36)}`, providerId: provider.id, capability: "VISUAL_MEDIA_VERIFICATION", status: "SUCCESS", queriedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 0, summary: `Visual media inspection: ${data.media.displayLabel || "selected image"}.`, data, warnings: state.result.warnings.slice(), source: {provider: "Local media inspection", type: "EXPLICIT_LOCAL_FILE"}, confidence: state.result.confidence, rawAvailable: false, error: null});
        this.openOSINTEvidencePromotion(provider.id, trigger);
    }

    getOSINTDomainInfrastructureModule() { return window.OSINTDomainInfrastructure || null; }

    getOSINTDomainInfrastructureProvider(id) {
        return this.osintProviderRegistry && this.osintProviderRegistry.getProvider(id);
    }

    handleOSINTDomainAction(action, trigger = null) {
        const state = this.osintDomainState;
        if (!state) return;
        if (action === "open") {
            state.mode = "DOMAIN";
            this.osintState.categoryId = "infrastructure";
            this.renderOSINTState();
            return;
        }
        if (action === "catalog") {
            this.cancelOSINTDomainInfrastructureVerification(false);
            this.osintDomainState = {mode: "CATALOG", input: "", phase: "IDLE", verification: null, activeRequestId: null, lastError: null, analystObservation: "", selectedPublicIp: ""};
            this.renderOSINTState();
            return;
        }
        if (action === "clear") {
            this.cancelOSINTDomainInfrastructureVerification(false);
            this.osintDomainState = {mode: "DOMAIN", input: "", phase: "IDLE", verification: null, activeRequestId: null, lastError: null, analystObservation: "", selectedPublicIp: ""};
            this.renderOSINTState();
            return;
        }
        if (action === "cancel") return this.cancelOSINTDomainInfrastructureVerification(true);
        if (action === "network") return this.beginOSINTDomainSelectedNetworkContext();
        if (action === "save") return this.promoteOSINTDomainInfrastructureEvidence(trigger);
    }

    async beginOSINTDomainInfrastructureVerification() {
        const Domain = this.getOSINTDomainInfrastructureModule();
        const state = this.osintDomainState;
        if (!Domain || !state) return;
        let target;
        try { target = Domain.normalizeInput(state.input); }
        catch (error) { state.phase = "ERROR"; state.lastError = {code: error.code || "INVALID_INPUT", message: error.message || "Enter one valid public domain or public IP."}; this.renderOSINTState(); return; }
        this.cancelOSINTDomainInfrastructureVerification(false);
        state.lastError = null;
        state.verification = null;
        state.selectedPublicIp = "";
        return this.runOSINTDomainInfrastructureQuery(target, false);
    }

    async beginOSINTDomainSelectedNetworkContext() {
        const Domain = this.getOSINTDomainInfrastructureModule();
        const state = this.osintDomainState;
        if (!Domain || !state || !state.selectedPublicIp || !state.verification) return this.showToast(this.osintView, "SELECT ONE PUBLIC ADDRESS FIRST");
        let selected;
        try { selected = Domain.normalizeInput(state.selectedPublicIp); }
        catch (error) { return this.showToast(this.osintView, "SELECTED ADDRESS IS NOT PUBLIC"); }
        if (!["IPv4", "IPv6"].includes(selected.targetType)) return this.showToast(this.osintView, "SELECT ONE PUBLIC ADDRESS FIRST");
        this.cancelOSINTDomainInfrastructureVerification(false);
        return this.runOSINTDomainInfrastructureQuery(selected, true);
    }

    async runOSINTDomainInfrastructureQuery(target, isExplicitDomainFollowUp) {
        const Domain = this.getOSINTDomainInfrastructureModule();
        const state = this.osintDomainState;
        const providerId = target.targetType === "DOMAIN" ? "google-public-dns" : "ripestat-network-info";
        const provider = this.getOSINTDomainInfrastructureProvider(providerId);
        if (!Domain || !state || !provider || !this.osintRuntime) {
            state.phase = "ERROR"; state.lastError = {code: "PROVIDER_UNAVAILABLE", message: "The approved passive infrastructure provider is unavailable."}; this.renderOSINTState(); return;
        }
        state.phase = "LOADING";
        this.renderOSINTState();
        const pending = this.osintRuntime.startQuery(provider.id, target, {capability: "INFRASTRUCTURE_CONTEXT", networkAllowed: true, userInitiated: true, sessionId: "ephemeral-domain-infrastructure"});
        state.activeRequestId = pending.requestId;
        const result = await pending.promise;
        if (!this.osintDomainState || this.osintDomainState.activeRequestId !== pending.requestId) return;
        state.activeRequestId = null;
        if (!result || !["SUCCESS", "EMPTY", "PARTIAL"].includes(result.status)) {
            state.phase = result && result.status === "CANCELLED" ? "IDLE" : "ERROR";
            state.lastError = {code: result && result.error && result.error.code || result && result.status || "ERROR", message: result && result.summary || "Passive infrastructure context did not complete."};
            this.renderOSINTState();
            return;
        }
        const observation = {providerId: provider.id, providerName: provider.name, type: result.source && result.source.type || "PUBLIC_PROVIDER", observedAt: result.completedAt, status: result.status, summary: result.summary};
        if (isExplicitDomainFollowUp && state.verification) {
            const previous = state.verification;
            state.verification = Domain.createVerification({target: previous.target, dns: previous.dns, network: result.data.network, providerObservations: [...previous.providerObservations, observation], analystObservation: state.analystObservation});
        } else if (target.targetType === "DOMAIN") {
            state.verification = Domain.createVerification({target, dns: result.data, providerObservations: [observation], analystObservation: state.analystObservation});
        } else {
            state.verification = Domain.createVerification({target, network: result.data.network, providerObservations: [observation], analystObservation: state.analystObservation});
        }
        state.phase = "COMPLETE";
        this.renderOSINTState();
    }

    cancelOSINTDomainInfrastructureVerification(render = true) {
        const state = this.osintDomainState;
        if (!state || !state.activeRequestId || !this.osintRuntime) return false;
        const cancelled = this.osintRuntime.cancel(state.activeRequestId);
        state.activeRequestId = null;
        state.phase = "IDLE";
        if (render) this.renderOSINTState();
        return cancelled;
    }

    promoteOSINTDomainInfrastructureEvidence(trigger = null) {
        const Domain = this.getOSINTDomainInfrastructureModule();
        const state = this.osintDomainState;
        if (!Domain || !state || !state.verification || !state.verification.providerObservations.length) return this.showToast(this.osintView, "NO PROMOTABLE INFRASTRUCTURE RESULT");
        const data = Domain.toEvidenceData(state.verification, state.analystObservation || "");
        const providerId = state.verification.providerObservations[0].providerId;
        this.osintLastNormalizedResults[providerId] = Object.freeze({requestId: `infrastructure-evidence-${Date.now().toString(36)}`, providerId, capability: "INFRASTRUCTURE_CONTEXT", status: "SUCCESS", queriedAt: data.queriedAt, completedAt: data.completedAt, durationMs: 0, summary: `Passive infrastructure context: ${data.infrastructure.normalizedTarget}.`, data, warnings: [], source: {provider: data.provider, type: "NORMALIZED_PASSIVE_OBSERVATIONS"}, confidence: state.verification.confidence, rawAvailable: false, error: null});
        this.openOSINTEvidencePromotion(providerId, trigger);
    }

    getOSINTResearchSourceModule() { return window.OSINTResearchSourceVerification || null; }

    getOSINTResearchProvider(id) {
        return this.osintProviderRegistry && this.osintProviderRegistry.getProvider(id);
    }

    resetOSINTResearchState(mode = "SOURCE", sourceKind = "URL") {
        this.cancelOSINTResearchVerification(false);
        this.osintResearchState = {mode, sourceKind, input: "", phase: "IDLE", context: null, activeRequestId: null, lastError: null, analystObservation: "", excerpt: "", excerptLocation: "", claimRelationship: "UNKNOWN", selectedFile: null};
    }

    setOSINTResearchKind(kind) {
        const sourceKind = ["URL", "DOI", "LOCAL_PDF"].includes(kind) ? kind : "URL";
        this.resetOSINTResearchState("SOURCE", sourceKind);
        this.renderOSINTState();
    }

    handleOSINTResearchAction(action, trigger = null) {
        const state = this.osintResearchState;
        if (!state) return;
        if (action === "open") {
            state.mode = "SOURCE";
            this.osintState.categoryId = "discovery";
            this.renderOSINTState();
            return;
        }
        if (action === "catalog") {
            this.resetOSINTResearchState("CATALOG", state.sourceKind || "URL");
            this.renderOSINTState();
            return;
        }
        if (action === "clear") {
            this.resetOSINTResearchState("SOURCE", state.sourceKind || "URL");
            this.renderOSINTState();
            return;
        }
        if (action === "cancel") return this.cancelOSINTResearchVerification(true);
        if (action === "archive") return this.beginOSINTResearchArchiveCheck();
        if (action === "save") return this.promoteOSINTResearchEvidence(trigger);
    }

    async beginOSINTResearchSourceVerification() {
        const Source = this.getOSINTResearchSourceModule();
        const state = this.osintResearchState;
        if (!Source || !state) return;
        if (state.sourceKind === "LOCAL_PDF") return this.showToast(this.osintView, "SELECT ONE PDF DOCUMENT");
        let source;
        try { source = state.sourceKind === "DOI" ? Source.normalizeDoi(state.input) : Source.normalizeUrl(state.input); }
        catch (error) {
            state.phase = "ERROR";
            state.lastError = {code: error.code || "INVALID_INPUT", message: error.userMessage || error.message || "Enter one valid source."};
            this.renderOSINTState();
            return;
        }
        this.cancelOSINTResearchVerification(false);
        state.lastError = null;
        state.context = null;
        if (source.sourceType === "URL") {
            state.context = Source.createSourceContext({source, analystObservation: state.analystObservation, excerpt: state.excerpt, excerptLocation: state.excerptLocation, claimRelationship: state.claimRelationship});
            state.phase = "COMPLETE";
            this.renderOSINTState();
            return;
        }
        return this.runOSINTResearchProviderQuery("crossref-works", source, "DOI");
    }

    async inspectOSINTResearchPdf(file) {
        const Source = this.getOSINTResearchSourceModule();
        const state = this.osintResearchState;
        if (!Source || !state || !file || typeof file.arrayBuffer !== "function") return;
        this.cancelOSINTResearchVerification(false);
        state.sourceKind = "LOCAL_PDF";
        state.phase = "INSPECTING";
        state.lastError = null;
        state.context = null;
        state.selectedFile = null;
        this.renderOSINTState();
        try {
            const bytes = await file.arrayBuffer();
            const source = await Source.inspectPdf({name: file.name, type: file.type, bytes});
            const local = source.localFileMetadata;
            const provider = this.getOSINTResearchProvider("local-pdf-inspection");
            const observation = {providerId: provider && provider.id || "local-pdf-inspection", providerName: provider && provider.name || "Local PDF Inspection", type: "EXPLICIT_LOCAL_DOCUMENT", observedAt: new Date().toISOString(), status: "LOCAL", summary: "Bounded PDF metadata and original-byte SHA-256 were inspected locally."};
            state.context = Source.createSourceContext({source, metadata: {title: local.title, authors: local.author ? [local.author] : [], publishedAt: local.creationTimestamp, updatedAt: local.modificationTimestamp}, providerObservations: [observation], analystObservation: state.analystObservation, excerpt: state.excerpt, excerptLocation: state.excerptLocation, claimRelationship: state.claimRelationship});
            state.selectedFile = {name: local.displayLabel, type: local.mediaType, size: local.byteSize};
            state.phase = "COMPLETE";
        } catch (error) {
            state.phase = "ERROR";
            state.lastError = {code: error.code || "ERROR", message: error.userMessage || error.message || "The selected PDF could not be inspected."};
        }
        this.renderOSINTState();
    }

    async runOSINTResearchProviderQuery(providerId, source, purpose = "DOI") {
        const Source = this.getOSINTResearchSourceModule();
        const state = this.osintResearchState;
        const provider = this.getOSINTResearchProvider(providerId);
        if (!Source || !state || !source || !provider || !this.osintRuntime) {
            state.phase = "ERROR";
            state.lastError = {code: "PROVIDER_UNAVAILABLE", message: "The approved source provider is unavailable."};
            this.renderOSINTState();
            return;
        }
        state.phase = "LOADING";
        state.lastError = null;
        this.renderOSINTState();
        const capability = purpose === "ARCHIVE" ? "HISTORICAL_ARCHIVE" : "SOURCE_VERIFICATION";
        const input = purpose === "ARCHIVE" ? source.normalizedUrl : source;
        const pending = this.osintRuntime.startQuery(provider.id, input, {capability, networkAllowed: true, userInitiated: true, sessionId: "ephemeral-source-verification"});
        state.activeRequestId = pending.requestId;
        const result = await pending.promise;
        if (!this.osintResearchState || this.osintResearchState.activeRequestId !== pending.requestId) return;
        state.activeRequestId = null;
        if (!result || !["SUCCESS", "EMPTY", "PARTIAL"].includes(result.status)) {
            state.phase = result && result.status === "CANCELLED" ? "IDLE" : "ERROR";
            state.lastError = {code: result && result.error && result.error.code || result && result.status || "ERROR", message: result && result.summary || "Source verification did not complete."};
            this.renderOSINTState();
            return;
        }
        const observation = {providerId: provider.id, providerName: provider.name, type: result.source && result.source.type || "PUBLIC_PROVIDER", observedAt: result.completedAt, status: result.status, summary: result.summary};
        if (purpose === "ARCHIVE") {
            const previous = state.context;
            if (!previous) return;
            state.context = Source.createSourceContext({source: previous.source, metadata: previous.metadata, archive: {available: result.data.available === true, snapshotUrl: result.data.snapshotUrl, snapshotTimestamp: result.data.snapshotTimestamp, provider: "Wayback Machine", observedAt: result.completedAt}, providerObservations: [...previous.providerObservations, observation], analystObservation: state.analystObservation, excerpt: state.excerpt, excerptLocation: state.excerptLocation, claimRelationship: state.claimRelationship, status: result.data.available ? "ARCHIVE_AVAILABLE" : previous.verificationStatus});
        } else {
            state.context = Source.createSourceContext({source, metadata: result.data.metadata, providerObservations: [observation], analystObservation: state.analystObservation, excerpt: state.excerpt, excerptLocation: state.excerptLocation, claimRelationship: state.claimRelationship, status: result.status === "PARTIAL" ? "PARTIALLY_VERIFIED" : "METADATA_AVAILABLE"});
        }
        state.phase = "COMPLETE";
        this.renderOSINTState();
    }

    beginOSINTResearchArchiveCheck() {
        const state = this.osintResearchState;
        if (!state || !state.context || state.context.source.sourceType !== "URL") return this.showToast(this.osintView, "ARCHIVE CHECK REQUIRES A NORMALIZED PUBLIC URL");
        this.cancelOSINTResearchVerification(false);
        return this.runOSINTResearchProviderQuery("wayback", state.context.source, "ARCHIVE");
    }

    cancelOSINTResearchVerification(render = true) {
        const state = this.osintResearchState;
        if (!state || !state.activeRequestId || !this.osintRuntime) return false;
        const cancelled = this.osintRuntime.cancel(state.activeRequestId);
        state.activeRequestId = null;
        state.phase = "IDLE";
        if (render) this.renderOSINTState();
        return cancelled;
    }

    promoteOSINTResearchEvidence(trigger = null) {
        const Source = this.getOSINTResearchSourceModule();
        const state = this.osintResearchState;
        if (!Source || !state || !state.context || !state.context.providerObservations.length) return this.showToast(this.osintView, "NO PROMOTABLE SOURCE CONTEXT");
        const data = Source.toEvidenceData({...state.context, excerpt: state.excerpt, excerptLocation: state.excerptLocation, claimRelationship: state.claimRelationship}, state.analystObservation || "");
        const providerId = state.context.providerObservations[0].providerId;
        this.osintLastNormalizedResults[providerId] = Object.freeze({requestId: `source-evidence-${Date.now().toString(36)}`, providerId, capability: "SOURCE_VERIFICATION", status: "SUCCESS", queriedAt: data.queriedAt, completedAt: data.completedAt, durationMs: 0, summary: `Source context: ${data.research.title || data.research.doi || data.research.localDocument && data.research.localDocument.displayLabel || "reviewed source"}.`, data, warnings: [], source: {provider: data.provider, type: "NORMALIZED_SOURCE_CONTEXT"}, confidence: state.context.confidence, rawAvailable: false, error: null});
        this.openOSINTEvidencePromotion(providerId, trigger);
    }

    renderOSINTResearchSourceWorkspace(grid) {
        const state = this.osintResearchState || {};
        const Source = this.getOSINTResearchSourceModule();
        const context = state.context;
        const source = context && context.source;
        const metadata = context && context.metadata || {};
        const local = source && source.localFileMetadata;
        const loading = ["LOADING", "INSPECTING"].includes(state.phase);
        const canArchive = source && source.sourceType === "URL" && !loading;
        const canSave = context && context.providerObservations && context.providerObservations.length;
        const readout = (label, value, fallback = "NOT AVAILABLE") => `<div><small>${this.escape(label)}</small><strong>${this.escape(value === null || value === undefined || value === "" ? fallback : String(value))}</strong></div>`;
        const status = loading ? "ANALYZING" : state.lastError ? state.lastError.code || "ERROR" : context ? context.verificationStatus : "READY";
        const sourceInput = state.sourceKind === "LOCAL_PDF"
            ? `<label class="osint-research-file-input"><span>PDF · 25 MB MAX · EXPLICIT / LOCAL</span><input class="aegis-input" type="file" accept="application/pdf,.pdf" data-osint-research-file></label>${state.selectedFile ? `<small class="osint-research-selected-file">SELECTED · ${this.escape(state.selectedFile.name)} · ${this.escape(state.selectedFile.type)} · ${this.escape(state.selectedFile.size)} BYTES</small>` : ""}`
            : `<label><span>${state.sourceKind === "DOI" ? "DOI / DOI.ORG IDENTIFIER" : "PUBLIC HTTP(S) URL"}</span><input class="aegis-input" data-osint-research-input maxlength="2048" autocomplete="off" spellcheck="false" value="${this.escape(state.input || "")}" placeholder="${state.sourceKind === "DOI" ? "10.1000/example" : "https://example.org/report"}"></label>`;
        const archiveMarkup = context && context.archive ? `<section class="osint-research-archive-readout">${readout("SNAPSHOT", context.archive.available ? "AVAILABLE" : "NOT AVAILABLE")}${readout("TIMESTAMP", context.archive.snapshotTimestamp)}${readout("PROVIDER", context.archive.provider)}${context.archive.snapshotUrl ? readout("ARCHIVED URL", context.archive.snapshotUrl) : ""}</section>` : `<p class="osint-panel-muted">Archive context is not checked automatically. A normalized public URL can be sent to the existing Wayback Availability provider only after you choose CHECK ARCHIVE.</p>`;
        const fieldProvenanceMarkup = context && context.fieldProvenance && context.fieldProvenance.length ? `<section class="osint-research-field-provenance"><small>FIELD → SOURCE</small>${context.fieldProvenance.map(item => `<div><strong>${this.escape(item.field)}</strong><span>${this.escape(item.source)} · ${this.escape(item.kind)}</span></div>`).join("")}</section>` : "";
        const provenanceMarkup = context && context.providerObservations && context.providerObservations.length ? `${fieldProvenanceMarkup}<ol class="osint-research-provenance">${context.providerObservations.map(item => `<li><strong>${this.escape(item.providerName || item.providerId || "SOURCE")}</strong><span>${this.escape(item.summary || "Provider observation")}</span><small>${this.escape(item.type || "OBSERVATION")} · ${this.escape(item.observedAt || "UNKNOWN TIME")}</small></li>`).join("")}</ol>` : `${fieldProvenanceMarkup || `<p class="osint-panel-muted">No provider observation yet. A normalized URL remains local until an explicit archive check; local PDF inspection and DOI retrieval produce their own provenance.</p>`}`;
        const localMarkup = local ? `<section class="osint-research-document-readout">${readout("TYPE", local.mediaType)}${readout("SIZE", `${local.byteSize} BYTES`)}${readout("PAGES", local.pageCount)}${readout("TITLE", local.title)}${readout("AUTHOR", local.author)}${readout("CREATOR", local.creator)}${readout("PRODUCER", local.producer)}${readout("SHA-256", local.originalDocumentHash)}</section>` : `<p class="osint-panel-muted">Local document metadata is available only after you explicitly select one PDF. Original documents and local paths are not persisted.</p>`;
        grid.innerHTML = `<section class="osint-research-header workspace-panel"><button type="button" class="osint-back-button" data-osint-research-action="catalog">‹ OSINT CATALOG</button><div><small>OSINT / RESEARCH · DOCUMENTS · SOURCE VERIFICATION</small><h2>PASSIVE SOURCE CONTEXT</h2><p>One explicit public URL, DOI or local PDF. No crawler, bulk download, web scraping, credentials, hidden history or automatic archive query.</p>${this.renderOSINTHandoffNotice(state.handoff)}</div><div class="osint-research-status"><small>STATE</small><strong>${this.escape(this.formatOSINTEnum(status))}</strong><span>CONFIDENCE · ${this.escape(context && context.confidence || "LOW")}</span></div></section>
            <section class="osint-research-input workspace-panel"><header><h2>SOURCE INPUT</h2><span>EXPLICIT / EPHEMERAL</span></header><div class="workspace-panel-content"><form data-osint-research-form novalidate><label><span>INPUT TYPE</span><select class="aegis-select" data-osint-research-kind><option value="URL"${state.sourceKind === "URL" ? " selected" : ""}>PUBLIC URL</option><option value="DOI"${state.sourceKind === "DOI" ? " selected" : ""}>DOI</option><option value="LOCAL_PDF"${state.sourceKind === "LOCAL_PDF" ? " selected" : ""}>LOCAL PDF</option></select></label>${sourceInput}<small>${state.sourceKind === "URL" ? "URL analysis normalizes locally only. Metadata retrieval from arbitrary pages is intentionally unavailable; CHECK ARCHIVE is separate and explicit." : state.sourceKind === "DOI" ? "One DOI is sent only to the approved fixed Crossref Works endpoint after ANALYZE." : "Only selected PDF bytes are inspected locally. No path, original document or text body is persisted."}</small><footer>${state.sourceKind === "LOCAL_PDF" ? "" : `<button type="submit" ${loading ? "disabled" : ""}>${loading ? "ANALYZING…" : "ANALYZE"}</button>`}${loading ? `<button type="button" data-osint-research-action="cancel">CANCEL</button>` : ""}<button type="button" data-osint-research-action="clear">CLEAR</button></footer></form>${state.lastError ? `<section class="osint-panel-error"><strong>${this.escape(this.formatOSINTEnum(state.lastError.code || "ERROR"))}</strong><p>${this.escape(state.lastError.message || "Source verification did not complete.")}</p></section>` : ""}</div></section>
            <section class="osint-research-context workspace-panel"><header><h2>SOURCE CONTEXT</h2><span>${this.escape(source && source.sourceType || "AWAITING INPUT")}</span></header><div class="workspace-panel-content"><section class="osint-research-readout">${readout("ORIGINAL INPUT", source && source.originalInput, "NOT ANALYZED")}${readout("NORMALIZED URL", source && source.normalizedUrl, "NOT ANALYZED")}${readout("HOST", source && source.hostname)}${readout("DOI", source && source.identifiers && source.identifiers.doi)}${readout("TITLE", metadata.title)}${readout("PUBLISHER", metadata.publisher)}${readout("AUTHORS", metadata.authors && metadata.authors.join(" · "))}${readout("PUBLISHED", metadata.publishedAt)}${readout("UPDATED", metadata.updatedAt)}${readout("CONTAINER", metadata.container)}${readout("TYPE", metadata.workType)}</section></div></section>
            <section class="osint-research-archive workspace-panel"><header><h2>ARCHIVE CONTEXT</h2><span>WAYBACK / EXPLICIT</span></header><div class="workspace-panel-content">${archiveMarkup}<footer><button type="button" data-osint-research-action="archive"${canArchive ? "" : " disabled"}>CHECK ARCHIVE</button></footer></div></section>
            <section class="osint-research-document workspace-panel"><header><h2>DOCUMENT METADATA</h2><span>LOCAL / BOUNDED</span></header><div class="workspace-panel-content">${localMarkup}</div></section>
            <section class="osint-research-provenance-panel workspace-panel"><header><h2>PROVENANCE</h2><span>FIELD / SOURCE</span></header><div class="workspace-panel-content">${provenanceMarkup}</div></section>
            <section class="osint-research-excerpt workspace-panel"><header><h2>EXCERPT / CLAIM CONTEXT</h2><span>ANALYST ENTERED</span></header><div class="workspace-panel-content"><label><span>SHORT EXCERPT · NOT A PAGE DUMP</span><textarea class="aegis-input" data-osint-research-excerpt maxlength="4000" ${context ? "" : "disabled"}>${this.escape(state.excerpt || "")}</textarea></label><label><span>PAGE / SECTION / LOCATION</span><input class="aegis-input" data-osint-research-excerpt-location maxlength="240" value="${this.escape(state.excerptLocation || "")}" ${context ? "" : "disabled"}></label><label><span>CLAIM RELATIONSHIP</span><select class="aegis-select" data-osint-research-claim-relation ${context ? "" : "disabled"}>${["UNKNOWN", "SUPPORT", "CONTRADICT", "CONTEXT"].map(value => `<option value="${value}"${state.claimRelationship === value ? " selected" : ""}>${value}</option>`).join("")}</select></label></div></section>
            <section class="osint-research-observation workspace-panel"><header><h2>ANALYST OBSERVATION</h2><span>EPHEMERAL UNTIL ADD TO CASE</span></header><div class="workspace-panel-content"><label><span>ANALYST NOTE · NOT EXTRACTED FACT</span><textarea class="aegis-input" data-osint-research-note maxlength="4000" ${context ? "" : "disabled"}>${this.escape(state.analystObservation || "")}</textarea></label><p>Analyst observations remain distinct from provider/local metadata and cannot trigger more requests.</p><footer>${canSave ? `<button type="button" data-osint-research-action="save">ADD TO CASE</button>` : `<span class="osint-action-unavailable">ADD TO CASE AVAILABLE AFTER A REVIEWED OBSERVATION</span>`}</footer></div></section>
            <aside class="osint-research-policy workspace-panel"><header><h2>PROVIDER POLICY</h2><span>PASSIVE / EXPLICIT / BOUNDED</span></header><div class="workspace-panel-content"><p><strong>Crossref</strong> handles one DOI through a fixed endpoint. <strong>Wayback</strong> is reused only after CHECK ARCHIVE. Local PDF inspection runs in-process on one selected file.</p><p>No arbitrary web extraction, crawler, download, cookies, credentials, paywall bypass, archive capture or hidden persistence is available.</p><small>ORIGINAL DOCUMENT ATTACHMENT · DEFERRED</small></div></aside>`;
    }

    getOSINTEntityModule() { return window.OSINTEntityResolution || null; }

    getOSINTEntityProvider() {
        return this.osintProviderRegistry && this.osintProviderRegistry.getProvider("local-entity-resolution")
            || this.getOSINTProviders().find(provider => provider.id === "local-entity-resolution") || null;
    }

    handleOSINTEntityAction(action, trigger = null) {
        const Engine = this.getOSINTEntityModule();
        const state = this.osintEntityState;
        if (!Engine || !state) return this.showToast(this.osintView, "ENTITY RESOLUTION UNAVAILABLE");
        if (action === "open") {
            state.mode = "ENTITY";
            this.osintState.categoryId = "entities";
            this.renderOSINTState();
            return;
        }
        if (action === "catalog") {
            state.mode = "CATALOG";
            this.renderOSINTState();
            return;
        }
        if (action === "clear") {
            this.osintEntityState = Engine.createState({mode: "ENTITY"});
            this.renderOSINTState();
            return;
        }
        if (action === "select") {
            const id = trigger && trigger.dataset.osintEntityId;
            if (state.entities.some(entity => entity.id === id)) state.selectedEntityId = id;
            this.renderOSINTState();
            return;
        }
        if (action === "relationship") {
            const relationship = state.relationships.find(item => item.id === (trigger && trigger.dataset.osintRelationshipId));
            if (!relationship) return;
            const from = state.entities.find(item => item.id === relationship.fromId);
            const to = state.entities.find(item => item.id === relationship.toId);
            const evidence = relationship.evidence.map(item => `<li><strong>${this.escape(item.summary)}</strong><span>${this.escape(item.sourceType)} · ${this.escape(item.sourceIdentifier)} · ${this.escape(item.confidence)}</span></li>`).join("");
            const contradictions = relationship.contradictions && relationship.contradictions.length ? `<section><h3>CONTRADICTIONS</h3><p>${this.escape(relationship.contradictions.join(" · "))}</p></section>` : "";
            this.openOSINTCaseDialog("RELATIONSHIP EVIDENCE", `<section class="osint-entity-relationship-dialog"><p><strong>${this.escape(from && from.label || "ARCHIVED ENTITY")}</strong> <em>${this.escape(this.formatOSINTEnum(relationship.type))}</em> <strong>${this.escape(to && to.label || "ARCHIVED ENTITY")}</strong></p><dl><div><dt>STATUS</dt><dd>${this.escape(this.formatOSINTEnum(relationship.status))}</dd></div><div><dt>CONFIDENCE</dt><dd>${this.escape(relationship.confidence)}</dd></div></dl><section><h3>SUPPORTING OBSERVATIONS</h3><ul>${evidence}</ul></section>${contradictions}<footer><button type="button" data-osint-case-dialog-close>CLOSE</button></footer></section>`, trigger, (overlay, close) => {
                overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            });
            return;
        }
        if (action === "archive") {
            try { this.osintEntityState = Engine.archiveEntity(state, trigger.dataset.osintEntityId); }
            catch (error) { this.osintEntityState = {...state, lastError: error.message}; }
            this.renderOSINTState();
            return;
        }
        if (action === "edit") {
            const entity = state.entities.find(item => item.id === (trigger && trigger.dataset.osintEntityId));
            if (!entity) return;
            this.openOSINTCaseDialog("EDIT ENTITY", `<section class="osint-entity-edit-dialog"><form data-osint-entity-edit-form><label><span>PREFERRED LABEL</span><input class="aegis-input" name="label" maxlength="240" required value="${this.escape(entity.label)}"></label><label><span>ALIASES · OPTIONAL</span><input class="aegis-input" name="aliases" maxlength="1200" value="${this.escape(entity.aliases.join(", "))}"></label><label><span>CONFIDENCE</span><select class="aegis-select" name="confidence">${Engine.CONFIDENCE.map(value => `<option value="${value}"${entity.confidence === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label><span>STATUS</span><select class="aegis-select" name="status">${Engine.STATUSES.map(value => `<option value="${value}"${entity.status === value ? " selected" : ""}>${this.escape(this.formatOSINTEnum(value))}</option>`).join("")}</select></label><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="submit">SAVE ENTITY</button></footer></form></section>`, trigger, (overlay, close) => {
                overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
                overlay.querySelector("[data-osint-entity-edit-form]").addEventListener("submit", event => {
                    event.preventDefault(); const form = new FormData(event.currentTarget);
                    try { this.osintEntityState = Engine.updateEntity(this.osintEntityState, entity.id, {label: form.get("label"), aliases: String(form.get("aliases") || "").split(",").map(item => item.trim()).filter(Boolean), confidence: form.get("confidence"), status: form.get("status")}); close(); this.renderOSINTState(); }
                    catch (error) { this.showToast(this.osintView, error.message || "ENTITY UPDATE FAILED"); }
                });
            });
            return;
        }
        if (action === "potential-link") {
            try {
                this.osintEntityState = Engine.addRelationship(state, {
                    fromId: trigger.dataset.osintEntityId,
                    toId: trigger.dataset.osintEntityTarget,
                    type: "POTENTIALLY_SAME_AS",
                    evidence: [{summary: "Exact canonical identifier candidate reviewed and explicitly linked by the analyst.", sourceType: "DERIVED_NORMALIZATION", sourceIdentifier: "LOCAL_EXACT_MATCH", confidence: "MEDIUM"}],
                    confidence: "MEDIUM", status: "AMBIGUOUS"
                });
            } catch (error) { this.osintEntityState = {...state, lastError: error.message}; }
            this.renderOSINTState();
            return;
        }
        if (action === "merge") {
            const keepId = trigger.dataset.osintEntityId;
            const mergeId = trigger.dataset.osintEntityTarget;
            const keep = state.entities.find(item => item.id === keepId); const merge = state.entities.find(item => item.id === mergeId);
            if (!keep || !merge) return;
            this.openOSINTCaseDialog("MERGE CONFIRMED", `<section class="osint-entity-merge-dialog"><p>Merge <strong>${this.escape(merge.label)}</strong> into <strong>${this.escape(keep.label)}</strong>? This is an explicit analyst confirmation. Matching and conflicting attributes remain visible in the selected entity snapshot; no external lookup occurs.</p><footer><button type="button" data-osint-case-dialog-close>KEEP SEPARATE</button><button type="button" data-osint-entity-merge-confirm>MERGE CONFIRMED</button></footer></section>`, trigger, (overlay, close) => {
                overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
                overlay.querySelector("[data-osint-entity-merge-confirm]").addEventListener("click", () => {
                    try { this.osintEntityState = Engine.mergeConfirmed(this.osintEntityState, keepId, mergeId, true); close(); this.renderOSINTState(); }
                    catch (error) { this.showToast(this.osintView, error.message || "MERGE FAILED"); }
                });
            });
            return;
        }
        if (action === "save") return this.promoteOSINTEntityEvidence(trigger);
        if (action === "handoff") return this.handoffOSINTEntity(trigger && trigger.dataset.osintEntityId);
    }

    submitOSINTEntityCreateForm(form) {
        const Engine = this.getOSINTEntityModule();
        if (!Engine) return;
        const state = this.osintEntityState;
        const values = new FormData(form);
        try {
            this.osintEntityState = Engine.addEntity(state, {
                type: values.get("type"), label: values.get("label"), aliases: String(values.get("aliases") || "").split(",").map(item => item.trim()).filter(Boolean),
                attributes: [{field: values.get("field") || "IDENTIFIER", value: values.get("value") || values.get("label"), sourceType: values.get("sourceType") || "ANALYST_OBSERVATION", sourceIdentifier: values.get("sourceIdentifier") || "ANALYST ENTERED", confidence: values.get("confidence") || "LOW", status: "UNVERIFIED"}],
                confidence: values.get("confidence") || "LOW", status: "UNVERIFIED"
            });
            this.renderOSINTState();
        } catch (error) { this.osintEntityState = {...state, lastError: error.message || "ENTITY CREATE FAILED"}; this.renderOSINTState(); }
    }

    submitOSINTEntityRelationshipForm(form) {
        const Engine = this.getOSINTEntityModule();
        if (!Engine) return;
        const state = this.osintEntityState;
        const values = new FormData(form);
        try {
            this.osintEntityState = Engine.addRelationship(state, {
                fromId: values.get("fromId"), toId: values.get("toId"), type: values.get("type"), confidence: values.get("confidence") || "LOW", status: values.get("status") || "PARTIALLY_RESOLVED",
                evidence: [{summary: values.get("evidence"), sourceType: values.get("sourceType") || "ANALYST_OBSERVATION", sourceIdentifier: values.get("sourceIdentifier") || "ANALYST ENTERED", confidence: values.get("confidence") || "LOW"}],
                contradictions: String(values.get("contradictions") || "").split("\n").map(item => item.trim()).filter(Boolean)
            });
            this.renderOSINTState();
        } catch (error) { this.osintEntityState = {...state, lastError: error.message || "RELATIONSHIP CREATE FAILED"}; this.renderOSINTState(); }
    }

    getOSINTInvestigationModule() { return window.OSINTInvestigationOrchestration || null; }

    renderOSINTHandoffNotice(handoff) {
        if (!handoff || !handoff.explicit || !handoff.provenance) return "";
        const source = this.escape(handoff.provenance.sourceCapability || "NORMALIZED OBSERVATION");
        const kind = this.escape(handoff.provenance.sourceType || "EXPLICIT HANDOFF");
        return `<small class="osint-orchestration-handoff">SOURCE · ${source} · ${kind} · PREFILLED ONLY / NO PROVIDER QUERY HAS RUN</small>`;
    }

    updateOSINTInvestigationContext(context = {}) {
        const Orchestration = this.getOSINTInvestigationModule();
        if (!Orchestration) return null;
        this.osintInvestigationContext = Orchestration.createContext({...context, activeCaseId: context.activeCaseId || this.osintCaseState && this.osintCaseState.activeCaseId});
        return this.osintInvestigationContext;
    }

    beginOSINTInvestigationHandoff(object, actionId) {
        const Orchestration = this.getOSINTInvestigationModule();
        if (!Orchestration) return this.showToast(this.osintView, "INVESTIGATION ORCHESTRATION UNAVAILABLE");
        let handoff;
        try {
            const normalizedObject = Orchestration.createObject(object);
            const context = this.updateOSINTInvestigationContext({
                selectedObjectId: normalizedObject.id,
                selectedObjectType: normalizedObject.type,
                originatingCapability: normalizedObject.capability,
                provenance: normalizedObject.provenance
            });
            handoff = Orchestration.createHandoff(context, normalizedObject, actionId);
        } catch (error) {
            return this.showToast(this.osintView, error && error.message || "HANDOFF BLOCKED");
        }
        return this.applyOSINTInvestigationHandoff(handoff);
    }

    applyOSINTInvestigationHandoff(handoff) {
        if (!handoff || !handoff.explicit) return this.showToast(this.osintView, "HANDOFF BLOCKED");
        const payload = handoff.normalizedPayload || {};
        // A handoff is explicit navigation away from the derived Case Overview.
        // Keep the active Case data intact, but relinquish the overview render mode
        // so the destination capability can render its prefilled, idle state.
        this.osintCaseState = {...this.osintCaseState, mode: "CATALOG"};
        this.osintGeoState = {...this.osintGeoState, mode: "CATALOG"};
        this.osintMediaState = {...this.osintMediaState, mode: "CATALOG"};
        this.osintDomainState = {...this.osintDomainState, mode: "CATALOG"};
        this.osintResearchState = {...this.osintResearchState, mode: "CATALOG"};
        this.osintEntityState = {...this.osintEntityState, mode: "CATALOG"};
        if (handoff.destinationCapability === "DOMAIN_INFRASTRUCTURE_CONTEXT") {
            this.cancelOSINTDomainInfrastructureVerification(false);
            this.osintDomainState = {...this.osintDomainState, mode: "DOMAIN", input: payload.target || "", phase: "IDLE", verification: null, activeRequestId: null, lastError: null, analystObservation: "", selectedPublicIp: "", handoff};
        } else if (handoff.destinationCapability === "GEOSPATIAL_VERIFICATION") {
            this.cancelOSINTGeoVerification(false);
            this.osintGeoState = {...this.osintGeoState, mode: "GEO", input: `${payload.latitude}, ${payload.longitude}`, phase: "IDLE", verification: null, providerResult: null, selectedCandidateIndex: 0, activeRequestId: null, lastError: null, investigatorNote: "", investigatorAssessment: "INCONCLUSIVE", handoff};
        } else if (handoff.destinationCapability === "SOURCE_VERIFICATION") {
            this.cancelOSINTResearchVerification(false);
            this.osintResearchState = {mode: "SOURCE", sourceKind: payload.sourceKind === "DOI" ? "DOI" : "URL", input: payload.sourceInput || "", phase: "IDLE", context: null, activeRequestId: null, lastError: null, analystObservation: "", excerpt: "", excerptLocation: "", claimRelationship: "UNKNOWN", selectedFile: null, handoff};
        } else if (handoff.destinationCapability === "ENTITY_RESOLUTION") {
            this.osintEntityState = {...this.osintEntityState, mode: "ENTITY", selectedEntityId: payload.entityId || this.osintEntityState && this.osintEntityState.selectedEntityId || null, orchestrationHandoff: handoff};
        } else if (handoff.destinationCapability === "EVIDENCE_DETAIL") {
            if (!handoff.caseId || !payload.evidenceId) return this.showToast(this.osintView, "EVIDENCE HANDOFF UNAVAILABLE");
            return this.openOSINTEvidenceDetail(handoff.caseId, payload.evidenceId);
        } else return this.showToast(this.osintView, "HANDOFF DESTINATION BLOCKED");
        this.renderOSINTState();
        return handoff;
    }

    handoffOSINTEntity(entityId) {
        const entity = this.osintEntityState && this.osintEntityState.entities.find(item => item.id === entityId);
        if (!entity) return;
        const attributes = entity.attributes || [];
        const domain = attributes.find(item => String(item.field || "").toUpperCase().includes("DOMAIN"));
        const location = attributes.find(item => String(item.field || "").toUpperCase().includes("LOCATION"));
        const source = attributes.find(item => String(item.field || "").toUpperCase().includes("SOURCE") || String(item.field || "").toUpperCase().includes("URL"));
        const payload = {label: entity.label, target: (domain && domain.value) || (["DOMAIN", "IP"].includes(entity.type) ? entity.label : ""), sourceInput: (source && source.value) || (entity.type === "SOURCE" ? entity.label : ""), sourceKind: "URL"};
        if (location && /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(location.value || "")) {
            const [latitude, longitude] = location.value.split(",").map(Number); payload.latitude = latitude; payload.longitude = longitude;
        }
        const object = {id: entity.id, sourceObjectId: entity.id, type: entity.type, label: entity.label, capability: "ENTITY_RESOLUTION", status: entity.status, confidence: entity.confidence, payload, provenance: {sourceCapability: "ENTITY_RESOLUTION", sourceObjectId: entity.id, sourceType: "LOCAL_ENTITY_RESOLUTION"}};
        const Orchestration = this.getOSINTInvestigationModule();
        const actions = Orchestration && Orchestration.availableHandoffs(Orchestration.createObject(object)) || [];
        const preferred = actions.find(item => item.id === "OPEN_DOMAIN_CONTEXT") || actions.find(item => item.id === "VERIFY_LOCATION") || actions.find(item => item.id === "OPEN_SOURCE_VERIFICATION");
        if (!preferred) return this.showToast(this.osintView, "NO EXPLICIT HANDOFF FOR THIS ENTITY TYPE");
        return this.beginOSINTInvestigationHandoff(object, preferred.id);
    }

    promoteOSINTEntityEvidence(trigger = null) {
        const Engine = this.getOSINTEntityModule(); const provider = this.getOSINTEntityProvider(); const state = this.osintEntityState;
        if (!Engine || !provider || !state || !state.selectedEntityId) return this.showToast(this.osintView, "SELECT ONE ENTITY BEFORE ADD TO CASE");
        try {
            const entity = state.entities.find(item => item.id === state.selectedEntityId);
            const data = Engine.toEvidenceData(state, state.selectedEntityId, state.analystNote || "");
            const timestamp = new Date().toISOString();
            this.osintLastNormalizedResults[provider.id] = Object.freeze({requestId: `entity-evidence-${Date.now().toString(36)}`, providerId: provider.id, capability: "ENTITY_RESOLUTION", status: "SUCCESS", queriedAt: timestamp, completedAt: timestamp, durationMs: 0, summary: `Entity snapshot: ${entity.label}.`, data: {...data, provider: provider.name, available: true}, warnings: [], source: {provider: provider.name, type: "LOCAL_ENTITY_RESOLUTION"}, confidence: entity.confidence, rawAvailable: false, error: null});
            this.openOSINTEvidencePromotion(provider.id, trigger);
        } catch (error) { this.showToast(this.osintView, error.message || "ENTITY EVIDENCE UNAVAILABLE"); }
    }

    renderOSINTEntityWorkspace(grid) {
        const Engine = this.getOSINTEntityModule(); const state = this.osintEntityState || {};
        const orchestrationHandoff = state.orchestrationHandoff || null;
        const handoffPayload = orchestrationHandoff && orchestrationHandoff.normalizedPayload || {};
        const handoffProvenance = orchestrationHandoff && orchestrationHandoff.provenance || {};
        const handoffLabel = handoffPayload.label || handoffPayload.target || handoffPayload.sourceInput || "";
        const handoffIdentifier = handoffProvenance.sourceEvidenceId || handoffProvenance.sourceObjectId || "ANALYST ENTERED";
        const handoffNotice = this.renderOSINTHandoffNotice(orchestrationHandoff);
        const graph = Engine ? Engine.graph(state, {type: state.typeFilter, relationshipStatus: state.relationshipFilter}) : {nodes: [], edges: [], limits: {nodes: 0, edges: 0}};
        const selected = state.entities && state.entities.find(item => item.id === state.selectedEntityId) || null;
        const entityTypes = Engine ? Engine.ENTITY_TYPES : []; const relationTypes = Engine ? Engine.RELATIONSHIP_TYPES : [];
        const handoffEntityType = orchestrationHandoff && entityTypes.includes(orchestrationHandoff.sourceObjectType) ? orchestrationHandoff.sourceObjectType : "";
        const readout = (label, value, fallback = "NOT AVAILABLE") => `<div><small>${this.escape(label)}</small><strong>${this.escape(value === null || value === undefined || value === "" ? fallback : String(value))}</strong></div>`;
        const positions = new Map(graph.nodes.map((node, index) => {
            const angle = (Math.PI * 2 * index / Math.max(graph.nodes.length, 1)) - Math.PI / 2;
            return [node.id, {x: 500 + Math.cos(angle) * (graph.nodes.length <= 2 ? 175 : 310), y: 250 + Math.sin(angle) * (graph.nodes.length <= 2 ? 0 : 145)}];
        }));
        const edgeMarkup = graph.edges.map(edge => { const from = positions.get(edge.fromId); const to = positions.get(edge.toId); return from && to ? `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="osint-entity-edge confidence-${this.escape(edge.confidence.toLowerCase())}" data-osint-entity-action="relationship" data-osint-relationship-id="${this.escape(edge.id)}"><title>${this.escape(`${edge.type} · ${edge.confidence}`)}</title></line>` : ""; }).join("");
        const nodeMarkup = graph.nodes.map(node => { const point = positions.get(node.id); const selectedNode = node.id === state.selectedEntityId; return `<g class="osint-entity-node${selectedNode ? " selected" : ""}" data-osint-entity-action="select" data-osint-entity-id="${this.escape(node.id)}"><circle cx="${point.x}" cy="${point.y}" r="${selectedNode ? 34 : 28}"></circle><text x="${point.x}" y="${point.y + 4}" text-anchor="middle">${this.escape(node.type.slice(0, 3))}</text><title>${this.escape(`${node.label} · ${node.type}`)}</title></g>`; }).join("");
        const nodeList = graph.nodes.length ? graph.nodes.map(node => `<button type="button" class="osint-entity-node-list${node.id === state.selectedEntityId ? " selected" : ""}" data-osint-entity-action="select" data-osint-entity-id="${this.escape(node.id)}"><strong>${this.escape(node.label)}</strong><span>${this.escape(this.formatOSINTEnum(node.type))} · ${this.escape(node.confidence)}</span></button>`).join("") : `<p class="osint-panel-muted">No entities yet. Explicitly create one from an analyst observation or an existing normalized observation.</p>`;
        const attributes = selected ? selected.attributes.map(attribute => `<li>${readout(attribute.field, attribute.value)}<span>${this.escape(attribute.sourceType)} · ${this.escape(attribute.sourceIdentifier)} · ${this.escape(attribute.confidence)}</span></li>`).join("") : "";
        const relationships = selected ? state.relationships.filter(item => item.fromId === selected.id || item.toId === selected.id).map(item => { const counterpart = state.entities.find(entity => entity.id === (item.fromId === selected.id ? item.toId : item.fromId)); return `<li><strong>${this.escape(item.type)}</strong><span>${this.escape(counterpart && counterpart.label || "ARCHIVED ENTITY")} · ${this.escape(item.confidence)} · ${this.escape(item.status)}</span><small>${this.escape(item.evidence.map(evidence => evidence.summary).join(" · "))}</small>${item.contradictions && item.contradictions.length ? `<em>CONTRADICTIONS · ${this.escape(item.contradictions.join(" · "))}</em>` : ""}</li>`; }).join("") : "";
        const hints = Engine ? Engine.exactDuplicateHints(state.entities || []) : [];
        const duplicateMarkup = hints.length ? `<section class="osint-entity-duplicates"><small>EXACT IDENTIFIER CANDIDATES · ANALYST REVIEW REQUIRED</small>${hints.map(hint => { const [first, second] = hint.entityIds; const firstEntity = state.entities.find(item => item.id === first); const secondEntity = state.entities.find(item => item.id === second); return `<div><span>${this.escape(hint.key)}</span><strong>${this.escape(firstEntity && firstEntity.label)} ↔ ${this.escape(secondEntity && secondEntity.label)}</strong><button type="button" data-osint-entity-action="potential-link" data-osint-entity-id="${this.escape(first)}" data-osint-entity-target="${this.escape(second)}">LINK POTENTIALLY SAME</button><button type="button" data-osint-entity-action="merge" data-osint-entity-id="${this.escape(first)}" data-osint-entity-target="${this.escape(second)}">MERGE CONFIRMED</button></div>`; }).join("")}</section>` : "";
        const handoffAllowed = selected && ["DOMAIN", "IP", "LOCATION", "SOURCE"].includes(selected.type);
        grid.innerHTML = `<section class="osint-entity-header workspace-panel"><button type="button" class="osint-back-button" data-osint-entity-action="catalog">‹ OSINT CATALOG</button><div><small>OSINT / IDENTITY · ENTITY RESOLUTION</small><h2>PROVENANCE-AWARE ENTITY CONTEXT</h2><p>Explicit local entity modeling for one investigation. No people search, biometric matching, social crawling, email probing, hidden enrichment or background query.</p>${handoffNotice}</div><div class="osint-entity-status"><small>GRAPH LIMIT</small><strong>${graph.nodes.length} / ${graph.limits.nodes} ENTITIES</strong><span>${graph.edges.length} / ${graph.limits.edges} RELATIONSHIPS</span></div></section>
            <section class="osint-entity-create workspace-panel"><header><h2>CREATE ENTITY</h2><span>EXPLICIT / EPHEMERAL</span></header><div class="workspace-panel-content"><form data-osint-entity-create-form><label><span>TYPE</span><select class="aegis-select" name="type">${entityTypes.map(type => `<option value="${type}"${handoffEntityType === type ? " selected" : ""}>${this.escape(this.formatOSINTEnum(type))}</option>`).join("")}</select></label><label><span>PREFERRED LABEL</span><input class="aegis-input" name="label" maxlength="240" required placeholder="Synthetic Example Organization" value="${this.escape(handoffLabel)}"></label><label><span>ATTRIBUTE FIELD / VALUE</span><div class="osint-entity-inline-fields"><input class="aegis-input" name="field" maxlength="80" value="${handoffLabel ? "SOURCE_REFERENCE" : "IDENTIFIER"}"><input class="aegis-input" name="value" maxlength="320" required placeholder="Explicitly supplied value" value="${this.escape(handoffLabel)}"></div></label><label><span>PROVENANCE</span><div class="osint-entity-inline-fields"><select class="aegis-select" name="sourceType"><option value="ANALYST_OBSERVATION"${orchestrationHandoff ? "" : " selected"}>ANALYST OBSERVATION</option><option value="SOURCE_METADATA">SOURCE METADATA</option><option value="DOMAIN_CONTEXT">DOMAIN CONTEXT</option><option value="GEO_CONTEXT">GEO CONTEXT</option><option value="MEDIA_METADATA">MEDIA METADATA</option><option value="CASE_EVIDENCE"${orchestrationHandoff ? " selected" : ""}>CASE EVIDENCE</option></select><input class="aegis-input" name="sourceIdentifier" maxlength="160" value="${this.escape(handoffIdentifier)}"></div></label><label><span>CONFIDENCE</span><select class="aegis-select" name="confidence"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label><label><span>ALIASES · OPTIONAL</span><input class="aegis-input" name="aliases" maxlength="1200" placeholder="comma separated"></label><footer><button type="submit">CREATE ENTITY</button><button type="button" data-osint-entity-action="clear">CLEAR EPHEMERAL GRAPH</button></footer></form>${state.lastError ? `<section class="osint-panel-error"><strong>ENTITY INPUT REJECTED</strong><p>${this.escape(state.lastError)}</p></section>` : ""}</div></section>
            <section class="osint-entity-graph-panel workspace-panel"><header><h2>RELATIONSHIP GRAPH</h2><span>BOUNDED / LOCAL</span></header><div class="workspace-panel-content"><div class="osint-entity-filters"><label><span>TYPE</span><select class="aegis-select" data-osint-entity-filter="type"><option value="">ALL TYPES</option>${entityTypes.map(type => `<option value="${type}"${state.typeFilter === type ? " selected" : ""}>${this.escape(this.formatOSINTEnum(type))}</option>`).join("")}</select></label><label><span>RELATIONSHIP STATUS</span><select class="aegis-select" data-osint-entity-filter="relationshipStatus"><option value="">ALL STATES</option>${["UNVERIFIED", "PARTIALLY_RESOLVED", "CONSISTENT", "INCONSISTENT", "AMBIGUOUS", "CONFIRMED_BY_ANALYST"].map(status => `<option value="${status}"${state.relationshipFilter === status ? " selected" : ""}>${this.escape(this.formatOSINTEnum(status))}</option>`).join("")}</select></label></div><figure class="osint-entity-graph" aria-label="Bounded entity relationship graph"><svg viewBox="0 0 1000 500" role="img">${edgeMarkup}${nodeMarkup}<text x="500" y="470" text-anchor="middle" class="osint-entity-graph-caption">SELECT AN ENTITY FROM THE KEY BELOW TO REVIEW PROVENANCE</text></svg></figure><div class="osint-entity-node-list" role="list">${nodeList}</div></div></section>
            <section class="osint-entity-detail workspace-panel"><header><h2>ENTITY DETAIL</h2><span>${this.escape(selected ? selected.type : "NO SELECTION")}</span></header><div class="workspace-panel-content">${selected ? `<section class="osint-entity-identity">${readout("LABEL", selected.label)}${readout("STATUS", selected.status)}${readout("CONFIDENCE", selected.confidence)}${readout("ALIASES", selected.aliases.join(" · "), "NONE")}</section><section class="osint-entity-attributes"><small>ATTRIBUTES / FIELD-LEVEL PROVENANCE</small><ul>${attributes}</ul></section><section class="osint-entity-relationships"><small>RELATIONSHIPS / EVIDENCE-BACKED</small><ul>${relationships || "<li>NO RELATIONSHIPS RECORDED</li>"}</ul></section><label><span>ANALYST NOTE · NOT EXTRACTED FACT</span><textarea class="aegis-input" data-osint-entity-note maxlength="4000">${this.escape(state.analystNote || "")}</textarea></label><footer><button type="button" data-osint-entity-action="edit" data-osint-entity-id="${this.escape(selected.id)}">EDIT ENTITY</button><button type="button" data-osint-entity-action="save">ADD TO CASE</button>${handoffAllowed ? `<button type="button" data-osint-entity-action="handoff" data-osint-entity-id="${this.escape(selected.id)}">OPEN CONTEXT</button>` : ""}<button type="button" data-osint-entity-action="archive" data-osint-entity-id="${this.escape(selected.id)}">ARCHIVE ENTITY</button></footer>` : `<p class="osint-panel-muted">Select an entity to inspect provenance, relationships, contradictions and explicit handoff options.</p>`}</div></section>
            <section class="osint-entity-relationship workspace-panel"><header><h2>LINK ENTITIES</h2><span>EVIDENCE REQUIRED</span></header><div class="workspace-panel-content">${state.entities.length >= 2 ? `<form data-osint-entity-relationship-form><label><span>FROM / TO</span><div class="osint-entity-inline-fields"><select class="aegis-select" name="fromId">${state.entities.map(entity => `<option value="${this.escape(entity.id)}"${entity.id === state.selectedEntityId ? " selected" : ""}>${this.escape(entity.label)}</option>`).join("")}</select><select class="aegis-select" name="toId">${state.entities.map(entity => `<option value="${this.escape(entity.id)}">${this.escape(entity.label)}</option>`).join("")}</select></div></label><label><span>RELATIONSHIP / CONFIDENCE</span><div class="osint-entity-inline-fields"><select class="aegis-select" name="type">${relationTypes.map(type => `<option value="${type}">${this.escape(this.formatOSINTEnum(type))}</option>`).join("")}</select><select class="aegis-select" name="confidence"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></div></label><label><span>STATUS</span><select class="aegis-select" name="status"><option>PARTIALLY_RESOLVED</option><option>CONSISTENT</option><option>INCONSISTENT</option><option>AMBIGUOUS</option></select></label><label><span>SUPPORTING OBSERVATION</span><textarea class="aegis-input" name="evidence" maxlength="500" required></textarea></label><label><span>OBSERVATION PROVENANCE</span><div class="osint-entity-inline-fields"><select class="aegis-select" name="sourceType"><option value="ANALYST_OBSERVATION">ANALYST OBSERVATION</option><option value="SOURCE_METADATA">SOURCE METADATA</option><option value="DOMAIN_CONTEXT">DOMAIN CONTEXT</option><option value="CASE_EVIDENCE">CASE EVIDENCE</option></select><input class="aegis-input" name="sourceIdentifier" maxlength="160" value="ANALYST ENTERED"></div></label><label><span>CONTRADICTIONS · OPTIONAL / ONE PER LINE</span><textarea class="aegis-input" name="contradictions" maxlength="2000"></textarea></label><footer><button type="submit">LINK WITH EVIDENCE</button></footer></form>` : `<p class="osint-panel-muted">Create two entities before a relationship can be modeled. A relationship without at least one supporting observation is rejected.</p>`}</div></section>
            <aside class="osint-entity-policy workspace-panel"><header><h2>ENTITY POLICY</h2><span>PASSIVE / FAIL-CLOSED</span></header><div class="workspace-panel-content">${duplicateMarkup}<p>Entity creation, graph selection and linking are entirely local. They trigger no provider request, network action, account check or hidden persistence. Only ADD TO CASE enters the existing redaction and integrity workflow.</p><p>REFERENCE ONLY entries remain blocked from launch, network, IPC and disk actions. Exact identifiers suggest review only; no entity is merged automatically.</p></div></aside>`;
    }

    renderOSINTDomainInfrastructureWorkspace(grid) {
        const state = this.osintDomainState || {};
        const verification = state.verification;
        const target = verification && verification.target;
        const loading = state.phase === "LOADING";
        const records = verification && verification.dns && verification.dns.records || [];
        const addresses = [...new Set(records.filter(record => ["A", "AAAA"].includes(record.type)).flatMap(record => record.values || []))].filter(value => /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-f:]+$/i.test(value)).slice(0, 8);
        const readout = (label, value, fallback = "NOT RETURNED") => `<div><small>${this.escape(label)}</small><strong>${this.escape(value === null || value === undefined || value === "" ? fallback : String(value))}</strong></div>`;
        const dnsMarkup = records.length ? `<div class="osint-domain-records">${records.map(record => `<section><header><strong>${this.escape(record.type)}</strong><span>${this.escape(record.status)}</span></header>${record.values && record.values.length ? `<ul>${record.values.map(value => `<li>${this.escape(value)}</li>`).join("")}</ul>` : `<p>NO VALUES</p>`}</section>`).join("")}</div>` : `<p class="osint-panel-muted">DNS is queried only for an explicit domain using six fixed record types. No recursive lookup or enumeration is available.</p>`;
        const networkMarkup = verification && verification.network ? `<section class="osint-domain-network-readout">${readout("PUBLIC IP", verification.network.ip)}${readout("ASN", (verification.network.asns || []).join(" · "))}${readout("PREFIX", verification.network.prefix)}${readout("RIR CONTEXT", verification.network.rir)}${readout("ALLOCATION", verification.network.allocationContext)}</section>` : target && target.targetType === "DOMAIN" && addresses.length ? `<section class="osint-domain-network-select"><label><span>DNS-OBSERVED PUBLIC ADDRESS</span><select class="aegis-select" data-osint-domain-ip><option value="">SELECT ONE ADDRESS</option>${addresses.map(ip => `<option value="${this.escape(ip)}"${state.selectedPublicIp === ip ? " selected" : ""}>${this.escape(ip)}</option>`).join("")}</select></label><button type="button" data-osint-domain-action="network"${state.selectedPublicIp ? "" : " disabled"}>GET SELECTED NETWORK CONTEXT</button><small>Explicit second action only. AegisUI does not automatically fan out from DNS results.</small></section>` : `<p class="osint-panel-muted">Network/ASN context is available for an explicitly entered public IP, or after you explicitly select one DNS-observed public address.</p>`;
        const status = loading ? "ANALYZING" : state.lastError ? state.lastError.code || "ERROR" : verification ? verification.verificationStatus : "READY";
        grid.innerHTML = `<section class="osint-domain-header workspace-panel"><button type="button" class="osint-back-button" data-osint-domain-action="catalog">‹ OSINT CATALOG</button><div><small>OSINT / DOMAIN &amp; INFRASTRUCTURE CONTEXT</small><h2>PASSIVE DOMAIN CONTEXT</h2><p>One public domain or public IP, explicitly supplied by the analyst. No scan, probing, brute force, crawler, monitoring or hidden target history.</p>${this.renderOSINTHandoffNotice(state.handoff)}</div><div class="osint-domain-status"><small>STATE</small><strong>${this.escape(this.formatOSINTEnum(status))}</strong><span>CONFIDENCE · ${this.escape(verification && verification.confidence || "LOW")}</span></div></section>
            <section class="osint-domain-query workspace-panel"><header><h2>TARGET INPUT</h2><span>EXPLICIT / EPHEMERAL</span></header><div class="workspace-panel-content"><form data-osint-domain-form novalidate><label><span>PUBLIC DOMAIN, PUBLIC IPv4, PUBLIC IPv6 OR HTTP(S) URL</span><input class="aegis-input" data-osint-domain-input maxlength="512" autocomplete="off" spellcheck="false" value="${this.escape(state.input || "")}" placeholder="example.org · 8.8.8.8 · 2001:4860:4860::8888"></label><small>Private, reserved, loopback, CIDR, wildcard, multiple targets, credentials and non-HTTP(S) URI schemes are rejected before any provider request.</small><footer><button type="submit" ${loading ? "disabled" : ""}>${loading ? "ANALYZING…" : "ANALYZE"}</button>${loading ? `<button type="button" data-osint-domain-action="cancel">CANCEL</button>` : ""}<button type="button" data-osint-domain-action="clear">CLEAR</button></footer></form>${state.lastError ? `<section class="osint-panel-error"><strong>${this.escape(this.formatOSINTEnum(state.lastError.code || "ERROR"))}</strong><p>${this.escape(state.lastError.message || "Infrastructure context did not complete.")}</p></section>` : ""}</div></section>
            <section class="osint-domain-target workspace-panel"><header><h2>NORMALIZED TARGET</h2><span>${this.escape(target && target.source || "AWAITING INPUT")}</span></header><div class="workspace-panel-content osint-domain-target-readout">${readout("ORIGINAL INPUT", target && target.originalInput, "NOT QUERIED")}${readout("NORMALIZED TARGET", target && target.normalizedTarget, "NOT QUERIED")}${readout("TYPE", target && target.targetType, "NOT QUERIED")}</div></section>
            <section class="osint-domain-dns workspace-panel"><header><h2>DNS CONTEXT</h2><span>FIXED / BOUNDED</span></header><div class="workspace-panel-content">${dnsMarkup}</div></section>
            <section class="osint-domain-network workspace-panel"><header><h2>NETWORK / ASN</h2><span>EXPLICIT ONLY</span></header><div class="workspace-panel-content">${networkMarkup}</div></section>
            <section class="osint-domain-registration workspace-panel"><header><h2>REGISTRATION</h2><span>LINK ONLY</span></header><div class="workspace-panel-content"><p>Authoritative RDAP is not queried natively in this phase. Bootstrap-driven authority routing and registrant contact data are intentionally outside this bounded runtime.</p></div></section>
            <section class="osint-domain-certificate workspace-panel"><header><h2>CERTIFICATE</h2><span>DEFERRED</span></header><div class="workspace-panel-content"><p>Certificate context is not queried here. AegisUI does not connect sockets to the target, assume port 443 or expand certificate names.</p></div></section>
            <section class="osint-domain-observation workspace-panel"><header><h2>ANALYST OBSERVATION</h2><span>EPHEMERAL UNTIL ADD TO CASE</span></header><div class="workspace-panel-content"><label><span>ANALYST NOTE · NOT EXTRACTED FACT</span><textarea class="aegis-input" data-osint-domain-note maxlength="4000" ${verification ? "" : "disabled"}>${this.escape(state.analystObservation || "")}</textarea></label><p>Observation text does not change provider observations and triggers no request.</p><footer>${verification ? `<button type="button" data-osint-domain-action="save">ADD TO CASE</button>` : `<span class="osint-action-unavailable">ADD TO CASE AVAILABLE AFTER A REVIEWED PROVIDER OBSERVATION</span>`}</footer></div></section>
            <aside class="osint-domain-policy workspace-panel"><header><h2>PROVIDER POLICY</h2><span>PASSIVE / FIXED ENDPOINTS</span></header><div class="workspace-panel-content"><p><strong>Google Public DNS</strong> is limited to one explicit domain and the fixed A, AAAA, MX, NS, TXT and CNAME set. <strong>RIPEstat Network Info</strong> is limited to one explicit public IP.</p><p>Registration and certificate discovery remain link-only/deferred. No generic HTTP proxy, renderer-selected endpoint, credentials, target list or automatic infrastructure follow-up is available.</p></div></aside>`;
    }

    handleOSINTGeoAction(action, trigger = null) {
        if (!this.osintGeoState) return;
        if (action === "open") {
            this.osintGeoState.mode = "GEO";
            this.osintState.categoryId = "geospatial";
            this.renderOSINTState();
            return;
        }
        if (action === "catalog") {
            this.cancelOSINTGeoVerification(false);
            this.osintGeoState.mode = "CATALOG";
            this.renderOSINTState();
            return;
        }
        if (action === "clear") {
            this.cancelOSINTGeoVerification(false);
            this.osintGeoState = {...this.osintGeoState, input: "", phase: "IDLE", verification: null, providerResult: null, selectedCandidateIndex: 0, activeRequestId: null, lastError: null, investigatorNote: "", investigatorAssessment: "INCONCLUSIVE", handoff: null};
            this.renderOSINTState();
            return;
        }
        if (action === "cancel") return this.cancelOSINTGeoVerification(true);
        if (action === "add-observation") return this.addOSINTGeoInvestigatorObservation(null, trigger);
        if (action === "save") return this.promoteOSINTGeoEvidence(trigger);
    }

    geoLocationLabel(location) {
        if (!location) return "NOT NORMALIZED";
        const text = [location.displayName, location.locality, location.region, location.country].filter(Boolean).join(" · ");
        return text || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
    }

    renderOSINTGeospatialWorkspace(grid) {
        const Geo = this.getOSINTGeoModule();
        const state = this.osintGeoState || {};
        const verification = state.verification;
        const location = verification && verification.normalizedLocation;
        const observations = verification && verification.providerObservations || [];
        const candidates = state.providerResult && state.providerResult.data && state.providerResult.data.geoCandidates || [];
        const loading = state.phase === "LOADING";
        const error = state.lastError;
        const status = verification && verification.verificationStatus || "UNVERIFIED";
        const confidence = verification && verification.confidence || "LOW";
        const canSave = Boolean(verification && location && observations.length && ["PARTIALLY_VERIFIED", "CONSISTENT", "INCONSISTENT"].includes(status));
        const stateText = loading ? "VERIFYING" : error ? error.code || "ERROR" : verification ? status : "READY";
        const locationMarkup = location ? `<section class="osint-geo-location"><header><small>NORMALIZED LOCATION</small><strong>${this.escape(this.geoLocationLabel(location))}</strong></header><div class="osint-geo-readout"><div><small>LATITUDE</small><strong>${this.escape(location.latitude.toFixed(6))}</strong></div><div><small>LONGITUDE</small><strong>${this.escape(location.longitude.toFixed(6))}</strong></div><div><small>FORMAT</small><strong>${this.escape(location.coordinateFormat || "DECIMAL")}</strong></div><div><small>COUNTRY</small><strong>${this.escape(location.country || "NOT RETURNED")}</strong></div>${location.elevationM !== null && location.elevationM !== undefined ? `<div><small>ELEVATION</small><strong>${this.escape(String(location.elevationM))} M</strong></div>` : ""}</div></section>` : `<section class="osint-geo-empty"><strong>NO NORMALIZED LOCATION</strong><span>Coordinates normalize locally. Place text is sent only to the approved public geocoding provider after you select VERIFY.</span></section>`;
        const providerMarkup = candidates.length ? `<label class="osint-geo-candidate"><span>PROVIDER CANDIDATE</span><select class="aegis-select" data-osint-geo-candidate>${candidates.map((candidate, index) => `<option value="${index}"${index === state.selectedCandidateIndex ? " selected" : ""}>${this.escape(candidate.displayName || `${candidate.latitude}, ${candidate.longitude}`)}</option>`).join("")}</select></label>` : observations.length ? `<ol class="osint-geo-observations">${observations.map(item => `<li><strong>${this.escape(item.providerName)}</strong><span>${this.escape(item.displayName || `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`)}</span><small>${this.escape(item.type)} · ${this.escape(item.observedAt)}</small></li>`).join("")}</ol>` : `<p class="osint-panel-muted">No provider observation is present. A local coordinate parse is not treated as external verification.</p>`;
        const investigationObservations = verification && verification.investigatorObservations || [];
        const handoffMarkup = this.renderOSINTHandoffNotice(state.handoff);
        grid.innerHTML = `<section class="osint-geo-header workspace-panel"><button type="button" class="osint-back-button" data-osint-geo-action="catalog">‹ OSINT CATALOG</button><div><small>OSINT / GEOSPATIAL VERIFICATION</small><h2>LOCATION CONTEXT CHECK</h2><p>Explicit, passive normalization only. No tracking, no background lookup, no hidden query history and no automatic map mutation.</p>${handoffMarkup}</div><div class="osint-geo-status"><small>STATE</small><strong>${this.escape(this.formatOSINTEnum(stateText))}</strong><span>CONFIDENCE · ${this.escape(confidence)}</span></div></section>
            <section class="osint-geo-query workspace-panel"><header><h2>LOCATION INPUT</h2><span>EPHEMERAL / USER INITIATED</span></header><div class="workspace-panel-content"><form data-osint-geo-form novalidate><label><span>COORDINATES OR PUBLIC PLACE TEXT</span><input class="aegis-input" data-osint-geo-input maxlength="240" autocomplete="off" spellcheck="false" value="${this.escape(state.input || "")}" placeholder="51.5074, -0.1278 · 51° 30' 26.6\" N, 0° 7' 39.2\" W · London"></label><small>Accepted: latitude/longitude decimal coordinates, common DMS, or a short public place name. URLs, scripts and ambiguous forms are rejected.</small><footer><button type="submit" ${loading ? "disabled" : ""}>${loading ? "VERIFYING…" : "VERIFY LOCATION"}</button>${loading ? `<button type="button" data-osint-geo-action="cancel">CANCEL</button>` : ""}<button type="button" data-osint-geo-action="clear">CLEAR</button></footer></form>${error ? `<section class="osint-panel-error"><strong>${this.escape(this.formatOSINTEnum(error.code || "ERROR"))}</strong><p>${this.escape(error.message || "Geospatial verification did not complete.")}</p></section>` : ""}</div></section>
            <section class="osint-geo-result workspace-panel"><header><h2>VERIFICATION RESULT</h2><span>${this.escape(this.formatOSINTEnum(status))} · ${this.escape(confidence)}</span></header><div class="workspace-panel-content">${locationMarkup}<section class="osint-geo-reasoning"><small>ASSESSMENT</small><ul>${(verification && verification.reasoning || ["Awaiting explicit input."]).map(reason => `<li>${this.escape(reason)}</li>`).join("")}</ul></section>${providerMarkup}<footer>${canSave ? `<button type="button" data-osint-geo-action="save">ADD TO CASE</button>` : `<span class="osint-action-unavailable">ADD TO CASE AVAILABLE AFTER A REVIEWED PROVIDER OBSERVATION</span>`}</footer></div></section>
            <section class="osint-geo-observation workspace-panel"><header><h2>INVESTIGATOR OBSERVATION</h2><span>LOCAL / EXPLICIT</span></header><div class="workspace-panel-content"><form data-osint-geo-observation-form><label><span>ASSESSMENT</span><select class="aegis-select" data-osint-geo-assessment><option value="SUPPORTS"${state.investigatorAssessment === "SUPPORTS" ? " selected" : ""}>SUPPORTS</option><option value="CONTRADICTS"${state.investigatorAssessment === "CONTRADICTS" ? " selected" : ""}>CONTRADICTS</option><option value="INCONCLUSIVE"${state.investigatorAssessment === "INCONCLUSIVE" ? " selected" : ""}>INCONCLUSIVE</option></select></label><label><span>NOTE · LOCAL UNTIL EXPLICIT EVIDENCE CAPTURE</span><textarea class="aegis-input" name="note" data-osint-geo-note maxlength="1200" ${verification ? "" : "disabled"}>${this.escape(state.investigatorNote || "")}</textarea></label><button type="submit" ${verification ? "" : "disabled"}>ADD OBSERVATION</button></form>${investigationObservations.length ? `<ol class="osint-geo-observations">${investigationObservations.map(item => `<li><strong>${this.escape(item.assessment)}</strong><span>${this.escape(item.note || "No note supplied.")}</span><small>${this.escape(item.recordedAt)}</small></li>`).join("")}</ol>` : `<p class="osint-panel-muted">No local investigator observations have been added to this ephemeral verification.</p>`}</div></section>
            <aside class="osint-geo-policy workspace-panel"><header><h2>PROVIDER POLICY</h2><span>PASSIVE / FIXED ENDPOINT</span></header><div class="workspace-panel-content"><p><strong>Open-Meteo Geocoding</strong> is the sole Phase 5 native adapter. It accepts one explicit place text query, uses a fixed public endpoint and returns a bounded normalized candidate list.</p><p>Coordinate parsing happens locally. Nominatim and the broader Geo catalog remain link-only because their policies or access model are not appropriate for this native runtime.</p><small>MAP HANDOFF · NOT ENABLED IN THIS PHASE. No global map state is changed.</small></div></aside>`;
    }

    async beginOSINTGeoVerification() {
        const Geo = this.getOSINTGeoModule();
        const state = this.osintGeoState;
        const provider = this.getOSINTGeoProvider();
        if (!Geo || !state) return;
        let parsed;
        try { parsed = Geo.parseInput(state.input); }
        catch (error) { state.lastError = {code: error.code || "INVALID_INPUT", message: error.message || "Enter a valid location."}; state.phase = "ERROR"; this.renderOSINTState(); return; }
        this.cancelOSINTGeoVerification(false);
        state.lastError = null;
        state.providerResult = null;
        state.selectedCandidateIndex = 0;
        if (parsed.kind === "COORDINATES") {
            state.verification = Geo.createVerification({parsed, provenance: state.handoff && state.handoff.provenance || "MANUAL_INPUT"});
            state.phase = "COMPLETE";
            this.renderOSINTState();
            return;
        }
        if (!provider || !this.osintRuntime) { state.phase = "ERROR"; state.lastError = {code: "PROVIDER_UNAVAILABLE", message: "The approved geospatial provider is unavailable."}; this.renderOSINTState(); return; }
        state.phase = "LOADING";
        this.renderOSINTState();
        const pending = this.osintRuntime.startQuery(provider.id, parsed, {capability: "GEOSPATIAL_VERIFICATION", locale: navigator.language || "en", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", networkAllowed: true, userInitiated: true, sessionId: "ephemeral-geo"});
        state.activeRequestId = pending.requestId;
        const result = await pending.promise;
        if (!this.osintGeoState || this.osintGeoState.activeRequestId !== pending.requestId) return;
        state.activeRequestId = null;
        if (!result || !["SUCCESS", "EMPTY", "PARTIAL"].includes(result.status)) {
            state.phase = result && result.status === "CANCELLED" ? "IDLE" : "ERROR";
            state.lastError = {code: result && result.error && result.error.code || result && result.status || "ERROR", message: result && result.summary || "Geospatial verification did not complete."};
            this.renderOSINTState();
            return;
        }
        state.providerResult = result;
        this.rebuildOSINTGeoVerification(parsed);
        state.phase = "COMPLETE";
        this.renderOSINTState();
    }

    rebuildOSINTGeoVerification(parsed = null) {
        const Geo = this.getOSINTGeoModule();
        const state = this.osintGeoState;
        if (!Geo || !state) return null;
        const source = parsed || Geo.parseInput(state.input);
        const candidates = state.providerResult && state.providerResult.data && state.providerResult.data.geoCandidates || [];
        const candidate = candidates[state.selectedCandidateIndex] || candidates[0];
        if (!candidate) {
            state.verification = Geo.createVerification({parsed: source, provenance: state.handoff && state.handoff.provenance || "MANUAL_INPUT", investigatorObservations: state.verification && state.verification.investigatorObservations || []});
            return state.verification;
        }
        const prior = state.verification && state.verification.investigatorObservations || [];
        const observation = {...candidate, providerId: "open-meteo-geocoding", providerName: "Open-Meteo Geocoding", type: "PUBLIC_GEOCODING_API", observedAt: state.providerResult.completedAt, confidence: state.providerResult.confidence};
        state.verification = Geo.createVerification({parsed: source, provenance: state.handoff && state.handoff.provenance || "MANUAL_INPUT", providerObservations: [observation], investigatorObservations: prior});
        return state.verification;
    }

    cancelOSINTGeoVerification(render = true) {
        const state = this.osintGeoState;
        if (!state || !state.activeRequestId || !this.osintRuntime) return false;
        const cancelled = this.osintRuntime.cancel(state.activeRequestId);
        state.activeRequestId = null;
        state.phase = "IDLE";
        if (render) this.renderOSINTState();
        return cancelled;
    }

    addOSINTGeoInvestigatorObservation(form = null) {
        const Geo = this.getOSINTGeoModule();
        const state = this.osintGeoState;
        if (!Geo || !state || !state.verification) return;
        const note = form ? new FormData(form).get("note") : state.investigatorNote;
        const prior = state.verification.investigatorObservations || [];
        state.verification = Geo.createVerification({parsed: Geo.parseInput(state.input), provenance: state.handoff && state.handoff.provenance || "MANUAL_INPUT", normalizedLocation: state.verification.normalizedLocation, providerObservations: state.verification.providerObservations, investigatorObservations: [...prior, {assessment: state.investigatorAssessment, note, recordedAt: new Date().toISOString()}]});
        state.investigatorNote = "";
        state.investigatorAssessment = "INCONCLUSIVE";
        this.renderOSINTState();
    }

    promoteOSINTGeoEvidence(trigger = null) {
        const Geo = this.getOSINTGeoModule();
        const state = this.osintGeoState;
        const provider = this.getOSINTGeoProvider();
        if (!Geo || !state || !state.verification || !provider || !state.verification.providerObservations.length) return this.showToast(this.osintView, "NO PROMOTABLE GEO RESULT");
        const data = Geo.toEvidenceData(state.verification);
        this.osintLastNormalizedResults[provider.id] = Object.freeze({requestId: `geo-evidence-${Date.now().toString(36)}`, providerId: provider.id, capability: "GEOSPATIAL_VERIFICATION", status: "SUCCESS", queriedAt: data.queriedAt, completedAt: data.completedAt, durationMs: 0, summary: `Geospatial verification: ${this.geoLocationLabel(state.verification.normalizedLocation)}.`, data, warnings: state.verification.reasoning.slice(), source: {provider: data.provider, type: "LOCAL_NORMALIZATION_WITH_PUBLIC_PROVIDER"}, confidence: state.verification.confidence, rawAvailable: false, error: null});
        this.openOSINTEvidencePromotion(provider.id, trigger);
    }

    renderOSINTCaseReadout() {
        const state = this.osintCaseState || {};
        const active = state.activeCase && state.activeCase.case;
        return `<section class="osint-active-case-readout"><header><small>INVESTIGATION CASE</small><button type="button" data-osint-case-action="workspace">CASE WORKSPACE</button></header>${active ? `<strong>${this.escape(active.title)}</strong><span>${this.escape(this.formatOSINTEnum(active.status))} · ${active.evidenceCount || 0} EVIDENCE</span>` : `<span>NO ACTIVE CASE · RESULTS REMAIN EPHEMERAL</span>`}</section>`;
    }

    renderOSINTProviderMetadata(provider, referenceOnly) {
        const launch = this.osintPolicyDecision("canLaunch", provider);
        const copy = this.osintPolicyDecision("canCopyUrl", provider);
        const docs = this.osintPolicyDecision("canViewDocs", provider);
        const integration = this.osintPolicyDecision("canIntegrate", provider);
        const installation = this.osintPolicyDecision("canInstall", provider);
        const query = this.getOSINTQueryDecision(provider);
        const runtimeState = this.getOSINTProviderRuntimeState(provider);
        const status = this.formatOSINTEnum(provider.providerStatus);
        return `<section class="osint-panel-metadata"><div class="osint-panel-metadata-grid"><div><small>CAPABILITIES</small><strong>${this.escape(this.formatOSINTList(provider.capabilities))}</strong></div><div><small>TYPE / ACCESS</small><strong>${this.escape(this.formatOSINTEnum(provider.providerType))} · ${this.escape(this.formatOSINTEnum(provider.accessMode))}</strong></div><div><small>RISK / LEGAL</small><strong>${this.escape(this.formatOSINTEnum(provider.riskProfile))} · ${this.escape(this.formatOSINTEnum(provider.legalStatus))}</strong></div><div><small>INPUTS</small><strong>${this.escape(this.formatOSINTList(provider.inputs))}</strong></div><div><small>OUTPUTS</small><strong>${this.escape(this.formatOSINTList(provider.outputs))}</strong></div><div><small>AUTH / COST</small><strong>${this.escape(this.formatOSINTEnum(provider.authentication))} · ${this.escape(this.formatOSINTEnum(provider.costModel))}</strong></div><div><small>RUNTIME</small><strong>${query.allowed ? "NATIVE QUERY AVAILABLE" : referenceOnly ? "REFERENCE ONLY · BLOCKED" : "CATALOG ONLY"} · ${this.escape(this.formatOSINTEnum(runtimeState.health))}</strong></div><div><small>INTEGRATION</small><strong>${integration.allowed ? "APPROVED" : status === "LINK ONLY" ? "LINK ONLY · NOT CONNECTED" : "NOT AVAILABLE"}</strong></div><div><small>POLICY</small><strong>${launch.allowed ? "OPEN APPROVED" : referenceOnly ? "ACCESS BLOCKED" : this.escape(this.formatOSINTEnum(launch.code))} · ${copy.allowed ? "COPY APPROVED" : "COPY BLOCKED"}</strong></div><div><small>REVIEW</small><strong>${this.escape(provider.lastReviewed)} · ${this.escape(this.formatOSINTEnum(provider.sourceConfidence))}</strong></div></div>${referenceOnly ? `<section class="osint-reference-notice" data-osint-reference-notice><strong>ACCESS BLOCKED — REFERENCE ONLY</strong><p><b>WHY INCLUDED:</b> ${this.escape(provider.referenceReason)}</p><p><b>LEGAL CONTEXT:</b> ${this.escape(provider.legalDisclaimer)}</p><p><b>JURISDICTION:</b> ${this.escape(provider.jurisdictionNote)}</p></section>` : `<section class="osint-panel-policy-note"><p>${this.escape(provider.legalDisclaimer)}</p><small>OFFICIAL SOURCE ${launch.allowed ? "AVAILABLE THROUGH APPROVED OPEN ACTION" : "NOT AVAILABLE"} · DOCS ${docs.allowed ? "AVAILABLE" : "NOT DECLARED"} · INSTALL ${installation.allowed ? "APPROVED" : "BLOCKED"}</small></section>`}</section>`;
    }

    renderOSINTPanelActions(provider, referenceOnly) {
        const launch = this.osintPolicyDecision("canLaunch", provider);
        const copy = this.osintPolicyDecision("canCopyUrl", provider);
        const docs = this.osintPolicyDecision("canViewDocs", provider);
        if (referenceOnly) return `<button type="button" data-osint-panel-action="read">READ REFERENCE</button><button type="button" data-osint-panel-action="close">CLOSE</button>`;
        const unavailable = !launch.allowed
            ? `<span class="osint-action-unavailable" role="status" aria-disabled="true">OPEN BLOCKED · ${this.escape(this.formatOSINTEnum(launch.code))}</span>`
            : "";
        return `<button type="button" data-osint-panel-action="detail" aria-haspopup="dialog" aria-expanded="false">DETAIL</button>${launch.allowed ? `<button type="button" data-osint-panel-action="open">OPEN</button>` : ""}${copy.allowed ? `<button type="button" data-osint-panel-action="copy">COPY URL</button>` : ""}${docs.allowed ? `<button type="button" data-osint-panel-action="docs">DOCS</button>` : ""}${unavailable}`;
    }

    handleOSINTPanelAction(action, trigger) {
        const provider = this.getSelectedOSINTProvider();
        if (!provider) return;
        if (action === "detail") return this.openOSINTDetail(provider, trigger);
        if (action === "open") return this.launchOSINTProvider(provider);
        if (action === "copy") return this.copyOSINTProviderUrl(provider);
        if (action === "docs") return this.openOSINTProviderDocs(provider);
        if (action === "read") {
            const decision = this.osintPolicyDecision("canReadReference", provider);
            if (!decision.allowed) return this.rejectOSINTPolicy(provider, decision, "READ REFERENCE");
            this.osintAccess.recordAction(provider, "READ_REFERENCE", {state: "REFERENCE_ONLY", resultSummary: "Reference detail opened"});
            return this.openOSINTDetail(provider, trigger);
        }
        if (action === "close") {
            this.osintAccess.closeSelection();
            this.renderOSINTState();
        }
    }

    clearOSINTSessionHistory() {
        if (!this.osintAccess) return;
        const result = this.osintAccess.requestClear();
        this.renderOSINTState();
        this.showToast(this.osintView, result.confirmationRequired ? "CONFIRM CLEAR SESSION" : result.cleared ? "SESSION HISTORY CLEARED" : "SESSION HISTORY EMPTY");
    }

    openOSINTDetail(provider, trigger = null) {
        let overlay = document.getElementById("osint_tool_detail_overlay");
        if (!overlay) {
            overlay = document.createElement("section");
            overlay.id = "osint_tool_detail_overlay";
            overlay.className = "osint-detail-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.addEventListener("click", event => {
                if (event.target === overlay) this.closeOSINTDetail();
            });
            overlay.addEventListener("mousedown", event => {
                if (event.target !== overlay) event.stopPropagation();
            });
            document.body.appendChild(overlay);
        }
        this.osintDetailTrigger = trigger || document.activeElement;
        if (this.osintDetailTrigger && typeof this.osintDetailTrigger.setAttribute === "function") this.osintDetailTrigger.setAttribute("aria-expanded", "true");
        const category = (this.osintRegistry.CATEGORIES || []).find(item => item.id === provider.category);
        const policy = this.osintPolicy;
        const referenceOnly = Boolean(policy && policy.isReferenceOnly && policy.isReferenceOnly(provider));
        const canLaunch = this.osintPolicyDecision("canLaunch", provider);
        const canCopy = this.osintPolicyDecision("canCopyUrl", provider);
        const canDocs = this.osintPolicyDecision("canViewDocs", provider);
        overlay.innerHTML = `
            <article class="osint-detail-panel${referenceOnly ? " reference-only" : ""}">
                <header>
                    <span>${this.escape(provider.icon || "◌")}</span>
                    <div><small>OSINT PROVIDER / ${this.escape(category ? category.title : "PUBLIC SOURCE")}</small><h2>${this.escape(provider.name)}</h2></div>
                    <em>${referenceOnly ? "REFERENCE ONLY" : this.escape(policy && policy.displayAccess ? policy.displayAccess(provider) : "EXTERNAL")}</em>
                    <button type="button" class="osint-detail-close" aria-label="Close OSINT tool detail">×</button>
                </header>
                <section class="osint-detail-body">${this.renderOSINTProviderMetadata(provider, referenceOnly)}</section>
                <footer>${referenceOnly ? `<button type="button" data-osint-detail-action="read">READ REFERENCE</button>` : `${canLaunch.allowed ? `<button type="button" data-osint-detail-action="detail-open">OPEN WEB</button>` : ""}${canCopy.allowed ? `<button type="button" data-osint-detail-action="detail-copy">COPY URL</button>` : ""}${canDocs.allowed ? `<button type="button" data-osint-detail-action="detail-docs">DOCS</button>` : ""}`}<button type="button" data-osint-detail-action="close">CLOSE</button></footer>
            </article>`;
        overlay.classList.add("visible");
        overlay.setAttribute("aria-hidden", "false");
        overlay.querySelector(".osint-detail-close").addEventListener("click", () => this.closeOSINTDetail());
        overlay.querySelector('[data-osint-detail-action="close"]').addEventListener("click", () => this.closeOSINTDetail());
        const openButton = overlay.querySelector('[data-osint-detail-action="detail-open"]');
        if (openButton) openButton.addEventListener("click", () => this.launchOSINTProvider(provider));
        const copyButton = overlay.querySelector('[data-osint-detail-action="detail-copy"]');
        if (copyButton) copyButton.addEventListener("click", () => this.copyOSINTProviderUrl(provider));
        const docsButton = overlay.querySelector('[data-osint-detail-action="detail-docs"]');
        if (docsButton) docsButton.addEventListener("click", () => this.openOSINTProviderDocs(provider));
        const readButton = overlay.querySelector('[data-osint-detail-action="read"]');
        if (readButton) readButton.addEventListener("click", () => {
            const decision = this.osintPolicyDecision("canReadReference", provider);
            if (!decision.allowed) return this.rejectOSINTPolicy(provider, decision, "READ REFERENCE");
            if (this.osintAccess) this.osintAccess.recordAction(provider, "READ_REFERENCE", {state: "REFERENCE_ONLY", resultSummary: "Reference detail reviewed"});
            this.showToast(this.osintView, "REFERENCE ONLY · NO ACCESS ACTIONS AVAILABLE");
        });
        if (this.boundOSINTDetailEscape) document.removeEventListener("keydown", this.boundOSINTDetailEscape);
        this.boundOSINTDetailEscape = event => {
            if (event.key === "Escape") this.closeOSINTDetail();
        };
        document.addEventListener("keydown", this.boundOSINTDetailEscape);
        overlay.querySelector(".osint-detail-close").focus();
    }

    rejectOSINTPolicy(provider, decision, action = "ACTION") {
        const rejection = {allowed: false, code: "POLICY_BLOCKED", policyCode: decision.code || "UNKNOWN_ERROR", message: decision.message || "Action blocked by provider policy."};
        this.lastOSINTPolicyDecision = rejection;
        if (this.osintAccess) this.osintAccess.recordError(provider, rejection.code, `${action} · ${rejection.policyCode}`);
        this.showToast(this.osintView, `ACCESS BLOCKED · ${rejection.policyCode}`);
        this.renderOSINTState();
        return rejection;
    }

    async launchOSINTProvider(provider) {
        const decision = this.osintPolicyDecision("canLaunch", provider);
        this.lastOSINTPolicyDecision = decision;
        if (!decision.allowed) return this.rejectOSINTPolicy(provider, decision, "OPEN");
        const response = await this.openLink(provider.officialUrl, this.osintView);
        if (this.osintAccess) this.osintAccess.setPanelState(response && response.ok ? "READY" : "ERROR", response && response.ok ? "IDLE" : "ERROR");
        if (this.osintAccess) this.osintAccess.recordAction(provider, "OPEN_PROVIDER", {state: response && response.ok ? "READY" : "ERROR", resultSummary: response && response.ok ? "Approved external launch requested" : "Approved launch failed", errorCode: response && !response.ok ? "OPEN_FAILED" : null});
        this.renderOSINTState();
        return {...decision, response};
    }

    async copyOSINTProviderUrl(provider) {
        const decision = this.osintPolicyDecision("canCopyUrl", provider);
        this.lastOSINTPolicyDecision = decision;
        if (!decision.allowed) return this.rejectOSINTPolicy(provider, decision, "COPY URL");
        try {
            await navigator.clipboard.writeText(provider.officialUrl);
            if (this.osintAccess) this.osintAccess.setPanelState("READY", "IDLE");
            if (this.osintAccess) this.osintAccess.recordAction(provider, "COPY_PROVIDER_URL", {state: "READY", resultSummary: "Approved source URL copied"});
            this.showToast(this.osintView, "SOURCE URL COPIED");
            this.renderOSINTState();
            return decision;
        } catch (error) {
            if (this.osintAccess) this.osintAccess.recordError(provider, "OPEN_FAILED", "Clipboard unavailable");
            this.showToast(this.osintView, "COPY UNAVAILABLE");
            return {allowed: false, code: "COPY_UNAVAILABLE", message: error.message || "Clipboard unavailable."};
        }
    }

    async openOSINTProviderDocs(provider) {
        const decision = this.osintPolicyDecision("canViewDocs", provider);
        this.lastOSINTPolicyDecision = decision;
        if (!decision.allowed) return this.rejectOSINTPolicy(provider, decision, "DOCS");
        const response = await this.openLink(provider.docsUrl, this.osintView);
        if (this.osintAccess) this.osintAccess.setPanelState(response && response.ok ? "READY" : "ERROR", response && response.ok ? "IDLE" : "ERROR");
        if (this.osintAccess) this.osintAccess.recordAction(provider, "OPEN_PROVIDER_DOCS", {state: response && response.ok ? "READY" : "ERROR", resultSummary: response && response.ok ? "Approved documentation launch requested" : "Documentation launch failed", errorCode: response && !response.ok ? "OPEN_FAILED" : null});
        this.renderOSINTState();
        return {...decision, response};
    }

    closeOSINTDetail() {
        const overlay = document.getElementById("osint_tool_detail_overlay");
        if (overlay) {
            overlay.classList.remove("visible");
            overlay.setAttribute("aria-hidden", "true");
        }
        if (this.boundOSINTDetailEscape) {
            document.removeEventListener("keydown", this.boundOSINTDetailEscape);
            this.boundOSINTDetailEscape = null;
        }
        const trigger = this.osintDetailTrigger;
        this.osintDetailTrigger = null;
        if (trigger && typeof trigger.setAttribute === "function") trigger.setAttribute("aria-expanded", "false");
        if (trigger && document.contains(trigger) && typeof trigger.focus === "function") trigger.focus({preventScroll: true});
    }

    async ensureOSINTCasesLoaded() {
        const state = this.osintCaseState;
        if (!state || state.loaded || state.loading || !this.ipc || typeof this.ipc.invoke !== "function") return;
        state.loading = true;
        try {
            const response = await this.ipc.invoke("osint-case-list", {});
            if (!response || !response.ok) throw new Error(response && response.message || "Case storage is unavailable.");
            state.cases = Array.isArray(response.cases) ? response.cases : [];
            state.loaded = true;
            state.lastError = null;
        } catch (error) {
            state.lastError = "CASE STORAGE UNAVAILABLE";
        } finally {
            state.loading = false;
            if (this.osintView) this.renderOSINTState();
        }
    }

    async refreshOSINTCases(options = {}) {
        const state = this.osintCaseState;
        if (!state || !this.ipc || typeof this.ipc.invoke !== "function") return null;
        const response = await this.ipc.invoke("osint-case-list", {});
        if (!response || !response.ok) {
            state.lastError = response && response.code || "STORAGE_UNAVAILABLE";
            if (this.osintView) this.renderOSINTState();
            return response;
        }
        state.cases = Array.isArray(response.cases) ? response.cases : [];
        state.loaded = true;
        state.lastError = null;
        if (options.readActive && state.activeCaseId) await this.openOSINTCaseById(state.activeCaseId, {render: false, silent: true});
        if (this.osintView && options.render !== false) this.renderOSINTState();
        return response;
    }

    async openOSINTCaseById(caseId, options = {}) {
        if (!caseId || !this.ipc || typeof this.ipc.invoke !== "function") return null;
        const previousCaseId = this.osintCaseState && this.osintCaseState.activeCaseId;
        const response = await this.ipc.invoke("osint-case-read", {caseId});
        if (!response || !response.ok) {
            if (this.osintCaseState) this.osintCaseState.lastError = response && response.code || "CASE_NOT_FOUND";
            if (!options.silent) this.showToast(this.osintView, response && response.message || "CASE UNAVAILABLE");
            return null;
        }
        this.osintCaseState.activeCaseId = response.case.id;
        this.osintCaseState.activeCase = response;
        this.osintCaseState.mode = "CASE";
        this.osintCaseState.lastError = null;
        // Context is case-owned and ephemeral. A selection/provenance chain
        // from another case cannot be reused as if it belonged to this case.
        this.updateOSINTInvestigationContext(previousCaseId && previousCaseId !== response.case.id
            ? {activeCaseId: response.case.id, selectedObjectId: null, selectedObjectType: "UNKNOWN", originatingCapability: null, provenance: null}
            : {activeCaseId: response.case.id});
        if (this.osintAccess && !options.silent) this.osintAccess.recordAction(null, "CASE_OPENED", {state: "CASE", resultSummary: "Local case opened"});
        if (options.render !== false && this.osintView) this.renderOSINTState();
        return response;
    }

    getOSINTCaseOverview() {
        const Orchestration = this.getOSINTInvestigationModule();
        if (!Orchestration) return null;
        return Orchestration.deriveCaseOverview({activeCase: this.osintCaseState && this.osintCaseState.activeCase, entityState: this.osintEntityState});
    }

    renderOSINTCaseOverview(grid) {
        const overview = this.getOSINTCaseOverview();
        const activeCase = overview && overview.case;
        if (!overview || !activeCase) {
            this.osintCaseState.mode = "CASE";
            return this.renderOSINTCaseWorkspace(grid);
        }
        const context = this.osintInvestigationContext || this.updateOSINTInvestigationContext({activeCaseId: activeCase.id});
        const selected = overview.objects.find(item => item.id === context.selectedObjectId) || null;
        const Orchestration = this.getOSINTInvestigationModule();
        const actions = selected && Orchestration ? Orchestration.availableHandoffs(selected) : [];
        const readout = (label, value) => `<div><small>${this.escape(label)}</small><strong>${this.escape(String(value))}</strong></div>`;
        const objectList = overview.categories.map(group => `<section class="osint-investigation-object-group"><header><h3>${this.escape(this.formatOSINTEnum(group.type))}</h3><span>${group.count}</span></header><div>${group.objects.map(item => `<button type="button" class="osint-investigation-object${selected && selected.id === item.id ? " selected" : ""}" data-osint-investigation-action="select-object" data-osint-object-id="${this.escape(item.id)}"><strong>${this.escape(item.label)}</strong><span>${this.escape(this.formatOSINTEnum(item.status))} · ${this.escape(item.confidence)} · ${this.escape(this.formatOSINTEnum(item.capability))}</span><small>${this.escape(item.provenance.sourceCapability)} · ${this.escape(item.evidenceId || "EPHEMERAL")}</small></button>`).join("")}</div></section>`).join("") || `<p class="osint-panel-muted">No normalized investigation objects are associated with this case yet. Explicitly promote a reviewed result through Evidence Preview.</p>`;
        const actionMarkup = selected ? `<section class="osint-investigation-selected"><small>SELECTED OBJECT</small><strong>${this.escape(selected.label)}</strong><span>${this.escape(this.formatOSINTEnum(selected.type))} · ${this.escape(selected.provenance.sourceCapability)}</span><p>Opening another capability transfers normalized context only. It never starts a provider request or persists a new record.</p><footer>${actions.length ? actions.map(item => `<button type="button" data-osint-investigation-action="handoff" data-osint-object-id="${this.escape(selected.id)}" data-osint-handoff-action="${this.escape(item.id)}">${this.escape(item.label)}</button>`).join("") : `<span class="osint-action-unavailable">NO COMPATIBLE EXPLICIT ACTION</span>`}${selected.evidenceId ? `<button type="button" data-osint-investigation-action="view-evidence" data-osint-evidence-id="${this.escape(selected.evidenceId)}">VIEW EVIDENCE</button>` : ""}</footer></section>` : `<p class="osint-panel-muted">Select an object to see only the actions that its normalized type and provenance permit.</p>`;
        const questions = overview.openQuestions.length ? `<ol class="osint-investigation-question-list">${overview.openQuestions.map(item => `<li><strong>${this.escape(this.formatOSINTEnum(item.kind))}</strong><span>${this.escape(item.label)}</span><small>${this.escape(item.detail)}</small></li>`).join("")}</ol>` : `<p class="osint-panel-muted">No unresolved normalized observations or recorded contradictions are currently derived from this case.</p>`;
        const activity = overview.recentActivity.length ? `<ol class="osint-case-timeline-list">${overview.recentActivity.map(item => `<li><strong>${this.escape(this.formatOSINTEnum(item.type))}</strong><span>${this.escape(item.summary)}</span><small>${this.escape(new Date(item.timestamp).toLocaleString())}</small></li>`).join("")}</ol>` : `<p class="osint-panel-muted">No persistent case activity yet. Ephemeral navigation is intentionally not written to the timeline.</p>`;
        grid.innerHTML = `<section class="osint-investigation-header workspace-panel"><button type="button" class="osint-back-button" data-osint-investigation-action="case">‹ CASE WORKSPACE</button><div><small>OSINT / CASE / EXPLICIT ORCHESTRATION</small><h2>CASE OVERVIEW</h2><p>${this.escape(activeCase.title)} · a local inventory of explicit evidence, context and unresolved observations. No autonomous query chain, hidden history or automatic persistence.</p></div><span>${this.escape(this.formatOSINTEnum(activeCase.status))} · ${this.escape(this.formatOSINTEnum(activeCase.priority))}</span></section>
            <section class="osint-investigation-summary workspace-panel"><header><h2>INVESTIGATION STATUS</h2><span>DERIVED / LOCAL</span></header><div class="workspace-panel-content osint-investigation-readout">${readout("EVIDENCE", overview.counts.evidence)}${readout("EPHEMERAL ENTITIES", overview.counts.entities)}${readout("RELATIONSHIPS", overview.counts.relationships)}${readout("NOTES", overview.counts.notes)}${readout("TIMELINE EVENTS", overview.counts.timeline)}${readout("NORMALIZED OBJECTS", overview.counts.objects)}</div></section>
            <section class="osint-investigation-index workspace-panel"><header><h2>INVESTIGATION OBJECT INDEX</h2><span>CASE-DERIVED</span></header><div class="workspace-panel-content">${objectList}</div></section>
            <section class="osint-investigation-actions workspace-panel"><header><h2>AVAILABLE ACTIONS</h2><span>EXPLICIT / NO AUTO QUERY</span></header><div class="workspace-panel-content">${actionMarkup}</div></section>
            <section class="osint-investigation-questions workspace-panel"><header><h2>OPEN QUESTIONS</h2><span>${overview.openQuestions.length} UNRESOLVED</span></header><div class="workspace-panel-content">${questions}</div></section>
            <section class="osint-investigation-activity workspace-panel"><header><h2>RECENT ACTIVITY</h2><span>PERSISTENT CASE TIMELINE</span></header><div class="workspace-panel-content">${activity}</div></section>
            <section class="osint-investigation-provenance workspace-panel"><header><h2>PROVENANCE HEALTH</h2><span>INVENTORY ONLY</span></header><div class="workspace-panel-content osint-investigation-readout">${readout("WITH PROVENANCE", overview.provenanceHealth.withProvenance)}${readout("MISSING USEFUL PROVENANCE", overview.provenanceHealth.missingProvenance)}${readout("INTEGRITY VALID", overview.provenanceHealth.evidenceIntegrityChecked)}${readout("INTEGRITY INVALID", overview.provenanceHealth.integrityInvalid)}<p>Case Overview does not resolve contradictions, create entities, create relationships or bypass Evidence Preview. Those remain explicit analyst actions in their owning capability.</p></div></section>`;
    }

    handleOSINTInvestigationAction(action, trigger) {
        const overview = this.getOSINTCaseOverview();
        if (action === "case") { this.osintCaseState.mode = "CASE"; this.renderOSINTState(); return; }
        if (!overview) return;
        if (action === "select-object") {
            const object = overview.objects.find(item => item.id === trigger.dataset.osintObjectId);
            if (!object) return;
            this.updateOSINTInvestigationContext({activeCaseId: overview.case && overview.case.id, selectedObjectId: object.id, selectedObjectType: object.type, originatingCapability: object.capability, provenance: object.provenance});
            this.renderOSINTState();
            return;
        }
        if (action === "view-evidence") return this.openOSINTEvidenceDetail(this.osintCaseState.activeCaseId, trigger.dataset.osintEvidenceId, trigger);
        if (action === "handoff") {
            const object = overview.objects.find(item => item.id === trigger.dataset.osintObjectId);
            if (!object) return this.showToast(this.osintView, "INVESTIGATION OBJECT UNAVAILABLE");
            return this.beginOSINTInvestigationHandoff(object, trigger.dataset.osintHandoffAction);
        }
    }

    renderOSINTCaseWorkspace(grid) {
        const state = this.osintCaseState || {};
        const active = state.activeCase;
        const cases = Array.isArray(state.cases) ? state.cases : [];
        const caseList = cases.length
            ? cases.map(item => `<button type="button" class="osint-case-list-item${active && active.case && active.case.id === item.id ? " selected" : ""}" data-osint-case-action="open" data-osint-case-id="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><span>${this.escape(this.formatOSINTEnum(item.status))} · ${this.escape(this.formatOSINTEnum(item.priority))}</span><small>${item.evidenceCount || 0} EVIDENCE · ${this.escape((item.tags || []).join(" · ") || "NO TAGS")}</small></button>`).join("")
            : `<p class="osint-panel-muted">No local investigations yet. Create a case only when you want to retain selected evidence.</p>`;
        const evidence = active && Array.isArray(active.evidence) ? active.evidence : [];
        const timeline = active && Array.isArray(active.timeline) ? active.timeline : [];
        const notes = active && Array.isArray(active.notes) ? active.notes : [];
        const activeMarkup = active && active.case
            ? `<section class="osint-case-active workspace-panel"><header><div><small>ACTIVE INVESTIGATION</small><h2>${this.escape(active.case.title)}</h2><p>${this.escape(active.case.description || "No description recorded.")}</p></div><span class="osint-case-status">${this.escape(this.formatOSINTEnum(active.case.status))} · ${this.escape(this.formatOSINTEnum(active.case.priority))}</span></header><div class="osint-case-active-content"><div class="osint-case-metadata"><div><small>EVIDENCE</small><strong>${evidence.length}</strong></div><div><small>TAGS</small><strong>${this.escape((active.case.tags || []).join(" · ") || "NONE")}</strong></div><div><small>UPDATED</small><strong>${this.escape(new Date(active.case.updatedAt).toLocaleString())}</strong></div></div><footer><button type="button" data-osint-case-action="overview" data-osint-case-id="${this.escape(active.case.id)}">CASE OVERVIEW</button><button type="button" data-osint-case-action="edit" data-osint-case-id="${this.escape(active.case.id)}">EDIT CASE</button><button type="button" data-osint-case-action="archive" data-osint-case-id="${this.escape(active.case.id)}">ARCHIVE</button><button type="button" data-osint-case-action="export-json" data-osint-case-id="${this.escape(active.case.id)}">EXPORT JSON</button><button type="button" data-osint-case-action="export-markdown" data-osint-case-id="${this.escape(active.case.id)}">EXPORT MARKDOWN</button></footer></div></section>
                <section class="osint-case-evidence workspace-panel"><header><h2>EVIDENCE</h2><span>${evidence.length} LOCAL OBJECTS</span></header><div class="osint-case-panel-content"><button type="button" data-osint-case-action="manual-evidence" data-osint-case-id="${this.escape(active.case.id)}">ADD MANUAL EVIDENCE</button>${evidence.length ? `<ol class="osint-case-evidence-list">${evidence.map(item => `<li class="${item.unreadable || item.integrity && item.integrity.status === "INVALID" ? "invalid" : ""}"><div><strong>${this.escape(item.title || item.id)}</strong><span>${this.escape(this.formatOSINTEnum(item.type || "UNKNOWN"))} · ${this.escape(item.providerName || "MANUAL")}</span><small>${this.escape(this.formatOSINTEnum(item.integrity && item.integrity.status || "UNKNOWN"))} · ${this.escape((item.tags || []).join(" · ") || "NO TAGS")}</small></div><div><button type="button" data-osint-case-action="evidence-view" data-osint-case-id="${this.escape(active.case.id)}" data-osint-evidence-id="${this.escape(item.id)}">VIEW</button><button type="button" data-osint-case-action="evidence-verify" data-osint-case-id="${this.escape(active.case.id)}" data-osint-evidence-id="${this.escape(item.id)}">VERIFY</button><button type="button" data-osint-case-action="evidence-remove" data-osint-case-id="${this.escape(active.case.id)}" data-osint-evidence-id="${this.escape(item.id)}">REMOVE</button></div></li>`).join("")}</ol>` : `<p class="osint-panel-muted">Run a permitted provider query, then use SAVE TO CASE. Results are never persisted automatically.</p>`}</div></section>
                <section class="osint-case-timeline workspace-panel"><header><h2>CASE TIMELINE</h2><span>PERSISTENT</span></header><div class="osint-case-panel-content">${timeline.length ? `<ol class="osint-case-timeline-list">${timeline.slice().reverse().slice(0, 20).map(event => `<li><strong>${this.escape(this.formatOSINTEnum(event.type))}</strong><span>${this.escape(event.summary)}</span><small>${this.escape(new Date(event.timestamp).toLocaleString())}</small></li>`).join("")}</ol>` : `<p class="osint-panel-muted">No persistent case events yet.</p>`}</div></section>
                <section class="osint-case-notes workspace-panel"><header><h2>NOTES</h2><span>${notes.length} LOCAL NOTES</span></header><div class="osint-case-panel-content">${notes.length ? `<ol class="osint-case-notes-list">${notes.slice().reverse().slice(0, 10).map(note => `<li><div class="osint-case-note-content"><strong>${this.escape(new Date(note.createdAt).toLocaleString())}</strong><span>${this.escape(note.text)}</span><small>${note.evidenceId ? "EVIDENCE NOTE" : "CASE NOTE"}</small></div><button type="button" data-osint-case-action="note-edit" data-osint-case-id="${this.escape(active.case.id)}" data-osint-note-id="${this.escape(note.id)}">EDIT</button></li>`).join("")}</ol>` : `<p class="osint-panel-muted">No local notes yet.</p>`}<form data-osint-case-note-form data-osint-case-id="${this.escape(active.case.id)}"><label><span>ADD CASE NOTE</span><textarea class="aegis-input" name="text" maxlength="${window.OSINTCaseModel ? window.OSINTCaseModel.LIMITS.note : 8000}" required></textarea></label><button type="submit">ADD NOTE</button></form></div></section>`
            : `<section class="osint-case-empty workspace-panel"><header><h2>NO ACTIVE CASE</h2><span>LOCAL / EXPLICIT</span></header><div class="osint-case-panel-content"><p>Create a case to retain selected normalized results. Catalog browsing and provider queries remain ephemeral until you explicitly save an evidence object.</p><button type="button" data-osint-case-action="new">NEW CASE</button></div></section>`;
        grid.innerHTML = `<section class="osint-case-workspace-header workspace-panel"><button type="button" class="osint-back-button" data-osint-case-action="catalog">‹ OSINT CATALOG</button><div><small>OSINT / PERSISTENT INVESTIGATIONS</small><h2>CASE WORKSPACE</h2><p>Local, explicit, auditable evidence records. No background capture and no automatic provider-result persistence.</p></div><button type="button" data-osint-case-action="new">NEW CASE</button></section><aside class="osint-case-list workspace-panel"><header><h2>INVESTIGATIONS</h2><span>${cases.length} CASES</span></header><div class="osint-case-panel-content">${state.loading ? `<p class="osint-panel-muted">LOADING LOCAL CASE INDEX…</p>` : caseList}${state.lastError ? `<p class="osint-panel-error">${this.escape(state.lastError)}</p>` : ""}</div></aside><main class="osint-case-main">${activeMarkup}</main>`;
    }

    handleOSINTCaseAction(action, trigger) {
        const caseId = trigger && trigger.dataset.osintCaseId;
        const evidenceId = trigger && trigger.dataset.osintEvidenceId;
        const noteId = trigger && trigger.dataset.osintNoteId;
        if (action === "workspace") { this.osintCaseState.mode = "CASE"; this.renderOSINTState(); return; }
        if (action === "overview") { if (this.osintCaseState.activeCase) { this.osintCaseState.mode = "OVERVIEW"; this.updateOSINTInvestigationContext({activeCaseId: this.osintCaseState.activeCaseId}); this.renderOSINTState(); } return; }
        if (action === "catalog") { this.osintCaseState.mode = "CATALOG"; this.renderOSINTState(); return; }
        if (action === "new") return this.openOSINTNewCaseDialog(trigger);
        if (action === "open") return this.openOSINTCaseById(caseId);
        if (action === "edit") return this.openOSINTEditCaseDialog(caseId, trigger);
        if (action === "archive") return this.confirmOSINTCaseArchive(caseId, trigger);
        if (action === "manual-evidence") return this.openOSINTManualEvidenceDialog(caseId, trigger);
        if (action === "note-edit") return this.openOSINTEditNoteDialog(caseId, noteId, trigger);
        if (action === "export-json") return this.exportOSINTCase(caseId, "json");
        if (action === "export-markdown") return this.exportOSINTCase(caseId, "markdown");
        if (action === "evidence-view") return this.openOSINTEvidenceDetail(caseId, evidenceId, trigger);
        if (action === "evidence-verify") return this.verifyOSINTEvidence(caseId, evidenceId);
        if (action === "evidence-remove") return this.confirmOSINTEvidenceRemoval(caseId, evidenceId, trigger);
        if (action === "evidence-export-json") return this.exportOSINTEvidence(caseId, evidenceId, "json");
        if (action === "evidence-export-markdown") return this.exportOSINTEvidence(caseId, evidenceId, "markdown");
    }

    openOSINTCaseDialog(title, content, trigger, bind) {
        let overlay = document.getElementById("osint_case_dialog_overlay");
        if (!overlay) {
            overlay = document.createElement("section");
            overlay.id = "osint_case_dialog_overlay";
            overlay.className = "osint-detail-overlay osint-case-dialog-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            document.body.appendChild(overlay);
        }
        this.osintCaseDialogTrigger = trigger || document.activeElement;
        overlay.innerHTML = `<article class="osint-detail-panel osint-case-dialog"><header><div><small>OSINT / CASE / WORKSPACE</small><h2>${this.escape(title)}</h2></div><button type="button" class="osint-detail-close" data-osint-case-dialog-close aria-label="Close dialog">×</button></header><section class="osint-detail-body">${content}</section></article>`;
        overlay.classList.add("visible");
        overlay.setAttribute("aria-hidden", "false");
        const close = () => this.closeOSINTCaseDialog();
        // Keep the backdrop handler alive after internal form/button clicks;
        // only an actual backdrop click can close this focused modal.
        overlay.onclick = event => { if (event.target === overlay) close(); };
        overlay.querySelector("[data-osint-case-dialog-close]").addEventListener("click", close);
        if (this.boundOSINTCaseDialogKeys) document.removeEventListener("keydown", this.boundOSINTCaseDialogKeys);
        this.boundOSINTCaseDialogKeys = event => {
            if (event.key === "Escape") return close();
            if (event.key !== "Tab") return;
            const focusable = [...overlay.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])")];
            if (!focusable.length) return;
            const current = document.activeElement;
            const index = focusable.indexOf(current);
            if (event.shiftKey && (index <= 0)) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
            else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
        };
        document.addEventListener("keydown", this.boundOSINTCaseDialogKeys);
        if (typeof bind === "function") bind(overlay, close);
        const first = overlay.querySelector("input, textarea, select, button");
        if (first) first.focus();
    }

    closeOSINTCaseDialog() {
        const overlay = document.getElementById("osint_case_dialog_overlay");
        if (overlay) { overlay.classList.remove("visible"); overlay.setAttribute("aria-hidden", "true"); }
        if (this.boundOSINTCaseDialogKeys) document.removeEventListener("keydown", this.boundOSINTCaseDialogKeys);
        this.boundOSINTCaseDialogKeys = null;
        const trigger = this.osintCaseDialogTrigger;
        this.osintCaseDialogTrigger = null;
        if (trigger && document.contains(trigger) && typeof trigger.focus === "function") trigger.focus({preventScroll: true});
    }

    openOSINTNewCaseDialog(trigger = null, afterCreate = null) {
        const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        this.openOSINTCaseDialog("NEW INVESTIGATION", `<form data-osint-new-case-form><label><span>TITLE</span><input class="aegis-input" name="title" maxlength="160" required></label><label><span>DESCRIPTION</span><textarea class="aegis-input" name="description" maxlength="4000"></textarea></label><label><span>PRIORITY</span><select class="aegis-select" name="priority">${priorities.map(priority => `<option value="${priority}"${priority === "MEDIUM" ? " selected" : ""}>${priority}</option>`).join("")}</select></label><label><span>TAGS · COMMA SEPARATED</span><input class="aegis-input" name="tags" maxlength="500"></label><footer><button type="button" data-osint-case-dialog-close>Cancel</button><button type="submit">CREATE CASE</button></footer></form>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-new-case-form]").addEventListener("submit", async event => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const response = await this.ipc.invoke("osint-case-create", {title: data.get("title"), description: data.get("description"), priority: data.get("priority"), tags: data.get("tags")});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "CASE CREATE FAILED");
                await this.refreshOSINTCases({render: false});
                close();
                await this.openOSINTCaseById(response.case.id, {render: true, silent: true});
                if (this.osintAccess) this.osintAccess.recordAction(null, "CASE_CREATED", {state: "CASE", resultSummary: "Local investigation created"});
                if (response.warning === "DUPLICATE_TITLE") this.showToast(this.osintView, "CASE CREATED · DUPLICATE TITLE");
                if (typeof afterCreate === "function") afterCreate(response.case.id);
            });
        });
    }

    openOSINTEditCaseDialog(caseId, trigger = null) {
        const current = this.osintCaseState && this.osintCaseState.activeCase && this.osintCaseState.activeCase.case;
        if (!current || current.id !== caseId) return;
        this.openOSINTCaseDialog("EDIT INVESTIGATION", `<form data-osint-edit-case-form><label><span>TITLE</span><input class="aegis-input" name="title" maxlength="160" value="${this.escape(current.title)}" required></label><label><span>DESCRIPTION</span><textarea class="aegis-input" name="description" maxlength="4000">${this.escape(current.description || "")}</textarea></label><label><span>PRIORITY</span><select class="aegis-select" name="priority">${["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(priority => `<option value="${priority}"${current.priority === priority ? " selected" : ""}>${priority}</option>`).join("")}</select></label><label><span>STATUS</span><select class="aegis-select" name="status">${["OPEN", "PAUSED", "CLOSED"].map(status => `<option value="${status}"${current.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></label><label><span>TAGS</span><input class="aegis-input" name="tags" value="${this.escape((current.tags || []).join(", "))}" maxlength="500"></label><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="submit">SAVE CASE</button></footer></form>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-edit-case-form]").addEventListener("submit", async event => {
                event.preventDefault(); const data = new FormData(event.currentTarget);
                const response = await this.ipc.invoke("osint-case-update", {caseId, patch: {title: data.get("title"), description: data.get("description"), priority: data.get("priority"), status: data.get("status"), tags: data.get("tags")}});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "CASE UPDATE FAILED");
                close(); await this.refreshOSINTCases({readActive: true}); this.showToast(this.osintView, "CASE UPDATED");
            });
        });
    }

    confirmOSINTCaseArchive(caseId, trigger = null) {
        const current = this.osintCaseState && this.osintCaseState.activeCase && this.osintCaseState.activeCase.case;
        if (!current || current.id !== caseId) return;
        this.openOSINTCaseDialog("ARCHIVE INVESTIGATION", `<p>Archive <strong>${this.escape(current.title)}</strong>? It contains ${current.evidenceCount || 0} evidence objects. Archiving is reversible only in a future phase and prevents new evidence or notes.</p><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="button" data-osint-case-archive-confirm>ARCHIVE CASE</button></footer>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-case-archive-confirm]").addEventListener("click", async () => {
                const response = await this.ipc.invoke("osint-case-archive", {caseId, confirmation: true});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "CASE ARCHIVE FAILED");
                close(); await this.refreshOSINTCases({readActive: true}); this.showToast(this.osintView, "CASE ARCHIVED");
            });
        });
    }

    async openOSINTEvidencePromotion(providerId, trigger = null) {
        const normalized = this.osintLastNormalizedResults && this.osintLastNormalizedResults[providerId];
        const provider = this.osintProviderRegistry && this.osintProviderRegistry.getProvider(providerId);
        if (!normalized || !provider || !["SUCCESS", "EMPTY", "PARTIAL"].includes(normalized.status)) return this.showToast(this.osintView, "NO PROMOTABLE RESULT");
        if (this.osintPolicy && this.osintPolicy.isReferenceOnly && this.osintPolicy.isReferenceOnly(provider)) return this.showToast(this.osintView, "REFERENCE ONLY · EVIDENCE BLOCKED");
        if (!this.osintCaseState.activeCaseId) return this.openOSINTCaseSelectorForEvidence(providerId, trigger);
        this.openOSINTEvidencePreview(this.osintCaseState.activeCaseId, providerId, trigger);
    }

    openOSINTCaseSelectorForEvidence(providerId, trigger = null) {
        const cases = this.osintCaseState && this.osintCaseState.cases || [];
        const openCases = cases.filter(item => item.status !== "ARCHIVED");
        this.openOSINTCaseDialog("SELECT INVESTIGATION", `<p>Select a local case before you save this normalized provider result. Nothing is persisted until you confirm the evidence preview.</p><div class="osint-case-selector">${openCases.map(item => `<button type="button" data-osint-case-select="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><span>${this.escape(item.status)} · ${item.evidenceCount || 0} EVIDENCE</span></button>`).join("") || `<p class="osint-panel-muted">No open cases are available.</p>`}</div><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="button" data-osint-case-new-from-result>NEW CASE</button></footer>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelectorAll("[data-osint-case-select]").forEach(button => button.addEventListener("click", async () => { const caseId = button.dataset.osintCaseSelect; close(); await this.openOSINTCaseById(caseId, {render: false, silent: true}); this.openOSINTEvidencePreview(caseId, providerId, trigger); }));
            overlay.querySelector("[data-osint-case-new-from-result]").addEventListener("click", () => { close(); this.openOSINTNewCaseDialog(trigger, caseId => this.openOSINTEvidencePreview(caseId, providerId, trigger)); });
        });
    }

    openOSINTEvidencePreview(caseId, providerId, trigger = null) {
        const normalized = this.osintLastNormalizedResults[providerId];
        const data = normalized && normalized.data || {};
        const title = normalized && normalized.summary || "Provider result";
        const geo = normalized && normalized.capability === "GEOSPATIAL_VERIFICATION";
        const infrastructure = normalized && normalized.capability === "INFRASTRUCTURE_CONTEXT";
        const research = normalized && normalized.capability === "SOURCE_VERIFICATION";
        const entityResolution = normalized && normalized.capability === "ENTITY_RESOLUTION";
        const redactions = [
            ["queryInput", "QUERY INPUT"],
            ["canonicalUrl", "CANONICAL URL"],
            ["sourceUrl", "SOURCE URL"],
            ["data.originalInput", "DATA / ORIGINAL INPUT"],
            ["data.canonicalUrl", "DATA / CANONICAL URL"],
            ["data.snapshotUrl", "DATA / SNAPSHOT URL"],
            ...(geo ? [["data.geo.latitude", "GEO / LATITUDE"], ["data.geo.longitude", "GEO / LONGITUDE"], ["data.geo.displayName", "GEO / DISPLAY NAME"], ["data.geo.locality", "GEO / LOCALITY"], ["data.geo.region", "GEO / REGION"], ["data.geo.country", "GEO / COUNTRY"], ["data.geo.countryCode", "GEO / COUNTRY CODE"], ["data.geo.elevationM", "GEO / ELEVATION"], ["data.geo.observations", "GEO / PROVIDER OBSERVATIONS"]] : [])
            .concat(infrastructure ? [["data.infrastructure.normalizedTarget", "INFRASTRUCTURE / NORMALIZED TARGET"], ["data.infrastructure.dns", "INFRASTRUCTURE / DNS"], ["data.infrastructure.network", "INFRASTRUCTURE / NETWORK"], ["data.infrastructure.provenance", "INFRASTRUCTURE / PROVIDER PROVENANCE"]] : [])
            .concat(research ? [["data.research.normalizedUrl", "RESEARCH / NORMALIZED URL"], ["data.research.localDocument", "RESEARCH / LOCAL DOCUMENT METADATA"], ["data.research.localDocument.displayLabel", "RESEARCH / DOCUMENT DISPLAY LABEL"], ["data.research.title", "RESEARCH / TITLE"], ["data.research.publisher", "RESEARCH / PUBLISHER"], ["data.research.authors", "RESEARCH / AUTHORS"], ["data.research.publishedAt", "RESEARCH / PUBLISHED"], ["data.research.updatedAt", "RESEARCH / UPDATED"], ["data.research.archive", "RESEARCH / ARCHIVE CONTEXT"], ["data.research.provenance", "RESEARCH / PROVIDER PROVENANCE"], ["data.research.fieldProvenance", "RESEARCH / FIELD PROVENANCE"], ["data.research.excerpt", "RESEARCH / EXCERPT"], ["data.research.analystObservation", "RESEARCH / ANALYST OBSERVATION"]] : [])
            .concat(entityResolution ? [["data.entityResolution.entity.label", "ENTITY / LABEL"], ["data.entityResolution.entity.aliases", "ENTITY / ALIASES"], ["data.entityResolution.entity.attributes", "ENTITY / ATTRIBUTES AND PROVENANCE"], ["data.entityResolution.relationships", "ENTITY / RELATIONSHIPS"], ["data.entityResolution.analystNote", "ENTITY / ANALYST NOTE"]] : [])
        ];
        this.openOSINTCaseDialog("EVIDENCE PREVIEW", `<form data-osint-evidence-preview-form><p>Review the safe normalized metadata. The provider, capability, query timestamp and integrity basis are fixed by the trusted local service.</p><section class="osint-evidence-preview-provenance"><div><small>PROVIDER</small><strong>${this.escape(providerId)}</strong></div><div><small>CAPABILITY</small><strong>${this.escape(normalized.capability)}</strong></div><div><small>STATUS</small><strong>${this.escape(normalized.status)}</strong></div><div><small>QUERIED</small><strong>${this.escape(normalized.queriedAt)}</strong></div></section><label><span>TITLE</span><input class="aegis-input" name="title" value="${this.escape(title)}" maxlength="160" required></label><label><span>SUMMARY</span><textarea class="aegis-input" name="summary" maxlength="4000" required>${this.escape(normalized.summary || "")}</textarea></label><label><span>TAGS</span><input class="aegis-input" name="tags" maxlength="500" value="${entityResolution ? "entity, provenance" : geo ? "geospatial, verification" : infrastructure ? "domain, infrastructure" : research ? "research, source-verification" : "wayback, historical-archive"}"></label><label><span>NOTE · OPTIONAL</span><textarea class="aegis-input" name="note" maxlength="8000"></textarea></label><fieldset><legend>REDACT BEFORE LOCAL SAVE</legend>${redactions.map(([field, label]) => `<label><input type="checkbox" name="redactions" value="${field}"> ${label}</label>`).join("")}</fieldset><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="submit">CONFIRM SAVE EVIDENCE</button></footer></form>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-evidence-preview-form]").addEventListener("submit", async event => {
                event.preventDefault(); const form = new FormData(event.currentTarget);
                const response = await this.ipc.invoke("osint-evidence-create", {caseId, normalizedResult: normalized, draft: {title: form.get("title"), summary: form.get("summary"), tags: form.get("tags"), note: form.get("note"), redactions: form.getAll("redactions")}});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "EVIDENCE SAVE FAILED");
                close(); await this.openOSINTCaseById(caseId, {render: true, silent: true});
                if (this.osintAccess) this.osintAccess.recordAction(null, "EVIDENCE_SAVED", {state: "CASE", resultSummary: "Normalized provider result saved locally"});
                this.showToast(this.osintView, `EVIDENCE SAVED · ${response.evidence.id}`);
            });
        });
    }

    openOSINTManualEvidenceDialog(caseId, trigger = null) {
        this.openOSINTCaseDialog("ADD MANUAL EVIDENCE", `<form data-osint-manual-evidence-form><p>Record a local observation or a neutral web reference. This does not open, fetch or capture any remote content.</p><label><span>TYPE</span><select class="aegis-select" name="type"><option value="MANUAL_OBSERVATION">MANUAL OBSERVATION</option><option value="WEB_REFERENCE">WEB REFERENCE</option><option value="USER_NOTE">USER NOTE</option></select></label><label><span>TITLE</span><input class="aegis-input" name="title" maxlength="160" required></label><label><span>SUMMARY</span><textarea class="aegis-input" name="summary" maxlength="4000" required></textarea></label><label><span>REFERENCE URL · WEB REFERENCE ONLY</span><input class="aegis-input" name="sourceUrl" maxlength="2048" placeholder="https://example.org/"></label><label><span>TAGS</span><input class="aegis-input" name="tags" maxlength="500"></label><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="submit">SAVE MANUAL EVIDENCE</button></footer></form>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-manual-evidence-form]").addEventListener("submit", async event => {
                event.preventDefault(); const form = new FormData(event.currentTarget);
                const response = await this.ipc.invoke("osint-evidence-create", {caseId, manual: {type: form.get("type"), title: form.get("title"), summary: form.get("summary"), sourceUrl: form.get("sourceUrl"), tags: form.get("tags")}});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "MANUAL EVIDENCE SAVE FAILED");
                close(); await this.openOSINTCaseById(caseId, {render: true, silent: true}); this.showToast(this.osintView, `MANUAL EVIDENCE SAVED · ${response.evidence.id}`);
            });
        });
    }

    async openOSINTEvidenceDetail(caseId, evidenceId, trigger = null) {
        const response = await this.ipc.invoke("osint-evidence-read", {caseId, evidenceId});
        if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "EVIDENCE UNAVAILABLE");
        const evidence = response.evidence;
        this.openOSINTCaseDialog("EVIDENCE DETAIL", `<section class="osint-evidence-detail"><header class="osint-evidence-detail-header"><div><small>EVIDENCE OBJECT / LOCAL RECORD</small><strong>${this.escape(evidence.title)}</strong></div><span>${this.escape(this.formatOSINTEnum(evidence.integrity && evidence.integrity.status || "UNKNOWN"))}</span></header><p class="osint-evidence-summary">${this.escape(evidence.summary)}</p><div class="osint-detail-readout"><div><small>TYPE</small><strong>${this.escape(this.formatOSINTEnum(evidence.type))}</strong></div><div><small>PROVIDER</small><strong>${this.escape(evidence.providerName || "MANUAL")}</strong></div><div><small>CAPABILITY</small><strong>${this.escape(this.formatOSINTEnum(evidence.capability || "NOT_APPLICABLE"))}</strong></div><div><small>ACQUIRED</small><strong>${this.escape(evidence.acquisitionMethod)}</strong></div><div><small>QUERIED</small><strong>${this.escape(evidence.queriedAt || "NOT APPLICABLE")}</strong></div><div><small>CAPTURED</small><strong>${this.escape(evidence.capturedAt)}</strong></div><div><small>CONFIDENCE</small><strong>${this.escape(evidence.confidence)}</strong></div><div><small>LEGAL / RISK</small><strong>${this.escape(evidence.legalContext)} · ${this.escape(evidence.riskContext)}</strong></div></div><section class="osint-evidence-detail-section"><small>PROVENANCE</small><p>${this.escape(evidence.source && evidence.source.provider || "MANUAL")} · ${this.escape(evidence.source && evidence.source.type || "LOCAL")}</p></section><section class="osint-evidence-detail-section"><small>NORMALIZED DATA</small><p>${this.escape(JSON.stringify(evidence.data || {}))}</p></section><section class="osint-evidence-detail-section"><small>WARNINGS</small><p>${this.escape((evidence.warnings || []).join(" · ") || "NONE")}</p></section><section class="osint-evidence-detail-section"><small>REDACTIONS</small><p>${this.escape((evidence.redactions || []).map(item => item.field).join(" · ") || "NONE")}</p></section><section class="osint-evidence-detail-section"><small>INTEGRITY HASH</small><p>${this.escape(evidence.integrity && evidence.integrity.value || "NOT AVAILABLE")}</p>${evidence.integrity && evidence.integrity.status === "INVALID" ? `<p class="osint-panel-error">INTEGRITY INVALID — export remains available but is marked as damaged metadata.</p>` : ""}</section><form class="osint-evidence-note-form" data-osint-evidence-note-form data-osint-case-id="${this.escape(caseId)}" data-osint-evidence-id="${this.escape(evidenceId)}"><label><span>ADD EVIDENCE NOTE</span><textarea class="aegis-input" name="text" maxlength="${window.OSINTCaseModel ? window.OSINTCaseModel.LIMITS.note : 8000}" required></textarea></label><button type="submit">ADD NOTE</button></form><footer class="osint-evidence-detail-actions"><button type="button" data-osint-case-action="evidence-export-json" data-osint-case-id="${this.escape(caseId)}" data-osint-evidence-id="${this.escape(evidenceId)}">EXPORT JSON</button><button type="button" data-osint-case-action="evidence-export-markdown" data-osint-case-id="${this.escape(caseId)}" data-osint-evidence-id="${this.escape(evidenceId)}">EXPORT MARKDOWN</button><button type="button" data-osint-evidence-detail-verify>VERIFY INTEGRITY</button><button type="button" data-osint-case-dialog-close>CLOSE</button></footer></section>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-evidence-detail-verify]").addEventListener("click", async () => { await this.verifyOSINTEvidence(caseId, evidenceId); close(); });
            overlay.querySelectorAll("[data-osint-case-action]").forEach(button => button.addEventListener("click", () => this.handleOSINTCaseAction(button.dataset.osintCaseAction, button)));
            overlay.querySelector("[data-osint-evidence-note-form]").addEventListener("submit", async event => {
                event.preventDefault();
                const response = await this.ipc.invoke("osint-case-note-create", {caseId, evidenceId, text: new FormData(event.currentTarget).get("text"), tags: []});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "NOTE SAVE FAILED");
                close(); await this.refreshOSINTCases({readActive: true}); this.showToast(this.osintView, "EVIDENCE NOTE ADDED");
            });
        });
    }

    async verifyOSINTEvidence(caseId, evidenceId) {
        const response = await this.ipc.invoke("osint-evidence-verify", {caseId, evidenceId});
        if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "INTEGRITY CHECK FAILED");
        await this.refreshOSINTCases({readActive: true});
        if (this.osintAccess) this.osintAccess.recordAction(null, "EVIDENCE_VERIFIED", {state: "CASE", resultSummary: `Integrity ${response.evidence.integrity.status}`});
        this.showToast(this.osintView, `INTEGRITY · ${response.evidence.integrity.status}`);
        return response;
    }

    confirmOSINTEvidenceRemoval(caseId, evidenceId, trigger = null) {
        this.openOSINTCaseDialog("REMOVE EVIDENCE", `<p>Remove this evidence from the active case? This action deletes the local evidence file and cannot be undone in this phase.</p><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="button" data-osint-evidence-remove-confirm>REMOVE EVIDENCE</button></footer>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-evidence-remove-confirm]").addEventListener("click", async () => {
                const response = await this.ipc.invoke("osint-evidence-remove", {caseId, evidenceId, confirmation: true});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "EVIDENCE REMOVE FAILED");
                close(); await this.refreshOSINTCases({readActive: true}); this.showToast(this.osintView, "EVIDENCE REMOVED");
            });
        });
    }

    async submitOSINTCaseNote(form) {
        const caseId = form.dataset.osintCaseId;
        const text = form.querySelector("textarea[name='text']").value;
        const response = await this.ipc.invoke("osint-case-note-create", {caseId, text, tags: []});
        if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "NOTE SAVE FAILED");
        form.reset(); await this.refreshOSINTCases({readActive: true});
        if (this.osintAccess) this.osintAccess.recordAction(null, "CASE_NOTE_ADDED", {state: "CASE", resultSummary: "Local case note added"});
        this.showToast(this.osintView, "CASE NOTE ADDED");
    }

    openOSINTEditNoteDialog(caseId, noteId, trigger = null) {
        const active = this.osintCaseState && this.osintCaseState.activeCase;
        const note = active && (active.notes || []).find(item => item.id === noteId);
        if (!note) return;
        this.openOSINTCaseDialog("EDIT NOTE", `<form data-osint-edit-note-form><label><span>NOTE</span><textarea class="aegis-input" name="text" maxlength="${window.OSINTCaseModel ? window.OSINTCaseModel.LIMITS.note : 8000}" required>${this.escape(note.text)}</textarea></label><label><span>TAGS</span><input class="aegis-input" name="tags" maxlength="500" value="${this.escape((note.tags || []).join(", "))}"></label><footer><button type="button" data-osint-case-dialog-close>CANCEL</button><button type="submit">SAVE NOTE</button></footer></form>`, trigger, (overlay, close) => {
            overlay.querySelectorAll("[data-osint-case-dialog-close]").forEach(button => button.addEventListener("click", close));
            overlay.querySelector("[data-osint-edit-note-form]").addEventListener("submit", async event => {
                event.preventDefault(); const form = new FormData(event.currentTarget);
                const response = await this.ipc.invoke("osint-case-note-update", {caseId, noteId, patch: {text: form.get("text"), tags: form.get("tags")}});
                if (!response || !response.ok) return this.showToast(this.osintView, response && response.message || "NOTE UPDATE FAILED");
                close(); await this.refreshOSINTCases({readActive: true}); this.showToast(this.osintView, "NOTE UPDATED");
            });
        });
    }

    async exportOSINTCase(caseId, format) {
        const response = await this.ipc.invoke("osint-case-export", {caseId, format});
        if (!response || !response.ok) return this.showToast(this.osintView, response && response.code === "EXPORT_CANCELLED" ? "EXPORT CANCELLED" : response && response.message || "EXPORT FAILED");
        await this.refreshOSINTCases({readActive: true});
        if (this.osintAccess) this.osintAccess.recordAction(null, "CASE_EXPORT_CREATED", {state: "CASE", resultSummary: `Local ${format} export created`});
        this.showToast(this.osintView, response.warning === "INTEGRITY_INVALID" ? `CASE EXPORTED AS DAMAGED METADATA · ${response.fileName}` : `CASE EXPORTED · ${response.fileName}`);
        return response;
    }

    async exportOSINTEvidence(caseId, evidenceId, format) {
        const response = await this.ipc.invoke("osint-evidence-export", {caseId, evidenceId, format});
        if (!response || !response.ok) return this.showToast(this.osintView, response && response.code === "EXPORT_CANCELLED" ? "EXPORT CANCELLED" : response && response.message || "EVIDENCE EXPORT FAILED");
        await this.refreshOSINTCases({readActive: true});
        this.showToast(this.osintView, response.warning === "INTEGRITY_INVALID" ? `EVIDENCE EXPORTED AS DAMAGED METADATA · ${response.fileName}` : `EVIDENCE EXPORTED · ${response.fileName}`);
        return response;
    }

    renderStudent(view, definition) {
        if (!this.studCommandCenter) this.studCommandCenter = new StudCommandCenter({ipc: this.ipc, escape: value => this.escape(value), showToast: (target, message) => this.showToast(target, message)});
        this.studCommandCenter.mount(view, definition);
    }

    studentEntityLabel(entity) {
        if (!entity) return "NO SELECTION";
        return entity.title || entity.prompt || "ACADEMIC OBJECT";
    }

    async refreshStudentCore(options = {}) {
        const view = this.studentView;
        const state = this.studentState;
        if (!view || !state) return;
        try {
            const [status, courses, assignments, notes, resources] = await Promise.all([
                this.ipc.invoke("stud-core-status"),
                this.ipc.invoke("stud-entity-list", {entityType: "COURSE", limit: 100}),
                this.ipc.invoke("stud-entity-list", {entityType: "ASSIGNMENT", courseId: state.selectedCourseId || undefined, limit: 200}),
                this.ipc.invoke("stud-entity-list", {entityType: "NOTE", courseId: state.selectedCourseId || undefined, limit: 50}),
                this.ipc.invoke("stud-entity-list", {entityType: "RESOURCE", limit: 50})
            ]);
            if (![status, courses, assignments, notes, resources].every(response => response && response.ok)) {
                throw new Error([status, courses, assignments, notes, resources].find(response => !response || !response.ok)?.message || "Academic store unavailable.");
            }
            state.schema = status.data;
            state.courses = courses.data;
            state.assignments = assignments.data;
            state.notes = notes.data;
            state.resources = resources.data;
            if (state.selectedCourseId && !state.courses.some(course => course.id === state.selectedCourseId)) state.selectedCourseId = "";
            if (state.selectedAssignmentId && !state.assignments.some(item => item.id === state.selectedAssignmentId)) state.selectedAssignmentId = "";
            if (options.selectCourseId) state.selectedCourseId = options.selectCourseId;
            if (options.selectAssignmentId) state.selectedAssignmentId = options.selectAssignmentId;
            state.error = null;
            await this.refreshStudentSelection();
        } catch (error) {
            state.error = error.message || "Academic store unavailable.";
            this.renderStudentState();
        }
    }

    async refreshStudentSelection() {
        const state = this.studentState;
        if (!state) return;
        const selected = state.selectedAssignmentId
            ? {entityType: "ASSIGNMENT", entityId: state.selectedAssignmentId}
            : state.selectedCourseId ? {entityType: "COURSE", entityId: state.selectedCourseId} : null;
        if (!selected) {
            state.selectedEntity = null;
            state.selectedEntityType = "";
            state.provenance = [];
            state.relationships = [];
            this.renderStudentState();
            return;
        }
        const [entity, provenance, relationships] = await Promise.all([
            this.ipc.invoke("stud-entity-read", selected),
            this.ipc.invoke("stud-provenance-list", selected),
            this.ipc.invoke("stud-relationship-list", selected)
        ]);
        state.selectedEntity = entity && entity.ok ? entity.data : null;
        state.selectedEntityType = state.selectedEntity ? selected.entityType : "";
        state.provenance = provenance && provenance.ok ? provenance.data : [];
        state.relationships = relationships && relationships.ok ? relationships.data : [];
        this.renderStudentState();
    }

    renderStudentState() {
        const view = this.studentView;
        const state = this.studentState;
        if (!view || !state) return;
        const setText = (selector, value) => { const node = view.querySelector(selector); if (node) node.innerText = value; };
        setText("[data-stud-status]", state.error ? "STORE ERROR" : "LOCAL / READY");
        setText("[data-stud-schema]", state.schema ? `SCHEMA V${state.schema.version} · WAL` : "SCHEMA —");
        setText("[data-stud-course-count]", `${state.courses.length} LOCAL`);
        setText("[data-stud-assignment-count]", `${state.assignments.length} LOCAL`);
        const courseOptions = [`<option value="">NO COURSE / UNFILTERED</option>`, ...state.courses.map(course => `<option value="${this.escape(course.id)}"${course.id === state.selectedCourseId ? " selected" : ""}>${this.escape(course.code ? `${course.code} · ${course.title}` : course.title)}</option>`)].join("");
        const courses = view.querySelector('[data-stud-panel="courses"]');
        const assignments = view.querySelector('[data-stud-panel="assignments"]');
        const detail = view.querySelector('[data-stud-panel="detail"]');
        const search = view.querySelector('[data-stud-panel="search"]');
        const references = view.querySelector('[data-stud-panel="references"]');
        if (courses) courses.innerHTML = `
            <form class="stud-form" data-stud-form="course-create"><label>TITLE<input class="aegis-input" name="title" maxlength="240" required placeholder="Course or module title"></label><div class="stud-field-row"><label>CODE<input class="aegis-input" name="code" maxlength="80" placeholder="Optional"></label><label>STATUS<select class="aegis-select" name="status"><option>ACTIVE</option><option>COMPLETED</option></select></label></div><label>DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000" placeholder="Optional local context"></textarea></label><button type="submit">CREATE COURSE</button></form>
            <div class="stud-list">${state.courses.length ? state.courses.map(course => `<button type="button" class="stud-list-row${course.id === state.selectedCourseId ? " selected" : ""}" data-stud-select-course="${this.escape(course.id)}"><strong>${this.escape(course.title)}</strong><small>${this.escape(course.code || "NO CODE")} · ${this.escape(course.status)}</small></button>`).join("") : `<div class="workspace-empty">NO LOCAL COURSES YET</div>`}</div>`;
        if (assignments) assignments.innerHTML = `
            <form class="stud-form" data-stud-form="assignment-create"><label>COURSE<select class="aegis-select" name="courseId">${courseOptions}</select></label><label>TITLE<input class="aegis-input" name="title" maxlength="240" required placeholder="Assignment title"></label><div class="stud-field-row"><label>DUE DATE<input class="aegis-input" name="dueDate" type="datetime-local"></label><label>STATUS<select class="aegis-select" name="status"><option>NOT_STARTED</option><option>IN_PROGRESS</option><option>SUBMITTED</option></select></label></div><label>DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000" placeholder="Optional brief"></textarea></label><button type="submit">CREATE ASSIGNMENT</button></form>
            <div class="stud-list">${state.assignments.length ? state.assignments.map(item => `<button type="button" class="stud-list-row${item.id === state.selectedAssignmentId ? " selected" : ""}" data-stud-select-assignment="${this.escape(item.id)}"><strong>${this.escape(item.title)}</strong><small>${this.escape(item.dueDate ? new Date(item.dueDate).toLocaleString() : "NO DEADLINE")} · ${this.escape(item.status)}</small></button>`).join("") : `<div class="workspace-empty">${state.selectedCourseId ? "NO ASSIGNMENTS FOR SELECTED COURSE" : "NO LOCAL ASSIGNMENTS YET"}</div>`}</div>`;
        const entity = state.selectedEntity;
        const provenanceMarkup = state.provenance.length ? state.provenance.slice(0, 8).map(record => `<li><strong>${this.escape(record.field)}</strong><span>${this.escape(record.sourceType)} / ${this.escape(record.sourceAuthority)}</span><small>${this.escape(record.observedValue || "VALUE NOT CAPTURED")}</small></li>`).join("") : "<li><span>NO FIELD OBSERVATIONS YET</span></li>";
        const attachmentMarkup = entity ? `<section class="stud-attach"><small>ATTACH LOCAL CONTEXT</small><form class="stud-form compact" data-stud-form="note-create" data-stud-entity-type="${this.escape(state.selectedEntityType)}" data-stud-entity-id="${this.escape(entity.id)}"><label>NOTE TITLE<input class="aegis-input" name="title" maxlength="240" required></label><label>NOTE CONTENT<textarea class="aegis-input" name="content" maxlength="40000"></textarea></label><button type="submit">CREATE + LINK NOTE</button></form><form class="stud-form compact" data-stud-form="resource-create" data-stud-entity-type="${this.escape(state.selectedEntityType)}" data-stud-entity-id="${this.escape(entity.id)}"><div class="stud-field-row"><label>RESOURCE TITLE<input class="aegis-input" name="title" maxlength="240" required></label><label>TYPE<select class="aegis-select" name="type"><option>REFERENCE</option><option>LINK</option><option>DOCUMENT</option></select></label></div><label>URL / SAFE REFERENCE<input class="aegis-input" name="url" maxlength="2048" placeholder="Optional; no automatic opening"></label><button type="submit">CREATE + LINK RESOURCE</button></form></section>` : "";
        if (detail) detail.innerHTML = entity ? `
            <div class="stud-detail-title"><small>${this.escape(state.selectedEntityType)}</small><strong>${this.escape(this.studentEntityLabel(entity))}</strong><span>${this.escape(entity.status || entity.submissionStatus || "LOCAL RECORD")}</span></div>
            <form class="stud-form compact" data-stud-form="entity-update" data-stud-entity-type="${this.escape(state.selectedEntityType)}" data-stud-entity-id="${this.escape(entity.id)}"><label>TITLE<input class="aegis-input" name="title" value="${this.escape(entity.title || "")}" maxlength="240" required></label>${state.selectedEntityType === "ASSIGNMENT" ? `<label>DUE DATE<input class="aegis-input" name="dueDate" type="datetime-local" value="${entity.dueDate ? this.escape(entity.dueDate.slice(0, 16)) : ""}"></label><label>STATUS<select class="aegis-select" name="status">${["NOT_STARTED","IN_PROGRESS","SUBMITTED","GRADED"].map(status => `<option${entity.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></label>` : `<label>DESCRIPTION<textarea class="aegis-input" name="description" maxlength="12000">${this.escape(entity.description || "")}</textarea></label>`}<button type="submit">SAVE LOCAL EDIT</button></form>
            <section class="stud-provenance"><header><small>FIELD-LEVEL PROVENANCE</small></header><ul>${provenanceMarkup}</ul><form class="stud-form compact" data-stud-form="provenance-create" data-stud-entity-type="${this.escape(state.selectedEntityType)}" data-stud-entity-id="${this.escape(entity.id)}"><div class="stud-field-row"><label>FIELD<input class="aegis-input" name="field" maxlength="100" value="${state.selectedEntityType === "ASSIGNMENT" ? "dueDate" : "title"}" required></label><label>OBSERVED VALUE<input class="aegis-input" name="observedValue" maxlength="40000"></label></div><button type="submit">ADD USER OBSERVATION</button></form></section>
            <section class="stud-relations"><small>RELATIONSHIPS · ${state.relationships.length}</small><p>${state.relationships.length ? state.relationships.slice(0, 4).map(relation => `${relation.relationType} → ${relation.fromId === entity.id ? relation.toType : relation.fromType}`).join(" · ") : "Calendar and Email remain external references: linking is explicit and does not copy event or message content."}</p></section>${attachmentMarkup}` : `<div class="workspace-empty">SELECT A COURSE OR ASSIGNMENT TO INSPECT FIELD-LEVEL PROVENANCE.</div>`;
        if (search) search.innerHTML = `
            <form class="stud-search-form" data-stud-form="search"><input class="aegis-input" name="query" maxlength="240" placeholder="Search courses, assignments, resources, papers and notes"><select class="aegis-select" name="courseId">${courseOptions}</select><button type="submit">SEARCH</button></form>
            <div class="stud-search-results">${state.searchResults.length ? state.searchResults.map(item => `<button type="button" data-stud-search-select="${this.escape(item.entityId)}" data-stud-search-type="${this.escape(item.entityType)}"><strong>${this.escape(item.title)}</strong><small>${this.escape(item.entityType.replace(/_/g, " "))} · ${this.escape(item.snippet || "MATCH")}</small></button>`).join("") : `<small>FTS5 indexes local course, assignment, resource, paper and note text only.</small>`}</div>`;
        if (references) references.innerHTML = `<div class="stud-reference-grid"><section><small>CALENDAR</small><strong>REFERENCE ONLY</strong><p>Relationships can retain a bounded event identifier. STUD does not copy calendars or create deadlines.</p></section><section><small>EMAIL</small><strong>REFERENCE ONLY</strong><p>Relationships can retain a message reference. STUD never copies mailbox bodies, credentials or OAuth data.</p></section><section><small>ECONOMICS</small><strong>LOCAL CORE</strong><p>Canonical academic work remains free and offline. Future services declare cost model explicitly.</p></section></div>`;
        this.bindStudentCore(view);
    }

    bindStudentCore(view) {
        if (!view || view.dataset.studCoreBound) return;
        view.dataset.studCoreBound = "true";
        view.addEventListener("click", event => {
            const course = event.target.closest("[data-stud-select-course]");
            const assignment = event.target.closest("[data-stud-select-assignment]");
            const result = event.target.closest("[data-stud-search-select]");
            if (course) { this.studentState.selectedCourseId = course.dataset.studSelectCourse; this.studentState.selectedAssignmentId = ""; this.refreshStudentCore(); }
            if (assignment) { this.studentState.selectedAssignmentId = assignment.dataset.studSelectAssignment; this.refreshStudentSelection(); }
            if (result) { this.openStudentSearchEntity(result.dataset.studSearchType, result.dataset.studSearchSelect); }
        });
        view.addEventListener("submit", event => this.handleStudentForm(event));
    }

    async openStudentSearchEntity(entityType, entityId) {
        if (entityType === "COURSE") { this.studentState.selectedCourseId = entityId; this.studentState.selectedAssignmentId = ""; await this.refreshStudentCore(); return; }
        if (entityType === "ASSIGNMENT") { this.studentState.selectedAssignmentId = entityId; await this.refreshStudentSelection(); return; }
        this.showToast(this.studentView, "RESULT AVAILABLE IN CANONICAL STORE");
    }

    async handleStudentForm(event) {
        const form = event.target.closest("form[data-stud-form]");
        if (!form) return;
        event.preventDefault();
        const kind = form.dataset.studForm;
        const value = Object.fromEntries(new FormData(form).entries());
        if (value.dueDate) value.dueDate = new Date(value.dueDate).toISOString();
        try {
            if (kind === "course-create") {
                const response = await this.ipc.invoke("stud-entity-create", {entityType: "COURSE", value, provenance: {field: "title", observedValue: value.title, sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}});
                if (!response || !response.ok) throw new Error(response && response.message || "Course creation failed.");
                this.studentState.selectedCourseId = response.data.id;
                this.studentState.selectedAssignmentId = "";
                await this.refreshStudentCore();
                this.showToast(this.studentView, "COURSE CREATED LOCALLY");
            } else if (kind === "assignment-create") {
                const response = await this.ipc.invoke("stud-entity-create", {entityType: "ASSIGNMENT", value, provenance: {field: "title", observedValue: value.title, sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}});
                if (!response || !response.ok) throw new Error(response && response.message || "Assignment creation failed.");
                this.studentState.selectedAssignmentId = response.data.id;
                if (response.data.courseId) this.studentState.selectedCourseId = response.data.courseId;
                await this.refreshStudentCore();
                this.showToast(this.studentView, "ASSIGNMENT CREATED LOCALLY");
            } else if (kind === "entity-update") {
                const response = await this.ipc.invoke("stud-entity-update", {entityType: form.dataset.studEntityType, entityId: form.dataset.studEntityId, value});
                if (!response || !response.ok) throw new Error(response && response.message || "Academic update failed.");
                await this.refreshStudentCore();
                this.showToast(this.studentView, "LOCAL EDIT SAVED");
            } else if (kind === "provenance-create") {
                const response = await this.ipc.invoke("stud-provenance-create", {entityType: form.dataset.studEntityType, entityId: form.dataset.studEntityId, field: value.field, observedValue: value.observedValue || null, sourceType: "USER", sourceAuthority: "AUTHORITATIVE"});
                if (!response || !response.ok) throw new Error(response && response.message || "Provenance save failed.");
                await this.refreshStudentSelection();
                this.showToast(this.studentView, "FIELD OBSERVATION SAVED");
            } else if (kind === "note-create") {
                const selected = this.studentState.selectedEntity;
                const courseId = form.dataset.studEntityType === "COURSE" ? form.dataset.studEntityId : selected && selected.courseId || "";
                const response = await this.ipc.invoke("stud-entity-create", {entityType: "NOTE", value: {...value, courseId: courseId || undefined}});
                if (!response || !response.ok) throw new Error(response && response.message || "Note creation failed.");
                const linked = await this.ipc.invoke("stud-relationship-create", {fromType: form.dataset.studEntityType, fromId: form.dataset.studEntityId, relationType: "HAS_NOTE", toType: "NOTE", toId: response.data.id, source: "USER"});
                if (!linked || !linked.ok) throw new Error(linked && linked.message || "Note link failed.");
                await this.refreshStudentCore();
                this.showToast(this.studentView, "NOTE CREATED AND LINKED");
            } else if (kind === "resource-create") {
                const selected = this.studentState.selectedEntity;
                const resourceValue = {...value};
                if (form.dataset.studEntityType === "COURSE") resourceValue.courseId = form.dataset.studEntityId;
                if (form.dataset.studEntityType === "ASSIGNMENT") { resourceValue.assignmentId = form.dataset.studEntityId; resourceValue.courseId = selected && selected.courseId || undefined; }
                const response = await this.ipc.invoke("stud-entity-create", {entityType: "RESOURCE", value: resourceValue});
                if (!response || !response.ok) throw new Error(response && response.message || "Resource creation failed.");
                const linked = await this.ipc.invoke("stud-relationship-create", {fromType: form.dataset.studEntityType, fromId: form.dataset.studEntityId, relationType: "HAS_RESOURCE", toType: "RESOURCE", toId: response.data.id, source: "USER"});
                if (!linked || !linked.ok) throw new Error(linked && linked.message || "Resource link failed.");
                await this.refreshStudentCore();
                this.showToast(this.studentView, "RESOURCE CREATED AND LINKED");
            } else if (kind === "search") {
                const response = await this.ipc.invoke("stud-search", {query: value.query, options: {courseId: value.courseId || undefined, limit: 30}});
                if (!response || !response.ok) throw new Error(response && response.message || "Search unavailable.");
                this.studentState.searchResults = response.data;
                this.renderStudentState();
            }
        } catch (error) { this.showToast(this.studentView, error.message || "STUD OPERATION FAILED"); }
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
        return response;
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
