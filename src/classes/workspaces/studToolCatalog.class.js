"use strict";

const Registry = require("./studToolCatalog.registry.js");
const Model = require("./studAcademicModel.class.js");

const MAX_RESULTS = 200;
const ALLOWED_FILTERS = Object.freeze(["query", "discipline", "costClass", "offlineClass", "openSource", "integrationLevel", "availability", "toolType", "freeOnly", "localOnly", "noAccount", "installedOnly", "favoritesOnly", "includeHidden"]);

function bool(value, fallback = false) { return value === true ? true : value === false ? false : fallback; }
function text(value) { return String(value || "").trim().toUpperCase(); }
function cleanQuery(value) { const result = String(value || "").trim().toLowerCase(); return result.length > 240 ? result.slice(0, 240) : result; }
function preferenceMap(items) { return new Map(items.map(item => [item.toolId, item])); }
function publicEntry(entry, preference = {}) {
    return Object.freeze({...entry, preference: Object.freeze({favorite: Boolean(preference.favorite), hidden: Boolean(preference.hidden), pinned: Boolean(preference.pinned), usedAt: preference.usedAt || null})});
}

class StudToolCatalog {
    constructor(store) { this.store = store; Registry.requireValidRegistry(); }

    filters(input = {}) {
        Model.assertPlainObject(input, "Catalog filters");
        Object.keys(input).forEach(key => { if (!ALLOWED_FILTERS.includes(key)) throw new Model.StudError("INVALID_INPUT", `Catalog filter is unsupported: ${key}.`); });
        const result = {
            query: cleanQuery(input.query), discipline: text(input.discipline), costClass: text(input.costClass), offlineClass: text(input.offlineClass), openSource: text(input.openSource), integrationLevel: text(input.integrationLevel), availability: text(input.availability), toolType: text(input.toolType),
            freeOnly: bool(input.freeOnly), localOnly: bool(input.localOnly), noAccount: bool(input.noAccount), installedOnly: bool(input.installedOnly), favoritesOnly: bool(input.favoritesOnly), includeHidden: bool(input.includeHidden)
        };
        if (result.discipline && !Registry.DISCIPLINES.includes(result.discipline)) throw new Model.StudError("INVALID_INPUT", "Unknown catalog discipline.");
        [["costClass", Registry.COST_CLASSES], ["offlineClass", Registry.OFFLINE_CLASSES], ["openSource", Registry.OPEN_SOURCE], ["integrationLevel", Registry.INTEGRATION_LEVELS], ["availability", Registry.AVAILABILITY], ["toolType", Registry.TOOL_TYPES]].forEach(([key, values]) => { if (result[key] && !values.includes(result[key])) throw new Model.StudError("INVALID_INPUT", `Invalid catalog ${key}.`); });
        return Object.freeze(result);
    }

    score(entry, preference, profile) {
        const profileMatches = entry.disciplines.filter(value => profile.includes(value)).length;
        // An explicit discipline profile must be meaningfully visible above
        // otherwise unrelated native capabilities, while native tools still
        // win within the same relevant discipline/cost band.
        return (preference.pinned ? 10000 : 0) + (preference.favorite ? 2000 : 0) + profileMatches * 3000 + (entry.toolType === "AEGIS_NATIVE" ? 1000 : 0) - Registry.COST_ORDER[entry.costClass];
    }

    matches(entry, preference, filters) {
        if (!filters.includeHidden && preference.hidden) return false;
        if (filters.favoritesOnly && !preference.favorite) return false;
        if (filters.discipline && !entry.disciplines.includes(filters.discipline)) return false;
        if (filters.costClass && entry.costClass !== filters.costClass) return false;
        if (filters.offlineClass && entry.offlineClass !== filters.offlineClass) return false;
        if (filters.openSource && entry.openSource !== filters.openSource) return false;
        if (filters.integrationLevel && entry.integrationLevel !== filters.integrationLevel) return false;
        if (filters.availability && entry.availability !== filters.availability) return false;
        if (filters.toolType && entry.toolType !== filters.toolType) return false;
        if (filters.freeOnly && !["FREE_OPEN_LOCAL", "FREE_OPEN_ONLINE", "FREE_ONLINE"].includes(entry.costClass)) return false;
        if (filters.localOnly && !["FULL_OFFLINE", "PARTIAL_OFFLINE"].includes(entry.offlineClass) && !["LOCAL_ONLY", "LOCAL_FIRST"].includes(entry.privacyClass)) return false;
        if (filters.noAccount && entry.accountRequirement !== "NO") return false;
        if (filters.installedOnly && !["AVAILABLE", "INSTALLED"].includes(entry.availability)) return false;
        if (filters.query) {
            const searchable = [entry.name, entry.description, entry.toolType, entry.integrationLevel, entry.costClass, entry.offlineClass, entry.privacyClass, ...entry.disciplines, ...entry.capabilities].join(" ").toLowerCase();
            if (!searchable.includes(filters.query)) return false;
        }
        return true;
    }

    catalog(input = {}) {
        const filters = this.filters(input.filters || {});
        const preferences = preferenceMap(this.store.listToolPreferences());
        const profile = this.store.listDisciplineProfile().map(item => item.discipline);
        const entries = Registry.ENTRIES
            .map(item => ({item, preference: preferences.get(item.id) || {}}))
            .filter(({item, preference}) => this.matches(item, preference, filters))
            .sort((a, b) => this.score(b.item, b.preference, profile) - this.score(a.item, a.preference, profile) || Registry.entrySort(a.item, b.item))
            .slice(0, MAX_RESULTS)
            .map(({item, preference}) => publicEntry(item, preference));
        return Object.freeze({registryVersion: Registry.REGISTRY_VERSION, lastVerified: Registry.VERIFIED_ON, totalEntries: Registry.ENTRIES.length, resultLimit: MAX_RESULTS, truncated: entries.length === MAX_RESULTS, filters, profile: Object.freeze(profile), entries: Object.freeze(entries), recommendations: Object.freeze(entries.filter(item => profile.some(discipline => item.disciplines.includes(discipline))).slice(0, 12).map(item => Object.freeze({toolId: item.id, reasons: Object.freeze([`DISCIPLINE PROFILE: ${item.disciplines.filter(discipline => profile.includes(discipline)).join(" + ")}`, item.costClass.replace(/_/g, " "), item.offlineClass.replace(/_/g, " ")])}))) });
    }

    packs() {
        const preferences = preferenceMap(this.store.listToolPreferences());
        return Object.freeze(Registry.PACKS.map(pack => Object.freeze({...pack, entries: Object.freeze(pack.entryIds.map(id => Registry.getEntry(id)).filter(Boolean).map(item => publicEntry(item, preferences.get(item.id) || {})))})));
    }

    detail(toolId) {
        const item = Registry.getEntry(Model.safeId(toolId, "Tool ID"));
        if (!item) throw new Model.StudError("NOT_FOUND", "Catalog entry is unavailable.");
        const preference = this.store.listToolPreferences().find(value => value.toolId === item.id) || {};
        return Object.freeze({...publicEntry(item, preference), alternatives: Object.freeze(item.alternatives.map(id => Registry.getEntry(id)).filter(Boolean).map(item => publicEntry(item, {})))});
    }

    launch(toolId, shell) {
        const url = Registry.launchUrl(Model.safeId(toolId, "Tool ID"));
        if (!url) throw new Model.StudError("POLICY_BLOCKED", "This catalog entry has no approved external launch.");
        if (!shell || typeof shell.openExternal !== "function") throw new Model.StudError("UNAVAILABLE", "System browser access is unavailable.");
        return Promise.resolve(shell.openExternal(url)).then(() => this.store.updateToolPreference({toolId, markUsed: true})).then(preference => Object.freeze({launched: true, toolId, preference}));
    }
}

module.exports = {StudToolCatalog, MAX_RESULTS, ALLOWED_FILTERS};
