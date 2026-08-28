"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const PLAN_LIFECYCLES = Object.freeze(["DRAFT", "REVIEWED", "SUPERSEDED"]);
const PLAN_ORIGINS = Object.freeze(["USER", "REQUIREMENT_PROPOSAL"]);
const SECTION_ORIGINS = Object.freeze(["USER", "REQUIREMENT_PROPOSAL", "CLAIM_REVIEW_PROPOSAL"]);
const LENGTH_UNITS = Object.freeze(["WORDS", "PAGES", "SLIDES", "MINUTES", "ITEMS", "OTHER"]);
const TOTAL_SOURCES = Object.freeze(["REQUIREMENTS_CONTRACT", "USER_PLAN", "NONE"]);
const COVERAGE_DISPOSITIONS = Object.freeze(["ASSIGNED", "EXCLUDED"]);
const DRAFT_ORIGINS = Object.freeze(["USER", "LOCAL_AI", "IMPORTED", "REVISION", "OTHER"]);
const LIMITS = Object.freeze({
    title: 240, purpose: 12000, notes: 12000, reason: 4000, sections: 200,
    hierarchyDepth: 4, requirementLinks: 100, claimLinks: 200,
    evidenceLinks: 500, draftSectionCharacters: 120000,
    draftTotalCharacters: 500000, draftVersions: 100, diffLines: 12000
});

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

function nonNegative(value, label, fallback = null) {
    if (value === undefined || value === null || value === "") return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 10000000) throw new Academic.StudError("INVALID_INPUT", `${label} must be a non-negative finite number.`);
    return number;
}

function sectionOrder(value, fallback = 0) {
    const number = value === undefined || value === null || value === "" ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 100000) throw new Academic.StudError("INVALID_INPUT", "Section order must be a non-negative whole number.");
    return number;
}

function normalizeIds(values, label, maximum) {
    if (values === undefined || values === null) return Object.freeze([]);
    if (!Array.isArray(values)) throw new Academic.StudError("INVALID_INPUT", `${label} list must be an array.`);
    if (values.length > maximum) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} list exceeds its bound.`);
    return Object.freeze([...new Set(values.map(value => Academic.safeId(value, label)))]);
}

function normalizeSection(input = {}, existing = {}) {
    Academic.assertAllowedKeys(input, ["title", "purpose", "parentSectionId", "order", "plannedLength", "lengthUnit", "origin", "originReason", "notes"], "Composition Section");
    return Object.freeze({
        title: input.title === undefined ? existing.title : Academic.requiredText(input.title, "Section title", LIMITS.title),
        purpose: input.purpose === undefined ? existing.purpose : Academic.requiredText(input.purpose, "Section purpose", LIMITS.purpose),
        parentSectionId: input.parentSectionId === undefined ? existing.parentSectionId || null : (input.parentSectionId ? Academic.safeId(input.parentSectionId, "Parent Section ID") : null),
        order: sectionOrder(input.order, existing.sectionOrder || existing.order || 0),
        plannedLength: input.plannedLength === undefined ? existing.plannedLength ?? null : nonNegative(input.plannedLength, "Planned length"),
        lengthUnit: input.lengthUnit === undefined ? existing.lengthUnit || "WORDS" : Academic.enumValue(input.lengthUnit, LENGTH_UNITS, "Length unit", "WORDS"),
        origin: input.origin === undefined ? existing.origin || "USER" : Academic.enumValue(input.origin, SECTION_ORIGINS, "Section origin", "USER"),
        originReason: input.originReason === undefined ? existing.originReason : Academic.requiredText(input.originReason, "Section reason", LIMITS.reason),
        notes: input.notes === undefined ? existing.notes || null : Academic.optionalText(input.notes, "Section notes", LIMITS.notes)
    });
}

function normalizeDraftContent(value) {
    if (typeof value !== "string") throw new Academic.StudError("INVALID_INPUT", "Draft content must be text.");
    if (value.length > LIMITS.draftSectionCharacters) throw new Academic.StudError("PAYLOAD_TOO_LARGE", "Draft section content exceeds its bound.");
    return value.replace(/\r\n?/g, "\n");
}

function measuredLength(content, unit) {
    const text = String(content || "");
    if (unit === "WORDS") return (text.trim().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
    if (unit === "ITEMS") return text.split(/\n+/).map(line => line.trim()).filter(Boolean).length;
    return 0;
}

function lineDiff(before, after) {
    const left = String(before || "").split("\n").slice(0, LIMITS.diffLines);
    const right = String(after || "").split("\n").slice(0, LIMITS.diffLines);
    const rows = left.length + 1, cols = right.length + 1;
    if (rows * cols > 1000000) {
        return Object.freeze({truncated: true, lines: Object.freeze([
            Object.freeze({type: "REMOVED", text: String(before || "").slice(0, 4000)}),
            Object.freeze({type: "ADDED", text: String(after || "").slice(0, 4000)})
        ])});
    }
    const matrix = Array.from({length: rows}, () => new Uint32Array(cols));
    for (let i = 1; i < rows; i += 1) for (let j = 1; j < cols; j += 1) matrix[i][j] = left[i - 1] === right[j - 1] ? matrix[i - 1][j - 1] + 1 : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    const lines = []; let i = left.length, j = right.length;
    while (i || j) {
        if (i && j && left[i - 1] === right[j - 1]) { lines.push({type: "UNCHANGED", text: left[i - 1]}); i -= 1; j -= 1; }
        else if (j && (!i || matrix[i][j - 1] >= matrix[i - 1][j])) { lines.push({type: "ADDED", text: right[j - 1]}); j -= 1; }
        else { lines.push({type: "REMOVED", text: left[i - 1]}); i -= 1; }
    }
    return Object.freeze({truncated: false, lines: Object.freeze(lines.reverse().map(Object.freeze))});
}

module.exports = Object.freeze({
    PLAN_LIFECYCLES, PLAN_ORIGINS, SECTION_ORIGINS, LENGTH_UNITS, TOTAL_SOURCES,
    COVERAGE_DISPOSITIONS, DRAFT_ORIGINS, LIMITS, canonicalHash, expectedVersion,
    nonNegative, sectionOrder, normalizeIds, normalizeSection, normalizeDraftContent,
    measuredLength, lineDiff
});
