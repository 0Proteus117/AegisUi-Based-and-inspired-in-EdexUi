#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Entity = require(path.join(ROOT, "src/classes/workspaces/osintEntityResolution.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));
const Registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const failures = [];
function check(key, condition, detail = "OK") { console.log(`${key}: ${condition ? detail : "FAIL"}`); if (!condition) failures.push(`${key} · ${detail}`); }
function rejects(key, callback, expected) { try { callback(); check(key, false, "accepted invalid input"); } catch (error) { check(key, !expected || error.code === expected, error && error.code || "untyped error"); } }
function entity(id, type, label, field, value, sourceType = "ANALYST_OBSERVATION") { return {id, type, label, attributes: [{field, value, sourceType, sourceIdentifier: "SYNTHETIC FIXTURE", confidence: "MEDIUM"}], confidence: "MEDIUM"}; }

function main() {
    let state = Entity.createState({mode: "ENTITY"});
    state = Entity.addEntity(state, entity("entity-alpha-000001", "DOMAIN", "example.org", "DOMAIN", "example.org"));
    state = Entity.addEntity(state, entity("entity-beta-000002", "ORGANIZATION", "Example Organization", "IDENTIFIER", "example-org"));
    state = Entity.addEntity(state, entity("entity-gamma-000003", "DOMAIN", "Example mirror", "DOMAIN", "example.org"));
    check("ENTITY_TYPES", Entity.ENTITY_TYPES.includes("PERSON") && Entity.ENTITY_TYPES.includes("DOMAIN") && Entity.ENTITY_TYPES.includes("ASN"));
    check("ENTITY_CREATE_EXPLICIT", state.entities.length === 3 && state.selectedEntityId === "entity-gamma-000003");
    check("ENTITY_FIELD_PROVENANCE", state.entities[0].attributes[0].sourceType === "ANALYST_OBSERVATION" && state.entities[0].attributes[0].sourceIdentifier === "SYNTHETIC FIXTURE");
    state = Entity.updateEntity(state, "entity-alpha-000001", {label: "Example Organization Domain", aliases: ["example.org"], confidence: "MEDIUM", status: "PARTIALLY_RESOLVED"});
    check("ENTITY_EDIT_EXPLICIT", state.entities[0].label === "Example Organization Domain" && state.entities[0].aliases.some(alias => alias === "example.org") && state.entities[0].attributes[0].sourceIdentifier === "SYNTHETIC FIXTURE");
    check("ENTITY_EXACT_DUPLICATE_HINT", Entity.exactDuplicateHints(state.entities).length === 1 && Entity.exactDuplicateHints(state.entities)[0].strength === "EXACT_IDENTIFIER");
    rejects("ENTITY_RELATIONSHIP_REQUIRES_EVIDENCE", () => Entity.addRelationship(state, {fromId: "entity-alpha-000001", toId: "entity-beta-000002", type: "ASSOCIATED_WITH"}), "EVIDENCE_REQUIRED");
    state = Entity.addRelationship(state, {fromId: "entity-alpha-000001", toId: "entity-beta-000002", type: "ASSOCIATED_WITH", evidence: [{summary: "Synthetic source footer names the organization.", sourceType: "SOURCE_METADATA", sourceIdentifier: "synthetic-source", confidence: "MEDIUM"}], contradictions: ["No direct registration evidence."], confidence: "MEDIUM", status: "AMBIGUOUS"});
    check("ENTITY_RELATIONSHIP_EVIDENCE", state.relationships.length === 1 && state.relationships[0].evidence.length === 1 && state.relationships[0].contradictions.length === 1);
    rejects("ENTITY_MERGE_REQUIRES_CONFIRMATION", () => Entity.mergeConfirmed(state, "entity-alpha-000001", "entity-gamma-000003", false), "CONFIRMATION_REQUIRED");
    const merged = Entity.mergeConfirmed(state, "entity-alpha-000001", "entity-gamma-000003", true);
    check("ENTITY_MERGE_EXPLICIT", merged.entities.length === 2 && merged.entities.find(item => item.id === "entity-alpha-000001").status === "CONFIRMED_BY_ANALYST");
    const graph = Entity.graph(merged);
    check("ENTITY_GRAPH_BOUNDED", graph.nodes.length === 2 && graph.edges.length === 1 && graph.limits.nodes === 50 && graph.limits.edges === 100);
    check("ENTITY_EMAIL_NORMALIZATION", Entity.canonicalIdentifier("EMAIL", "Analyst@Example.ORG") === "analyst@example.org");
    const code = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintEntityResolution.class.js"), "utf8");
    check("ENTITY_NO_NETWORK_OR_PROBES", !/fetch\s*\(|XMLHttpRequest|smtp|localStorage|sessionStorage|child_process|ipc/i.test(code));
    const provider = Registry.getProvider("local-entity-resolution");
    check("ENTITY_LOCAL_PROVIDER_POLICY", provider && provider.providerType === "LOCAL_TOOL" && provider.accessMode === "LOCAL" && provider.launchAllowed === false && provider.copyUrlAllowed === false && provider.integrationAllowed === true);
    const data = Entity.toEvidenceData(merged, "entity-alpha-000001", "Synthetic analyst note.");
    const normalized = {providerId: provider.id, capability: "ENTITY_RESOLUTION", status: "SUCCESS", queriedAt: new Date().toISOString(), completedAt: new Date().toISOString(), summary: "Synthetic entity snapshot.", data: {...data, available: true, provider: provider.name}, warnings: [], source: {provider: provider.name, type: "LOCAL_ENTITY_RESOLUTION"}, confidence: "MEDIUM"};
    const sanitized = Model.sanitizeNormalizedResult(normalized);
    check("ENTITY_EVIDENCE_SANITIZED", sanitized.data.entityResolution && sanitized.data.entityResolution.entity.label === "Example Organization Domain" && sanitized.data.entityResolution.relationships.length === 1);
    const redacted = Model.createProviderEvidence({caseId: "case-entity9", normalizedResult: normalized, draft: {title: "Synthetic entity", summary: "Synthetic entity evidence.", tags: ["entity"], redactions: ["data.entityResolution.entity.attributes", "data.entityResolution.analystNote"]}});
    Model.validateEvidenceRecord(redacted);
    check("ENTITY_EVIDENCE_REDACTION", redacted.acquisitionMethod === "LOCAL_ENTITY_RESOLUTION" && !Object.prototype.hasOwnProperty.call(redacted.data.entityResolution.entity, "attributes") && !Object.prototype.hasOwnProperty.call(redacted.data.entityResolution, "analystNote") && /^[a-f0-9]{64}$/.test(redacted.integrity.value));
    const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    const ui = fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8");
    const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
    check("ENTITY_UI_LOAD_ORDER", ui.indexOf("osintEntityResolution.class.js") < ui.indexOf("osintProviderAdapters.class.js"));
    check("ENTITY_NO_NEW_IPC", !/ipc\.invoke\(\s*["']osint-entity-|ipcMain\.handle\(\s*["']osint-entity-/.test(manager));
    const handoffStart = manager.indexOf("    handoffOSINTEntity(entityId)");
    const handoff = manager.slice(handoffStart, manager.indexOf("    promoteOSINTEntityEvidence", handoffStart));
    check("ENTITY_EXPLICIT_HANDOFF", /OPEN CONTEXT/.test(manager) && /beginOSINTInvestigationHandoff\(object, preferred\.id\)/.test(handoff) && /applyOSINTInvestigationHandoff\(handoff\)/.test(manager) && !/beginOSINTDomainInfrastructureVerification\(\)/.test(handoff));
    check("ENTITY_GRAPH_DIRECT_INTERACTION", manager.includes('data-osint-entity-action="relationship"') && manager.includes('data-osint-relationship-id') && manager.includes('RELATIONSHIP EVIDENCE'));
    check("ENTITY_LAYOUT_NORMAL_FLOW", /osint-entity-header/.test(css) && /grid-template-areas:[\s\S]*entity-header/.test(css) && /osint-entity-graph svg/.test(css) && /grid-template-rows: max-content minmax\(28vh, 1fr\) max-content/.test(css));
    check("ENTITY_REFERENCE_ONLY_UNCHANGED", /REFERENCE ONLY/.test(manager) && !/local-entity-resolution.*workspace-open-link/.test(manager));
    console.log(`OSINT_ENTITY_RESOLUTION: ${failures.length ? "FAIL" : "OK"}`);
}
try { main(); } catch (error) { failures.push(error.stack || error.message); console.error(error.stack || error.message); }
if (failures.length) { failures.forEach(item => console.error(`- ${item}`)); process.exitCode = 1; }
