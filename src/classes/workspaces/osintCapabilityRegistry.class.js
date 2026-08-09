(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTCapabilityRegistry = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const DEFINITIONS = Object.freeze([
        {id: "RESEARCH_DISCOVERY", name: "Research discovery", description: "Manual public-source discovery and research.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: true},
        {id: "HISTORICAL_ARCHIVE", name: "Historical archive", description: "Manual public archive availability checks.", inputTypes: ["URL", "DOMAIN"], outputTypes: ["SNAPSHOT_AVAILABILITY"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: true, riskClass: "PASSIVE", enabled: true},
        {id: "EVIDENCE_PRESERVATION", name: "Evidence preservation", description: "Reference capability only; no capture runtime is enabled.", inputTypes: [], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: false},
        {id: "INFRASTRUCTURE_CONTEXT", name: "Infrastructure context", description: "Passive public infrastructure context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "SENSITIVE", enabled: false},
        {id: "THREAT_REPUTATION", name: "Threat reputation", description: "Public threat and reputation context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "SENSITIVE", enabled: false},
        {id: "GEOSPATIAL_VERIFICATION", name: "Geospatial verification", description: "Explicit, passive normalization and public geospatial context checks.", inputTypes: ["DECIMAL_COORDINATES", "DMS_COORDINATES", "PLACE_TEXT"], outputTypes: ["NORMALIZED_GEO_CONTEXT", "PROVIDER_OBSERVATION"], supportsMultipleProviders: true, supportsEvidence: true, supportsCancellation: true, riskClass: "PASSIVE", enabled: true},
        {id: "MEDIA_VERIFICATION", name: "Media verification", description: "Public media-verification context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: false},
        {id: "ENTITY_RESEARCH", name: "Entity research", description: "Public entity and records context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: false},
        {id: "PUBLIC_PRESENCE", name: "Public presence", description: "Public organisation and brand context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: false},
        {id: "TRANSPORT_MONITORING", name: "Transport monitoring", description: "Public transport and space context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: false},
        {id: "DATA_ANALYSIS", name: "Data analysis", description: "Local and public data-analysis context.", inputTypes: ["MANUAL_QUERY"], outputTypes: ["PUBLIC_REFERENCE_CONTEXT"], supportsMultipleProviders: true, supportsEvidence: false, supportsCancellation: false, riskClass: "PASSIVE", enabled: false}
    ].map(item => Object.freeze(item)));

    class CapabilityRegistry {
        constructor(providerRegistry) {
            this.providerRegistry = providerRegistry || null;
            this.byId = new Map(DEFINITIONS.map(definition => [definition.id, definition]));
        }

        getCapability(id) {
            return this.byId.get(String(id || "")) || null;
        }

        getCapabilities() {
            return DEFINITIONS.slice();
        }

        getProviders(capabilityId) {
            const providers = this.providerRegistry && typeof this.providerRegistry.getProviders === "function"
                ? this.providerRegistry.getProviders({capability: capabilityId})
                : [];
            return providers.slice();
        }

        getPreferredProvider(capabilityId, predicate = null) {
            const providers = this.getProviders(capabilityId);
            return providers.find(provider => !predicate || predicate(provider)) || null;
        }
    }

    function getCapability(id) {
        return DEFINITIONS.find(definition => definition.id === String(id || "")) || null;
    }

    return Object.freeze({DEFINITIONS, CapabilityRegistry, getCapability});
});
