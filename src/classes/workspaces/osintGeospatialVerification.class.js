(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTGeospatialVerification = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const INPUT_KINDS = Object.freeze(["COORDINATES", "PLACE_TEXT"]);
    const COORDINATE_FORMATS = Object.freeze(["DECIMAL", "DMS"]);
    const VERIFICATION_STATUSES = Object.freeze(["UNVERIFIED", "PARTIALLY_VERIFIED", "CONSISTENT", "INCONSISTENT", "INCONCLUSIVE"]);
    const CONFIDENCE_LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
    const MAX_PLACE_LENGTH = 240;
    const COORDINATE_TOLERANCE_DEGREES = 0.02;

    class GeoInputError extends Error {
        constructor(message) { super(message); this.name = "GeoInputError"; this.code = "INVALID_INPUT"; }
    }

    function safeText(value, maximum = MAX_PLACE_LENGTH) {
        const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
        if (!text || text.length > maximum || /<\/?script\b|javascript:|data:|https?:\/\//i.test(text)) {
            throw new GeoInputError("Enter coordinates or a short public place name only.");
        }
        return text;
    }

    function assertRange(latitude, longitude) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new GeoInputError("Latitude must be between -90 and 90; longitude must be between -180 and 180.");
        }
        return {latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7))};
    }

    function coordinate(value, hemisphere, maximum, label) {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new GeoInputError(`Invalid ${label} coordinate.`);
        const direction = String(hemisphere || "").toUpperCase();
        if (direction && !["N", "S", "E", "W"].includes(direction)) throw new GeoInputError(`Invalid ${label} hemisphere.`);
        if ((label === "latitude" && ["E", "W"].includes(direction)) || (label === "longitude" && ["N", "S"].includes(direction))) {
            throw new GeoInputError(`Invalid ${label} hemisphere.`);
        }
        const signed = ["S", "W"].includes(direction) ? -Math.abs(number) : number;
        if (Math.abs(signed) > maximum) throw new GeoInputError(`${label[0].toUpperCase() + label.slice(1)} is outside its valid range.`);
        return signed;
    }

    function parseDecimal(input) {
        const value = String(input || "").trim();
        const labelled = value.match(/^\s*(?:lat(?:itude)?\s*[=:]\s*)?([+-]?\d{1,2}(?:\.\d+)?)\s*([NS])?\s*[,;\s]+\s*(?:lon(?:gitude)?\s*[=:]\s*)?([+-]?\d{1,3}(?:\.\d+)?)\s*([EW])?\s*$/i);
        if (!labelled) return null;
        const latitude = coordinate(labelled[1], labelled[2], 90, "latitude");
        const longitude = coordinate(labelled[3], labelled[4], 180, "longitude");
        return {...assertRange(latitude, longitude), kind: "COORDINATES", coordinateFormat: "DECIMAL", originalInput: value};
    }

    function parseDmsPart(part, axis) {
        const pattern = /^\s*(\d{1,3})\s*(?:°|º|d)\s*(\d{1,2})\s*(?:'|′|m)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:"|″|s)?\s*([NSEW])\s*$/i;
        const match = String(part || "").match(pattern);
        if (!match) return null;
        const degrees = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3] || 0);
        const hemisphere = match[4].toUpperCase();
        const isLatitude = axis === "latitude";
        if (minutes >= 60 || seconds >= 60 || (isLatitude && !["N", "S"].includes(hemisphere)) || (!isLatitude && !["E", "W"].includes(hemisphere))) return null;
        const decimal = degrees + minutes / 60 + seconds / 3600;
        return coordinate(decimal, hemisphere, isLatitude ? 90 : 180, axis);
    }

    function parseDms(input) {
        const value = String(input || "").trim();
        const chunks = value.split(/\s*[,;]\s*/);
        if (chunks.length !== 2) return null;
        const latitude = parseDmsPart(chunks[0], "latitude");
        const longitude = parseDmsPart(chunks[1], "longitude");
        if (latitude === null || longitude === null) return null;
        return {...assertRange(latitude, longitude), kind: "COORDINATES", coordinateFormat: "DMS", originalInput: value};
    }

    function parseInput(input) {
        if (input && typeof input === "object" && !Array.isArray(input)) {
            if (Object.prototype.hasOwnProperty.call(input, "latitude") && Object.prototype.hasOwnProperty.call(input, "longitude")) {
                return {...assertRange(Number(input.latitude), Number(input.longitude)), kind: "COORDINATES", coordinateFormat: "DECIMAL", originalInput: null};
            }
            throw new GeoInputError("Enter coordinates or a short public place name only.");
        }
        const raw = String(input || "").trim();
        if (!raw) throw new GeoInputError("Enter coordinates or a short public place name.");
        const parsedCoordinate = parseDms(raw) || parseDecimal(raw);
        if (parsedCoordinate) return parsedCoordinate;
        // Reject decimal-comma / coordinate-like strings instead of silently
        // treating an ambiguous coordinate as a place name.
        if (/^[+\-\d\s,.;°º'"′″NSEWlatitudeng]+$/i.test(raw) && /\d/.test(raw)) {
            throw new GeoInputError("Coordinate format is ambiguous. Use decimal points with a latitude, longitude pair or explicit DMS hemispheres.");
        }
        return {kind: "PLACE_TEXT", query: safeText(raw), coordinateFormat: null, originalInput: raw};
    }

    function numberOrNull(value, low, high) {
        const number = Number(value);
        return Number.isFinite(number) && number >= low && number <= high ? Number(number.toFixed(7)) : null;
    }

    function cleanField(value, maximum = 180) {
        if (value === null || value === undefined || value === "") return null;
        const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
        return text || null;
    }

    function normalizeProviderObservation(input = {}) {
        const latitude = numberOrNull(input.latitude, -90, 90);
        const longitude = numberOrNull(input.longitude, -180, 180);
        if (latitude === null || longitude === null) throw new GeoInputError("Provider observation does not contain valid coordinates.");
        return Object.freeze({
            providerId: cleanField(input.providerId, 80),
            providerName: cleanField(input.providerName, 120) || "Public geospatial provider",
            type: cleanField(input.type, 80) || "PUBLIC_GEOCODING_API",
            latitude,
            longitude,
            displayName: cleanField(input.displayName, 240),
            locality: cleanField(input.locality),
            region: cleanField(input.region),
            country: cleanField(input.country),
            countryCode: cleanField(input.countryCode, 12),
            elevationM: numberOrNull(input.elevationM, -12000, 12000),
            observedAt: cleanField(input.observedAt, 64) || new Date().toISOString(),
            confidence: cleanField(input.confidence, 40) || "PROVIDER_REPORTED",
            warning: cleanField(input.warning, 240)
        });
    }

    function distanceDegrees(left, right) {
        return Math.max(Math.abs(left.latitude - right.latitude), Math.abs(left.longitude - right.longitude));
    }

    function assessVerification(input = {}) {
        const normalized = input.normalizedLocation || null;
        const observations = Array.isArray(input.providerObservations) ? input.providerObservations : [];
        const investigatorObservations = Array.isArray(input.investigatorObservations) ? input.investigatorObservations : [];
        const reasons = [];
        const contradictory = investigatorObservations.some(item => item && item.assessment === "CONTRADICTS");
        const supporting = investigatorObservations.filter(item => item && item.assessment === "SUPPORTS").length;
        let status = "UNVERIFIED";
        let confidence = "LOW";
        if (contradictory) {
            status = "INCONSISTENT";
            confidence = "LOW";
            reasons.push("An explicit investigator observation records a contradiction; this does not determine the underlying ground truth.");
        } else if (!normalized || !observations.length) {
            status = normalized ? "UNVERIFIED" : "INCONCLUSIVE";
            confidence = "LOW";
            reasons.push(normalized ? "Coordinates were normalized locally but no provider observation supports them yet." : "No provider returned a normalized geographic location.");
        } else {
            const agreeing = observations.filter(item => distanceDegrees(normalized, item) <= COORDINATE_TOLERANCE_DEGREES);
            const disagreeing = observations.filter(item => distanceDegrees(normalized, item) > COORDINATE_TOLERANCE_DEGREES);
            if (disagreeing.length) {
                status = "INCONSISTENT";
                confidence = "LOW";
                reasons.push("A provider observation differs materially from the normalized coordinates.");
            } else if (agreeing.length >= 2 && new Set(agreeing.map(item => item.providerId)).size >= 2) {
                status = "CONSISTENT";
                confidence = "HIGH";
                reasons.push("Two independent normalized provider observations agree within the configured coordinate tolerance.");
            } else {
                status = "PARTIALLY_VERIFIED";
                confidence = supporting ? "HIGH" : "MEDIUM";
                reasons.push("One normalized provider observation supports the location; it remains a limited corroboration, not a conclusive determination.");
                if (supporting) reasons.push("A local investigator observation is explicitly marked as supporting context.");
            }
        }
        return Object.freeze({status, confidence, reasons: Object.freeze(reasons), providerObservationCount: observations.length, investigatorObservationCount: investigatorObservations.length});
    }

    function createVerification(input = {}) {
        const parsed = input.parsed || parseInput(input.input);
        const observations = (input.providerObservations || []).map(normalizeProviderObservation);
        const normalizedLocation = input.normalizedLocation || (parsed.kind === "COORDINATES" ? {
            latitude: parsed.latitude, longitude: parsed.longitude, coordinateFormat: parsed.coordinateFormat, displayName: null, locality: null, region: null, country: null, countryCode: null, elevationM: null
        } : observations[0] ? {
            latitude: observations[0].latitude, longitude: observations[0].longitude, coordinateFormat: "DECIMAL", displayName: observations[0].displayName, locality: observations[0].locality, region: observations[0].region, country: observations[0].country, countryCode: observations[0].countryCode, elevationM: observations[0].elevationM
        } : null);
        const location = normalizedLocation ? Object.freeze({
            latitude: numberOrNull(normalizedLocation.latitude, -90, 90), longitude: numberOrNull(normalizedLocation.longitude, -180, 180), coordinateFormat: cleanField(normalizedLocation.coordinateFormat, 24) || "DECIMAL", displayName: cleanField(normalizedLocation.displayName, 240), locality: cleanField(normalizedLocation.locality), region: cleanField(normalizedLocation.region), country: cleanField(normalizedLocation.country), countryCode: cleanField(normalizedLocation.countryCode, 12), elevationM: numberOrNull(normalizedLocation.elevationM, -12000, 12000)
        }) : null;
        if (location && (location.latitude === null || location.longitude === null)) throw new GeoInputError("Normalized location has invalid coordinates.");
        const assessment = assessVerification({normalizedLocation: location, providerObservations: observations, investigatorObservations: input.investigatorObservations || []});
        return Object.freeze({
            id: String(input.id || `geo-${Date.now().toString(36)}`),
            query: Object.freeze({kind: parsed.kind, originalInput: parsed.originalInput || parsed.query || null, coordinateFormat: parsed.coordinateFormat || null}),
            normalizedLocation: location,
            providerObservations: Object.freeze(observations),
            investigatorObservations: Object.freeze((input.investigatorObservations || []).map(item => Object.freeze({assessment: ["SUPPORTS", "CONTRADICTS", "INCONCLUSIVE"].includes(item.assessment) ? item.assessment : "INCONCLUSIVE", note: cleanField(item.note, 1200), recordedAt: cleanField(item.recordedAt, 64) || new Date().toISOString()}))),
            verificationStatus: assessment.status,
            confidence: assessment.confidence,
            reasoning: assessment.reasons,
            createdAt: input.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    function toEvidenceData(verification) {
        if (!verification || !verification.normalizedLocation) throw new GeoInputError("A normalized geospatial result is required before evidence can be created.");
        const location = verification.normalizedLocation;
        return Object.freeze({
            available: verification.providerObservations.length > 0,
            originalInput: verification.query && verification.query.originalInput || null,
            canonicalUrl: null,
            snapshotUrl: null,
            snapshotTimestamp: null,
            provider: verification.providerObservations[0] && verification.providerObservations[0].providerName || "Local coordinate normalization",
            queriedAt: verification.createdAt,
            completedAt: verification.updatedAt,
            confidence: verification.confidence,
            warnings: verification.reasoning.slice(),
            geo: {
                latitude: location.latitude,
                longitude: location.longitude,
                coordinateFormat: location.coordinateFormat,
                displayName: location.displayName,
                locality: location.locality,
                region: location.region,
                country: location.country,
                countryCode: location.countryCode,
                elevationM: location.elevationM,
                verificationStatus: verification.verificationStatus,
                verificationConfidence: verification.confidence,
                observations: verification.providerObservations.slice(0, 8).map(item => ({providerId: item.providerId, providerName: item.providerName, latitude: item.latitude, longitude: item.longitude, observedAt: item.observedAt}))
            }
        });
    }

    return Object.freeze({INPUT_KINDS, COORDINATE_FORMATS, VERIFICATION_STATUSES, CONFIDENCE_LEVELS, MAX_PLACE_LENGTH, COORDINATE_TOLERANCE_DEGREES, GeoInputError, parseInput, parseDecimal, parseDms, normalizeProviderObservation, assessVerification, createVerification, toEvidenceData, distanceDegrees});
});
