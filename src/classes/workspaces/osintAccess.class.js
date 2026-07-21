(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OsintAccessController = exported.OsintAccessController;
})(typeof window !== "undefined" ? window : null, function() {
    class OsintAccessController {
        constructor(options = {}) {
            this.ipc = options.ipc || require("electron").ipcRenderer;
            this.registry = options.registry || (typeof window !== "undefined" ? window.OsintToolsRegistry : null);
            this.escape = options.escape || (value => String(value || ""));
            this.activeCategory = "discovery";
            this.embeddedTool = null;
            this.view = null;
            this.resizeObserver = null;
            this.nativeReturnFocus = null;
            this.embeddedReturnFocus = null;
            this.boundResize = () => this.syncEmbeddedBounds();
            this.boundKeydown = event => {
                if (event.key !== "Escape") return;
                if (this.isEmbeddedOpen()) this.closeEmbedded();
                else if (this.isNativeOpen()) this.closeNative();
            };
            this.ipc.on("osint-source-event", (_event, payload = {}) => this.handleSourceEvent(payload));
            window.addEventListener("keydown", this.boundKeydown);
        }

        getTool(toolId) {
            return this.registry && this.registry.getTool ? this.registry.getTool(toolId) : null;
        }

        getTools() {
            return this.registry && this.registry.getToolsForCategory
                ? this.registry.getToolsForCategory(this.activeCategory)
                : [];
        }

        render(view) {
            this.view = view;
            view.classList.add("osint-analyst-deck");
            view.innerHTML = `
                <header class="osint-command-header">
                    <div>
                        <span>WORKSPACE / OSINT / PUBLIC-SOURCE ACCESS</span>
                        <h1>OSINT / ANALYST DECK</h1>
                        <p>Native provider results where available. Remote sources open in an isolated AegisUi surface with no suite privileges.</p>
                    </div>
                    <div class="osint-command-status">
                        <small>ACCESS FOUNDATION</small>
                        <strong>DISCOVERY / SEARCH</strong>
                        <span data-osint-tool-count>0 SOURCES READY</span>
                    </div>
                </header>
                <section class="osint-category-rail" aria-label="OSINT domains"></section>
                <section class="osint-discovery-stage">
                    <aside class="osint-stage-brief">
                        <span>ACTIVE DOMAIN / 01</span>
                        <h2>DISCOVERY / SEARCH</h2>
                        <p>Start with an explicit query, select an authorised public source and keep source context visible.</p>
                        <dl>
                            <div><dt>NATIVE</dt><dd>1 PROVIDER</dd></div>
                            <div><dt>ISOLATED</dt><dd>8 WEB SOURCES</dd></div>
                            <div><dt>PRIVILEGES</dt><dd>NONE</dd></div>
                        </dl>
                        <small>Automatic collection, credential capture and intrusive actions are not part of this workspace.</small>
                    </aside>
                    <section class="osint-tool-grid" aria-label="Discovery and search tools"></section>
                </section>
                <section class="osint-source-overlay" aria-hidden="true">
                    <header>
                        <div>
                            <span data-osint-embed-mode>ISOLATED WEB SOURCE</span>
                            <strong data-osint-embed-title>OSINT SOURCE</strong>
                            <small data-osint-embed-status>READY</small>
                        </div>
                        <div class="osint-source-controls">
                            <button type="button" data-osint-source-action="reload">RELOAD</button>
                            <button type="button" data-osint-source-action="external">OPEN BROWSER</button>
                            <button type="button" data-osint-source-action="close" aria-label="Close source view">×</button>
                        </div>
                    </header>
                    <div class="osint-embed-host" data-osint-embed-host>
                        <div class="osint-embed-loading">OPENING ISOLATED SOURCE</div>
                    </div>
                </section>
                <section class="osint-native-overlay" aria-hidden="true">
                    <article>
                        <header>
                            <div><span>NATIVE OSINT PROVIDER</span><h2 data-osint-native-title>PROVIDER</h2></div>
                            <button type="button" data-osint-native-action="close" aria-label="Close native provider">×</button>
                        </header>
                        <p data-osint-native-description></p>
                        <form data-osint-native-form>
                            <label><span data-osint-native-query-label>QUERY</span><input class="aegis-input" name="query" autocomplete="off" required></label>
                            <button type="submit" class="osint-native-run">RUN QUERY</button>
                        </form>
                        <section class="osint-native-result" data-osint-native-result>
                            <span>READY FOR A USER-DIRECTED QUERY</span>
                        </section>
                    </article>
                </section>`;

            this.renderCategoryRail();
            this.renderTools();
            this.bind(view);
        }

        renderCategoryRail() {
            const rail = this.view && this.view.querySelector(".osint-category-rail");
            if (!rail || !this.registry) return;
            rail.innerHTML = this.registry.CATEGORIES.map(category => `
                <button type="button" class="osint-category ${category.id === this.activeCategory ? "active" : ""} ${category.status !== "PHASE 1" ? "planned" : ""}" data-osint-category="${this.escape(category.id)}">
                    <span>${this.escape(category.icon)}</span>
                    <strong>${this.escape(category.title)}</strong>
                    <small>${this.escape(category.status)}</small>
                </button>`).join("");
        }

        renderTools() {
            const grid = this.view && this.view.querySelector(".osint-tool-grid");
            if (!grid) return;
            const tools = this.getTools();
            const count = this.view.querySelector("[data-osint-tool-count]");
            if (count) count.textContent = `${tools.length} SOURCES READY`;
            grid.innerHTML = tools.map(tool => {
                const native = tool.accessMode === "native_api";
                return `
                    <article class="osint-tool-card ${native ? "native" : "embedded"}" data-osint-tool-card="${this.escape(tool.id)}">
                        <header><span>${native ? "API" : "WEB"}</span><em>${this.escape(tool.status)}</em></header>
                        <h3>${this.escape(tool.title)}</h3>
                        <p>${this.escape(tool.description)}</p>
                        <div class="osint-tool-tags">${(tool.tags || []).map(tag => `<i>${this.escape(tag)}</i>`).join("")}</div>
                        <footer>
                            <button type="button" data-osint-open="${this.escape(tool.id)}">${native ? "OPEN NATIVE" : "OPEN IN AEGIS"}</button>
                            ${!native ? `<button type="button" data-osint-browser="${this.escape(tool.id)}">BROWSER</button>` : ""}
                        </footer>
                    </article>`;
            }).join("");
        }

        bind(view) {
            view.addEventListener("click", event => {
                const category = event.target.closest("[data-osint-category]");
                if (category) {
                    if (category.classList.contains("planned")) return;
                    this.activeCategory = category.dataset.osintCategory;
                    this.renderCategoryRail();
                    this.renderTools();
                    return;
                }
                const open = event.target.closest("[data-osint-open]");
                if (open) {
                    this.nativeReturnFocus = open;
                    this.embeddedReturnFocus = open;
                    this.openTool(open.dataset.osintOpen);
                }
                const browser = event.target.closest("[data-osint-browser]");
                if (browser) this.openBrowser(this.getTool(browser.dataset.osintBrowser));
                const sourceAction = event.target.closest("[data-osint-source-action]");
                if (sourceAction) this.handleSourceAction(sourceAction.dataset.osintSourceAction);
                if (event.target.closest("[data-osint-native-action='close']")) this.closeNative();
            });

            const form = view.querySelector("[data-osint-native-form]");
            form.addEventListener("submit", event => {
                event.preventDefault();
                const query = new FormData(form).get("query");
                this.runNativeQuery(query);
            });
        }

        async openTool(toolId) {
            const tool = this.getTool(toolId);
            if (!tool) return;
            if (tool.accessMode === "native_api") return this.openNative(tool);
            return this.openEmbedded(tool);
        }

        async openBrowser(tool) {
            if (!tool || !tool.url) return;
            await this.ipc.invoke("workspace-open-link", tool.url);
        }

        openNative(tool) {
            this.nativeTool = tool;
            const overlay = this.view.querySelector(".osint-native-overlay");
            overlay.classList.add("visible");
            overlay.setAttribute("aria-hidden", "false");
            overlay.querySelector("[data-osint-native-title]").textContent = tool.title;
            overlay.querySelector("[data-osint-native-description]").textContent = tool.description;
            overlay.querySelector("[data-osint-native-query-label]").textContent = tool.query.label;
            const input = overlay.querySelector("input[name='query']");
            input.placeholder = tool.query.placeholder;
            overlay.querySelector(".osint-native-run").textContent = tool.query.button;
            overlay.querySelector("[data-osint-native-result]").innerHTML = "<span>READY FOR A USER-DIRECTED QUERY</span>";
            requestAnimationFrame(() => input.focus());
        }

        isNativeOpen() {
            return Boolean(this.view && this.view.querySelector(".osint-native-overlay.visible"));
        }

        closeNative() {
            const overlay = this.view && this.view.querySelector(".osint-native-overlay");
            if (!overlay) return;
            overlay.classList.remove("visible");
            overlay.setAttribute("aria-hidden", "true");
            this.nativeTool = null;
            if (this.nativeReturnFocus && this.nativeReturnFocus.isConnected) this.nativeReturnFocus.focus();
            this.nativeReturnFocus = null;
        }

        async runNativeQuery(query) {
            if (!this.nativeTool) return;
            const result = this.view.querySelector("[data-osint-native-result]");
            const button = this.view.querySelector(".osint-native-run");
            const value = String(query || "").trim();
            if (!value) return;
            button.disabled = true;
            result.innerHTML = "<span>QUERYING PUBLIC PROVIDER…</span>";
            try {
                const response = await this.ipc.invoke("osint-native-query", {
                    providerId: this.nativeTool.providerId,
                    query: value
                });
                if (!response.ok) throw new Error(response.error || response.status || "Provider query failed.");
                const data = response.data || {};
                if (!data.available) {
                    result.innerHTML = `<strong>NO SNAPSHOT FOUND</strong><p>${this.escape(data.message || "No public snapshot is available for this URL.")}</p>`;
                    return;
                }
                result.innerHTML = `
                    <strong>SNAPSHOT AVAILABLE</strong>
                    <dl>
                        <div><dt>STATUS</dt><dd>${this.escape(data.status || "AVAILABLE")}</dd></div>
                        <div><dt>TIMESTAMP</dt><dd>${this.escape(data.timestamp || "UNKNOWN")}</dd></div>
                        <div><dt>SOURCE</dt><dd>INTERNET ARCHIVE</dd></div>
                    </dl>
                    <button type="button" data-osint-snapshot="${this.escape(data.snapshotUrl || "")}">OPEN SNAPSHOT IN BROWSER</button>`;
                const snapshotButton = result.querySelector("[data-osint-snapshot]");
                if (snapshotButton) snapshotButton.addEventListener("click", () => this.openSnapshot(snapshotButton.dataset.osintSnapshot));
            } catch (error) {
                result.innerHTML = `<strong>PROVIDER UNAVAILABLE</strong><p>${this.escape(error.message || "The native provider did not return a result.")}</p>`;
            } finally {
                button.disabled = false;
            }
        }

        async openSnapshot(snapshotUrl) {
            if (!snapshotUrl) return;
            await this.ipc.invoke("workspace-open-link", snapshotUrl);
        }

        async openEmbedded(tool) {
            const overlay = this.view.querySelector(".osint-source-overlay");
            overlay.classList.add("visible");
            overlay.setAttribute("aria-hidden", "false");
            overlay.querySelector("[data-osint-embed-title]").textContent = tool.title;
            overlay.querySelector("[data-osint-embed-status]").textContent = "OPENING ISOLATED SOURCE";
            overlay.querySelector(".osint-embed-host").innerHTML = "<div class='osint-embed-loading'>OPENING ISOLATED SOURCE</div>";
            this.embeddedTool = tool;
            this.observeEmbedHost();
            const response = await this.ipc.invoke("osint-source-open", tool.id);
            if (!response.ok) {
                overlay.querySelector("[data-osint-embed-status]").textContent = response.status || "SOURCE UNAVAILABLE";
                overlay.querySelector(".osint-embed-host").innerHTML = `<div class='osint-embed-loading error'>${this.escape(response.error || "Cannot open this source inside AegisUi.")}</div>`;
                return;
            }
            requestAnimationFrame(() => this.syncEmbeddedBounds());
        }

        isEmbeddedOpen() {
            return Boolean(this.view && this.view.querySelector(".osint-source-overlay.visible"));
        }

        observeEmbedHost() {
            const host = this.view.querySelector("[data-osint-embed-host]");
            if (!host || typeof ResizeObserver === "undefined") return;
            if (this.resizeObserver) this.resizeObserver.disconnect();
            this.resizeObserver = new ResizeObserver(this.boundResize);
            this.resizeObserver.observe(host);
            window.addEventListener("resize", this.boundResize);
        }

        async syncEmbeddedBounds() {
            if (!this.embeddedTool || !this.isEmbeddedOpen()) return;
            const host = this.view.querySelector("[data-osint-embed-host]");
            if (!host) return;
            const rect = host.getBoundingClientRect();
            if (rect.width < 20 || rect.height < 20) return;
            await this.ipc.invoke("osint-source-layout", {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            });
        }

        async handleSourceAction(action) {
            if (action === "close") return this.closeEmbedded();
            if (action === "reload") return this.ipc.invoke("osint-source-reload");
            if (action === "external" && this.embeddedTool) return this.openBrowser(this.embeddedTool);
        }

        async closeEmbedded() {
            if (this.resizeObserver) this.resizeObserver.disconnect();
            this.resizeObserver = null;
            window.removeEventListener("resize", this.boundResize);
            const overlay = this.view && this.view.querySelector(".osint-source-overlay");
            if (overlay) {
                overlay.classList.remove("visible");
                overlay.setAttribute("aria-hidden", "true");
            }
            this.embeddedTool = null;
            if (this.embeddedReturnFocus && this.embeddedReturnFocus.isConnected) this.embeddedReturnFocus.focus();
            this.embeddedReturnFocus = null;
            await this.ipc.invoke("osint-source-close").catch(() => {});
        }

        handleSourceEvent(payload = {}) {
            if (!this.embeddedTool || payload.sourceId !== this.embeddedTool.id || !this.view) return;
            const status = this.view.querySelector("[data-osint-embed-status]");
            const host = this.view.querySelector(".osint-embed-host");
            if (status && payload.status) status.textContent = payload.status;
            if (host && payload.status === "READY") host.innerHTML = "";
            if (host && payload.status === "ERROR") host.innerHTML = `<div class='osint-embed-loading error'>${this.escape(payload.error || "Source failed to load.")}</div>`;
        }

        async close() {
            this.closeNative();
            if (this.isEmbeddedOpen()) await this.closeEmbedded();
        }
    }

    return {OsintAccessController};
});
