"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Research = require("./studResearchModel.class.js");
const Academic = require("./studAcademicModel.class.js");
const Citations = require("./studCitationService.class.js");

const ENDPOINTS = Object.freeze({
    OPENALEX: "https://api.openalex.org/works",
    OPENALEX_AUTHORS: "https://api.openalex.org/authors",
    CROSSREF: "https://api.crossref.org/v1/works/",
    DATACITE: "https://api.datacite.org/dois/",
    UNPAYWALL: "https://api.unpaywall.org/v2/",
    ZOTERO_LOCAL: "http://127.0.0.1:23119/api/"
});
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 12000;
const PDF_CANDIDATE_TTL_MS = 15 * 60 * 1000;
const MAX_PDF_CANDIDATES = 25;
const MAX_CONCURRENT_REQUESTS = 8;

function runtimeError(code, message, details = {}) { return new Academic.StudError(code, message, details); }

function providerError(provider, error) {
    if (error && error.name === "AbortError") return runtimeError("CANCELLED", `${provider} request was cancelled.`);
    if (error && error.code) return error;
    return runtimeError("PROVIDER_UNAVAILABLE", `${provider} is currently unavailable. Local STUD data remains available.`);
}

function boundedJsonText(text, provider) {
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw runtimeError("RESPONSE_TOO_LARGE", `${provider} response exceeded the bounded response limit.`);
    try { return JSON.parse(text); } catch (error) { throw runtimeError("MALFORMED_PROVIDER_RESPONSE", `${provider} returned malformed JSON.`); }
}

class StudResearchRuntime {
    constructor(options = {}) {
        this.fetch = options.fetch || global.fetch;
        this.env = options.env || process.env;
        this.root = path.resolve(options.root || process.cwd());
        this.dialog = options.dialog || null;
        this.shell = options.shell || null;
        this.controllers = new Map();
        this.ephemeral = new Map();
        this.pdfCandidates = new Map();
        this.timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    }

    status() {
        return Object.freeze({
            providers: Object.freeze({
                OPENALEX: this.env.AEGISUI_OPENALEX_API_KEY ? "READY" : "CONFIG_REQUIRED",
                CROSSREF: "READY", DATACITE: "READY",
                UNPAYWALL: this.env.AEGISUI_UNPAYWALL_EMAIL ? "READY" : "CONFIG_REQUIRED",
                ZOTERO_LOCAL: "CHECK_REQUIRED"
            }),
            policies: Research.PROVIDERS,
            limits: Object.freeze({results: Research.MAX_RESULTS, responseBytes: MAX_RESPONSE_BYTES, pdfBytes: MAX_PDF_BYTES, timeoutMs: this.timeoutMs})
        });
    }

    begin(requestId, provider) {
        const id = Academic.requiredText(requestId, "Request ID", 100);
        if (this.controllers.has(id)) this.controllers.get(id).abort();
        if (!this.controllers.has(id) && this.controllers.size >= MAX_CONCURRENT_REQUESTS) throw runtimeError("BUSY", "The bounded academic provider request limit is active. Wait for an existing request to finish.");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        this.controllers.set(id, controller);
        return {id, provider, controller, timeout};
    }

    finish(operation) {
        clearTimeout(operation.timeout);
        if (this.controllers.get(operation.id) === operation.controller) this.controllers.delete(operation.id);
    }

    cancel(requestId) {
        const controller = this.controllers.get(String(requestId || ""));
        if (controller) controller.abort();
        return Object.freeze({cancelled: Boolean(controller)});
    }

    async requestJson(provider, url, requestId) {
        if (typeof this.fetch !== "function") throw runtimeError("OFFLINE", "Academic provider runtime is unavailable; local STUD data remains available.");
        const operation = this.begin(requestId, provider);
        try {
            const response = await this.fetch(url, {
                method: "GET", signal: operation.controller.signal,
                redirect: "error", headers: {Accept: "application/json", "User-Agent": "AegisUi-STUD/2.6 (+https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi)"}
            });
            if (response.status === 429) throw runtimeError("RATE_LIMITED", `${provider} rate limit reached. Retry later.`);
            if (!response.ok) throw runtimeError(`HTTP_${response.status}`, `${provider} returned HTTP ${response.status}.`);
            return boundedJsonText(await response.text(), provider);
        } catch (error) { throw providerError(provider, error); }
        finally { this.finish(operation); }
    }

    retain(provider, normalized) {
        const token = `stud_result_${crypto.randomUUID().replace(/-/g, "")}`;
        this.ephemeral.set(token, {provider, normalized, createdAt: Date.now()});
        if (this.ephemeral.size > 100) {
            const oldest = [...this.ephemeral.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, this.ephemeral.size - 100);
            oldest.forEach(([key]) => this.ephemeral.delete(key));
        }
        return token;
    }

    resolveToken(token) {
        const value = this.ephemeral.get(String(token || ""));
        if (!value) throw runtimeError("RESULT_EXPIRED", "This ephemeral provider result is unavailable. Run the explicit lookup again.");
        return value;
    }

    async searchOpenAlex(input = {}) {
        const query = Academic.requiredText(input.query, "Research query", Academic.LIMITS.searchQuery);
        const key = String(this.env.AEGISUI_OPENALEX_API_KEY || "").trim();
        if (!key) throw runtimeError("CONFIG_REQUIRED", "OpenAlex now requires a free API key. Configure AEGISUI_OPENALEX_API_KEY; offline research remains available.");
        const limit = Math.max(1, Math.min(Number(input.limit) || 12, Research.MAX_RESULTS));
        const url = new URL(ENDPOINTS.OPENALEX);
        url.searchParams.set("search", query);
        url.searchParams.set("per-page", String(limit));
        url.searchParams.set("api_key", key);
        if (input.year) url.searchParams.set("filter", `publication_year:${Number(input.year)}`);
        const raw = await this.requestJson("OpenAlex", url, input.requestId);
        const works = (Array.isArray(raw.results) ? raw.results : []).slice(0, limit).map(Research.normalizeOpenAlexWork);
        return Object.freeze(works.map(work => Object.freeze({token: this.retain("OPENALEX", work), work})));
    }

    openAlexKey(url) {
        const key=String(this.env.AEGISUI_OPENALEX_API_KEY||"").trim();
        if(key) url.searchParams.set("api_key",key);
        return url;
    }

    async searchOpenAlexAuthors(input = {}) {
        const query=Academic.requiredText(input.name,"Faculty name",300);
        const limit=Math.max(1,Math.min(Number(input.limit)||10,20));
        const url=this.openAlexKey(new URL(ENDPOINTS.OPENALEX_AUTHORS));
        url.searchParams.set("search",query);
        url.searchParams.set("per_page",String(limit));
        url.searchParams.set("select","id,display_name,orcid,works_count,affiliations,last_known_institutions,topics");
        const raw=await this.requestJson("OpenAlex",url,input.requestId);
        return Object.freeze((Array.isArray(raw.results)?raw.results:[]).slice(0,limit));
    }

    async worksByOpenAlexAuthor(input = {}) {
        const authorId=String(input.authorId||"").trim().toUpperCase();
        if(!/^A\d+$/.test(authorId)) throw runtimeError("INVALID_INPUT","A valid OpenAlex Author ID is required.");
        const limit=Math.max(1,Math.min(Number(input.limit)||25,Research.MAX_RESULTS));
        const url=this.openAlexKey(new URL(ENDPOINTS.OPENALEX));
        url.searchParams.set("filter",`authorships.author.id:${authorId}`);
        url.searchParams.set("per_page",String(limit));
        url.searchParams.set("sort","publication_date:desc");
        const raw=await this.requestJson("OpenAlex",url,input.requestId);
        return Object.freeze((Array.isArray(raw.results)?raw.results:[]).slice(0,limit));
    }

    async resolveCrossref(input = {}) {
        const doi = Research.normalizeDoi(input.doi);
        if (!doi) throw runtimeError("INVALID_DOI", "A valid DOI is required.");
        const raw = await this.requestJson("Crossref", `${ENDPOINTS.CROSSREF}${encodeURIComponent(doi)}`, input.requestId);
        const work = Research.normalizeCrossrefWork(raw);
        return Object.freeze({token: this.retain("CROSSREF", work), work});
    }

    async resolveDataCite(input = {}) {
        const doi = Research.normalizeDoi(input.doi);
        if (!doi) throw runtimeError("INVALID_DOI", "A valid DOI is required.");
        const raw = await this.requestJson("DataCite", `${ENDPOINTS.DATACITE}${encodeURIComponent(doi)}`, input.requestId);
        const work = Research.normalizeDataCiteWork(raw);
        return Object.freeze({token: this.retain("DATACITE", work), work});
    }

    async findOpenAccess(input = {}) {
        const doi = Research.normalizeDoi(input.doi);
        if (!doi) throw runtimeError("INVALID_DOI", "A valid DOI is required before checking legal open access.");
        const email = String(this.env.AEGISUI_UNPAYWALL_EMAIL || "").trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw runtimeError("CONFIG_REQUIRED", "Unpaywall requires a private contact email. Configure AEGISUI_UNPAYWALL_EMAIL; it is never stored or logged.");
        const url = new URL(`${ENDPOINTS.UNPAYWALL}${encodeURIComponent(doi)}`);
        url.searchParams.set("email", email);
        const raw = await this.requestJson("Unpaywall", url, input.requestId);
        const oa = Research.normalizeUnpaywall(raw);
        let pdfToken = null;
        if (oa.bestLocation && oa.bestLocation.pdfUrl) {
            pdfToken = `stud_pdf_${crypto.randomUUID().replace(/-/g, "")}`;
            this.pdfCandidates.set(pdfToken, {url: oa.bestLocation.pdfUrl, doi, createdAt: Date.now()});
            const expiredBefore = Date.now() - PDF_CANDIDATE_TTL_MS;
            for (const [token, candidate] of this.pdfCandidates) {
                if (candidate.createdAt < expiredBefore) this.pdfCandidates.delete(token);
            }
            if (this.pdfCandidates.size > MAX_PDF_CANDIDATES) {
                const oldest = [...this.pdfCandidates.entries()]
                    .sort((a, b) => a[1].createdAt - b[1].createdAt)
                    .slice(0, this.pdfCandidates.size - MAX_PDF_CANDIDATES);
                oldest.forEach(([token]) => this.pdfCandidates.delete(token));
            }
        }
        return Object.freeze({oa, pdfToken});
    }

    async checkZotero(input = {}) {
        const raw = await this.requestJson("Zotero local", ENDPOINTS.ZOTERO_LOCAL, input.requestId);
        return Object.freeze({state: raw ? "AVAILABLE_LOCAL" : "UNAVAILABLE", apiVersion: 3, writeSupported: false});
    }

    async listZotero(input = {}) {
        const limit = Math.max(1, Math.min(Number(input.limit) || 20, 50));
        const url = new URL(`${ENDPOINTS.ZOTERO_LOCAL}users/0/items`);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("format", "json");
        const raw = await this.requestJson("Zotero local", url, input.requestId);
        const items = (Array.isArray(raw) ? raw : []).slice(0, limit).map(item => {
            const data = item && item.data || item || {};
            const work = Object.freeze({
                ...Research.normalizeCrossrefWork({message: {DOI: data.DOI, title: [data.title], author: data.creators && data.creators.map(value => ({given: value.firstName, family: value.lastName, name: value.name})), issued: {"date-parts": [[Number(String(data.date || "").slice(0, 4)) || null]]}, "container-title": [data.publicationTitle], publisher: data.publisher, type: data.itemType, URL: data.url}}),
                provider: "ZOTERO_LOCAL", providerRecordId: data.key || item.key
            });
            return Object.freeze({token: this.retain("ZOTERO_LOCAL", work), work});
        });
        return Object.freeze(items);
    }

    async chooseAndImportPdf(input = {}) {
        if (!this.dialog || typeof this.dialog.showOpenDialog !== "function") throw runtimeError("FILE_DIALOG_UNAVAILABLE", "The explicit PDF selector is unavailable.");
        const result = await this.dialog.showOpenDialog({title: "Select academic PDF", properties: ["openFile"], filters: [{name: "PDF", extensions: ["pdf"]}]});
        if (result.canceled || !result.filePaths || !result.filePaths[0]) return Object.freeze({cancelled: true});
        return this.importPdfFromPath(result.filePaths[0], input.paperId || null);
    }

    importPdfFromPath(filePath, paperId = null) {
        const absolute = path.resolve(filePath);
        const stat = fs.statSync(absolute);
        if (!stat.isFile() || stat.size < 5 || stat.size > MAX_PDF_BYTES) throw runtimeError("INVALID_PDF", "PDF must be a regular file between 5 bytes and 40 MB.");
        const header = Buffer.alloc(5);
        const fd = fs.openSync(absolute, "r");
        try { fs.readSync(fd, header, 0, 5, 0); } finally { fs.closeSync(fd); }
        if (header.toString("ascii") !== "%PDF-") throw runtimeError("INVALID_PDF", "Selected file is not a supported PDF.");
        const documents = path.join(this.root, "documents");
        fs.mkdirSync(documents, {recursive: true, mode: 0o700});
        const digest = Research.sha256(fs.readFileSync(absolute));
        const safeName = `${paperId && /^[a-z][a-z0-9_]+$/i.test(paperId) ? paperId : "paper"}_${digest.slice(0, 16)}.pdf`;
        const destination = path.join(documents, safeName);
        if (!fs.existsSync(destination)) fs.copyFileSync(absolute, destination, fs.constants.COPYFILE_EXCL);
        return Object.freeze({cancelled: false, reference: `documents/${safeName}`, displayName: path.basename(absolute).slice(0, 240), mimeType: "application/pdf", size: stat.size, sha256: digest});
    }

    readManagedPdf(reference) {
        const value = String(reference || "");
        if (!/^documents\/[a-z0-9_]+_[a-f0-9]{16}\.pdf$/i.test(value)) throw runtimeError("POLICY_BLOCKED", "Only managed STUD PDF references can be opened.");
        const absolute = path.resolve(this.root, value);
        const documents = path.resolve(this.root, "documents");
        if (!absolute.startsWith(`${documents}${path.sep}`)) throw runtimeError("POLICY_BLOCKED", "Managed PDF path is outside STUD storage.");
        if (!fs.existsSync(absolute)) throw runtimeError("DOCUMENT_MISSING", "The managed local PDF is missing or was removed.");
        const stat = fs.statSync(absolute);
        if (stat.size > MAX_PDF_BYTES) throw runtimeError("INVALID_PDF", "Managed PDF exceeds the viewer size limit.");
        const bytes = fs.readFileSync(absolute);
        return Object.freeze({reference: value, bytesBase64: bytes.toString("base64"), size: stat.size, sha256: Research.sha256(bytes)});
    }

    async fetchOaPdf(input = {}) {
        if (typeof this.fetch !== "function") throw runtimeError("OFFLINE", "Open-access PDF retrieval is unavailable; local STUD data remains available.");
        const token = String(input.pdfToken || "");
        const candidate = this.pdfCandidates.get(token);
        if (!candidate) throw runtimeError("RESULT_EXPIRED", "The legal OA PDF candidate expired. Run FIND OPEN ACCESS again.");
        if (Date.now() - candidate.createdAt > PDF_CANDIDATE_TTL_MS) {
            this.pdfCandidates.delete(token);
            throw runtimeError("RESULT_EXPIRED", "The legal OA PDF candidate expired. Run FIND OPEN ACCESS again.");
        }
        const operation = this.begin(input.requestId, "OA PDF");
        try {
            const response = await this.fetch(candidate.url, {method: "GET", signal: operation.controller.signal, redirect: "follow", headers: {Accept: "application/pdf"}});
            if (!response.ok) throw runtimeError(`HTTP_${response.status}`, `Open-access PDF returned HTTP ${response.status}.`);
            const type = String(response.headers.get("content-type") || "").toLowerCase();
            if (!type.includes("application/pdf")) throw runtimeError("UNEXPECTED_CONTENT_TYPE", "Open-access location did not return a PDF.");
            const declared = Number(response.headers.get("content-length") || 0);
            if (declared > MAX_PDF_BYTES) throw runtimeError("PDF_TOO_LARGE", "Open-access PDF exceeds 40 MB.");
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw runtimeError("INVALID_PDF", "Open-access response is not a bounded valid PDF.");
            return Object.freeze({candidate, bytes, sha256: Research.sha256(bytes)});
        } catch (error) { throw providerError("Open-access PDF", error); }
        finally { this.finish(operation); }
    }

    async readOaPdf(input = {}) {
        const result = await this.fetchOaPdf(input);
        return Object.freeze({reference: `oa:${result.sha256}`, bytesBase64: result.bytes.toString("base64"), size: result.bytes.length, sha256: result.sha256});
    }

    async saveOaPdf(input = {}) {
        const result = await this.fetchOaPdf(input);
        const {candidate, bytes, sha256} = result;
        try {
            const documents = path.join(this.root, "documents");
            fs.mkdirSync(documents, {recursive: true, mode: 0o700});
            const safeName = `oa_${sha256.slice(0, 16)}.pdf`;
            const destination = path.join(documents, safeName);
            if (!fs.existsSync(destination)) fs.writeFileSync(destination, bytes, {mode: 0o600, flag: "wx"});
            return Object.freeze({reference: `documents/${safeName}`, displayName: `${candidate.doi}.pdf`, mimeType: "application/pdf", size: bytes.length, sha256});
        } catch (error) { throw providerError("Managed OA PDF", error); }
    }

    citation(papers, style) { return Citations.render(papers, style); }

    dispose() {
        this.controllers.forEach(controller => controller.abort());
        this.controllers.clear();
        this.ephemeral.clear();
        this.pdfCandidates.clear();
    }
}

module.exports = {StudResearchRuntime, ENDPOINTS, MAX_RESPONSE_BYTES, MAX_PDF_BYTES, DEFAULT_TIMEOUT_MS, PDF_CANDIDATE_TTL_MS, MAX_PDF_CANDIDATES, MAX_CONCURRENT_REQUESTS, boundedJsonText};
