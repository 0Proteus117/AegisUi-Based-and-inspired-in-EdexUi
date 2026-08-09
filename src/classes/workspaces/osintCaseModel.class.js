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
    const ACQUISITION_METHODS = Object.freeze(["NATIVE_PROVIDER_QUERY", "LOCAL_MEDIA_INSPECTION", "EXTERNAL_REFERENCE", "MANUAL_ENTRY", "USER_NOTE", "IMPORTED_CASE"]);
    const INTEGRITY_STATES = Object.freeze(["VALID", "INVALID", "UNKNOWN"]);
    const TIMELINE_EVENTS = Object.freeze(["CASE_CREATED", "CASE_UPDATED", "CASE_STATUS_CHANGED", "EVIDENCE_ADDED", "EVIDENCE_UPDATED", "EVIDENCE_REMOVED", "NOTE_ADDED", "NOTE_UPDATED", "EXPORT_CREATED", "INTEGRITY_WARNING", "CASE_IMPORTED"]);
    const ERROR_CODES = Object.freeze(["CASE_NOT_FOUND", "CASE_ALREADY_EXISTS", "CASE_INVALID", "CASE_BUSY", "CASE_ARCHIVED", "EVIDENCE_NOT_FOUND", "EVIDENCE_INVALID", "EVIDENCE_INTEGRITY_FAILED", "STORAGE_UNAVAILABLE", "STORAGE_WRITE_FAILED", "STORAGE_READ_FAILED", "INDEX_CORRUPTED", "EXPORT_CANCELLED", "EXPORT_FAILED", "UNSUPPORTED_SCHEMA_VERSION", "PATH_REJECTED", "PAYLOAD_TOO_LARGE", "POLICY_BLOCKED"]);
    const LIMITS = Object.freeze({title: 160, description: 4000, note: 8000, tags: 12, tag: 40, evidenceBytes: 65536, caseEvidence: 500, timeline: 1000, exportBytes: 10485760, payloadBytes: 65536, objectDepth: 10});
    const REDACTABLE_FIELDS = Object.freeze(["queryInput", "canonicalUrl", "sourceUrl", "data.originalInput", "data.canonicalUrl", "data.snapshotUrl", "data.geo.latitude", "data.geo.longitude", "data.geo.displayName", "data.geo.locality", "data.geo.region", "data.geo.country", "data.geo.countryCode", "data.geo.elevationM", "data.geo.observations", "data.media.displayLabel", "data.media.captureTimestamp", "data.media.normalizedTimestamp", "data.media.cameraMake", "data.media.cameraModel", "data.media.lens", "data.media.geo", "data.media.softwareTag", "data.media.analystObservation", "data.infrastructure.normalizedTarget", "data.infrastructure.dns", "data.infrastructure.network", "data.infrastructure.provenance"]);

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
        const allowedData = ["available", "originalInput", "canonicalUrl", "snapshotUrl", "snapshotTimestamp", "provider", "queriedAt", "completedAt", "confidence", "warnings", "geo", "media", "infrastructure", "analystObservation"];
        const data = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data : {};
        assertAllowedKeys(data, allowedData, "Normalized result data");
        const source = value.source && typeof value.source === "object" && !Array.isArray(value.source) ? value.source : {};
        assertAllowedKeys(source, ["provider", "type"], "Normalized result source");
        const geo = data.geo === undefined || data.geo === null ? null : sanitizeGeoEvidenceData(data.geo);
        const media = data.media === undefined || data.media === null ? null : sanitizeMediaEvidenceData(data.media);
        const infrastructure = data.infrastructure === undefined || data.infrastructure === null ? null : sanitizeInfrastructureEvidenceData(data.infrastructure);
        const normalizedData = {
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
        };
        // Keep prior evidence shapes stable: legacy provider evidence does not
        // acquire a synthetic `geo: null` property during this migration.
        if (geo !== null) normalizedData.geo = geo;
        if (media !== null) normalizedData.media = media;
        if (infrastructure !== null) normalizedData.infrastructure = infrastructure;
        if (data.analystObservation !== undefined) normalizedData.analystObservation = nullableText(data.analystObservation, 4000, "Infrastructure analyst observation");
        return {
            providerId: plainText(value.providerId, 80, "Provider identifier"),
            capability: plainText(value.capability, 80, "Capability"),
            status: value.status,
            queriedAt: assertTimestamp(value.queriedAt, "Query timestamp"),
            completedAt: value.completedAt ? assertTimestamp(value.completedAt, "Completion timestamp") : null,
            summary: plainText(value.summary || "Provider result", 360, "Result summary"),
            data: normalizedData,
            warnings: Array.isArray(value.warnings) ? value.warnings.map(item => plainText(String(item), 240, "Warning")) : [],
            source: {provider: nullableText(source.provider, 96, "Source provider"), type: nullableText(source.type, 80, "Source type")},
            confidence: nullableText(value.confidence, 80, "Confidence") || "UNKNOWN"
        };
    }

    function safeGeoNumber(value, minimum, maximum, label) {
        if (!Number.isFinite(value) || value < minimum || value > maximum) throw new CaseError("CASE_INVALID", `${label} is invalid.`);
        return Number(value.toFixed(7));
    }

    function sanitizeGeoEvidenceData(value, options = {}) {
        assertAllowedKeys(value, ["latitude", "longitude", "coordinateFormat", "displayName", "locality", "region", "country", "countryCode", "elevationM", "verificationStatus", "verificationConfidence", "provenance", "observations"], "Geospatial normalized data");
        const observations = Array.isArray(value.observations) ? value.observations : [];
        const has = key => Object.prototype.hasOwnProperty.call(value, key);
        if (observations.length > 8) throw new CaseError("PAYLOAD_TOO_LARGE", "Too many geospatial provider observations.");
        const requireCoordinates = options.requireCoordinates !== false;
        if (requireCoordinates && (!Object.prototype.hasOwnProperty.call(value, "latitude") || !Object.prototype.hasOwnProperty.call(value, "longitude"))) {
            throw new CaseError("CASE_INVALID", "Geospatial normalized data requires latitude and longitude.");
        }
        const output = {
            latitude: has("latitude") ? safeGeoNumber(value.latitude, -90, 90, "Geospatial latitude") : undefined,
            longitude: has("longitude") ? safeGeoNumber(value.longitude, -180, 180, "Geospatial longitude") : undefined,
            coordinateFormat: has("coordinateFormat") ? nullableText(value.coordinateFormat, 24, "Coordinate format") : undefined,
            displayName: has("displayName") ? nullableText(value.displayName, 240, "Geospatial display name") : undefined,
            locality: has("locality") ? nullableText(value.locality, 180, "Geospatial locality") : undefined,
            region: has("region") ? nullableText(value.region, 180, "Geospatial region") : undefined,
            country: has("country") ? nullableText(value.country, 180, "Geospatial country") : undefined,
            countryCode: has("countryCode") ? nullableText(value.countryCode, 12, "Geospatial country code") : undefined,
            elevationM: !has("elevationM") ? undefined : value.elevationM === null || value.elevationM === undefined ? null : safeGeoNumber(value.elevationM, -12000, 12000, "Geospatial elevation"),
            verificationStatus: has("verificationStatus") ? nullableText(value.verificationStatus, 40, "Geospatial verification status") : undefined,
            verificationConfidence: has("verificationConfidence") ? nullableText(value.verificationConfidence, 40, "Geospatial verification confidence") : undefined,
            provenance: has("provenance") ? nullableText(value.provenance, 40, "Geospatial provenance") : undefined,
            observations: has("observations") ? observations.map(item => {
                assertAllowedKeys(item, ["providerId", "providerName", "latitude", "longitude", "observedAt"], "Geospatial provider observation");
                return {providerId: nullableText(item.providerId, 80, "Geospatial provider identifier"), providerName: nullableText(item.providerName, 120, "Geospatial provider name"), latitude: safeGeoNumber(item.latitude, -90, 90, "Observation latitude"), longitude: safeGeoNumber(item.longitude, -180, 180, "Observation longitude"), observedAt: item.observedAt ? assertTimestamp(item.observedAt, "Observation timestamp") : null};
            }) : undefined
        };
        Object.keys(output).forEach(key => output[key] === undefined && delete output[key]);
        return output;
    }

    function sanitizeMediaEvidenceData(value) {
        assertAllowedKeys(value, ["displayLabel", "mediaType", "byteSize", "width", "height", "aspectRatio", "orientation", "colorProfile", "hasAlpha", "captureTimestamp", "normalizedTimestamp", "timezoneStatus", "cameraMake", "cameraModel", "lens", "focalLengthMm", "exposureSeconds", "aperture", "iso", "flash", "geo", "softwareTag", "originalMediaHash", "metadataStatus", "analystObservation"], "Visual media normalized data");
        const number = (field, low, high) => value[field] === null || value[field] === undefined ? null : safeGeoNumber(Number(value[field]), low, high, `Media ${field}`);
        const geo = value.geo === null || value.geo === undefined ? null : (() => {
            assertAllowedKeys(value.geo, ["latitude", "longitude", "altitudeM", "directionDegrees", "source"], "Media geospatial metadata");
            return {
                latitude: safeGeoNumber(value.geo.latitude, -90, 90, "Media latitude"), longitude: safeGeoNumber(value.geo.longitude, -180, 180, "Media longitude"),
                altitudeM: value.geo.altitudeM === null || value.geo.altitudeM === undefined ? null : safeGeoNumber(value.geo.altitudeM, -12000, 12000, "Media altitude"),
                directionDegrees: value.geo.directionDegrees === null || value.geo.directionDegrees === undefined ? null : safeGeoNumber(value.geo.directionDegrees, 0, 360, "Media direction"), source: plainText(value.geo.source || "IMAGE_METADATA", 40, "Media geo source")
            };
        })();
        const byteSize = Number(value.byteSize);
        const width = Number(value.width); const height = Number(value.height); const aspectRatio = Number(value.aspectRatio);
        if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > 20971520) throw new CaseError("CASE_INVALID", "Media byte size is invalid.");
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 100000000) throw new CaseError("CASE_INVALID", "Media dimensions are invalid.");
        if (!Number.isFinite(aspectRatio) || aspectRatio <= 0 || aspectRatio > 100) throw new CaseError("CASE_INVALID", "Media aspect ratio is invalid.");
        const hash = plainText(value.originalMediaHash, 64, "Original media hash");
        if (!/^[a-f0-9]{64}$/i.test(hash)) throw new CaseError("CASE_INVALID", "Original media hash must be SHA-256.");
        return {
            displayLabel: nullableText(value.displayLabel, 160, "Media display label"), mediaType: plainText(value.mediaType, 80, "Media type"), byteSize, width, height, aspectRatio: Number(aspectRatio.toFixed(5)),
            orientation: value.orientation === null || value.orientation === undefined ? null : nullableText(String(value.orientation), 40, "Media orientation"), colorProfile: nullableText(value.colorProfile, 80, "Media color profile"), hasAlpha: value.hasAlpha === true,
            captureTimestamp: nullableText(value.captureTimestamp, 80, "Media capture timestamp"), normalizedTimestamp: nullableText(value.normalizedTimestamp, 80, "Media normalized timestamp"), timezoneStatus: plainText(value.timezoneStatus || "ABSENT", 40, "Media timezone status"),
            cameraMake: nullableText(value.cameraMake, 160, "Media camera make"), cameraModel: nullableText(value.cameraModel, 160, "Media camera model"), lens: nullableText(value.lens, 160, "Media lens"),
            focalLengthMm: number("focalLengthMm", 0, 100000), exposureSeconds: number("exposureSeconds", 0, 100000), aperture: number("aperture", 0, 1000), iso: number("iso", 0, 10000000), flash: number("flash", 0, 65535),
            geo, softwareTag: nullableText(value.softwareTag, 240, "Media software tag"), originalMediaHash: hash.toLowerCase(), metadataStatus: plainText(value.metadataStatus, 40, "Media metadata status"), analystObservation: nullableText(value.analystObservation, 4000, "Media analyst observation")
        };
    }

    function sanitizeInfrastructureEvidenceData(value) {
        assertAllowedKeys(value, ["normalizedTarget", "targetType", "inputSource", "verificationStatus", "confidence", "registration", "dns", "network", "certificate", "provenance"], "Infrastructure normalized data");
        const target = plainText(value.normalizedTarget, 253, "Infrastructure target").toLowerCase();
        const targetType = assertEnum(value.targetType, ["DOMAIN", "IPv4", "IPv6"], "Infrastructure target type");
        const sanitizeAvailabilityContext = (input, label) => {
            if (input === null || input === undefined) return null;
            assertAllowedKeys(input, ["available", "observation"], label);
            return {available: input.available === true, observation: nullableText(input.observation, 320, `${label} observation`)};
        };
        const registration = sanitizeAvailabilityContext(value.registration, "Registration context");
        const certificate = sanitizeAvailabilityContext(value.certificate, "Certificate context");
        const dns = value.dns === null || value.dns === undefined ? null : (() => {
            assertAllowedKeys(value.dns, ["records", "warnings"], "DNS context");
            const records = Array.isArray(value.dns.records) ? value.dns.records : [];
            if (records.length > 36) throw new CaseError("PAYLOAD_TOO_LARGE", "Too many DNS records.");
            return {records: records.map(record => {
                assertAllowedKeys(record, ["type", "values", "status"], "DNS record");
                const values = Array.isArray(record.values) ? record.values : [];
                if (values.length > 12) throw new CaseError("PAYLOAD_TOO_LARGE", "Too many values in a DNS record.");
                return {type: assertEnum(record.type, ["A", "AAAA", "MX", "NS", "TXT", "CNAME"], "DNS record type"), values: values.map(item => plainText(String(item), 1024, "DNS value")), status: plainText(record.status || "UNKNOWN", 32, "DNS status")};
            }), warnings: Array.isArray(value.dns.warnings) ? value.dns.warnings.map(item => plainText(String(item), 240, "DNS warning")).slice(0, 12) : []};
        })();
        const network = value.network === null || value.network === undefined ? null : (() => {
            assertAllowedKeys(value.network, ["ip", "asns", "prefix", "rir", "country", "allocationContext"], "Network context");
            const asns = Array.isArray(value.network.asns) ? value.network.asns : [];
            if (asns.length > 12) throw new CaseError("PAYLOAD_TOO_LARGE", "Too many ASN values.");
            return {ip: nullableText(value.network.ip, 80, "Network IP"), asns: asns.map(item => plainText(String(item), 32, "ASN")), prefix: nullableText(value.network.prefix, 80, "Network prefix"), rir: nullableText(value.network.rir, 80, "Network RIR"), country: nullableText(value.network.country, 80, "Network country"), allocationContext: nullableText(value.network.allocationContext, 320, "Network allocation context")};
        })();
        const provenance = Array.isArray(value.provenance) ? value.provenance : [];
        if (provenance.length > 8) throw new CaseError("PAYLOAD_TOO_LARGE", "Too many provider observations.");
        return {normalizedTarget: target, targetType, inputSource: plainText(value.inputSource || "MANUAL_INPUT", 40, "Infrastructure input source"), verificationStatus: plainText(value.verificationStatus || "UNVERIFIED", 40, "Infrastructure verification status"), confidence: plainText(value.confidence || "LOW", 40, "Infrastructure confidence"), registration, dns, network, certificate, provenance: provenance.map(item => {
            assertAllowedKeys(item, ["providerId", "providerName", "type", "observedAt", "status", "summary"], "Infrastructure provider observation");
            return {providerId: nullableText(item.providerId, 80, "Provider identifier"), providerName: nullableText(item.providerName, 160, "Provider name"), type: nullableText(item.type, 80, "Provider type"), observedAt: item.observedAt ? assertTimestamp(item.observedAt, "Provider observation timestamp") : null, status: nullableText(item.status, 40, "Provider status"), summary: nullableText(item.summary, 360, "Provider summary")};
        })};
    }

    function applyRedactions(draft, fields, clock) {
        const target = canonicalize(draft);
        const redactions = [];
        (Array.isArray(fields) ? fields : []).forEach(field => {
            if (!REDACTABLE_FIELDS.includes(field)) throw new CaseError("CASE_INVALID", "Redaction field is not allowed.");
            const path = field.split(".");
            const [top, nested, deeplyNested] = path;
            if (nested) {
                if (!target[top] || typeof target[top] !== "object" || !Object.prototype.hasOwnProperty.call(target[top], nested)) return;
                if (deeplyNested) {
                    if (!target[top][nested] || typeof target[top][nested] !== "object" || !Object.prototype.hasOwnProperty.call(target[top][nested], deeplyNested)) return;
                    if (target[top][nested][deeplyNested] === null || target[top][nested][deeplyNested] === undefined) return;
                    delete target[top][nested][deeplyNested];
                } else {
                    if (target[top][nested] === null || target[top][nested] === undefined) return;
                    delete target[top][nested];
                }
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
            acquisitionMethod: result.capability === "VISUAL_MEDIA_VERIFICATION" ? "LOCAL_MEDIA_INSPECTION" : "NATIVE_PROVIDER_QUERY",
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
        const evidenceDataKeys = ["available", "originalInput", "canonicalUrl", "snapshotUrl", "snapshotTimestamp", "provider", "queriedAt", "completedAt", "confidence", "warnings", "geo", "media", "infrastructure", "analystObservation", "status", "runtimeStatus"];
        assertAllowedKeys(value.source && typeof value.source === "object" ? value.source : {}, ["provider", "type"], "Evidence source");
        assertAllowedKeys(value.data && typeof value.data === "object" ? value.data : {}, evidenceDataKeys, "Evidence data");
        const normalizedData = value.data && typeof value.data === "object" ? canonicalize(value.data) : {};
        if (normalizedData.geo) normalizedData.geo = sanitizeGeoEvidenceData(normalizedData.geo, {requireCoordinates: false});
        if (normalizedData.media) normalizedData.media = sanitizeMediaEvidenceData(normalizedData.media);
        if (normalizedData.infrastructure) normalizedData.infrastructure = sanitizeInfrastructureEvidenceData(normalizedData.infrastructure);
        const evidence = {...value,
            id: safeId(value.id, "evidence"), caseId: safeId(value.caseId, "case"), type: assertEnum(value.type, EVIDENCE_TYPES, "Evidence type"),
            title: plainText(value.title, LIMITS.title, "Evidence title"), summary: plainText(value.summary, LIMITS.description, "Evidence summary"),
            providerId: value.providerId === null ? null : plainText(value.providerId, 80, "Provider identifier"), providerName: value.providerName === null ? null : plainText(value.providerName, 160, "Provider name"), capability: value.capability === null ? null : plainText(value.capability, 80, "Capability"),
            source: value.source && typeof value.source === "object" ? canonicalize(value.source) : {},
            acquisitionMethod: assertEnum(value.acquisitionMethod, ACQUISITION_METHODS, "Acquisition method"),
            queriedAt: value.queriedAt ? assertTimestamp(value.queriedAt, "Query timestamp") : null, capturedAt: assertTimestamp(value.capturedAt, "Capture timestamp"), createdAt: assertTimestamp(value.createdAt, "Evidence created timestamp"),
            confidence: plainText(value.confidence, 80, "Confidence"), warnings: Array.isArray(value.warnings) ? value.warnings.map(item => plainText(String(item), 240, "Warning")) : [],
            data: normalizedData, notes: Array.isArray(value.notes) ? value.notes.map(id => safeId(id, "note")) : [], tags: normalizeTags(value.tags),
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

    return Object.freeze({CASE_SCHEMA_VERSION, CASE_STATUSES, CASE_PRIORITIES, EVIDENCE_TYPES, ACQUISITION_METHODS, INTEGRITY_STATES, TIMELINE_EVENTS, ERROR_CODES, LIMITS, REDACTABLE_FIELDS, CaseError, now, bytesOf, rejectUnsafeObject, assertAllowedKeys, plainText, nullableText, safeId, generateId, normalizeTags, assertEnum, assertTimestamp, safeUrl, canonicalize, canonicalStringify, sha256, integrityPayload, createIntegrity, validateIntegrity, validateCaseRecord, createCase, updateCase, sanitizeNormalizedResult, sanitizeMediaEvidenceData, sanitizeInfrastructureEvidenceData, applyRedactions, createProviderEvidence, createManualEvidence, validateEvidenceRecord, createTimelineEvent, createNote, updateNote});
});
