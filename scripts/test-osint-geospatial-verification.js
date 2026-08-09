#!/usr/bin/env node

"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Geo = require(path.join(ROOT, "src/classes/workspaces/osintGeospatialVerification.class.js"));
const Registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const Runtime = require(path.join(ROOT, "src/classes/workspaces/osintProviderRuntime.class.js"));
const Adapters = require(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}
function expectInvalid(value) {
    try { Geo.parseInput(value); return false; } catch (error) { return error && error.code === "INVALID_INPUT"; }
}
function response(payload) { return {ok: true, status: 200, headers: {get: () => null}, json: async () => payload}; }

async function main() {
    const decimal = Geo.parseInput("51.5074, -0.1278");
    const dms = Geo.parseInput("51° 30' 26.6\" N, 0° 7' 39.2\" W");
    const place = Geo.parseInput("London");
    check("GEO_DECIMAL_PARSE", decimal.kind === "COORDINATES" && decimal.coordinateFormat === "DECIMAL" && decimal.latitude === 51.5074 && decimal.longitude === -0.1278);
    check("GEO_DMS_PARSE", dms.kind === "COORDINATES" && dms.coordinateFormat === "DMS" && Math.abs(dms.latitude - 51.507389) < .00001 && Math.abs(dms.longitude + .127556) < .00001);
    check("GEO_PLACE_PARSE", place.kind === "PLACE_TEXT" && place.query === "London");
    ["91, 0", "0, 181", "javascript:alert(1)", "https://example.org", "51,5074 -0,1278", "<script>x</script>"].forEach((value, index) => check(`GEO_INVALID_INPUT_${index + 1}`, expectInvalid(value)));

    const unverified = Geo.createVerification({parsed: decimal});
    check("GEO_LOCAL_COORDINATES_UNVERIFIED", unverified.verificationStatus === "UNVERIFIED" && unverified.confidence === "LOW");
    const observation = Geo.normalizeProviderObservation({providerId: "open-meteo-geocoding", providerName: "Open-Meteo Geocoding", latitude: 51.5074, longitude: -0.1278, displayName: "London, England, United Kingdom", country: "United Kingdom"});
    const partial = Geo.createVerification({parsed: place, providerObservations: [observation]});
    check("GEO_PROVIDER_NORMALIZATION", partial.normalizedLocation && partial.normalizedLocation.latitude === 51.5074 && partial.verificationStatus === "PARTIALLY_VERIFIED" && partial.confidence === "MEDIUM");
    const consistent = Geo.createVerification({parsed: decimal, providerObservations: [observation, {...observation, providerId: "independent-public-source", providerName: "Independent public source", longitude: -0.1277}]});
    check("GEO_CONFIDENCE_CONSISTENT", consistent.verificationStatus === "CONSISTENT" && consistent.confidence === "HIGH");
    const inconsistent = Geo.createVerification({parsed: decimal, providerObservations: [observation], investigatorObservations: [{assessment: "CONTRADICTS", note: "A local note records an unresolved conflict."}]});
    check("GEO_CONFIDENCE_INCONSISTENT", inconsistent.verificationStatus === "INCONSISTENT" && inconsistent.confidence === "LOW");

    const provider = Registry.getProvider("open-meteo-geocoding");
    const adapter = new Adapters.OpenMeteoGeocodingAdapter(provider, {fetchImpl: async url => response({results: [{name: "London", latitude: 51.5072, longitude: -0.1276, country: "United Kingdom", country_code: "GB", admin1: "England", elevation: 25}]})});
    const context = Runtime.createQueryContext({providerId: provider.id, capability: "GEOSPATIAL_VERIFICATION", userInitiated: true, networkAllowed: true, locale: "en-GB"});
    const normalized = await adapter.query(place, context);
    check("GEO_FIXED_ADAPTER", normalized.status === "SUCCESS" && normalized.data.geoCandidates.length === 1 && /geocoding-api\.open-meteo\.com/.test(adapter.buildRequest(place, context)));
    check("GEO_NO_RAW_PROVIDER_RESPONSE", normalized.rawAvailable === false && !Object.prototype.hasOwnProperty.call(normalized, "raw"));
    let badAdapterInput = false;
    try { adapter.validateInput({kind: "PLACE_TEXT", query: "https://example.org"}); } catch (error) { badAdapterInput = error.code === "INVALID_INPUT"; }
    check("GEO_ADAPTER_REJECTS_URL", badAdapterInput);

    const providerRegistry = new Runtime.ProviderRegistry(Registry);
    const delayedFactory = new Adapters.AdapterFactory({providerRegistry, fetchImpl: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true}))});
    const delayedRuntime = new Runtime.ProviderRuntime({providerRegistry, adapterFactory: delayedFactory});
    const pending = delayedRuntime.startQuery(provider.id, place, {capability: "GEOSPATIAL_VERIFICATION", userInitiated: true, networkAllowed: true});
    const cancelled = delayedRuntime.cancel(pending.requestId);
    const cancelledResult = await pending.promise;
    check("GEO_CANCELLATION", cancelled && cancelledResult.status === "CANCELLED");

    const evidenceData = Geo.toEvidenceData(partial);
    const promotable = {providerId: provider.id, capability: "GEOSPATIAL_VERIFICATION", status: "SUCCESS", queriedAt: partial.createdAt, completedAt: partial.updatedAt, summary: "Geospatial verification: London.", data: evidenceData, warnings: partial.reasoning, source: {provider: "Open-Meteo Geocoding", type: "LOCAL_NORMALIZATION_WITH_PUBLIC_PROVIDER"}, confidence: partial.confidence};
    const sanitized = Model.sanitizeNormalizedResult(promotable);
    check("GEO_CASE_EVIDENCE_SANITIZED", sanitized.data.geo && sanitized.data.geo.latitude === 51.5074 && sanitized.data.geo.observations.length === 1);
    const redacted = Model.createProviderEvidence({caseId: "case-abcde1", normalizedResult: promotable, draft: {title: "Geo result", summary: "Reviewed normalized geographic context.", tags: ["geo"], redactions: ["data.originalInput", "data.geo.latitude", "data.geo.longitude"]}});
    check("GEO_EVIDENCE_REDACTION", !Object.prototype.hasOwnProperty.call(redacted.data, "originalInput") && !Object.prototype.hasOwnProperty.call(redacted.data.geo, "latitude") && !Object.prototype.hasOwnProperty.call(redacted.data.geo, "longitude") && /^[a-f0-9]{64}$/.test(redacted.integrity.value));
    check("GEO_NO_PERSISTENCE_MODULE", !/localStorage|sessionStorage|indexedDB|fs\.write|ipc\.invoke/.test(require("fs").readFileSync(path.join(ROOT, "src/classes/workspaces/osintGeospatialVerification.class.js"), "utf8")));
    const managerSource = require("fs").readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    check("GEO_NO_NEW_IPC", !/ipc\.invoke\(\s*["']osint-geo-|ipcMain\.handle\(\s*["']osint-geo-/.test(managerSource));
    check("GEO_NO_MAP_HANDOFF", !/\b(?:mapManager|leaflet|\.flyTo\(|\.setView\(|map\.set)/i.test(managerSource.match(/getOSINTGeoModule[\s\S]*?renderOSINTCaseReadout/)?.[0] || ""));

    console.log(`OSINT_GEOSPATIAL_VERIFICATION: ${failures.length ? "FAIL" : "OK"}`);
}

main().catch(error => { failures.push(error.stack || error.message); console.error(error.stack || error.message); }).finally(() => {
    if (failures.length) { failures.forEach(item => console.error(`- ${item}`)); process.exitCode = 1; }
});
