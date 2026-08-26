"use strict";

const crypto = require("crypto");

const SCHEMA_VERSION = 19;
const ENTITY_TYPES = Object.freeze(["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"]);
const RELATIONSHIP_ENTITY_TYPES = Object.freeze([...ENTITY_TYPES, "EXTERNAL_IDENTIFIER"]);
const RELATIONSHIP_TYPES = Object.freeze(["BELONGS_TO", "RELATES_TO", "SUPPORTS", "USES", "REFERENCES", "HAS_RESOURCE", "HAS_NOTE", "HAS_PAPER", "HAS_DOCUMENT", "CITES", "DERIVED_FROM_DOCUMENT", "RELATED_EMAIL", "RELATED_CALENDAR_EVENT"]);
const PROVENANCE_SOURCE_TYPES = Object.freeze(["USER", "MOODLE", "MOODLE_ICS", "CALENDAR", "EMAIL", "COURSE_DOCUMENT", "RESEARCH_PROVIDER", "GITHUB", "LOCAL_EXTRACTION", "AEGIS_ENGINEERING_COMPUTE", "AI_SUGGESTION", "IMPORT", "UNKNOWN"]);
const PROVENANCE_AUTHORITIES = Object.freeze(["AUTHORITATIVE", "USER_OVERRIDE", "TRUSTED", "CORROBORATING", "INFERRED", "SUGGESTED", "UNKNOWN"]);
const COST_MODELS = Object.freeze(["FREE_OPEN", "FREE_LOCAL", "FREE_SERVICE", "FREEMIUM", "PAID", "SUBSCRIPTION"]);
const COURSE_STATUSES = Object.freeze(["ACTIVE", "COMPLETED", "ARCHIVED"]);
const ASSESSMENT_CLASSIFICATIONS = Object.freeze(["COURSEWORK", "EXAM", "LAB_PRACTICAL", "PRESENTATION", "TEAM_PROJECT", "INDIVIDUAL_COMPONENT", "PEER_FEEDBACK", "SUBMISSION_POINT", "FORMATIVE_PRACTICE", "ADMINISTRATIVE", "OTHER", "UNKNOWN"]);
const ASSIGNMENT_STATUSES = Object.freeze(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "GRADED", "ARCHIVED"]);
const SUBMISSION_STATUSES = Object.freeze(["UNKNOWN", "NOT_SUBMITTED", "SUBMITTED"]);
const GRADE_SCHEMES = Object.freeze(["PERCENTAGE", "POINTS", "TEXT", "PASS_FAIL", "UNKNOWN"]);
const PRIORITY_LEVELS = Object.freeze(["URGENT", "HIGH", "NORMAL", "LOW"]);
const REVISION_STATUSES = Object.freeze(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]);
const REVISION_DIFFICULTIES = Object.freeze(["UNKNOWN", "LOW", "MEDIUM", "HIGH"]);
const REVISION_CONFIDENCE = Object.freeze(["UNKNOWN", "LOW", "MEDIUM", "HIGH"]);
const DOCUMENT_TYPES = Object.freeze(["UNKNOWN", "ARTICLE", "BOOK", "BOOK_CHAPTER", "THESIS", "REPORT", "COURSE_MATERIAL", "LECTURE_SLIDES", "LEGAL_MATERIAL", "CASE_LAW", "POLICY", "DATASET_DOCUMENTATION", "TECHNICAL_STANDARD", "OTHER"]);
const DOCUMENT_EXTRACTION_STATUSES = Object.freeze(["NOT_ANALYZED", "READY", "PARTIAL", "NO_TEXT", "OCR_REQUIRED", "ENCRYPTED", "CANCELLED", "FAILED"]);
const CONTEXT_RELATION_STATUSES = Object.freeze(["DIRECT", "DERIVED", "SUGGESTED", "CONFLICTING", "UNRESOLVED"]);
const CONTEXT_DECISIONS = Object.freeze(["INCLUDE", "EXCLUDE", "PIN"]);
const CONTEXT_PACKAGE_STATUSES = Object.freeze(["READY", "TRUNCATED", "INSUFFICIENT_CONTEXT"]);
const NOTEBOOK_TYPES = Object.freeze(["GENERAL", "COMPUTATIONAL", "DATA_ANALYSIS", "CODE_EXERCISE", "REPRODUCIBLE_APPENDIX", "TEXT_ANALYSIS", "OTHER"]);
const NOTEBOOK_LANGUAGES = Object.freeze(["TEXT", "PYTHON", "JAVASCRIPT", "R", "SQL", "PSEUDOCODE", "OTHER"]);
const NOTEBOOK_EXECUTION_STATUSES = Object.freeze(["EDITING_ONLY", "NOT_INSTALLED", "UNAVAILABLE"]);
const DATASET_FORMATS = Object.freeze(["CSV", "TSV"]);
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

function optionalProgress(value) {
    const progress = optionalNumber(value, "Local progress");
    if (progress === null) return null;
    if (progress < 0 || progress > 100) throw new StudError("INVALID_INPUT", "Local progress must be between 0 and 100.");
    return progress;
}

function optionalNonNegativeInteger(value, label, max = 1000000) {
    const number = optionalNumber(value, label);
    if (number === null) return null;
    if (!Number.isInteger(number) || number < 0 || number > max) throw new StudError("INVALID_INPUT", `${label} must be a whole number between 0 and ${max}.`);
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
    assertAllowedKeys(input, ["title", "shortName", "code", "description", "startDate", "endDate", "academicYear", "academicTerm", "academicLevel", "status"], "Course");
    const result = {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Course title"),
        shortName: input.shortName === undefined ? existing.shortName || null : optionalText(input.shortName, "Course short name", LIMITS.code),
        code: input.code === undefined ? existing.code || null : optionalText(input.code, "Course code", LIMITS.code),
        description: input.description === undefined ? existing.description || null : optionalText(input.description, "Course description"),
        startDate: input.startDate === undefined ? existing.startDate || null : optionalDate(input.startDate, "Course start date"),
        endDate: input.endDate === undefined ? existing.endDate || null : optionalDate(input.endDate, "Course end date"),
        // These are explicit academic organisation fields.  They are never
        // inferred from a module code, title or an institution-specific rule.
        academicYear: input.academicYear === undefined ? existing.academicYear || null : optionalText(input.academicYear, "Academic year", 80),
        academicTerm: input.academicTerm === undefined ? existing.academicTerm || null : optionalText(input.academicTerm, "Academic term", 80),
        academicLevel: input.academicLevel === undefined ? existing.academicLevel || null : optionalText(input.academicLevel, "Academic level", 80),
        status: input.status === undefined ? existing.status || "ACTIVE" : enumValue(input.status, COURSE_STATUSES, "Course status", "ACTIVE")
    };
    if (result.startDate && result.endDate && result.startDate > result.endDate) throw new StudError("INVALID_INPUT", "Course end date cannot precede the start date.");
    return result;
}

function normalizeAssignment(input = {}, existing = {}) {
    assertAllowedKeys(input, ["courseId", "title", "description", "releaseDate", "dueDate", "cutoffDate", "status", "submissionStatus", "submittedAt", "grade", "gradeMaximum", "gradeScheme", "gradeText", "weight", "feedback", "localProgress", "priority"], "Assignment");
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
        gradeScheme: input.gradeScheme === undefined ? existing.gradeScheme || "UNKNOWN" : enumValue(input.gradeScheme, GRADE_SCHEMES, "Grade scheme", "UNKNOWN"),
        gradeText: input.gradeText === undefined ? existing.gradeText || null : optionalText(input.gradeText, "Grade text", 240),
        weight: input.weight === undefined ? existing.weight ?? null : optionalNumber(input.weight, "Assignment weight"),
        feedback: input.feedback === undefined ? existing.feedback || null : optionalText(input.feedback, "Assignment feedback"),
        localProgress: input.localProgress === undefined ? existing.localProgress ?? null : optionalProgress(input.localProgress),
        priority: input.priority === undefined ? existing.priority || null : enumValue(input.priority, PRIORITY_LEVELS, "Assignment priority")
    };
    if (result.gradeMaximum !== null && result.gradeMaximum <= 0) throw new StudError("INVALID_INPUT", "Maximum grade must be greater than zero.");
    if (result.gradeScheme === "PERCENTAGE" && result.grade !== null && (result.grade < 0 || result.grade > 100)) throw new StudError("INVALID_INPUT", "Percentage grade must be between 0 and 100.");
    if (result.gradeScheme === "POINTS" && result.grade !== null && result.gradeMaximum !== null && result.grade > result.gradeMaximum) throw new StudError("INVALID_INPUT", "Grade cannot exceed maximum grade.");
    if (["TEXT", "PASS_FAIL"].includes(result.gradeScheme) && result.grade !== null) throw new StudError("INVALID_INPUT", "Text and pass/fail grades cannot be stored as a numeric grade.");
    if (["TEXT", "PASS_FAIL"].includes(result.gradeScheme) && !result.gradeText) throw new StudError("INVALID_INPUT", "Text and pass/fail grades require a text value.");
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
    assertAllowedKeys(input, ["title", "objectType", "year", "publishedDate", "abstract", "venue", "publisher", "authors", "doi", "sourceUrl", "citationJson", "oaJson", "localDocumentReference", "documentMetadataJson"], "Research paper");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Paper title"),
        objectType: input.objectType === undefined ? existing.objectType || "ARTICLE" : enumValue(input.objectType, ["ARTICLE", "BOOK", "CHAPTER", "DATASET", "SOFTWARE", "REPORT", "THESIS", "OTHER"], "Research object type", "OTHER"),
        year: input.year === undefined ? existing.year ?? null : optionalNumber(input.year, "Paper year"),
        publishedDate: input.publishedDate === undefined ? existing.publishedDate || null : optionalText(input.publishedDate, "Published date", 80),
        abstract: input.abstract === undefined ? existing.abstract || null : optionalText(input.abstract, "Paper abstract"),
        venue: input.venue === undefined ? existing.venue || null : optionalText(input.venue, "Paper venue", 500),
        publisher: input.publisher === undefined ? existing.publisher || null : optionalText(input.publisher, "Paper publisher", 500),
        authors: input.authors === undefined ? existing.authors || null : optionalText(input.authors, "Paper authors", 4000),
        doi: input.doi === undefined ? existing.doi || null : optionalText(input.doi, "DOI", 300),
        sourceUrl: input.sourceUrl === undefined ? existing.sourceUrl || null : optionalText(input.sourceUrl, "Source URL", 2048),
        citationJson: input.citationJson === undefined ? existing.citationJson || null : optionalText(input.citationJson, "Citation JSON", LIMITS.content),
        oaJson: input.oaJson === undefined ? existing.oaJson || null : optionalText(input.oaJson, "Open access metadata", 12000),
        localDocumentReference: input.localDocumentReference === undefined ? existing.localDocumentReference || null : optionalText(input.localDocumentReference, "Local document reference", 260),
        documentMetadataJson: input.documentMetadataJson === undefined ? existing.documentMetadataJson || null : optionalText(input.documentMetadataJson, "Document metadata", 12000)
    };
}

function normalizeNote(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "content", "courseId", "assignmentId", "documentVersion", "documentJson"], "Note");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Note title"),
        content: input.content === undefined ? existing.content || "" : optionalText(input.content, "Note content", LIMITS.content) || "",
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null),
        documentVersion: input.documentVersion === undefined ? existing.documentVersion || 1 : Math.max(1, Math.min(10, Number(input.documentVersion) || 1)),
        documentJson: input.documentJson === undefined ? existing.documentJson || null : optionalText(input.documentJson, "Structured note document", LIMITS.content)
    };
}

function normalizeRevisionItem(input = {}, existing = {}) {
    assertAllowedKeys(input, ["courseId", "prompt", "answer", "title", "description", "status", "priority", "difficulty", "confidence", "estimatedDurationMinutes", "accumulatedStudyMinutes", "lastStudiedAt", "nextPlannedRevisionAt", "scheduledRevisionAt", "targetMastery", "currentMastery", "spacedRevisionEnabled", "successfulRevisionCount", "pinned", "planPosition", "suggestionDismissedUntil", "sourceType", "sourceId"], "Revision item");
    const incomingTitle = input.title === undefined ? undefined : requiredText(input.title, "Revision title");
    const incomingPrompt = input.prompt === undefined ? undefined : requiredText(input.prompt, "Revision prompt", LIMITS.content);
    const title = incomingTitle === undefined ? (existing.title || incomingPrompt || existing.prompt) : incomingTitle;
    if (!title) throw new StudError("INVALID_INPUT", "Revision title is required.");
    const prompt = incomingPrompt === undefined ? (existing.prompt || title) : incomingPrompt;
    return {
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        prompt,
        answer: input.answer === undefined ? existing.answer || "" : optionalText(input.answer, "Revision answer", LIMITS.content) || "",
        title,
        description: input.description === undefined ? existing.description || null : optionalText(input.description, "Revision description"),
        status: input.status === undefined ? existing.status || "ACTIVE" : enumValue(input.status, REVISION_STATUSES, "Revision status", "ACTIVE"),
        priority: input.priority === undefined ? existing.priority || "NORMAL" : enumValue(input.priority, PRIORITY_LEVELS, "Revision priority", "NORMAL"),
        difficulty: input.difficulty === undefined ? existing.difficulty || "UNKNOWN" : enumValue(input.difficulty, REVISION_DIFFICULTIES, "Revision difficulty", "UNKNOWN"),
        confidence: input.confidence === undefined ? existing.confidence || "UNKNOWN" : enumValue(input.confidence, REVISION_CONFIDENCE, "Revision confidence", "UNKNOWN"),
        estimatedDurationMinutes: input.estimatedDurationMinutes === undefined ? existing.estimatedDurationMinutes ?? null : optionalNonNegativeInteger(input.estimatedDurationMinutes, "Estimated duration", 1440),
        accumulatedStudyMinutes: input.accumulatedStudyMinutes === undefined ? existing.accumulatedStudyMinutes ?? 0 : optionalNonNegativeInteger(input.accumulatedStudyMinutes, "Accumulated study duration") ?? 0,
        lastStudiedAt: input.lastStudiedAt === undefined ? existing.lastStudiedAt || null : optionalDate(input.lastStudiedAt, "Last studied"),
        nextPlannedRevisionAt: input.nextPlannedRevisionAt === undefined ? existing.nextPlannedRevisionAt || null : optionalDate(input.nextPlannedRevisionAt, "Suggested revision date"),
        scheduledRevisionAt: input.scheduledRevisionAt === undefined ? existing.scheduledRevisionAt || null : optionalDate(input.scheduledRevisionAt, "Scheduled revision date"),
        targetMastery: input.targetMastery === undefined ? existing.targetMastery ?? null : optionalProgress(input.targetMastery),
        currentMastery: input.currentMastery === undefined ? existing.currentMastery ?? null : optionalProgress(input.currentMastery),
        spacedRevisionEnabled: input.spacedRevisionEnabled === undefined ? Boolean(existing.spacedRevisionEnabled) : input.spacedRevisionEnabled === true || input.spacedRevisionEnabled === "true" || input.spacedRevisionEnabled === 1 || input.spacedRevisionEnabled === "1",
        successfulRevisionCount: input.successfulRevisionCount === undefined ? existing.successfulRevisionCount ?? 0 : optionalNonNegativeInteger(input.successfulRevisionCount, "Successful revisions", 10000) ?? 0,
        pinned: input.pinned === undefined ? Boolean(existing.pinned) : input.pinned === true || input.pinned === "true" || input.pinned === 1 || input.pinned === "1",
        planPosition: input.planPosition === undefined ? existing.planPosition ?? null : optionalNonNegativeInteger(input.planPosition, "Plan position", 100000),
        suggestionDismissedUntil: input.suggestionDismissedUntil === undefined ? existing.suggestionDismissedUntil || null : optionalDate(input.suggestionDismissedUntil, "Suggestion dismissal date"),
        sourceType: input.sourceType === undefined ? existing.sourceType || null : optionalText(input.sourceType, "Revision source type", 80),
        sourceId: input.sourceId === undefined ? existing.sourceId || null : (input.sourceId ? safeId(input.sourceId, "Revision source ID") : null)
    };
}

function normalizedJson(value, label, max = LIMITS.content) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") throw new StudError("INVALID_INPUT", `${label} must be JSON text.`);
    if (value.length > max) throw new StudError("BOUNDS_EXCEEDED", `${label} is too large.`);
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object") throw new Error("not object");
        return JSON.stringify(parsed);
    } catch (error) { throw new StudError("INVALID_INPUT", `${label} must be valid structured JSON.`); }
}

function normalizeComputeResult(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "capability", "tool", "operation", "inputJson", "normalizedInputJson", "outputJson", "unitsJson", "plotJson", "runtimeJson", "courseId", "assignmentId", "noteId"], "Engineering compute result");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Compute result title"),
        capability: input.capability === undefined ? existing.capability || "ENGINEERING_COMPUTE" : requiredText(input.capability, "Compute capability", 80).toUpperCase(),
        tool: input.tool === undefined ? existing.tool : requiredText(input.tool, "Compute tool", 80).toUpperCase(),
        operation: input.operation === undefined ? existing.operation : requiredText(input.operation, "Compute operation", 80).toUpperCase(),
        inputJson: input.inputJson === undefined ? existing.inputJson || null : normalizedJson(input.inputJson, "Compute input"),
        normalizedInputJson: input.normalizedInputJson === undefined ? existing.normalizedInputJson || null : normalizedJson(input.normalizedInputJson, "Normalized compute input"),
        outputJson: input.outputJson === undefined ? existing.outputJson || null : normalizedJson(input.outputJson, "Compute output"),
        unitsJson: input.unitsJson === undefined ? existing.unitsJson || null : normalizedJson(input.unitsJson, "Compute units", 12000),
        plotJson: input.plotJson === undefined ? existing.plotJson || null : normalizedJson(input.plotJson, "Compute plot", LIMITS.content),
        runtimeJson: input.runtimeJson === undefined ? existing.runtimeJson || null : normalizedJson(input.runtimeJson, "Compute runtime", 12000),
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null),
        noteId: input.noteId === undefined ? existing.noteId || null : (input.noteId ? safeId(input.noteId, "Note ID") : null)
    };
}

function normalizeAcademicDocument(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "documentType", "displayName", "managedReference", "mimeType", "byteSize", "checksum", "pageCount", "extractionStatus", "extractionEngine", "extractionVersion", "courseId", "assignmentId", "sourcePaperId"], "Academic document");
    const byteSize = input.byteSize === undefined ? existing.byteSize ?? null : optionalNonNegativeInteger(input.byteSize, "Document byte size", 50 * 1024 * 1024);
    const pageCount = input.pageCount === undefined ? existing.pageCount ?? null : optionalNonNegativeInteger(input.pageCount, "Document page count", 10000);
    const checksum = input.checksum === undefined ? existing.checksum || null : optionalText(input.checksum, "Document checksum", 128);
    if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) throw new StudError("INVALID_INPUT", "Document checksum must be a SHA-256 value.");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Document title"),
        documentType: input.documentType === undefined ? existing.documentType || "UNKNOWN" : enumValue(input.documentType, DOCUMENT_TYPES, "Document type", "UNKNOWN"),
        displayName: input.displayName === undefined ? existing.displayName || null : optionalText(input.displayName, "Document display name", LIMITS.title),
        managedReference: input.managedReference === undefined ? existing.managedReference || null : optionalText(input.managedReference, "Managed document reference", 260),
        mimeType: input.mimeType === undefined ? existing.mimeType || null : optionalText(input.mimeType, "Document MIME type", 120),
        byteSize,
        checksum: checksum ? checksum.toLowerCase() : null,
        pageCount,
        extractionStatus: input.extractionStatus === undefined ? existing.extractionStatus || "NOT_ANALYZED" : enumValue(input.extractionStatus, DOCUMENT_EXTRACTION_STATUSES, "Document extraction status", "NOT_ANALYZED"),
        extractionEngine: input.extractionEngine === undefined ? existing.extractionEngine || null : optionalText(input.extractionEngine, "Document extraction engine", 120),
        extractionVersion: input.extractionVersion === undefined ? existing.extractionVersion || null : optionalText(input.extractionVersion, "Document extraction version", 120),
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null),
        sourcePaperId: input.sourcePaperId === undefined ? existing.sourcePaperId || null : (input.sourcePaperId ? safeId(input.sourcePaperId, "Research paper ID") : null)
    };
}

function normalizeNotebook(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "description", "notebookType", "language", "executionStatus", "courseId", "assignmentId", "noteId"], "Notebook");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Notebook title"),
        description: input.description === undefined ? existing.description || null : optionalText(input.description, "Notebook description"),
        notebookType: input.notebookType === undefined ? existing.notebookType || "GENERAL" : enumValue(input.notebookType, NOTEBOOK_TYPES, "Notebook type", "GENERAL"),
        language: input.language === undefined ? existing.language || "TEXT" : enumValue(input.language, NOTEBOOK_LANGUAGES, "Notebook language", "TEXT"),
        executionStatus: input.executionStatus === undefined ? existing.executionStatus || "EDITING_ONLY" : enumValue(input.executionStatus, NOTEBOOK_EXECUTION_STATUSES, "Notebook execution status", "EDITING_ONLY"),
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null),
        noteId: input.noteId === undefined ? existing.noteId || null : (input.noteId ? safeId(input.noteId, "Note ID") : null)
    };
}

function normalizeDataset(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "description", "format", "managedReference", "mimeType", "byteSize", "checksum", "rowCount", "columnsJson", "summaryJson", "courseId", "assignmentId"], "Dataset");
    const checksum = input.checksum === undefined ? existing.checksum || null : optionalText(input.checksum, "Dataset checksum", 128);
    if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) throw new StudError("INVALID_INPUT", "Dataset checksum must be a SHA-256 value.");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Dataset title"),
        description: input.description === undefined ? existing.description || null : optionalText(input.description, "Dataset description"),
        format: input.format === undefined ? existing.format || "CSV" : enumValue(input.format, DATASET_FORMATS, "Dataset format", "CSV"),
        managedReference: input.managedReference === undefined ? existing.managedReference || null : optionalText(input.managedReference, "Managed dataset reference", 260),
        mimeType: input.mimeType === undefined ? existing.mimeType || null : optionalText(input.mimeType, "Dataset MIME type", 120),
        byteSize: input.byteSize === undefined ? existing.byteSize ?? null : optionalNonNegativeInteger(input.byteSize, "Dataset byte size", 12 * 1024 * 1024),
        checksum: checksum ? checksum.toLowerCase() : null,
        rowCount: input.rowCount === undefined ? existing.rowCount ?? null : optionalNonNegativeInteger(input.rowCount, "Dataset row count", 25000),
        columnsJson: input.columnsJson === undefined ? existing.columnsJson || null : normalizedJson(input.columnsJson, "Dataset columns", 24000),
        summaryJson: input.summaryJson === undefined ? existing.summaryJson || null : normalizedJson(input.summaryJson, "Dataset summary", 40000),
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null)
    };
}

function normalizeRepositoryReference(input = {}, existing = {}) {
    assertAllowedKeys(input, ["title", "provider", "owner", "repository", "canonicalUrl", "selectedRef", "commitSha", "metadataJson", "courseId", "assignmentId"], "Repository reference");
    return {
        title: input.title === undefined ? existing.title : requiredText(input.title, "Repository title"),
        provider: input.provider === undefined ? existing.provider || "GITHUB" : enumValue(input.provider, ["GITHUB"], "Repository provider", "GITHUB"),
        owner: input.owner === undefined ? existing.owner : requiredText(input.owner, "Repository owner", 100),
        repository: input.repository === undefined ? existing.repository : requiredText(input.repository, "Repository name", 100),
        canonicalUrl: input.canonicalUrl === undefined ? existing.canonicalUrl : requiredText(input.canonicalUrl, "Repository canonical URL", 2048),
        selectedRef: input.selectedRef === undefined ? existing.selectedRef || null : optionalText(input.selectedRef, "Repository ref", 160),
        commitSha: input.commitSha === undefined ? existing.commitSha || null : optionalText(input.commitSha, "Repository commit SHA", 80),
        metadataJson: input.metadataJson === undefined ? existing.metadataJson || null : normalizedJson(input.metadataJson, "Repository metadata", 24000),
        courseId: input.courseId === undefined ? existing.courseId || null : (input.courseId ? safeId(input.courseId, "Course ID") : null),
        assignmentId: input.assignmentId === undefined ? existing.assignmentId || null : (input.assignmentId ? safeId(input.assignmentId, "Assignment ID") : null)
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
    case "COMPUTE_RESULT": return normalizeComputeResult(input, existing);
    case "ACADEMIC_DOCUMENT": return normalizeAcademicDocument(input, existing);
    case "NOTEBOOK": return normalizeNotebook(input, existing);
    case "DATASET": return normalizeDataset(input, existing);
    case "REPOSITORY_REFERENCE": return normalizeRepositoryReference(input, existing);
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
    PROVENANCE_AUTHORITIES, COST_MODELS, COURSE_STATUSES, ASSESSMENT_CLASSIFICATIONS, ASSIGNMENT_STATUSES, DOCUMENT_TYPES, DOCUMENT_EXTRACTION_STATUSES,
    CONTEXT_RELATION_STATUSES, CONTEXT_DECISIONS, CONTEXT_PACKAGE_STATUSES, NOTEBOOK_TYPES, NOTEBOOK_LANGUAGES, NOTEBOOK_EXECUTION_STATUSES, DATASET_FORMATS,
    SUBMISSION_STATUSES, GRADE_SCHEMES, PRIORITY_LEVELS, REVISION_STATUSES, REVISION_DIFFICULTIES, REVISION_CONFIDENCE, LIMITS, StudError, now, bytesOf, assertPlainObject,
    assertAllowedKeys, requiredText, optionalText, optionalNumber, optionalProgress, optionalNonNegativeInteger, optionalDate, enumValue,
    safeId, createId, validateEntityType, validateRelationshipEntityType, normalizeByEntityType, normalizeComputeResult, normalizeAcademicDocument, normalizeNotebook, normalizeDataset, normalizeRepositoryReference,
    normalizeProvenance, normalizeRelationship, normalizedSearchTerms
});
