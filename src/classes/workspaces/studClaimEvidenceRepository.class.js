"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studClaimEvidenceModel.class.js");

function camel(row) {
    if (!row) return null;
    const value = {};
    Object.entries(row).forEach(([key, item]) => { value[key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())] = item; });
    return value;
}

function parseJson(value) { if (!value) return null; try { return JSON.parse(value); } catch (error) { return null; } }
function freezeRow(row) { if (!row) return null; const value = camel(row); if (Object.prototype.hasOwnProperty.call(value, "locatorJson")) value.locator = parseJson(value.locatorJson); return Object.freeze(value); }

class StudClaimEvidenceRepository {
    constructor(store) {
        if (!store) throw new Error("StudAcademicStore is required.");
        this.store = store;
        this.store.initialize();
        this.db = store.db;
    }

    transaction(work) { return this.store.transaction(work); }
    claim(id) { const row = freezeRow(this.db.prepare("SELECT * FROM stud_claims WHERE id=?").get(Academic.safeId(id, "Claim ID"))); if (!row) throw new Academic.StudError("NOT_FOUND", "Claim does not exist."); return row; }
    evidence(id) { const row = freezeRow(this.db.prepare("SELECT * FROM stud_evidence_records WHERE id=?").get(Academic.safeId(id, "Evidence ID"))); if (!row) throw new Academic.StudError("NOT_FOUND", "Evidence does not exist."); return row; }
    link(id) { const row = freezeRow(this.db.prepare("SELECT * FROM stud_claim_evidence_links WHERE id=?").get(Academic.safeId(id, "Claim-Evidence link ID"))); if (!row) throw new Academic.StudError("NOT_FOUND", "Claim-Evidence assessment does not exist."); return row; }
    assertVersion(row, expected, code) { const value = Domain.expectedVersion(expected); if (row.rowVersion !== value) throw new Academic.StudError(code, "This academic record changed in another operation. Reload before saving.", {expected: value, actual: row.rowVersion}); }

    requirementLinks(claimId) {
        return Object.freeze(this.db.prepare(`SELECT l.requirement_item_id,l.requirement_snapshot_hash,i.requirement_type,i.label,i.display_value,i.resolution_state
            FROM stud_claim_requirements l JOIN stud_requirement_items i ON i.id=l.requirement_item_id
            WHERE l.claim_id=? ORDER BY i.item_order,i.id`).all(claimId).map(freezeRow));
    }

    hydrateClaim(id) {
        const claim = this.claim(id);
        return Object.freeze({...claim, requirements: this.requirementLinks(claim.id)});
    }

    listClaims(options) {
        const where = ["p.assignment_id=?"], args = [options.assignmentId];
        if (options.planId) { where.push("COALESCE(d.plan_id,r.plan_id)=?"); args.push(options.planId); }
        if (options.topicId) { where.push("COALESCE(d.topic_id,r.topic_id)=?"); args.push(options.topicId); }
        if (options.lifecycle) { where.push("COALESCE(d.lifecycle,r.lifecycle)=?"); args.push(options.lifecycle); }
        if (options.beforeUpdatedAt) { where.push("COALESCE(d.updated_at,r.updated_at)<?"); args.push(options.beforeUpdatedAt); }
        args.push(options.limit);
        return Object.freeze(this.db.prepare(`SELECT COALESCE(d.id,r.id) selected_claim_id,p.claim_key,p.current_reviewed_claim_id,p.current_draft_claim_id
            FROM stud_claim_pointers p
            LEFT JOIN stud_claims d ON d.id=p.current_draft_claim_id
            LEFT JOIN stud_claims r ON r.id=p.current_reviewed_claim_id
            WHERE ${where.join(" AND ")} ORDER BY COALESCE(d.updated_at,r.updated_at) DESC,p.claim_key DESC LIMIT ?`).all(...args).map(row => {
                const value = this.hydrateClaim(row.selected_claim_id);
                return Object.freeze({...value, currentReviewedClaimId: row.current_reviewed_claim_id || null, currentDraftClaimId: row.current_draft_claim_id || null});
            }));
    }

    claimHistory(claimKey) {
        return Object.freeze(this.db.prepare("SELECT * FROM stud_claims WHERE claim_key=? ORDER BY revision DESC LIMIT 100").all(claimKey).map(freezeRow));
    }

    insertClaim(value) {
        const id = Academic.createId("claim"), timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_claims (id,claim_key,assignment_id,plan_id,topic_id,research_question_id,workflow_node_id,claim_text,claim_type,origin,lifecycle,revision,parent_claim_id,parent_semantic_claim_id,rationale,user_notes,claim_hash,row_version,created_at,updated_at,reviewed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,?,NULL,1,?,?,NULL)`).run(id,value.claimKey,value.assignmentId,value.planId,value.topicId,value.researchQuestionId,value.workflowNodeId,value.text,value.type,value.origin,value.revision,value.parentClaimId,value.parentSemanticClaimId,value.rationale,value.userNotes,timestamp,timestamp);
        this.db.prepare(`INSERT INTO stud_claim_pointers (claim_key,assignment_id,current_reviewed_claim_id,current_draft_claim_id,updated_at) VALUES (?,?,NULL,?,?)
            ON CONFLICT(claim_key) DO UPDATE SET current_draft_claim_id=excluded.current_draft_claim_id,updated_at=excluded.updated_at`).run(value.claimKey,value.assignmentId,id,timestamp);
        return this.hydrateClaim(id);
    }

    replaceRequirements(claimId, links) {
        this.db.prepare("DELETE FROM stud_claim_requirements WHERE claim_id=?").run(claimId);
        const timestamp = Academic.now();
        links.forEach(link => this.db.prepare("INSERT INTO stud_claim_requirements (claim_id,requirement_item_id,requirement_snapshot_hash,created_at) VALUES (?,?,?,?)").run(claimId,link.id,link.snapshotHash,timestamp));
    }

    updateDraftClaim(value) {
        const result = this.db.prepare(`UPDATE stud_claims SET plan_id=?,topic_id=?,research_question_id=?,workflow_node_id=?,parent_semantic_claim_id=?,claim_text=?,claim_type=?,rationale=?,user_notes=?,row_version=row_version+1,updated_at=?
            WHERE id=? AND lifecycle='DRAFT' AND row_version=?`).run(value.planId,value.topicId,value.researchQuestionId,value.workflowNodeId,value.parentSemanticClaimId,value.text,value.type,value.rationale,value.userNotes,Academic.now(),value.id,value.expectedVersion);
        if (!result.changes) throw new Academic.StudError("STALE_CLAIM_VERSION", "Claim changed before the update completed, or is no longer a Draft.");
        return this.hydrateClaim(value.id);
    }

    reviewClaim(id, expectedVersion, hash) {
        const timestamp = Academic.now();
        const claim = this.claim(id);
        const pointer = this.db.prepare("SELECT current_reviewed_claim_id FROM stud_claim_pointers WHERE claim_key=?").get(claim.claimKey);
        const result = this.db.prepare("UPDATE stud_claims SET lifecycle='REVIEWED',claim_hash=?,row_version=row_version+1,updated_at=?,reviewed_at=? WHERE id=? AND lifecycle='DRAFT' AND row_version=?").run(hash,timestamp,timestamp,id,expectedVersion);
        if (!result.changes) throw new Academic.StudError("STALE_CLAIM_VERSION", "Claim changed before review, or is no longer a Draft.");
        if (pointer && pointer.current_reviewed_claim_id) this.db.prepare("UPDATE stud_claims SET lifecycle='SUPERSEDED',row_version=row_version+1,updated_at=? WHERE id=? AND lifecycle='REVIEWED'").run(timestamp,pointer.current_reviewed_claim_id);
        this.db.prepare("UPDATE stud_claim_pointers SET current_reviewed_claim_id=?,current_draft_claim_id=NULL,updated_at=? WHERE claim_key=?").run(id,timestamp,claim.claimKey);
        return this.hydrateClaim(id);
    }

    insertEvidence(value) {
        const id = Academic.createId("evidence"), timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_evidence_records (id,assignment_id,plan_id,topic_id,dossier_item_id,source_object_type,source_object_id,artifact_id,citation_paper_id,location_type,document_id,extraction_id,chunk_id,page_start,page_end,locator_json,excerpt,source_snapshot_hash,extraction_method,review_state,reviewer_note,origin,evidence_hash,row_version,created_at,updated_at,reviewed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'UNREVIEWED',?,?,NULL,1,?,?,NULL)`).run(id,value.assignmentId,value.planId,value.topicId,value.dossierItemId,value.sourceObjectType,value.sourceObjectId,value.artifactId,value.citationPaperId,value.locationType,value.documentId,value.extractionId,value.chunkId,value.pageStart,value.pageEnd,value.locatorJson,value.excerpt,value.sourceSnapshotHash,value.extractionMethod,value.reviewerNote,value.origin,timestamp,timestamp);
        return this.evidence(id);
    }

    updateEvidence(value) {
        const result = this.db.prepare(`UPDATE stud_evidence_records SET citation_paper_id=?,locator_json=?,excerpt=?,reviewer_note=?,row_version=row_version+1,updated_at=? WHERE id=? AND review_state='UNREVIEWED' AND row_version=?`).run(value.citationPaperId,value.locatorJson,value.excerpt,value.reviewerNote,Academic.now(),value.id,value.expectedVersion);
        if (!result.changes) throw new Academic.StudError("STALE_EVIDENCE_VERSION", "Evidence changed before the update completed, or is no longer unreviewed.");
        return this.evidence(value.id);
    }

    reviewEvidence(id, expectedVersion, hash) {
        const timestamp = Academic.now();
        const result = this.db.prepare("UPDATE stud_evidence_records SET review_state='REVIEWED',evidence_hash=?,row_version=row_version+1,updated_at=?,reviewed_at=? WHERE id=? AND review_state='UNREVIEWED' AND row_version=?").run(hash,timestamp,timestamp,id,expectedVersion);
        if (!result.changes) throw new Academic.StudError("STALE_EVIDENCE_VERSION", "Evidence changed before review, or is no longer unreviewed.");
        return this.evidence(id);
    }

    listEvidence(options) {
        const where=["assignment_id=?"], args=[options.assignmentId];
        if (options.planId) { where.push("plan_id=?"); args.push(options.planId); }
        if (options.topicId) { where.push("topic_id=?"); args.push(options.topicId); }
        if (options.reviewState) { where.push("review_state=?"); args.push(options.reviewState); }
        if (options.beforeUpdatedAt) { where.push("updated_at<?"); args.push(options.beforeUpdatedAt); }
        args.push(options.limit);
        return Object.freeze(this.db.prepare(`SELECT * FROM stud_evidence_records WHERE ${where.join(" AND ")} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...args).map(freezeRow));
    }

    insertLink(value) {
        const id=Academic.createId("claim_evidence"), timestamp=Academic.now();
        this.db.prepare(`INSERT INTO stud_claim_evidence_links (id,assignment_id,claim_id,evidence_id,relationship_type,lifecycle,revision,parent_link_id,rationale,origin,row_version,created_at,updated_at,reviewed_at)
            VALUES (?,?,?,?,?,'DRAFT',?,?,?, ?,1,?,?,NULL)`).run(id,value.assignmentId,value.claimId,value.evidenceId,value.relationshipType,value.revision,value.parentLinkId,value.rationale,value.origin,timestamp,timestamp);
        return this.link(id);
    }

    updateLink(value) {
        const result=this.db.prepare("UPDATE stud_claim_evidence_links SET relationship_type=?,rationale=?,row_version=row_version+1,updated_at=? WHERE id=? AND lifecycle='DRAFT' AND row_version=?").run(value.relationshipType,value.rationale,Academic.now(),value.id,value.expectedVersion);
        if(!result.changes) throw new Academic.StudError("STALE_CLAIM_EVIDENCE_VERSION","Claim-Evidence assessment changed before the update completed, or is no longer a Draft.");
        return this.link(value.id);
    }

    reviewLink(id, expectedVersion) {
        const timestamp=Academic.now(), current=this.link(id);
        const previous=this.db.prepare("SELECT id FROM stud_claim_evidence_links WHERE claim_id=? AND evidence_id=? AND lifecycle='REVIEWED' ORDER BY revision DESC LIMIT 1").get(current.claimId,current.evidenceId);
        const result=this.db.prepare("UPDATE stud_claim_evidence_links SET lifecycle='REVIEWED',row_version=row_version+1,updated_at=?,reviewed_at=? WHERE id=? AND lifecycle='DRAFT' AND row_version=?").run(timestamp,timestamp,id,expectedVersion);
        if(!result.changes) throw new Academic.StudError("STALE_CLAIM_EVIDENCE_VERSION","Claim-Evidence assessment changed before review, or is no longer a Draft.");
        if(previous)this.db.prepare("UPDATE stud_claim_evidence_links SET lifecycle='SUPERSEDED',row_version=row_version+1,updated_at=? WHERE id=?").run(timestamp,previous.id);
        return this.link(id);
    }

    linksForClaim(claimId, limit = 500) {
        return Object.freeze(this.db.prepare(`SELECT l.*,e.source_object_type,e.source_object_id,e.review_state evidence_review_state,e.excerpt,e.citation_paper_id,e.source_snapshot_hash
            FROM stud_claim_evidence_links l JOIN stud_evidence_records e ON e.id=l.evidence_id
            WHERE l.claim_id=? AND l.lifecycle IN ('DRAFT','REVIEWED') ORDER BY l.updated_at DESC,l.id DESC LIMIT ?`).all(claimId,limit).map(freezeRow));
    }

    linksForAssignment(assignmentId, limit = Domain.LIMITS.mapEvidence) {
        return Object.freeze(this.db.prepare(`SELECT l.* FROM stud_claim_evidence_links l
            WHERE l.assignment_id=? AND l.lifecycle IN ('DRAFT','REVIEWED') ORDER BY l.updated_at DESC,l.id DESC LIMIT ?`).all(assignmentId,limit).map(freezeRow));
    }
}

module.exports = Object.freeze({StudClaimEvidenceRepository, camel, freezeRow});
