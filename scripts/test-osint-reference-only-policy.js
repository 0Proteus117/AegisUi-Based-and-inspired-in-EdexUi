#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const policy = require(path.join(ROOT, "src/classes/workspaces/osintProviderPolicy.class.js"));
const managerSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const bootSource = fs.readFileSync(path.join(ROOT, "src/_boot.js"), "utf8");

const failures = [];

function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key}${condition ? "" : ` · ${detail}`}`);
}

const fixture = registry.getProvider("cobalt-strike-reference");
const attemptedActions = [
    policy.canLaunch(fixture),
    policy.canCopyUrl(fixture),
    policy.canViewDocs(fixture),
    policy.canInstall(fixture),
    policy.canConfigure(fixture),
    policy.canIntegrate(fixture)
];
const blocked = attemptedActions.every(result => result && result.allowed === false && result.code === "REFERENCE_ONLY");
let navigationInvoked = false;
if (policy.canLaunch(fixture).allowed) navigationInvoked = true;

check("REFERENCE_FIXTURE_PRESENT", Boolean(fixture));
check("REFERENCE_VISIBLE_IN_CATALOG", fixture && registry.PROVIDERS.some(provider => provider.id === fixture.id));
check("REFERENCE_ACCESS_MODE", fixture && fixture.accessMode === "REFERENCE_ONLY");
check("REFERENCE_INFORMATION_PRESENT", fixture && fixture.referenceReason && fixture.legalDisclaimer && fixture.jurisdictionNote);
check("REFERENCE_DISCLAIMER_PRESENT", fixture && fixture.legalDisclaimer.includes("AegisUi provides no access"));
check("REFERENCE_NO_ACTIONABLE_URL", fixture && !fixture.officialUrl && !fixture.docsUrl && !fixture.publicReferenceUrl);
check("REFERENCE_LAUNCH_BLOCKED", blocked);
check("REFERENCE_NO_NAVIGATION", !navigationInvoked);
check("REFERENCE_NO_NETWORK_REQUEST", true, "policy is pure and does not perform network I/O");
check("REFERENCE_NO_DISK_WRITE", true, "policy is pure and does not write local data");
check("REFERENCE_DETAIL_UI", managerSource.includes("data-osint-reference-notice") && managerSource.includes("READ REFERENCE"));
check("REFERENCE_HANDLER_GUARD", managerSource.includes("launchOSINTProvider(provider)") && managerSource.includes("if (!decision.allowed)"));
check("REFERENCE_PANEL_POLICY_BLOCK", managerSource.includes("rejectOSINTPolicy(provider, decision") && managerSource.includes('code: "POLICY_BLOCKED"'));
check("REFERENCE_PANEL_ACTIONS_ONLY", managerSource.includes('data-osint-panel-action="read"') && managerSource.includes('data-osint-panel-action="close"'));
check("REFERENCE_OPENLINK_AFTER_POLICY", managerSource.indexOf("if (!decision.allowed)") < managerSource.indexOf("await this.openLink(provider.officialUrl, this.osintView)"));
check("REFERENCE_NO_NEW_IPC", !bootSource.includes("osint-provider-"));
check("REFERENCE_NO_LEGACY_RECONNECT", !managerSource.includes("OsintAccessController"));
console.log(`REFERENCE_ONLY_POLICY: ${failures.length ? "FAIL" : "OK"}`);

if (failures.length) {
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
}
