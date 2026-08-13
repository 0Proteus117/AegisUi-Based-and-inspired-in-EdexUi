"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const Ipc = require(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"));

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`${name}: PASS`); }
function ipcMock() { const handlers = new Map(); return {handlers, handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name)}; }

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-intelligence-"));
    try {
        const store = new StudAcademicStore({root, applicationVersion: "test"});
        const engineering = store.createEntity("COURSE", {title: "Control systems and thermodynamics"});
        const humanities = store.createEntity("COURSE", {title: "Literature, language and cultural criticism"});
        const law = store.createEntity("COURSE", {title: "Criminology, legislation and case law"});
        const social = store.createEntity("COURSE", {title: "Social research methodology and survey datasets"});
        const assignment = store.createEntity("ASSIGNMENT", {courseId: engineering.id, title: "Control system stability report", description: "Evaluate stability, transfer functions and thermal response with supporting material."});
        const resource = store.createEntity("RESOURCE", {courseId: engineering.id, assignmentId: assignment.id, title: "Transfer function lecture material", type: "DOCUMENT"});
        const note = store.createEntity("NOTE", {courseId: engineering.id, assignmentId: assignment.id, title: "Stability revision note", content: "Transfer function stability requires evidence from local lecture material."});
        const paper = store.createEntity("RESEARCH_PAPER", {title: "Bounded control systems report", abstract: "A report about stability and thermal response."});
        const document = store.createEntity("ACADEMIC_DOCUMENT", {courseId: engineering.id, assignmentId: assignment.id, title: "Control systems course material", documentType: "COURSE_MATERIAL", extractionStatus: "READY"});
        store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_RESOURCE", toType: "RESOURCE", toId: resource.id, source: "USER"});
        store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
        store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_DOCUMENT", toType: "ACADEMIC_DOCUMENT", toId: document.id, source: "USER"});
        store.createRelationship({fromType: "NOTE", fromId: note.id, relationType: "CITES", toType: "RESEARCH_PAPER", toId: paper.id, source: "USER"});
        const extraction = {status: "READY", engine: "PDFJS_BUILT_IN", pageCount: 2, warnings: [], pages: [{pageNumber: 1, text: "Control systems stability and transfer function analysis.", textHash: "a".repeat(64)}, {pageNumber: 2, text: "Thermal response validates engineering evidence.", textHash: "b".repeat(64)}], chunks: [{pageStart: 1, pageEnd: 1, chunkType: "TEXT", content: "Control systems stability transfer function", contentHash: "c".repeat(64)}, {pageStart: 2, pageEnd: 2, chunkType: "TEXT", content: "Thermal response evidence", contentHash: "d".repeat(64)}], references: []};
        store.persistDocumentExtraction(document.id, extraction);

        check("SCHEMA_V11_MIGRATES_CONTEXT_TABLES", () => { assert.strictEqual(store.schemaInfo().version, 11); assert.ok(Model.CONTEXT_RELATION_STATUSES.includes("SUGGESTED")); });
        const context = store.buildAcademicContext("ASSIGNMENT", assignment.id, {limit: 80});
        check("ASSIGNMENT_CONTEXT_DERIVES_DIRECT_AND_DERIVED", () => { assert.ok(context.candidates.some(item => item.entityId === document.id && item.relationStatus === "DIRECT")); assert.ok(context.candidates.some(item => item.entityId === engineering.id && item.relationStatus === "DERIVED")); });
        check("EXPLAINABLE_RELEVANCE_HAS_REASONS", () => assert.ok(context.candidates.every(item => item.reasons.length && !item.reasons.some(reason => /AI understands/i.test(reason)))));
        check("LOCAL_CONCEPTS_RETAIN_PROVENANCE", () => assert.ok(context.concepts.length && context.concepts.some(item => item.provenance.entityId)));
        check("DISCIPLINE_NEUTRAL_FIXTURES_SHARE_CORE_MODEL", () => [humanities, law, social].forEach(course => { const item = store.buildAcademicContext("COURSE", course.id); assert.strictEqual(item.root.entityType, "COURSE"); }));
        check("COVERAGE_DOES_NOT_CLAIM_TRUTH", () => { assert.ok(context.coverage.message); assert.ok(context.coverage.concepts.every(item => ["SUPPORTED", "UNRESOLVED"].includes(item.coverage))); });
        check("NOTE_SUPPORT_IS_PROVENANCE_AWARE", () => assert.ok(context.coverage.sourceSupport.some(item => item.noteId === note.id && item.status === "SOURCE_LINKED")));
        const decision = store.decideAcademicContext("ASSIGNMENT", assignment.id, "RESOURCE", resource.id, "PIN", "Explicit study priority");
        check("MANUAL_DECISION_PERSISTS_AND_PRECEDES_SUGGESTION", () => { assert.strictEqual(decision.decision, "PIN"); assert.strictEqual(store.buildAcademicContext("ASSIGNMENT", assignment.id).candidates.find(item => item.entityId === resource.id).decision, "PIN"); });
        const excluded = store.decideAcademicContext("ASSIGNMENT", assignment.id, "NOTE", note.id, "EXCLUDE");
        check("EXCLUDE_IS_EXPLICIT_AND_NOT_A_DELETE", () => { const context = store.buildAcademicContext("ASSIGNMENT", assignment.id); assert.strictEqual(excluded.decision, "EXCLUDE"); assert.ok(store.getEntity("NOTE", note.id)); assert.ok(!context.candidates.some(item => item.entityId === note.id)); assert.ok(context.excludedCandidates.some(item => item.entityId === note.id)); });
        const search = store.searchAcademicContext("ASSIGNMENT", assignment.id, "stability", {scope: "CONTEXT"});
        check("CONTEXT_SEARCH_RETURNS_EXPLANATION", () => assert.ok(search.length && search.every(item => item.relationshipToContext && item.relevanceReason.length)));
        const packageResult = store.createAcademicContextPackage("ASSIGNMENT", assignment.id, {});
        check("CONTEXT_PACKAGE_IS_INSPECTABLE_AND_BOUNDED", () => { assert.ok(packageResult.snapshot.policy.offline && !packageResult.snapshot.policy.llmInvoked); assert.ok(packageResult.snapshot.chunks.length <= 80); assert.ok(store.listAcademicContextPackages("ASSIGNMENT", assignment.id).length); });
        check("NO_PROVIDER_OR_EXECUTION_IN_INTELLIGENCE_RUNTIME", () => { const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIntelligence.class.js"), "utf8"); assert.ok(!/fetch\(|https?:\/\/|child_process|spawn\(|exec\(|process\.env/.test(source)); });
        check("GRAPH_IS_BOUNDED_AND_MARKS_SUGGESTIONS", () => { assert.ok(context.graph.nodes.length <= 40 && context.graph.edges.length <= 80); assert.ok(context.graph.edges.every(edge => ["DIRECT", "SUGGESTED"].includes(edge.status))); });
        // Populate the scale fixture in one local SQLite transaction. It
        // exercises the intended 50/500/20k shape without turning the test
        // into 20k separate application-level transactions.
        const stamp = Model.now();
        store.transaction(() => {
            const courseInsert = store.db.prepare("INSERT INTO stud_courses (id,title,status,created_at,updated_at) VALUES (?,?,?,?,?)");
            const assignmentInsert = store.db.prepare("INSERT INTO stud_assignments (id,course_id,title,status,submission_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
            const documentInsert = store.db.prepare("INSERT INTO stud_academic_documents (id,title,document_type,extraction_status,created_at,updated_at) VALUES (?,?,?,?,?,?)");
            const conceptInsert = store.db.prepare("INSERT INTO stud_academic_concepts (id,term,normalized_term,created_at,updated_at) VALUES (?,?,?,?,?)");
            const observationInsert = store.db.prepare("INSERT INTO stud_concept_observations (id,concept_id,entity_type,entity_id,chunk_id,extraction_method,confidence,created_at) VALUES (?,?,?,?,?,?,?,?)");
            const courseIds = Array.from({length: 50}, (_value, index) => `stud_course_scale_${String(index).padStart(3, "0")}`);
            courseIds.forEach((id, index) => courseInsert.run(id, `Scale course ${index}`, "ACTIVE", stamp, stamp));
            for (let index = 0; index < 500; index += 1) {
                const assignmentId = `stud_assignment_scale_${String(index).padStart(3, "0")}`;
                const documentId = `stud_academic_document_scale_${String(index).padStart(3, "0")}`;
                assignmentInsert.run(assignmentId, courseIds[index % courseIds.length], `Scale assignment ${index}`, "NOT_STARTED", "UNKNOWN", stamp, stamp);
                documentInsert.run(documentId, `Scale document ${index}`, "REPORT", "READY", stamp, stamp);
            }
            for (let concept = 0; concept < 50; concept += 1) conceptInsert.run(`stud_academic_concept_scale_${String(concept).padStart(3, "0")}`, `scaleconcept${concept}`, `scaleconcept${concept}`, stamp, stamp);
            for (let observation = 0; observation < 20000; observation += 1) observationInsert.run(`stud_concept_observation_scale_${String(observation).padStart(5, "0")}`, `stud_academic_concept_scale_${String(observation % 50).padStart(3, "0")}`, "ACADEMIC_DOCUMENT", `stud_academic_document_scale_${String(observation % 500).padStart(3, "0")}`, `scale_chunk_${observation}`, "DOCUMENT_CHUNK", "LOW", stamp);
        });
        const scale = store.buildAcademicContext("ASSIGNMENT", assignment.id, {limit: 80});
        check("SCALE_50_500_20000_REMAINS_BOUNDED", () => assert.ok(scale.candidates.length <= 80 && scale.concepts.length <= 120));

        const ipc = ipcMock();
        const registration = Ipc.registerStudAcademicIpc({ipc, store, app: {getPath: () => path.join(root, "ipc"), getVersion: () => "test"}, researchRuntime: {readManagedPdf: () => ({bytesBase64: ""}), chooseAndImportPdf: async () => ({cancelled: true}), dispose: () => {}, status: () => ({})}, documentRuntime: {capabilities: () => ({}), dispose: () => {}}, lmsRuntime: {dispose: () => {}}});
        const trusted = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/index.html"}};
        const result = await ipc.handlers.get("stud-academic-context-build")(trusted, {rootType: "ASSIGNMENT", rootId: assignment.id, options: {limit: 10}});
        check("TYPED_IPC_IS_NARROW_AND_LOCAL", () => { assert.strictEqual(result.ok, true); assert.ok(Ipc.CHANNELS.includes("stud-academic-context-package-create")); assert.ok(!Ipc.CHANNELS.some(channel => /llm|shell|proxy|provider/.test(channel))); });
        registration.dispose(); store.close();
        console.log(`STUD_ACADEMIC_INTELLIGENCE: ${passed} checks passed`);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
