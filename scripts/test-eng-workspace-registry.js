#!/usr/bin/env node

"use strict";

const registry = require("../src/classes/workspaces/engineeringTools.registry.js");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

const requiredCategories = ["cad", "simulation", "manufacturing", "calculators", "materials", "research", "standards", "projects"];
const ids = new Set();
const failures = [];

for (const category of requiredCategories) {
    if (!registry.CATEGORIES.some(item => item.id === category)) failures.push(`missing category ${category}`);
}

for (const tool of registry.TOOLS) {
    if (!tool.id || !tool.title || !tool.type || !tool.category || !tool.status) failures.push(`invalid tool ${tool.id || tool.title}`);
    if (ids.has(tool.id)) failures.push(`duplicate id ${tool.id}`);
    ids.add(tool.id);
    if (tool.type === "web" && !tool.url) failures.push(`web tool missing url ${tool.id}`);
    if (tool.type === "app" && !(tool.appName || tool.bundleId || tool.aliases)) failures.push(`app tool missing app hint ${tool.id}`);
    if (tool.type === "internal" && !tool.actionId) failures.push(`internal tool missing action id ${tool.id}`);
}

print("ENG_REGISTRY_CATEGORIES", requiredCategories.every(category => registry.CATEGORIES.some(item => item.id === category)) ? "OK" : "FAIL");
print("ENG_REGISTRY_TOOLS", registry.TOOLS.length >= 40 ? "OK" : "FAIL");
print("ENG_REGISTRY_DUPLICATES", failures.some(item => item.includes("duplicate")) ? "FAIL" : "OK");
print("ENG_REGISTRY_WEB_URLS", failures.some(item => item.includes("missing url")) ? "FAIL" : "OK");
print("ENG_REGISTRY_APP_HINTS", failures.some(item => item.includes("app hint")) ? "FAIL" : "OK");
print("ENG_REGISTRY_INTERNAL_ACTIONS", failures.some(item => item.includes("action id")) ? "FAIL" : "OK");
print("ENG_WORKSPACE_REGISTRY", failures.length ? "FAIL" : "OK");

if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}
