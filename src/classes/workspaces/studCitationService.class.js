"use strict";

const Research = require("./studResearchModel.class.js");

let Citation = null;
function loadCitation() {
    if (Citation) return Citation;
    const core = require("@citation-js/core");
    require("@citation-js/plugin-bibtex");
    require("@citation-js/plugin-csl");
    Citation = core.Cite;
    return Citation;
}

function splitAuthor(displayName) {
    const text = String(displayName || "").trim();
    if (!text) return null;
    if (text.includes(",")) {
        const [family, ...given] = text.split(",");
        return {family: family.trim(), given: given.join(",").trim()};
    }
    const parts = text.split(/\s+/);
    return parts.length === 1 ? {literal: text} : {family: parts.pop(), given: parts.join(" ")};
}

function toCsl(paper) {
    const doi = Research.normalizeDoi(paper && paper.doi);
    const authors = Array.isArray(paper && paper.authors)
        ? paper.authors.map(value => splitAuthor(value.displayName || value)).filter(Boolean)
        : String(paper && paper.authors || "").split(/;|\band\b/i).map(splitAuthor).filter(Boolean);
    const year = Number(paper && paper.year);
    const result = {
        id: String(paper && paper.id || doi || "stud-research-object"),
        type: ({DATASET: "dataset", SOFTWARE: "software", BOOK: "book", CHAPTER: "chapter", REPORT: "report", THESIS: "thesis"})[paper && paper.objectType] || "article-journal",
        title: String(paper && paper.title || "Untitled research object"),
        author: authors
    };
    if (Number.isInteger(year)) result.issued = {"date-parts": [[year]]};
    if (paper && paper.venue) result["container-title"] = paper.venue;
    if (paper && paper.publisher) result.publisher = paper.publisher;
    if (doi) result.DOI = doi;
    if (paper && paper.sourceUrl) result.URL = Research.safePublicUrl(paper.sourceUrl) || undefined;
    return result;
}

function normalizeStyle(style) {
    return Research.CITATION_STYLES.includes(style) ? style : "apa";
}

function render(papers, style = "apa") {
    const Cite = loadCitation();
    const items = (Array.isArray(papers) ? papers : [papers]).filter(Boolean).map(toCsl);
    const cite = new Cite(items);
    const template = normalizeStyle(style);
    return Object.freeze({
        style: template,
        bibliography: cite.format("bibliography", {format: "text", template, lang: "en-US"}).trim(),
        citation: cite.format("citation", {format: "text", template, lang: "en-US"}).trim(),
        bibtex: cite.format("bibtex").trim(),
        cslJson: Object.freeze(items)
    });
}

module.exports = {toCsl, render, normalizeStyle};
