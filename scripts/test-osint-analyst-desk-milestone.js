#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const Entities = require(path.join(ROOT, "src/classes/workspaces/osintEntityResolution.class.js"));
const Orchestration = require(path.join(ROOT, "src/classes/workspaces/osintInvestigationOrchestration.class.js"));
const managerSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");

let passed = 0;
function check(name, fn) {
    try { fn(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

function evidence(id, target) {
    return {
        id,
        title: `Synthetic ${target} observation`,
        capability: "INFRASTRUCTURE_CONTEXT",
        confidence: "MEDIUM",
        source: {type: "NORMALIZED_PASSIVE_OBSERVATIONS"},
        integrity: {status: "VALID"},
        data: {infrastructure: {normalizedTarget: target, targetType: "DOMAIN", verificationStatus: "PARTIALLY_VERIFIED", confidence: "MEDIUM"}}
    };
}

check("WORKSPACE_EXIT_CANCELS_ALL_PROVIDER_BACKED_OSINT_REQUESTS", () => {
    const dispose = managerSource.slice(managerSource.indexOf("disposeOSINTDeck()"), managerSource.indexOf("openOSINTToolById("));
    ["cancelActiveOSINTQuery", "cancelOSINTGeoVerification", "cancelOSINTDomainInfrastructureVerification", "cancelOSINTResearchVerification"].forEach(name => assert.ok(dispose.includes(name), name));
    assert.ok(!dispose.includes('if (!view || view.dataset.osintDeckBound !== "true") return;'));
});

check("CASE_SWITCH_RESETS_EPHEMERAL_SELECTION_AND_PROVENANCE", () => {
    const openCase = managerSource.slice(managerSource.indexOf("async openOSINTCaseById"), managerSource.indexOf("getOSINTCaseOverview()"));
    assert.ok(openCase.includes("const previousCaseId"));
    assert.ok(openCase.includes('selectedObjectId: null'));
    assert.ok(openCase.includes('provenance: null'));
});

check("LARGE_CASE_GRAPH_REMAINS_WITHIN_DOCUMENTED_BOUNDS", () => {
    const entities = Array.from({length: 50}, (_, index) => ({
        id: `entity-${index}`, type: index % 2 ? "DOMAIN" : "ORGANIZATION", label: `Synthetic Entity ${index}`,
        confidence: index % 3 ? "MEDIUM" : "LOW", status: "PARTIALLY_RESOLVED", attributes: []
    }));
    const relationships = Array.from({length: 100}, (_, index) => ({
        id: `relationship-${index}`, fromId: `entity-${index % 50}`, toId: `entity-${(index + 1) % 50}`,
        type: "ASSOCIATED_WITH", confidence: "LOW", status: "AMBIGUOUS",
        evidence: [{summary: `Synthetic bounded observation ${index}`, sourceType: "CASE_EVIDENCE"}], contradictions: []
    }));
    const state = Entities.createState({entities, relationships});
    const graph = Entities.graph(state);
    assert.equal(graph.nodes.length, 50);
    assert.equal(graph.edges.length, 100);
    assert.deepEqual(graph.limits, {nodes: 50, edges: 100});
    assert.throws(() => Entities.addEntity(state, {type: "DOMAIN", label: "over-limit.invalid"}), /limited to 50 nodes/i);
});

check("CASE_OVERVIEW_ISOLATES_OBJECTS_BY_ACTIVE_CASE", () => {
    const caseA = {case: {id: "case-a", title: "Synthetic Case A", status: "OPEN", priority: "LOW"}, evidence: [evidence("evidence-a", "case-a.invalid")], notes: [], timeline: []};
    const caseB = {case: {id: "case-b", title: "Synthetic Case B", status: "OPEN", priority: "LOW"}, evidence: [evidence("evidence-b", "case-b.invalid")], notes: [], timeline: []};
    const overviewA = Orchestration.deriveCaseOverview({activeCase: caseA, entityState: {entities: [], relationships: []}});
    const overviewB = Orchestration.deriveCaseOverview({activeCase: caseB, entityState: {entities: [], relationships: []}});
    assert.ok(overviewA.objects.some(item => item.label === "case-a.invalid"));
    assert.ok(!overviewA.objects.some(item => item.label === "case-b.invalid"));
    assert.ok(overviewB.objects.some(item => item.label === "case-b.invalid"));
    const context = Orchestration.createContext({activeCaseId: "case-b", selectedObjectId: null, provenance: null});
    assert.equal(context.activeCaseId, "case-b");
    assert.equal(context.selectedObjectId, null);
    assert.equal(context.provenance, null);
});

check("HANDOFF_STAYS_PREFILL_ONLY_UNDER_STRESS", () => {
    const source = Orchestration.createObject({
        id: "source-stress", type: "SOURCE", label: "Synthetic source", capability: "SOURCE_VERIFICATION",
        payload: {sourceInput: "https://example.invalid/report", target: "example.invalid", rawResponse: "not transferred", cookies: "not transferred"},
        provenance: {sourceCapability: "SOURCE_VERIFICATION", sourceType: "NORMALIZED_SOURCE_CONTEXT"}
    });
    const handoff = Orchestration.createHandoff(Orchestration.createContext({activeCaseId: "case-stress"}), source, "OPEN_DOMAIN_CONTEXT");
    assert.equal(handoff.destinationCapability, "DOMAIN_INFRASTRUCTURE_CONTEXT");
    assert.deepEqual(Object.keys(handoff.normalizedPayload).sort(), ["sourceInput", "target"]);
    assert.equal(handoff.explicit, true);
});

check("ORCHESTRATION_REMAINS_NETWORK_STORAGE_AND_IPC_FREE", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintInvestigationOrchestration.class.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "ipc.invoke", "localStorage", "sessionStorage", "child_process", "require(\"http\")"].forEach(token => assert.equal(source.includes(token), false, token));
});

console.log(`OSINT Analyst Desk Milestone: ${passed} checks passed`);
