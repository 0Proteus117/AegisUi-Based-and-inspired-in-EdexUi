#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const policy = require(path.join(ROOT, "src/classes/workspaces/osintProviderPolicy.class.js"));
const Runtime = require(path.join(ROOT, "src/classes/workspaces/osintProviderRuntime.class.js"));
const Capabilities = require(path.join(ROOT, "src/classes/workspaces/osintCapabilityRegistry.class.js"));
const Adapters = require(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"));
const Panel = require(path.join(ROOT, "src/classes/workspaces/osintToolAccessPanel.class.js"));
const managerSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key}${condition ? "" : ` · ${detail}`}`);
}

function mockResponse(payload, options = {}) {
    return {
        ok: options.ok !== false,
        status: options.status || 200,
        headers: {get: name => name === "retry-after" ? options.retryAfter || null : null},
        json: async () => payload
    };
}

async function main() {
    const providerRegistry = new Runtime.ProviderRegistry(registry);
    const capabilityRegistry = new Capabilities.CapabilityRegistry(providerRegistry);
    const wayback = registry.getProvider("wayback");
    const reference = registry.getProvider("cobalt-strike-reference");
    const expectedCapabilities = [
        "RESEARCH_DISCOVERY", "HISTORICAL_ARCHIVE", "EVIDENCE_PRESERVATION", "INFRASTRUCTURE_CONTEXT",
        "THREAT_REPUTATION", "GEOSPATIAL_VERIFICATION", "VISUAL_MEDIA_VERIFICATION", "SOURCE_VERIFICATION", "MEDIA_VERIFICATION", "ENTITY_RESEARCH",
        "PUBLIC_PRESENCE", "TRANSPORT_MONITORING", "DATA_ANALYSIS"
    ];

    check("RUNTIME_CAPABILITIES", expectedCapabilities.every(id => capabilityRegistry.getCapability(id)), `${capabilityRegistry.getCapabilities().length}/13`);
    check("RUNTIME_CAPABILITY_PROVIDER_MAP", capabilityRegistry.getProviders("HISTORICAL_ARCHIVE").some(provider => provider.id === "wayback"));
    check("RUNTIME_PREFERRED_PROVIDER", capabilityRegistry.getPreferredProvider("HISTORICAL_ARCHIVE").id === "wayback");
    check("RUNTIME_WAYBACK_POLICY", policy.canQuery(wayback).allowed && !policy.canLaunch(wayback).allowed);
    check("RUNTIME_REFERENCE_POLICY", !policy.canQuery(reference).allowed && policy.canQuery(reference).code === "REFERENCE_ONLY");

    const factory = new Adapters.AdapterFactory({providerRegistry});
    const adapter = factory.createAdapter("wayback");
    check("RUNTIME_WAYBACK_ADAPTER", adapter instanceof Adapters.WaybackAdapter);
    const crossref = registry.getProvider("crossref-works");
    check("RUNTIME_SOURCE_PROVIDER_MAP", capabilityRegistry.getProviders("SOURCE_VERIFICATION").some(provider => provider.id === "crossref-works") && policy.canQuery(crossref).allowed && !policy.canLaunch(crossref).allowed);
    check("RUNTIME_CROSSREF_ADAPTER", factory.createAdapter("crossref-works") instanceof Adapters.CrossrefWorksAdapter && Adapters.CROSSREF_WORKS_ENDPOINT === "https://api.crossref.org/works/");
    let refBlocked = false;
    try { factory.createAdapter(reference.id); } catch (error) { refBlocked = error.code === "REFERENCE_ONLY_PROVIDER"; }
    check("RUNTIME_REFERENCE_ADAPTER_BLOCKED", refBlocked);
    const referenceAdapter = factory.createReferenceAdapter(reference.id);
    const referenceOperations = await Promise.all(["query", "checkHealth", "launch", "integrate"].map(async method => {
        try { await referenceAdapter[method](); return false; }
        catch (error) { return error.code === "REFERENCE_ONLY_PROVIDER"; }
    }));
    check("RUNTIME_REFERENCE_OPERATIONS_BLOCKED", referenceOperations.every(Boolean));
    let invalidContextBlocked = false;
    try { Runtime.createQueryContext({providerId: "wayback", capability: "HISTORICAL_ARCHIVE"}); } catch (error) { invalidContextBlocked = error.code === "POLICY_BLOCKED"; }
    check("RUNTIME_USER_INITIATED_REQUIRED", invalidContextBlocked);

    ["example.org", "https://example.org/a", "http://example.org"].forEach(value => check(`RUNTIME_VALID_INPUT_${value.replace(/[^a-z]/gi, "_")}`, /^https?:\/\//.test(Adapters.validateWaybackInput(value))));
    ["", "javascript:alert(1)", "file:///tmp/test", "https://localhost", ["example.org"], {url: "example.org"}].forEach((value, index) => {
        let blocked = false;
        try { Adapters.validateWaybackInput(value); } catch (error) { blocked = error.code === "INVALID_INPUT"; }
        check(`RUNTIME_INVALID_INPUT_${index + 1}`, blocked);
    });

    const context = Runtime.createQueryContext({providerId: "wayback", capability: "HISTORICAL_ARCHIVE", userInitiated: true, networkAllowed: true, locale: "en-GB", timezone: "Europe/Madrid"});
    const successAdapter = new Adapters.WaybackAdapter(wayback, {fetchImpl: async () => mockResponse({url: "https://example.org", archived_snapshots: {closest: {available: true, url: "https://web.archive.org/web/20240102030405/https://example.org", timestamp: "20240102030405"}}})});
    const success = await successAdapter.query("example.org", context);
    check("RUNTIME_NORMALIZED_SUCCESS", success.status === "SUCCESS" && success.data.available === true && success.data.snapshotTimestamp === "20240102030405");
    check("RUNTIME_NORMALIZED_NO_RAW", success.rawAvailable === false && !Object.prototype.hasOwnProperty.call(success, "raw"));
    check("RUNTIME_SNAPSHOT_NEVER_AUTO_OPEN", typeof success.data.snapshotUrl === "string" && !managerSource.includes("openLink(lastResult.snapshotUrl"));

    const emptyContext = Runtime.createQueryContext({providerId: "wayback", capability: "HISTORICAL_ARCHIVE", userInitiated: true, networkAllowed: true});
    const emptyAdapter = new Adapters.WaybackAdapter(wayback, {fetchImpl: async () => mockResponse({url: "https://example.org", archived_snapshots: {}})});
    const empty = await emptyAdapter.query("example.org", emptyContext);
    check("RUNTIME_NORMALIZED_EMPTY", empty.status === "EMPTY" && empty.data.available === false);

    const offlineContext = Runtime.createQueryContext({providerId: "wayback", capability: "HISTORICAL_ARCHIVE", userInitiated: true, networkAllowed: true});
    const offlineAdapter = new Adapters.WaybackAdapter(wayback, {fetchImpl: async () => { throw new Error("offline"); }});
    let offline = null;
    try { await offlineAdapter.query("example.org", offlineContext); } catch (error) { offline = error; }
    check("RUNTIME_OFFLINE_CLASSIFIED", offline && offline.code === "OFFLINE");

    const runtime = new Runtime.ProviderRuntime({providerRegistry, capabilityRegistry, adapterFactory: new Adapters.AdapterFactory({providerRegistry, fetchImpl: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true}))})});
    const pending = runtime.startQuery("wayback", "example.org", {capability: "HISTORICAL_ARCHIVE", userInitiated: true, networkAllowed: true});
    const cancelled = runtime.cancel(pending.requestId);
    const cancelledResult = await pending.promise;
    check("RUNTIME_CANCELLATION", cancelled && cancelledResult.status === "CANCELLED");

    const session = new Panel.SessionHistory();
    session.select(wayback);
    session.beginQuery(wayback, {querySummary: "Manual historical-archive query"});
    session.recordQueryResult(wayback, success, {querySummary: "Manual historical-archive query", providerHealth: "READY"});
    check("RUNTIME_RESULT_OWNERSHIP", session.snapshot().lastResult && session.snapshot().lastResult.providerId === "wayback");
    check("RUNTIME_EPHEMERAL_HISTORY", session.snapshot().history.every(event => !/example\.org|https?:\/\//i.test(`${event.querySummary} ${event.resultSummary}`)));
    session.recordQueryResult(wayback, cancelledResult, {querySummary: "Manual historical-archive query", providerHealth: "UNKNOWN"});
    check("RUNTIME_CANCELLED_STATE", session.snapshot().panelState === "CANCELLED" && session.snapshot().queryState === "CANCELLED");
    check("RUNTIME_NO_STORAGE", !/localStorage|sessionStorage|indexedDB|ipc\.invoke|fetch\(/.test(fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintToolAccessPanel.class.js"), "utf8")));
    check("RUNTIME_FIXED_ENDPOINT", Adapters.WAYBACK_AVAILABILITY_ENDPOINT === "https://archive.org/wayback/available");
    check("RUNTIME_NO_GENERIC_PROXY", !/proxy|forwardUrl|arbitraryUrl/i.test(fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"), "utf8")));
    check("RUNTIME_UI_COMPLETION_CORRELATION", !/pending\.context\.requestId/.test(managerSource) && /pending\.requestId/.test(managerSource));
    check("RUNTIME_UI_QUERY_FORM", managerSource.includes("data-osint-query-form") && managerSource.includes("cancelActiveOSINTQuery"));
    check("RUNTIME_REFERENCE_NO_QUERY_UI", managerSource.includes("getOSINTQueryDecision(provider)") && !policy.canQuery(reference).allowed);
    console.log(`OSINT_PROVIDER_RUNTIME: ${failures.length ? "FAIL" : "OK"}`);
}

main().catch(error => {
    failures.push(`UNHANDLED:${error.stack || error.message}`);
    console.error(error.stack || error.message);
    console.log("OSINT_PROVIDER_RUNTIME: FAIL");
}).finally(() => {
    if (failures.length) {
        failures.forEach(item => console.error(`- ${item}`));
        process.exitCode = 1;
    }
});
