(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTProviderSchema = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const ENUMS = Object.freeze({
        providerType: Object.freeze(["EXTERNAL_WEB", "REST_API", "LOCAL_TOOL", "SYSTEM_INTEGRATION", "REFERENCE"]),
        accessMode: Object.freeze(["WEB", "API", "LOCAL", "REFERENCE_ONLY"]),
        providerStatus: Object.freeze(["ACTIVE", "LINK_ONLY", "REFERENCE_ONLY", "UNSUPPORTED", "DISABLED"]),
        riskProfile: Object.freeze(["PASSIVE", "ACCOUNT_REQUIRED", "API_KEY_REQUIRED", "COMMERCIAL", "SENSITIVE", "HIGH_ABUSE_POTENTIAL"]),
        legalStatus: Object.freeze(["GENERALLY_LEGAL", "AUTHORIZATION_REQUIRED", "CONTEXT_DEPENDENT", "JURISDICTION_DEPENDENT", "POTENTIALLY_ILLEGAL", "UNKNOWN"]),
        sourceConfidence: Object.freeze(["VERIFIED_OFFICIAL", "VERIFIED_PUBLIC", "MULTIPLE_PUBLIC_SOURCES", "UNVERIFIED", "HISTORICAL"])
    });
    const RUNTIME_ADAPTERS = Object.freeze(["EXTERNAL_WEB", "WAYBACK_AVAILABILITY", "LOCAL_TOOL", "SYSTEM_INTEGRATION", "REFERENCE_ONLY"]);

    const CAPABILITIES = Object.freeze([
        "RESEARCH_DISCOVERY",
        "HISTORICAL_ARCHIVE",
        "EVIDENCE_PRESERVATION",
        "INFRASTRUCTURE_CONTEXT",
        "THREAT_REPUTATION",
        "GEOSPATIAL_VERIFICATION",
        "MEDIA_VERIFICATION",
        "ENTITY_RESEARCH",
        "PUBLIC_PRESENCE",
        "TRANSPORT_MONITORING",
        "DATA_ANALYSIS"
    ]);

    const REQUIRED_FIELDS = Object.freeze([
        "id",
        "name",
        "shortName",
        "description",
        "category",
        "capabilities",
        "providerType",
        "accessMode",
        "providerStatus",
        "riskProfile",
        "legalStatus",
        "inputs",
        "outputs",
        "authentication",
        "costModel",
        "officialUrl",
        "docsUrl",
        "launchAllowed",
        "copyUrlAllowed",
        "integrationAllowed",
        "installationAllowed",
        "referenceReason",
        "legalDisclaimer",
        "jurisdictionNote",
        "tags",
        "lastReviewed",
        "sourceConfidence",
        "runtimeAdapter"
    ]);

    const ACCESS_FOR_TYPE = Object.freeze({
        EXTERNAL_WEB: "WEB",
        REST_API: "API",
        LOCAL_TOOL: "LOCAL",
        SYSTEM_INTEGRATION: "LOCAL",
        REFERENCE: "REFERENCE_ONLY"
    });

    function isPlainObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function isNonEmptyString(value) {
        return typeof value === "string" && value.trim().length > 0;
    }

    function isOptionalUrl(value) {
        if (value === null || value === undefined || value === "") return true;
        if (!isNonEmptyString(value)) return false;
        try {
            const parsed = new URL(value);
            return parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch (error) {
            return false;
        }
    }

    function isOperationalUrl(value) {
        return isNonEmptyString(value);
    }

    function isReferenceOnly(provider) {
        return provider && provider.providerType === "REFERENCE"
            && provider.accessMode === "REFERENCE_ONLY"
            && provider.providerStatus === "REFERENCE_ONLY";
    }

    function hasKnownEnum(group, value) {
        return ENUMS[group].includes(value);
    }

    function validateProvider(provider, options = {}) {
        const errors = [];
        const categoryIds = new Set(options.categories || []);

        if (!isPlainObject(provider)) return ["provider must be an object"];

        REQUIRED_FIELDS.forEach(field => {
            if (!(field in provider)) errors.push(`missing required field: ${field}`);
        });
        if (errors.length) return errors;

        ["id", "name", "shortName", "description", "category", "authentication", "costModel", "referenceReason", "legalDisclaimer", "jurisdictionNote", "lastReviewed"].forEach(field => {
            if (!isNonEmptyString(provider[field])) errors.push(`${field} must be a non-empty string`);
        });
        ["capabilities", "inputs", "outputs", "tags"].forEach(field => {
            if (!Array.isArray(provider[field])) errors.push(`${field} must be an array`);
        });
        ["launchAllowed", "copyUrlAllowed", "integrationAllowed", "installationAllowed"].forEach(field => {
            if (typeof provider[field] !== "boolean") errors.push(`${field} must be boolean`);
        });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(provider.lastReviewed || "")) errors.push("lastReviewed must use YYYY-MM-DD");
        if (categoryIds.size && !categoryIds.has(provider.category)) errors.push(`unknown category: ${provider.category}`);
        if (provider.capabilities.some(capability => !CAPABILITIES.includes(capability))) errors.push(`unknown capability on ${provider.id}`);

        ["providerType", "accessMode", "providerStatus", "riskProfile", "legalStatus", "sourceConfidence"].forEach(group => {
            if (!hasKnownEnum(group, provider[group])) errors.push(`invalid ${group}: ${provider[group]}`);
        });
        if (!RUNTIME_ADAPTERS.includes(provider.runtimeAdapter)) errors.push(`invalid runtimeAdapter: ${provider.runtimeAdapter}`);
        ["officialUrl", "docsUrl", "publicReferenceUrl"].forEach(field => {
            if (!isOptionalUrl(provider[field])) errors.push(`${field} must be an http(s) URL or null`);
        });

        const expectedAccess = ACCESS_FOR_TYPE[provider.providerType];
        if (expectedAccess && provider.accessMode !== expectedAccess) {
            errors.push(`providerType/accessMode mismatch: ${provider.providerType}/${provider.accessMode}`);
        }

        const referenceOnly = isReferenceOnly(provider);
        if (provider.accessMode === "REFERENCE_ONLY" && !referenceOnly) errors.push("REFERENCE_ONLY access requires REFERENCE provider/status");
        if (provider.providerStatus === "REFERENCE_ONLY" && !referenceOnly) errors.push("REFERENCE_ONLY status requires REFERENCE provider/access");
        if (referenceOnly) {
            if (provider.launchAllowed || provider.copyUrlAllowed || provider.integrationAllowed || provider.installationAllowed) {
                errors.push("REFERENCE_ONLY permissions must all be false");
            }
            if (isOperationalUrl(provider.officialUrl) || isOperationalUrl(provider.docsUrl) || isOperationalUrl(provider.publicReferenceUrl)) {
                errors.push("REFERENCE_ONLY cannot include an operational URL");
            }
            if (provider.runtimeAdapter !== "REFERENCE_ONLY") errors.push("REFERENCE_ONLY requires REFERENCE_ONLY runtimeAdapter");
        }

        if (provider.launchAllowed && (provider.accessMode !== "WEB" || provider.providerStatus === "REFERENCE_ONLY" || !isOperationalUrl(provider.officialUrl))) {
            errors.push("launchAllowed requires a launchable WEB provider with officialUrl");
        }
        if (provider.copyUrlAllowed && (!provider.launchAllowed || !isOperationalUrl(provider.officialUrl))) {
            errors.push("copyUrlAllowed requires an allowed official URL launch");
        }
        if (provider.legalStatus === "POTENTIALLY_ILLEGAL" && provider.providerStatus === "ACTIVE") {
            errors.push("POTENTIALLY_ILLEGAL providers cannot be ACTIVE without an explicit future review model");
        }
        if (provider.riskProfile === "HIGH_ABUSE_POTENTIAL" && provider.integrationAllowed) {
            errors.push("HIGH_ABUSE_POTENTIAL providers cannot be integrated without an explicit future policy review model");
        }
        if (provider.runtimeAdapter === "WAYBACK_AVAILABILITY") {
            if (provider.id !== "wayback" || provider.providerType !== "REST_API" || provider.accessMode !== "API" || !provider.integrationAllowed) {
                errors.push("WAYBACK_AVAILABILITY runtimeAdapter requires the approved Wayback REST API provider configuration");
            }
        }
        return errors;
    }

    function validateRegistry(providers, categories) {
        const errors = [];
        const list = Array.isArray(providers) ? providers : [];
        const categoryIds = (Array.isArray(categories) ? categories : []).map(category => category.id).filter(Boolean);
        const ids = new Set();

        list.forEach(provider => {
            const id = provider && provider.id || "unknown";
            if (ids.has(id)) errors.push(`duplicate provider id: ${id}`);
            ids.add(id);
            validateProvider(provider, {categories: categoryIds}).forEach(error => errors.push(`${id}: ${error}`));
        });
        if (!list.length) errors.push("registry has no providers");
        return errors;
    }

    function assertValidRegistry(providers, categories) {
        const errors = validateRegistry(providers, categories);
        if (errors.length) throw new Error(`OSINT provider registry invalid:\n- ${errors.join("\n- ")}`);
        return true;
    }

    return Object.freeze({
        VERSION: "1.0.0",
        ENUMS,
        RUNTIME_ADAPTERS,
        CAPABILITIES,
        REQUIRED_FIELDS,
        validateProvider,
        validateRegistry,
        assertValidRegistry,
        isReferenceOnly
    });
});
