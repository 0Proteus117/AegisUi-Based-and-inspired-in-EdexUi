#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const Orchestration = require(path.join(ROOT, "src/classes/workspaces/osintInvestigationOrchestration.class.js"));

let passed = 0;
function check(name, fn) {
    try { fn(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

const caseData = {
    case: {id: "case-synthetic-001", title: "Synthetic infrastructure context", status: "OPEN", priority: "MEDIUM"},
    evidence: [
        {id: "evidence-domain-001", title: "Synthetic domain", capability: "INFRASTRUCTURE_CONTEXT", confidence: "MEDIUM", source: {type: "NORMALIZED_PASSIVE_OBSERVATIONS"}, integrity: {status: "VALID"}, data: {infrastructure: {normalizedTarget: "example.invalid", targetType: "DOMAIN", verificationStatus: "PARTIALLY_VERIFIED", confidence: "MEDIUM"}}},
        {id: "evidence-source-001", title: "Synthetic source", capability: "SOURCE_VERIFICATION", confidence: "LOW", source: {type: "NORMALIZED_SOURCE_CONTEXT"}, integrity: {status: "VALID"}, data: {research: {sourceType: "URL", normalizedUrl: "https://example.invalid/report", hostname: "example.invalid", title: "Synthetic report", verificationStatus: "UNVERIFIED", confidence: "LOW"}}},
        {id: "evidence-media-001", title: "Synthetic media", capability: "VISUAL_MEDIA_VERIFICATION", confidence: "LOW", source: {type: "EXPLICIT_LOCAL_FILE"}, integrity: {status: "VALID"}, data: {media: {displayLabel: "synthetic.png", metadataStatus: "METADATA_AVAILABLE", geo: {latitude: 40.4168, longitude: -3.7038}}}}
    ],
    notes: [{id: "note-1", text: "Synthetic note"}],
    timeline: [{type: "EVIDENCE_CREATED", summary: "Synthetic evidence recorded", timestamp: "2026-08-09T12:00:00.000Z"}]
};

check("CONTEXT_IS_EPHEMERAL_AND_BOUNDED", () => {
    const context = Orchestration.createContext({activeCaseId: caseData.case.id, selectedObjectType: "DOMAIN"});
    assert.equal(context.activeCaseId, caseData.case.id);
    assert.deepEqual(context.availableHandoffs, []);
    assert.equal(Object.isFrozen(context), true);
});

check("CASE_OVERVIEW_DERIVES_COUNTS_AND_OBJECTS", () => {
    const overview = Orchestration.deriveCaseOverview({activeCase: caseData, entityState: {entities: [], relationships: []}});
    assert.equal(overview.counts.evidence, 3);
    assert.ok(overview.objects.some(item => item.type === "DOMAIN"));
    assert.ok(overview.objects.some(item => item.type === "SOURCE"));
    assert.ok(overview.objects.some(item => item.type === "MEDIA"));
    assert.equal(overview.counts.notes, 1);
});

check("SOURCE_TO_DOMAIN_AND_ENTITY_HANDOFFS_ARE_EXPLICIT", () => {
    const overview = Orchestration.deriveCaseOverview({activeCase: caseData});
    const source = overview.objects.find(item => item.type === "SOURCE");
    const actions = Orchestration.availableHandoffs(source);
    assert.ok(actions.some(item => item.id === "OPEN_DOMAIN_CONTEXT"));
    assert.ok(actions.some(item => item.id === "PROMOTE_TO_ENTITY"));
    const handoff = Orchestration.createHandoff(Orchestration.createContext({activeCaseId: caseData.case.id}), source, "OPEN_DOMAIN_CONTEXT");
    assert.equal(handoff.destinationCapability, "DOMAIN_INFRASTRUCTURE_CONTEXT");
    assert.equal(handoff.normalizedPayload.target, "example.invalid");
    assert.equal(handoff.explicit, true);
});

check("MEDIA_GPS_TO_GEO_PRESERVES_PROVENANCE", () => {
    const overview = Orchestration.deriveCaseOverview({activeCase: caseData});
    const media = overview.objects.find(item => item.type === "MEDIA");
    const handoff = Orchestration.createHandoff(Orchestration.createContext({activeCaseId: caseData.case.id}), media, "VERIFY_LOCATION");
    assert.equal(handoff.destinationCapability, "GEOSPATIAL_VERIFICATION");
    assert.equal(handoff.provenance.sourceCapability, "VISUAL_MEDIA_VERIFICATION");
    assert.equal(handoff.normalizedPayload.latitude, 40.4168);
});

check("DOMAIN_TO_ENTITY_AND_EVIDENCE_TO_ENTITY_ARE_BOUNDED", () => {
    const overview = Orchestration.deriveCaseOverview({activeCase: caseData});
    const domain = overview.objects.find(item => item.type === "DOMAIN");
    const evidence = overview.objects.find(item => item.type === "EVIDENCE");
    assert.ok(Orchestration.availableHandoffs(domain).some(item => item.id === "PROMOTE_TO_ENTITY"));
    assert.ok(Orchestration.availableHandoffs(evidence).some(item => item.id === "LINK_TO_ENTITY"));
});

check("INVALID_HANDOFF_IS_FAIL_CLOSED", () => {
    const entity = Orchestration.createObject({id: "entity-1", type: "ENTITY", label: "Synthetic entity", capability: "ENTITY_RESOLUTION"});
    assert.throws(() => Orchestration.createHandoff(Orchestration.createContext(), entity, "VERIFY_LOCATION"), /no permitted handoff/i);
});

check("NO_RAW_OR_UNSAFE_PAYLOAD_FIELDS_TRANSFER", () => {
    const object = Orchestration.createObject({id: "domain-1", type: "DOMAIN", label: "example.invalid", capability: "SOURCE_VERIFICATION", payload: {target: "example.invalid", cookies: "secret", rawResponse: "large", filePath: "/private/path"}});
    const handoff = Orchestration.createHandoff(Orchestration.createContext(), object, "OPEN_DOMAIN_CONTEXT");
    assert.deepEqual(Object.keys(handoff.normalizedPayload), ["target"]);
});

check("NO_NETWORK_IPC_OR_STORAGE_IN_ORCHESTRATION_MODULE", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintInvestigationOrchestration.class.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "ipc.invoke", "localStorage", "sessionStorage", "child_process", "require(\"http\")"].forEach(forbidden => assert.equal(source.includes(forbidden), false, forbidden));
});

check("WORKSPACE_LOADS_ORCHESTRATION_BEFORE_MANAGER", () => {
    const ui = fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8");
    assert.ok(ui.indexOf("osintInvestigationOrchestration.class.js") < ui.indexOf("workspaceManager.class.js"));
});

check("MANAGER_EXPOSES_CASE_OVERVIEW_WITHOUT_NEW_IPC", () => {
    const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    assert.ok(manager.includes("renderOSINTCaseOverview(grid)"));
    assert.ok(manager.includes("beginOSINTInvestigationHandoff"));
    assert.ok(manager.includes("this.osintCaseState = {...this.osintCaseState, mode: \"CATALOG\"}"));
    assert.ok(manager.includes("this.osintEntityState = {...this.osintEntityState, mode: \"CATALOG\"}"));
    assert.ok(manager.includes("const orchestrationHandoff = state.orchestrationHandoff || null"));
    assert.ok(manager.includes("CREATE ENTITY"));
    const section = manager.slice(manager.indexOf("getOSINTInvestigationModule()"), manager.indexOf("promoteOSINTEntityEvidence"));
    assert.equal(section.includes("ipc.invoke"), false);
});

console.log(`OSINT Investigation Orchestration: ${passed} checks passed`);
