#!/usr/bin/env node
"use strict";

// Public-safe, deterministic end-to-end acceptance fixture.  It uses the
// production STUD store, document pipeline, Context Package and local-AI
// boundary; the client is deliberately local/fake so this regression never
// contacts a provider or depends on a model being installed.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "classes", "workspaces");
const {StudAcademicStore} = require(path.join(SRC, "studAcademicStore.class.js"));
const {StudDocumentRuntime, sha256} = require(path.join(SRC, "studDocumentRuntime.class.js"));
const {StudAcademicAssistantRuntime} = require(path.join(SRC, "studAcademicAssistantRuntime.class.js"));
const Citations = require(path.join(SRC, "studCitationService.class.js"));

let passed = 0;
async function check(name, fn) { await fn(); passed += 1; console.log(`${name}: PASS`); }
function fakePdf(pages) { return {getDocument: () => ({promise: Promise.resolve({numPages: pages.length, getPage: async number => ({getTextContent: async () => ({items: pages[number - 1].split(" ").map(str => ({str}))})})})})}; }
class LocalAcceptanceClient {
    async ensureModelAvailable(model) { return {ok: true, status: "READY", model}; }
    async chat() {
        return {ok: true, status: "READY", response: JSON.stringify({
            answer: "The reviewed local material supports a balanced argument: LLMs can assist learning activities, while governance, transparency and assessment design remain necessary.",
            claims: [{text: "The reviewed material describes both educational opportunities and governance limitations.", sourceRefs: ["S-1"]}],
            limitations: ["This acceptance response is limited to the reviewed local package."],
            followUpQuestions: ["Which institutional policy applies to the assessment?"]
        })};
    }
}

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase14-acceptance-"));
    try {
        const store = new StudAcademicStore({root, applicationVersion: "phase14-acceptance"});
        const course = store.createEntity("COURSE", {title: "Synthetic Higher Education Policy", code: "SYN-LLM-101"});
        const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Evaluate the opportunities and limitations of Large Language Models in higher education.", description: "Synthetic public-safe final acceptance assignment."});
        const sources = [
            {title: "Guidance for generative AI in education and research", objectType: "REPORT", year: 2023, publisher: "UNESCO", authors: "UNESCO", sourceUrl: "https://unesdoc.unesco.org/ark:/48223/pf0000386693"},
            {title: "ChatGPT for good? On opportunities and challenges of large language models for education", objectType: "ARTICLE", year: 2023, venue: "Learning and Individual Differences", authors: "Kasneci, Enkelejda; Sessler, Kathrin; Küchemann, Stefan; Bannert, Maria; Kasneci, Gjergji", doi: "10.1016/j.lindif.2023.102274", sourceUrl: "https://doi.org/10.1016/j.lindif.2023.102274"},
            {title: "What if the devil is my guardian angel: ChatGPT as a case study of using chatbots in education", objectType: "ARTICLE", year: 2023, venue: "Smart Learning Environments", authors: "Tlili, Ahmed; Shehata, Boulus; Adarkwah, Michael Agyemang; Bozkurt, Aras; Hickey, Daniel T.; Huang, Ronghuai; Agyemang, Brighter", doi: "10.1186/s40561-023-00237-x", sourceUrl: "https://doi.org/10.1186/s40561-023-00237-x"}
        ].map(value => store.createEntity("RESEARCH_PAPER", value));
        sources.forEach(paper => store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_PAPER", toType: "RESEARCH_PAPER", toId: paper.id, source: "USER"}));
        sources.slice(1).forEach(paper => store.createExternalIdentifier({entityType: "RESEARCH_PAPER", entityId: paper.id, namespace: "DOI", externalId: paper.doi, source: "PUBLIC_ACCEPTANCE_FIXTURE"}));

        const sourceText = "PUBLIC-SAFE ACCEPTANCE SOURCE MAP. UNESCO guidance identifies a need for human-centred governance and safeguards in education. Kasneci et al. discuss educational opportunities and challenges of large language models. Tlili et al. describe both potential and caution for ChatGPT in education. These concise statements are a synthetic local acceptance fixture pointing to the canonical public records; they are not copied article text.";
        const managed = {reference: "documents/phase14_public_source_map.pdf", displayName: "phase14-public-source-map.pdf", mimeType: "application/pdf", size: Buffer.byteLength(sourceText), sha256: crypto.createHash("sha256").update(sourceText).digest("hex")};
        const runtime = new StudDocumentRuntime({readManagedPdf: () => ({bytesBase64: Buffer.from("%PDF synthetic acceptance").toString("base64")}), loadPdfJs: async () => fakePdf([sourceText])});
        const document = store.saveAcademicDocument(managed, {title: "Phase 14 public-source map", documentType: "COURSE_MATERIAL", courseId: course.id, assignmentId: assignment.id, sourcePaperId: sources[0].id}).document;
        const extraction = await runtime.analyze({document: {managedReference: managed.reference}, requestId: "phase14_document"});
        const savedExtraction = store.persistDocumentExtraction(document.id, extraction);
        const documentContext = store.documentContext(document.id, {chunkLimit: 20});
        const note = store.createDocumentNote({documentId: document.id, chunkId: documentContext.chunks[0].id, title: "Acceptance evidence note"});
        const revision = store.createDocumentRevision({documentId: document.id, chunkId: documentContext.chunks[0].id, title: "Review LLM governance context"});

        await check("ASSIGNMENT_RESEARCH_DOCUMENT_NOTE_REVISION_CHAIN", () => assert.ok(savedExtraction.chunks > 0 && note.assignmentId === assignment.id && revision.sourceType === "ACADEMIC_DOCUMENT"));
        const context = store.buildAcademicContext("ASSIGNMENT", assignment.id, {refreshConcepts: true});
        await check("CONTEXT_IS_LOCAL_EXPLAINABLE_AND_OFFLINE", () => assert.strictEqual(context.policy.providersInvoked, false) && assert.strictEqual(context.policy.llmInvoked, false) && context.candidates.some(candidate => candidate.entityId === document.id));
        const pkg = store.createAcademicContextPackage("ASSIGNMENT", assignment.id, {});
        await check("INSPECTABLE_CONTEXT_PACKAGE_HAS_PROVENANCE", () => assert.ok(pkg.snapshot.chunks.some(chunk => chunk.documentId === document.id) && pkg.snapshot.candidates.some(candidate => candidate.entityId === note.id)));

        const academicAi = new StudAcademicAssistantRuntime({store, userDataRoot: root, clientFactory: () => new LocalAcceptanceClient()});
        const response = await academicAi.generate({packageId: pkg.id, question: "What do the reviewed local sources say about opportunities and limitations?", mode: "EXPLAIN", requestId: "phase14_ai_request"});
        await check("LOCAL_AI_IS_GROUNDED_TO_PACKAGE", () => assert.strictEqual(response.status, "PARTIAL") && response.sourceTrace.every(source => source.entityId === document.id || source.entityId === note.id || sources.some(paper => paper.id === source.entityId)));
        const aiNote = academicAi.saveNote({responseId: response.responseId, title: "Reviewed local AI acceptance output"});
        academicAi.acceptRevision({responseId: response.responseId, candidateIndex: 0});
        await check("AI_PERSISTENCE_REMAINS_EXPLICIT", () => assert.ok(store.listProvenance("NOTE", aiNote.note.id, "academicAiResponse").length === 1));

        const bibliography = Citations.render(sources, "harvard");
        await check("HARVARD_REFERENCES_RESOLVE_TO_CANONICAL_RECORDS", () => assert.ok(bibliography.bibliography.includes("10.1016/j.lindif.2023.102274") && bibliography.bibliography.includes("10.1186/s40561-023-00237-x")));
        const restarted = new StudAcademicStore({root, applicationVersion: "phase14-acceptance"});
        await check("EXPLICIT_ACCEPTANCE_STATE_SURVIVES_RESTART", () => assert.ok(restarted.getAcademicContextPackage(pkg.id) && restarted.getEntity("NOTE", aiNote.note.id)));
        restarted.close(); academicAi.dispose(); store.close();
        console.log(`STUD_PHASE14_ACCEPTANCE: ${passed} checks passed`);
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
