#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudToolCatalog} = require("../src/classes/workspaces/studToolCatalog.class.js");
const Registry = require("../src/classes/workspaces/studToolCatalog.registry.js");
const Ipc = require("../src/classes/workspaces/studAcademicIpc.class.js");
const Model = require("../src/classes/workspaces/studAcademicModel.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-tools-"));
let passed = 0;
function check(name, value) { assert.ok(value, name); passed += 1; console.log(`${name}: PASS`); }
function throws(name, fn) { assert.throws(fn); passed += 1; console.log(`${name}: PASS`); }
function ipcMock() { const handlers = new Map(); return {handlers, handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)}; }

async function run() {
    try {
        const store = new StudAcademicStore({root, applicationVersion: "test"}).initialize();
        const catalog = new StudToolCatalog(store);
        check("REGISTRY_SCHEMA_VALID", Registry.validateRegistry().length === 0 && Registry.REGISTRY_VERSION === "1.0.0");
        check("REGISTRY_STABLE_IDS", Registry.ENTRIES.length >= 60 && new Set(Registry.ENTRIES.map(item => item.id)).size === Registry.ENTRIES.length);
        check("REGISTRY_REJECTS_DUPLICATES", Registry.validateRegistry([Registry.ENTRIES[0], Registry.ENTRIES[0]], []).some(error => error.includes("duplicate id")));
        check("REGISTRY_REJECTS_INVALID_URL", Registry.validateEntry({...Registry.ENTRIES[0], websiteUrl: "javascript:alert(1)", launchAllowed: true}).some(error => error.includes("websiteUrl")));
        check("REGISTRY_REJECTS_UNKNOWN_FIELD", Registry.validateEntry({...Registry.ENTRIES[0], unexpected: true}).some(error => error.includes("unknown field")));

        const all = catalog.catalog();
        check("CATALOG_BUILT_IN_OFFLINE", all.totalEntries === Registry.ENTRIES.length && all.entries.length === Registry.ENTRIES.length && all.filters.query === "");
        const free = catalog.catalog({filters: {freeOnly: true}});
        check("FREE_FILTER_EXCLUDES_FREEMIUM", free.entries.length > 0 && free.entries.every(item => ["FREE_OPEN_LOCAL", "FREE_OPEN_ONLINE", "FREE_ONLINE"].includes(item.costClass)) && !free.entries.some(item => item.id === "deepl"));
        const offline = catalog.catalog({filters: {offlineClass: "FULL_OFFLINE"}});
        check("OFFLINE_FILTER", offline.entries.length > 0 && offline.entries.every(item => item.offlineClass === "FULL_OFFLINE"));
        const open = catalog.catalog({filters: {openSource: "YES"}});
        check("OPEN_SOURCE_FILTER", open.entries.some(item => item.id === "whisper") && open.entries.every(item => item.openSource === "YES"));
        const native = catalog.catalog({filters: {integrationLevel: "NATIVE"}});
        check("NATIVE_INTEGRATION_FILTER", native.entries.every(item => item.integrationLevel === "NATIVE") && native.entries.some(item => item.id === "aegis_progress"));

        const profiles = ["ENGINEERING", "CRIMINOLOGY", "PHILOLOGY", "COMPUTER_SCIENCE", "HISTORY", "BUSINESS"];
        profiles.forEach(discipline => {
            store.replaceDisciplineProfile({disciplines: [discipline]});
            const recommended = catalog.catalog().recommendations;
            check(`DISCIPLINE_PROFILE_${discipline}`, recommended.length > 0 && recommended.some(item => item.reasons[0].includes(discipline)));
        });
        store.replaceDisciplineProfile({disciplines: ["ENGINEERING", "RESEARCH"]});
        check("PROFILE_RESTART_PERSISTENCE", new StudAcademicStore({root, applicationVersion: "test"}).initialize().listDisciplineProfile().map(item => item.discipline).join(",") === "ENGINEERING,RESEARCH");

        const favorite = store.updateToolPreference({toolId: "whisper", favorite: true, pinned: true});
        check("PREFERENCES_LOCAL_FAVORITE_PIN", favorite.favorite && favorite.pinned && catalog.catalog({filters: {favoritesOnly: true}}).entries.some(item => item.id === "whisper"));
        check("MARK_USED_IS_EXPLICIT_AND_LOCAL", Boolean(store.updateToolPreference({toolId: "whisper", markUsed: true}).usedAt));
        store.updateToolPreference({toolId: "whisper", hidden: true});
        check("HIDE_IS_NOT_DELETE", !catalog.catalog().entries.some(item => item.id === "whisper") && catalog.detail("whisper").id === "whisper");
        check("PREFERENCES_RESET", store.resetToolPreferences().reset && !catalog.catalog({filters: {includeHidden: true}}).entries.find(item => item.id === "whisper").preference.favorite);

        const packs = catalog.packs();
        check("PACKS_COMPOSE_VALID_ENTRIES", packs.length >= 10 && packs.every(pack => pack.entries.length === pack.entryIds.length));
        check("PACKS_NO_DUPLICATE_CAPABILITY", packs.every(pack => new Set(pack.entryIds).size === pack.entryIds.length));
        check("OPTIONAL_CAPABILITY_HONEST", catalog.detail("optional_coolprop").availability === "NOT_INSTALLED" && catalog.detail("optional_coolprop").integrationLevel === "OPTIONAL_LOCAL");
        check("REFERENCE_ONLY_NOT_NATIVE", catalog.detail("seclists").integrationLevel === "REFERENCE_ONLY" && catalog.detail("seclists").nativeTarget === null);

        const opened = [];
        await catalog.launch("deepl", {openExternal: url => { opened.push(url); return Promise.resolve(); }});
        check("APPROVED_URL_LAUNCH", opened.length === 1 && opened[0] === Registry.launchUrl("deepl"));
        throws("ARBITRARY_URL_IMPOSSIBLE", () => catalog.launch("missing_tool", {openExternal: () => Promise.resolve()}));
        throws("INVALID_FILTER_REJECTED", () => catalog.catalog({filters: {endpoint: "https://example.invalid"}}));
        check("NO_TELEMETRY_OR_REMOTE_REGISTRY", !fs.readFileSync(path.join(__dirname, "..", "src/classes/workspaces/studToolCatalog.class.js"), "utf8").includes("fetch(") && !fs.readFileSync(path.join(__dirname, "..", "src/classes/workspaces/studToolCatalog.registry.js"), "utf8").includes("fetch("));

        const synthetic = Array.from({length: 1000}, (_, index) => ({...Registry.ENTRIES[index % Registry.ENTRIES.length], id: `synthetic_tool_${index}`}));
        const started = Date.now();
        const errors = Registry.validateRegistry(synthetic, []);
        check("SCALE_1000_ENTRIES", errors.length === 0 && Date.now() - started < 1000);

        const ipc = ipcMock();
        const registration = Ipc.registerStudAcademicIpc({ipc, app: {getPath: () => path.join(root, "ipc"), getVersion: () => "test"}, shell: {openExternal: () => Promise.resolve()}});
        const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/index.html"}};
        const untrusted = {sender: {isDestroyed: () => false, getURL: () => "https://example.invalid/"}};
        check("IPC_TYPED_CATALOG_BOUNDARY", Ipc.CHANNELS.includes("stud-tool-catalog") && !Ipc.CHANNELS.some(channel => /download|install|proxy|telemetry/i.test(channel)));
        check("IPC_REJECTS_UNTRUSTED_CATALOG", (await ipc.handlers.get("stud-tool-catalog")(untrusted, {})).code === "POLICY_BLOCKED");
        const launchResponse = await ipc.handlers.get("stud-tool-launch")(trusted, {toolId: "deepl"});
        check("IPC_LAUNCHES_BY_ID_NOT_URL", launchResponse.ok && launchResponse.data.toolId === "deepl");
        registration.dispose();
        check("SCHEMA_CURRENT_AND_NO_SHADOW_STORE", store.schemaInfo().version === Model.SCHEMA_VERSION && Model.SCHEMA_VERSION >= 14 && fs.readdirSync(root).filter(item => !["academic.sqlite", "academic.sqlite-wal", "academic.sqlite-shm", "ipc"].includes(item)).length === 0);
        store.close();
        console.log(`STUD_TOOL_CATALOG: ${passed} checks passed`);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
}
run().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
