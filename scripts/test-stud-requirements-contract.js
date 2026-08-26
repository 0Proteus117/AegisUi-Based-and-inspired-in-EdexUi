#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const ContractModel = require(path.join(ROOT, "src/classes/workspaces/studRequirementsContractModel.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const {StudRequirementsContractService} = require(path.join(ROOT, "src/classes/workspaces/studRequirementsContractService.class.js"));

let passed = 0;
function check(name, operation) { operation(); passed += 1; console.log(`${name}: PASS`); }
function expectCode(code, operation) { assert.throws(operation, error => error && error.code === code, code); }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function storeAt(root) { return new StudAcademicStore({root, applicationVersion: "m1-test"}).initialize(); }

function stripV15(dbPath) {
    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA foreign_keys=OFF;
        DROP TABLE IF EXISTS stud_workflow_blockers;
        DROP TABLE IF EXISTS stud_workflow_checkpoints;
        DROP TABLE IF EXISTS stud_workflow_events;
        DROP TABLE IF EXISTS stud_workflow_edges;
        DROP TABLE IF EXISTS stud_workflow_nodes;
        DROP TABLE IF EXISTS stud_workflow_instances;
        DROP TABLE IF EXISTS stud_workflow_template_edges;
        DROP TABLE IF EXISTS stud_workflow_template_nodes;
        DROP TABLE IF EXISTS stud_workflow_template_versions;
        DROP TABLE IF EXISTS stud_workflow_templates;
        ALTER TABLE stud_working_context DROP COLUMN active_workflow_node_id;
        ALTER TABLE stud_working_context DROP COLUMN active_workflow_id;
        DROP TABLE IF EXISTS stud_requirement_sources;
        DROP TABLE IF EXISTS stud_requirement_contract_freshness;
        DROP TABLE IF EXISTS stud_requirement_items;
        DROP TABLE IF EXISTS stud_requirement_candidates;
        DROP TABLE IF EXISTS stud_requirement_candidate_runs;
        DROP TABLE IF EXISTS stud_assignment_requirement_contracts;
        DROP TABLE IF EXISTS stud_requirement_contracts;
        DELETE FROM stud_schema_migrations WHERE version IN (15,17,18);
        PRAGMA foreign_keys=ON;`);
    db.close();
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m1-"));
try {
    const freshRoot = path.join(temp, "fresh");
    const store = storeAt(freshRoot);
    const service = new StudRequirementsContractService({store});

    check("FRESH_DATABASE_SCHEMA_V18", () => assert.strictEqual(store.schemaInfo().version, 18));
    check("V15_NORMALIZED_TABLES", () => {
        const names = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stud_requirement%' OR name='stud_assignment_requirement_contracts'").all().map(row => row.name);
        ["stud_requirement_contracts", "stud_assignment_requirement_contracts", "stud_requirement_candidate_runs", "stud_requirement_candidates", "stud_requirement_items", "stud_requirement_sources", "stud_requirement_contract_freshness"].forEach(name => assert.ok(names.includes(name), name));
    });

    const engineering = store.createEntity("ASSIGNMENT", {title: "Control systems design", description: "Submit a team design report of 3200 words using Harvard referencing as PDF.", dueDate: "2026-11-18T14:00:00Z"});
    const humanities = store.createEntity("ASSIGNMENT", {title: "Modernist literature", description: "Write a 2500 word essay using MLA citation and include a literature review."});
    const law = store.createEntity("ASSIGNMENT", {title: "Public law case analysis", description: "Prepare a 3000 word case study using OSCOLA referencing and submit a Word document."});
    const social = store.createEntity("ASSIGNMENT", {title: "Survey methodology", description: "Produce a 2200 word report discussing evidence, limitations and academic integrity."});
    const generic = store.createEntity("ASSIGNMENT", {title: "Generic coursework"});

    check("DISCIPLINE_NEUTRAL_CANDIDATES", () => {
        const results = [engineering, humanities, law, social].map(item => service.createDraft(item.id));
        assert.ok(results.every(contract => contract.candidates.length >= 2));
        assert.ok(results.some(contract => contract.candidates.some(item => item.type === "GROUP_WORK")));
        assert.ok(results.some(contract => contract.candidates.some(item => item.type === "ACADEMIC_INTEGRITY")));
        assert.ok(ContractModel.REQUIREMENT_TYPES.includes("OTHER"));
    });

    let genericDraft = service.createDraft(generic.id);
    check("NO_REQUIREMENT_IS_NOT_FABRICATED", () => {
        assert.strictEqual(genericDraft.candidates.length, 0);
        assert.strictEqual(genericDraft.completeness, "INCOMPLETE");
        assert.strictEqual(genericDraft.coverage.candidatesGenerated, 0);
    });
    check("NORMAL_APPROVAL_REJECTS_INCOMPLETE", () => expectCode("INCOMPLETE_CONTRACT", () => service.approve({contractId: genericDraft.id, expectedVersion: genericDraft.rowVersion})));
    genericDraft = service.approve({contractId: genericDraft.id, expectedVersion: genericDraft.rowVersion, approveAsIncomplete: true});
    check("EXPLICIT_APPROVE_AS_INCOMPLETE", () => {
        assert.strictEqual(genericDraft.lifecycle, "APPROVED");
        assert.strictEqual(genericDraft.completeness, "INCOMPLETE");
        assert.strictEqual(genericDraft.approvedAsIncomplete, true);
        assert.match(genericDraft.contractHash, /^[a-f0-9]{64}$/);
    });
    check("APPROVED_INCOMPLETE_CURRENT_IS_VALID", () => assert.strictEqual(service.state(generic.id).current.freshness.reviewCondition, "CURRENT"));
    check("APPROVED_REVISION_IMMUTABLE", () => expectCode("APPROVED_CONTRACT_IMMUTABLE", () => service.addManualRequirement({contractId: genericDraft.id, expectedVersion: genericDraft.rowVersion, requirement: {type: "OTHER", label: "Not allowed", displayValue: "x"}})));

    let engineeringDraft = service.state(engineering.id).draft;
    const firstVersion = engineeringDraft.rowVersion;
    engineeringDraft = service.reviewCandidate({contractId: engineeringDraft.id, candidateId: engineeringDraft.candidates[0].id, disposition: "EXCLUDED", expectedVersion: engineeringDraft.rowVersion});
    check("OPTIMISTIC_CONCURRENCY_REJECTS_STALE_WRITE", () => expectCode("STALE_CONTRACT_VERSION", () => service.reviewCandidate({contractId: engineeringDraft.id, candidateId: engineeringDraft.candidates[1].id, disposition: "INCLUDED", expectedVersion: firstVersion})));
    check("EXCLUDED_CANDIDATE_REMAINS_REVIEWED", () => assert.strictEqual(engineeringDraft.candidates.find(item => item.disposition === "EXCLUDED").candidateKey.length, 64));
    for (const candidate of engineeringDraft.candidates.filter(item => item.disposition === "PENDING")) engineeringDraft = service.reviewCandidate({contractId: engineeringDraft.id, candidateId: candidate.id, disposition: "INCLUDED", expectedVersion: engineeringDraft.rowVersion});
    engineeringDraft = service.addManualRequirement({contractId: engineeringDraft.id, expectedVersion: engineeringDraft.rowVersion, requirement: {type: "DEPENDENCY", subtype: "LAB_DATA", label: "Wind-tunnel dataset", displayValue: "Await real laboratory measurements", normalizedValue: "WAITING_DATA", resolutionState: "UNRESOLVED", userNote: "Do not fabricate measurements."}});
    check("MANUAL_REQUIREMENT_HAS_CANONICAL_USER_PROVENANCE", () => {
        const item = engineeringDraft.items.find(value => value.subtype === "LAB_DATA");
        assert.ok(item.sources[0].provenanceId);
        assert.strictEqual(item.sources[0].sourceKind, "USER_ENTRY");
    });
    engineeringDraft = service.approve({contractId: engineeringDraft.id, expectedVersion: engineeringDraft.rowVersion, approveAsIncomplete: true});
    check("APPROVED_INCOMPLETE_CAN_RETAIN_RESOLVED_AND_UNRESOLVED", () => assert.ok(engineeringDraft.items.some(item => item.resolutionState === "RESOLVED") && engineeringDraft.items.some(item => item.resolutionState === "UNRESOLVED")));

    let newEngineeringDraft = service.createRevision({contractId: engineeringDraft.id, expectedVersion: engineeringDraft.rowVersion});
    check("EDIT_APPROVED_CREATES_NEW_DRAFT_REVISION", () => {
        assert.strictEqual(newEngineeringDraft.lifecycle, "DRAFT");
        assert.strictEqual(newEngineeringDraft.revision, engineeringDraft.revision + 1);
        assert.strictEqual(newEngineeringDraft.parentContractId, engineeringDraft.id);
        assert.strictEqual(service.state(engineering.id).current.id, engineeringDraft.id);
        assert.ok(newEngineeringDraft.candidates.every(candidate => candidate.disposition === "PENDING"));
        assert.ok(newEngineeringDraft.items.some(item => item.sources.some(source => source.sourceKind === "USER_ENTRY")));
    });
    for (const candidate of newEngineeringDraft.candidates) newEngineeringDraft = service.reviewCandidate({contractId: newEngineeringDraft.id, candidateId: candidate.id, disposition: "INCLUDED", expectedVersion: newEngineeringDraft.rowVersion});
    newEngineeringDraft = service.approve({contractId: newEngineeringDraft.id, expectedVersion: newEngineeringDraft.rowVersion, approveAsIncomplete: true});
    check("SUPERSESSION_AND_CURRENT_POINTER_ARE_TRANSACTIONAL", () => {
        const next = service.state(engineering.id);
        assert.strictEqual(next.current.id, newEngineeringDraft.id);
        assert.strictEqual(next.history.find(item => item.id === engineeringDraft.id).lifecycle, "SUPERSEDED");
    });

    const conflictAssignment = store.createEntity("ASSIGNMENT", {title: "Conflicting deadline fixture"});
    let conflict = service.createDraft(conflictAssignment.id);
    conflict = service.addManualRequirement({contractId: conflict.id, expectedVersion: conflict.rowVersion, requirement: {type: "DEADLINE", label: "Submission deadline", displayValue: "Two source observations disagree", resolutionState: "CONFLICTING"}});
    conflict = service.approve({contractId: conflict.id, expectedVersion: conflict.rowVersion, approveAsIncomplete: true});
    check("CONFLICTING_STATE_NOT_FLATTENED", () => assert.strictEqual(conflict.completeness, "CONFLICTING"));

    const documentAssignment = store.createEntity("ASSIGNMENT", {title: "Document evidence fixture"});
    const saved = store.saveAcademicDocument({reference: "academic-documents/synthetic-brief.pdf", displayName: "Synthetic Brief.pdf", mimeType: "application/pdf", size: 2048, sha256: "a".repeat(64)}, {title: "Synthetic Assessment Brief", documentType: "COURSE_MATERIAL", assignmentId: documentAssignment.id});
    const content = "The assessment requires a 2800 word report using Harvard referencing. Submit a PDF.";
    store.persistDocumentExtraction(saved.document.id, {status: "READY", engine: "PDFJS_BUILT_IN", engineVersion: "test-1", pageCount: 3, pages: [{pageNumber: 3, text: content, textHash: hash(content)}], sections: [], chunks: [{pageStart: 3, pageEnd: 3, chunkType: "TEXT", content, contentHash: hash(content)}], references: [], warnings: []});
    let documentContract = service.createDraft(documentAssignment.id);
    const documentCandidate = documentContract.candidates.find(item => item.sources.some(source => source.chunkId));
    check("EXACT_DOCUMENT_EXTRACTION_CHUNK_PROVENANCE", () => {
        assert.ok(documentCandidate);
        const source = documentCandidate.sources[0];
        assert.ok(source.documentId && source.extractionId && source.chunkId);
        assert.strictEqual(source.pageStart, 3);
        assert.strictEqual(source.contentHash, hash(content));
    });
    for (const candidate of documentContract.candidates) documentContract = service.reviewCandidate({contractId: documentContract.id, candidateId: candidate.id, disposition: "INCLUDED", expectedVersion: documentContract.rowVersion});
    documentContract = service.approve({contractId: documentContract.id, expectedVersion: documentContract.rowVersion});
    const approvedHash = documentContract.contractHash;
    store.close();
    const reopened = storeAt(freshRoot);
    const reopenedService = new StudRequirementsContractService({store: reopened});
    documentContract = reopenedService.state(documentAssignment.id).current;
    check("EXACT_SOURCE_RESOLVES_AFTER_RESTART", () => {
        const source = documentContract.items.find(item => item.sources.some(value => value.chunkId)).sources[0];
        const preview = reopenedService.sourcePreview({sourceId: source.id});
        assert.strictEqual(preview.chunk.contentHash, hash(content));
        assert.strictEqual(preview.document.id, saved.document.id);
    });
    const changedContent = "The revised assessment requires a 3200 word report using Harvard referencing.";
    reopened.persistDocumentExtraction(saved.document.id, {status: "READY", engine: "PDFJS_BUILT_IN", engineVersion: "test-2", pageCount: 3, pages: [{pageNumber: 3, text: changedContent, textHash: hash(changedContent)}], sections: [], chunks: [{pageStart: 3, pageEnd: 3, chunkType: "TEXT", content: changedContent, contentHash: hash(changedContent)}], references: [], warnings: []});
    documentContract = reopenedService.state(documentAssignment.id).current;
    check("SOURCE_DRIFT_DETECTED_WITHOUT_CONTRACT_MUTATION", () => {
        assert.strictEqual(documentContract.freshness.reviewCondition, "SOURCE_CHANGED");
        assert.strictEqual(documentContract.contractHash, approvedHash);
        assert.strictEqual(documentContract.lifecycle, "APPROVED");
    });
    let refreshedDocumentDraft = reopenedService.createRevision({contractId: documentContract.id, expectedVersion: documentContract.rowVersion});
    check("SOURCE_DRIFT_NEW_REVISION_USES_CURRENT_EVIDENCE", () => {
        assert.ok(refreshedDocumentDraft.candidates.length);
        assert.ok(refreshedDocumentDraft.candidates.flatMap(candidate => candidate.sources).some(source => source.contentHash === hash(changedContent)));
        assert.ok(refreshedDocumentDraft.candidates.every(candidate => candidate.disposition === "PENDING"));
    });
    for (const candidate of refreshedDocumentDraft.candidates) refreshedDocumentDraft = reopenedService.reviewCandidate({contractId: refreshedDocumentDraft.id, candidateId: candidate.id, disposition: "INCLUDED", expectedVersion: refreshedDocumentDraft.rowVersion});
    refreshedDocumentDraft = reopenedService.approve({contractId: refreshedDocumentDraft.id, expectedVersion: refreshedDocumentDraft.rowVersion});
    check("SOURCE_DRIFT_REVIEW_CAN_APPROVE_NEW_CURRENT_REVISION", () => {
        assert.strictEqual(reopenedService.state(documentAssignment.id).current.id, refreshedDocumentDraft.id);
        assert.strictEqual(refreshedDocumentDraft.freshness.reviewCondition, "CURRENT");
    });
    reopened.archiveEntity("ACADEMIC_DOCUMENT", saved.document.id);
    check("MISSING_SOURCE_DETECTED", () => assert.strictEqual(reopenedService.state(documentAssignment.id).current.freshness.reviewCondition, "SOURCE_MISSING"));

    const ocrAssignment = reopened.createEntity("ASSIGNMENT", {title: "OCR fixture"});
    const ocrDoc = reopened.saveAcademicDocument({reference: "academic-documents/scan.pdf", displayName: "Scan.pdf", mimeType: "application/pdf", size: 1024, sha256: "b".repeat(64)}, {title: "Scanned brief", documentType: "COURSE_MATERIAL", assignmentId: ocrAssignment.id}).document;
    reopened.updateEntity("ACADEMIC_DOCUMENT", ocrDoc.id, {extractionStatus: "OCR_REQUIRED"});
    const ocrDraft = reopenedService.createDraft(ocrAssignment.id);
    check("OCR_REQUIRED_REPORTED_IN_COVERAGE", () => assert.strictEqual(ocrDraft.coverage.ocrRequiredDocuments, 1));
    check("OCR_BLOCKED_SOURCE_STATE", () => assert.strictEqual(reopenedService.sourceCurrentState({sourceKind: "ACADEMIC_DOCUMENT_STATUS", documentId: ocrDoc.id, sourceVersionHash: "c".repeat(64)}).condition, "OCR_BLOCKED"));

    const moodle = reopened.createEntity("ASSIGNMENT", {title: "Moodle fixture", dueDate: "2027-01-01T12:00:00Z"});
    const external = reopened.createExternalIdentifier({entityType: "ASSIGNMENT", entityId: moodle.id, namespace: "MOODLE_ASSIGNMENT:stud_provider_test", externalId: "42", source: "MOODLE"});
    const provenance = reopened.createProvenance({entityType: "ASSIGNMENT", entityId: moodle.id, field: "dueDate", observedValue: moodle.dueDate, sourceType: "MOODLE", sourceId: "assignment:42", sourceAuthority: "AUTHORITATIVE"});
    const moodleDraft = reopenedService.createDraft(moodle.id);
    check("MOODLE_CANONICAL_PROVENANCE_AND_EXTERNAL_ID", () => {
        const source = moodleDraft.candidates.find(item => item.label === "DUE DATE").sources[0];
        assert.strictEqual(source.provenanceId, provenance.id);
        assert.strictEqual(source.externalIdentifierId, external.id);
    });

    const bounded = reopened.createEntity("ASSIGNMENT", {title: "Bounded extraction fixture", description: "A 2000 word report."});
    for (let index = 0; index < ContractModel.EXTRACTION_LIMITS.documents + 1; index += 1) reopened.createEntity("ACADEMIC_DOCUMENT", {title: `Synthetic source ${index}`, documentType: "COURSE_MATERIAL", managedReference: `academic-documents/source-${index}.pdf`, mimeType: "application/pdf", byteSize: 100, checksum: hash(`source-${index}`), pageCount: null, extractionStatus: "NOT_ANALYZED", extractionEngine: null, extractionVersion: null, assignmentId: bounded.id});
    const boundedDraft = reopenedService.createDraft(bounded.id);
    check("CANDIDATE_GENERATION_REPORTS_BOUNDS_HONESTLY", () => {
        assert.strictEqual(boundedDraft.coverage.linkedDocuments, ContractModel.EXTRACTION_LIMITS.documents + 1);
        assert.strictEqual(boundedDraft.coverage.truncationReached, true);
        assert.deepStrictEqual(boundedDraft.coverage.bounds, ContractModel.EXTRACTION_LIMITS);
    });
    check("PENDING_REVIEW_CANNOT_BYPASS_APPROVAL", () => expectCode("REVIEW_INCOMPLETE", () => reopenedService.approve({contractId: boundedDraft.id, expectedVersion: boundedDraft.rowVersion, approveAsIncomplete: true})));
    check("OVERSIZED_REQUIREMENT_INPUT_FAILS_CLOSED", () => expectCode("INVALID_INPUT", () => ContractModel.normalizeRequirement({type: "OTHER", label: "x".repeat(241)})));

    reopened.close();

    const migrateRoot = path.join(temp, "v14-upgrade");
    let legacy = storeAt(migrateRoot);
    const legacyAssignment = legacy.createEntity("ASSIGNMENT", {title: "Existing v14 Assignment"});
    legacy.close(); stripV15(path.join(migrateRoot, "academic.sqlite"));
    legacy = storeAt(migrateRoot);
    check("V14_TO_V18_MIGRATION", () => assert.strictEqual(legacy.schemaInfo().version, 18));
    check("EXISTING_ASSIGNMENT_HAS_NO_FABRICATED_CONTRACT", () => {
        const migratedState = new StudRequirementsContractService({store: legacy}).state(legacyAssignment.id);
        assert.strictEqual(migratedState.current, null);
        assert.strictEqual(migratedState.draft, null);
        assert.strictEqual(migratedState.history.length, 0);
    });
    legacy.close();

    const rollbackRoot = path.join(temp, "rollback");
    let rollbackStore = storeAt(rollbackRoot); rollbackStore.close();
    const rollbackPath = path.join(rollbackRoot, "academic.sqlite"); stripV15(rollbackPath);
    const broken = new DatabaseSync(rollbackPath); broken.exec("CREATE TABLE stud_requirement_contracts (id TEXT PRIMARY KEY);"); broken.close();
    check("MIGRATION_FAILURE_ROLLS_BACK", () => {
        assert.throws(() => storeAt(rollbackRoot), error => error.code === "DATABASE_OPEN_FAILED");
        const inspect = new DatabaseSync(rollbackPath);
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) AS count FROM stud_schema_migrations WHERE version=15").get().count, 0);
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='stud_assignment_requirement_contracts'").get().count, 0);
        inspect.close();
    });

    const renderer = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studRequirementsContractWorkspace.class.js"), "utf8");
    const ipc = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"), "utf8");
    check("PRELOAD_READY_TYPED_IPC_NO_RENDERER_NODE", () => {
        assert.ok(ipc.includes("StudRequirementsContractService"));
        assert.ok(ipc.includes('"stud-requirements-approve"'));
        assert.ok(!renderer.includes("require("));
        assert.ok(!renderer.includes("node:sqlite"));
        assert.ok(!renderer.includes("fetch("));
        assert.ok(!renderer.includes("localStorage"));
    });
    check("SECURITY_REJECTS_MALFORMED_IDS_AND_SOURCES", () => {
        expectCode("INVALID_INPUT", () => new StudRequirementsContractService({store: storeAt(path.join(temp, "security"))}).state("../../etc/passwd"));
        expectCode("INVALID_INPUT", () => ContractModel.normalizeSourceReference({sourceKind: "ACADEMIC_DOCUMENT_CHUNK", documentId: "bad id", snapshotHash: "a".repeat(64)}));
    });
    check("CANONICAL_HASH_IS_KEY_ORDER_DETERMINISTIC", () => assert.strictEqual(ContractModel.sha256({b: 2, a: 1}), ContractModel.sha256({a: 1, b: 2})));

    console.log(`STUD_REQUIREMENTS_CONTRACT: PASS (${passed} checks)`);
} finally {
    fs.rmSync(temp, {recursive: true, force: true});
}
