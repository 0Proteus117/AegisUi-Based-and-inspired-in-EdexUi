(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTEntityResolution = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const CAPABILITY = "ENTITY_RESOLUTION";
    const ENTITY_TYPES = Object.freeze(["PERSON", "ORGANIZATION", "DOMAIN", "EMAIL", "USERNAME", "SOURCE", "DOCUMENT", "LOCATION", "IP", "ASN", "UNKNOWN_ENTITY"]);
    const STATUSES = Object.freeze(["UNVERIFIED", "PARTIALLY_RESOLVED", "CONSISTENT", "INCONSISTENT", "AMBIGUOUS", "CONFIRMED_BY_ANALYST"]);
    const CONFIDENCE = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
    const RELATIONSHIP_TYPES = Object.freeze(["AUTHORED_BY", "BELONGS_TO", "USES_DOMAIN", "USES_EMAIL_DOMAIN", "RESOLVES_TO", "LOCATED_AT", "PUBLISHED_BY", "MENTIONS", "ASSOCIATED_WITH", "HOSTED_BY", "REGISTERED_TO", "OBSERVED_WITH", "POTENTIALLY_SAME_AS"]);
    const SOURCE_TYPES = Object.freeze(["ANALYST_OBSERVATION", "SOURCE_METADATA", "DOMAIN_CONTEXT", "GEO_CONTEXT", "MEDIA_METADATA", "CASE_EVIDENCE", "DERIVED_NORMALIZATION"]);
    const MAX_ENTITIES = 50;
    const MAX_RELATIONSHIPS = 100;

    class EntityResolutionError extends Error {
        constructor(code, message) { super(message); this.name = "EntityResolutionError"; this.code = code; }
    }

    function clean(value, limit = 240) {
        return String(value === null || value === undefined ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
    }

    function asEnum(value, values, label) {
        const normalized = clean(value, 80).toUpperCase();
        if (!values.includes(normalized)) throw new EntityResolutionError("INVALID_INPUT", `${label} is not supported.`);
        return normalized;
    }

    function timestamp(value) {
        const parsed = value ? new Date(value) : new Date();
        if (Number.isNaN(parsed.getTime())) throw new EntityResolutionError("INVALID_INPUT", "Observation timestamp is invalid.");
        return parsed.toISOString();
    }

    function createId(prefix, index = 0) {
        const random = Math.random().toString(36).slice(2, 8);
        return `${prefix}-${Date.now().toString(36)}-${index.toString(36)}${random}`;
    }

    function canonicalIdentifier(type, value) {
        const text = clean(value, 320);
        if (!text) return "";
        if (["DOMAIN", "EMAIL", "USERNAME", "IP", "ASN"].includes(type)) return text.toLowerCase();
        if (type === "SOURCE" || type === "DOCUMENT") return text.replace(/#.*$/, "").toLowerCase();
        return text.toLocaleLowerCase();
    }

    function normalizeAttribute(input, entityType) {
        const field = clean(input && input.field || "IDENTIFIER", 80).toUpperCase();
        const value = clean(input && input.value, 320);
        if (!value) throw new EntityResolutionError("INVALID_INPUT", "An entity attribute requires a value.");
        const sourceType = asEnum(input && input.sourceType || "ANALYST_OBSERVATION", SOURCE_TYPES, "Attribute source type");
        const confidence = asEnum(input && input.confidence || "LOW", CONFIDENCE, "Attribute confidence");
        const status = asEnum(input && input.status || "UNVERIFIED", STATUSES, "Attribute status");
        return Object.freeze({
            id: clean(input && input.id || createId("attribute"), 96),
            field,
            value,
            canonicalValue: canonicalIdentifier(entityType, value),
            sourceType,
            sourceIdentifier: clean(input && input.sourceIdentifier || "ANALYST ENTERED", 160),
            observedAt: timestamp(input && input.observedAt),
            confidence,
            status
        });
    }

    function createEntity(input = {}) {
        const type = asEnum(input.type || "UNKNOWN_ENTITY", ENTITY_TYPES, "Entity type");
        const label = clean(input.label, 240);
        if (!label) throw new EntityResolutionError("INVALID_INPUT", "An entity requires a label.");
        const aliases = [...new Set((Array.isArray(input.aliases) ? input.aliases : []).map(item => clean(item, 160)).filter(Boolean))].slice(0, 12);
        const attributes = (Array.isArray(input.attributes) ? input.attributes : []).slice(0, 24).map(item => normalizeAttribute(item, type));
        if (!attributes.length) attributes.push(normalizeAttribute({field: "LABEL", value: label, sourceType: input.sourceType || "ANALYST_OBSERVATION", sourceIdentifier: input.sourceIdentifier || "ANALYST ENTERED", confidence: input.confidence || "LOW", status: input.status || "UNVERIFIED", observedAt: input.observedAt}, type));
        return Object.freeze({
            id: clean(input.id || createId("entity"), 96), type, label, aliases: Object.freeze(aliases),
            identifiers: Object.freeze(attributes.filter(attribute => ["IDENTIFIER", "LABEL", "DOMAIN", "EMAIL", "IP", "ASN", "DOI", "URL", "USERNAME"].includes(attribute.field)).map(attribute => ({field: attribute.field, value: attribute.value, canonicalValue: attribute.canonicalValue}))),
            attributes: Object.freeze(attributes), observations: Object.freeze([]), relationships: Object.freeze([]),
            confidence: asEnum(input.confidence || "LOW", CONFIDENCE, "Entity confidence"),
            status: asEnum(input.status || "UNVERIFIED", STATUSES, "Entity status"),
            createdAt: timestamp(input.createdAt), updatedAt: timestamp(input.updatedAt), caseId: input.caseId ? clean(input.caseId, 96) : null
        });
    }

    function normalizeRelationship(input, entities = []) {
        const fromId = clean(input && input.fromId, 96); const toId = clean(input && input.toId, 96);
        if (!fromId || !toId || fromId === toId) throw new EntityResolutionError("INVALID_INPUT", "A relationship requires two distinct entities.");
        if (!entities.some(entity => entity.id === fromId) || !entities.some(entity => entity.id === toId)) throw new EntityResolutionError("INVALID_INPUT", "Relationship entities must exist in this investigation.");
        const evidence = (Array.isArray(input && input.evidence) ? input.evidence : []).slice(0, 12).map(item => Object.freeze({
            summary: clean(item && item.summary, 500), sourceType: asEnum(item && item.sourceType || "ANALYST_OBSERVATION", SOURCE_TYPES, "Relationship evidence source"),
            sourceIdentifier: clean(item && item.sourceIdentifier || "ANALYST ENTERED", 160), observedAt: timestamp(item && item.observedAt), confidence: asEnum(item && item.confidence || "LOW", CONFIDENCE, "Relationship evidence confidence")
        })).filter(item => item.summary);
        if (!evidence.length) throw new EntityResolutionError("EVIDENCE_REQUIRED", "A relationship requires at least one supporting observation.");
        const contradictions = (Array.isArray(input && input.contradictions) ? input.contradictions : []).slice(0, 8).map(item => clean(item, 400)).filter(Boolean);
        return Object.freeze({
            id: clean(input && input.id || createId("relationship"), 96), fromId, toId,
            type: asEnum(input && input.type || "ASSOCIATED_WITH", RELATIONSHIP_TYPES, "Relationship type"),
            evidence: Object.freeze(evidence), contradictions: Object.freeze(contradictions),
            confidence: asEnum(input && input.confidence || "LOW", CONFIDENCE, "Relationship confidence"),
            status: asEnum(input && input.status || "PARTIALLY_RESOLVED", STATUSES, "Relationship status"),
            createdAt: timestamp(input && input.createdAt), updatedAt: timestamp(input && input.updatedAt), analystNote: clean(input && input.analystNote, 1200)
        });
    }

    function createState(input = {}) {
        const entities = (Array.isArray(input.entities) ? input.entities : []).slice(0, MAX_ENTITIES).map(createEntity);
        const relationships = (Array.isArray(input.relationships) ? input.relationships : []).slice(0, MAX_RELATIONSHIPS).map(item => normalizeRelationship(item, entities));
        return {mode: input.mode || "CATALOG", entities, relationships, selectedEntityId: entities.some(item => item.id === input.selectedEntityId) ? input.selectedEntityId : entities[0] && entities[0].id || null, typeFilter: input.typeFilter || "", relationshipFilter: input.relationshipFilter || "", lastError: null, analystNote: clean(input.analystNote, 4000)};
    }

    function addEntity(state, input) {
        if ((state.entities || []).length >= MAX_ENTITIES) throw new EntityResolutionError("LIMIT_REACHED", `Entity graph is limited to ${MAX_ENTITIES} nodes.`);
        const entity = createEntity(input);
        return {...state, entities: [...state.entities, entity], selectedEntityId: entity.id, lastError: null};
    }

    function updateEntity(state, entityId, patch = {}) {
        const id = clean(entityId, 96);
        const current = (state.entities || []).find(entity => entity.id === id);
        if (!current) throw new EntityResolutionError("INVALID_INPUT", "Choose an existing entity to edit.");
        const replacement = createEntity({...current, ...patch, id: current.id, type: current.type, attributes: current.attributes, createdAt: current.createdAt, updatedAt: new Date().toISOString()});
        return {...state, entities: state.entities.map(entity => entity.id === id ? replacement : entity), selectedEntityId: id, lastError: null};
    }

    function addRelationship(state, input) {
        if ((state.relationships || []).length >= MAX_RELATIONSHIPS) throw new EntityResolutionError("LIMIT_REACHED", `Entity graph is limited to ${MAX_RELATIONSHIPS} relationships.`);
        const relationship = normalizeRelationship(input, state.entities || []);
        return {...state, relationships: [...state.relationships, relationship], lastError: null};
    }

    function archiveEntity(state, entityId) {
        const id = clean(entityId, 96);
        return {...state, entities: state.entities.map(entity => entity.id === id ? Object.freeze({...entity, status: "INCONSISTENT", updatedAt: new Date().toISOString(), archived: true}) : entity), relationships: state.relationships.filter(item => item.fromId !== id && item.toId !== id), selectedEntityId: state.selectedEntityId === id ? null : state.selectedEntityId};
    }

    function exactDuplicateHints(entities) {
        const buckets = new Map();
        (entities || []).forEach(entity => (entity.identifiers || []).forEach(identifier => {
            if (!identifier.canonicalValue || !["DOMAIN", "EMAIL", "IP", "ASN", "DOI", "URL", "IDENTIFIER"].includes(identifier.field)) return;
            const key = `${identifier.field}:${identifier.canonicalValue}`;
            const list = buckets.get(key) || []; list.push(entity.id); buckets.set(key, list);
        }));
        return [...buckets.entries()].filter(([, ids]) => ids.length > 1).map(([key, entityIds]) => Object.freeze({key, entityIds: Object.freeze(entityIds.slice()), strength: "EXACT_IDENTIFIER"}));
    }

    function mergeConfirmed(state, keepId, mergeId, confirmation) {
        if (confirmation !== true) throw new EntityResolutionError("CONFIRMATION_REQUIRED", "Explicit analyst confirmation is required to merge entities.");
        if (keepId === mergeId) throw new EntityResolutionError("INVALID_INPUT", "Choose two distinct entities to merge.");
        const keep = state.entities.find(entity => entity.id === keepId); const merging = state.entities.find(entity => entity.id === mergeId);
        if (!keep || !merging) throw new EntityResolutionError("INVALID_INPUT", "Both entities must exist before merging.");
        const attributes = [...keep.attributes, ...merging.attributes].filter((item, index, all) => all.findIndex(other => other.field === item.field && other.canonicalValue === item.canonicalValue) === index).slice(0, 24);
        const aliases = [...new Set([...keep.aliases, merging.label, ...merging.aliases])].slice(0, 12);
        const replacement = createEntity({...keep, aliases, attributes, confidence: "HIGH", status: "CONFIRMED_BY_ANALYST", updatedAt: new Date().toISOString()});
        const relationships = state.relationships.map(item => ({...item, fromId: item.fromId === mergeId ? keepId : item.fromId, toId: item.toId === mergeId ? keepId : item.toId, updatedAt: new Date().toISOString()})).filter(item => item.fromId !== item.toId);
        return {...state, entities: state.entities.filter(entity => entity.id !== mergeId).map(entity => entity.id === keepId ? replacement : entity), relationships, selectedEntityId: keepId, lastError: null};
    }

    function graph(state, filters = {}) {
        const type = filters.type || state.typeFilter || "";
        const relationshipStatus = filters.relationshipStatus || state.relationshipFilter || "";
        const nodes = state.entities.filter(entity => !entity.archived && (!type || entity.type === type)).slice(0, MAX_ENTITIES);
        const ids = new Set(nodes.map(node => node.id));
        const edges = state.relationships.filter(item => ids.has(item.fromId) && ids.has(item.toId) && (!relationshipStatus || item.status === relationshipStatus)).slice(0, MAX_RELATIONSHIPS);
        return Object.freeze({nodes: Object.freeze(nodes), edges: Object.freeze(edges), limits: Object.freeze({nodes: MAX_ENTITIES, edges: MAX_RELATIONSHIPS})});
    }

    function toEvidenceData(state, entityId, analystNote = "") {
        const entity = (state.entities || []).find(item => item.id === entityId);
        if (!entity) throw new EntityResolutionError("INVALID_INPUT", "Select one entity before evidence promotion.");
        const relationships = (state.relationships || []).filter(item => item.fromId === entity.id || item.toId === entity.id).slice(0, 20).map(item => ({type: item.type, fromId: item.fromId, toId: item.toId, confidence: item.confidence, status: item.status, evidence: item.evidence, contradictions: item.contradictions}));
        return Object.freeze({entityResolution: Object.freeze({entity: {id: entity.id, type: entity.type, label: entity.label, aliases: entity.aliases, attributes: entity.attributes, confidence: entity.confidence, status: entity.status}, relationships, analystNote: clean(analystNote, 4000), provenance: "LOCAL_ENTITY_RESOLUTION", persistence: "EVIDENCE_PROMOTION_ONLY"})});
    }

    return Object.freeze({CAPABILITY, ENTITY_TYPES, STATUSES, CONFIDENCE, RELATIONSHIP_TYPES, SOURCE_TYPES, MAX_ENTITIES, MAX_RELATIONSHIPS, EntityResolutionError, clean, canonicalIdentifier, createEntity, normalizeAttribute, normalizeRelationship, createState, addEntity, updateEntity, addRelationship, archiveEntity, exactDuplicateHints, mergeConfirmed, graph, toEvidenceData});
});
