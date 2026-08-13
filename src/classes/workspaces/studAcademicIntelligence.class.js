"use strict";

// STUD Academic Intelligence is deliberately deterministic and local. It is
// a bounded index/traversal layer over canonical records, never an LLM, a
// provider client, a filesystem scanner or another persistence database.
const Model = require("./studAcademicModel.class.js");

const ROOT_TYPES = Object.freeze(["COURSE", "ASSIGNMENT", "RESEARCH_PAPER", "ACADEMIC_DOCUMENT", "NOTE", "REVISION_ITEM"]);
const CANDIDATE_TYPES = Object.freeze(["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT"]);
const STOP_WORDS = new Set([
    "about", "after", "again", "also", "and", "are", "assignment", "been", "between", "but", "course", "con", "del", "desde", "document", "each", "el", "en", "for", "from", "have", "into", "las", "los", "more", "not", "notes", "para", "por", "que", "research", "source", "that", "the", "their", "this", "through", "under", "with", "your"
]);
const LIMITS = Object.freeze({
    candidates: 80,
    concepts: 120,
    conceptsPerSource: 40,
    documents: 24,
    chunks: 80,
    packageText: 120000,
    graphNodes: 40,
    graphEdges: 80,
    search: 60
});

function normalizeTerm(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function termsFromText(value, limit = LIMITS.conceptsPerSource) {
    const frequencies = new Map();
    const words = normalizeTerm(value).match(/[\p{L}\p{N}]{3,}/gu) || [];
    words.forEach(word => {
        if (STOP_WORDS.has(word) || /^\d+$/.test(word)) return;
        frequencies.set(word, (frequencies.get(word) || 0) + 1);
    });
    return [...frequencies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
        .map(([term, frequency]) => Object.freeze({term, frequency}));
}

function entityText(entity) {
    return [entity.title, entity.description, entity.abstract, entity.content, entity.prompt, entity.answer, entity.authors, entity.venue, entity.publisher, entity.documentType, entity.capability, entity.tool, entity.operation].filter(Boolean).join(" ");
}

function uniqueById(items) {
    const seen = new Set();
    return items.filter(item => {
        const key = `${item.entityType}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseMetadata(value, fallback = {}) { try { return value ? JSON.parse(value) : fallback; } catch (_error) { return fallback; } }

class StudAcademicIntelligence {
    constructor(store) { this.store = store; }

    assertRoot(rootType, rootId) {
        const type = Model.enumValue(rootType, ROOT_TYPES, "Academic context root type");
        const id = Model.safeId(rootId, "Academic context root ID");
        const entity = this.store.getEntity(type, id);
        if (!entity) throw new Model.StudError("NOT_FOUND", "Academic context root does not exist.");
        return Object.freeze({type, id, entity});
    }

    entityByEndpoint(type, id) {
        if (!CANDIDATE_TYPES.includes(type)) return null;
        return this.store.getEntity(type, id);
    }

    candidate(entity, relationStatus, reasons, metadata = {}) {
        return Object.freeze({entityType: entity.entityType, entityId: entity.id, title: entity.title || entity.prompt || "LOCAL ACADEMIC OBJECT", relationStatus, reasons: Object.freeze([...new Set(reasons)]), metadata: Object.freeze(metadata), entity});
    }

    directCandidates(root) {
        const results = [this.candidate(root.entity, "DIRECT", ["Selected academic context root"] )];
        const relationships = this.store.listRelationships(root.type, root.id);
        relationships.forEach(relationship => {
            const isSource = relationship.fromType === root.type && relationship.fromId === root.id;
            const other = this.entityByEndpoint(isSource ? relationship.toType : relationship.fromType, isSource ? relationship.toId : relationship.fromId);
            if (other) results.push(this.candidate(other, "DIRECT", [`Explicit ${relationship.relationType.replace(/_/g, " ")} relationship`], {relationshipId: relationship.id, relationType: relationship.relationType}));
        });
        return results;
    }

    derivedCandidates(root) {
        const results = [];
        const add = (entity, reason) => { if (entity && entity.id !== root.id) results.push(this.candidate(entity, "DERIVED", [reason])); };
        if (root.type === "ASSIGNMENT") {
            const assignment = root.entity;
            if (assignment.courseId) {
                add(this.store.getEntity("COURSE", assignment.courseId), "Assignment belongs to selected Course");
                ["RESOURCE", "NOTE", "ACADEMIC_DOCUMENT", "COMPUTE_RESULT"].forEach(type => this.store.listEntities(type, {courseId: assignment.courseId, limit: 100}).forEach(entity => add(entity, "Shares selected Assignment Course")));
            }
            ["RESOURCE", "NOTE", "ACADEMIC_DOCUMENT", "COMPUTE_RESULT"].forEach(type => this.store.listEntities(type, {assignmentId: assignment.id, limit: 100}).forEach(entity => add(entity, "Assigned to selected Assignment")));
            this.store.listRevisionItems({courseId: assignment.courseId || undefined, limit: 100}).filter(item => item.sourceId === assignment.id).forEach(item => add(item, "Revision item sourced from selected Assignment"));
        } else if (root.type === "COURSE") {
            ["ASSIGNMENT", "RESOURCE", "NOTE", "ACADEMIC_DOCUMENT", "COMPUTE_RESULT"].forEach(type => this.store.listEntities(type, {courseId: root.id, limit: 100}).forEach(entity => add(entity, "Belongs to selected Course")));
            this.store.listRevisionItems({courseId: root.id, limit: 100}).forEach(entity => add(entity, "Belongs to selected Course"));
        } else {
            const entity = root.entity;
            if (entity.assignmentId) add(this.store.getEntity("ASSIGNMENT", entity.assignmentId), "Canonical Assignment context");
            if (entity.courseId) add(this.store.getEntity("COURSE", entity.courseId), "Canonical Course context");
        }
        return results;
    }

    suggestedCandidates(root, max = 24) {
        const rootTerms = termsFromText(entityText(root.entity), 8).map(item => item.term);
        if (!rootTerms.length) return [];
        const matches = new Map();
        rootTerms.forEach(term => {
            try {
                this.store.search(term, {limit: 20}).forEach(result => {
                    if (result.entityId === root.id || !CANDIDATE_TYPES.includes(result.entityType)) return;
                    const current = matches.get(`${result.entityType}:${result.entityId}`) || {result, terms: []};
                    current.terms.push(term); matches.set(`${result.entityType}:${result.entityId}`, current);
                });
            } catch (_error) {}
        });
        return [...matches.values()].filter(item => item.terms.length > 0).sort((a, b) => b.terms.length - a.terms.length || a.result.title.localeCompare(b.result.title)).slice(0, max)
            .map(item => this.entityByEndpoint(item.result.entityType, item.result.entityId)).filter(Boolean)
            .map(entity => {
                const data = matches.get(`${entity.entityType}:${entity.id}`);
                return this.candidate(entity, "SUGGESTED", [`Matching indexed terminology: ${data.terms.slice(0, 4).join(", ")}`], {matchingTerms: data.terms.slice(0, 8)});
            });
    }

    conflictsFor(entity) {
        const values = new Map();
        this.store.listProvenance(entity.entityType, entity.id).forEach(item => {
            if (!item.observedValue) return;
            const key = item.field;
            const set = values.get(key) || new Set(); set.add(String(item.observedValue)); values.set(key, set);
        });
        return [...values.entries()].filter(([, set]) => set.size > 1).map(([field, set]) => Object.freeze({field, values: Object.freeze([...set].slice(0, 5))}));
    }

    decisions(root) {
        const rows = this.store.db.prepare("SELECT * FROM stud_context_decisions WHERE root_type=? AND root_id=? ORDER BY updated_at DESC").all(root.type, root.id);
        const mapped = new Map();
        rows.forEach(row => {
            const value = {...row, metadata: parseMetadata(row.metadata_json, {})};
            const key = `${value.candidate_type}:${value.candidate_id}`;
            if (!mapped.has(key)) mapped.set(key, value);
        });
        return mapped;
    }

    build(rootType, rootId, options = {}) {
        Model.assertAllowedKeys(options, ["limit", "includeSuggested", "refreshConcepts"], "Academic context build options");
        const root = this.assertRoot(rootType, rootId);
        const cap = Math.max(1, Math.min(Number(options.limit) || LIMITS.candidates, LIMITS.candidates));
        const choices = new Map();
        [...this.directCandidates(root), ...this.derivedCandidates(root), ...(options.includeSuggested === false ? [] : this.suggestedCandidates(root))].forEach(item => {
            const key = `${item.entityType}:${item.entityId}`;
            const previous = choices.get(key);
            const rank = {DIRECT: 4, DERIVED: 3, SUGGESTED: 2};
            if (!previous || rank[item.relationStatus] > rank[previous.relationStatus]) choices.set(key, item);
            else choices.set(key, Object.freeze({...previous, reasons: Object.freeze([...new Set([...previous.reasons, ...item.reasons])])}));
        });
        const decisions = this.decisions(root);
        const evaluated = [...choices.values()].map(item => {
            const decision = decisions.get(`${item.entityType}:${item.entityId}`);
            const conflicts = this.conflictsFor(item.entity);
            return Object.freeze({...item, decision: decision ? decision.decision : null, decisionReason: decision ? decision.reason : null, conflicts, relationStatus: conflicts.length ? "CONFLICTING" : item.relationStatus});
        });
        // Excluded material is omitted from relevance, coverage, graph and a
        // Context Package, but stays separately inspectable for an explicit
        // restore. An exclusion is a user decision, never a deletion.
        const excludedCandidates = evaluated.filter(item => item.decision === "EXCLUDE");
        const candidates = evaluated.filter(item => item.decision !== "EXCLUDE").sort((a, b) => {
            const decisionRank = {PIN: 0, INCLUDE: 1, null: 2};
            const relationshipRank = {DIRECT: 0, DERIVED: 1, CONFLICTING: 2, SUGGESTED: 3};
            return (decisionRank[a.decision] ?? 2) - (decisionRank[b.decision] ?? 2) || (relationshipRank[a.relationStatus] ?? 9) - (relationshipRank[b.relationStatus] ?? 9) || a.title.localeCompare(b.title);
        });
        const omitted = candidates.length > cap ? candidates.slice(cap).map(item => ({entityType: item.entityType, entityId: item.entityId, reason: "CONTEXT_CANDIDATE_LIMIT"})) : [];
        const visible = candidates.slice(0, cap);
        if (options.refreshConcepts !== false) this.indexConcepts(root, visible);
        const concepts = this.conceptsFor(root, visible);
        const coverage = root.type === "ASSIGNMENT" ? this.assignmentCoverage(root, visible, concepts) : {status: visible.length > 1 ? "AVAILABLE" : "INSUFFICIENT_CONTEXT", concepts: Object.freeze([]), sourceSupport: Object.freeze([]), message: visible.length > 1 ? "Context material is available locally." : "Selected context has insufficient linked local material."};
        const graph = this.graph(root, visible);
        return Object.freeze({root: root.entity, rootType: root.type, candidates: Object.freeze(visible), excludedCandidates: Object.freeze(excludedCandidates), concepts: Object.freeze(concepts), coverage: Object.freeze(coverage), graph: Object.freeze(graph), omitted: Object.freeze(omitted), status: visible.length > 1 ? (omitted.length ? "TRUNCATED" : "READY") : "INSUFFICIENT_CONTEXT", generatedAt: Model.now(), policy: Object.freeze({offline: true, providersInvoked: false, llmInvoked: false, automaticPersistence: false})});
    }

    indexConcepts(root, candidates) {
        const all = uniqueById([root.entity, ...candidates.map(item => item.entity)]).slice(0, LIMITS.candidates);
        const insertConcept = this.store.db.prepare("INSERT INTO stud_academic_concepts (id,term,normalized_term,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(normalized_term) DO UPDATE SET updated_at=excluded.updated_at");
        const getConcept = this.store.db.prepare("SELECT id FROM stud_academic_concepts WHERE normalized_term=?");
        const insertObservation = this.store.db.prepare("INSERT OR IGNORE INTO stud_concept_observations (id,concept_id,entity_type,entity_id,document_id,chunk_id,page_start,extraction_method,confidence,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
        this.store.transaction(() => all.forEach(entity => {
            const sources = [{text: entityText(entity), documentId: entity.entityType === "ACADEMIC_DOCUMENT" ? entity.id : null, chunkId: null, pageStart: null, method: "CANONICAL_METADATA"}];
            if (entity.entityType === "ACADEMIC_DOCUMENT") {
                const chunks = this.store.db.prepare("SELECT id,content,page_start FROM stud_document_chunks WHERE extraction_id=(SELECT id FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC LIMIT 1) ORDER BY ordinal LIMIT 80").all(entity.id);
                chunks.forEach(chunk => sources.push({text: chunk.content, documentId: entity.id, chunkId: chunk.id, pageStart: chunk.page_start, method: "DOCUMENT_CHUNK"}));
            }
            sources.forEach(source => termsFromText(source.text).forEach(({term, frequency}) => {
                const normalized = normalizeTerm(term); const timestamp = Model.now(); const id = Model.createId("academic_concept");
                insertConcept.run(id, term, normalized, timestamp, timestamp);
                const concept = getConcept.get(normalized);
                // SQLite UNIQUE treats NULL as distinct, so canonical metadata
                // observations use a stable empty chunk marker. Rebuilding a
                // context therefore refreshes the index without accumulating
                // an invisible duplicate history.
                insertObservation.run(Model.createId("concept_observation"), concept.id, entity.entityType, entity.id, source.documentId, source.chunkId || "", source.pageStart, source.method, frequency > 2 ? "MEDIUM" : "LOW", JSON.stringify({frequency}), timestamp);
            }));
        }));
    }

    conceptsFor(root, candidates) {
        const ids = uniqueById([root.entity, ...candidates.map(item => item.entity)]).slice(0, LIMITS.candidates);
        const conditions = ids.map(() => "(entity_type=? AND entity_id=?)").join(" OR ");
        if (!conditions) return [];
        const params = ids.flatMap(entity => [entity.entityType, entity.id]);
        const rows = this.store.db.prepare(`SELECT c.term,c.normalized_term,COUNT(o.id) AS observation_count,MIN(o.entity_type) AS source_type,MIN(o.entity_id) AS source_id,MIN(o.page_start) AS page_start,MIN(o.chunk_id) AS chunk_id FROM stud_concept_observations o JOIN stud_academic_concepts c ON c.id=o.concept_id WHERE ${conditions} GROUP BY c.id ORDER BY observation_count DESC,c.term ASC LIMIT ?`).all(...params, LIMITS.concepts);
        return rows.map(row => Object.freeze({term: row.term, normalizedTerm: row.normalized_term, observationCount: Number(row.observation_count), provenance: Object.freeze({entityType: row.source_type, entityId: row.source_id, pageStart: row.page_start || null, chunkId: row.chunk_id || null})}));
    }

    assignmentCoverage(root, candidates, concepts) {
        const assignmentTerms = new Set(termsFromText(entityText(root.entity), 30).map(item => item.term));
        if (!assignmentTerms.size) return {status: "INSUFFICIENT_CONTEXT", concepts: Object.freeze([]), sourceSupport: this.noteSupport(candidates), message: "Assignment description has insufficient local terminology for coverage analysis."};
        const contextual = new Set(concepts.map(item => item.normalizedTerm));
        const entries = [...assignmentTerms].map(term => Object.freeze({term, coverage: contextual.has(term) ? "SUPPORTED" : "UNRESOLVED", reasons: contextual.has(term) ? Object.freeze(["Present in locally indexed academic context"]) : Object.freeze(["No supporting local concept observation found"])}));
        const supported = entries.filter(item => item.coverage === "SUPPORTED").length;
        return {status: supported ? (supported === entries.length ? "AVAILABLE" : "PARTIAL") : "INSUFFICIENT_CONTEXT", concepts: Object.freeze(entries), sourceSupport: this.noteSupport(candidates), message: supported ? `${supported} of ${entries.length} assignment concepts have local contextual support.` : "No local material can currently support the identifiable assignment terminology."};
    }

    noteSupport(candidates) {
        return candidates.filter(item => item.entityType === "NOTE").map(item => {
            const relations = this.store.listRelationships("NOTE", item.entityId);
            const sourceLinked = relations.some(relation => ["CITES", "DERIVED_FROM_DOCUMENT", "REFERENCES", "SUPPORTS"].includes(relation.relationType));
            const provenance = this.store.listProvenance("NOTE", item.entityId);
            const status = sourceLinked ? "SOURCE_LINKED" : provenance.some(item => item.sourceType === "USER") ? "USER_AUTHORED" : "UNSUPPORTED_LOCAL";
            return Object.freeze({noteId: item.entityId, title: item.title, status, meaning: status === "UNSUPPORTED_LOCAL" ? "No supporting source relationship is available in local STUD data; this does not mean the note is false." : null});
        });
    }

    graph(root, candidates) {
        const selected = uniqueById([root.entity, ...candidates.map(item => item.entity)]).slice(0, LIMITS.graphNodes);
        const keys = new Set(selected.map(item => `${item.entityType}:${item.id}`));
        const edges = [];
        selected.forEach(entity => this.store.listRelationships(entity.entityType, entity.id).forEach(relation => {
            const from = `${relation.fromType}:${relation.fromId}`; const to = `${relation.toType}:${relation.toId}`;
            if (keys.has(from) && keys.has(to) && !edges.some(edge => edge.id === relation.id)) edges.push(Object.freeze({id: relation.id, from, to, type: relation.relationType, status: "DIRECT"}));
        }));
        candidates.filter(item => item.relationStatus === "SUGGESTED").slice(0, 12).forEach(item => {
            if (edges.length < LIMITS.graphEdges) edges.push(Object.freeze({id: `suggested_${root.id}_${item.entityId}`, from: `${root.type}:${root.id}`, to: `${item.entityType}:${item.entityId}`, type: "CONTEXT_MATCH", status: "SUGGESTED"}));
        });
        return {nodes: Object.freeze(selected.map(entity => Object.freeze({id: `${entity.entityType}:${entity.id}`, entityType: entity.entityType, entityId: entity.id, label: entity.title || entity.prompt || "LOCAL OBJECT"}))), edges: Object.freeze(edges.slice(0, LIMITS.graphEdges)), truncated: selected.length >= LIMITS.graphNodes || edges.length >= LIMITS.graphEdges};
    }

    contextSearch(rootType, rootId, query, options = {}) {
        Model.assertAllowedKeys(options, ["scope", "limit"], "Academic context search options");
        const root = this.assertRoot(rootType, rootId);
        const limit = Math.max(1, Math.min(Number(options.limit) || 30, LIMITS.search));
        const context = this.build(root.type, root.id, {limit: LIMITS.candidates, refreshConcepts: false});
        const candidates = new Map(context.candidates.map(item => [`${item.entityType}:${item.entityId}`, item]));
        const results = this.store.search(query, {limit: LIMITS.search});
        return Object.freeze(results.filter(item => options.scope === "ALL_LOCAL" || candidates.has(`${item.entityType}:${item.entityId}`)).slice(0, limit).map(item => {
            const candidate = candidates.get(`${item.entityType}:${item.entityId}`);
            return Object.freeze({...item, relationshipToContext: candidate ? candidate.relationStatus : "UNRESOLVED", relevanceReason: candidate ? candidate.reasons : ["Local FTS result outside current context"]});
        }));
    }

    decide(rootType, rootId, candidateType, candidateId, decision, reason = null) {
        const root = this.assertRoot(rootType, rootId);
        const type = Model.enumValue(candidateType, CANDIDATE_TYPES, "Academic context candidate type");
        const id = Model.safeId(candidateId, "Academic context candidate ID");
        this.store.requireEntity(type, id);
        const normalizedDecision = Model.enumValue(decision, Model.CONTEXT_DECISIONS, "Academic context decision");
        const rationale = Model.optionalText(reason, "Academic context decision reason", 1000);
        const timestamp = Model.now();
        this.store.transaction(() => {
            this.store.db.prepare("INSERT INTO stud_context_decisions (id,root_type,root_id,candidate_type,candidate_id,decision,reason,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(root_type,root_id,candidate_type,candidate_id) DO UPDATE SET decision=excluded.decision,reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at")
                .run(Model.createId("context_decision"), root.type, root.id, type, id, normalizedDecision, rationale, JSON.stringify({approvedBy: "USER", automatic: false}), timestamp, timestamp);
            this.store.createProvenance({entityType: root.type, entityId: root.id, field: "contextDecision", observedValue: `${normalizedDecision}:${type}:${id}`, sourceType: "USER", sourceId: "ACADEMIC_CONTEXT", sourceAuthority: "USER_OVERRIDE", metadata: {candidateType: type, candidateId: id, reason: rationale}});
        });
        return Object.freeze({rootType: root.type, rootId: root.id, candidateType: type, candidateId: id, decision: normalizedDecision, reason: rationale, decidedAt: timestamp});
    }

    createPackage(rootType, rootId, options = {}) {
        Model.assertAllowedKeys(options, ["candidateIds", "title"], "Academic context package options");
        const root = this.assertRoot(rootType, rootId);
        const context = this.build(root.type, root.id, {limit: LIMITS.candidates});
        const requested = Array.isArray(options.candidateIds) ? new Set(options.candidateIds.slice(0, LIMITS.candidates).map(item => Model.safeId(item, "Context package candidate ID"))) : null;
        const candidates = context.candidates.filter(item => !requested || requested.has(item.entityId)).slice(0, LIMITS.candidates);
        const documents = candidates.filter(item => item.entityType === "ACADEMIC_DOCUMENT").slice(0, LIMITS.documents);
        const chunks = [];
        let totalText = 0;
        documents.forEach(item => {
            const rows = this.store.db.prepare("SELECT id,page_start,page_end,content,content_hash FROM stud_document_chunks WHERE extraction_id=(SELECT id FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC LIMIT 1) ORDER BY ordinal LIMIT ?").all(item.entityId, LIMITS.chunks);
            rows.forEach(row => {
                if (chunks.length >= LIMITS.chunks || totalText + String(row.content).length > LIMITS.packageText) return;
                totalText += String(row.content).length;
                chunks.push({documentId: item.entityId, chunkId: row.id, pageStart: row.page_start, pageEnd: row.page_end, content: row.content, contentHash: row.content_hash});
            });
        });
        const omitted = [...context.omitted, ...(context.candidates.length > candidates.length ? context.candidates.slice(candidates.length).map(item => ({entityType: item.entityType, entityId: item.entityId, reason: "PACKAGE_CANDIDATE_LIMIT"})) : []), ...(chunks.length >= LIMITS.chunks || totalText >= LIMITS.packageText ? [{reason: "PACKAGE_TEXT_LIMIT"}] : [])];
        const status = omitted.length ? "TRUNCATED" : candidates.length > 1 ? "READY" : "INSUFFICIENT_CONTEXT";
        const snapshot = {version: 1, title: Model.optionalText(options.title, "Context package title", 240) || `${root.entity.title || "Academic context"} package`, root: {entityType: root.type, entityId: root.id}, candidates: candidates.map(item => ({entityType: item.entityType, entityId: item.entityId, title: item.title, relationship: item.relationStatus, reasons: item.reasons, decision: item.decision || null})), concepts: context.concepts.slice(0, LIMITS.concepts), coverage: context.coverage, chunks, policy: {llmInvoked: false, providersInvoked: false, offline: true}};
        const timestamp = Model.now(); const id = Model.createId("context_package");
        this.store.db.prepare("INSERT INTO stud_context_packages (id,root_type,root_id,title,status,snapshot_json,omitted_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, root.type, root.id, snapshot.title, status, JSON.stringify(snapshot), JSON.stringify(omitted), timestamp, timestamp);
        this.store.createProvenance({entityType: root.type, entityId: root.id, field: "contextPackage", observedValue: id, sourceType: "LOCAL_EXTRACTION", sourceId: "ACADEMIC_CONTEXT", sourceAuthority: "AUTHORITATIVE", metadata: {status, candidateCount: candidates.length, chunkCount: chunks.length, omitted: omitted.length}});
        return Object.freeze({id, title: snapshot.title, rootType: root.type, rootId: root.id, status, snapshot: Object.freeze(snapshot), omitted: Object.freeze(omitted), createdAt: timestamp});
    }

    listPackages(rootType, rootId, limit = 20) {
        const root = this.assertRoot(rootType, rootId);
        const max = Math.max(1, Math.min(Number(limit) || 20, 100));
        return Object.freeze(this.store.db.prepare("SELECT id,root_type,root_id,title,status,omitted_json,created_at,updated_at FROM stud_context_packages WHERE root_type=? AND root_id=? ORDER BY updated_at DESC LIMIT ?").all(root.type, root.id, max).map(row => Object.freeze({...row, omitted: Object.freeze(parseMetadata(row.omitted_json, []))})));
    }
}

module.exports = Object.freeze({StudAcademicIntelligence, ROOT_TYPES, CANDIDATE_TYPES, LIMITS, normalizeTerm, termsFromText});
