"use strict";

const Academic = require("./studAcademicModel.class.js");

const ARTIFACT_TYPES = Object.freeze([
    "ACADEMIC_DOCUMENT", "SOURCE_DOCUMENT", "RESEARCH_PAPER", "WEB_REFERENCE",
    "NOTE", "DATASET", "NOTEBOOK", "REPOSITORY_CODE", "COMPUTE_INPUT",
    "COMPUTE_RESULT", "FIGURE", "IMAGE", "TABLE", "CHART", "CALCULATION",
    "SIMULATION_RESULT", "REVISION_ITEM", "DRAFT_VERSION", "CITATION_REFERENCE",
    "EXPORT_PACKAGE", "GENERIC_MANUAL"
]);
const ARTIFACT_ORIGINS = Object.freeze([
    "USER_CREATED", "USER_IMPORTED", "MOODLE_SYNC", "RESEARCH_ACQUISITION",
    "COMPUTE", "MODEL_GENERATED", "SYSTEM_GENERATED", "EXTERNAL_REFERENCE", "UNKNOWN"
]);
const ARTIFACT_LIFECYCLES = Object.freeze(["ACTIVE", "HISTORICAL", "ARCHIVED"]);
const ARTIFACT_AVAILABILITY = Object.freeze(["AVAILABLE", "OFFLINE", "MISSING", "UNAVAILABLE"]);
const ARTIFACT_RELATIONSHIPS = Object.freeze(["DERIVED_FROM", "USES", "REFERENCES", "SUPERSEDES", "EXPORT_OF", "GENERATED_FROM"]);
const ACYCLIC_RELATIONSHIPS = Object.freeze(["DERIVED_FROM", "SUPERSEDES", "EXPORT_OF", "GENERATED_FROM"]);

const RUN_STATES = Object.freeze(["CREATED", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]);
const PROGRESS_MODES = Object.freeze(["NONE", "INDETERMINATE", "DETERMINATE"]);
const EVENT_TYPES = Object.freeze([
    "OPERATION_CREATED", "OPERATION_STARTED", "OPERATION_PAUSED", "OPERATION_RESUMED",
    "OPERATION_COMPLETED", "OPERATION_FAILED", "OPERATION_CANCELLED", "STAGE_ENTERED",
    "STAGE_LEFT", "ARTIFACT_REGISTERED", "ARTIFACT_UPDATED", "ARTIFACT_SUPERSEDED",
    "SOURCE_ACQUIRED", "DOCUMENT_INDEXED", "EXTRACTION_COMPLETED", "MODEL_REQUEST_STARTED",
    "MODEL_REQUEST_COMPLETED", "MODEL_REQUEST_FAILED", "COMPUTE_STARTED", "COMPUTE_COMPLETED",
    "COMPUTE_FAILED", "CHECKPOINT_REQUESTED", "CHECKPOINT_DECIDED", "BLOCKER_CREATED",
    "BLOCKER_RESOLVED", "HUMAN_INPUT_REQUESTED", "HUMAN_INPUT_RECEIVED"
]);
const EVENT_ACTORS = Object.freeze(["USER", "SYSTEM", "MOODLE", "RESEARCH", "COMPUTE", "MODEL", "WORKFLOW", "UNKNOWN"]);
const EVENT_SEVERITIES = Object.freeze(["INFO", "NOTICE", "WARNING", "ERROR"]);
const LIMITS = Object.freeze({label: 240, producer: 120, operationType: 100, status: 1000, error: 2000, unit: 40, metadataBytes: 16 * 1024, eventPayloadBytes: 16 * 1024, list: 100, eventPage: 200});

function boundedJson(value, label, limit) {
    if (value === undefined || value === null) return null;
    Academic.assertPlainObject(value, label);
    if (Academic.bytesOf(value) > limit) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} exceeds its bounded size.`);
    return JSON.stringify(value);
}

function positiveLimit(value, fallback, max, label = "Limit") {
    if (value === undefined || value === null || value === "") return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > max) throw new Academic.StudError("INVALID_INPUT", `${label} must be between 1 and ${max}.`);
    return number;
}

function normalizeProgress(input = {}) {
    const mode = Academic.enumValue(input.progressMode || "NONE", PROGRESS_MODES, "Progress mode", "NONE");
    const current = Academic.optionalNonNegativeInteger(input.progressCurrent, "Progress current", 1000000000);
    const total = Academic.optionalNonNegativeInteger(input.progressTotal, "Progress total", 1000000000);
    const unit = Academic.optionalText(input.progressUnit, "Progress unit", LIMITS.unit);
    if (mode === "DETERMINATE") {
        if (current === null || total === null || total <= 0 || current > total) throw new Academic.StudError("INVALID_PROGRESS", "Determinate progress requires 0 <= current <= total and total > 0.");
    } else if (current !== null || total !== null) throw new Academic.StudError("INVALID_PROGRESS", `${mode} progress cannot carry current or total values.`);
    return Object.freeze({mode, current, total, unit});
}

module.exports = Object.freeze({
    ARTIFACT_TYPES, ARTIFACT_ORIGINS, ARTIFACT_LIFECYCLES, ARTIFACT_AVAILABILITY,
    ARTIFACT_RELATIONSHIPS, ACYCLIC_RELATIONSHIPS, RUN_STATES, PROGRESS_MODES,
    EVENT_TYPES, EVENT_ACTORS, EVENT_SEVERITIES, LIMITS, boundedJson, positiveLimit, normalizeProgress
});
