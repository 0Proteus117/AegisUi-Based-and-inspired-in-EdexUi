"use strict";

// Phase 5 deliberately keeps matching deterministic and explainable.  This
// module has no provider, filesystem or database access: callers choose what
// to inspect and decide whether a suggested relation becomes persistent.
const CONFIDENCE = Object.freeze(["EXACT", "STRONG", "SUGGESTED", "UNRESOLVED", "CONFLICTING"]);
const STATUS = Object.freeze(["CLEAN", "CORROBORATED", "CONFLICTING", "PARTIAL", "UNMATCHED", "NEEDS_REVIEW"]);
const CONFLICT_FIELDS = Object.freeze({
    ASSIGNMENT: ["dueDate", "cutoffDate", "releaseDate", "grade", "submissionStatus"],
    COURSE: ["startDate", "endDate", "code", "title"]
});

function normalizedText(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase("en-GB")
        .replace(/[\u2010-\u2015]/g, "-").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function normalizedCourseCode(value) { return normalizedText(value).replace(/\s/g, ""); }

function assignmentNumber(value) {
    const match = normalizedText(value).match(/(?:assignment|coursework|task|cw)\s*(\d{1,4})\b/i);
    return match ? match[1].replace(/^0+(?=\d)/, "") : null;
}

function sameInstant(left, right) {
    if (!left || !right) return false;
    const a = new Date(left); const b = new Date(right);
    return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a.getTime() === b.getTime();
}

function candidateSignals(assignment, course, candidate = {}) {
    const signals = [];
    const conflicts = [];
    const candidateCourse = normalizedCourseCode(candidate.courseCode || candidate.courseTitle);
    const courseCode = normalizedCourseCode(course && (course.code || course.shortName));
    if (candidate.externalId && Array.isArray(candidate.knownExternalIds) && candidate.knownExternalIds.includes(String(candidate.externalId))) signals.push("STABLE_EXTERNAL_IDENTIFIER");
    if (courseCode && candidateCourse && courseCode === candidateCourse) signals.push("EXACT_MODULE_CODE");
    const ownNumber = assignmentNumber(assignment && assignment.title);
    const otherNumber = assignmentNumber(candidate.title);
    if (ownNumber && otherNumber && ownNumber === otherNumber) signals.push("NORMALIZED_ASSIGNMENT_NUMBER");
    if (normalizedText(assignment && assignment.title) && normalizedText(assignment.title) === normalizedText(assignment && assignment.title)) signals.push("NORMALIZED_TITLE");
    if (assignment && assignment.dueDate && candidate.dueDate) {
        if (sameInstant(assignment.dueDate, candidate.dueDate)) signals.push("EXACT_DUE_INSTANT");
        else conflicts.push("DUE_DATE_DIFFERS");
    }
    return Object.freeze({signals: Object.freeze(signals), conflicts: Object.freeze(conflicts)});
}

function classifyCandidate(assignment, course, candidate = {}) {
    const {signals, conflicts} = candidateSignals(assignment, course, candidate);
    let confidence = "UNRESOLVED";
    if (signals.includes("STABLE_EXTERNAL_IDENTIFIER")) confidence = "EXACT";
    else if (signals.includes("EXACT_MODULE_CODE") && signals.includes("NORMALIZED_ASSIGNMENT_NUMBER") && signals.includes("EXACT_DUE_INSTANT")) confidence = "STRONG";
    else if (signals.includes("EXACT_MODULE_CODE") && signals.includes("NORMALIZED_TITLE") && signals.includes("EXACT_DUE_INSTANT")) confidence = "STRONG";
    else if (signals.includes("EXACT_MODULE_CODE") && (signals.includes("NORMALIZED_ASSIGNMENT_NUMBER") || signals.includes("NORMALIZED_TITLE"))) confidence = "SUGGESTED";
    else if (signals.includes("NORMALIZED_TITLE") && signals.includes("EXACT_DUE_INSTANT")) confidence = "SUGGESTED";
    if (confidence === "UNRESOLVED" && conflicts.length) confidence = "CONFLICTING";
    return Object.freeze({confidence, signals, conflicts, requiresConfirmation: confidence === "SUGGESTED" || confidence === "CONFLICTING"});
}

function distinctValues(observations) {
    return [...new Set(observations.map(item => String(item.observedValue || "").trim()).filter(Boolean))];
}

function detectConflicts(entityType, observations = []) {
    const fields = CONFLICT_FIELDS[entityType] || [];
    return Object.freeze(fields.map(field => {
        const entries = observations.filter(item => item.field === field);
        const values = distinctValues(entries);
        return values.length > 1 ? Object.freeze({field, values: Object.freeze(values), observations: Object.freeze(entries)}) : null;
    }).filter(Boolean));
}

function orchestrationStatus({references = [], conflicts = [], suggestions = []} = {}) {
    if (conflicts.length) return "CONFLICTING";
    if (suggestions.length) return "NEEDS_REVIEW";
    if (!references.length) return "UNMATCHED";
    if (references.length > 1) return "CORROBORATED";
    return "CLEAN";
}

module.exports = {CONFIDENCE, STATUS, CONFLICT_FIELDS, normalizedText, normalizedCourseCode, assignmentNumber, sameInstant, candidateSignals, classifyCandidate, detectConflicts, orchestrationStatus};
