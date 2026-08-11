"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const {StudDocumentRuntime, sha256} = require(path.join(ROOT, "src/classes/workspaces/studDocumentRuntime.class.js"));
const Ipc = require(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"));

let passed = 0;
function check(name, fn) { Promise.resolve().then(fn).then(() => { passed += 1; console.log(`${name}: PASS`); }).catch(error => { console.error(`${name}: FAIL`); throw error; }); }
function sync(name, fn) { fn(); passed += 1; console.log(`${name}: PASS`); }
function fakePdf(pages) { return {getDocument: () => ({promise: Promise.resolve({numPages: pages.length, getPage: async number => ({getTextContent: async () => ({items: pages[number - 1].split(" ").map(str => ({str}))})})})})}; }
function ipcMock() { const handlers = new Map(); return {handlers, handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name)}; }

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-documents-"));
    try {
        const managed = {reference: "documents/document_0123456789abcdef.pdf", displayName: "synthetic-course-material.pdf", mimeType: "application/pdf", size: 1234, sha256: crypto.createHash("sha256").update("synthetic pdf bytes").digest("hex")};
        const runtime = new StudDocumentRuntime({readManagedPdf: reference => { assert.strictEqual(reference, managed.reference); return {reference, bytesBase64: Buffer.from("%PDF synthetic").toString("base64")}; }, loadPdfJs: async () => fakePdf([
            "Engineering force F = m a. DOI 10.1000/synthetic.2026.",
            "Humanities reading contains a bounded interpretive paragraph.",
            "Legal and criminology course material cites https://example.invalid/public.",
            "Social science methodology explains a synthetic survey sample.",
            "Lecture material includes no discipline-specific extraction assumption."
        ])});
        sync("DISCIPLINE_NEUTRAL_SCHEMA", () => assert.ok(Model.ENTITY_TYPES.includes("ACADEMIC_DOCUMENT") && Model.DOCUMENT_TYPES.includes("LEGAL_MATERIAL")));
        sync("CAPABILITIES_HONEST", () => { const caps = runtime.capabilities(); assert.strictEqual(caps.BUILTIN_PDF.status, "AVAILABLE"); assert.strictEqual(caps.DOCLING.status, "NOT_INSTALLED"); assert.strictEqual(caps.GROBID.status, "NOT_INSTALLED"); assert.strictEqual(caps.OCR.status, "NOT_INSTALLED"); });
        const extraction = await runtime.analyze({document: {managedReference: managed.reference}, requestId: "synthetic_document"});
        sync("BUILTIN_PDF_EXTRACTION", () => assert.strictEqual(extraction.status, "READY") && assert.strictEqual(extraction.pages.length, 5) && assert.ok(extraction.chunks.length >= 5));
        sync("PAGE_AND_CHUNK_HASHES", () => assert.ok(extraction.pages.every(page => page.textHash === sha256(page.text)) && extraction.chunks.every(chunk => chunk.contentHash === sha256(chunk.content))));
        sync("DIRECT_IDENTIFIER_OBSERVATIONS_ONLY", () => assert.ok(extraction.references.some(item => item.referenceType === "DOI") && extraction.references.some(item => item.referenceType === "URL") && extraction.sections.length === 0 && extraction.tables.length === 0));
        sync("NO_NETWORK_IN_RUNTIME", () => { const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studDocumentRuntime.class.js"), "utf8"); assert.ok(!/child_process|spawn\(|exec\(|fetch\(|https?:\/\//.test(source)); });

        const store = new StudAcademicStore({root, applicationVersion: "test"});
        const course = store.createEntity("COURSE", {title: "Synthetic multidisciplinary course"});
        const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Synthetic document review"});
        const paper = store.createEntity("RESEARCH_PAPER", {title: "Synthetic paper"});
        const resource = store.createEntity("RESOURCE", {title: "Synthetic course resource", type: "DOCUMENT", courseId: course.id, assignmentId: assignment.id});
        const saved = store.saveAcademicDocument(managed, {title: "Synthetic course material", documentType: "COURSE_MATERIAL", courseId: course.id, assignmentId: assignment.id, sourcePaperId: paper.id, sourceResourceId: resource.id});
        sync("EXPLICIT_GENERIC_DOCUMENT_IMPORT", () => assert.strictEqual(saved.document.entityType, "ACADEMIC_DOCUMENT") && saved.document.sourcePaperId === paper.id);
        const duplicate = store.saveAcademicDocument(managed, {title: "Should not duplicate"});
        sync("CHECKSUM_DEDUPLICATION", () => assert.strictEqual(duplicate.deduplicated, true));
        const persisted = store.persistDocumentExtraction(saved.document.id, extraction);
        sync("EXTRACTION_PERSISTENCE", () => assert.strictEqual(persisted.status, "READY") && persisted.pages === 5 && persisted.chunks >= 5);
        const context = store.documentContext(saved.document.id, {page: 1, chunkLimit: 50});
        sync("PAGE_PROVENANCE_CONTEXT", () => assert.strictEqual(context.pages[0].pageNumber, 1) && context.chunks.every(chunk => chunk.pageStart === 1));
        const search = store.searchDocumentChunks("Engineering force", {documentId: saved.document.id});
        sync("DOCUMENT_FTS_WITH_PAGE_PROVENANCE", () => assert.ok(search.length && search[0].pageStart === 1 && search[0].chunkId));
        const note = store.createDocumentNote({documentId: saved.document.id, chunkId: context.chunks[0].id});
        const revision = store.createDocumentRevision({documentId: saved.document.id, chunkId: context.chunks[0].id});
        sync("EXPLICIT_NOTE_AND_REVISION_PROMOTION", () => assert.ok(note.content.length && revision.sourceType === "ACADEMIC_DOCUMENT" && store.listProvenance("NOTE", note.id).some(item => item.field === "document.quote")));
        sync("COURSE_ASSIGNMENT_PAPER_RESOURCE_RELATIONSHIPS", () => { const relations = store.listRelationships("ACADEMIC_DOCUMENT", saved.document.id); assert.ok(relations.some(item => item.fromType === "COURSE") && relations.some(item => item.fromType === "ASSIGNMENT") && relations.some(item => item.fromType === "RESEARCH_PAPER") && relations.some(item => item.fromType === "RESOURCE")); });

        const noTextRuntime = new StudDocumentRuntime({readManagedPdf: () => ({bytesBase64: Buffer.from("%PDF").toString("base64")}), loadPdfJs: async () => fakePdf([""])});
        const noText = await noTextRuntime.analyze({document: {managedReference: managed.reference}, requestId: "image_only"});
        sync("OCR_UNAVAILABLE_IS_HONEST", () => assert.strictEqual(noText.status, "OCR_REQUIRED"));
        const cancelledRuntime = new StudDocumentRuntime({readManagedPdf: () => ({bytesBase64: Buffer.from("%PDF").toString("base64")}), loadPdfJs: async () => fakePdf(["delayed page"])});
        cancelledRuntime.cancel("before");
        sync("CANCELLATION_API_BOUNDED", () => assert.deepStrictEqual(cancelledRuntime.cancel("missing"), {cancelled: false}));

        for (let index = 0; index < 500; index += 1) {
            const document = store.createEntity("ACADEMIC_DOCUMENT", {title: `Synthetic scale document ${index}`, documentType: "REPORT", extractionStatus: "NOT_ANALYZED"});
            const bulk = {status: "READY", engine: "PDFJS_BUILT_IN", pageCount: 1, pages: [{pageNumber: 1, text: `scale document ${index}`, textHash: sha256(`scale document ${index}`)}], chunks: Array.from({length: 40}, (_item, ordinal) => { const content = `scale ${index} bounded chunk ${ordinal}`; return {id: `${index}_${ordinal}`, pageStart: 1, pageEnd: 1, chunkType: "TEXT", content, contentHash: sha256(content)}; }), references: [], warnings: []};
            store.persistDocumentExtraction(document.id, bulk);
        }
        sync("SCALE_500_DOCUMENTS_20000_CHUNKS", () => assert.ok(store.searchDocumentChunks("bounded chunk", {limit: 100}).length === 100));

        const ipc = ipcMock();
        const registration = Ipc.registerStudAcademicIpc({ipc, app: {getPath: () => path.join(root, "ipc"), getVersion: () => "test"}, researchRuntime: {readManagedPdf: () => ({bytesBase64: Buffer.from("%PDF").toString("base64")}), chooseAndImportPdf: async () => ({cancelled: true}), dispose: () => {}, status: () => ({})}, documentRuntime: runtime, lmsRuntime: {dispose: () => {}}});
        const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/index.html"}};
        const capsResponse = await ipc.handlers.get("stud-document-capabilities")(trusted, {});
        sync("NARROW_TYPED_DOCUMENT_IPC", () => assert.strictEqual(capsResponse.ok, true) && ipc.handlers.has("stud-document-analyze") && !Ipc.CHANNELS.includes("stud-document-shell"));
        const contextResponse = await ipc.handlers.get("stud-document-context")(trusted, {documentId: "stud_academic_document_missing"});
        sync("CONTEXT_IPC_SEPARATES_IDENTIFIER_FROM_OPTIONS", () => assert.strictEqual(contextResponse.code, "NOT_FOUND"));
        registration.dispose();
        store.close();
        console.log(`STUD_DOCUMENT_INTELLIGENCE: ${passed} checks passed`);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
