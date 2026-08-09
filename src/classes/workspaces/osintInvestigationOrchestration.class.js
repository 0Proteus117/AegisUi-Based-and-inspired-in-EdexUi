/*
 * OSINT Investigation Orchestration
 * Local, bounded navigation context for explicit cross-capability workflows.
 * This module deliberately has no network, IPC, storage, or provider runtime access.
 */
(function(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.OSINTInvestigationOrchestration = api;
})(typeof window !== "undefined" ? window : globalThis, function() {
    "use strict";

    const CONTEXT_VERSION = "1.0.0";
    const OBJECT_TYPES = Object.freeze(["ENTITY", "DOMAIN", "IP", "SOURCE", "DOCUMENT", "LOCATION", "MEDIA", "EVIDENCE", "UNKNOWN"]);
    const DESTINATIONS = Object.freeze(["DOMAIN_INFRASTRUCTURE_CONTEXT", "GEOSPATIAL_VERIFICATION", "SOURCE_VERIFICATION", "ENTITY_RESOLUTION", "EVIDENCE_DETAIL"]);
    const MAX_OBJECTS = 80;
    const MAX_ACTIONS = 5;

    class InvestigationOrchestrationError extends Error {
        constructor(code, message) { super(message); this.name = "InvestigationOrchestrationError"; this.code = code; }
    }

    function text(value, max = 500) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    }

    function identifier(value, fallback = null) {
        const result = text(value, 160).replace(/[^a-zA-Z0-9._:-]/g, "-");
        return result || fallback;
    }

    function safeIso(value) {
        const date = value ? new Date(value) : new Date();
        return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    function inferType(value) {
        const candidate = text(value, 24).toUpperCase();
        return OBJECT_TYPES.includes(candidate) ? candidate : "UNKNOWN";
    }

    function noSensitivePayload(payload) {
        const source = payload && typeof payload === "object" ? payload : {};
        const clean = {};
        ["target", "targetType", "latitude", "longitude", "sourceKind", "sourceInput", "entityId", "evidenceId", "label"].forEach(key => {
            if (source[key] !== undefined && source[key] !== null) clean[key] = typeof source[key] === "number" ? source[key] : text(source[key], key === "sourceInput" ? 2048 : 500);
        });
        return Object.freeze(clean);
    }

    function createContext(input = {}) {
        return Object.freeze({
            version: CONTEXT_VERSION,
            activeCaseId: identifier(input.activeCaseId),
            selectedObjectId: identifier(input.selectedObjectId),
            selectedObjectType: inferType(input.selectedObjectType),
            originatingCapability: text(input.originatingCapability, 80) || null,
            provenance: input.provenance && typeof input.provenance === "object" ? Object.freeze({
                sourceCapability: text(input.provenance.sourceCapability, 80) || null,
                sourceObjectId: identifier(input.provenance.sourceObjectId),
                sourceEvidenceId: identifier(input.provenance.sourceEvidenceId),
                sourceType: text(input.provenance.sourceType, 80) || null
            }) : null,
            availableHandoffs: Object.freeze([]),
            updatedAt: safeIso(input.updatedAt)
        });
    }

    function createObject(input = {}) {
        const type = inferType(input.type);
        const id = identifier(input.id, `object-${Math.random().toString(36).slice(2, 10)}`);
        return Object.freeze({
            id,
            type,
            label: text(input.label, 500) || "UNLABELLED OBSERVATION",
            capability: text(input.capability, 80) || "UNKNOWN",
            status: text(input.status, 80) || "UNVERIFIED",
            confidence: text(input.confidence, 24) || "LOW",
            evidenceId: identifier(input.evidenceId),
            sourceObjectId: identifier(input.sourceObjectId),
            provenance: Object.freeze({
                sourceCapability: text(input.provenance && input.provenance.sourceCapability || input.capability, 80) || "UNKNOWN",
                sourceEvidenceId: identifier(input.provenance && input.provenance.sourceEvidenceId || input.evidenceId),
                sourceObjectId: identifier(input.provenance && input.provenance.sourceObjectId || input.sourceObjectId || id),
                sourceType: text(input.provenance && input.provenance.sourceType, 80) || "NORMALIZED_EVIDENCE"
            }),
            payload: noSensitivePayload(input.payload),
            warnings: Object.freeze(Array.isArray(input.warnings) ? input.warnings.map(item => text(item, 240)).filter(Boolean).slice(0, 8) : [])
        });
    }

    function action(id, label, destination, reason = "") {
        return Object.freeze({id, label, destination, reason: text(reason, 240)});
    }

    function availableHandoffs(object) {
        if (!object || !OBJECT_TYPES.includes(object.type)) return Object.freeze([]);
        const actions = [];
        if (["DOMAIN", "IP"].includes(object.type) && object.payload.target) {
            actions.push(action("OPEN_DOMAIN_CONTEXT", "OPEN DOMAIN CONTEXT", "DOMAIN_INFRASTRUCTURE_CONTEXT"));
            actions.push(action("PROMOTE_TO_ENTITY", "PROMOTE TO ENTITY", "ENTITY_RESOLUTION"));
        }
        if (object.type === "LOCATION" && Number.isFinite(object.payload.latitude) && Number.isFinite(object.payload.longitude)) {
            actions.push(action("VERIFY_LOCATION", "VERIFY LOCATION", "GEOSPATIAL_VERIFICATION"));
            actions.push(action("PROMOTE_TO_ENTITY", "PROMOTE TO ENTITY", "ENTITY_RESOLUTION"));
        }
        if (["SOURCE", "DOCUMENT"].includes(object.type) && object.payload.sourceInput) {
            actions.push(action("OPEN_SOURCE_VERIFICATION", "OPEN SOURCE VERIFICATION", "SOURCE_VERIFICATION"));
            if (object.payload.target) actions.push(action("OPEN_DOMAIN_CONTEXT", "OPEN DOMAIN CONTEXT", "DOMAIN_INFRASTRUCTURE_CONTEXT"));
            actions.push(action("PROMOTE_TO_ENTITY", "PROMOTE TO ENTITY", "ENTITY_RESOLUTION"));
        }
        if (object.type === "MEDIA") {
            if (Number.isFinite(object.payload.latitude) && Number.isFinite(object.payload.longitude)) actions.push(action("VERIFY_LOCATION", "VERIFY LOCATION", "GEOSPATIAL_VERIFICATION"));
            if (object.evidenceId) actions.push(action("OPEN_EVIDENCE", "OPEN EVIDENCE", "EVIDENCE_DETAIL"));
        }
        if (object.type === "ENTITY") {
            if (object.payload.target) actions.push(action("OPEN_DOMAIN_CONTEXT", "OPEN DOMAIN CONTEXT", "DOMAIN_INFRASTRUCTURE_CONTEXT"));
            if (Number.isFinite(object.payload.latitude) && Number.isFinite(object.payload.longitude)) actions.push(action("VERIFY_LOCATION", "VERIFY LOCATION", "GEOSPATIAL_VERIFICATION"));
            actions.push(action("OPEN_ENTITY_WORKSPACE", "OPEN ENTITY WORKSPACE", "ENTITY_RESOLUTION"));
        }
        if (object.type === "EVIDENCE" && object.evidenceId) {
            actions.push(action("OPEN_EVIDENCE", "OPEN EVIDENCE", "EVIDENCE_DETAIL"));
            actions.push(action("LINK_TO_ENTITY", "LINK TO ENTITY", "ENTITY_RESOLUTION", "Explicit analyst review remains required before any relationship is created."));
        }
        return Object.freeze(actions.slice(0, MAX_ACTIONS));
    }

    function createHandoff(context, object, actionId) {
        const selected = object && createObject(object);
        const allowed = availableHandoffs(selected);
        const selectedAction = allowed.find(item => item.id === actionId);
        if (!selectedAction) throw new InvestigationOrchestrationError("HANDOFF_BLOCKED", "This observation has no permitted handoff for that action.");
        const payload = {...selected.payload};
        if (selectedAction.destination === "ENTITY_RESOLUTION") {
            payload.label = selected.label;
            payload.entityId = selected.type === "ENTITY" ? selected.sourceObjectId || selected.id : "";
        }
        if (selectedAction.destination === "EVIDENCE_DETAIL") payload.evidenceId = selected.evidenceId;
        return Object.freeze({
            id: `handoff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            sourceCapability: selected.capability,
            sourceObjectType: selected.type,
            sourceObjectId: selected.sourceObjectId || selected.id,
            destinationCapability: selectedAction.destination,
            normalizedPayload: noSensitivePayload(payload),
            provenance: Object.freeze({...selected.provenance, analystAction: selectedAction.id, handedOffAt: new Date().toISOString()}),
            caseId: identifier(context && context.activeCaseId),
            explicit: true
        });
    }

    function evidenceObject(evidence) {
        return createObject({
            id: `evidence:${evidence.id}`,
            type: "EVIDENCE",
            label: evidence.title || evidence.id,
            capability: evidence.capability || "MANUAL",
            status: evidence.integrity && evidence.integrity.status === "INVALID" ? "INCONSISTENT" : "CONSISTENT",
            confidence: evidence.confidence || "LOW",
            evidenceId: evidence.id,
            provenance: {sourceCapability: evidence.capability || "MANUAL", sourceEvidenceId: evidence.id, sourceType: evidence.source && evidence.source.type || "LOCAL_EVIDENCE"}
        });
    }

    function objectsFromEvidence(evidence) {
        const data = evidence && evidence.data || {};
        const objects = [evidenceObject(evidence)];
        if (data.infrastructure && data.infrastructure.normalizedTarget) {
            const type = data.infrastructure.targetType === "DOMAIN" ? "DOMAIN" : "IP";
            objects.push(createObject({id: `${evidence.id}:target`, type, label: data.infrastructure.normalizedTarget, capability: "INFRASTRUCTURE_CONTEXT", status: data.infrastructure.verificationStatus, confidence: data.infrastructure.confidence, evidenceId: evidence.id, payload: {target: data.infrastructure.normalizedTarget, targetType: data.infrastructure.targetType}, provenance: {sourceCapability: "INFRASTRUCTURE_CONTEXT", sourceEvidenceId: evidence.id, sourceType: "NORMALIZED_PASSIVE_OBSERVATIONS"}}));
        }
        if (data.geo && Number.isFinite(Number(data.geo.latitude)) && Number.isFinite(Number(data.geo.longitude))) {
            objects.push(createObject({id: `${evidence.id}:location`, type: "LOCATION", label: data.geo.displayName || `${data.geo.latitude}, ${data.geo.longitude}`, capability: "GEOSPATIAL_VERIFICATION", status: data.geo.verificationStatus, confidence: data.geo.verificationConfidence, evidenceId: evidence.id, payload: {latitude: Number(data.geo.latitude), longitude: Number(data.geo.longitude)}, provenance: {sourceCapability: "GEOSPATIAL_VERIFICATION", sourceEvidenceId: evidence.id, sourceType: data.geo.provenance || "NORMALIZED_GEO"}}));
        }
        if (data.media) {
            const geo = data.media.geo || {};
            objects.push(createObject({id: `${evidence.id}:media`, type: "MEDIA", label: data.media.displayLabel || evidence.title, capability: "VISUAL_MEDIA_VERIFICATION", status: data.media.metadataStatus, confidence: evidence.confidence, evidenceId: evidence.id, payload: {latitude: Number.isFinite(Number(geo.latitude)) ? Number(geo.latitude) : undefined, longitude: Number.isFinite(Number(geo.longitude)) ? Number(geo.longitude) : undefined}, provenance: {sourceCapability: "VISUAL_MEDIA_VERIFICATION", sourceEvidenceId: evidence.id, sourceType: "EXPLICIT_LOCAL_FILE"}}));
        }
        if (data.research) {
            const type = data.research.sourceType === "LOCAL_PDF" ? "DOCUMENT" : "SOURCE";
            objects.push(createObject({id: `${evidence.id}:source`, type, label: data.research.title || data.research.doi || data.research.localDocument && data.research.localDocument.displayLabel || evidence.title, capability: "SOURCE_VERIFICATION", status: data.research.verificationStatus, confidence: data.research.confidence, evidenceId: evidence.id, payload: {sourceInput: data.research.normalizedUrl || data.research.doi || "", sourceKind: data.research.doi ? "DOI" : "URL", target: data.research.hostname || ""}, provenance: {sourceCapability: "SOURCE_VERIFICATION", sourceEvidenceId: evidence.id, sourceType: "NORMALIZED_SOURCE_CONTEXT"}}));
        }
        if (data.entityResolution && data.entityResolution.entity) {
            const entity = data.entityResolution.entity;
            const domainAttribute = (entity.attributes || []).find(item => String(item.field || "").toUpperCase().includes("DOMAIN"));
            const locationAttribute = (entity.attributes || []).find(item => String(item.field || "").toUpperCase().includes("LOCATION"));
            objects.push(createObject({id: `${evidence.id}:entity`, type: "ENTITY", label: entity.label, capability: "ENTITY_RESOLUTION", status: entity.status, confidence: entity.confidence, evidenceId: evidence.id, sourceObjectId: entity.id, payload: {target: domainAttribute && domainAttribute.value || "", label: entity.label}, provenance: {sourceCapability: "ENTITY_RESOLUTION", sourceEvidenceId: evidence.id, sourceObjectId: entity.id, sourceType: "LOCAL_ENTITY_RESOLUTION"}, warnings: (data.entityResolution.relationships || []).flatMap(item => item.contradictions || [])}));
            if (locationAttribute) objects.push(createObject({id: `${evidence.id}:entity-location`, type: "LOCATION", label: locationAttribute.value, capability: "ENTITY_RESOLUTION", status: entity.status, confidence: entity.confidence, evidenceId: evidence.id, provenance: {sourceCapability: "ENTITY_RESOLUTION", sourceEvidenceId: evidence.id, sourceObjectId: entity.id, sourceType: "ENTITY_ATTRIBUTE"}}));
        }
        return objects;
    }

    function deriveCaseOverview(input = {}) {
        const active = input.activeCase || {};
        const evidence = Array.isArray(active.evidence) ? active.evidence : [];
        const timeline = Array.isArray(active.timeline) ? active.timeline : [];
        const notes = Array.isArray(active.notes) ? active.notes : [];
        const entityState = input.entityState && typeof input.entityState === "object" ? input.entityState : {entities: [], relationships: []};
        const objects = evidence.flatMap(objectsFromEvidence).slice(0, MAX_OBJECTS);
        const categories = Object.freeze(OBJECT_TYPES.filter(type => type !== "UNKNOWN").map(type => Object.freeze({type, count: objects.filter(item => item.type === type).length, objects: Object.freeze(objects.filter(item => item.type === type))})).filter(item => item.count));
        const contradictions = [
            ...objects.filter(item => item.status === "INCONSISTENT" || item.warnings.length).map(item => ({kind: "CONTRADICTION", objectId: item.id, label: item.label, detail: item.warnings.join(" · ") || "Evidence integrity or normalized observations are inconsistent."})),
            ...(entityState.relationships || []).filter(item => item.status === "INCONSISTENT" || (item.contradictions || []).length).map(item => ({kind: "RELATIONSHIP", objectId: item.id, label: item.type || "RELATIONSHIP", detail: (item.contradictions || []).join(" · ") || "Relationship is marked inconsistent."}))
        ].slice(0, 12);
        const openQuestions = [
            ...objects.filter(item => ["UNVERIFIED", "PARTIALLY_VERIFIED", "PROVIDER_UNAVAILABLE", "AMBIGUOUS"].includes(item.status)).map(item => ({kind: item.status, objectId: item.id, label: item.label, detail: `${item.type} remains ${item.status}.`})),
            ...contradictions
        ].slice(0, 16);
        const withProvenance = objects.filter(item => item.provenance && item.provenance.sourceCapability).length;
        const integrityInvalid = evidence.filter(item => item.integrity && item.integrity.status === "INVALID").length;
        return Object.freeze({
            case: active.case || null,
            counts: Object.freeze({evidence: evidence.length, entities: (entityState.entities || []).filter(item => !item.archived).length, relationships: (entityState.relationships || []).length, notes: notes.length, timeline: timeline.length, objects: objects.length}),
            categories,
            objects: Object.freeze(objects),
            openQuestions: Object.freeze(openQuestions),
            contradictions: Object.freeze(contradictions),
            recentActivity: Object.freeze(timeline.slice().reverse().slice(0, 10)),
            provenanceHealth: Object.freeze({withProvenance, missingProvenance: Math.max(0, objects.length - withProvenance), integrityInvalid, evidenceIntegrityChecked: evidence.filter(item => item.integrity && item.integrity.status === "VALID").length})
        });
    }

    return Object.freeze({CONTEXT_VERSION, OBJECT_TYPES, DESTINATIONS, MAX_OBJECTS, InvestigationOrchestrationError, createContext, createObject, availableHandoffs, createHandoff, deriveCaseOverview});
});
