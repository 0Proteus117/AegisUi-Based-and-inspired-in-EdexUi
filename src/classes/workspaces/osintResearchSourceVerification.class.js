(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTResearchSourceVerification = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const CAPABILITY = "SOURCE_VERIFICATION";
    const SOURCE_TYPES = Object.freeze(["URL", "DOI", "LOCAL_PDF"]);
    const STATUSES = Object.freeze(["UNVERIFIED", "METADATA_AVAILABLE", "PARTIALLY_VERIFIED", "CONSISTENT", "INCONSISTENT", "ARCHIVE_AVAILABLE", "SOURCE_UNAVAILABLE", "INVALID_INPUT", "CANCELLED", "ERROR"]);
    const CONFIDENCE_LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
    const MAX_INPUT_LENGTH = 2048;
    const MAX_PDF_BYTES = 25 * 1024 * 1024;
    const MAX_EXCERPT = 4000;
    const MAX_NOTE = 4000;

    class ResearchSourceError extends Error {
        constructor(code, message) { super(message); this.name = "ResearchSourceError"; this.code = code; this.userMessage = message; }
    }

    function cleanText(value, maximum = 320) {
        if (value === null || value === undefined) return null;
        const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
        return text || null;
    }

    function safeLabel(value) {
        const label = String(value || "document.pdf").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        return label || "document.pdf";
    }

    function byteArray(input) {
        if (input instanceof Uint8Array) return input;
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        return new Uint8Array();
    }

    function parseIPv4(value) {
        if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
        const parts = value.split(".").map(Number);
        return parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
    }

    function isPublicIPv4(parts) {
        if (!parts) return false;
        const [a, b] = parts;
        if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
        if (a === 100 && b >= 64 && b <= 127) return false;
        if (a === 169 && b === 254) return false;
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 192 && (b === 0 || b === 168)) return false;
        if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
        if (a === 203 && b === 0) return false;
        return true;
    }

    function isPublicHost(hostname) {
        const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
        if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
        const ipv4 = parseIPv4(host);
        if (ipv4) return isPublicIPv4(ipv4);
        if (host.includes(":")) {
            if (host === "::1" || /^fe[89ab]/i.test(host) || /^(?:fc|fd)/i.test(host) || /^2001:0db8/i.test(host)) return false;
            return /^[0-9a-f:]+$/i.test(host);
        }
        if (host.length > 253 || !host.includes(".") || host.endsWith(".")) return false;
        return host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
    }

    function normalizeUrl(value) {
        if (Array.isArray(value) || (value && typeof value === "object")) throw new ResearchSourceError("INVALID_INPUT", "Enter one public HTTP(S) source URL.");
        const originalInput = String(value || "").trim();
        if (!originalInput || originalInput.length > MAX_INPUT_LENGTH || /[\r\n]/.test(originalInput)) throw new ResearchSourceError("INVALID_INPUT", "Enter one public HTTP(S) source URL.");
        let parsed;
        try { parsed = new URL(originalInput); }
        catch (error) { throw new ResearchSourceError("INVALID_INPUT", "Enter a valid public HTTP(S) source URL."); }
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || !isPublicHost(parsed.hostname)) {
            throw new ResearchSourceError("INVALID_INPUT", "Only one public HTTP(S) URL without credentials or a custom port is supported.");
        }
        parsed.hash = "";
        return Object.freeze({sourceType: "URL", originalInput, normalizedUrl: parsed.toString(), hostname: parsed.hostname.toLowerCase(), identifiers: Object.freeze({doi: null}), localFileMetadata: null});
    }

    function normalizeDoi(value) {
        if (Array.isArray(value) || (value && typeof value === "object")) throw new ResearchSourceError("INVALID_INPUT", "Enter one DOI only.");
        const originalInput = String(value || "").trim();
        if (!originalInput || originalInput.length > MAX_INPUT_LENGTH || /\s/.test(originalInput)) throw new ResearchSourceError("INVALID_INPUT", "Enter one DOI only.");
        const normalized = originalInput.replace(/^doi:/i, "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
        if (!/^10\.\d{4,9}\/[!#$%&'()*+,\-._;()/:a-z0-9]+$/i.test(normalized) || normalized.includes("..")) {
            throw new ResearchSourceError("INVALID_INPUT", "Enter a valid DOI identifier.");
        }
        return Object.freeze({sourceType: "DOI", originalInput, normalizedUrl: `https://doi.org/${normalized}`, hostname: "doi.org", identifiers: Object.freeze({doi: normalized}), localFileMetadata: null});
    }

    function latin1(bytes) {
        try { return new TextDecoder("latin1").decode(bytes); }
        catch (error) { return Array.from(bytes).map(value => String.fromCharCode(value)).join(""); }
    }

    function decodePdfString(value) {
        if (!value) return null;
        const text = String(value).replace(/\\([nrtbf()\\])/g, (_, character) => ({n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\"}[character] || character)).replace(/\\\d{1,3}/g, " ");
        return cleanText(text, 320);
    }

    function pdfInfoValue(text, key) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const literal = new RegExp(`/${escaped}\\s*\\((?:\\\\.|[^)]){0,1024}\\)`, "i").exec(text);
        if (literal) return decodePdfString(literal[0].replace(new RegExp(`^/${escaped}\\s*\\(`, "i"), "").slice(0, -1));
        const hex = new RegExp(`/${escaped}\\s*<([0-9a-f]{2,640})>`, "i").exec(text);
        if (!hex) return null;
        const decoded = hex[1].match(/.{1,2}/g).map(pair => String.fromCharCode(parseInt(pair, 16))).join("");
        return cleanText(decoded, 320);
    }

    async function sha256(input) {
        const source = byteArray(input);
        if (globalThis.crypto && globalThis.crypto.subtle) {
            const digest = await globalThis.crypto.subtle.digest("SHA-256", source);
            return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
        }
        throw new ResearchSourceError("ERROR", "SHA-256 support is unavailable in this runtime.");
    }

    async function inspectPdf(input = {}) {
        const source = byteArray(input.bytes);
        if (!source.length || source.length > MAX_PDF_BYTES) throw new ResearchSourceError("INVALID_INPUT", "PDF must be between 1 byte and 25 MB.");
        if (latin1(source.slice(0, 8)).indexOf("%PDF-") !== 0) throw new ResearchSourceError("UNSUPPORTED", "Select one valid PDF document.");
        const tail = latin1(source.slice(Math.max(0, source.length - 4096)));
        if (!tail.includes("%%EOF")) throw new ResearchSourceError("INVALID_INPUT", "The selected PDF is incomplete or malformed.");
        const text = latin1(source);
        const pageCount = (text.match(/\/Type\s*\/Page\b/g) || []).length;
        const hash = await sha256(source);
        const created = pdfInfoValue(text, "CreationDate");
        const modified = pdfInfoValue(text, "ModDate");
        return Object.freeze({
            sourceType: "LOCAL_PDF", originalInput: safeLabel(input.name), normalizedUrl: null, hostname: null,
            localFileMetadata: Object.freeze({displayLabel: safeLabel(input.name), mediaType: "application/pdf", byteSize: source.length, pageCount, title: pdfInfoValue(text, "Title"), author: pdfInfoValue(text, "Author"), subject: pdfInfoValue(text, "Subject"), creator: pdfInfoValue(text, "Creator"), producer: pdfInfoValue(text, "Producer"), creationTimestamp: created, modificationTimestamp: modified, originalDocumentHash: hash}),
            identifiers: Object.freeze({doi: null})
        });
    }

    function normalizeCrossrefMetadata(raw, doi) {
        const item = raw && raw.message;
        if (!item || typeof item !== "object") throw new ResearchSourceError("NORMALIZATION_FAILED", "Crossref returned an unreadable metadata record.");
        const list = value => Array.isArray(value) ? value : [];
        const name = person => cleanText([person && person.given, person && person.family].filter(Boolean).join(" "), 180);
        const authors = list(item.author).map(name).filter(Boolean).slice(0, 12);
        const dateParts = value => Array.isArray(value && value["date-parts"]) && Array.isArray(value["date-parts"][0]) ? value["date-parts"][0] : null;
        const date = value => { const parts = dateParts(value); if (!parts || !parts.length) return null; const [year, month = 1, day = 1] = parts; return Number.isInteger(year) && year > 0 ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null; };
        const title = cleanText(list(item.title)[0], 500);
        const publisher = cleanText(item.publisher, 240);
        const publishedAt = date(item.published_print) || date(item.published_online) || date(item.issued);
        const updatedAt = date(item.created) || date(item.deposited) || null;
        const canonicalUrl = typeof item.URL === "string" && /^https?:\/\//i.test(item.URL) ? item.URL.slice(0, 2048) : `https://doi.org/${doi}`;
        return Object.freeze({doi, title, publisher, authors: Object.freeze(authors), publishedAt, updatedAt, container: cleanText(list(item["container-title"])[0], 240), sourceUrl: canonicalUrl, workType: cleanText(item.type, 80), license: cleanText(list(item.license)[0] && list(item.license)[0].URL, 512), provenance: Object.freeze([{field: "DOI", source: "CROSSREF", kind: "PROVIDER_OBSERVATION"}, {field: "TITLE", source: "CROSSREF", kind: "PROVIDER_OBSERVATION"}, {field: "AUTHORS", source: "CROSSREF", kind: "PROVIDER_OBSERVATION"}, {field: "PUBLICATION", source: "CROSSREF", kind: "PROVIDER_OBSERVATION"}])});
    }

    function createSourceContext(input = {}) {
        const source = input.source || null;
        if (!source || !SOURCE_TYPES.includes(source.sourceType)) throw new ResearchSourceError("INVALID_INPUT", "A normalized source is required.");
        const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
        const archive = input.archive && typeof input.archive === "object" ? input.archive : null;
        const status = STATUSES.includes(input.status) ? input.status : metadata.title || source.localFileMetadata ? "METADATA_AVAILABLE" : archive && archive.available ? "ARCHIVE_AVAILABLE" : "UNVERIFIED";
        const providerObservations = Array.isArray(input.providerObservations) ? input.providerObservations.slice(0, 8).map(item => Object.freeze({providerId: cleanText(item.providerId, 80), providerName: cleanText(item.providerName, 160), type: cleanText(item.type, 80), observedAt: cleanText(item.observedAt, 64), status: cleanText(item.status, 40), summary: cleanText(item.summary, 360)})) : [];
        const defaultFieldProvenance = source.sourceType === "LOCAL_PDF"
            ? [{field: "DOCUMENT_METADATA", source: "LOCAL_FILE_METADATA", kind: "LOCAL_FILE_METADATA"}, {field: "SHA-256", source: "ORIGINAL_SUPPLIED_BYTES", kind: "LOCAL_INTEGRITY"}]
            : source.sourceType === "URL"
                ? [{field: "NORMALIZED_URL", source: "LOCAL_NORMALIZATION", kind: "DERIVED_NORMALIZATION"}]
                : [{field: "DOI", source: "LOCAL_NORMALIZATION", kind: "DERIVED_NORMALIZATION"}];
        const fieldProvenance = (Array.isArray(metadata.provenance) ? metadata.provenance : defaultFieldProvenance).slice(0, 24).map(item => Object.freeze({field: cleanText(item.field, 80), source: cleanText(item.source, 120), kind: cleanText(item.kind, 80)})).filter(item => item.field && item.source && item.kind);
        return Object.freeze({
            id: String(input.id || `source-${Date.now().toString(36)}`), capability: CAPABILITY, source, metadata: Object.freeze({title: cleanText(metadata.title, 500), publisher: cleanText(metadata.publisher, 240), authors: Object.freeze((metadata.authors || []).map(item => cleanText(item, 180)).filter(Boolean).slice(0, 12)), publishedAt: cleanText(metadata.publishedAt, 80), updatedAt: cleanText(metadata.updatedAt, 80), language: cleanText(metadata.language, 32), description: cleanText(metadata.description, 1000), container: cleanText(metadata.container, 240), workType: cleanText(metadata.workType, 80), license: cleanText(metadata.license, 512), sourceUrl: cleanText(metadata.sourceUrl, 2048)}),
            archive: archive ? Object.freeze({available: archive.available === true, snapshotUrl: cleanText(archive.snapshotUrl, 2048), snapshotTimestamp: cleanText(archive.snapshotTimestamp, 64), provider: cleanText(archive.provider, 120), observedAt: cleanText(archive.observedAt, 64)}) : null,
            fieldProvenance: Object.freeze(fieldProvenance),
            providerObservations: Object.freeze(providerObservations), verificationStatus: status, confidence: CONFIDENCE_LEVELS.includes(input.confidence) ? input.confidence : providerObservations.length ? "MEDIUM" : source.localFileMetadata ? "MEDIUM" : "LOW",
            excerpt: cleanText(input.excerpt, MAX_EXCERPT), excerptLocation: cleanText(input.excerptLocation, 240), claimRelationship: ["SUPPORT", "CONTRADICT", "CONTEXT", "UNKNOWN"].includes(input.claimRelationship) ? input.claimRelationship : "UNKNOWN", analystObservation: cleanText(input.analystObservation, MAX_NOTE), createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
        });
    }

    function toEvidenceData(context, analystObservation = "") {
        if (!context || !context.source) throw new ResearchSourceError("INVALID_INPUT", "A reviewed source context is required before evidence can be created.");
        const source = context.source;
        const file = source.localFileMetadata;
        return Object.freeze({available: context.providerObservations.some(item => ["SUCCESS", "PARTIAL", "LOCAL"].includes(item.status)) || Boolean(file), originalInput: source.originalInput, canonicalUrl: source.normalizedUrl, snapshotUrl: context.archive && context.archive.snapshotUrl || null, snapshotTimestamp: context.archive && context.archive.snapshotTimestamp || null, provider: context.providerObservations.map(item => item.providerName).filter(Boolean).join(" · ") || (file ? "Local PDF inspection" : "No provider observation"), queriedAt: context.createdAt, completedAt: context.updatedAt, confidence: context.confidence, warnings: Object.freeze([]), analystObservation: cleanText(analystObservation || context.analystObservation, MAX_NOTE), research: Object.freeze({sourceType: source.sourceType, normalizedUrl: source.normalizedUrl, hostname: source.hostname, doi: source.identifiers && source.identifiers.doi || null, localDocument: file ? Object.freeze({...file}) : null, title: context.metadata.title, publisher: context.metadata.publisher, authors: context.metadata.authors, publishedAt: context.metadata.publishedAt, updatedAt: context.metadata.updatedAt, language: context.metadata.language, container: context.metadata.container, workType: context.metadata.workType, license: context.metadata.license, archive: context.archive ? Object.freeze({...context.archive}) : null, provenance: Object.freeze(context.providerObservations.slice()), fieldProvenance: Object.freeze(context.fieldProvenance || []), excerpt: context.excerpt, excerptLocation: context.excerptLocation, claimRelationship: context.claimRelationship, analystObservation: cleanText(analystObservation || context.analystObservation, MAX_NOTE), verificationStatus: context.verificationStatus, confidence: context.confidence})});
    }

    return Object.freeze({CAPABILITY, SOURCE_TYPES, STATUSES, CONFIDENCE_LEVELS, MAX_INPUT_LENGTH, MAX_PDF_BYTES, MAX_EXCERPT, MAX_NOTE, ResearchSourceError, cleanText, safeLabel, normalizeUrl, normalizeDoi, inspectPdf, sha256, normalizeCrossrefMetadata, createSourceContext, toEvidenceData});
});
