(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTCaseModel = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const CASE_SCHEMA_VERSION = 1;
    const CASE_STATUSES = Object.freeze(["OPEN", "PAUSED", "CLOSED", "ARCHIVED"]);
    const CASE_PRIORITIES = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    const EVIDENCE_TYPES = Object.freeze(["PROVIDER_RESULT", "WEB_REFERENCE", "USER_NOTE", "USER_ATTACHMENT_METADATA", "MANUAL_OBSERVATION"]);
    const ACQUISITION_METHODS = Object.freeze(["NATIVE_PROVIDER_QUERY", "EXTERNAL_REFERENCE", "MANUAL_ENTRY", "USER_NOTE", "IMPORTED_CASE"]);
    const INTEGRITY_STATES = Object.freeze(["VALID", "INVALID", "UNKNOWN"]);
    const TIMELINE_EVENTS = Object.freeze(["CASE_CREATED", "CASE_UPDATED", "CASE_STATUS_CHANGED", "EVIDENCE_ADDED", "EVIDENCE_UPDATED", "EVIDENCE_REMOVED", "NOTE_ADDED", "NOTE_UPDATED", "EXPORT_CREATED", "INTEGRITY_WARNING", "CASE_IMPORTED"]);
    const ERROR_CODES = Object.freeze(["CASE_NOT_FOUND", "CASE_ALREADY_EXISTS", "CASE_INVALID", "CASE_BUSY", "CASE_ARCHIVED", "EVIDENCE_NOT_FOUND", "EVIDENCE_INVALID", "EVIDENCE_INTEGRITY_FAILED", "STORAGE_UNAVAILABLE", "STORAGE_WRITE_FAILED", "STORAGE_READ_FAILED", "INDEX_CORRUPTED", "EXPORT_CANCELLED", "EXPORT_FAILED", "UNSUPPORTED_SCHEMA_VERSION", "PATH_REJECTED", "PAYLOAD_TOO_LARGE", "POLICY_BLOCKED"]);
    const LIMITS = Object.freeze({title: 160, description: 4000, note: 8000, tags: 12, tag: 40, evidenceBytes: 65536, caseEvidence: 500, timeline: 1000, exportBytes: 10485760, payloadBytes: 65536, objectDepth: 10});
    const REDACTABLE_FIELDS = Object.freeze(["queryInput", "canonicalUrl", "sourceUrl", "data.originalInput", "data.canonicalUrl", "data.snapshotUrl"]);

    class CaseError extends Error {
        constructor(code, message, details = null) {
            super(message || "OSINT case operation failed.");
            this.name = "CaseError";
            this.code = ERROR_CODES.includes(code) ? code : "CASE_INVALID";
            this.userMessage = String(message || "OSINT case operation failed.").slice(0, 240);
            this.safeDetails = details && typeof details === "object" ? details : null;
        }
    }

    function now(clock) { return (clock ? clock() : new Date()).toISOString(); }

    function bytesOf(value) {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
        return new TextEncoder().encode(text).length;
    }

    function rejectUnsafeObject(value, depth = 0) {
        if (depth > LIMITS.objectDepth) throw new CaseError("PAYLOAD_TOO_LARGE", "Payload nesting exceeds the permitted limit.");
        if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) return;
        if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new CaseError("CASE_INVALID", "Payload contains an unsupported value.");
        if (Array.isArray(value)) return value.forEach(item => rejectUnsafeObject(item, depth + 1));
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new CaseError("CASE_INVALID", "Payload objects must be plain data.");
        Object.keys(value).forEach(key => {
            if (["__proto__", "constructor", "prototype"].includes(key)) throw new CaseError("CASE_INVALID", "Payload contains a reserved key.");
            rejectUnsafeObject(value[key], depth + 1);
        });
    }

    function assertAllowedKeys(value, keys, label) {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new CaseError("CASE_INVALID", `${label} must be an object.`);
        rejectUnsafeObject(value);
        Object.keys(value).forEach(key => {
            if (!keys.includes(key)) throw new CaseError("CASE_INVALID", `${label} contains an unexpected field.`);
        });
    }

    function plainText(value, max, label, options = {}) {
        if (value === undefined || value === null) return options.optional ? "" : (() => { throw new CaseError("CASE_INVALID", `${label} is required.`); })();
        if (typeof value !== "string") throw new CaseError("CASE_INVALID", `${label} must be text.`);
        if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new CaseError("CASE_INVALID", `${label} contains control characters.`);
        if (/<\s*script|javascript\s*:/i.test(value)) throw new CaseError("CASE_INVALID", `${label} cannot contain executable content.`);
        const normalized = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        if (!normalized && !options.optional) throw new CaseError("CASE_INVALID", `${label} is required.`);
        if (normalized.length > max) throw new CaseError("PAYLOAD_TOO_LARGE", `${label} exceeds its allowed length.`);
        return normalized;
    }

    function nullableText(value, max, label) {
        if (value === null || value === undefined || value === "") return null;
        return plainText(value, max, label, {optional: true}) || null;
    }

    function safeId(value, prefix) {
        if (typeof value !== "string" || !new RegExp(`^${prefix}-[a-z0-9][a-z0-9-]{5,80}$`).test(value)) throw new CaseError("PATH_REJECTED", `${prefix} identifier is invalid.`);
        return value;
    }

    function generateId(prefix, entropy = Math.random().toString(36).slice(2, 10)) {
        return `${prefix}-${Date.now().toString(36)}-${String(entropy).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12)}`;
    }

    function normalizeTags(value) {
        if (value === undefined || value === null || value === "") return [];
        const raw = Array.isArray(value) ? value : String(value).split(",");
        if (raw.length > LIMITS.tags) throw new CaseError("PAYLOAD_TOO_LARGE", "Too many tags.");
        const tags = raw.map(tag => plainText(String(tag), LIMITS.tag, "Tag").toLowerCase()).filter(Boolean);
        if (new Set(tags).size !== tags.length) return [...new Set(tags)];
        return tags;
    }

    function assertEnum(value, allowed, label) {
        if (!allowed.includes(value)) throw new CaseError("CASE_INVALID", `${label} is invalid.`);
        return value;
    }

    function assertTimestamp(value, label) {
        if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) throw new CaseError("CASE_INVALID", `${label} is invalid.`);
        return new Date(value).toISOString();
    }

    function safeUrl(value, label, options = {}) {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) throw new CaseError("CASE_INVALID", `${label} is invalid.`);
        let parsed;
        try { parsed = new URL(value); } catch (error) { throw new CaseError("CASE_INVALID", `${label} is invalid.`); }
        if (!options.allowArchive && !["http:", "https:"].includes(parsed.protocol)) throw new CaseError("CASE_INVALID", `${label} must be an HTTP(S) URL.`);
        return parsed.toString();
    }

    function canonicalize(value) {
        if (value === null || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map(canonicalize);
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = canonicalize(value[key]);
            return result;
        }, {});
    }

    function canonicalStringify(value) { return JSON.stringify(canonicalize(value)); }

    function requireCrypto() {
        if (typeof require !== "function") throw new CaseError("STORAGE_UNAVAILABLE", "Integrity hashing is available only in the trusted process.");
        return require("crypto");
    }

    function sha256(value) { return requireCrypto().createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex"); }

    function integrityPayload(evidence) {
        const copy = {...evidence};
        delete copy.integrity;
        return copy;
    }

    function createIntegrity(evidence, clock) {
        const timestamp = now(clock);
        return {algorithm: "SHA-256", value: sha256(integrityPayload(evidence)), createdAt: timestamp, verifiedAt: timestamp, status: "VALID"};
    }

    function validateIntegrity(value) {
        if (!value || typeof value !== "object" || value.algorithm !== "SHA-256" || !/^[a-f0-9]{64}$/i.test(value.value || "")) throw new CaseError("EVIDENCE_INVALID", "Evidence integrity metadata is invalid.");
        return {algorithm: "SHA-256", value: value.value.toLowerCase(), createdAt: assertTimestamp(value.createdAt, "Integrity timestamp"), verifiedAt: value.verifiedAt ? assertTimestamp(value.verifiedAt, "Integrity verification timestamp") : null, status: assertEnum(value.status || "UNKNOWN", INTEGRITY_STATES, "Integrity status")};
    }

    function validateCaseRecord(value) {
        assertAllowedKeys(value, ["id", "title", "description", "status", "priority", "tags", "createdAt", "updatedAt", "closedAt", "createdBy", "schemaVersion", "evidenceIds", "noteIds", "timelineIds", "metadata", "integrity"], "Case");
        if (value.schemaVersion !== CASE_SCHEMA_VERSION) throw new CaseError("UNSUPPORTED_SCHEMA_VERSION", "Case schema version is not supported.");
        const createdBy = plainText(value.createdBy, 32, "Created by");
        if (!/^(LOCAL_USER|USER|LOCAL_[A-Z0-9_-]+)$/.test(createdBy) || /@/.test(createdBy)) throw new CaseError("CASE_INVALID", "Case creator must be a neutral local identifier.");
        return {
            id: safeId(value.id, "case"),
            title: plainText(value.title, LIMITS.title, "Case title"),
            description: nullableText(value.description, LIMITS.description, "Case description"),
            status: assertEnum(value.status, CASE_STATUSES, "Case status"),
            priority: assertEnum(value.priority, CASE_PRIORITIES, "Case priority"),
            tags: normalizeTags(value.tags),
            createdAt: assertTimestamp(value.createdAt, "Created timestamp"),
            updatedAt: assertTimestamp(value.updatedAt, "Updated timestamp"),
            closedAt: value.closedAt ? assertTimestamp(value.closedAt, "Closed timestamp") : null,
            createdBy,
            schemaVersion: CASE_SCHEMA_VERSION,
            evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.map(id => safeId(id, "evidence")) : [],
            noteIds: Array.isArray(value.noteIds) ? value.noteIds.map(id => safeId(id, "note")) : [],
            timelineIds: Array.isArray(value.timelineIds) ? value.timelineIds.map(id => safeId(id, "timeline")) : [],
            metadata: value.metadata && typeof value.metadata === "object" ? canonicalize(value.metadata) : {},
            integrity: value.integrity && typeof value.integrity === "object" ? canonicalize(value.integrity) : {status: "UNKNOWN"}
        };
    }

    function createCase(input, options = {}) {
        assertAllowedKeys(input, ["title", "description", "priority", "tags"], "New case");
        const timestamp = now(options.clock);
        return validateCaseRecord({
            id: options.id || generateId("case", options.entropy),
            title: input.title,
            description: input.description || null,
            status: "OPEN",
            priority: input.priority || "MEDIUM",
            tags: input.tags || [],
            createdAt: timestamp,
            updatedAt: timestamp,
            closedAt: null,
            createdBy: "LOCAL_USER",
            schemaVersion: CASE_SCHEMA_VERSION,
            evidenceIds: [],
            noteIds: [],
            timelineIds: [],
            metadata: {},
            integrity: {status: "UNKNOWN"}
        });
    }

    function updateCase(caseRecord, patch, options = {}) {
        assertAllowedKeys(patch, ["title", "description", "priority", "status", "tags"], "Case update");
        const current = validateCaseRecord(caseRecord);
        if (current.status === "ARCHIVED") throw new CaseError("CASE_ARCHIVED", "Archived cases cannot be changed in this phase.");
        const nextStatus = patch.status === undefined ? current.status : assertEnum(patch.status, CASE_STATUSES, "Case status");
        return validateCaseRecord({...current,
            title: patch.title === undefined ? current.title : patch.title,
            description: patch.description === undefined ? current.description : patch.description,
            priority: patch.priority === undefined ? current.priority : patch.priority,
            tags: patch.tags === undefined ? current.tags : patch.tags,
            status: nextStatus,
            closedAt: nextStatus === "CLOSED" || nextStatus === "ARCHIVED" ? now(options.clock) : null,
            updatedAt: now(options.clock)
        });
    }

    function sanitizeNormalizedResult(value) {
        assertAllowedKeys(value, ["requestId", "providerId", "capability", "status", "queriedAt", "completedAt", "durationMs", "summary", "data", "warnings", "source", "confidence", "rawAvailable", "error"], "Normalized result");
        if (!["SUCCESS", "EMPTY", "PARTIAL"].includes(value.status)) throw new CaseError("POLICY_BLOCKED", "Only successful, empty or partial results can become evidence.");
        const allowedData = ["available", "originalInput", "canonicalUrl", "snapshotUrl", "snapshotTimestamp", "provider", "queriedAt", "completedAt", "confidence", "warnings"];
        const data = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data : {};
        assertAllowedKeys(data, allowedData, "Normalized result data");
        const source = value.source && typeof value.source === "object" && !Array.isArray(value.source) ? value.source : {};
        assertAllowedKeys(source, ["provider", "type"], "Normalized result source");
        return {
            providerId: plainText(value.providerId, 80, "Provider identifier"),
            capability: plainText(value.capability, 80, "Capability"),
            status: value.status,
            queriedAt: assertTimestamp(value.queriedAt, "Query timestamp"),
            completedAt: value.completedAt ? assertTimestamp(value.completedAt, "Completion timestamp") : null,
            summary: plainText(value.summary || "Provider result", 360, "Result summary"),
            data: {
                available: data.available === true,
                originalInput: nullableText(data.originalInput, 2048, "Original input"),
                canonicalUrl: safeUrl(data.canonicalUrl, "Canonical URL"),
                snapshotUrl: safeUrl(data.snapshotUrl, "Snapshot URL", {allowArchive: true}),
                snapshotTimestamp: nullableText(data.snapshotTimestamp, 64, "Snapshot timestamp"),
                provider: nullableText(data.provider, 96, "Data provider"),
                queriedAt: data.queriedAt ? assertTimestamp(data.queriedAt, "Data query timestamp") : null,
                completedAt: data.completedAt ? assertTimestamp(data.completedAt, "Data completion timestamp") : null,
                confidence: nullableText(data.confidence, 80, "Data confidence"),
                warnings: Array.isArray(data.warnings) ? data.warnings.map(item => plainText(String(item), 240, "Warning")) : []
            },
            warnings: Array.isArray(value.warnings) ? value.warnings.map(item => plainText(String(item), 240, "Warning")) : [],
            source: {provider: nullableText(source.provider, 96, "Source provider"), type: nullableText(source.type, 80, "Source type")},
            confidence: nullableText(value.confidence, 80, "Confidence") || "UNKNOWN"
        };
    }

    function applyRedactions(draft, fields, clock) {
        const target = canonicalize(draft);
        const redactions = [];
        (Array.isArray(fields) ? fields : []).forEach(field => {
            if (!REDACTABLE_FIELDS.includes(field)) throw new CaseError("CASE_INVALID", "Redaction field is not allowed.");
            const [top, nested] = field.split(".");
            if (nested) {
                if (!target[top] || typeof target[top] !== "object" || !Object.prototype.hasOwnProperty.call(target[top], nested)) return;
                if (target[top][nested] === null || target[top][nested] === undefined) return;
                delete target[top][nested];
            } else {
                if (!Object.prototype.hasOwnProperty.call(target, top) || target[top] === null || target[top] === undefined) return;
                delete target[top];
            }
            redactions.push({field, reason: null, redactedAt: now(clock)});
        });
        return {value: target, redactions};
    }

    function createProviderEvidence(input, options = {}) {
        assertAllowedKeys(input, ["caseId", "normalizedResult", "draft"], "Evidence promotion");
        assertAllowedKeys(input.draft || {}, ["title", "summary", "tags", "note", "redactions"], "Evidence draft");
        const result = sanitizeNormalizedResult(input.normalizedResult);
        const draft = input.draft || {};
        const timestamp = now(options.clock);
        const sourceUrl = result.data.snapshotUrl || result.data.canonicalUrl || null;
        const base = {
            id: options.id || generateId("evidence", options.entropy),
            caseId: safeId(input.caseId, "case"),
            type: "PROVIDER_RESULT",
            title: plainText(draft.title || result.summary, LIMITS.title, "Evidence title"),
            summary: plainText(draft.summary || result.summary, LIMITS.description, "Evidence summary"),
            providerId: result.providerId,
            providerName: options.providerName || result.source.provider || result.data.provider || result.providerId,
            capability: result.capability,
            source: result.source,
            sourceUrl,
            canonicalUrl: result.data.canonicalUrl || null,
            acquisitionMethod: "NATIVE_PROVIDER_QUERY",
            queryInput: result.data.originalInput || null,
            queriedAt: result.queriedAt,
            capturedAt: timestamp,
            createdAt: timestamp,
            confidence: result.confidence,
            warnings: result.warnings,
            data: {...result.data, status: result.status, runtimeStatus: result.status},
            notes: [],
            tags: normalizeTags(draft.tags || []),
            integrity: null,
            schemaVersion: CASE_SCHEMA_VERSION,
            redactions: [],
            legalContext: options.legalContext || "UNKNOWN",
            riskContext: options.riskContext || "PASSIVE"
        };
        const redacted = applyRedactions(base, draft.redactions || [], options.clock);
        redacted.value.redactions = redacted.redactions;
        redacted.value.integrity = createIntegrity(redacted.value, options.clock);
        if (bytesOf(redacted.value) > LIMITS.evidenceBytes) throw new CaseError("PAYLOAD_TOO_LARGE", "Evidence object exceeds the maximum allowed size.");
        return redacted.value;
    }

    function createManualEvidence(input, options = {}) {
        assertAllowedKeys(input, ["caseId", "type", "title", "summary", "tags", "note", "sourceUrl"], "Manual evidence");
        const type = assertEnum(input.type, ["MANUAL_OBSERVATION", "WEB_REFERENCE", "USER_NOTE"], "Evidence type");
        if (type === "WEB_REFERENCE" && !safeUrl(input.sourceUrl, "Reference URL")) throw new CaseError("EVIDENCE_INVALID", "A web reference requires a valid HTTP(S) URL.");
        const timestamp = now(options.clock);
        const evidence = {
            id: options.id || generateId("evidence", options.entropy), caseId: safeId(input.caseId, "case"), type,
            title: plainText(input.title, LIMITS.title, "Evidence title"), summary: plainText(input.summary, LIMITS.description, "Evidence summary"),
            providerId: null, providerName: null, capability: null, source: {}, sourceUrl: type === "WEB_REFERENCE" ? safeUrl(input.sourceUrl, "Reference URL") : null, canonicalUrl: null,
            acquisitionMethod: type === "USER_NOTE" ? "USER_NOTE" : type === "WEB_REFERENCE" ? "EXTERNAL_REFERENCE" : "MANUAL_ENTRY",
            queryInput: null, queriedAt: null, capturedAt: timestamp, createdAt: timestamp, confidence: "USER_REPORTED", warnings: [], data: {}, notes: [], tags: normalizeTags(input.tags || []), integrity: null,
            schemaVersion: CASE_SCHEMA_VERSION, redactions: [], legalContext: "UNKNOWN", riskContext: "PASSIVE"
        };
        evidence.integrity = createIntegrity(evidence, options.clock);
        return evidence;
    }

    function validateEvidenceRecord(value) {
        assertAllowedKeys(value, ["id", "caseId", "type", "title", "summary", "providerId", "providerName", "capability", "source", "sourceUrl", "canonicalUrl", "acquisitionMethod", "queryInput", "queriedAt", "capturedAt", "createdAt", "confidence", "warnings", "data", "notes", "tags", "integrity", "schemaVersion", "redactions", "legalContext", "riskContext"], "Evidence");
        if (value.schemaVersion !== CASE_SCHEMA_VERSION) throw new CaseError("UNSUPPORTED_SCHEMA_VERSION", "Evidence schema version is not supported.");
        const evidenceDataKeys = ["available", "originalInput", "canonicalUrl", "snapshotUrl", "snapshotTimestamp", "provider", "queriedAt", "completedAt", "confidence", "warnings", "status", "runtimeStatus"];
        assertAllowedKeys(value.source && typeof value.source === "object" ? value.source : {}, ["provider", "type"], "Evidence source");
        assertAllowedKeys(value.data && typeof value.data === "object" ? value.data : {}, evidenceDataKeys, "Evidence data");
        const evidence = {...value,
            id: safeId(value.id, "evidence"), caseId: safeId(value.caseId, "case"), type: assertEnum(value.type, EVIDENCE_TYPES, "Evidence type"),
            title: plainText(value.title, LIMITS.title, "Evidence title"), summary: plainText(value.summary, LIMITS.description, "Evidence summary"),
            providerId: value.providerId === null ? null : plainText(value.providerId, 80, "Provider identifier"), providerName: value.providerName === null ? null : plainText(value.providerName, 160, "Provider name"), capability: value.capability === null ? null : plainText(value.capability, 80, "Capability"),
            source: value.source && typeof value.source === "object" ? canonicalize(value.source) : {},
            acquisitionMethod: assertEnum(value.acquisitionMethod, ACQUISITION_METHODS, "Acquisition method"),
            queriedAt: value.queriedAt ? assertTimestamp(value.queriedAt, "Query timestamp") : null, capturedAt: assertTimestamp(value.capturedAt, "Capture timestamp"), createdAt: assertTimestamp(value.createdAt, "Evidence created timestamp"),
            confidence: plainText(value.confidence, 80, "Confidence"), warnings: Array.isArray(value.warnings) ? value.warnings.map(item => plainText(String(item), 240, "Warning")) : [],
            data: value.data && typeof value.data === "object" ? canonicalize(value.data) : {}, notes: Array.isArray(value.notes) ? value.notes.map(id => safeId(id, "note")) : [], tags: normalizeTags(value.tags),
            schemaVersion: CASE_SCHEMA_VERSION, redactions: Array.isArray(value.redactions) ? value.redactions.map(item => ({field: plainText(item.field, 80, "Redaction field"), reason: nullableText(item.reason, 240, "Redaction reason"), redactedAt: assertTimestamp(item.redactedAt, "Redaction timestamp")})) : [],
            legalContext: plainText(value.legalContext || "UNKNOWN", 80, "Legal context"), riskContext: plainText(value.riskContext || "PASSIVE", 80, "Risk context")
        };
        if (evidence.type === "PROVIDER_RESULT" && (!evidence.providerId || !evidence.providerName || !evidence.capability || !evidence.queriedAt)) throw new CaseError("EVIDENCE_INVALID", "Provider evidence is missing required provenance.");
        // A real redaction removes the stored value rather than replacing it
        // with a hidden copy. Preserve that absence through validation so the
        // canonical evidence hash remains stable after a reload.
        if (Object.prototype.hasOwnProperty.call(value, "sourceUrl")) evidence.sourceUrl = safeUrl(value.sourceUrl, "Source URL");
        else delete evidence.sourceUrl;
        if (Object.prototype.hasOwnProperty.call(value, "canonicalUrl")) evidence.canonicalUrl = safeUrl(value.canonicalUrl, "Canonical URL");
        else delete evidence.canonicalUrl;
        if (Object.prototype.hasOwnProperty.call(value, "queryInput")) evidence.queryInput = nullableText(value.queryInput, 2048, "Query input");
        else delete evidence.queryInput;
        evidence.integrity = validateIntegrity(value.integrity);
        return evidence;
    }

    function createTimelineEvent(caseId, type, summary, options = {}) {
        return {id: options.id || generateId("timeline", options.entropy), caseId: safeId(caseId, "case"), type: assertEnum(type, TIMELINE_EVENTS, "Timeline event"), timestamp: now(options.clock), summary: plainText(summary, 360, "Timeline summary"), relatedObjectId: options.relatedObjectId || null, metadata: options.metadata && typeof options.metadata === "object" ? canonicalize(options.metadata) : {}};
    }

    function createNote(input, options = {}) {
        assertAllowedKeys(input, ["caseId", "evidenceId", "text", "tags"], "Note");
        const timestamp = now(options.clock);
        return {id: options.id || generateId("note", options.entropy), caseId: safeId(input.caseId, "case"), evidenceId: input.evidenceId ? safeId(input.evidenceId, "evidence") : null, text: plainText(input.text, LIMITS.note, "Note"), createdAt: timestamp, updatedAt: timestamp, tags: normalizeTags(input.tags || [])};
    }

    function updateNote(note, patch, options = {}) {
        assertAllowedKeys(patch, ["text", "tags"], "Note update");
        if (!note || typeof note !== "object") throw new CaseError("CASE_INVALID", "Note is invalid.");
        return {
            id: safeId(note.id, "note"),
            caseId: safeId(note.caseId, "case"),
            evidenceId: note.evidenceId ? safeId(note.evidenceId, "evidence") : null,
            text: patch.text === undefined ? plainText(note.text, LIMITS.note, "Note") : plainText(patch.text, LIMITS.note, "Note"),
            createdAt: assertTimestamp(note.createdAt, "Note created timestamp"),
            updatedAt: now(options.clock),
            tags: patch.tags === undefined ? normalizeTags(note.tags || []) : normalizeTags(patch.tags)
        };
    }

    return Object.freeze({CASE_SCHEMA_VERSION, CASE_STATUSES, CASE_PRIORITIES, EVIDENCE_TYPES, ACQUISITION_METHODS, INTEGRITY_STATES, TIMELINE_EVENTS, ERROR_CODES, LIMITS, REDACTABLE_FIELDS, CaseError, now, bytesOf, rejectUnsafeObject, assertAllowedKeys, plainText, nullableText, safeId, generateId, normalizeTags, assertEnum, assertTimestamp, safeUrl, canonicalize, canonicalStringify, sha256, integrityPayload, createIntegrity, validateIntegrity, validateCaseRecord, createCase, updateCase, sanitizeNormalizedResult, applyRedactions, createProviderEvidence, createManualEvidence, validateEvidenceRecord, createTimelineEvent, createNote, updateNote});
});
