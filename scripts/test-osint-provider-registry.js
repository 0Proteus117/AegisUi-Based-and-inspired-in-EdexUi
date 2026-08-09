#!/usr/bin/env node

"use strict";

const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const schema = require(path.join(ROOT, "src/classes/workspaces/osintProviderSchema.class.js"));
const policy = require(path.join(ROOT, "src/classes/workspaces/osintProviderPolicy.class.js"));
const registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));

const failures = [];

function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key}${condition ? "" : ` · ${detail}`}`);
}

function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

const providerErrors = registry.validate();
const providers = registry.PROVIDERS;
const legacyNormalProviders = providers.filter(provider => !policy.isReferenceOnly(provider) && provider.id !== "open-meteo-geocoding");
const normalProviders = providers.filter(provider => !policy.isReferenceOnly(provider));
const referenceProviders = providers.filter(provider => policy.isReferenceOnly(provider));
const providerIds = new Set(providers.map(provider => provider.id));
const categoryCounts = registry.getCategoryCounts();

check("OSINT_SCHEMA_VERSION", registry.SCHEMA_VERSION === "1.0.0", registry.SCHEMA_VERSION);
check("OSINT_PROVIDER_SCHEMA", providerErrors.length === 0, providerErrors.join(" | ") || "OK");
check("OSINT_REQUIRED_FIELDS", schema.REQUIRED_FIELDS.every(field => providers.every(provider => Object.prototype.hasOwnProperty.call(provider, field))));
check("OSINT_PROVIDER_IDS", providerIds.size === providers.length, `${providerIds.size}/${providers.length}`);
check("OSINT_CATEGORIES", registry.CATEGORIES.length === 9, String(registry.CATEGORIES.length));
check("OSINT_MIGRATED_LEGACY_TOOLS", legacyNormalProviders.length === 161, String(legacyNormalProviders.length));
check("OSINT_TOTAL_PROVIDERS", providers.length === 163, String(providers.length));
check("OSINT_NORMAL_URLS", normalProviders.every(provider => typeof provider.officialUrl === "string" && /^https?:\/\//.test(provider.officialUrl)));
check("OSINT_COMPATIBILITY_EXPORT", registry.TOOLS.length === providers.length && registry.TOOLS.every(tool => providerIds.has(tool.id)));
check("OSINT_CATEGORY_COUNTS_DERIVED", registry.CATEGORIES.every(category => category.count === categoryCounts[category.id] && category.count === registry.getProvidersForCategory(category.id).length));
check("OSINT_FEATURED_DERIVED", registry.FEATURED.join(",") === registry.getFeaturedProviders().map(provider => provider.id).join(","));
check("OSINT_FEATURED_COUNT", registry.FEATURED.length === 4, String(registry.FEATURED.length));
check("OSINT_STATUS_FILTER", registry.getProviders({providerStatus: "REFERENCE_ONLY"}).length === 1);
check("OSINT_RISK_FILTER", registry.getProviders({riskProfile: "HIGH_ABUSE_POTENTIAL"}).length === 1);
check("OSINT_LEGAL_FILTER", registry.getProviders({legalStatus: "AUTHORIZATION_REQUIRED"}).length === 1);

const geoProvider = registry.getProvider("open-meteo-geocoding");
check("OSINT_GEO_PROVIDER", geoProvider && geoProvider.runtimeAdapter === "OPEN_METEO_GEOCODING" && policy.canQuery(geoProvider).allowed);
check("OSINT_GEO_PROVIDER_FIXED_POLICY", geoProvider && !geoProvider.launchAllowed && !geoProvider.copyUrlAllowed && geoProvider.integrationAllowed);

const base = registry.getProvider("wayback");
const missingRequired = copy(base);
delete missingRequired.name;
check("OSINT_SCHEMA_REJECTS_MISSING_FIELD", schema.validateProvider(missingRequired, {categories: registry.CATEGORIES.map(category => category.id)}).some(error => error.includes("missing required field: name")));

const unknownCategory = copy(base);
unknownCategory.category = "unknown-category";
check("OSINT_SCHEMA_REJECTS_UNKNOWN_CATEGORY", schema.validateProvider(unknownCategory, {categories: registry.CATEGORIES.map(category => category.id)}).some(error => error.includes("unknown category")));

const unknownCapability = copy(base);
unknownCapability.capabilities = ["UNKNOWN_CAPABILITY"];
check("OSINT_SCHEMA_REJECTS_UNKNOWN_CAPABILITY", schema.validateProvider(unknownCapability, {categories: registry.CATEGORIES.map(category => category.id)}).some(error => error.includes("unknown capability")));

const invalidEnum = copy(base);
invalidEnum.providerStatus = "MYSTERY";
check("OSINT_SCHEMA_REJECTS_INVALID_ENUM", schema.validateProvider(invalidEnum, {categories: registry.CATEGORIES.map(category => category.id)}).some(error => error.includes("invalid providerStatus")));

check("OSINT_SCHEMA_REJECTS_DUPLICATE_ID", schema.validateRegistry([...providers, copy(base)], registry.CATEGORIES).some(error => error.includes("duplicate provider id")));

const reference = referenceProviders[0];
check("OSINT_REFERENCE_ENTRY", Boolean(reference), reference ? reference.id : "MISSING");
check("OSINT_REFERENCE_POLICY", reference && !policy.canLaunch(reference).allowed && !policy.canCopyUrl(reference).allowed && !policy.canInstall(reference).allowed && !policy.canConfigure(reference).allowed && !policy.canIntegrate(reference).allowed);
check("OSINT_REFERENCE_NO_OPERATIONAL_URL", reference && !reference.officialUrl && !reference.docsUrl && !reference.publicReferenceUrl);
check("OSINT_REFERENCE_PERMISSIONS_FALSE", reference && !reference.launchAllowed && !reference.copyUrlAllowed && !reference.integrationAllowed && !reference.installationAllowed);

const contradictoryReference = copy(reference);
contradictoryReference.launchAllowed = true;
check("OSINT_SCHEMA_REJECTS_REFERENCE_LAUNCH", schema.validateProvider(contradictoryReference, {categories: registry.CATEGORIES.map(category => category.id)}).some(error => error.includes("REFERENCE_ONLY permissions")));

console.log(`OSINT_PROVIDER_TYPES: ${schema.ENUMS.providerType.length}`);
console.log(`OSINT_ACCESS_MODES: ${schema.ENUMS.accessMode.length}`);
console.log(`OSINT_PROVIDER_STATUSES: ${schema.ENUMS.providerStatus.length}`);
console.log(`OSINT_RISK_PROFILES: ${schema.ENUMS.riskProfile.length}`);
console.log(`OSINT_LEGAL_STATUSES: ${schema.ENUMS.legalStatus.length}`);
console.log(`OSINT_CAPABILITIES: ${schema.CAPABILITIES.length}`);
console.log(`OSINT_PROVIDER_REGISTRY: ${failures.length ? "FAIL" : "OK"}`);

if (failures.length) {
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exitCode = 1;
}
