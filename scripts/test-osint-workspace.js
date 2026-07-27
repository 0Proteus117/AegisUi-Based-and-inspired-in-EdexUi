#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const registry = require(path.join(root, "src/classes/workspaces/osintTools.registry.js"));
const policy = require(path.join(root, "src/classes/workspaces/osintProviderPolicy.class.js"));
const workspaceManager = fs.readFileSync(path.join(root, "src/classes/workspaceManager.class.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/ui.html"), "utf8");

const failures = [];
const toolIds = new Set();

if (!Array.isArray(registry.CATEGORIES) || registry.CATEGORIES.length < 8) {
    failures.push("OSINT_CATEGORIES_MISSING");
}
if (!Array.isArray(registry.PROVIDERS) || registry.PROVIDERS.length < 161) {
    failures.push("OSINT_TOOL_CATALOG_TOO_SMALL");
}

registry.PROVIDERS.forEach(provider => {
    const referenceOnly = policy.isReferenceOnly(provider);
    if (!provider.id || !provider.name || !provider.category || !provider.providerType || !provider.accessMode) {
        failures.push(`INVALID_PROVIDER:${provider.id || "unknown"}`);
    }
    if (!referenceOnly && (!provider.officialUrl || !["WEB", "API"].includes(provider.accessMode))) {
        failures.push(`INVALID_LAUNCHABLE_PROVIDER:${provider.id}`);
    }
    if (referenceOnly && (provider.officialUrl || provider.launchAllowed || provider.copyUrlAllowed)) {
        failures.push(`INVALID_REFERENCE_PROVIDER:${provider.id}`);
    }
    if (toolIds.has(provider.id)) failures.push(`DUPLICATE_TOOL:${provider.id}`);
    toolIds.add(provider.id);
    if (!registry.CATEGORIES.some(category => category.id === provider.category)) {
        failures.push(`UNKNOWN_CATEGORY:${provider.id}`);
    }
});

registry.FEATURED.forEach(id => {
    if (!toolIds.has(id)) failures.push(`UNKNOWN_FEATURED_TOOL:${id}`);
});

[
    "renderOSINT(view, definition)",
    "renderOSINTState(view = this.osintView",
    "openOSINTToolById(toolId)",
    "selectOSINTProviderById(toolId, trigger = null)",
    "openOSINTDetail(provider, trigger = null)",
    "closeOSINTDetail()",
    "launchOSINTProvider(provider)",
    "copyOSINTProviderUrl(provider)",
    "openOSINTProviderDocs(provider)",
    "renderOSINTToolAccessPanel(provider = this.getSelectedOSINTProvider())",
    "renderOSINTNativeQuery(provider, snapshot)",
    "beginOSINTQuery(provider)",
    "cancelActiveOSINTQuery({reason = \"USER_CANCELLED\", render = true} = {})",
    "osintPolicyFilterControls()"
].forEach(signature => {
    if (!workspaceManager.includes(signature)) failures.push(`WORKSPACE_MANAGER_MISSING:${signature}`);
});

if (!ui.includes("classes/workspaces/osintTools.registry.js") || !ui.includes("classes/workspaces/osintProviderSchema.class.js") || !ui.includes("classes/workspaces/osintProviderPolicy.class.js")) {
    failures.push("OSINT_REGISTRY_NOT_LOADED");
}

console.log(`OSINT_CATEGORIES: ${registry.CATEGORIES.length}`);
console.log(`OSINT_TOOLS: ${registry.PROVIDERS.length}`);
console.log(`OSINT_DUPLICATE_IDS: ${registry.PROVIDERS.length - toolIds.size}`);
console.log(`OSINT_WORKSPACE: ${failures.length ? "FAIL" : "OK"}`);

if (failures.length) {
    failures.forEach(failure => console.error(failure));
    process.exitCode = 1;
}
