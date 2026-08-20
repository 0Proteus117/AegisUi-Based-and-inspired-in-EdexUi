"use strict";

// This runtime deliberately has no fetch, shell, environment or arbitrary
// filesystem API. It analyses only bytes returned by the existing managed-PDF
// boundary after a user has explicitly selected one file.
const crypto = require("crypto");
const path = require("path");
const {pathToFileURL} = require("url");
const Academic = require("./studAcademicModel.class.js");

const MAX_PAGES = 500;
const MAX_PAGE_TEXT = 40000;
const MAX_TOTAL_TEXT = 2 * 1024 * 1024;
const CHUNK_SIZE = 1600;

function error(code, message, details = {}) { return new Academic.StudError(code, message, details); }
function sha256(value) { return crypto.createHash("sha256").update(String(value), "utf8").digest("hex"); }
function normalizeText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

function directReferences(text, pageNumber) {
    const result = [];
    const seen = new Set();
    const patterns = [
        {type: "DOI", expression: /\b10\.\d{4,9}\/[\w.()/:;-]+\b/gi},
        {type: "URL", expression: /\bhttps?:\/\/[^\s<>{}|\\^`[\]]+/gi},
        {type: "ISBN", expression: /\b(?:ISBN(?:-1[03])?\s*[: ]?)?(?:97[89][ -]?)?[0-9][0-9 -]{8,16}[0-9X]\b/gi}
    ];
    patterns.forEach(({type, expression}) => {
        for (const match of text.matchAll(expression)) {
            const value = String(match[0]).replace(/[.,;:]+$/, "");
            const key = `${type}:${value.toLowerCase()}`;
            if (!value || seen.has(key)) continue;
            seen.add(key);
            result.push({referenceType: type, value, sourceText: value, pageNumber, confidence: "HIGH"});
        }
    });
    return result.slice(0, 100);
}

function chunkPage(pageNumber, text, offset = 0) {
    const words = normalizeText(text).split(" ").filter(Boolean);
    const chunks = [];
    let current = "";
    words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > CHUNK_SIZE && current) {
            chunks.push({id: `p${pageNumber}_${offset + chunks.length}`, pageStart: pageNumber, pageEnd: pageNumber, chunkType: "TEXT", content: current, contentHash: sha256(current)});
            current = word;
        } else current = candidate;
    });
    if (current) chunks.push({id: `p${pageNumber}_${offset + chunks.length}`, pageStart: pageNumber, pageEnd: pageNumber, chunkType: "TEXT", content: current, contentHash: sha256(current)});
    return chunks;
}

async function defaultPdfJsLoader() {
    let resolved;
    try { resolved = require.resolve("pdfjs-dist/legacy/build/pdf.mjs"); }
    catch (cause) { throw error("PDF_ENGINE_UNAVAILABLE", "Built-in PDF.js is not available in this installation.", {cause: cause.message}); }
    return import(pathToFileURL(resolved).href);
}

function standardFontDataUrl() {
    try {
        const font = require.resolve("pdfjs-dist/standard_fonts/FoxitSymbol.pfb");
        return pathToFileURL(`${path.dirname(font)}${path.sep}`).href;
    } catch (_) { return undefined; }
}

class StudDocumentRuntime {
    constructor(options = {}) {
        if (typeof options.readManagedPdf !== "function") throw new Error("readManagedPdf is required for document analysis.");
        this.readManagedPdf = options.readManagedPdf;
        this.loadPdfJs = options.loadPdfJs || defaultPdfJsLoader;
        this.controllers = new Map();
    }

    capabilities() {
        return Object.freeze({
            BUILTIN_PDF: Object.freeze({status: "AVAILABLE", engine: "PDFJS_BUILT_IN", formats: Object.freeze(["PDF"]), offline: true, network: false}),
            DOCLING: Object.freeze({status: "NOT_INSTALLED", engine: "DOCLING", optionalPack: true, reason: "Advanced local pack is intentionally not bundled; no cloud fallback is used."}),
            GROBID: Object.freeze({status: "NOT_INSTALLED", engine: "GROBID", optionalPack: true, reason: "No local GROBID service is configured; no localhost or remote probe is made."}),
            OCR: Object.freeze({status: "NOT_INSTALLED", engine: "OCR", optionalPack: true, reason: "No approved local OCR pack is installed; image-only PDFs remain honestly unstructured."})
        });
    }

    cancel(requestId) {
        const controller = this.controllers.get(String(requestId || ""));
        if (controller) controller.abort();
        return Object.freeze({cancelled: Boolean(controller)});
    }

    async analyze(input = {}) {
        Academic.assertAllowedKeys(input, ["document", "requestId"], "Document analysis");
        const requestId = Academic.requiredText(input.requestId, "Request ID", 100);
        const document = input.document && typeof input.document === "object" ? input.document : null;
        if (!document || typeof document.managedReference !== "string") throw error("INVALID_INPUT", "A managed academic document is required.");
        const controller = new AbortController();
        if (this.controllers.has(requestId)) this.controllers.get(requestId).abort();
        this.controllers.set(requestId, controller);
        try {
            const managed = this.readManagedPdf(document.managedReference);
            if (controller.signal.aborted) throw error("CANCELLED", "Document analysis was cancelled.");
            const bytes = Buffer.from(managed.bytesBase64, "base64");
            const pdfjs = await this.loadPdfJs();
            const fontDataUrl = standardFontDataUrl();
            const task = pdfjs.getDocument({data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useWorkerFetch: false, ...(fontDataUrl ? {standardFontDataUrl: fontDataUrl} : {})});
            let pdf;
            try { pdf = await task.promise; }
            catch (cause) {
                if (/password/i.test(String(cause && cause.message || cause))) return this.result("ENCRYPTED", {warnings: [{code: "ENCRYPTED_DOCUMENT", message: "The PDF is encrypted and cannot be parsed without a password."}]});
                throw error("FAILED", "Built-in PDF.js could not parse this managed PDF safely.", {cause: cause.message});
            }
            const pageCount = Math.min(Number(pdf.numPages) || 0, MAX_PAGES);
            const warnings = [];
            if (pdf.numPages > MAX_PAGES) warnings.push({code: "PAGE_LIMIT", message: `Only the first ${MAX_PAGES} pages were analyzed locally.`});
            const pages = [], chunks = [], references = [];
            let total = 0;
            for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
                if (controller.signal.aborted) throw error("CANCELLED", "Document analysis was cancelled.");
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent({includeMarkedContent: false, disableNormalization: false});
                let text = normalizeText((content.items || []).map(item => item && item.str || "").join(" "));
                if (text.length > MAX_PAGE_TEXT) { text = text.slice(0, MAX_PAGE_TEXT); warnings.push({code: "PAGE_TEXT_LIMIT", message: `Page ${pageNumber} text was bounded for safe local indexing.`}); }
                if (total + text.length > MAX_TOTAL_TEXT) { text = text.slice(0, Math.max(0, MAX_TOTAL_TEXT - total)); warnings.push({code: "DOCUMENT_TEXT_LIMIT", message: "Document text was bounded for safe local indexing."}); }
                total += text.length;
                pages.push({pageNumber, text, textHash: sha256(text)});
                chunks.push(...chunkPage(pageNumber, text, chunks.length));
                references.push(...directReferences(text, pageNumber));
                if (total >= MAX_TOTAL_TEXT) break;
            }
            const status = !chunks.length ? "OCR_REQUIRED" : warnings.length ? "PARTIAL" : "READY";
            if (!chunks.length) warnings.push({code: "NO_EXTRACTABLE_TEXT", message: "No embedded text was found. OCR is not installed and no text was inferred."});
            return this.result(status, {pageCount, pages, chunks, references, warnings});
        } catch (cause) {
            if (cause && cause.code === "CANCELLED") return this.result("CANCELLED", {warnings: [{code: "CANCELLED", message: "Document analysis was cancelled before persistence."}]});
            if (cause && cause.code) throw cause;
            throw error("FAILED", "Document analysis failed safely.", {cause: cause && cause.message || "unknown"});
        } finally { if (this.controllers.get(requestId) === controller) this.controllers.delete(requestId); }
    }

    result(status, values = {}) {
        return Object.freeze({status, engine: "PDFJS_BUILT_IN", engineVersion: null, pageCount: values.pageCount || 0, pages: Object.freeze(values.pages || []), sections: Object.freeze([]), chunks: Object.freeze(values.chunks || []), references: Object.freeze(values.references || []), footnotes: Object.freeze([]), tables: Object.freeze([]), figures: Object.freeze([]), equations: Object.freeze([]), warnings: Object.freeze(values.warnings || []), structuredContent: false, networkUsed: false});
    }

    dispose() { this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); }
}

module.exports = {StudDocumentRuntime, MAX_PAGES, MAX_PAGE_TEXT, MAX_TOTAL_TEXT, CHUNK_SIZE, chunkPage, directReferences, sha256, standardFontDataUrl};
