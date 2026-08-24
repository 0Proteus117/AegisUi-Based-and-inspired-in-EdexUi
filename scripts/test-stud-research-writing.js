#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Research = require("../src/classes/workspaces/studResearchModel.class.js");
const {StudResearchRuntime, ENDPOINTS, MAX_PDF_BYTES, PDF_CANDIDATE_TTL_MS, MAX_PDF_CANDIDATES} = require("../src/classes/workspaces/studResearchRuntime.class.js");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {registerStudAcademicIpc} = require("../src/classes/workspaces/studAcademicIpc.class.js");
const Citations = require("../src/classes/workspaces/studCitationService.class.js");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
function check(name, work) { return Promise.resolve().then(work).then(() => { passed += 1; console.log(`${name}: PASS`); }); }
function response(body, status = 200, headers = {"content-type": "application/json"}) {
    return {ok: status >= 200 && status < 300, status, headers: {get: key => headers[String(key).toLowerCase()] || null}, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from(body)};
}
function syntheticTextPdf(text = "Synthetic academic PDF text") {
    const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, value => `\\${value}`)}) Tj ET`;
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    ];
    let output = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(output);
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(output);
}

(async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase3-"));
    try {
        const openAlexFixture = {results: [{id: "https://openalex.org/W123", title: "Synthetic Involute Research", type: "article", publication_year: 2026, publication_date: "2026-08-11", doi: "https://doi.org/10.5555/SYNTHETIC", authorships: [{author: {display_name: "Ada Example"}}], primary_location: {source: {display_name: "Synthetic Mechanics Journal"}, landing_page_url: "https://example.org/paper"}, abstract_inverted_index: {Bounded: [0], abstract: [1]}, cited_by_count: 4, referenced_works_count: 8, open_access: {is_oa: true, oa_status: "gold", oa_url: "https://example.org/paper"}}]};
        const calls = [];
        const fetchMock = async (url, options) => { calls.push({url: String(url), options}); return response(openAlexFixture); };
        const runtime = new StudResearchRuntime({root: temp, fetch: fetchMock, env: {AEGISUI_OPENALEX_API_KEY: "private-test-key", AEGISUI_UNPAYWALL_EMAIL: "private@example.invalid"}});

        await check("DOI_NORMALIZATION", () => assert.strictEqual(Research.normalizeDoi("https://doi.org/10.5555/ABC"), "10.5555/abc"));
        await check("OPENALEX_NORMALIZATION", () => {
            const paper = Research.normalizeOpenAlexWork(openAlexFixture.results[0]);
            assert.strictEqual(paper.openAlexId, "W123"); assert.strictEqual(paper.authors[0].displayName, "Ada Example"); assert.strictEqual(paper.abstract, "Bounded abstract");
        });
        await check("OPENALEX_BOUNDED_FIXED_ENDPOINT", async () => {
            const result = await runtime.searchOpenAlex({query: "involute gears", limit: 99, requestId: "search1"});
            assert.strictEqual(result.length, 1); assert.ok(calls[0].url.startsWith(ENDPOINTS.OPENALEX)); assert.ok(calls[0].url.includes("per-page=25")); assert.strictEqual(calls[0].options.method, "GET");
        });
        await check("OPENALEX_CONFIG_REQUIRED", async () => {
            const unavailable = new StudResearchRuntime({root: temp, fetch: fetchMock, env: {}});
            await assert.rejects(() => unavailable.searchOpenAlex({query: "test", requestId: "x"}), error => error.code === "CONFIG_REQUIRED");
        });
        await check("PROVIDER_FAILURES_ARE_TYPED", async () => {
            const limited = new StudResearchRuntime({root: temp, fetch: async () => response({}, 429), env: {AEGISUI_OPENALEX_API_KEY: "test"}});
            await assert.rejects(() => limited.searchOpenAlex({query: "test", requestId: "rate"}), error => error.code === "RATE_LIMITED");
            const malformed = new StudResearchRuntime({root: temp, fetch: async () => ({ok: true, status: 200, text: async () => "{bad", headers: {get: () => "application/json"}}), env: {AEGISUI_OPENALEX_API_KEY: "test"}});
            await assert.rejects(() => malformed.searchOpenAlex({query: "test", requestId: "malformed"}), error => error.code === "MALFORMED_PROVIDER_RESPONSE");
        });
        await check("CROSSREF_NORMALIZATION", () => {
            const paper = Research.normalizeCrossrefWork({message: {DOI: "10.5555/ABC", title: ["Crossref title"], author: [{given: "Grace", family: "Hopper"}], issued: {"date-parts": [[2025, 4, 2]]}, type: "journal-article"}});
            assert.strictEqual(paper.title, "Crossref title"); assert.strictEqual(paper.doi, "10.5555/abc"); assert.strictEqual(paper.authors[0].displayName, "Grace Hopper");
        });
        await check("DATACITE_RESEARCH_OBJECT", () => {
            const paper = Research.normalizeDataCiteWork({data: {id: "10.5555/data", attributes: {doi: "10.5555/data", titles: [{title: "Dataset"}], creators: [{name: "Data Author"}], publicationYear: 2024, publisher: "Repository", types: {resourceTypeGeneral: "Dataset"}}}});
            assert.strictEqual(paper.objectType, "DATASET"); assert.strictEqual(paper.publisher, "Repository");
        });
        await check("UNPAYWALL_LEGAL_LOCATION", () => {
            const oa = Research.normalizeUnpaywall({doi: "10.5555/abc", is_oa: true, oa_status: "green", best_oa_location: {url_for_landing: "https://repo.example/item", url_for_pdf: "https://repo.example/item.pdf", host_type: "repository", version: "acceptedVersion", license: "cc-by"}});
            assert.strictEqual(oa.isOpenAccess, true); assert.ok(oa.bestLocation.pdfUrl.startsWith("https://"));
        });
        await check("CANONICAL_DEDUP_PROVENANCE", () => {
            const store = new StudAcademicStore({root: path.join(temp, "store"), applicationVersion: "2.6.3"});
            const crossref = Research.normalizeCrossrefWork({message: {DOI: "10.5555/abc", title: ["Canonical title"], author: [{given: "Ada", family: "Example"}], issued: {"date-parts": [[2026]]}, type: "journal-article"}});
            const first = store.saveResearchObservation(crossref, {source: "CROSSREF"});
            const second = store.saveResearchObservation(crossref, {source: "CROSSREF"});
            assert.strictEqual(second.deduplicated, true); assert.strictEqual(first.paper.id, second.paper.id); assert.strictEqual(store.researchContext(first.paper.id).provenance.length > 0, true); assert.ok(store.search("10.5555/abc").length); store.close();
        });
        await check("STRUCTURED_NOTE_SANITIZATION", () => {
            const safe = Research.sanitizeNoteDocument({type: "doc", content: [{type: "paragraph", content: [{type: "text", text: "Academic note", marks: [{type: "bold"}, {type: "script", attrs: {src: "evil"}}]}]}, {type: "script"}]});
            assert.strictEqual(safe.plainText, "Academic note"); assert.strictEqual(safe.document.content.length, 1); assert.strictEqual(safe.document.content[0].content[0].marks.length, 1);
        });
        await check("PDF_SELECTION_PROVENANCE", () => {
            const store = new StudAcademicStore({root: path.join(temp, "selection-store"), applicationVersion: "2.6.3"});
            const saved = store.saveResearchObservation(Research.normalizeCrossrefWork({message: {DOI: "10.5555/selection", title: ["Selection source"], type: "journal-article"}}), {source: "CROSSREF"});
            const excerpt = "Bounded quote from a synthetic source document.";
            const hash = Research.sha256(Buffer.from(excerpt));
            const note = store.saveStructuredNote({title: "Quote provenance", document: {type: "doc", content: [{type: "blockquote", content: [{type: "paragraph", content: [{type: "text", text: excerpt}]}]}]}, paperIds: [saved.paper.id], selectionProvenance: {sourceType: "LOCAL_DOCUMENT", paperId: saved.paper.id, documentReference: "documents/synthetic.pdf", page: 4, selectionTextHash: hash, excerpt, createdAt: "2026-08-11T12:00:00.000Z"}});
            const provenance = store.listProvenance("NOTE", note.id);
            assert.strictEqual(provenance.length, 1); assert.strictEqual(provenance[0].sourceType, "LOCAL_EXTRACTION"); assert.ok(provenance[0].metadataJson.includes(hash)); store.close();
        });
        await check("CITATION_STYLES_LOCAL", () => {
            const output = Citations.render([{id: "paper", title: "Canonical title", authors: "Example, Ada", year: 2026, doi: "10.5555/abc", objectType: "ARTICLE"}], "harvard1");
            assert.ok(output.bibliography.includes("Canonical title")); assert.ok(output.bibtex.includes("10.5555/abc")); assert.strictEqual(output.style, "harvard1");
        });
        await check("PDF_EXPLICIT_MANAGED_COPY", () => {
            const source = path.join(temp, "selected.pdf"); fs.writeFileSync(source, syntheticTextPdf());
            const document = runtime.importPdfFromPath(source, "stud_research_paper_fixture"); const opened = runtime.readManagedPdf(document.reference);
            assert.ok(document.reference.startsWith("documents/")); assert.ok(!JSON.stringify(document).includes(source)); assert.ok(Buffer.from(opened.bytesBase64, "base64").subarray(0,5).toString() === "%PDF-"); assert.strictEqual(opened.sha256, document.sha256);
        });
        await check("PDF_SELECTOR_TO_STORE_CONTRACT", async () => {
            const source = path.join(temp, "selected-through-dialog.pdf"); fs.writeFileSync(source, syntheticTextPdf("Native selector contract"));
            const handlers = new Map();
            const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
            const registration = registerStudAcademicIpc({
                ipc,
                app: {getPath: () => path.join(temp, "ipc-user-data"), getVersion: () => "2.6.3"},
                dialog: {showOpenDialog: async () => ({canceled: false, filePaths: [source]})}
            });
            const event = {sender: {isDestroyed: () => false, getURL: () => "file:///synthetic/stud.html"}};
            const created = await handlers.get("stud-entity-create")(event, {entityType: "RESEARCH_PAPER", value: {title: "PDF selector contract", objectType: "ARTICLE", year: 2026}});
            const imported = await handlers.get("stud-paper-import-pdf")(event, {paperId: created.data.id});
            assert.strictEqual(imported.ok, true); assert.ok(imported.data.paper.localDocumentReference.startsWith("documents/"));
            assert.strictEqual(Object.hasOwn(imported.data.document, "cancelled"), false);
            registration.dispose();
        });
        await check("PDFJS_TEXT_EXTRACTION", async () => {
            const pdfjs = await import(path.join(ROOT, "src/node_modules/pdfjs-dist/legacy/build/pdf.mjs"));
            const document = await pdfjs.getDocument({data: new Uint8Array(syntheticTextPdf("Bounded PDF selection")), isEvalSupported: false, disableWorker: true}).promise;
            const page = await document.getPage(1); const content = await page.getTextContent();
            assert.strictEqual(document.numPages, 1); assert.ok(content.items.map(item => item.str).join(" ").includes("Bounded PDF selection"));
        });
        await check("PDF_REJECTS_NON_PDF_AND_TRAVERSAL", () => {
            const source = path.join(temp, "bad.pdf"); fs.writeFileSync(source, "not-pdf");
            assert.throws(() => runtime.importPdfFromPath(source), error => error.code === "INVALID_PDF"); assert.throws(() => runtime.readManagedPdf("../../private.pdf"), error => error.code === "POLICY_BLOCKED"); assert.strictEqual(MAX_PDF_BYTES, 40 * 1024 * 1024);
        });
        await check("OA_PDF_TOKENS_ARE_BOUNDED_AND_EXPIRE", async () => {
            const unavailable = new StudResearchRuntime({root: temp, fetch: null, env: {}});
            unavailable.fetch = null;
            unavailable.pdfCandidates.set("expired", {url: "https://example.invalid/paper.pdf", doi: "10.5555/expired", createdAt: Date.now() - PDF_CANDIDATE_TTL_MS - 1});
            await assert.rejects(() => unavailable.readOaPdf({pdfToken: "expired", requestId: "expired"}), error => error.code === "OFFLINE");
            const online = new StudResearchRuntime({root: temp, fetch: fetchMock, env: {}});
            online.pdfCandidates.set("expired", {url: "https://example.invalid/paper.pdf", doi: "10.5555/expired", createdAt: Date.now() - PDF_CANDIDATE_TTL_MS - 1});
            await assert.rejects(() => online.readOaPdf({pdfToken: "expired", requestId: "expired"}), error => error.code === "RESULT_EXPIRED");
            assert.strictEqual(PDF_CANDIDATE_TTL_MS, 15 * 60 * 1000); assert.strictEqual(MAX_PDF_CANDIDATES, 25);
        });
        await check("WORKSPACE_CANCELS_STALE_REQUESTS", () => {
            const renderer = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studResearchWorkspace.class.js"), "utf8");
            const commandCenter = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studCommandCenter.class.js"), "utf8");
            assert.ok(renderer.includes("requestGeneration")); assert.ok(renderer.includes("deactivate()")); assert.ok(commandCenter.includes("this.research.deactivate()"));
        });
        await check("ZOTERO_FIXED_LOCAL_READ_ONLY", () => { assert.strictEqual(ENDPOINTS.ZOTERO_LOCAL, "http://127.0.0.1:23119/api/"); assert.strictEqual(runtime.status().policies.ZOTERO_LOCAL.capability, "LOCAL_LIBRARY_READ"); });
        await check("NO_GENERIC_PROXY_OR_RAW_PERSISTENCE", () => {
            const runtimeSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studResearchRuntime.class.js"), "utf8"); const storeSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"), "utf8");
            assert.ok(!runtimeSource.includes("rendererHeaders")); assert.ok(!runtimeSource.includes("rendererMethod")); assert.ok(!storeSource.includes("rawProviderResponse")); assert.ok(runtimeSource.includes("ENDPOINTS"));
        });
        await check("RENDERER_PDF_AND_EDITOR_BOUNDARIES", () => {
            const renderer = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studResearchWorkspace.class.js"), "utf8");
            assert.ok(renderer.includes("pdfjs-dist/legacy/build/pdf.mjs"));
            assert.ok(renderer.includes("isEvalSupported: false"));
            assert.ok(renderer.includes("class StudBrowserStructuredEditor"));
            assert.ok(renderer.includes("getJSON()"));
            assert.ok(!renderer.includes("@tiptap/core"));
            assert.ok(!renderer.includes("require("));
            assert.ok(!renderer.includes("fetch("));
        });
        await check("LAYOUT_THEME_RESPONSIVE", () => {
            const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8"); assert.ok(css.includes("STUD Phase 3 research/writing")); assert.ok(css.includes("var(--aegis-surface)")); assert.ok(css.includes("stud-pdf-viewer")); assert.ok(css.includes("@media (max-width: 1230px)"));
        });
        runtime.dispose();
        console.log(`STUD_RESEARCH_WRITING: ${passed} checks passed`);
    } finally { fs.rmSync(temp, {recursive: true, force: true}); }
})().catch(error => { console.error(error); process.exit(1); });
