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
    }

    escape(value) {
        return window._escapeHtml(String(value || ""));
    }

    buildNavigation() {
        this.navigation.setAttribute("aria-label", "Workspace modes");
        this.definitions.forEach((definition, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workspace-nav-button";
            button.dataset.workspace = definition.id;
            button.setAttribute("aria-controls", definition.preserveExistingView
                ? this.hub.id
                : `workspace_${definition.id}`);
            button.title = `${definition.name} · ⌘⌥${index + 1}`;
            button.innerHTML = `
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${this.escape(definition.navigationLabel)}</strong>`;
            button.addEventListener("click", () => this.activate(definition.id));
            this.navigation.appendChild(button);
        });
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
            const index = Number(event.key) - 1;
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
        });

        if (!definition.preserveExistingView && !this.rendered.has(workspaceId)) {
            this.renderWorkspace(definition);
            this.rendered.add(workspaceId);
        }

        document.body.dataset.workspace = workspaceId;
        localStorage.setItem("edexui-eng-active-workspace", workspaceId);
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
            const panel = this.createPanel(widget, "");
            panel.querySelector(".workspace-panel-content").innerHTML = `
                <div class="workspace-placeholder">
                    <span>${this.escape(widget.status || "future")}</span>
                    <strong>${this.escape(widget.name)}</strong>
                    <p>Module boundary defined and ready for a future integration.</p>
                </div>`;
            grid.appendChild(panel);
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

    createActionButton(action, view, prominent) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `workspace-action ${prominent ? "prominent" : ""}`.trim();
        button.innerHTML = `
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
        this.showToast(view, response.ok ? "OPENED IN DEFAULT BROWSER" : response.error);
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
            this.showToast(view, `${action.label} IS NOT INSTALLED`);
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
