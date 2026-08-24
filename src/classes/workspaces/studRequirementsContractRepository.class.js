"use strict";

const Model = require("./studAcademicModel.class.js");
const ContractModel = require("./studRequirementsContractModel.class.js");

function parseJson(value, fallback = null) {
    try { return value ? JSON.parse(value) : fallback; } catch (error) { return fallback; }
}

function rowToCamel(row) {
    if (!row) return null;
    const result = {};
    Object.entries(row).forEach(([key, value]) => {
        const name = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
        result[name] = ["approved_as_incomplete", "truncation_reached"].includes(key) ? Boolean(value) : value;
    });
    return result;
}

class StudRequirementsContractRepository {
    constructor(store) {
        if (!store) throw new Error("StudAcademicStore is required.");
        this.store = store;
        this.store.initialize();
        this.db = store.db;
    }

    transaction(work) { return this.store.transaction(work); }

    requireAssignment(assignmentId) {
        const id = Model.safeId(assignmentId, "Assignment ID");
        const assignment = this.store.getEntity("ASSIGNMENT", id);
        if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
        return assignment;
    }

    contractRow(contractId) {
        const id = Model.safeId(contractId, "Requirements Contract ID");
        const row = this.db.prepare("SELECT * FROM stud_requirement_contracts WHERE id=?").get(id);
        if (!row) throw new Model.StudError("NOT_FOUND", "Requirements Contract does not exist.");
        return rowToCamel(row);
    }

    assertExpected(row, expected) {
        const version = ContractModel.expectedVersion(expected);
        if (row.rowVersion !== version) throw new Model.StudError("STALE_CONTRACT_VERSION", "The Requirements Contract changed in another operation. Reload before saving.", {expected: version, actual: row.rowVersion});
    }

    assertDraft(row) {
        if (row.lifecycle !== "DRAFT") throw new Model.StudError("APPROVED_CONTRACT_IMMUTABLE", "Approved or superseded Contract Revisions cannot be edited in place.", {lifecycle: row.lifecycle});
    }

    sourcesFor(contractId) {
        return this.db.prepare("SELECT * FROM stud_requirement_sources WHERE contract_id=? ORDER BY created_at,id").all(contractId).map(row => {
            const source = rowToCamel(row);
            source.metadata = parseJson(row.metadata_json, null);
            delete source.metadataJson;
            return source;
        });
    }

    sourceDetail(sourceId) {
        const id = Model.safeId(sourceId, "Requirement source ID");
        const row = this.db.prepare("SELECT * FROM stud_requirement_sources WHERE id=?").get(id);
        if (!row) throw new Model.StudError("NOT_FOUND", "Requirement source does not exist.");
        const source = rowToCamel(row);
        source.metadata = parseJson(row.metadata_json, null); delete source.metadataJson;
        let document = null; let extraction = null; let chunk = null; let provenance = null; let externalIdentifier = null;
        if (source.documentId) document = rowToCamel(this.db.prepare("SELECT * FROM stud_academic_documents WHERE id=?").get(source.documentId));
        if (source.extractionId) extraction = rowToCamel(this.db.prepare("SELECT * FROM stud_document_extractions WHERE id=?").get(source.extractionId));
        if (source.chunkId) chunk = rowToCamel(this.db.prepare("SELECT * FROM stud_document_chunks WHERE id=?").get(source.chunkId));
        if (source.provenanceId) provenance = rowToCamel(this.db.prepare("SELECT * FROM stud_provenance_records WHERE id=?").get(source.provenanceId));
        if (source.externalIdentifierId) externalIdentifier = rowToCamel(this.db.prepare("SELECT * FROM stud_external_identifiers WHERE id=?").get(source.externalIdentifierId));
        return Object.freeze({source: Object.freeze(source), document: document && Object.freeze(document), extraction: extraction && Object.freeze(extraction), chunk: chunk && Object.freeze(chunk), provenance: provenance && Object.freeze(provenance), externalIdentifier: externalIdentifier && Object.freeze(externalIdentifier)});
    }

    hydrate(contractId) {
        const contract = this.contractRow(contractId);
        const sources = this.sourcesFor(contract.id);
        const byCandidate = new Map();
        const byItem = new Map();
        sources.forEach(source => {
            if (source.candidateId) (byCandidate.get(source.candidateId) || byCandidate.set(source.candidateId, []).get(source.candidateId)).push(source);
            if (source.requirementItemId) (byItem.get(source.requirementItemId) || byItem.set(source.requirementItemId, []).get(source.requirementItemId)).push(source);
        });
        const candidates = this.db.prepare("SELECT * FROM stud_requirement_candidates WHERE contract_id=? ORDER BY item_order,created_at,id").all(contract.id).map(row => {
            const value = rowToCamel(row);
            value.type = value.requirementType; delete value.requirementType;
            value.order = value.itemOrder; delete value.itemOrder;
            value.sources = Object.freeze(byCandidate.get(value.id) || []);
            return Object.freeze(value);
        });
        const items = this.db.prepare("SELECT * FROM stud_requirement_items WHERE contract_id=? ORDER BY item_order,created_at,id").all(contract.id).map(row => {
            const value = rowToCamel(row);
            value.type = value.requirementType; delete value.requirementType;
            value.order = value.itemOrder; delete value.itemOrder;
            value.sources = Object.freeze(byItem.get(value.id) || []);
            if (value.candidateId && !value.sources.length) value.sources = Object.freeze(byCandidate.get(value.candidateId) || []);
            return Object.freeze(value);
        });
        const runRow = this.db.prepare("SELECT * FROM stud_requirement_candidate_runs WHERE contract_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(contract.id);
        const coverage = runRow ? rowToCamel(runRow) : null;
        if (coverage) { coverage.bounds = parseJson(runRow.bounds_json, {}); delete coverage.boundsJson; }
        const freshnessRow = this.db.prepare("SELECT * FROM stud_requirement_contract_freshness WHERE contract_id=?").get(contract.id);
        const freshness = freshnessRow ? {...rowToCamel(freshnessRow), details: parseJson(freshnessRow.details_json, [])} : {contractId: contract.id, reviewCondition: "NEEDS_REVIEW", details: [], checkedAt: null};
        delete freshness.detailsJson;
        return Object.freeze({...contract, candidates: Object.freeze(candidates), items: Object.freeze(items), coverage: coverage ? Object.freeze(coverage) : null, freshness: Object.freeze(freshness)});
    }

    assignmentState(assignmentId) {
        const assignment = this.requireAssignment(assignmentId);
        const pointer = this.db.prepare("SELECT current_contract_id FROM stud_assignment_requirement_contracts WHERE assignment_id=?").get(assignment.id);
        const draft = this.db.prepare("SELECT id FROM stud_requirement_contracts WHERE assignment_id=? AND lifecycle='DRAFT' ORDER BY revision DESC LIMIT 1").get(assignment.id);
        const history = this.db.prepare("SELECT id,revision,lifecycle,completeness,approved_as_incomplete,approved_at,contract_hash,row_version,created_at,updated_at FROM stud_requirement_contracts WHERE assignment_id=? ORDER BY revision DESC").all(assignment.id).map(rowToCamel);
        return Object.freeze({assignmentId: assignment.id, current: pointer ? this.hydrate(pointer.current_contract_id) : null, draft: draft ? this.hydrate(draft.id) : null, history: Object.freeze(history.map(Object.freeze))});
    }

    createDraft(assignmentId) {
        const assignment = this.requireAssignment(assignmentId);
        return this.transaction(() => {
            const existing = this.db.prepare("SELECT id FROM stud_requirement_contracts WHERE assignment_id=? AND lifecycle='DRAFT' ORDER BY revision DESC LIMIT 1").get(assignment.id);
            if (existing) return this.hydrate(existing.id);
            const latest = this.db.prepare("SELECT id,revision FROM stud_requirement_contracts WHERE assignment_id=? ORDER BY revision DESC LIMIT 1").get(assignment.id);
            const id = Model.createId("requirement_contract");
            const timestamp = Model.now();
            this.db.prepare("INSERT INTO stud_requirement_contracts (id,assignment_id,revision,parent_contract_id,lifecycle,completeness,approved_as_incomplete,row_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
                .run(id, assignment.id, Number(latest && latest.revision || 0) + 1, latest && latest.id || null, "DRAFT", "INCOMPLETE", 0, 1, timestamp, timestamp);
            this.db.prepare("INSERT INTO stud_requirement_contract_freshness (contract_id,review_condition,details_json,checked_at,updated_at) VALUES (?,?,?,?,?)")
                .run(id, "NEEDS_REVIEW", "[]", timestamp, timestamp);
            return this.hydrate(id);
        });
    }

    addCandidateRun(contractId, expectedVersion, coverage, candidates) {
        return this.mutateDraft(contractId, expectedVersion, row => {
            if (this.db.prepare("SELECT COUNT(*) AS count FROM stud_requirement_candidates WHERE contract_id=?").get(row.id).count) throw new Model.StudError("INVALID_TRANSITION", "Candidates have already been generated for this draft.");
            const runId = Model.createId("requirement_candidate_run");
            const timestamp = Model.now();
            this.db.prepare("INSERT INTO stud_requirement_candidate_runs (id,contract_id,linked_documents,indexable_documents,inspected_documents,ocr_required_documents,chunks_inspected,truncation_reached,candidates_generated,bounds_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
                .run(runId, row.id, coverage.linkedDocuments, coverage.indexableDocuments, coverage.inspectedDocuments, coverage.ocrRequiredDocuments, coverage.chunksInspected, coverage.truncationReached ? 1 : 0, candidates.length, JSON.stringify(coverage.bounds), timestamp);
            const candidateStatement = this.db.prepare("INSERT INTO stud_requirement_candidates (id,contract_id,run_id,candidate_key,requirement_type,subtype,label,original_value,display_value,normalized_value,unit,disposition,resolution_state,extraction_method,confidence,item_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            const sourceStatement = this.db.prepare("INSERT INTO stud_requirement_sources (id,contract_id,candidate_id,requirement_item_id,source_kind,source_entity_type,source_entity_id,source_field,provenance_id,external_identifier_id,document_id,extraction_id,chunk_id,page_start,page_end,content_hash,source_version_hash,snapshot_hash,presentation_label,excerpt,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
            candidates.forEach((entry, index) => {
                const {sources = [], ...candidateInput} = entry;
                const candidate = ContractModel.normalizeCandidate({...candidateInput, runId, order: entry.order ?? index});
                const candidateId = Model.createId("requirement_candidate");
                candidateStatement.run(candidateId, row.id, runId, candidate.candidateKey, candidate.type, candidate.subtype, candidate.label, candidate.originalValue, candidate.displayValue, candidate.normalizedValue, candidate.unit, "PENDING", candidate.resolutionState, candidate.extractionMethod, candidate.confidence, candidate.order, timestamp, timestamp);
                sources.forEach(raw => {
                    const source = ContractModel.normalizeSourceReference(raw);
                    sourceStatement.run(Model.createId("requirement_source"), row.id, candidateId, null, source.sourceKind, source.sourceEntityType, source.sourceEntityId, source.sourceField, source.provenanceId, source.externalIdentifierId, source.documentId, source.extractionId, source.chunkId, source.pageStart, source.pageEnd, source.contentHash, source.sourceVersionHash, source.snapshotHash, source.presentationLabel, source.excerpt, source.metadata ? JSON.stringify(source.metadata) : null, timestamp);
                });
            });
        });
    }

    mutateDraft(contractId, expectedVersion, work) {
        return this.transaction(() => {
            const row = this.contractRow(contractId);
            this.assertExpected(row, expectedVersion);
            this.assertDraft(row);
            work(row);
            const state = this.rawState(row.id);
            const completeness = ContractModel.deriveCompleteness(state.candidates, state.items);
            const timestamp = Model.now();
            this.db.prepare("UPDATE stud_requirement_contracts SET completeness=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?")
                .run(completeness, timestamp, row.id, row.rowVersion);
            return this.hydrate(row.id);
        });
    }

    rawState(contractId) {
        const candidates = this.db.prepare("SELECT disposition,resolution_state FROM stud_requirement_candidates WHERE contract_id=?").all(contractId).map(row => ({disposition: row.disposition, resolutionState: row.resolution_state}));
        const items = this.db.prepare("SELECT resolution_state FROM stud_requirement_items WHERE contract_id=?").all(contractId).map(row => ({resolutionState: row.resolution_state}));
        return {candidates, items};
    }

    setCandidateDisposition(contractId, candidateId, disposition, expectedVersion) {
        const next = Model.enumValue(disposition, ContractModel.CANDIDATE_DISPOSITIONS, "Candidate disposition");
        return this.mutateDraft(contractId, expectedVersion, row => {
            const id = Model.safeId(candidateId, "Requirement candidate ID");
            const candidate = this.db.prepare("SELECT * FROM stud_requirement_candidates WHERE id=? AND contract_id=?").get(id, row.id);
            if (!candidate) throw new Model.StudError("NOT_FOUND", "Requirement candidate does not exist in this revision.");
            const resolution = next === "UNRESOLVED" ? "UNRESOLVED" : candidate.resolution_state;
            this.db.prepare("UPDATE stud_requirement_candidates SET disposition=?,resolution_state=?,updated_at=? WHERE id=?").run(next, resolution, Model.now(), id);
            const item = this.db.prepare("SELECT id FROM stud_requirement_items WHERE candidate_id=?").get(id);
            if (next === "INCLUDED" && !item) {
                this.db.prepare("INSERT INTO stud_requirement_items (id,contract_id,candidate_id,requirement_type,subtype,label,original_value,display_value,normalized_value,unit,resolution_state,user_note,item_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                    .run(Model.createId("requirement_item"), row.id, id, candidate.requirement_type, candidate.subtype, candidate.label, candidate.original_value, candidate.display_value, candidate.normalized_value, candidate.unit, candidate.resolution_state, null, candidate.item_order, Model.now(), Model.now());
            } else if (next !== "INCLUDED" && item) {
                this.db.prepare("DELETE FROM stud_requirement_sources WHERE requirement_item_id=?").run(item.id);
                this.db.prepare("DELETE FROM stud_requirement_items WHERE id=?").run(item.id);
            }
        });
    }

    addManualItem(contractId, expectedVersion, input, source) {
        const value = ContractModel.normalizeRequirement(input);
        return this.mutateDraft(contractId, expectedVersion, row => {
            const id = Model.createId("requirement_item");
            const timestamp = Model.now();
            this.db.prepare("INSERT INTO stud_requirement_items (id,contract_id,candidate_id,requirement_type,subtype,label,original_value,display_value,normalized_value,unit,resolution_state,user_note,item_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                .run(id, row.id, null, value.type, value.subtype, value.label, value.originalValue, value.displayValue, value.normalizedValue, value.unit, value.resolutionState, value.userNote, value.order, timestamp, timestamp);
            const ref = ContractModel.normalizeSourceReference(source);
            this.db.prepare("INSERT INTO stud_requirement_sources (id,contract_id,candidate_id,requirement_item_id,source_kind,source_entity_type,source_entity_id,source_field,provenance_id,external_identifier_id,document_id,extraction_id,chunk_id,page_start,page_end,content_hash,source_version_hash,snapshot_hash,presentation_label,excerpt,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                .run(Model.createId("requirement_source"), row.id, null, id, ref.sourceKind, ref.sourceEntityType, ref.sourceEntityId, ref.sourceField, ref.provenanceId, ref.externalIdentifierId, ref.documentId, ref.extractionId, ref.chunkId, ref.pageStart, ref.pageEnd, ref.contentHash, ref.sourceVersionHash, ref.snapshotHash, ref.presentationLabel, ref.excerpt, ref.metadata ? JSON.stringify(ref.metadata) : null, timestamp);
        });
    }

    updateItem(contractId, itemId, expectedVersion, input) {
        return this.mutateDraft(contractId, expectedVersion, row => {
            const id = Model.safeId(itemId, "Requirement item ID");
            const existing = this.db.prepare("SELECT * FROM stud_requirement_items WHERE id=? AND contract_id=?").get(id, row.id);
            if (!existing) throw new Model.StudError("NOT_FOUND", "Requirement item does not exist in this revision.");
            const value = ContractModel.normalizeRequirement(input, {...rowToCamel(existing), type: existing.requirement_type, order: existing.item_order});
            this.db.prepare("UPDATE stud_requirement_items SET requirement_type=?,subtype=?,label=?,original_value=?,display_value=?,normalized_value=?,unit=?,resolution_state=?,user_note=?,item_order=?,updated_at=? WHERE id=?")
                .run(value.type, value.subtype, value.label, value.originalValue, value.displayValue, value.normalizedValue, value.unit, value.resolutionState, value.userNote, value.order, Model.now(), id);
            if (existing.candidate_id) this.db.prepare("UPDATE stud_requirement_candidates SET resolution_state=?,updated_at=? WHERE id=?").run(value.resolutionState, Model.now(), existing.candidate_id);
        });
    }

    removeItem(contractId, itemId, expectedVersion) {
        return this.mutateDraft(contractId, expectedVersion, row => {
            const id = Model.safeId(itemId, "Requirement item ID");
            const item = this.db.prepare("SELECT candidate_id FROM stud_requirement_items WHERE id=? AND contract_id=?").get(id, row.id);
            if (!item) throw new Model.StudError("NOT_FOUND", "Requirement item does not exist in this revision.");
            this.db.prepare("DELETE FROM stud_requirement_sources WHERE requirement_item_id=?").run(id);
            this.db.prepare("DELETE FROM stud_requirement_items WHERE id=?").run(id);
            if (item.candidate_id) this.db.prepare("UPDATE stud_requirement_candidates SET disposition='EXCLUDED',updated_at=? WHERE id=?").run(Model.now(), item.candidate_id);
        });
    }

    createRevision(contractId, expectedVersion) {
        return this.transaction(() => {
            const source = this.contractRow(contractId);
            this.assertExpected(source, expectedVersion);
            if (!["APPROVED", "SUPERSEDED"].includes(source.lifecycle)) throw new Model.StudError("INVALID_TRANSITION", "Only approved Contract Revisions can seed a new draft.");
            const existing = this.db.prepare("SELECT id FROM stud_requirement_contracts WHERE assignment_id=? AND lifecycle='DRAFT' ORDER BY revision DESC LIMIT 1").get(source.assignmentId);
            if (existing) return this.hydrate(existing.id);
            const latest = this.db.prepare("SELECT MAX(revision) AS revision FROM stud_requirement_contracts WHERE assignment_id=?").get(source.assignmentId);
            const id = Model.createId("requirement_contract");
            const timestamp = Model.now();
            this.db.prepare("INSERT INTO stud_requirement_contracts (id,assignment_id,revision,parent_contract_id,lifecycle,completeness,approved_as_incomplete,row_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
                .run(id, source.assignmentId, Number(latest.revision || 0) + 1, source.id, "DRAFT", source.completeness, 0, 1, timestamp, timestamp);
            this.db.prepare("INSERT INTO stud_requirement_contract_freshness (contract_id,review_condition,details_json,checked_at,updated_at) VALUES (?,?,?,?,?)").run(id, "NEEDS_REVIEW", "[]", timestamp, timestamp);
            const itemMap = new Map();
            this.db.prepare("SELECT * FROM stud_requirement_items WHERE contract_id=? AND candidate_id IS NULL ORDER BY item_order,created_at").all(source.id).forEach(item => {
                const nextId = Model.createId("requirement_item"); itemMap.set(item.id, nextId);
                this.db.prepare("INSERT INTO stud_requirement_items (id,contract_id,candidate_id,requirement_type,subtype,label,original_value,display_value,normalized_value,unit,resolution_state,user_note,item_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                    .run(nextId,id,null,item.requirement_type,item.subtype,item.label,item.original_value,item.display_value,item.normalized_value,item.unit,item.resolution_state,item.user_note,item.item_order,timestamp,timestamp);
            });
            this.db.prepare("SELECT * FROM stud_requirement_sources WHERE contract_id=? ORDER BY created_at,id").all(source.id).forEach(ref => {
                if (!ref.requirement_item_id || !itemMap.has(ref.requirement_item_id)) return;
                this.db.prepare("INSERT INTO stud_requirement_sources (id,contract_id,candidate_id,requirement_item_id,source_kind,source_entity_type,source_entity_id,source_field,provenance_id,external_identifier_id,document_id,extraction_id,chunk_id,page_start,page_end,content_hash,source_version_hash,snapshot_hash,presentation_label,excerpt,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                    .run(Model.createId("requirement_source"),id,null,itemMap.get(ref.requirement_item_id),ref.source_kind,ref.source_entity_type,ref.source_entity_id,ref.source_field,ref.provenance_id,ref.external_identifier_id,ref.document_id,ref.extraction_id,ref.chunk_id,ref.page_start,ref.page_end,ref.content_hash,ref.source_version_hash,ref.snapshot_hash,ref.presentation_label,ref.excerpt,ref.metadata_json,timestamp);
            });
            return this.hydrate(id);
        });
    }

    setFreshness(contractId, reviewCondition, details) {
        const row = this.contractRow(contractId);
        const condition = Model.enumValue(reviewCondition, ContractModel.FRESHNESS, "Contract freshness");
        const timestamp = Model.now();
        this.db.prepare("INSERT INTO stud_requirement_contract_freshness (contract_id,review_condition,details_json,checked_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(contract_id) DO UPDATE SET review_condition=excluded.review_condition,details_json=excluded.details_json,checked_at=excluded.checked_at,updated_at=excluded.updated_at")
            .run(row.id, condition, JSON.stringify(details || []), timestamp, timestamp);
        return this.hydrate(row.id);
    }

    canonicalPayload(contractId) {
        const contract = this.hydrate(contractId);
        return {
            assignmentId: contract.assignmentId, revision: contract.revision,
            completeness: contract.completeness, approvedAsIncomplete: contract.approvedAsIncomplete,
            candidates: contract.candidates.map(item => ({candidateKey: item.candidateKey, disposition: item.disposition, resolutionState: item.resolutionState})),
            items: contract.items.map(item => ({id: item.id, candidateId: item.candidateId, type: item.type, subtype: item.subtype, label: item.label, originalValue: item.originalValue, displayValue: item.displayValue, normalizedValue: item.normalizedValue, unit: item.unit, resolutionState: item.resolutionState, userNote: item.userNote, order: item.order,
                sources: item.sources.map(source => ({sourceKind: source.sourceKind, sourceEntityType: source.sourceEntityType, sourceEntityId: source.sourceEntityId, sourceField: source.sourceField, provenanceId: source.provenanceId, externalIdentifierId: source.externalIdentifierId, documentId: source.documentId, extractionId: source.extractionId, chunkId: source.chunkId, pageStart: source.pageStart, pageEnd: source.pageEnd, contentHash: source.contentHash, sourceVersionHash: source.sourceVersionHash, snapshotHash: source.snapshotHash}))}))
        };
    }

    approve(contractId, expectedVersion, incomplete, approvedBy = "USER") {
        return this.transaction(() => {
            const row = this.contractRow(contractId);
            this.assertExpected(row, expectedVersion); this.assertDraft(row);
            const state = this.rawState(row.id);
            const completeness = ContractModel.deriveCompleteness(state.candidates, state.items);
            if (state.candidates.some(item => item.disposition === "PENDING")) throw new Model.StudError("REVIEW_INCOMPLETE", "Every generated candidate must be included, excluded or marked unresolved before approval.");
            if (!incomplete && completeness !== "COMPLETE") throw new Model.StudError("INCOMPLETE_CONTRACT", "Unresolved or conflicting requirements require explicit incomplete approval.");
            const currentFreshness = this.db.prepare("SELECT review_condition FROM stud_requirement_contract_freshness WHERE contract_id=?").get(row.id);
            if (currentFreshness && ["SOURCE_CHANGED", "SOURCE_MISSING"].includes(currentFreshness.review_condition)) throw new Model.StudError("SOURCE_REVIEW_REQUIRED", "Source evidence changed or disappeared. Review a new draft before approval.");
            const timestamp = Model.now();
            this.db.prepare("UPDATE stud_requirement_contracts SET lifecycle='APPROVED',completeness=?,approved_as_incomplete=?,approved_at=?,approved_by=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?")
                .run(completeness, incomplete ? 1 : 0, timestamp, approvedBy, timestamp, row.id, row.rowVersion);
            const prior = this.db.prepare("SELECT current_contract_id FROM stud_assignment_requirement_contracts WHERE assignment_id=?").get(row.assignmentId);
            if (prior && prior.current_contract_id !== row.id) this.db.prepare("UPDATE stud_requirement_contracts SET lifecycle='SUPERSEDED',updated_at=? WHERE id=? AND lifecycle='APPROVED'").run(timestamp, prior.current_contract_id);
            this.db.prepare("INSERT INTO stud_assignment_requirement_contracts (assignment_id,current_contract_id,updated_at) VALUES (?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET current_contract_id=excluded.current_contract_id,updated_at=excluded.updated_at")
                .run(row.assignmentId, row.id, timestamp);
            const hash = ContractModel.sha256(this.canonicalPayload(row.id));
            this.db.prepare("UPDATE stud_requirement_contracts SET contract_hash=? WHERE id=?").run(hash, row.id);
            return this.hydrate(row.id);
        });
    }
}

module.exports = {StudRequirementsContractRepository};
