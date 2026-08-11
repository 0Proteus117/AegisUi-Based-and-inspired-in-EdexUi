"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const ENTITY_TYPES = Object.freeze(["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM"]);
const RELATIONSHIP_ENTITY_TYPES = Object.freeze([...ENTITY_TYPES, "EXTERNAL_IDENTIFIER"]);
const RELATIONSHIP_TYPES = Object.freeze(["BELONGS_TO", "RELATES_TO", "SUPPORTS", "USES", "REFERENCES", "HAS_RESOURCE", "HAS_NOTE", "HAS_PAPER", "RELATED_EMAIL", "RELATED_CALENDAR_EVENT"]);
const PROVENANCE_SOURCE_TYPES = Object.freeze(["USER", "MOODLE", "CALENDAR", "EMAIL", "COURSE_DOCUMENT", "RESEARCH_PROVIDER", "LOCAL_EXTRACTION", "AI_SUGGESTION", "IMPORT", "UNKNOWN"]);
const PROVENANCE_AUTHORITIES = Object.freeze(["AUTHORITATIVE", "TRUSTED", "CORROBORATING", "INFERRED", "SUGGESTED", "UNKNOWN"]);
const COST_MODELS = Object.freeze(["FREE_OPEN", "FREE_LOCAL", "FREE_SERVICE", "FREEMIUM", "PAID", "SUBSCRIPTION"]);
const COURSE_STATUSES = Object.freeze(["ACTIVE", "COMPLETED", "ARCHIVED"]);
const ASSIGNMENT_STATUSES = Object.freeze(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "GRADED", "ARCHIVED"]);
const SUBMISSION_STATUSES = Object.freeze(["UNKNOWN", "NOT_SUBMITTED", "SUBMITTED"]);
const LIMITS = Object.freeze({
    title: 240,
    code: 80,
    description: 12000,
    content: 40000,
    identifier: 260,
    source: 120,
    field: 100,
    searchQuery: 240,
    searchLimit: 100,
    payloadBytes: 128 * 1024
});

class StudError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "StudError";
        this.code = code;
        this.details = details;
    }
}

function now() { return new Date().toISOString(); }
function bytesOf(value) { return Buffer.byteLength(JSON.stringify(value || null), "utf8"); }

function assertPlainObject(value, label = "Value") {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new StudError("INVALID_INPUT", `${label} must be a plain object.`);
    }
    return value;
}

function assertAllowedKeys(value, allowed, label = "Payload") {
    assertPlainObject(value, label);
    Object.keys(value).forEach(key => {
        if (!allowed.includes(key)) throw new StudError("INVALID_INPUT", `${label} contains unsupported field: ${key}.`);
    });
}

function requiredText(value, label, max = LIMITS.title) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new StudError("INVALID_INPUT", `${label} is required.`);
    if (text.length > max) throw new StudError("INVALID_INPUT", `${label} is too long.`);
    return text;
}

function optionalText(value, label, max = LIMITS.description) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") throw new StudError("INVALID_INPUT", `${label} must be text.`);
    const text = value.trim();
    if (text.length > max) throw new StudError("INVALID_INPUT", `${label} is too long.`);
    return text || null;
}

function optionalNumber(value, label) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new StudError("INVALID_INPUT", `${label} must be a finite number.`);
    return number;
}

function optionalDate(value, label) {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new StudError("INVALID_INPUT", `${label} must be a valid ISO date.`);
    return date.toISOString();
}

function enumValue(value, allowed, label, fallback = null) {
    if (value === undefined || value === null || value === "") return fallback;
    const normalized = String(value).trim().toUpperCase();
    if (!allowed.includes(normalized)) throw new StudError("INVALID_INPUT", `${label} is invalid.`);
    return normalized;
}

function safeId(value, label = "ID") {
    const id = typeof value === "string" ? value.trim() : "";
    if (!/^[a-z][a-z0-9_]{2,95}$/i.test(id)) throw new StudError("INVALID_INPUT", `${label} is invalid.`);
    return id;
}

function createId(type) {
    const prefix = String(type || "entity").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    return `stud_${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function validateEntityType(type) { return enumValue(type, ENTITY_TYPES, "Entity type"); }
function validateRelationshipEntityType(type) { return enumValue(type, RELATIONSHIP_ENTITY_TYPES, "Relationship entity type"); }

function normalizeCourse(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "shortName", "code", "description", "startDate", "endDate", "status"], "Course");
    const result = {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Course title"),
        shortName: input.shortName === undefined ? existing.shortName || null : optionalText(input.shortName, "Course short name", LIMITS.code),
        code: input.code === undefined ? existing.code || null : optionalText(input.code, "Course code", LIMITS.code),
        description: input.description === undefined ? existing.description || null : optionalText(input.description, "Course description"),
        startDate: input.startDate === undefined ? existing.startDate || null : optionalDate(input.startDate, "Course start date"),
        endDate: input.endDate === undefined ? existing.endDate || null : optionalDate(input.endDate, "Course end date"),
        status: input.status === undefined ? existing.status || "ACTIVE" : enumValue(input.status, COURSE_STATUSES, "Course status", "ACTIVE")
    };
    if (result.startDate && result.endDate && result.startDate > result.endDate) throw new StudError("INVALID_INPUT", "Course end date cannot precede the start date.");
    return result;
}

function normalizeAssignment(input = {}, existing = {}) {
    assertAllowedKeys(input, ["courseId", "title", "description", "releaseDate", "dueDate", "cutoffDate", "status", "submissionStatus", "submittedAt", "grade", "gradeMaximum", "weight", "feedback", "localProgress"], "Assignment");
    const result = {
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        title: input.title === undefined ? existing.title : requiredText(input.title, "Assignment title"),
        description: input.description === undefined ? existing.description || null : optionalText(input.description, "Assignment description"),
        releaseDate: input.releaseDate === undefined ? existing.releaseDate || null : optionalDate(input.releaseDate, "Assignment release date"),
        dueDate: input.dueDate === undefined ? existing.dueDate || null : optionalDate(input.dueDate, "Assignment due date"),
        cutoffDate: input.cutoffDate === undefined ? existing.cutoffDate || null : optionalDate(input.cutoffDate, "Assignment cutoff date"),
        status: input.status === undefined ? existing.status || "NOT_STARTED" : enumValue(input.status, ASSIGNMENT_STATUSES, "Assignment status", "NOT_STARTED"),
        submissionStatus: input.submissionStatus === undefined ? existing.submissionStatus || "UNKNOWN" : enumValue(input.submissionStatus, SUBMISSION_STATUSES, "Submission status", "UNKNOWN"),
        submittedAt: input.submittedAt === undefined ? existing.submittedAt || null : optionalDate(input.submittedAt, "Assignment submitted at"),
        grade: input.grade === undefined ? existing.grade ?? null : optionalNumber(input.grade, "Grade"),
        gradeMaximum: input.gradeMaximum === undefined ? existing.gradeMaximum ?? null : optionalNumber(input.gradeMaximum, "Maximum grade"),
        weight: input.weight === undefined ? existing.weight ?? null : optionalNumber(input.weight, "Assignment weight"),
        feedback: input.feedback === undefined ? existing.feedback || null : optionalText(input.feedback, "Assignment feedback"),
        localProgress: input.localProgress === undefined ? existing.localProgress || null : optionalText(input.localProgress, "Local progress", 120)
    };
    if (result.grade !== null && result.gradeMaximum !== null && result.grade > result.gradeMaximum) throw new StudError("INVALID_INPUT", "Grade cannot exceed maximum grade.");
    return result;
}

function normalizeResource(input = {}, existing = {}) {
    assertAllowedKeys(input, ["courseId", "assignmentId", "type", "title", "url", "localReference", "mimeType", "checksum"], "Resource");
    return {
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null),
        type: input.type === undefined ? existing.type || "REFERENCE" : requiredText(input.type, "Resource type", 64).toUpperCase(),
        title: input.title === undefined ? existing.title : requiredText(input.title, "Resource title"),
        url: input.url === undefined ? existing.url || null : optionalText(input.url, "Resource URL", 2048),
        localReference: input.localReference === undefined ? existing.localReference || null : optionalText(input.localReference, "Local reference", 260),
        mimeType: input.mimeType === undefined ? existing.mimeType || null : optionalText(input.mimeType, "MIME type", 120),
        checksum: input.checksum === undefined ? existing.checksum || null : optionalText(input.checksum, "Checksum", 160)
    };
}

function normalizePaper(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "year", "abstract", "venue", "authors", "localDocumentReference"], "Research paper");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Paper title"),
        year: input.year === undefined ? existing.year ?? null : optionalNumber(input.year, "Paper year"),
        abstract: input.abstract === undefined ? existing.abstract || null : optionalText(input.abstract, "Paper abstract"),
        venue: input.venue === undefined ? existing.venue || null : optionalText(input.venue, "Paper venue", 500),
        authors: input.authors === undefined ? existing.authors || null : optionalText(input.authors, "Paper authors", 4000),
        localDocumentReference: input.localDocumentReference === undefined ? existing.localDocumentReference || null : optionalText(input.localDocumentReference, "Local document reference", 260)
    };
}

function normalizeNote(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "content", "courseId"], "Note");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Note title"),
        content: input.content === undefined ? existing.content || "" : optionalText(input.content, "Note content", LIMITS.content) || "",
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null)
    };
}

function normalizeRevisionItem(input = {}, existing = {}) {
    assertAllowedKeys(input, ["courseId", "prompt", "answer", "sourceType", "sourceId"], "Revision item");
    return {
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        prompt: input.prompt === undefined ? existing.prompt : requiredText(input.prompt, "Revision prompt", LIMITS.content),
        answer: input.answer === undefined ? existing.answer : requiredText(input.answer, "Revision answer", LIMITS.content),
        sourceType: input.sourceType === undefined ? existing.sourceType || null : optionalText(input.sourceType, "Revision source type", 80),
        sourceId: input.sourceId === undefined ? existing.sourceId || null : (input.sourceId ? safeId(input.sourceId, "Revision source ID") : null)
    };
}

function normalizeByEntityType(type, input, existing) {
    switch (validateEntityType(type)) {
    case "COURSE": return normalizeCourse(input, existing);
    case "ASSIGNMENT": return normalizeAssignment(input, existing);
    case "RESOURCE": return normalizeResource(input, existing);
    case "RESEARCH_PAPER": return normalizePaper(input, existing);
    case "NOTE": return normalizeNote(input, existing);
    case "REVISION_ITEM": return normalizeRevisionItem(input, existing);
    default: throw new StudError("INVALID_INPUT", "Unsupported academic entity type.");
    }
}

function normalizeProvenance(input = {}) {
    assertAllowedKeys(input, ["entityType", "entityId", "field", "observedValue", "sourceType", "sourceId", "sourceAuthority", "observedAt", "metadata"], "Provenance record");
    const metadata = input.metadata === undefined || input.metadata === null ? null : input.metadata;
    if (metadata !== null) assertPlainObject(metadata, "Provenance metadata");
    return {
        entityType: validateEntityType(input.entityType),
        entityId: safeId(input.entityId, "Provenance entity ID"),
        field: requiredText(input.field, "Provenance field", LIMITS.field),
        observedValue: input.observedValue === undefined || input.observedValue === null ? null : String(input.observedValue).slice(0, LIMITS.content),
        sourceType: enumValue(input.sourceType || "USER", PROVENANCE_SOURCE_TYPES, "Provenance source type", "USER"),
        sourceId: optionalText(input.sourceId, "Provenance source ID", LIMITS.identifier),
        sourceAuthority: enumValue(input.sourceAuthority || "AUTHORITATIVE", PROVENANCE_AUTHORITIES, "Provenance authority", "AUTHORITATIVE"),
        observedAt: optionalDate(input.observedAt || now(), "Provenance observed at") || now(),
        metadata
    };
}

function normalizeRelationship(input = {}) {
    assertAllowedKeys(input, ["fromType", "fromId", "relationType", "toType", "toId", "source"], "Relationship");
    return {
        fromType: validateRelationshipEntityType(input.fromType),
        fromId: safeId(input.fromId, "Relationship source ID"),
        relationType: enumValue(input.relationType, RELATIONSHIP_TYPES, "Relationship type"),
        toType: validateRelationshipEntityType(input.toType),
        toId: safeId(input.toId, "Relationship target ID"),
        source: optionalText(input.source, "Relationship source", LIMITS.source)
    };
}

function normalizedSearchTerms(query) {
    const text = optionalText(query, "Search query", LIMITS.searchQuery);
    if (!text) throw new StudError("INVALID_INPUT", "Search query is required.");
    const terms = text.match(/[\p{L}\p{N}_-]{2,}/gu) || [];
    if (!terms.length) throw new StudError("INVALID_INPUT", "Search query has no searchable terms.");
    return terms.slice(0, 12).map(term => `"${term.replace(/"/g, "")}"`).join(" AND ");
}

module.exports = Object.freeze({
    SCHEMA_VERSION, ENTITY_TYPES, RELATIONSHIP_ENTITY_TYPES, RELATIONSHIP_TYPES, PROVENANCE_SOURCE_TYPES,
    PROVENANCE_AUTHORITIES, COST_MODELS, COURSE_STATUSES, ASSIGNMENT_STATUSES,
    SUBMISSION_STATUSES, LIMITS, StudError, now, bytesOf, assertPlainObject,
    assertAllowedKeys, requiredText, optionalText, optionalDate, enumValue,
    safeId, createId, validateEntityType, validateRelationshipEntityType, normalizeByEntityType,
    normalizeProvenance, normalizeRelationship, normalizedSearchTerms
});
