#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const schema = require(path.join(ROOT, "src/classes/workspaces/osintProviderSchema.class.js"));
const policy = require(path.join(ROOT, "src/classes/workspaces/osintProviderPolicy.class.js"));
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const boot = fs.readFileSync(path.join(ROOT, "src/_boot.js"), "utf8");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

const failures = [];
const requiredCategories = ["discovery", "archives", "infrastructure", "threat", "geospatial", "entities", "presence", "data", "transport"];

const categoriesPresent = requiredCategories.every(id => registry.CATEGORIES.some(item => item.id === id));
if (!categoriesPresent) failures.push("missing OSINT category");

const discovery = registry.getProvidersForCategory("discovery");
const referenceOnly = registry.getProviders({providerStatus: "REFERENCE_ONLY"});
const registryValid = schema.validateRegistry(registry.PROVIDERS, registry.CATEGORIES).length === 0;
if (!registryValid) failures.push("normalised provider registry is invalid");
if (!referenceOnly.length || !referenceOnly.every(provider => !policy.canLaunch(provider).allowed)) failures.push("reference-only provider policy is incomplete");

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

const workspaceChecks = ["renderOSINT", "launchOSINTProvider", "osintPolicyFilterControls"].every(value => manager.includes(value));
if (!workspaceChecks) failures.push("workspace OSINT normalized registry integration missing");
if (manager.includes("OsintAccessController")) failures.push("legacy native controller was reconnected unexpectedly");
if (boot.includes("osint-provider-")) failures.push("new OSINT IPC was registered unexpectedly");

print("OSINT_REGISTRY", categoriesPresent ? "OK" : "FAIL");
print("OSINT_DISCOVERY_TOOLS", discovery.length);
print("OSINT_PROVIDER_SCHEMA", registryValid ? "OK" : "FAIL");
print("OSINT_REFERENCE_ONLY", referenceOnly.length ? `OK (${referenceOnly.length})` : "FAIL");
print("OSINT_ISOLATED_VIEW", secureViewChecks ? "OK" : "FAIL");
print("OSINT_WORKSPACE", workspaceChecks ? "OK" : "FAIL");
print("OSINT_NATIVE_ACCESS_FOUNDATION", failures.length ? "FAIL" : "OK");

if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exit(1);
}
