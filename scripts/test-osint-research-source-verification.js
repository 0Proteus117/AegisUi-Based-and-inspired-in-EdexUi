#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const Source = require(path.join(ROOT, "src/classes/workspaces/osintResearchSourceVerification.class.js"));
const Registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const Runtime = require(path.join(ROOT, "src/classes/workspaces/osintProviderRuntime.class.js"));
const Adapters = require(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}
function response(payload, status = 200) {
    return {ok: status >= 200 && status < 300, status, headers: {get: () => null}, json: async () => payload};
}
function rejects(label, callback, expected = "INVALID_INPUT") {
    try { callback(); check(label, false, "accepted invalid input"); }
    catch (error) { check(label, error && error.code === expected, error && error.code || "untyped error"); }
}

async function main() {
    const url = Source.normalizeUrl("https://example.org/research/report?edition=synthetic#fragment");
    check("RESEARCH_VALID_URL", url.sourceType === "URL" && url.normalizedUrl === "https://example.org/research/report?edition=synthetic" && url.hostname === "example.org");
    [
        "file:///tmp/report.pdf", "javascript:alert(1)", "https://localhost/report", "https://127.0.0.1/report",
        "https://192.168.1.2/report", "https://user:pass@example.org/report", "https://example.org,example.net", "https://[::1]/report"
    ].forEach((value, index) => rejects(`RESEARCH_REJECTED_URL_${index + 1}`, () => Source.normalizeUrl(value)));

    const doi = Source.normalizeDoi("https://doi.org/10.5555/SYNTHETIC.42");
    check("RESEARCH_VALID_DOI", doi.sourceType === "DOI" && doi.identifiers.doi === "10.5555/synthetic.42" && doi.normalizedUrl === "https://doi.org/10.5555/synthetic.42");
    ["doi:invalid", "10.12/no", "https://example.org/not-a-doi"].forEach((value, index) => rejects(`RESEARCH_REJECTED_DOI_${index + 1}`, () => Source.normalizeDoi(value)));

    const pdfText = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n2 0 obj << /Type /Page /Title (Synthetic Report) /Author (Aegis Research) /Creator (Safe Test) >> endobj\n%%EOF";
    const pdfBytes = Buffer.from(pdfText, "utf8");
    const pdf = await Source.inspectPdf({name: "Synthetic Report.pdf", type: "application/pdf", bytes: pdfBytes});
    check("RESEARCH_LOCAL_PDF_METADATA", pdf.sourceType === "LOCAL_PDF" && pdf.localFileMetadata.displayLabel === "Synthetic Report.pdf" && pdf.localFileMetadata.title === "Synthetic Report" && pdf.localFileMetadata.pageCount === 1);
    check("RESEARCH_SHA256_CORRECT", pdf.localFileMetadata.originalDocumentHash === crypto.createHash("sha256").update(pdfBytes).digest("hex"));
    await Source.inspectPdf({name: "not-a-pdf.txt", type: "text/plain", bytes: Buffer.from("not a PDF")})
        .then(() => check("RESEARCH_REJECTS_UNSUPPORTED_FILE", false, "accepted unsupported file"))
        .catch(error => check("RESEARCH_REJECTS_UNSUPPORTED_FILE", error && error.code === "UNSUPPORTED", error && error.code || "untyped error"));

    const crossrefProvider = Registry.getProvider("crossref-works");
    const localProvider = Registry.getProvider("local-pdf-inspection");
    check("RESEARCH_CROSSREF_PROVIDER", crossrefProvider && crossrefProvider.runtimeAdapter === "CROSSREF_WORKS" && crossrefProvider.capabilities.includes("SOURCE_VERIFICATION"));
    check("RESEARCH_LOCAL_PDF_PROVIDER", localProvider && localProvider.runtimeAdapter === "LOCAL_TOOL" && localProvider.providerType === "LOCAL_TOOL" && !localProvider.launchAllowed);
    const requestedUrls = [];
    const adapter = new Adapters.CrossrefWorksAdapter(crossrefProvider, {fetchImpl: async requestUrl => {
        requestedUrls.push(requestUrl);
        return response({message: {title: ["Synthetic DOI Record"], publisher: "Synthetic Press", author: [{given: "Alex", family: "Example"}], issued: {"date-parts": [[2025, 4, 18]]}, "container-title": ["Synthetic Journal"], type: "journal-article", URL: "https://doi.org/10.5555/synthetic.42"}});
    }});
    const context = Runtime.createQueryContext({providerId: crossrefProvider.id, capability: "SOURCE_VERIFICATION", userInitiated: true, networkAllowed: true});
    const crossref = await adapter.query(doi, context);
    check("RESEARCH_CROSSREF_FIXED_ENDPOINT", requestedUrls.length === 1 && requestedUrls[0] === `${Adapters.CROSSREF_WORKS_ENDPOINT}${encodeURIComponent(doi.identifiers.doi)}`);
    check("RESEARCH_CROSSREF_NORMALIZED", crossref.status === "SUCCESS" && crossref.data.metadata.title === "Synthetic DOI Record" && crossref.data.metadata.authors[0] === "Alex Example" && crossref.rawAvailable === false && !Object.prototype.hasOwnProperty.call(crossref, "raw"));
    const partial = new Adapters.CrossrefWorksAdapter(crossrefProvider, {fetchImpl: async () => response({message: {title: [], author: []}})});
    const partialResult = await partial.query(doi, Runtime.createQueryContext({providerId: crossrefProvider.id, capability: "SOURCE_VERIFICATION", userInitiated: true, networkAllowed: true}));
    check("RESEARCH_CROSSREF_PARTIAL", partialResult.status === "PARTIAL" && partialResult.data.metadata.title === null);
    const malformed = new Adapters.CrossrefWorksAdapter(crossrefProvider, {fetchImpl: async () => response({message: "invalid"})});
    try { await malformed.query(doi, Runtime.createQueryContext({providerId: crossrefProvider.id, capability: "SOURCE_VERIFICATION", userInitiated: true, networkAllowed: true})); check("RESEARCH_CROSSREF_MALFORMED", false, "accepted malformed response"); }
    catch (error) { check("RESEARCH_CROSSREF_MALFORMED", error && error.code === "NORMALIZATION_FAILED", error && error.code || "untyped error"); }
    const cancelledController = new AbortController();
    cancelledController.abort();
    try { await adapter.query(doi, Runtime.createQueryContext({providerId: crossrefProvider.id, capability: "SOURCE_VERIFICATION", userInitiated: true, networkAllowed: true, abortController: cancelledController})); check("RESEARCH_CROSSREF_CANCELLATION", false, "query was not cancelled"); }
    catch (error) { check("RESEARCH_CROSSREF_CANCELLATION", error && error.code === "CANCELLED", error && error.code || "untyped error"); }

    const sourceContext = Source.createSourceContext({source: doi, metadata: crossref.data.metadata, providerObservations: [{providerId: crossrefProvider.id, providerName: "Crossref", type: "FIXED_PUBLIC_API", observedAt: crossref.completedAt, status: crossref.status, summary: "Synthetic provider observation."}], excerpt: "Synthetic short excerpt.", excerptLocation: "p. 4", claimRelationship: "CONTEXT", analystObservation: "Synthetic analyst note."});
    check("RESEARCH_FIELD_PROVENANCE", sourceContext.fieldProvenance.some(item => item.field === "TITLE" && item.source === "CROSSREF") && sourceContext.verificationStatus === "METADATA_AVAILABLE");
    const evidenceData = Source.toEvidenceData(sourceContext, "Synthetic analyst note.");
    const normalized = {providerId: crossrefProvider.id, capability: "SOURCE_VERIFICATION", status: "SUCCESS", queriedAt: sourceContext.createdAt, completedAt: sourceContext.updatedAt, summary: "Synthetic source context.", data: evidenceData, warnings: [], source: {provider: "Crossref", type: "NORMALIZED_SOURCE_CONTEXT"}, confidence: sourceContext.confidence};
    const sanitized = Model.sanitizeNormalizedResult(normalized);
    check("RESEARCH_EVIDENCE_SANITIZED", sanitized.data.research && sanitized.data.research.doi === doi.identifiers.doi && !Object.prototype.hasOwnProperty.call(sanitized.data, "raw"));
    const redacted = Model.createProviderEvidence({caseId: "case-research8", normalizedResult: normalized, draft: {title: "Synthetic source", summary: "Synthetic evidence.", tags: ["research"], redactions: ["data.research.normalizedUrl", "data.research.excerpt", "data.research.analystObservation"]}});
    check("RESEARCH_EVIDENCE_REDACTION", !Object.prototype.hasOwnProperty.call(redacted.data.research, "normalizedUrl") && !Object.prototype.hasOwnProperty.call(redacted.data.research, "excerpt") && /^[a-f0-9]{64}$/.test(redacted.integrity.value));
    const localContext = Source.createSourceContext({source: pdf, providerObservations: [{providerId: localProvider.id, providerName: "Local PDF Inspection", type: "EXPLICIT_LOCAL_DOCUMENT", observedAt: new Date().toISOString(), status: "LOCAL", summary: "Synthetic local observation."}]});
    const localEvidence = Source.toEvidenceData(localContext);
    const localCreated = Model.createProviderEvidence({caseId: "case-localpdf8", normalizedResult: {...normalized, providerId: localProvider.id, data: localEvidence}, draft: {title: "Synthetic local PDF", summary: "Metadata only.", tags: ["pdf"], redactions: ["data.research.localDocument.displayLabel"]}});
    check("RESEARCH_LOCAL_EVIDENCE_NO_PATH", localCreated.acquisitionMethod === "LOCAL_DOCUMENT_INSPECTION" && !JSON.stringify(localCreated).includes("/Users/") && !Object.prototype.hasOwnProperty.call(localCreated.data.research.localDocument, "displayLabel"));

    const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    const sourceCode = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintResearchSourceVerification.class.js"), "utf8");
    const adapterCode = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintProviderAdapters.class.js"), "utf8");
    const ui = fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8");
    const styles = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
    check("RESEARCH_EXPLICIT_ARCHIVE_ONLY", /CHECK ARCHIVE/.test(manager) && /beginOSINTResearchArchiveCheck/.test(manager) && /archiveMarkup/.test(manager));
    check("RESEARCH_NO_STORAGE_OR_IPC", !/localStorage|sessionStorage|indexedDB|ipc\.invoke|fs\.write|child_process/.test(sourceCode));
    check("RESEARCH_NO_GENERIC_PROXY", !/forwardUrl|arbitraryUrl|renderer.*headers|generic.*proxy/i.test(adapterCode));
    check("RESEARCH_NO_NEW_IPC", !/ipc\.invoke\(\s*["']osint-research-|ipcMain\.handle\(\s*["']osint-research-/.test(manager));
    check("RESEARCH_UI_LOAD_ORDER", ui.indexOf("osintResearchSourceVerification.class.js") < ui.indexOf("osintProviderAdapters.class.js"));
    const contentRule = styles.match(/\.engineering-mode \.osint-research-input \.workspace-panel-content,[\s\S]*?\.engineering-mode \.osint-research-policy \.workspace-panel-content\s*\{([\s\S]*?)\n\}/);
    check("RESEARCH_LAYOUT_NORMAL_FLOW", Boolean(contentRule) && /position:\s*relative/.test(contentRule[1]) && /inset:\s*auto/.test(contentRule[1]) && /min-height:\s*min-content/.test(contentRule[1]) && /Dynamic result bodies[\s\S]*?grid-template-rows:\s*auto auto/.test(styles) && /osint-research-header/.test(styles));
    check("RESEARCH_COMPACT_CONTENT_SIZED", /osint-research-context \.workspace-panel-content,[\s\S]*?grid-auto-rows:\s*max-content/.test(styles) && /osint-research-excerpt \.workspace-panel-content/.test(styles) && /grid-template-rows:\s*repeat\(5, max-content\)/.test(styles) && /grid-template-rows:\s*repeat\(9, max-content\)/.test(styles));
    check("RESEARCH_PREVIEW_REDACTIONS", manager.includes("RESEARCH / NORMALIZED URL") && manager.includes("RESEARCH / DOCUMENT DISPLAY LABEL") && manager.includes("RESEARCH / ANALYST OBSERVATION"));
    check("RESEARCH_NO_AUTOMATIC_URL_FETCH", !/fetch\(/.test(sourceCode) && /state\.sourceKind === "URL"/.test(manager));
    console.log(`OSINT_RESEARCH_SOURCE_VERIFICATION: ${failures.length ? "FAIL" : "OK"}`);
}

main().catch(error => {
    failures.push(error.stack || error.message);
    console.error(error.stack || error.message);
}).finally(() => {
    if (failures.length) {
        failures.forEach(item => console.error(`- ${item}`));
        process.exitCode = 1;
    }
});
