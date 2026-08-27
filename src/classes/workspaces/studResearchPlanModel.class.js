"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const PLAN_LIFECYCLES = Object.freeze(["DRAFT", "REVIEWED", "SUPERSEDED"]);
const ORIGINS = Object.freeze(["USER", "DETERMINISTIC", "AI_ASSISTED", "IMPORTED", "UNKNOWN"]);
const TOPIC_BASES = Object.freeze(["REQUIRED_BY_ASSIGNMENT", "PROPOSED_BY_RESEARCH_PLANNING", "USER_DEFINED"]);
const TOPIC_DISPOSITIONS = Object.freeze(["PROPOSED", "INCLUDED", "REJECTED", "UNRESOLVED"]);
const QUESTION_STATES = Object.freeze(["OPEN", "ANSWERED", "UNRESOLVED", "DEFERRED"]);
const PRIORITIES = Object.freeze(["URGENT", "HIGH", "NORMAL", "LOW"]);
const MEMBERSHIP_ORIGINS = Object.freeze(["USER_ADDED", "RESEARCH_ACQUIRED", "COURSE_MATERIAL", "ASSIGNMENT_MATERIAL", "SYSTEM_SUGGESTED", "IMPORTED", "UNKNOWN"]);
const DOSSIER_DISPOSITIONS = Object.freeze(["SUGGESTED", "ACCEPTED", "REJECTED"]);
const REVIEW_STATES = Object.freeze(["UNREVIEWED", "PARTIALLY_REVIEWED", "REVIEWED", "NOT_RELEVANT"]);
const SOURCE_SUITABILITY = Object.freeze(["PEER_REVIEWED", "INSTITUTIONAL", "STANDARD_REGULATION", "TEXTBOOK", "COURSE_MATERIAL", "MANUFACTURER_TECHNICAL", "GOVERNMENT", "NEWS", "GENERAL_WEB", "UNKNOWN"]);
const STANCES = Object.freeze(["NOT_ASSESSED", "AGREES", "CONFLICTS", "ALTERNATIVE", "UNCERTAIN"]);
const GAP_TYPES = Object.freeze(["MISSING_SOURCE", "UNANSWERED_QUESTION", "INSUFFICIENT_PRIMARY_EVIDENCE", "MISSING_DATASET", "MISSING_EXPERIMENTAL_RESULT", "MISSING_STANDARD", "CONTRADICTORY_EVIDENCE", "INACCESSIBLE_SOURCE", "OCR_REQUIRED", "HUMAN_CLARIFICATION", "TEAM_DEPENDENCY", "LABORATORY_DEPENDENCY", "CUSTOM"]);
const GAP_STATES = Object.freeze(["OPEN", "RESOLVED", "DISMISSED"]);
const COVERAGE_STATES = Object.freeze(["EMPTY", "STARTED", "PARTIAL", "SUPPORTED", "GAPS_REMAIN", "BLOCKED"]);
const DOSSIER_OBJECT_TYPES = Object.freeze(["ACADEMIC_DOCUMENT", "RESEARCH_PAPER", "RESOURCE", "NOTE", "DATASET", "NOTEBOOK", "REPOSITORY_REFERENCE", "COMPUTE_RESULT", "REVISION_ITEM"]);
const LIMITS = Object.freeze({title: 240, description: 12000, rationale: 4000, note: 12000, list: 100, dossierPage: 100, topics: 100, questions: 200, gaps: 200});

function expectedVersion(value, label = "Expected version") {
    const version = Number(value);
    if (!Number.isInteger(version) || version < 1) throw new Academic.StudError("INVALID_INPUT", `${label} is required.`);
    return version;
}

function order(value, fallback = 0) {
    const number = value === undefined || value === null || value === "" ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 100000) throw new Academic.StudError("INVALID_INPUT", "Research order must be a non-negative whole number.");
    return number;
}

function normalizeTopic(input = {}, existing = {}) {
    Academic.assertAllowedKeys(input, ["title", "description", "rationale", "priority", "order", "origin", "basis", "disposition", "parentTopicId", "workflowNodeId", "userNotes", "requirementItemIds"], "Research Topic");
    return Object.freeze({
        title: input.title === undefined ? existing.title : Academic.requiredText(input.title, "Topic title", LIMITS.title),
        description: input.description === undefined ? existing.description || null : Academic.optionalText(input.description, "Topic scope", LIMITS.description),
        rationale: input.rationale === undefined ? existing.rationale || null : Academic.optionalText(input.rationale, "Topic rationale", LIMITS.rationale),
        priority: input.priority === undefined ? existing.priority || "NORMAL" : Academic.enumValue(input.priority, PRIORITIES, "Topic priority", "NORMAL"),
        order: order(input.order, existing.order || 0),
        origin: input.origin === undefined ? existing.origin || "USER" : Academic.enumValue(input.origin, ORIGINS, "Topic origin", "USER"),
        basis: input.basis === undefined ? existing.basis || "USER_DEFINED" : Academic.enumValue(input.basis, TOPIC_BASES, "Topic basis", "USER_DEFINED"),
        disposition: input.disposition === undefined ? existing.disposition || "INCLUDED" : Academic.enumValue(input.disposition, TOPIC_DISPOSITIONS, "Topic disposition", "INCLUDED"),
        parentTopicId: input.parentTopicId === undefined ? existing.parentTopicId || null : (input.parentTopicId ? Academic.safeId(input.parentTopicId, "Parent Topic ID") : null),
        workflowNodeId: input.workflowNodeId === undefined ? existing.workflowNodeId || null : (input.workflowNodeId ? Academic.safeId(input.workflowNodeId, "Workflow node ID") : null),
        userNotes: input.userNotes === undefined ? existing.userNotes || null : Academic.optionalText(input.userNotes, "Topic notes", LIMITS.note),
        requirementItemIds: input.requirementItemIds === undefined ? existing.requirementItemIds || [] : normalizeIds(input.requirementItemIds, "Requirement Item ID", 50)
    });
}

function normalizeQuestion(input = {}, existing = {}) {
    Academic.assertAllowedKeys(input, ["text", "rationale", "priority", "state", "origin", "order", "parentQuestionId", "requirementItemIds"], "Research Question");
    return Object.freeze({
        text: input.text === undefined ? existing.text : Academic.requiredText(input.text, "Research question", 2000),
        rationale: input.rationale === undefined ? existing.rationale || null : Academic.optionalText(input.rationale, "Question rationale", LIMITS.rationale),
        priority: input.priority === undefined ? existing.priority || "NORMAL" : Academic.enumValue(input.priority, PRIORITIES, "Question priority", "NORMAL"),
        state: input.state === undefined ? existing.state || "OPEN" : Academic.enumValue(input.state, QUESTION_STATES, "Question state", "OPEN"),
        origin: input.origin === undefined ? existing.origin || "USER" : Academic.enumValue(input.origin, ORIGINS, "Question origin", "USER"),
        order: order(input.order, existing.order || 0),
        parentQuestionId: input.parentQuestionId === undefined ? existing.parentQuestionId || null : (input.parentQuestionId ? Academic.safeId(input.parentQuestionId, "Parent Question ID") : null),
        requirementItemIds: input.requirementItemIds === undefined ? existing.requirementItemIds || [] : normalizeIds(input.requirementItemIds, "Requirement Item ID", 50)
    });
}

function normalizeIds(values, label, max) {
    if (!Array.isArray(values)) throw new Academic.StudError("INVALID_INPUT", `${label} list must be an array.`);
    if (values.length > max) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} list exceeds its bound.`);
    return Object.freeze([...new Set(values.map(value => Academic.safeId(value, label)))]);
}

function canonicalHash(value) {
    const sort = item => {
        if (Array.isArray(item)) return item.map(sort);
        if (!item || typeof item !== "object") return item;
        return Object.keys(item).sort().reduce((result, key) => { result[key] = sort(item[key]); return result; }, {});
    };
    return crypto.createHash("sha256").update(JSON.stringify(sort(value))).digest("hex");
}

module.exports = Object.freeze({
    PLAN_LIFECYCLES, ORIGINS, TOPIC_BASES, TOPIC_DISPOSITIONS, QUESTION_STATES,
    PRIORITIES, MEMBERSHIP_ORIGINS, DOSSIER_DISPOSITIONS, REVIEW_STATES,
    SOURCE_SUITABILITY, STANCES, GAP_TYPES, GAP_STATES, COVERAGE_STATES,
    DOSSIER_OBJECT_TYPES, LIMITS, expectedVersion, order, normalizeTopic,
    normalizeQuestion, normalizeIds, canonicalHash
});
