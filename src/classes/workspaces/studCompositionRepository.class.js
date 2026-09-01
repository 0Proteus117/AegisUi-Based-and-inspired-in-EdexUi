"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studCompositionModel.class.js");

function camel(row) {
    if (!row) return null;
    const result = {};
    Object.entries(row).forEach(([key, value]) => { result[key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())] = value; });
    return result;
}

class StudCompositionRepository {
    constructor(store) {
        if (!store) throw new Error("StudAcademicStore is required.");
        this.store = store; this.store.initialize(); this.db = store.db;
    }

    transaction(work) { return this.store.transaction(work); }
    assignment(id) { const value = this.store.getEntity("ASSIGNMENT", Academic.safeId(id, "Assignment ID")); if (!value) throw new Academic.StudError("NOT_FOUND", "Assignment does not exist."); return value; }
    planRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_composition_plans WHERE id=?").get(Academic.safeId(id, "Composition Plan ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Composition Plan does not exist."); return value; }
    sectionRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_composition_sections WHERE id=?").get(Academic.safeId(id, "Composition Section ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Composition Section does not exist."); return value; }
    draftRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_draft_documents WHERE id=?").get(Academic.safeId(id, "Draft Document ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Draft Document does not exist."); return value; }
    versionRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_draft_versions WHERE id=?").get(Academic.safeId(id, "Draft Version ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Draft Version does not exist."); return value; }
    assertDraft(plan) { if (plan.lifecycle !== "DRAFT") throw new Academic.StudError("REVIEWED_COMPOSITION_IMMUTABLE", "Reviewed or superseded Composition Plans cannot be edited in place.", {lifecycle: plan.lifecycle}); }
    assertVersion(row, expected, code = "STALE_COMPOSITION_VERSION") { const version = Domain.expectedVersion(expected); if (row.rowVersion !== version) throw new Academic.StudError(code, "Composition data changed in another operation. Reload before saving.", {expected: version, actual: row.rowVersion}); }

    sectionRequirements(sectionId) {
        return Object.freeze(this.db.prepare(`SELECT c.*,i.requirement_type,i.label,i.display_value,i.normalized_value,i.unit requirement_unit,i.resolution_state
            FROM stud_composition_requirement_coverage c JOIN stud_requirement_items i ON i.id=c.requirement_item_id
            WHERE c.section_id=? ORDER BY i.item_order,i.id`).all(sectionId).map(row => Object.freeze(camel(row))));
    }

    sectionClaims(sectionId) {
        return Object.freeze(this.db.prepare(`SELECT l.placement_order,l.rationale,c.id claim_id,c.claim_text,c.claim_type,c.lifecycle,c.revision,c.row_version
            FROM stud_composition_section_claims l JOIN stud_claims c ON c.id=l.claim_id
            WHERE l.section_id=? ORDER BY l.placement_order,c.updated_at DESC,c.id`).all(sectionId).map(row => Object.freeze(camel(row))));
    }

    sectionEvidence(sectionId) {
        return Object.freeze(this.db.prepare(`SELECT p.intended_use,e.id evidence_id,e.review_state,e.source_object_type,e.source_object_id,e.location_type,e.excerpt,e.source_snapshot_hash,e.citation_paper_id,e.row_version
            FROM stud_composition_section_evidence p JOIN stud_evidence_records e ON e.id=p.evidence_id
            WHERE p.section_id=? ORDER BY e.updated_at DESC,e.id LIMIT 500`).all(sectionId).map(row => Object.freeze(camel(row))));
    }

    sections(planId) {
        return Object.freeze(this.db.prepare("SELECT * FROM stud_composition_sections WHERE plan_id=? ORDER BY section_order,id LIMIT 200").all(planId).map(row => {
            const value = camel(row);
            return Object.freeze({...value, requirements: this.sectionRequirements(value.id), claims: this.sectionClaims(value.id), evidence: this.sectionEvidence(value.id)});
        }));
    }

    requirementCoverage(planId) {
        return Object.freeze(this.db.prepare(`SELECT c.*,i.requirement_type,i.label,i.display_value,i.resolution_state
            FROM stud_composition_requirement_coverage c JOIN stud_requirement_items i ON i.id=c.requirement_item_id
            WHERE c.plan_id=? ORDER BY i.item_order,i.id,c.section_id`).all(planId).map(row => Object.freeze(camel(row))));
    }

    hydratePlan(id) {
        const plan = this.planRow(id);
        const contract = this.db.prepare("SELECT id,assignment_id,revision,lifecycle,completeness,contract_hash,approved_at FROM stud_requirement_contracts WHERE id=?").get(plan.requirementsContractId);
        return Object.freeze({...plan, contract: contract ? Object.freeze(camel(contract)) : null, sections: this.sections(plan.id), requirementCoverage: this.requirementCoverage(plan.id)});
    }

    assignmentState(assignmentId) {
        const assignment = this.assignment(assignmentId);
        const pointer = this.db.prepare("SELECT * FROM stud_assignment_composition_plans WHERE assignment_id=?").get(assignment.id);
        const history = Object.freeze(this.db.prepare("SELECT id,revision,lifecycle,title,length_unit,authoritative_total,user_planned_total,total_source,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,research_plan_id,plan_hash,row_version,created_at,updated_at,reviewed_at FROM stud_composition_plans WHERE assignment_id=? ORDER BY revision DESC LIMIT 100").all(assignment.id).map(row => Object.freeze(camel(row))));
        const currentId = pointer && pointer.current_reviewed_plan_id;
        const draftId = pointer && pointer.current_draft_plan_id;
        return Object.freeze({assignment, current: currentId ? this.hydratePlan(currentId) : null, draft: draftId ? this.hydratePlan(draftId) : null, history});
    }

    insertPlan(value) {
        const id = Academic.createId("composition_plan"), timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_composition_plans
            (id,plan_key,assignment_id,course_id,workflow_id,research_plan_id,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,lifecycle,revision,parent_plan_id,title,length_unit,authoritative_total,user_planned_total,total_source,origin,user_notes,plan_hash,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?,NULL,1,?,?)`)
            .run(id,value.planKey,value.assignmentId,value.courseId,value.workflowId,value.researchPlanId,value.contractId,value.contractRevision,value.contractHash,value.revision,value.parentPlanId,value.title,value.lengthUnit,value.authoritativeTotal,value.userPlannedTotal,value.totalSource,value.origin,value.userNotes,timestamp,timestamp);
        this.db.prepare(`INSERT INTO stud_assignment_composition_plans (assignment_id,current_reviewed_plan_id,current_draft_plan_id,updated_at)
            VALUES (?,NULL,?,?) ON CONFLICT(assignment_id) DO UPDATE SET current_draft_plan_id=excluded.current_draft_plan_id,updated_at=excluded.updated_at`).run(value.assignmentId,id,timestamp);
        return this.hydratePlan(id);
    }

    bumpPlan(planId, expectedVersion, work) {
        return this.transaction(() => {
            const plan = this.planRow(planId); this.assertDraft(plan); this.assertVersion(plan, expectedVersion);
            work(plan);
            const result = this.db.prepare("UPDATE stud_composition_plans SET row_version=row_version+1,updated_at=? WHERE id=? AND row_version=? AND lifecycle='DRAFT'").run(Academic.now(),plan.id,plan.rowVersion);
            if (!result.changes) throw new Academic.StudError("STALE_COMPOSITION_VERSION", "Composition Plan changed before the update completed.");
            return this.hydratePlan(plan.id);
        });
    }

    insertSection(plan, value) {
        const id = Academic.createId("composition_section"), timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_composition_sections
            (id,plan_id,assignment_id,parent_section_id,title,purpose,section_order,depth,planned_length,length_unit,origin,origin_reason,notes,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
            .run(id,plan.id,plan.assignmentId,value.parentSectionId,value.title,value.purpose,value.order,value.depth,value.plannedLength,value.lengthUnit,value.origin,value.originReason,value.notes,timestamp,timestamp);
        return this.sectionRow(id);
    }

    updateSection(section, value) {
        const timestamp = Academic.now();
        const result = this.db.prepare(`UPDATE stud_composition_sections SET parent_section_id=?,title=?,purpose=?,section_order=?,depth=?,planned_length=?,length_unit=?,origin_reason=?,notes=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`)
            .run(value.parentSectionId,value.title,value.purpose,value.order,value.depth,value.plannedLength,value.lengthUnit,value.originReason,value.notes,timestamp,section.id,section.rowVersion);
        if (!result.changes) throw new Academic.StudError("STALE_SECTION_VERSION", "Composition Section changed before the update completed.");
        return this.sectionRow(section.id);
    }

    canonicalPayload(planId) {
        const plan = this.hydratePlan(planId);
        return {
            assignmentId: plan.assignmentId, revision: plan.revision,
            contract: {id:plan.requirementsContractId,revision:plan.requirementsContractRevision,hash:plan.requirementsContractHash},
            researchPlanId: plan.researchPlanId, workflowId: plan.workflowId, title: plan.title,
            length: {unit:plan.lengthUnit,authoritativeTotal:plan.authoritativeTotal,userPlannedTotal:plan.userPlannedTotal,totalSource:plan.totalSource},
            sections: plan.sections.map(section => ({id:section.id,parentSectionId:section.parentSectionId,title:section.title,purpose:section.purpose,order:section.sectionOrder,depth:section.depth,plannedLength:section.plannedLength,lengthUnit:section.lengthUnit,origin:section.origin,originReason:section.originReason,notes:section.notes,requirements:section.requirements.map(item=>({id:item.requirementItemId,hash:item.requirementSnapshotHash,disposition:item.disposition,reason:item.reason})),claims:section.claims.map(item=>({id:item.claimId,order:item.placementOrder,rationale:item.rationale})),evidence:section.evidence.map(item=>({id:item.evidenceId,intendedUse:item.intendedUse}))})),
            exclusions: plan.requirementCoverage.filter(item=>item.disposition==="EXCLUDED").map(item=>({id:item.requirementItemId,hash:item.requirementSnapshotHash,reason:item.reason}))
        };
    }

    insertDraft(value) {
        const id = Academic.createId("draft_document"), timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_draft_documents
            (id,assignment_id,course_id,composition_plan_id,composition_plan_revision,composition_plan_hash,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,title,lifecycle,current_version_id,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,'ACTIVE',NULL,1,?,?)`)
            .run(id,value.assignmentId,value.courseId,value.planId,value.planRevision,value.planHash,value.contractId,value.contractRevision,value.contractHash,value.title,timestamp,timestamp);
        return this.draftRow(id);
    }

    insertVersion(draft, value, sectionContents) {
        const id = Academic.createId("draft_version"), timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_draft_versions (id,draft_id,assignment_id,version_number,parent_version_id,origin,change_reason,content_hash,total_length,length_unit,humanisation_session_id,humanisation_profile_revision_id,lecturer_review_session_id,correction_plan_id,correction_session_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id,draft.id,draft.assignmentId,value.versionNumber,value.parentVersionId,value.origin,value.changeReason,value.contentHash,value.totalLength,value.lengthUnit,value.humanisationSessionId||null,value.humanisationProfileRevisionId||null,value.lecturerReviewSessionId||null,value.correctionPlanId||null,value.correctionSessionId||null,timestamp);
        sectionContents.forEach(item => this.db.prepare(`INSERT INTO stud_draft_section_versions (id,draft_version_id,draft_id,section_id,content,content_hash,measured_length,created_at) VALUES (?,?,?,?,?,?,?,?)`)
            .run(Academic.createId("draft_section_version"),id,draft.id,item.sectionId,item.content,item.contentHash,item.measuredLength,timestamp));
        const result = this.db.prepare("UPDATE stud_draft_documents SET current_version_id=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?").run(id,timestamp,draft.id,draft.rowVersion);
        if (!result.changes) throw new Academic.StudError("STALE_DRAFT_VERSION", "Draft Document changed before the version was saved.");
        return this.hydrateVersion(id);
    }

    hydrateVersion(id) {
        const version = this.versionRow(id);
        const sections = Object.freeze(this.db.prepare(`SELECT v.*,s.title,s.purpose,s.section_order,s.planned_length,s.length_unit section_length_unit
            FROM stud_draft_section_versions v JOIN stud_composition_sections s ON s.id=v.section_id
            WHERE v.draft_version_id=? ORDER BY s.section_order,s.id LIMIT 200`).all(version.id).map(row => Object.freeze(camel(row))));
        return Object.freeze({...version, sections});
    }

    hydrateDraft(id, options = {}) {
        const draft = this.draftRow(id);
        const currentVersion = draft.currentVersionId ? this.hydrateVersion(draft.currentVersionId) : null;
        const limit = Math.max(1, Math.min(Number(options.versionLimit) || 25, 100));
        const history = Object.freeze(this.db.prepare("SELECT id,draft_id,assignment_id,version_number,parent_version_id,origin,change_reason,content_hash,total_length,length_unit,humanisation_session_id,humanisation_profile_revision_id,lecturer_review_session_id,correction_plan_id,correction_session_id,created_at FROM stud_draft_versions WHERE draft_id=? ORDER BY version_number DESC LIMIT ?").all(draft.id,limit).map(row => Object.freeze(camel(row))));
        return Object.freeze({...draft,currentVersion,history});
    }

    listDrafts(assignmentId, limit = 25) {
        return Object.freeze(this.db.prepare("SELECT * FROM stud_draft_documents WHERE assignment_id=? ORDER BY updated_at DESC,id DESC LIMIT ?").all(assignmentId,Math.max(1,Math.min(Number(limit)||25,100))).map(row => Object.freeze(camel(row))));
    }
}

module.exports = Object.freeze({StudCompositionRepository, camel});
