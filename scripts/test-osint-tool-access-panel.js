#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const policy = require(path.join(ROOT, "src/classes/workspaces/osintProviderPolicy.class.js"));
const panel = require(path.join(ROOT, "src/classes/workspaces/osintToolAccessPanel.class.js"));
const managerSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const panelSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintToolAccessPanel.class.js"), "utf8");
const bootSource = fs.readFileSync(path.join(ROOT, "src/_boot.js"), "utf8");

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key}${condition ? "" : ` · ${detail}`}`);
}

const normal = registry.getProvider("bellingcat");
const reference = registry.getProvider("cobalt-strike-reference");
let tick = 0;
const session = new panel.SessionHistory({
    maxEntries: 3,
    clock: () => new Date(`2026-07-23T10:00:0${Math.min(tick++, 9)}.000Z`)
});

check("PANEL_INITIAL_IDLE", session.snapshot().panelState === "IDLE" && session.snapshot().history.length === 0);
session.hover(normal);
check("HOVER_NO_SELECTION", session.snapshot().activeProviderId === null && session.snapshot().previewProviderId === normal.id);
check("HOVER_NO_HISTORY", session.snapshot().history.length === 0);
session.clearHover();
check("HOVER_CLEAR_RESTORES_IDLE", session.snapshot().previewProviderId === null && session.snapshot().panelState === "IDLE");

session.select(normal);
const selected = session.snapshot();
check("SELECT_ACTIVE_PROVIDER", selected.activeProviderId === normal.id && selected.panelState === "SELECTED");
check("SELECT_METADATA_SEPARATED", selected.providerStatus === normal.providerStatus && selected.legalStatus === normal.legalStatus && selected.queryState === "IDLE");
check("SELECT_RECORDS_EPHEMERAL_EVENT", selected.history.length === 1 && selected.history[0].action === "SELECT_PROVIDER");
check("NORMAL_OPEN_POLICY", policy.canOpen(normal).allowed && policy.canCopyUrl(normal).allowed);
check("NORMAL_DOCS_POLICY", !policy.canViewDocs(normal).allowed && policy.canViewDocs(normal).code === "DOCS_UNAVAILABLE");

session.recordAction(normal, "OPEN_PROVIDER", {resultSummary: "Approved external launch requested"});
check("OPEN_RECORDED_WITHOUT_URL", session.snapshot().history.some(item => item.action === "OPEN_PROVIDER") && !session.snapshot().history.some(item => /https?:\/\//i.test(item.resultSummary)));
session.recordAction(normal, "COPY_PROVIDER_URL", {resultSummary: "Approved source URL copied"});
session.recordAction(normal, "EXTRA", {resultSummary: "Oldest entry should be trimmed"});
check("HISTORY_LIMIT", session.snapshot().history.length === 3);
const firstClear = session.requestClear();
check("CLEAR_REQUIRES_LIGHT_CONFIRMATION", firstClear.confirmationRequired && session.snapshot().history.length === 3);
const secondClear = session.requestClear();
check("CLEAR_HISTORY", secondClear.cleared && session.snapshot().history.length === 0);
check("CLEAR_RETAINS_SELECTION", session.snapshot().activeProviderId === normal.id && session.snapshot().panelState === "SELECTED");

session.select(reference);
const referenceState = session.snapshot();
check("REFERENCE_PANEL_STATE", referenceState.panelState === "REFERENCE_ONLY" && referenceState.activeProviderId === reference.id);
check("REFERENCE_CAN_READ", policy.canReadReference(reference).allowed);
check("REFERENCE_OPEN_BLOCKED", !policy.canOpen(reference).allowed && policy.canOpen(reference).code === "REFERENCE_ONLY");
check("REFERENCE_COPY_BLOCKED", !policy.canCopyUrl(reference).allowed && policy.canCopyUrl(reference).code === "REFERENCE_ONLY");
check("REFERENCE_DOCS_BLOCKED", !policy.canViewDocs(reference).allowed && policy.canViewDocs(reference).code === "REFERENCE_ONLY");
session.recordError(reference, "POLICY_BLOCKED", "OPEN · REFERENCE_ONLY https://example.invalid");
check("POLICY_REJECTION_SANITIZED", session.snapshot().lastError.code === "POLICY_BLOCKED" && !/https?:\/\//.test(session.snapshot().lastError.message));
session.requestClear();
session.requestClear();
check("REFERENCE_CLEAR_RETAINS_REFERENCE_STATE", session.snapshot().panelState === "REFERENCE_ONLY" && session.snapshot().activeProviderId === reference.id);

[
    "renderOSINTToolAccessPanel(provider = this.getSelectedOSINTProvider())",
    "renderOSINTProviderMetadata(provider, referenceOnly)",
    "renderOSINTPanelActions(provider, referenceOnly)",
    "selectOSINTProviderById(toolId, trigger = null)",
    "previewOSINTProviderById(toolId)",
    "clearOSINTSessionHistory()",
    "handleOSINTPanelAction(action, trigger)",
    "rejectOSINTPolicy(provider, decision, action = \"ACTION\")",
    "openOSINTProviderDocs(provider)",
    "disposeOSINTDeck()"
].forEach(signature => check(`MANAGER_${signature.slice(0, 28)}`, managerSource.includes(signature)));

const selectBlock = managerSource.slice(managerSource.indexOf("selectOSINTProviderById(toolId"), managerSource.indexOf("previewOSINTProviderById(toolId"));
check("SELECT_DOES_NOT_OPEN_MODAL", !selectBlock.includes("openOSINTDetail("));
check("SELECT_DOES_NOT_LAUNCH", !selectBlock.includes("openLink("));
check("IDLE_HOVER_PREVIEW_CONTAINER", managerSource.includes('data-osint-panel-preview${previewProvider ? "" : " hidden"}'));
check("CARD_ARIA_SELECTED", managerSource.includes('role="option"') && managerSource.includes("aria-selected"));
check("PANEL_ACTIONS_CENTRAL_POLICY", managerSource.includes("osintPolicyDecision(\"canLaunch\"") && managerSource.includes("osintPolicyDecision(\"canCopyUrl\"") && managerSource.includes("osintPolicyDecision(\"canViewDocs\""));
check("REFERENCE_ACTIONS_RENDERED_ONLY", managerSource.includes('data-osint-panel-action="read"') && managerSource.includes('data-osint-panel-action="close"'));
check("ARTIFICIAL_OPEN_RETURNS_POLICY_BLOCKED", managerSource.includes('code: "POLICY_BLOCKED"'));
check("FOCUS_RETURN_IMPLEMENTED", managerSource.includes("this.osintDetailTrigger") && managerSource.includes("trigger.focus({preventScroll: true})"));
check("ESCAPE_CLOSE_IMPLEMENTED", managerSource.includes('event.key === "Escape"') && managerSource.includes("removeEventListener(\"keydown\", this.boundOSINTDetailEscape)"));
check("NO_PERSISTENCE_IN_PANEL", !/localStorage|sessionStorage|workspace-state-save|ipc\.invoke|fetch\(/.test(panelSource));
check("NO_NEW_OSINT_IPC", !bootSource.includes("osint-provider-"));
check("NO_LEGACY_RECONNECT", !managerSource.includes("OsintAccessController"));

console.log(`OSINT_TOOL_ACCESS_PANEL: ${failures.length ? "FAIL" : "OK"}`);
if (failures.length) {
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
}
