#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const boot = fs.readFileSync(path.join(ROOT, "src/_boot.js"), "utf8");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

const failures = [];
const requiredCategories = [
    "discovery", "archives", "geospatial", "infrastructure", "media",
    "social", "research", "monitoring", "evidence"
];

const categoriesPresent = requiredCategories.every(id => registry.CATEGORIES.some(item => item.id === id));
if (!categoriesPresent) failures.push("missing OSINT category");

const discovery = registry.getToolsForCategory("discovery");
const nativeProvider = discovery.find(tool => tool.accessMode === "native_api" && tool.providerId === "wayback-availability");
const embedded = discovery.filter(tool => tool.accessMode === "embedded_web");
const embeddedValid = embedded.length >= 4 && embedded.every(tool => {
    try {
        return /^https:\/\//.test(tool.url) && Array.isArray(tool.allowedHosts) && tool.allowedHosts.length > 0;
    } catch (error) {
        return false;
    }
});
if (!nativeProvider) failures.push("Wayback native provider missing");
if (!embeddedValid) failures.push("embedded source allowlists are incomplete");

const secureViewChecks = [
    "WebContentsView",
    "nodeIntegration: false",
    "contextIsolation: true",
    "sandbox: true",
    "webviewTag: false",
    "osint-source-open",
    "osint-native-query",
    "persist:aegis-osint-sources",
    "snapshot.hostname.toLowerCase() !== \"web.archive.org\"",
    "snapshot.protocol = \"https:\""
].every(value => boot.includes(value));
if (!secureViewChecks) failures.push("isolated OSINT view checks missing");

const workspaceChecks = ["renderOsint", "OsintAccessController", "osintAccess.close"].every(value => manager.includes(value));
if (!workspaceChecks) failures.push("workspace OSINT integration missing");

print("OSINT_REGISTRY", categoriesPresent ? "OK" : "FAIL");
print("OSINT_DISCOVERY_TOOLS", discovery.length);
print("OSINT_NATIVE_PROVIDER", nativeProvider ? "WAYBACK_AVAILABILITY" : "MISSING");
print("OSINT_EMBEDDED_SOURCES", embeddedValid ? `OK (${embedded.length})` : "FAIL");
print("OSINT_ISOLATED_VIEW", secureViewChecks ? "OK" : "FAIL");
print("OSINT_WORKSPACE", workspaceChecks ? "OK" : "FAIL");
print("OSINT_NATIVE_ACCESS_FOUNDATION", failures.length ? "FAIL" : "OK");

if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}
