#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const registry = require(path.join(root, "src/classes/workspaces/osintTools.registry.js"));
const workspaceManager = fs.readFileSync(path.join(root, "src/classes/workspaceManager.class.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/ui.html"), "utf8");

const failures = [];
const toolIds = new Set();

if (!Array.isArray(registry.CATEGORIES) || registry.CATEGORIES.length < 8) {
    failures.push("OSINT_CATEGORIES_MISSING");
}
if (!Array.isArray(registry.TOOLS) || registry.TOOLS.length < 140) {
    failures.push("OSINT_TOOL_CATALOG_TOO_SMALL");
}

registry.TOOLS.forEach(tool => {
    if (!tool.id || !tool.title || !tool.category || !tool.url || tool.type !== "web") {
        failures.push(`INVALID_TOOL:${tool.id || "unknown"}`);
    }
    if (toolIds.has(tool.id)) failures.push(`DUPLICATE_TOOL:${tool.id}`);
    toolIds.add(tool.id);
    if (!registry.CATEGORIES.some(category => category.id === tool.category)) {
        failures.push(`UNKNOWN_CATEGORY:${tool.id}`);
    }
});

registry.FEATURED.forEach(id => {
    if (!toolIds.has(id)) failures.push(`UNKNOWN_FEATURED_TOOL:${id}`);
});

[
    "renderOSINT(view, definition)",
    "renderOSINTState(view = this.osintView",
    "openOSINTToolById(toolId)",
    "openOSINTDetail(tool)",
    "closeOSINTDetail()"
].forEach(signature => {
    if (!workspaceManager.includes(signature)) failures.push(`WORKSPACE_MANAGER_MISSING:${signature}`);
});

if (!ui.includes("classes/workspaces/osintTools.registry.js")) {
    failures.push("OSINT_REGISTRY_NOT_LOADED");
}

console.log(`OSINT_CATEGORIES: ${registry.CATEGORIES.length}`);
console.log(`OSINT_TOOLS: ${registry.TOOLS.length}`);
console.log(`OSINT_DUPLICATE_IDS: ${registry.TOOLS.length - toolIds.size}`);
console.log(`OSINT_WORKSPACE: ${failures.length ? "FAIL" : "OK"}`);

if (failures.length) {
    failures.forEach(failure => console.error(failure));
    process.exitCode = 1;
}
