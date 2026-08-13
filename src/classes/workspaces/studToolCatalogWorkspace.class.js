"use strict";

class StudToolCatalogWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.compute = options.compute;
        this.state = {tab: "CATALOG", catalog: null, packs: [], selected: null, profile: [], error: null, loading: false, filters: {query: "", discipline: "", costClass: "", offlineClass: "", openSource: "", integrationLevel: "", availability: "", toolType: "", freeOnly: false, localOnly: false, noAccount: false, installedOnly: false, favoritesOnly: false}};
    }

    async initialize() { await Promise.all([this.refresh(), this.refreshPacks()]); }
    async refresh() {
        this.state.loading = true;
        try {
            this.state.catalog = await this.request("stud-tool-catalog", {filters: this.state.filters});
            this.state.profile = this.state.catalog.profile || [];
            this.state.error = null;
        } catch (error) { this.state.error = error.message || "TOOL CATALOG UNAVAILABLE"; }
        finally { this.state.loading = false; }
    }
    async refreshPacks() { try { this.state.packs = await this.request("stud-tool-packs"); } catch (error) { this.state.packs = []; } }
    badge(value, kind = "") { return `<span class="stud-tool-badge ${kind ? `is-${this.escape(kind)}` : ""}">${this.escape(String(value || "UNKNOWN").replace(/_/g, " "))}</span>`; }
    label(value) { return String(value || "UNKNOWN").replace(/_/g, " "); }
    option(value, label, selected) { return `<option value="${this.escape(value)}"${selected === value ? " selected" : ""}>${this.escape(label)}</option>`; }
    knownValues(field) { return [...new Set((this.state.catalog && this.state.catalog.entries || []).map(item => item[field]).filter(Boolean))].sort(); }

    render() {
        if (this.state.loading && !this.state.catalog) return `<section class="workspace-panel stud-empty-state"><div class="workspace-panel-content">LOADING LOCAL TOOL CATALOG…</div></section>`;
        if (this.state.error) return `<section class="workspace-panel stud-empty-state"><header><h2>STUD TOOL CATALOG</h2><span>LOCAL ERROR</span></header><div class="workspace-panel-content"><strong>CATALOG UNAVAILABLE</strong><p>${this.escape(this.state.error)}</p></div></section>`;
        const body = this.state.tab === "PACKS" ? this.renderPacks() : this.state.tab === "FAVORITES" ? this.renderFavorites() : this.state.tab === "INSTALLED" ? this.renderInstalled() : this.state.tab === "COMPUTE" ? this.compute.render() : this.renderCatalog();
        return `<section class="stud-tool-catalog-shell">
            <header class="workspace-panel stud-tool-catalog-header"><div><small>STUD / VERSIONED LOCAL REGISTRY</small><h2>STUDENT TOOL CATALOG</h2><p>Curated capability metadata ships with Aegis. Cost, account, offline, privacy and integration status are explicit; Aegis never installs, downloads or recommends through a remote service.</p></div><div class="stud-tool-catalog-status"><strong>REGISTRY ${this.escape(this.state.catalog.registryVersion)}</strong><small>${this.escape(this.state.catalog.totalEntries)} ENTRIES · ${this.escape(this.state.catalog.lastVerified)}</small></div></header>
            <nav class="stud-tool-catalog-tabs" aria-label="Student tools">${["CATALOG", "PACKS", "INSTALLED", "FAVORITES", "COMPUTE"].map(tab => `<button type="button" data-stud-tool-tab="${tab}"${this.state.tab === tab ? " class=\"active\" aria-current=\"page\"" : ""}>${tab}</button>`).join("")}</nav>
            ${body}
            <footer class="workspace-panel stud-tool-catalog-policy"><small>CATALOG POLICY</small><span>LOCAL REGISTRY · EXPLICIT PREFERENCES · NO TELEMETRY · NO DOWNLOADS · NO AUTO-UPDATES · NO REMOTE RECOMMENDATIONS</span></footer>
        </section>`;
    }

    renderCatalog() {
        const catalog = this.state.catalog;
        return `<section class="stud-tool-catalog-grid">
            <article class="workspace-panel stud-tool-filter-panel"><header><h2>DISCOVER</h2><span>DETERMINISTIC ORDER</span></header><div class="workspace-panel-content">${this.renderFilters()}${this.renderProfile()}</div></article>
            <article class="workspace-panel stud-tool-results-panel"><header><h2>CATALOG</h2><span>${catalog.entries.length}${catalog.truncated ? ` / ${catalog.resultLimit} BOUNDED` : " LOCAL RESULTS"}</span></header><div class="workspace-panel-content">${this.renderRecommendationReason()}<div class="stud-tool-list">${catalog.entries.map(item => this.renderRow(item)).join("") || "<p>NO CATALOG ENTRIES MATCH THESE EXPLICIT FILTERS.</p>"}</div></div></article>
            <article class="workspace-panel stud-tool-detail-panel"><header><h2>TOOL DETAIL</h2><span>INSPECTABLE METADATA</span></header><div class="workspace-panel-content">${this.renderDetail()}</div></article>
        </section>`;
    }

    renderFilters() {
        const f = this.state.filters;
        const disciplines = (window.StudToolCatalogRegistry && window.StudToolCatalogRegistry.DISCIPLINES || []).map(value => this.option(value, this.label(value), f.discipline)).join("");
        const costs = ["FREE_OPEN_LOCAL", "FREE_OPEN_ONLINE", "FREE_ONLINE", "FREEMIUM_LIMITED", "INSTITUTION_LICENSED", "PAID_ONE_TIME", "PAID_SUBSCRIPTION", "TRIAL_ONLY", "UNKNOWN"].map(value => this.option(value, this.label(value), f.costClass)).join("");
        const offline = ["FULL_OFFLINE", "PARTIAL_OFFLINE", "ONLINE_REQUIRED", "UNKNOWN"].map(value => this.option(value, this.label(value), f.offlineClass)).join("");
        const integrations = ["NATIVE", "INTEGRATED", "OPTIONAL_LOCAL", "EXTERNAL_LAUNCH", "REFERENCE_ONLY", "LEARNING_ONLY", "NOT_INTEGRATED"].map(value => this.option(value, this.label(value), f.integrationLevel)).join("");
        return `<form class="stud-tool-filter-form" data-stud-tool-form="FILTERS"><label>SEARCH<input class="aegis-input" name="query" maxlength="240" value="${this.escape(f.query)}" placeholder="name, capability, discipline"></label><label>DISCIPLINE<select class="aegis-select" name="discipline"><option value="">ALL DISCIPLINES</option>${disciplines}</select></label><label>COST<select class="aegis-select" name="costClass"><option value="">ALL COST CLASSES</option>${costs}</select></label><label>OFFLINE<select class="aegis-select" name="offlineClass"><option value="">ALL OFFLINE STATES</option>${offline}</select></label><label>INTEGRATION<select class="aegis-select" name="integrationLevel"><option value="">ALL INTEGRATION LEVELS</option>${integrations}</select></label><div class="stud-tool-filter-checks"><label><input type="checkbox" name="freeOnly"${f.freeOnly ? " checked" : ""}> FREE ONLY</label><label><input type="checkbox" name="localOnly"${f.localOnly ? " checked" : ""}> LOCAL / OFFLINE</label><label><input type="checkbox" name="noAccount"${f.noAccount ? " checked" : ""}> NO ACCOUNT</label><label><input type="checkbox" name="favoritesOnly"${f.favoritesOnly ? " checked" : ""}> FAVORITES</label></div><button type="submit">APPLY FILTERS</button></form>`;
    }

    renderProfile() {
        const values = window.StudToolCatalogRegistry && window.StudToolCatalogRegistry.DISCIPLINES || [];
        return `<section class="stud-tool-profile"><header><strong>DISCIPLINE PROFILE</strong><span>EXPLICIT / LOCAL ONLY</span></header><p>Used only to order this local registry. STUD never infers disciplines from Notes, documents or private data.</p><form data-stud-tool-form="PROFILE"><div>${values.map(value => `<label><input type="checkbox" name="disciplines" value="${this.escape(value)}"${this.state.profile.includes(value) ? " checked" : ""}> ${this.escape(this.label(value))}</label>`).join("")}</div><button type="submit">SAVE LOCAL PROFILE</button><button type="button" data-stud-tool-reset-profile>RESET PROFILE</button></form></section>`;
    }

    renderRecommendationReason() {
        const matches = this.state.catalog.recommendations || [];
        if (!matches.length) return "<p class=\"stud-tool-recommendation\">DEFAULT ORDER: AEGIS NATIVE → FREE / OPEN / LOCAL → FREE / OPEN → FREE ONLINE → FREEMIUM → INSTITUTION / PAID. Select disciplines to personalise locally.</p>";
        return `<p class="stud-tool-recommendation">RECOMMENDATIONS EXPLAINED: ${this.escape(matches.slice(0, 3).map(item => item.reasons.join(" · ")).join(" | "))}</p>`;
    }

    renderRow(item) {
        const badges = [this.badge(item.costClass, item.costClass.startsWith("FREE") ? "free" : item.costClass.includes("PAID") || item.costClass.includes("FREEMIUM") ? "paid" : ""), this.badge(item.offlineClass, item.offlineClass.includes("OFFLINE") ? "local" : ""), this.badge(item.integrationLevel, "integration")].join("");
        return `<button type="button" class="stud-tool-row${this.state.selected && this.state.selected.id === item.id ? " selected" : ""}" data-stud-tool-detail="${this.escape(item.id)}"><strong>${this.escape(item.name)}</strong><span>${this.escape(item.description)}</span><small>${badges}</small><em>${this.escape(item.disciplines.join(" / "))}</em>${item.preference.pinned ? "<i>PINNED</i>" : ""}${item.preference.favorite ? "<i>FAVORITE</i>" : ""}</button>`;
    }

    renderDetail() {
        const item = this.state.selected;
        if (!item) return "<p class=\"stud-empty-inline\">SELECT A CATALOG ENTRY TO INSPECT COST, PRIVACY, AVAILABILITY, INTEGRATION AND DISCIPLINE RELEVANCE.</p>";
        const value = (label, content) => `<dt>${this.escape(label)}</dt><dd>${this.escape(content || "UNKNOWN")}</dd>`;
        const preferences = item.preference || {};
        const actions = [];
        if (item.integrationLevel === "NATIVE" && item.nativeTarget) actions.push(`<button type="button" data-stud-tool-native="${this.escape(item.nativeTarget)}">OPEN IN STUD</button>`);
        if (item.launchAllowed) actions.push(`<button type="button" data-stud-tool-launch="${this.escape(item.id)}">OPEN WEBSITE</button>`);
        actions.push(`<button type="button" data-stud-tool-pref="${preferences.favorite ? "UNFAVORITE" : "FAVORITE"}" data-stud-tool-id="${this.escape(item.id)}">${preferences.favorite ? "REMOVE FAVORITE" : "FAVORITE"}</button>`);
        actions.push(`<button type="button" data-stud-tool-pref="${preferences.pinned ? "UNPIN" : "PIN"}" data-stud-tool-id="${this.escape(item.id)}">${preferences.pinned ? "UNPIN" : "PIN"}</button>`);
        actions.push(`<button type="button" data-stud-tool-pref="MARK_USED" data-stud-tool-id="${this.escape(item.id)}">MARK USED</button>`);
        actions.push(`<button type="button" data-stud-tool-pref="HIDE" data-stud-tool-id="${this.escape(item.id)}">HIDE</button>`);
        return `<section class="stud-tool-detail"><h3>${this.escape(item.name)}</h3><p>${this.escape(item.description)}</p><div>${this.badge(item.costClass, item.costClass.includes("FREEMIUM") || item.costClass.includes("PAID") ? "paid" : "free")}${this.badge(item.offlineClass, "local")}${this.badge(item.privacyClass)}</div><dl>${value("TYPE", this.label(item.toolType))}${value("INTEGRATION", this.label(item.integrationLevel))}${value("AVAILABILITY", this.label(item.availability))}${value("COST", this.label(item.costClass))}${value("OPEN SOURCE", item.openSource)}${value("LICENSE", item.license)}${value("ACCOUNT", item.accountRequirement)}${value("PRIVACY", this.label(item.privacyClass))}${value("OFFLINE", this.label(item.offlineClass))}${value("DISCIPLINES", item.disciplines.join(" / "))}${value("CAPABILITIES", item.capabilities.join(" / "))}${value("LAST VERIFIED", item.lastVerified)}${value("STATUS NOTE", item.verificationNote)}</dl>${item.alternatives && item.alternatives.length ? `<section class="stud-tool-alternatives"><strong>CURATED ALTERNATIVES</strong>${item.alternatives.map(alt => `<button type="button" data-stud-tool-detail="${this.escape(alt.id)}">${this.escape(alt.name)} · ${this.escape(this.label(alt.costClass))}</button>`).join("")}</section>` : ""}<div class="stud-detail-actions">${actions.join("")}</div></section>`;
    }

    renderPacks() { return `<section class="stud-tool-packs-grid">${this.state.packs.map(pack => `<article class="workspace-panel"><header><h2>${this.escape(pack.name)}</h2><span>${this.escape(pack.disciplines.join(" / "))}</span></header><div class="workspace-panel-content"><p>${pack.entries.length} CURATED REFERENCES · ORGANISATION ONLY · NO AUTO-INSTALL.</p><div class="stud-tool-pack-entries">${pack.entries.map(item => `<button type="button" data-stud-tool-detail="${this.escape(item.id)}"><strong>${this.escape(item.name)}</strong><small>${this.escape(this.label(item.integrationLevel))} · ${this.escape(this.label(item.costClass))}</small></button>`).join("")}</div></div></article>`).join("")}</section>`; }
    renderFavorites() { const entries = this.state.catalog.entries.filter(item => item.preference.favorite || item.preference.pinned); return `<section class="workspace-panel"><header><h2>FAVORITES / PINS</h2><button type="button" data-stud-tool-reset-preferences>RESET PREFERENCES</button></header><div class="workspace-panel-content"><div class="stud-tool-list">${entries.map(item => this.renderRow(item)).join("") || "<p>NO FAVORITE OR PINNED CATALOG ENTRY. THESE PREFERENCES STAY LOCAL.</p>"}</div></div></section>`; }
    renderInstalled() { const entries = this.state.catalog.entries.filter(item => ["AVAILABLE", "INSTALLED"].includes(item.availability)); return `<section class="workspace-panel"><header><h2>INSTALLED / NATIVE</h2><span>HONEST AVAILABILITY</span></header><div class="workspace-panel-content"><p>External websites are never described as installed. Optional local engines remain NOT INSTALLED until a separately approved runtime proves otherwise.</p><div class="stud-tool-list">${entries.map(item => this.renderRow(item)).join("")}</div></div></section>`; }

    async select(id) { this.state.selected = await this.request("stud-tool-detail", {toolId: id}); this.parent.render(); }
    async handleClick(event) {
        if (this.state.tab === "COMPUTE" && await this.compute.handleClick(event)) return true;
        const tab = event.target.closest("[data-stud-tool-tab]");
        const detail = event.target.closest("[data-stud-tool-detail]");
        const launch = event.target.closest("[data-stud-tool-launch]");
        const pref = event.target.closest("[data-stud-tool-pref]");
        const native = event.target.closest("[data-stud-tool-native]");
        if (tab) {
            const next = tab.dataset.studToolTab;
            this.state.tab = next;
            if (next === "FAVORITES") {
                this.state.filters = {...this.state.filters, favoritesOnly: true, installedOnly: false};
                await this.refresh();
            } else if (next === "INSTALLED") {
                this.state.filters = {...this.state.filters, installedOnly: true, favoritesOnly: false};
                await this.refresh();
            } else if (next === "CATALOG") {
                this.state.filters = {...this.state.filters, installedOnly: false, favoritesOnly: false};
                await this.refresh();
            }
            this.parent.render();
            return true;
        }
        if (detail) { await this.select(detail.dataset.studToolDetail); return true; }
        if (launch) { const result = await this.request("stud-tool-launch", {toolId: launch.dataset.studToolLaunch}); this.showToast(this.parent.view, result.launched ? "APPROVED WEBSITE OPENED" : "WEBSITE NOT OPENED"); await this.refresh(); this.parent.render(); return true; }
        if (pref) { const action = pref.dataset.studToolPref; const toolId = pref.dataset.studToolId; const payload = {toolId}; if (action === "FAVORITE") payload.favorite = true; if (action === "UNFAVORITE") payload.favorite = false; if (action === "PIN") payload.pinned = true; if (action === "UNPIN") payload.pinned = false; if (action === "MARK_USED") payload.markUsed = true; if (action === "HIDE") payload.hidden = true; await this.request("stud-tool-preference-update", payload); this.state.selected = null; await this.refresh(); await this.refreshPacks(); this.parent.render(); return true; }
        if (event.target.closest("[data-stud-tool-reset-preferences]")) { await this.request("stud-tool-preferences-reset", {}); this.state.selected = null; await this.refresh(); this.parent.render(); return true; }
        if (event.target.closest("[data-stud-tool-reset-profile]")) { await this.request("stud-tool-profile-update", {disciplines: []}); await this.refresh(); this.parent.render(); return true; }
        if (native) { const target = native.dataset.studToolNative; if (target === "TOOLS:COMPUTE") { this.state.tab = "COMPUTE"; this.parent.render(); } else this.parent.setActiveView(target); return true; }
        return false;
    }
    async handleSubmit(event) {
        if (this.state.tab === "COMPUTE" && await this.compute.handleSubmit(event)) return true;
        const form = event.target.closest("[data-stud-tool-form]");
        if (!form) return false;
        event.preventDefault();
        if (form.dataset.studToolForm === "FILTERS") {
            const values = new FormData(form);
            this.state.filters = {...this.state.filters, query: values.get("query") || "", discipline: values.get("discipline") || "", costClass: values.get("costClass") || "", offlineClass: values.get("offlineClass") || "", integrationLevel: values.get("integrationLevel") || "", freeOnly: values.get("freeOnly") === "on", localOnly: values.get("localOnly") === "on", noAccount: values.get("noAccount") === "on", favoritesOnly: values.get("favoritesOnly") === "on"};
            await this.refresh(); this.parent.render(); return true;
        }
        if (form.dataset.studToolForm === "PROFILE") {
            const disciplines = new FormData(form).getAll("disciplines");
            await this.request("stud-tool-profile-update", {disciplines}); await this.refresh(); this.showToast(this.parent.view, "LOCAL DISCIPLINE PROFILE SAVED"); this.parent.render(); return true;
        }
        return false;
    }
    async handleChange() { return false; }
}

window.StudToolCatalogWorkspace = StudToolCatalogWorkspace;
