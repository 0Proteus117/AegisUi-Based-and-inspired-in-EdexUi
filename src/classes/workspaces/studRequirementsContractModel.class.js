"use strict";

const crypto = require("crypto");
const Model = require("./studAcademicModel.class.js");

const LIFECYCLES = Object.freeze(["DRAFT", "APPROVED", "SUPERSEDED"]);
const COMPLETENESS = Object.freeze(["COMPLETE", "INCOMPLETE", "CONFLICTING"]);
const FRESHNESS = Object.freeze(["CURRENT", "SOURCE_CHANGED", "SOURCE_MISSING", "OCR_BLOCKED", "NEEDS_REVIEW"]);
const REQUIREMENT_TYPES = Object.freeze([
    "DELIVERABLE", "DEADLINE", "LENGTH", "FORMAT", "CITATION", "STRUCTURE",
    "LEARNING_OUTCOME", "RUBRIC", "EVIDENCE", "ACADEMIC_INTEGRITY",
    "GROUP_WORK", "DEPENDENCY", "OTHER"
]);
const CANDIDATE_DISPOSITIONS = Object.freeze(["PENDING", "INCLUDED", "EXCLUDED", "UNRESOLVED"]);
const RESOLUTION_STATES = Object.freeze(["RESOLVED", "UNRESOLVED", "CONFLICTING"]);
const SOURCE_KINDS = Object.freeze([
    "ASSIGNMENT_FIELD", "PROVENANCE_RECORD", "ACADEMIC_DOCUMENT_CHUNK",
    "ACADEMIC_DOCUMENT_STATUS", "EXTERNAL_IDENTIFIER", "USER_ENTRY"
]);
const EXTRACTION_LIMITS = Object.freeze({documents: 20, chunks: 240, candidates: 80, excerpt: 480});

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
    }, {});
}

function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function sha256(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value), "utf8").digest("hex"); }

function exactHash(value, label = "Hash") {
    const hash = Model.requiredText(value, label, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Model.StudError("INVALID_INPUT", `${label} must be SHA-256.`);
    return hash;
}

function expectedVersion(value) {
    const version = Number(value);
    if (!Number.isSafeInteger(version) || version < 1) throw new Model.StudError("INVALID_INPUT", "Expected contract version is invalid.");
    return version;
}

function optionalId(value, label) { return value ? Model.safeId(value, label) : null; }

function normalizeRequirement(input = {}, existing = {}) {
    Model.assertAllowedKeys(input, ["type", "subtype", "label", "originalValue", "displayValue", "normalizedValue", "unit", "resolutionState", "userNote", "order"], "Requirement item");
    const type = input.type === undefined ? existing.type : Model.enumValue(input.type, REQUIREMENT_TYPES, "Requirement type");
    const label = input.label === undefined ? existing.label : Model.requiredText(input.label, "Requirement label", 240);
    return Object.freeze({
        type,
        subtype: input.subtype === undefined ? existing.subtype || null : Model.optionalText(input.subtype, "Requirement subtype", 120),
        label,
        originalValue: input.originalValue === undefined ? existing.originalValue || null : Model.optionalText(input.originalValue, "Original requirement value", 12000),
        displayValue: input.displayValue === undefined ? existing.displayValue || null : Model.optionalText(input.displayValue, "Requirement display value", 12000),
        normalizedValue: input.normalizedValue === undefined ? existing.normalizedValue || null : Model.optionalText(input.normalizedValue, "Normalized requirement value", 12000),
        unit: input.unit === undefined ? existing.unit || null : Model.optionalText(input.unit, "Requirement unit", 80),
        resolutionState: input.resolutionState === undefined ? existing.resolutionState || "RESOLVED" : Model.enumValue(input.resolutionState, RESOLUTION_STATES, "Requirement resolution state"),
        userNote: input.userNote === undefined ? existing.userNote || null : Model.optionalText(input.userNote, "Requirement note", 4000),
        order: input.order === undefined ? Number(existing.order || 0) : (Model.optionalNonNegativeInteger(input.order, "Requirement order", 10000) || 0)
    });
}

function normalizeCandidate(input = {}) {
    Model.assertAllowedKeys(input, ["candidateKey", "runId", "type", "subtype", "label", "originalValue", "displayValue", "normalizedValue", "unit", "resolutionState", "extractionMethod", "confidence", "order"], "Requirement candidate");
    const requirement = normalizeRequirement({type: input.type, subtype: input.subtype, label: input.label, originalValue: input.originalValue, displayValue: input.displayValue, normalizedValue: input.normalizedValue, unit: input.unit, resolutionState: input.resolutionState, order: input.order});
    return Object.freeze({...requirement,
        candidateKey: exactHash(input.candidateKey, "Candidate key"),
        runId: optionalId(input.runId, "Candidate run ID"),
        extractionMethod: Model.requiredText(input.extractionMethod, "Candidate extraction method", 120),
        confidence: Model.enumValue(input.confidence || "LOW", ["LOW", "MEDIUM", "HIGH"], "Candidate confidence")
    });
}

function normalizeSourceReference(input = {}) {
    Model.assertAllowedKeys(input, ["sourceKind", "sourceEntityType", "sourceEntityId", "sourceField", "provenanceId", "externalIdentifierId", "documentId", "extractionId", "chunkId", "pageStart", "pageEnd", "contentHash", "sourceVersionHash", "snapshotHash", "presentationLabel", "excerpt", "metadata"], "Requirement source");
    const metadata = input.metadata === undefined || input.metadata === null ? null : Model.assertPlainObject(input.metadata, "Requirement source metadata");
    const pageStart = Model.optionalNonNegativeInteger(input.pageStart, "Source page start", 100000);
    const pageEnd = Model.optionalNonNegativeInteger(input.pageEnd, "Source page end", 100000);
    if (pageStart !== null && pageEnd !== null && pageEnd < pageStart) throw new Model.StudError("INVALID_INPUT", "Source page range is invalid.");
    return Object.freeze({
        sourceKind: Model.enumValue(input.sourceKind, SOURCE_KINDS, "Requirement source kind"),
        sourceEntityType: input.sourceEntityType ? Model.requiredText(input.sourceEntityType, "Source entity type", 80).toUpperCase() : null,
        sourceEntityId: optionalId(input.sourceEntityId, "Source entity ID"),
        sourceField: Model.optionalText(input.sourceField, "Source field", 100),
        provenanceId: optionalId(input.provenanceId, "Provenance ID"),
        externalIdentifierId: optionalId(input.externalIdentifierId, "External identifier ID"),
        documentId: optionalId(input.documentId, "Academic document ID"),
        extractionId: optionalId(input.extractionId, "Document extraction ID"),
        chunkId: optionalId(input.chunkId, "Document chunk ID"),
        pageStart,
        pageEnd,
        contentHash: input.contentHash ? exactHash(input.contentHash, "Source content hash") : null,
        sourceVersionHash: input.sourceVersionHash ? exactHash(input.sourceVersionHash, "Source version hash") : null,
        snapshotHash: input.snapshotHash ? exactHash(input.snapshotHash, "Source snapshot hash") : null,
        presentationLabel: Model.optionalText(input.presentationLabel, "Source presentation label", 480),
        excerpt: Model.optionalText(input.excerpt, "Source excerpt", 2000),
        metadata
    });
}

function deriveCompleteness(candidates, items) {
    if (items.some(item => item.resolutionState === "CONFLICTING")) return "CONFLICTING";
    if (!items.length || candidates.some(item => ["PENDING", "UNRESOLVED"].includes(item.disposition)) || items.some(item => item.resolutionState !== "RESOLVED")) return "INCOMPLETE";
    return "COMPLETE";
}

function requirementTypeForLabel(label) {
    const normalized = String(label || "").toUpperCase();
    if (/DUE|DEADLINE|RELEASE|CUTOFF/.test(normalized)) return "DEADLINE";
    if (/WORD|PAGE|DURATION|LENGTH/.test(normalized)) return "LENGTH";
    if (/CITATION|REFERENC/.test(normalized)) return "CITATION";
    if (/FORMAT|FONT|SPACING|MARGIN|FILE/.test(normalized)) return "FORMAT";
    if (/STRUCTURE|SECTION|APPENDIX/.test(normalized)) return "STRUCTURE";
    if (/LEARNING OUTCOME|\bLO\b/.test(normalized)) return "LEARNING_OUTCOME";
    if (/RUBRIC|MARKING|CRITERIA/.test(normalized)) return "RUBRIC";
    if (/SOURCE|EVIDENCE/.test(normalized)) return "EVIDENCE";
    if (/INTEGRITY|PLAGIAR|AI USE/.test(normalized)) return "ACADEMIC_INTEGRITY";
    if (/GROUP|TEAM/.test(normalized)) return "GROUP_WORK";
    if (/DEPEND|REQUIRES/.test(normalized)) return "DEPENDENCY";
    if (/DELIVERABLE|ESSAY|REPORT|PORTFOLIO|PRESENTATION|POSTER|DISSERTATION|CASE STUDY/.test(normalized)) return "DELIVERABLE";
    return "OTHER";
}

module.exports = Object.freeze({
    LIFECYCLES, COMPLETENESS, FRESHNESS, REQUIREMENT_TYPES, CANDIDATE_DISPOSITIONS,
    RESOLUTION_STATES, SOURCE_KINDS, EXTRACTION_LIMITS, canonicalize, canonicalJson,
    sha256, exactHash, expectedVersion, normalizeRequirement, normalizeCandidate,
    normalizeSourceReference, deriveCompleteness, requirementTypeForLabel
});
