(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTVisualMediaVerification = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const CAPABILITY = "VISUAL_MEDIA_VERIFICATION";
    const SUPPORTED_FORMATS = Object.freeze(["JPEG", "PNG", "WEBP"]);
    const STATUSES = Object.freeze(["UNVERIFIED", "METADATA_AVAILABLE", "PARTIALLY_VERIFIED", "CONSISTENT", "INCONSISTENT", "NO_METADATA", "UNSUPPORTED", "INVALID_INPUT", "ERROR", "CANCELLED"]);
    const CONFIDENCE_LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
    const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
    const MAX_PIXELS = 100000000;
    const SAFE_LABEL_MAX = 160;
    const TYPE_SIZES = Object.freeze({1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8});

    class MediaVerificationError extends Error {
        constructor(code, message) { super(message); this.name = "MediaVerificationError"; this.code = code; }
    }

    function cleanText(value, maximum = SAFE_LABEL_MAX) {
        if (value === null || value === undefined) return null;
        const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
        return text || null;
    }

    function safeLabel(value) {
        const label = cleanText(value, SAFE_LABEL_MAX);
        if (!label || /[\\/]/.test(label)) return "supplied-media";
        return label.replace(/[^a-z0-9._() -]/gi, "_").slice(0, SAFE_LABEL_MAX);
    }

    function bytes(value) {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        throw new MediaVerificationError("INVALID_INPUT", "Media bytes are required for inspection.");
    }

    function assertBounds(offset, length, total) {
        return Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && length >= 0 && offset + length <= total;
    }

    function detectFormat(input) {
        const source = bytes(input);
        if (source.length >= 3 && source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff) return "JPEG";
        if (source.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => source[index] === byte)) return "PNG";
        if (source.length >= 12 && String.fromCharCode(...source.slice(0, 4)) === "RIFF" && String.fromCharCode(...source.slice(8, 12)) === "WEBP") return "WEBP";
        return null;
    }

    function ascii(source, offset, length) {
        if (!assertBounds(offset, length, source.length)) return null;
        return String.fromCharCode(...source.slice(offset, offset + length));
    }

    function readUint24(view, offset, little) {
        if (offset + 3 > view.byteLength) throw new MediaVerificationError("INVALID_INPUT", "Image metadata is truncated.");
        return little ? view.getUint8(offset) | view.getUint8(offset + 1) << 8 | view.getUint8(offset + 2) << 16 : view.getUint8(offset) << 16 | view.getUint8(offset + 1) << 8 | view.getUint8(offset + 2);
    }

    function tiffValue(view, base, type, count, rawOffset, little) {
        const size = TYPE_SIZES[type];
        if (!size || !Number.isInteger(count) || count < 1 || count > 128) return null;
        const length = size * count;
        const offset = length <= 4 ? rawOffset : base + view.getUint32(rawOffset, little);
        if (!assertBounds(offset, length, view.byteLength)) return null;
        const values = [];
        for (let index = 0; index < count; index += 1) {
            const position = offset + index * size;
            if (type === 1 || type === 7) values.push(view.getUint8(position));
            else if (type === 2) values.push(view.getUint8(position));
            else if (type === 3) values.push(view.getUint16(position, little));
            else if (type === 4) values.push(view.getUint32(position, little));
            else if (type === 9) values.push(view.getInt32(position, little));
            else if (type === 5 || type === 10) {
                const numerator = type === 5 ? view.getUint32(position, little) : view.getInt32(position, little);
                const denominator = type === 5 ? view.getUint32(position + 4, little) : view.getInt32(position + 4, little);
                values.push(denominator ? numerator / denominator : null);
            }
        }
        if (type === 2) return String.fromCharCode(...values).replace(/\0.*$/, "");
        return count === 1 ? values[0] : values;
    }

    function parseIfd(view, base, offset, little) {
        if (!assertBounds(base + offset, 2, view.byteLength)) return {};
        const start = base + offset;
        const count = view.getUint16(start, little);
        if (count > 128 || !assertBounds(start + 2, count * 12 + 4, view.byteLength)) return {};
        const entries = {};
        for (let index = 0; index < count; index += 1) {
            const position = start + 2 + index * 12;
            const tag = view.getUint16(position, little);
            const type = view.getUint16(position + 2, little);
            const valueCount = view.getUint32(position + 4, little);
            const value = tiffValue(view, base, type, valueCount, position + 8, little);
            if (value !== null) entries[tag] = value;
        }
        return entries;
    }

    function numeric(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
    function rational(value) { return Array.isArray(value) ? value : [value]; }
    function gpsDecimal(values, reference) {
        const parts = rational(values);
        if (parts.length < 2 || parts.some(part => !Number.isFinite(part))) return null;
        const decimal = Number(parts[0]) + Number(parts[1] || 0) / 60 + Number(parts[2] || 0) / 3600;
        const ref = String(reference || "").toUpperCase();
        return ["S", "W"].includes(ref) ? -decimal : decimal;
    }

    function normalizeCaptureTimestamp(value) {
        const text = cleanText(value, 64);
        if (!text) return {original: null, normalized: null, timezoneStatus: "ABSENT"};
        const match = text.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return {original: text, normalized: null, timezoneStatus: "UNKNOWN"};
        return {original: text, normalized: `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`, timezoneStatus: "UNKNOWN"};
    }

    function parseTiff(input) {
        const source = bytes(input);
        if (source.length < 8) return {};
        const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
        const order = ascii(source, 0, 2);
        if (order !== "II" && order !== "MM") return {};
        const little = order === "II";
        if (view.getUint16(2, little) !== 42) return {};
        const ifd0 = parseIfd(view, 0, view.getUint32(4, little), little);
        const exif = numeric(ifd0[34665]) !== null ? parseIfd(view, 0, ifd0[34665], little) : {};
        const gps = numeric(ifd0[34853]) !== null ? parseIfd(view, 0, ifd0[34853], little) : {};
        const latitude = gpsDecimal(gps[2], gps[1]);
        const longitude = gpsDecimal(gps[4], gps[3]);
        const altitude = numeric(gps[6]);
        const direction = numeric(gps[17]);
        const capture = normalizeCaptureTimestamp(exif[36867] || ifd0[306]);
        return {
            orientation: numeric(ifd0[274]), colorProfile: null,
            exif: {
                captureTimestamp: capture.original, normalizedTimestamp: capture.normalized, timezoneStatus: capture.timezoneStatus,
                cameraMake: cleanText(ifd0[271]), cameraModel: cleanText(ifd0[272]), lens: cleanText(exif[42036]),
                focalLengthMm: numeric(exif[37386]), exposureSeconds: numeric(exif[33434]), aperture: numeric(exif[33437]), iso: numeric(exif[34855]), flash: numeric(exif[37385])
            },
            geo: latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
                ? {latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)), altitudeM: altitude, directionDegrees: direction, source: "IMAGE_METADATA"}
                : null,
            software: cleanText(ifd0[305])
        };
    }

    function parseJpeg(input) {
        const source = bytes(input); let cursor = 2; let width = null; let height = null; let metadata = {};
        while (cursor + 4 <= source.length) {
            if (source[cursor] !== 0xff) { cursor += 1; continue; }
            while (source[cursor] === 0xff) cursor += 1;
            const marker = source[cursor++];
            if (marker === 0xd9 || marker === 0xda) break;
            if (cursor + 2 > source.length) break;
            const length = source[cursor] << 8 | source[cursor + 1];
            if (length < 2 || !assertBounds(cursor + 2, length - 2, source.length)) break;
            const payload = cursor + 2;
            if (marker === 0xe1 && ascii(source, payload, 6) === "Exif\0\0") metadata = parseTiff(source.slice(payload + 6, cursor + length));
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
                height = source[payload + 1] << 8 | source[payload + 2]; width = source[payload + 3] << 8 | source[payload + 4];
            }
            cursor += length;
        }
        return {width, height, hasAlpha: false, colorProfile: null, ...metadata};
    }

    function parsePng(input) {
        const source = bytes(input); let cursor = 8; let width = null; let height = null; let hasAlpha = false; let metadata = {};
        while (cursor + 12 <= source.length) {
            const length = new DataView(source.buffer, source.byteOffset + cursor, 4).getUint32(0, false);
            const type = ascii(source, cursor + 4, 4);
            if (!assertBounds(cursor + 8, length + 4, source.length)) break;
            const payload = cursor + 8;
            if (type === "IHDR" && length >= 13) { const view = new DataView(source.buffer, source.byteOffset + payload, length); width = view.getUint32(0, false); height = view.getUint32(4, false); hasAlpha = [4, 6].includes(view.getUint8(9)); }
            if (type === "eXIf") metadata = parseTiff(source.slice(payload, payload + length));
            if (type === "iCCP") metadata.colorProfile = "EMBEDDED_ICC_PROFILE";
            cursor += length + 12;
        }
        return {width, height, hasAlpha, colorProfile: metadata.colorProfile || null, ...metadata};
    }

    function parseWebp(input) {
        const source = bytes(input); let cursor = 12; let width = null; let height = null; let hasAlpha = false; let metadata = {};
        while (cursor + 8 <= source.length) {
            const type = ascii(source, cursor, 4); const length = new DataView(source.buffer, source.byteOffset + cursor + 4, 4).getUint32(0, true); const payload = cursor + 8;
            if (!assertBounds(payload, length, source.length)) break;
            if (type === "VP8X" && length >= 10) { hasAlpha = Boolean(source[payload] & 0x10); const view = new DataView(source.buffer, source.byteOffset + payload, length); width = readUint24(view, 4, true) + 1; height = readUint24(view, 7, true) + 1; }
            if (type === "ALPH") hasAlpha = true;
            if (type === "EXIF") metadata = parseTiff(source.slice(payload, payload + length));
            cursor = payload + length + (length % 2);
        }
        return {width, height, hasAlpha, colorProfile: null, ...metadata};
    }

    async function sha256(input) {
        const source = bytes(input);
        if (typeof crypto !== "undefined" && crypto.subtle) {
            const digest = await crypto.subtle.digest("SHA-256", source);
            return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
        }
        if (typeof require === "function") return require("crypto").createHash("sha256").update(Buffer.from(source)).digest("hex");
        throw new MediaVerificationError("ERROR", "Local SHA-256 support is unavailable.");
    }

    function metadataPresent(parsed) {
        const exif = parsed.exif || {};
        return Boolean(parsed.geo || parsed.software || parsed.orientation || exif.captureTimestamp || exif.cameraMake || exif.cameraModel || exif.lens || [exif.focalLengthMm, exif.exposureSeconds, exif.aperture, exif.iso, exif.flash].some(value => Number.isFinite(value)));
    }

    async function inspectMedia(input = {}) {
        const source = bytes(input.bytes);
        if (!source.length || source.length > MAX_MEDIA_BYTES) throw new MediaVerificationError("INVALID_INPUT", `Media must be between 1 byte and ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
        const format = detectFormat(source);
        if (!format) throw new MediaVerificationError("UNSUPPORTED", "Only JPEG, PNG and WebP media are supported in this phase.");
        let parsed;
        try { parsed = format === "JPEG" ? parseJpeg(source) : format === "PNG" ? parsePng(source) : parseWebp(source); }
        catch (error) { throw error instanceof MediaVerificationError ? error : new MediaVerificationError("INVALID_INPUT", "The supplied image is malformed or unreadable."); }
        const width = Number(parsed.width); const height = Number(parsed.height);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new MediaVerificationError("INVALID_INPUT", "Image dimensions are missing, invalid or exceed the safe inspection limit.");
        const hasMetadata = metadataPresent(parsed);
        const originalMediaHash = await sha256(source);
        const exif = parsed.exif || {};
        return Object.freeze({
            capability: CAPABILITY, status: hasMetadata ? "METADATA_AVAILABLE" : "NO_METADATA", confidence: "LOW",
            file: Object.freeze({displayLabel: safeLabel(input.name), mediaType: format === "JPEG" ? "image/jpeg" : format === "PNG" ? "image/png" : "image/webp", byteSize: source.length}),
            image: Object.freeze({width, height, aspectRatio: Number((width / height).toFixed(5)), orientation: parsed.orientation || null, colorProfile: parsed.colorProfile || "UNKNOWN", hasAlpha: Boolean(parsed.hasAlpha)}),
            exif: Object.freeze({captureTimestamp: exif.captureTimestamp || null, normalizedTimestamp: exif.normalizedTimestamp || null, timezoneStatus: exif.timezoneStatus || "ABSENT", cameraMake: exif.cameraMake || null, cameraModel: exif.cameraModel || null, lens: exif.lens || null, focalLengthMm: numeric(exif.focalLengthMm), exposureSeconds: numeric(exif.exposureSeconds), aperture: numeric(exif.aperture), iso: numeric(exif.iso), flash: numeric(exif.flash)}),
            geo: parsed.geo ? Object.freeze(parsed.geo) : null,
            software: Object.freeze({tag: parsed.software || null}),
            integrity: Object.freeze({originalMediaHash, algorithm: "SHA-256", scope: "ORIGINAL_SUPPLIED_BYTES"}),
            observations: Object.freeze([
                hasMetadata ? "Metadata fields are present and are reported as file-supplied context only." : "No supported EXIF or software metadata is present in this supplied image.",
                "Metadata availability does not establish authenticity, authorship, capture time or location."
            ]),
            warnings: Object.freeze([
                parsed.software ? "Editing software metadata is present; this is a neutral metadata observation, not proof of manipulation." : "No software tag is not proof that the image is original.",
                parsed.geo ? "GPS metadata is present; it is not independently verified until the analyst explicitly opens Geospatial Verification." : "No GPS metadata is available from this supplied file."
            ])
        });
    }

    function toEvidenceData(result, analystObservation = null) {
        if (!result || result.capability !== CAPABILITY || !result.integrity || !result.integrity.originalMediaHash) throw new MediaVerificationError("INVALID_INPUT", "A normalized visual media result is required.");
        return Object.freeze({available: true, originalInput: null, canonicalUrl: null, snapshotUrl: null, snapshotTimestamp: null, provider: "Local media inspection", queriedAt: new Date().toISOString(), completedAt: new Date().toISOString(), confidence: result.confidence, warnings: result.warnings.slice(), media: {
            displayLabel: result.file.displayLabel, mediaType: result.file.mediaType, byteSize: result.file.byteSize, width: result.image.width, height: result.image.height, aspectRatio: result.image.aspectRatio, orientation: result.image.orientation, colorProfile: result.image.colorProfile, hasAlpha: result.image.hasAlpha,
            captureTimestamp: result.exif.captureTimestamp, normalizedTimestamp: result.exif.normalizedTimestamp, timezoneStatus: result.exif.timezoneStatus, cameraMake: result.exif.cameraMake, cameraModel: result.exif.cameraModel, lens: result.exif.lens, focalLengthMm: result.exif.focalLengthMm, exposureSeconds: result.exif.exposureSeconds, aperture: result.exif.aperture, iso: result.exif.iso, flash: result.exif.flash,
            geo: result.geo ? {...result.geo} : null, softwareTag: result.software.tag, originalMediaHash: result.integrity.originalMediaHash, metadataStatus: result.status, analystObservation: cleanText(analystObservation, 4000)
        }});
    }

    return Object.freeze({CAPABILITY, SUPPORTED_FORMATS, STATUSES, CONFIDENCE_LEVELS, MAX_MEDIA_BYTES, MAX_PIXELS, MediaVerificationError, detectFormat, parseTiff, parseJpeg, parsePng, parseWebp, sha256, inspectMedia, toEvidenceData, safeLabel});
});
