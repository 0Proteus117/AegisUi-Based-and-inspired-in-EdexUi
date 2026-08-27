"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const CLAIM_TYPES = Object.freeze(["FACTUAL", "ANALYTICAL", "INTERPRETIVE", "METHODOLOGICAL", "DESIGN_ENGINEERING", "QUANTITATIVE", "COMPARATIVE", "EVALUATIVE", "CONCLUSION", "RECOMMENDATION", "LIMITATION", "ASSUMPTION", "OTHER", "UNKNOWN"]);
const CLAIM_ORIGINS = Object.freeze(["USER", "DETERMINISTIC", "AI_ASSISTED", "IMPORTED", "UNKNOWN"]);
const CLAIM_LIFECYCLES = Object.freeze(["DRAFT", "REVIEWED", "SUPERSEDED", "REJECTED", "RETIRED"]);
const EVIDENCE_ORIGINS = Object.freeze(["USER", "IMPORTED", "UNKNOWN"]);
const EVIDENCE_REVIEW_STATES = Object.freeze(["UNREVIEWED", "REVIEWED", "REJECTED"]);
const EVIDENCE_LOCATION_TYPES = Object.freeze(["DOCUMENT_CHUNK", "DOCUMENT_PAGE", "DATASET_RANGE", "NOTEBOOK_CELL", "COMPUTE_RESULT", "ARTIFACT_VERSION", "SOURCE_RECORD", "NOTE_SECTION", "OTHER"]);
const EVIDENCE_RELATIONSHIPS = Object.freeze(["SUPPORTS", "CONTRADICTS", "QUALIFIES", "CONTEXTUALISES", "NOT_ASSESSED"]);
const LINK_LIFECYCLES = Object.freeze(["DRAFT", "REVIEWED", "SUPERSEDED", "REJECTED"]);
const FRESHNESS_STATES = Object.freeze(["CURRENT", "SOURCE_CHANGED", "SOURCE_MISSING", "OCR_BLOCKED", "PROVENANCE_INCOMPLETE"]);
const CITATION_STATES = Object.freeze(["READY", "MISSING", "METADATA_INCOMPLETE", "RENDER_FAILED", "SOURCE_MISMATCH", "PROVENANCE_MISSING", "SOURCE_UNAVAILABLE", "SOURCE_CHANGED"]);
const SOURCE_OBJECT_TYPES = Object.freeze(["ACADEMIC_DOCUMENT", "RESEARCH_PAPER", "RESOURCE", "NOTE", "DATASET", "NOTEBOOK", "COMPUTE_RESULT", "REVISION_ITEM", "REPOSITORY_REFERENCE", "ARTIFACT"]);
const LIMITS = Object.freeze({claimText: 12000, rationale: 4000, note: 12000, excerpt: 12000, locatorBytes: 8192, page: 100, mapClaims: 100, mapEvidence: 500, requirementLinks: 50});

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => { result[key] = canonical(value[key]); return result; }, {});
}

function canonicalHash(value) {
    return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function expectedVersion(value, label = "Expected version") {
    const version = Number(value);
    if (!Number.isInteger(version) || version < 1) throw new Academic.StudError("INVALID_INPUT", `${label} is required.`);
    return version;
}

function normalizeIds(values, label, maximum = 50) {
    if (values === undefined || values === null) return Object.freeze([]);
    if (!Array.isArray(values)) throw new Academic.StudError("INVALID_INPUT", `${label} list must be an array.`);
    if (values.length > maximum) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} list exceeds its bound.`);
    return Object.freeze([...new Set(values.map(value => Academic.safeId(value, label)))]);
}

function boundedJson(value, label, maximum = LIMITS.locatorBytes) {
    if (value === undefined || value === null) return null;
    const serialized = JSON.stringify(canonical(value));
    if (Buffer.byteLength(serialized, "utf8") > maximum) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} exceeds its storage bound.`);
    return serialized;
}

function normalizeClaim(input = {}, existing = {}) {
    Academic.assertAllowedKeys(input, ["text", "type", "rationale", "userNotes", "planId", "topicId", "researchQuestionId", "workflowNodeId", "parentClaimId", "requirementItemIds"], "Claim");
    return Object.freeze({
        text: input.text === undefined ? existing.claimText : Academic.requiredText(input.text, "Claim text", LIMITS.claimText),
        type: input.type === undefined ? existing.claimType || "UNKNOWN" : Academic.enumValue(input.type, CLAIM_TYPES, "Claim type", "UNKNOWN"),
        rationale: input.rationale === undefined ? existing.rationale || null : Academic.optionalText(input.rationale, "Claim rationale", LIMITS.rationale),
        userNotes: input.userNotes === undefined ? existing.userNotes || null : Academic.optionalText(input.userNotes, "Claim notes", LIMITS.note),
        planId: input.planId === undefined ? existing.planId || null : (input.planId ? Academic.safeId(input.planId, "Research Plan ID") : null),
        topicId: input.topicId === undefined ? existing.topicId || null : (input.topicId ? Academic.safeId(input.topicId, "Research Topic ID") : null),
        researchQuestionId: input.researchQuestionId === undefined ? existing.researchQuestionId || null : (input.researchQuestionId ? Academic.safeId(input.researchQuestionId, "Research Question ID") : null),
        workflowNodeId: input.workflowNodeId === undefined ? existing.workflowNodeId || null : (input.workflowNodeId ? Academic.safeId(input.workflowNodeId, "Workflow node ID") : null),
        parentClaimId: input.parentClaimId === undefined ? existing.parentSemanticClaimId || null : (input.parentClaimId ? Academic.safeId(input.parentClaimId, "Parent Claim ID") : null),
        requirementItemIds: input.requirementItemIds === undefined ? existing.requirementItemIds || [] : normalizeIds(input.requirementItemIds, "Requirement Item ID", LIMITS.requirementLinks)
    });
}

module.exports = Object.freeze({
    CLAIM_TYPES, CLAIM_ORIGINS, CLAIM_LIFECYCLES, EVIDENCE_ORIGINS,
    EVIDENCE_REVIEW_STATES, EVIDENCE_LOCATION_TYPES, EVIDENCE_RELATIONSHIPS,
    LINK_LIFECYCLES, FRESHNESS_STATES, CITATION_STATES, SOURCE_OBJECT_TYPES,
    LIMITS, canonicalHash, expectedVersion, normalizeIds, boundedJson,
    normalizeClaim
});
