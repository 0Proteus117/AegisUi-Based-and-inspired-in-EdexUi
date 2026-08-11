"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const PROVIDERS = Object.freeze({
    OPENALEX: Object.freeze({id: "OPENALEX", capability: "DISCOVERY", costModel: "FREEMIUM", auth: "API_KEY", active: true}),
    CROSSREF: Object.freeze({id: "CROSSREF", capability: "DOI_METADATA", costModel: "FREE_SERVICE", auth: "NONE", active: true}),
    DATACITE: Object.freeze({id: "DATACITE", capability: "RESEARCH_OBJECT_METADATA", costModel: "FREE_SERVICE", auth: "NONE", active: true}),
    UNPAYWALL: Object.freeze({id: "UNPAYWALL", capability: "LEGAL_OPEN_ACCESS", costModel: "FREE_SERVICE", auth: "EMAIL_IDENTITY", active: true}),
    ZOTERO_LOCAL: Object.freeze({id: "ZOTERO_LOCAL", capability: "LOCAL_LIBRARY_READ", costModel: "FREE_LOCAL", auth: "NONE", active: true})
});
const PROVIDER_STATES = Object.freeze(["READY", "CONFIG_REQUIRED", "OFFLINE", "RATE_LIMITED", "TIMEOUT", "CANCELLED", "ERROR"]);
const RESEARCH_OBJECT_TYPES = Object.freeze(["ARTICLE", "BOOK", "CHAPTER", "DATASET", "SOFTWARE", "REPORT", "THESIS", "OTHER"]);
const CITATION_STYLES = Object.freeze(["apa", "harvard1", "vancouver"]);
const MAX_RESULTS = 25;
const MAX_ABSTRACT = 12000;
const MAX_AUTHORS = 100;
const MAX_PROVIDER_VALUE = 16000;

function text(value, max = MAX_PROVIDER_VALUE) {
    if (value === undefined || value === null) return null;
    const result = String(value).replace(/\s+/g, " ").trim();
    return result ? result.slice(0, max) : null;
}

function normalizeDoi(value) {
    const candidate = text(value, 300);
    if (!candidate) return null;
    const doi = candidate.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").trim().toLowerCase();
    return /^10\.\d{4,9}\/[\w.()/:+-]+$/i.test(doi) ? doi : null;
}

function normalizeOpenAlexId(value) {
    const candidate = text(value, 160);
    if (!candidate) return null;
    const match = candidate.match(/(?:openalex\.org\/)?(W\d+)$/i);
    return match ? match[1].toUpperCase() : null;
}

function normalizeAuthors(values) {
    if (!Array.isArray(values)) return [];
    return values.slice(0, MAX_AUTHORS).map(value => {
        if (typeof value === "string") return {displayName: text(value, 240)};
        const name = value && (value.displayName || value.display_name || value.name || [value.given, value.family].filter(Boolean).join(" "));
        return {displayName: text(name, 240), orcid: text(value && (value.orcid || value.ORCID), 120)};
    }).filter(value => value.displayName);
}

function reconstructAbstract(index) {
    if (!index || typeof index !== "object" || Array.isArray(index)) return null;
    const terms = [];
    Object.entries(index).slice(0, 4000).forEach(([word, positions]) => {
        if (!Array.isArray(positions)) return;
        positions.slice(0, 100).forEach(position => {
            const indexValue = Number(position);
            if (Number.isInteger(indexValue) && indexValue >= 0 && indexValue < 5000) terms[indexValue] = word;
        });
    });
    return text(terms.filter(Boolean).join(" "), MAX_ABSTRACT);
}

function mapType(value) {
    const type = String(value || "").toLowerCase();
    if (/dataset/.test(type)) return "DATASET";
    if (/software/.test(type)) return "SOFTWARE";
    if (/book-chapter|chapter/.test(type)) return "CHAPTER";
    if (/book/.test(type)) return "BOOK";
    if (/report/.test(type)) return "REPORT";
    if (/thesis|dissertation/.test(type)) return "THESIS";
    if (/article|journal|proceedings|posted-content/.test(type)) return "ARTICLE";
    return "OTHER";
}

function yearFrom(value) {
    if (!value) return null;
    if (Number.isInteger(Number(value)) && Number(value) >= 1000 && Number(value) <= 3000) return Number(value);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

function freezePaper(value) {
    return Object.freeze({
        provider: value.provider,
        providerRecordId: value.providerRecordId || null,
        objectType: RESEARCH_OBJECT_TYPES.includes(value.objectType) ? value.objectType : "OTHER",
        title: text(value.title, 600) || "UNTITLED RESEARCH OBJECT",
        authors: Object.freeze(normalizeAuthors(value.authors)),
        year: yearFrom(value.year || value.publishedDate),
        publishedDate: text(value.publishedDate, 80),
        venue: text(value.venue, 500),
        publisher: text(value.publisher, 500),
        abstract: text(value.abstract, MAX_ABSTRACT),
        doi: normalizeDoi(value.doi),
        openAlexId: normalizeOpenAlexId(value.openAlexId),
        sourceUrl: safePublicUrl(value.sourceUrl),
        citationCount: Number.isFinite(Number(value.citationCount)) ? Math.max(0, Number(value.citationCount)) : null,
        referencesCount: Number.isFinite(Number(value.referencesCount)) ? Math.max(0, Number(value.referencesCount)) : null,
        identifiers: Object.freeze({...value.identifiers}),
        oa: value.oa ? Object.freeze({...value.oa}) : null,
        observedAt: value.observedAt || new Date().toISOString()
    });
}

function normalizeOpenAlexWork(raw) {
    const authorships = Array.isArray(raw && raw.authorships) ? raw.authorships : [];
    return freezePaper({
        provider: "OPENALEX", providerRecordId: raw && raw.id, openAlexId: raw && raw.id,
        objectType: mapType(raw && raw.type), title: raw && raw.title,
        authors: authorships.map(item => item && item.author || {}), year: raw && raw.publication_year,
        publishedDate: raw && raw.publication_date,
        venue: raw && raw.primary_location && raw.primary_location.source && raw.primary_location.source.display_name,
        abstract: reconstructAbstract(raw && raw.abstract_inverted_index), doi: raw && raw.doi,
        sourceUrl: raw && raw.primary_location && raw.primary_location.landing_page_url,
        citationCount: raw && raw.cited_by_count, referencesCount: raw && raw.referenced_works_count,
        identifiers: {openalex: normalizeOpenAlexId(raw && raw.id), doi: normalizeDoi(raw && raw.doi)},
        oa: raw && raw.open_access ? {isOpenAccess: raw.open_access.is_oa === true, status: text(raw.open_access.oa_status, 80), url: safePublicUrl(raw.open_access.oa_url)} : null
    });
}

function dateParts(parts) {
    const value = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0] : [];
    if (!value.length) return null;
    const [year, month = 1, day = 1] = value.map(Number);
    if (!year) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeCrossrefWork(raw) {
    const value = raw && raw.message || raw || {};
    return freezePaper({
        provider: "CROSSREF", providerRecordId: value.DOI, objectType: mapType(value.type),
        title: Array.isArray(value.title) ? value.title[0] : value.title,
        authors: value.author, publishedDate: dateParts((value.published || value.issued || {})["date-parts"]),
        venue: Array.isArray(value["container-title"]) ? value["container-title"][0] : value["container-title"],
        publisher: value.publisher, abstract: value.abstract && String(value.abstract).replace(/<[^>]+>/g, " "),
        doi: value.DOI, sourceUrl: value.URL,
        identifiers: {doi: normalizeDoi(value.DOI), issn: Array.isArray(value.ISSN) ? value.ISSN.slice(0, 10) : []}
    });
}

function normalizeDataCiteWork(raw) {
    const item = raw && raw.data || raw || {};
    const value = item.attributes || item;
    const descriptions = Array.isArray(value.descriptions) ? value.descriptions : [];
    return freezePaper({
        provider: "DATACITE", providerRecordId: item.id || value.doi, objectType: mapType(value.types && (value.types.resourceTypeGeneral || value.types.resourceType)),
        title: Array.isArray(value.titles) && value.titles[0] && value.titles[0].title,
        authors: Array.isArray(value.creators) ? value.creators.map(author => ({display_name: author.name || [author.givenName, author.familyName].filter(Boolean).join(" "), orcid: author.nameIdentifiers && author.nameIdentifiers[0] && author.nameIdentifiers[0].nameIdentifier})) : [],
        year: value.publicationYear, publishedDate: value.dates && value.dates[0] && value.dates[0].date,
        venue: value.container && value.container.title, publisher: value.publisher,
        abstract: descriptions.find(item => /abstract/i.test(item.descriptionType || ""))?.description,
        doi: value.doi || item.id, sourceUrl: value.url,
        identifiers: {doi: normalizeDoi(value.doi || item.id), datacite: text(item.id, 260)}
    });
}

function safePublicUrl(value) {
    try {
        const url = new URL(String(value || ""));
        if (!/^https:$/.test(url.protocol) || url.username || url.password) return null;
        return url.toString();
    } catch (error) { return null; }
}

function normalizeUnpaywall(raw) {
    const best = raw && raw.best_oa_location || null;
    return Object.freeze({
        provider: "UNPAYWALL", doi: normalizeDoi(raw && raw.doi), isOpenAccess: raw && raw.is_oa === true,
        oaStatus: text(raw && raw.oa_status, 80) || "UNKNOWN", title: text(raw && raw.title, 600),
        bestLocation: best ? Object.freeze({
            landingUrl: safePublicUrl(best.url_for_landing), pdfUrl: safePublicUrl(best.url_for_pdf),
            hostType: text(best.host_type, 80), version: text(best.version, 80), license: text(best.license, 120)
        }) : null,
        observedAt: new Date().toISOString()
    });
}

function normalizedIdentifierSet(paper) {
    const values = [];
    const doi = normalizeDoi(paper && paper.doi);
    const openAlex = normalizeOpenAlexId(paper && paper.openAlexId);
    if (doi) values.push({namespace: "DOI", value: doi});
    if (openAlex) values.push({namespace: "OPENALEX", value: openAlex});
    return Object.freeze(values.map(Object.freeze));
}

function canonicalFieldObservations(papers) {
    const precedence = {CROSSREF: 4, DATACITE: 3, OPENALEX: 2, ZOTERO_LOCAL: 1, USER: 5};
    const fields = ["title", "authors", "year", "publishedDate", "venue", "publisher", "abstract", "sourceUrl", "objectType"];
    const observations = [];
    fields.forEach(field => papers.forEach(paper => {
        const raw = paper[field];
        const value = Array.isArray(raw) ? raw.map(item => item.displayName || item).filter(Boolean).join("; ") : raw;
        if (value !== null && value !== undefined && value !== "") observations.push({field, value, source: paper.provider, authority: precedence[paper.provider] || 0, observedAt: paper.observedAt});
    }));
    return observations;
}

function mergeNormalizedPapers(papers) {
    const values = papers.filter(Boolean).map(freezePaper);
    if (!values.length) throw new Academic.StudError("INVALID_INPUT", "At least one normalized research observation is required.");
    const observations = canonicalFieldObservations(values);
    const canonical = {};
    const conflicts = [];
    new Set(observations.map(item => item.field)).forEach(field => {
        const matches = observations.filter(item => item.field === field).sort((a, b) => b.authority - a.authority);
        canonical[field] = matches[0].value;
        if (new Set(matches.map(item => JSON.stringify(item.value))).size > 1) conflicts.push({field, observations: matches});
    });
    const identifiers = values.flatMap(normalizedIdentifierSet).filter((value, index, all) => all.findIndex(other => other.namespace === value.namespace && other.value === value.value) === index);
    return Object.freeze({canonical: Object.freeze(canonical), identifiers: Object.freeze(identifiers), observations: Object.freeze(observations.map(Object.freeze)), conflicts: Object.freeze(conflicts.map(Object.freeze))});
}

function noteTextFromDocument(document) {
    const output = [];
    const visit = node => {
        if (!node || typeof node !== "object") return;
        if (node.type === "text" && typeof node.text === "string") output.push(node.text);
        if (["paragraph", "heading", "blockquote", "codeBlock", "listItem", "tableRow"].includes(node.type)) output.push("\n");
        if (Array.isArray(node.content)) node.content.forEach(visit);
    };
    visit(document);
    return text(output.join(" ").replace(/\s*\n\s*/g, "\n"), Academic.LIMITS.content) || "";
}

function sanitizeNoteDocument(value) {
    const allowedNodes = new Set(["doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak", "horizontalRule", "table", "tableRow", "tableHeader", "tableCell", "inlineMath", "blockMath", "citation"]);
    const allowedMarks = new Set(["bold", "italic", "strike", "code", "link"]);
    let nodes = 0;
    const clean = node => {
        if (!node || typeof node !== "object" || Array.isArray(node) || !allowedNodes.has(node.type)) return null;
        if (++nodes > 10000) throw new Academic.StudError("PAYLOAD_TOO_LARGE", "Structured note contains too many nodes.");
        const result = {type: node.type};
        if (node.type === "text") result.text = String(node.text || "").slice(0, Academic.LIMITS.content);
        if (node.type === "heading") result.attrs = {level: Math.max(1, Math.min(3, Number(node.attrs && node.attrs.level) || 2))};
        if (["inlineMath", "blockMath"].includes(node.type)) result.attrs = {latex: String(node.attrs && node.attrs.latex || "").slice(0, 4000)};
        if (node.type === "citation") result.attrs = {paperId: Academic.safeId(node.attrs && node.attrs.paperId, "Citation paper ID"), style: CITATION_STYLES.includes(node.attrs && node.attrs.style) ? node.attrs.style : "apa"};
        if (Array.isArray(node.marks)) result.marks = node.marks.filter(mark => mark && allowedMarks.has(mark.type)).slice(0, 8).map(mark => {
            if (mark.type !== "link") return {type: mark.type};
            return {type: "link", attrs: {href: safePublicUrl(mark.attrs && mark.attrs.href) || "", rel: "noopener noreferrer", target: "_blank"}};
        });
        if (Array.isArray(node.content)) result.content = node.content.map(clean).filter(Boolean);
        return result;
    };
    const document = clean(value);
    if (!document || document.type !== "doc") throw new Academic.StudError("INVALID_INPUT", "Structured note document is invalid.");
    return Object.freeze({version: 1, document: Object.freeze(document), plainText: noteTextFromDocument(document)});
}

function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

module.exports = Object.freeze({
    PROVIDERS, PROVIDER_STATES, RESEARCH_OBJECT_TYPES, CITATION_STYLES, MAX_RESULTS,
    normalizeDoi, normalizeOpenAlexId, normalizeAuthors, reconstructAbstract, mapType,
    normalizeOpenAlexWork, normalizeCrossrefWork, normalizeDataCiteWork, normalizeUnpaywall,
    normalizedIdentifierSet, mergeNormalizedPapers, sanitizeNoteDocument, noteTextFromDocument,
    safePublicUrl, sha256
});
