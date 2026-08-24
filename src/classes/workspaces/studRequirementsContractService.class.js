"use strict";

const Model = require("./studAcademicModel.class.js");
const ContractModel = require("./studRequirementsContractModel.class.js");
const {StudRequirementsContractRepository} = require("./studRequirementsContractRepository.class.js");

const PATTERNS = Object.freeze([
    Object.freeze({label: "WORD COUNT", type: "LENGTH", expression: /\b\d{2,5}(?:\s*[-–]\s*\d{2,5})?\s+words?\b/ig, concise: true, unit: "words"}),
    Object.freeze({label: "CITATION STYLE", type: "CITATION", expression: /\b(?:harvard|apa(?:\s*\d+)?|mla|oscola|chicago)\b(?:\s+(?:style|referencing|citation))?/ig, concise: true}),
    Object.freeze({label: "LEARNING OUTCOMES", type: "LEARNING_OUTCOME", expression: /\bLO(?:['’]?s)?\s*\d+(?:\s*[,/&–-]\s*\d+)*\b/ig, concise: true}),
    Object.freeze({label: "DURATION", type: "LENGTH", expression: /\b(?:no more than|maximum(?:\s+length)?(?:\s+of)?|up to)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+minutes?\b/ig, concise: true, unit: "minutes"}),
    Object.freeze({label: "ASSESSMENT WEIGHT", type: "OTHER", expression: /\b\d{1,3}%\s+(?:of|for)\s+(?:the\s+)?(?:portfolio|assessment|module|component|mark)\b/ig}),
    Object.freeze({label: "DELIVERABLE", type: "DELIVERABLE", expression: /\b(?:individual appendix|team design report|pre-recorded (?:presentation )?video|presentation slides|essay|report|presentation|portfolio|case study|literature review|reflection|poster|dissertation)\b/ig, concise: true}),
    Object.freeze({label: "SUBMISSION FORMAT", type: "FORMAT", expression: /\b(?:pdf|docx|pptx|mp4|powerpoint|word document)\b/ig, concise: true}),
    Object.freeze({label: "REQUIRED STRUCTURE", type: "STRUCTURE", expression: /\b(?:required structure(?: and formatting)?|should adhere to the following structure)\b/ig}),
    Object.freeze({label: "MARKING CRITERIA", type: "RUBRIC", expression: /\b(?:assessment criteria|marking criteria|rubric)\b/ig, concise: true}),
    Object.freeze({label: "FORMATTING", type: "FORMAT", expression: /\b(?:Arial font|\d{1,2}[- ]point font|line spacing of \d(?:\.\d+)?|margins? (?:must|should))\b/ig}),
    Object.freeze({label: "GROUP WORK", type: "GROUP_WORK", expression: /\b(?:group work|team assignment|team contribution|group presentation|team (?:design )?report)\b/ig}),
    Object.freeze({label: "ACADEMIC INTEGRITY", type: "ACADEMIC_INTEGRITY", expression: /\b(?:academic integrity|plagiarism|permitted use of (?:AI|artificial intelligence)|collusion)\b/ig})
]);

function compactExcerpt(text, index, length) {
    const start = Math.max(0, index - 110);
    const end = Math.min(text.length, index + length + 210);
    const value = text.slice(start, end).replace(/^\S*\s*/, start ? "… " : "").replace(/\s*\S*$/, end < text.length ? " …" : "").trim();
    return value.slice(0, ContractModel.EXTRACTION_LIMITS.excerpt);
}

class StudRequirementsContractService {
    constructor(options = {}) {
        if (!options.store) throw new Error("StudAcademicStore is required.");
        this.store = options.store;
        this.repository = options.repository || new StudRequirementsContractRepository(this.store);
        this.db = this.repository.db;
    }

    state(assignmentId) {
        const state = this.repository.assignmentState(assignmentId);
        if (state.current) this.refreshFreshness(state.current.id);
        return this.repository.assignmentState(assignmentId);
    }

    createDraft(assignmentId) {
        const draft = this.repository.createDraft(assignmentId);
        if (draft.coverage || draft.candidates.length) return draft;
        const generated = this.generateCandidates(draft.assignmentId);
        return this.repository.addCandidateRun(draft.id, draft.rowVersion, generated.coverage, generated.candidates);
    }

    assignmentSource(assignment, field, presentationLabel, excerpt = null) {
        const provenance = this.db.prepare("SELECT * FROM stud_provenance_records WHERE entity_type='ASSIGNMENT' AND entity_id=? AND field=? ORDER BY observed_at DESC,created_at DESC LIMIT 1").get(assignment.id, field);
        const external = this.db.prepare("SELECT * FROM stud_external_identifiers WHERE entity_type='ASSIGNMENT' AND entity_id=? ORDER BY CASE WHEN namespace LIKE 'MOODLE%' THEN 0 ELSE 1 END,created_at DESC LIMIT 1").get(assignment.id);
        if (provenance) {
            const snapshot = {id: provenance.id, observedValue: provenance.observed_value, sourceType: provenance.source_type, sourceId: provenance.source_id, observedAt: provenance.observed_at, metadata: provenance.metadata_json || null};
            const hash = ContractModel.sha256(snapshot);
            return {sourceKind: "PROVENANCE_RECORD", sourceEntityType: "ASSIGNMENT", sourceEntityId: assignment.id, sourceField: field, provenanceId: provenance.id, externalIdentifierId: external && external.id || null, sourceVersionHash: hash, snapshotHash: hash, presentationLabel, excerpt, metadata: {authority: provenance.source_authority, sourceType: provenance.source_type}};
        }
        const snapshot = {assignmentId: assignment.id, field, value: assignment[field] ?? null};
        const hash = ContractModel.sha256(snapshot);
        return {sourceKind: "ASSIGNMENT_FIELD", sourceEntityType: "ASSIGNMENT", sourceEntityId: assignment.id, sourceField: field, externalIdentifierId: external && external.id || null, sourceVersionHash: hash, snapshotHash: hash, presentationLabel, excerpt};
    }

    documentSource(document, extraction, chunk, excerpt) {
        const snapshotHash = ContractModel.sha256({documentId: document.id, extractionId: extraction.id, chunkId: chunk.id, pageStart: chunk.page_start, pageEnd: chunk.page_end, contentHash: chunk.content_hash});
        const sourceVersionHash = ContractModel.sha256({documentId: document.id, checksum: document.checksum, extractionId: extraction.id, extractionStatus: document.extraction_status, engine: extraction.engine, engineVersion: extraction.engine_version});
        return {sourceKind: "ACADEMIC_DOCUMENT_CHUNK", sourceEntityType: "ACADEMIC_DOCUMENT", sourceEntityId: document.id, documentId: document.id, extractionId: extraction.id, chunkId: chunk.id, pageStart: chunk.page_start, pageEnd: chunk.page_end, contentHash: chunk.content_hash, sourceVersionHash, snapshotHash, presentationLabel: `${document.title} · PAGE ${chunk.page_start || "?"}`, excerpt};
    }

    extractText(text, source, output) {
        const value = String(text || "").replace(/\s+/g, " ").trim();
        if (!value) return;
        PATTERNS.forEach(pattern => {
            pattern.expression.lastIndex = 0;
            let match; let count = 0;
            while ((match = pattern.expression.exec(value)) && count < 4 && output.length < ContractModel.EXTRACTION_LIMITS.candidates) {
                count += 1;
                const display = pattern.concise ? match[0].trim() : compactExcerpt(value, match.index, match[0].length);
                const sourceRef = source(match, compactExcerpt(value, match.index, match[0].length));
                const candidateKey = ContractModel.sha256({type: pattern.type, label: pattern.label, display: display.toLocaleLowerCase("en-GB"), source: sourceRef.snapshotHash});
                if (!output.some(item => item.candidateKey === candidateKey)) output.push({candidateKey, type: pattern.type, subtype: null, label: pattern.label, originalValue: match[0], displayValue: display, normalizedValue: match[0].replace(/\s+/g, " ").trim(), unit: pattern.unit || null, resolutionState: "RESOLVED", extractionMethod: "BOUNDED_DETERMINISTIC_PATTERN", confidence: "MEDIUM", sources: [sourceRef]});
                if (match[0].length === 0) pattern.expression.lastIndex += 1;
            }
        });
    }

    generateCandidates(assignmentId) {
        const assignment = this.repository.requireAssignment(assignmentId);
        const candidates = [];
        const addDirect = (type, label, field, value, unit = null) => {
            if (value === null || value === undefined || value === "") return;
            const source = this.assignmentSource(assignment, field, `Canonical Assignment · ${label}`, String(value));
            const display = typeof value === "number" && unit ? `${value}${unit}` : String(value);
            const candidateKey = ContractModel.sha256({type, label, display, source: source.snapshotHash});
            candidates.push({candidateKey, type, label, originalValue: display, displayValue: display, normalizedValue: String(value), unit, resolutionState: "RESOLVED", extractionMethod: "CANONICAL_ASSIGNMENT_FIELD", confidence: "HIGH", sources: [source]});
        };
        addDirect("DEADLINE", "DUE DATE", "dueDate", assignment.dueDate);
        addDirect("OTHER", "ASSESSMENT WEIGHT", "weight", assignment.weight, "%");
        this.extractText(assignment.description, (_match, excerpt) => this.assignmentSource(assignment, "description", "Canonical Assignment · Description", excerpt), candidates);

        const allDocuments = this.store.listAcademicDocuments({assignmentId: assignment.id, limit: 100});
        const documents = allDocuments.slice(0, ContractModel.EXTRACTION_LIMITS.documents);
        let indexableDocuments = 0; let inspectedDocuments = 0; let ocrRequiredDocuments = 0; let chunksInspected = 0; let truncationReached = allDocuments.length > documents.length;
        for (const document of documents) {
            const row = this.db.prepare("SELECT * FROM stud_academic_documents WHERE id=?").get(document.id);
            const extraction = this.db.prepare("SELECT * FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(document.id);
            if (document.extractionStatus === "OCR_REQUIRED") ocrRequiredDocuments += 1;
            if (!extraction || !["READY", "PARTIAL"].includes(document.extractionStatus)) continue;
            indexableDocuments += 1;
            const remaining = ContractModel.EXTRACTION_LIMITS.chunks - chunksInspected;
            if (remaining <= 0) { truncationReached = true; break; }
            const chunks = this.db.prepare("SELECT * FROM stud_document_chunks WHERE extraction_id=? ORDER BY ordinal LIMIT ?").all(extraction.id, remaining + 1);
            if (chunks.length) inspectedDocuments += 1;
            if (chunks.length > remaining) truncationReached = true;
            for (const chunk of chunks.slice(0, remaining)) {
                chunksInspected += 1;
                this.extractText(chunk.content, (_match, excerpt) => this.documentSource(row, extraction, chunk, excerpt), candidates);
                if (candidates.length >= ContractModel.EXTRACTION_LIMITS.candidates) { truncationReached = true; break; }
            }
            if (candidates.length >= ContractModel.EXTRACTION_LIMITS.candidates) break;
        }
        return Object.freeze({
            candidates: Object.freeze(candidates.slice(0, ContractModel.EXTRACTION_LIMITS.candidates)),
            coverage: Object.freeze({linkedDocuments: allDocuments.length, indexableDocuments, inspectedDocuments, ocrRequiredDocuments, chunksInspected, truncationReached, bounds: ContractModel.EXTRACTION_LIMITS})
        });
    }

    reviewCandidate(input = {}) {
        Model.assertAllowedKeys(input, ["contractId", "candidateId", "disposition", "expectedVersion"], "Candidate review");
        return this.repository.setCandidateDisposition(input.contractId, input.candidateId, input.disposition, input.expectedVersion);
    }

    addManualRequirement(input = {}) {
        Model.assertAllowedKeys(input, ["contractId", "expectedVersion", "requirement"], "Manual requirement request");
        return this.repository.transaction(() => {
            const contract = this.repository.contractRow(input.contractId);
            this.repository.assertExpected(contract, input.expectedVersion);
            this.repository.assertDraft(contract);
            const requirement = ContractModel.normalizeRequirement(input.requirement);
            const provenance = this.store.createProvenance({entityType: "ASSIGNMENT", entityId: contract.assignmentId, field: "requirementsContract", observedValue: requirement.displayValue || requirement.originalValue || requirement.label, sourceType: "USER", sourceId: contract.id, sourceAuthority: "USER_OVERRIDE", observedAt: Model.now(), metadata: {contractRevision: contract.revision, requirementType: requirement.type, explicit: true}});
            const snapshot = {id: provenance.id, observedValue: provenance.observedValue, sourceType: provenance.sourceType, sourceId: provenance.sourceId, observedAt: provenance.observedAt, metadata: provenance.metadata};
            const hash = ContractModel.sha256(snapshot);
            return this.repository.addManualItem(contract.id, input.expectedVersion, requirement, {sourceKind: "USER_ENTRY", sourceEntityType: "ASSIGNMENT", sourceEntityId: contract.assignmentId, sourceField: "requirementsContract", provenanceId: provenance.id, sourceVersionHash: hash, snapshotHash: hash, presentationLabel: "Student-entered requirement", excerpt: requirement.displayValue || requirement.originalValue || requirement.label, metadata: {explicit: true}});
        });
    }

    updateRequirement(input = {}) {
        Model.assertAllowedKeys(input, ["contractId", "itemId", "expectedVersion", "requirement"], "Requirement update request");
        return this.repository.updateItem(input.contractId, input.itemId, input.expectedVersion, input.requirement);
    }

    removeRequirement(input = {}) {
        Model.assertAllowedKeys(input, ["contractId", "itemId", "expectedVersion"], "Requirement removal request");
        return this.repository.removeItem(input.contractId, input.itemId, input.expectedVersion);
    }

    createRevision(input = {}) {
        Model.assertAllowedKeys(input, ["contractId", "expectedVersion"], "Contract revision request");
        const draft = this.repository.createRevision(input.contractId, input.expectedVersion);
        if (draft.coverage || draft.candidates.length) return draft;
        const generated = this.generateCandidates(draft.assignmentId);
        return this.repository.addCandidateRun(draft.id, draft.rowVersion, generated.coverage, generated.candidates);
    }

    sourceCurrentState(source) {
        if (source.sourceKind === "USER_ENTRY") {
            const assignment = this.db.prepare("SELECT id FROM stud_assignments WHERE id=? AND archived_at IS NULL").get(source.sourceEntityId);
            return assignment ? {condition: "CURRENT"} : {condition: "SOURCE_MISSING", reason: "Assignment for the user-entered requirement is unavailable."};
        }
        if (source.sourceKind === "ASSIGNMENT_FIELD") {
            const assignment = this.store.getEntity("ASSIGNMENT", source.sourceEntityId);
            if (!assignment) return {condition: "SOURCE_MISSING", reason: "Canonical Assignment source is unavailable."};
            const hash = ContractModel.sha256({assignmentId: assignment.id, field: source.sourceField, value: assignment[source.sourceField] ?? null});
            return hash === source.sourceVersionHash ? {condition: "CURRENT"} : {condition: "SOURCE_CHANGED", reason: `Assignment field ${source.sourceField || "unknown"} changed.`};
        }
        if (source.sourceKind === "PROVENANCE_RECORD") {
            const exact = this.db.prepare("SELECT * FROM stud_provenance_records WHERE id=?").get(source.provenanceId);
            if (!exact) return {condition: "SOURCE_MISSING", reason: "Canonical provenance observation is unavailable."};
            const latest = this.db.prepare("SELECT * FROM stud_provenance_records WHERE entity_type=? AND entity_id=? AND field=? ORDER BY observed_at DESC,created_at DESC LIMIT 1").get(source.sourceEntityType, source.sourceEntityId, source.sourceField);
            if (!latest) return {condition: "SOURCE_MISSING", reason: "Current provenance observation is unavailable."};
            const hash = ContractModel.sha256({id: latest.id, observedValue: latest.observed_value, sourceType: latest.source_type, sourceId: latest.source_id, observedAt: latest.observed_at, metadata: latest.metadata_json || null});
            return hash === source.sourceVersionHash ? {condition: "CURRENT"} : {condition: "SOURCE_CHANGED", reason: `A newer ${source.sourceField || "field"} observation differs from the approved source.`};
        }
        if (["ACADEMIC_DOCUMENT_CHUNK", "ACADEMIC_DOCUMENT_STATUS"].includes(source.sourceKind)) {
            const document = this.db.prepare("SELECT * FROM stud_academic_documents WHERE id=? AND archived_at IS NULL").get(source.documentId);
            if (!document) return {condition: "SOURCE_MISSING", reason: "AcademicDocument source is unavailable."};
            const latest = this.db.prepare("SELECT * FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(document.id);
            if (document.extraction_status === "OCR_REQUIRED") return {condition: "OCR_BLOCKED", reason: "The current document requires OCR before its evidence can be inspected."};
            if (!latest) return {condition: "SOURCE_MISSING", reason: "Document extraction source is unavailable."};
            if (source.sourceKind === "ACADEMIC_DOCUMENT_CHUNK") {
                const exact = this.db.prepare("SELECT * FROM stud_document_chunks WHERE id=? AND extraction_id=?").get(source.chunkId, source.extractionId);
                if (!exact) return {condition: "SOURCE_MISSING", reason: "Historical document chunk is unavailable."};
                if (exact.content_hash !== source.contentHash) return {condition: "SOURCE_CHANGED", reason: "Historical chunk content hash no longer matches its approval snapshot."};
            }
            const hash = ContractModel.sha256({documentId: document.id, checksum: document.checksum, extractionId: latest.id, extractionStatus: document.extraction_status, engine: latest.engine, engineVersion: latest.engine_version});
            return hash === source.sourceVersionHash ? {condition: "CURRENT"} : {condition: "SOURCE_CHANGED", reason: "The current document or extraction version differs from the approved evidence."};
        }
        if (source.sourceKind === "EXTERNAL_IDENTIFIER") {
            const current = this.db.prepare("SELECT id FROM stud_external_identifiers WHERE id=?").get(source.externalIdentifierId);
            return current ? {condition: "CURRENT"} : {condition: "SOURCE_MISSING", reason: "External identifier is unavailable."};
        }
        return {condition: "SOURCE_MISSING", reason: "Unsupported source reference."};
    }

    evaluateFreshness(contractId) {
        const contract = this.repository.hydrate(contractId);
        const seen = new Set(); const details = [];
        [...contract.candidates, ...contract.items].flatMap(item => item.sources || []).forEach(source => {
            if (seen.has(source.id)) return; seen.add(source.id);
            const result = this.sourceCurrentState(source);
            if (result.condition !== "CURRENT") details.push({sourceId: source.id, condition: result.condition, reason: result.reason});
        });
        const priority = ["SOURCE_MISSING", "OCR_BLOCKED", "SOURCE_CHANGED"];
        return {condition: priority.find(value => details.some(item => item.condition === value)) || "CURRENT", details};
    }

    refreshFreshness(contractId) {
        const contract = this.repository.hydrate(contractId);
        if (contract.lifecycle === "DRAFT") return contract;
        const result = this.evaluateFreshness(contract.id);
        return this.repository.setFreshness(contract.id, result.condition, result.details);
    }

    approve(input = {}) {
        Model.assertAllowedKeys(input, ["contractId", "expectedVersion", "approveAsIncomplete"], "Contract approval request");
        const result = this.evaluateFreshness(input.contractId);
        this.repository.setFreshness(input.contractId, result.condition, result.details);
        return this.repository.approve(input.contractId, input.expectedVersion, input.approveAsIncomplete === true, "USER");
    }

    sourcePreview(input = {}) {
        Model.assertAllowedKeys(input, ["sourceId"], "Requirement source preview request");
        return this.repository.sourceDetail(input.sourceId);
    }
}

module.exports = {StudRequirementsContractService, PATTERNS};
