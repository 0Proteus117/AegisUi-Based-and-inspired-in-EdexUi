"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studCompositionModel.class.js");
const {StudCompositionRepository} = require("./studCompositionRepository.class.js");

const UNIT_ALIASES = Object.freeze({WORD:"WORDS",WORDS:"WORDS",PAGE:"PAGES",PAGES:"PAGES",SLIDE:"SLIDES",SLIDES:"SLIDES",MINUTE:"MINUTES",MINUTES:"MINUTES",ITEM:"ITEMS",ITEMS:"ITEMS"});

class StudCompositionService {
    constructor(options = {}) {
        if (!options.store) throw new Error("StudAcademicStore is required.");
        this.store = options.store;
        this.repository = options.repository || new StudCompositionRepository(this.store);
        this.workingContext = options.workingContextService || null;
        this.claimEvidence = options.claimEvidenceService || null;
    }

    state(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","draftLimit"],"Composition state");
        const state=this.repository.assignmentState(input.assignmentId);
        const plan=state.draft||state.current;
        return Object.freeze({...state,current:state.current&&this.withConditions(state.current),draft:state.draft&&this.withConditions(state.draft),drafts:this.repository.listDrafts(state.assignment.id,input.draftLimit),readiness:plan?this.readiness({assignmentId:state.assignment.id,planId:plan.id}):null});
    }

    withConditions(plan) {
        const contract=this.repository.db.prepare("SELECT id,lifecycle,contract_hash FROM stud_requirement_contracts WHERE id=?").get(plan.requirementsContractId);
        const freshness=this.repository.db.prepare("SELECT review_condition FROM stud_requirement_contract_freshness WHERE contract_id=?").get(plan.requirementsContractId);
        let contractCondition="CURRENT";
        if(!contract)contractCondition="SOURCE_MISSING";
        else if(contract.contract_hash!==plan.requirementsContractHash)contractCondition="SOURCE_CHANGED";
        else if(freshness&&freshness.review_condition!=="CURRENT")contractCondition=freshness.review_condition;
        return Object.freeze({...plan,contractCondition});
    }

    exactContract(assignmentId, contractId = null) {
        const assignment=this.repository.assignment(assignmentId);
        const row=contractId?this.repository.db.prepare("SELECT * FROM stud_requirement_contracts WHERE id=?").get(Academic.safeId(contractId,"Requirements Contract ID")):this.repository.db.prepare("SELECT c.* FROM stud_assignment_requirement_contracts p JOIN stud_requirement_contracts c ON c.id=p.current_contract_id WHERE p.assignment_id=?").get(assignment.id);
        if(!row||row.assignment_id!==assignment.id||!["APPROVED","SUPERSEDED"].includes(row.lifecycle)||!row.contract_hash)throw new Academic.StudError("REVIEWED_CONTRACT_REQUIRED","A reviewed Requirements Contract is required before Composition planning.");
        return {assignment,contract:row};
    }

    scopeResearchPlan(assignmentId, id) {
        if(!id)return null;
        const row=this.repository.db.prepare("SELECT id,assignment_id,lifecycle FROM stud_research_plans WHERE id=?").get(Academic.safeId(id,"Research Plan ID"));
        if(!row||row.assignment_id!==assignmentId)throw new Academic.StudError("CROSS_ASSIGNMENT_COMPOSITION","Research Plan does not belong to this Assignment.");
        return row.id;
    }

    scopeWorkflow(assignmentId, id) {
        if(!id)return null;
        const row=this.repository.db.prepare("SELECT id,assignment_id FROM stud_workflow_instances WHERE id=?").get(Academic.safeId(id,"Workflow ID"));
        if(!row||row.assignment_id!==assignmentId)throw new Academic.StudError("CROSS_ASSIGNMENT_COMPOSITION","Workflow does not belong to this Assignment.");
        return row.id;
    }

    authoritativeLength(contractId) {
        const items=this.repository.db.prepare("SELECT id,normalized_value,display_value,original_value,unit,resolution_state FROM stud_requirement_items WHERE contract_id=? AND requirement_type='LENGTH' ORDER BY item_order,id LIMIT 20").all(contractId);
        const candidates=items.map(item=>{
            const raw=String(item.normalized_value||item.display_value||item.original_value||"").replace(/,/g,"");
            const match=raw.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(words?|pages?|slides?|minutes?|items?)?\b/i);
            const unit=UNIT_ALIASES[String(item.unit||match&&match[2]||"").toUpperCase()]||null;
            return match&&unit&&item.resolution_state!=="CONFLICTING"?{itemId:item.id,total:Number(match[1]),unit}:null;
        }).filter(Boolean);
        const distinct=new Map(candidates.map(item=>[`${item.total}:${item.unit}`,item]));
        return distinct.size===1?Object.freeze([...distinct.values()][0]):null;
    }

    createPlan(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","contractId","researchPlanId","workflowId","title","lengthUnit","userPlannedTotal","userNotes","seedProposals"],"Composition Plan creation");
        const {assignment,contract}=this.exactContract(input.assignmentId,input.contractId||null);
        const existing=this.repository.db.prepare("SELECT id FROM stud_composition_plans WHERE assignment_id=? AND lifecycle='DRAFT'").get(assignment.id);
        if(existing)return this.withConditions(this.repository.hydratePlan(existing.id));
        const latest=this.repository.db.prepare("SELECT id,plan_key,revision FROM stud_composition_plans WHERE assignment_id=? ORDER BY revision DESC LIMIT 1").get(assignment.id);
        const authoritative=this.authoritativeLength(contract.id);
        const chosenUnit=input.lengthUnit?Academic.enumValue(input.lengthUnit,Domain.LENGTH_UNITS,"Length unit"):authoritative&&authoritative.unit||"WORDS";
        return this.repository.transaction(()=>{
            const plan=this.repository.insertPlan({planKey:latest&&latest.plan_key||Academic.createId("composition_lineage"),assignmentId:assignment.id,courseId:assignment.courseId||null,workflowId:this.scopeWorkflow(assignment.id,input.workflowId||null),researchPlanId:this.scopeResearchPlan(assignment.id,input.researchPlanId||null),contractId:contract.id,contractRevision:contract.revision,contractHash:contract.contract_hash,revision:Number(latest&&latest.revision||0)+1,parentPlanId:latest&&latest.id||null,title:Academic.optionalText(input.title,"Composition title",Domain.LIMITS.title)||`${assignment.title} composition`,lengthUnit:chosenUnit,authoritativeTotal:authoritative&&authoritative.unit===chosenUnit?authoritative.total:null,userPlannedTotal:Domain.nonNegative(input.userPlannedTotal,"User planned total"),totalSource:authoritative&&authoritative.unit===chosenUnit?"REQUIREMENTS_CONTRACT":input.userPlannedTotal!==undefined&&input.userPlannedTotal!==null?"USER_PLAN":"NONE",origin:"USER",userNotes:Academic.optionalText(input.userNotes,"Composition notes",Domain.LIMITS.notes)});
            if(input.seedProposals!==false)this.seedFromRequirements(plan);
            return this.withConditions(this.repository.hydratePlan(plan.id));
        });
    }

    seedFromRequirements(plan) {
        const items=this.repository.db.prepare("SELECT * FROM stud_requirement_items WHERE contract_id=? AND requirement_type='STRUCTURE' ORDER BY item_order,id LIMIT 30").all(plan.requirementsContractId);
        items.forEach((item,index)=>{
            const section=this.repository.insertSection(plan,{title:item.label||`Required section ${index+1}`,purpose:item.display_value||item.original_value||"Address the explicitly linked structure Requirement.",parentSectionId:null,order:index,depth:0,plannedLength:null,lengthUnit:plan.lengthUnit,origin:"REQUIREMENT_PROPOSAL",originReason:`Proposed from exact Requirement Item ${item.id}. Review before relying on it.`,notes:null});
            this.repository.db.prepare("INSERT INTO stud_composition_requirement_coverage (id,plan_id,section_id,requirement_item_id,requirement_snapshot_hash,disposition,reason,created_at) VALUES (?,?,?,?,?,'ASSIGNED',NULL,?)").run(Academic.createId("composition_requirement"),plan.id,section.id,item.id,item.item_hash||Domain.canonicalHash({id:item.id}),Academic.now());
        });
    }

    updatePlan(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","title","lengthUnit","userPlannedTotal","userNotes"],"Composition Plan update");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan=>{
            const unit=input.lengthUnit===undefined?plan.lengthUnit:Academic.enumValue(input.lengthUnit,Domain.LENGTH_UNITS,"Length unit");
            const authoritative=this.authoritativeLength(plan.requirementsContractId);
            const userTotal=input.userPlannedTotal===undefined?plan.userPlannedTotal:Domain.nonNegative(input.userPlannedTotal,"User planned total");
            this.repository.db.prepare("UPDATE stud_composition_plans SET title=?,length_unit=?,authoritative_total=?,user_planned_total=?,total_source=?,user_notes=? WHERE id=?").run(input.title===undefined?plan.title:Academic.requiredText(input.title,"Composition title",Domain.LIMITS.title),unit,authoritative&&authoritative.unit===unit?authoritative.total:null,userTotal,authoritative&&authoritative.unit===unit?"REQUIREMENTS_CONTRACT":userTotal!==null?"USER_PLAN":"NONE",input.userNotes===undefined?plan.userNotes:Academic.optionalText(input.userNotes,"Composition notes",Domain.LIMITS.notes),plan.id);
        });
    }

    sectionDepth(plan, parentId, currentId = null) {
        if(!parentId)return 0;
        let row=this.repository.sectionRow(parentId),depth=1,seen=new Set([currentId].filter(Boolean));
        if(row.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Parent Section belongs to another Composition Plan.");
        while(row){if(seen.has(row.id))throw new Academic.StudError("SECTION_HIERARCHY_CYCLE","Section hierarchy cannot contain a cycle.");seen.add(row.id);if(!row.parentSectionId)break;row=this.repository.sectionRow(row.parentSectionId);depth+=1;if(depth>Domain.LIMITS.hierarchyDepth)throw new Academic.StudError("SECTION_HIERARCHY_DEPTH","Section hierarchy exceeds its bounded depth.");}
        return depth;
    }

    addSection(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","section"],"Composition Section creation");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan=>{const value=Domain.normalizeSection(input.section||{});const count=this.repository.db.prepare("SELECT COUNT(*) count FROM stud_composition_sections WHERE plan_id=?").get(plan.id).count;if(count>=Domain.LIMITS.sections)throw new Academic.StudError("PAYLOAD_TOO_LARGE","Composition Plan has reached its Section bound.");this.repository.insertSection(plan,{...value,origin:"USER",depth:this.sectionDepth(plan,value.parentSectionId)});});
    }

    updateSection(input = {}) {
        Academic.assertAllowedKeys(input,["planId","sectionId","expectedPlanVersion","expectedSectionVersion","section"],"Composition Section update");
        return this.repository.bumpPlan(input.planId,input.expectedPlanVersion,plan=>{const section=this.repository.sectionRow(input.sectionId);if(section.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Section belongs to another Composition Plan.");this.repository.assertVersion(section,input.expectedSectionVersion,"STALE_SECTION_VERSION");const value=Domain.normalizeSection(input.section||{},section);this.repository.updateSection(section,{...value,origin:section.origin,depth:this.sectionDepth(plan,value.parentSectionId,section.id)});});
    }

    removeSection(input = {}) {
        Academic.assertAllowedKeys(input,["planId","sectionId","expectedPlanVersion","expectedSectionVersion"],"Composition Section removal");
        return this.repository.bumpPlan(input.planId,input.expectedPlanVersion,plan=>{const section=this.repository.sectionRow(input.sectionId);if(section.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Section belongs to another Composition Plan.");this.repository.assertVersion(section,input.expectedSectionVersion,"STALE_SECTION_VERSION");if(this.repository.db.prepare("SELECT 1 FROM stud_composition_sections WHERE parent_section_id=?").get(section.id))throw new Academic.StudError("SECTION_HAS_CHILDREN","Move or remove child Sections first.");if(this.repository.db.prepare("SELECT 1 FROM stud_draft_section_versions WHERE section_id=?").get(section.id))throw new Academic.StudError("SECTION_HAS_DRAFT_HISTORY","A Section with Draft history cannot be removed.");this.repository.db.prepare("DELETE FROM stud_composition_sections WHERE id=?").run(section.id);});
    }

    requirement(plan, id) {
        const row=this.repository.db.prepare("SELECT * FROM stud_requirement_items WHERE id=? AND contract_id=?").get(Academic.safeId(id,"Requirement Item ID"),plan.requirementsContractId);
        if(!row)throw new Academic.StudError("INVALID_REQUIREMENT_LINK","Requirement Item does not belong to this Plan's exact Contract revision.");
        return {row,hash:row.item_hash||Domain.canonicalHash({id:row.id,type:row.requirement_type,label:row.label,value:row.normalized_value})};
    }

    setRequirementCoverage(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","requirementItemId","sectionId","disposition","reason"],"Requirement coverage");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan=>{const requirement=this.requirement(plan,input.requirementItemId),disposition=Academic.enumValue(input.disposition,Domain.COVERAGE_DISPOSITIONS,"Coverage disposition"),timestamp=Academic.now();this.repository.db.prepare("DELETE FROM stud_composition_requirement_coverage WHERE plan_id=? AND requirement_item_id=? AND disposition='EXCLUDED'").run(plan.id,requirement.row.id);if(disposition==="EXCLUDED"){const reason=Academic.requiredText(input.reason,"Exclusion reason",Domain.LIMITS.reason);this.repository.db.prepare("DELETE FROM stud_composition_requirement_coverage WHERE plan_id=? AND requirement_item_id=?").run(plan.id,requirement.row.id);this.repository.db.prepare("INSERT INTO stud_composition_requirement_coverage (id,plan_id,section_id,requirement_item_id,requirement_snapshot_hash,disposition,reason,created_at) VALUES (?,?,NULL,?,?,'EXCLUDED',?,?)").run(Academic.createId("composition_requirement"),plan.id,requirement.row.id,requirement.hash,reason,timestamp);}else{const section=this.repository.sectionRow(input.sectionId);if(section.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Section belongs to another Composition Plan.");this.repository.db.prepare("INSERT OR IGNORE INTO stud_composition_requirement_coverage (id,plan_id,section_id,requirement_item_id,requirement_snapshot_hash,disposition,reason,created_at) VALUES (?,?,?,?,?,'ASSIGNED',NULL,?)").run(Academic.createId("composition_requirement"),plan.id,section.id,requirement.row.id,requirement.hash,timestamp);}});
    }

    linkClaim(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","sectionId","claimId","order","rationale"],"Section Claim placement");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan=>{const section=this.repository.sectionRow(input.sectionId);if(section.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Section belongs to another Composition Plan.");const claim=this.repository.db.prepare("SELECT * FROM stud_claims WHERE id=?").get(Academic.safeId(input.claimId,"Claim ID"));if(!claim||claim.assignment_id!==plan.assignmentId)throw new Academic.StudError("CROSS_ASSIGNMENT_CLAIM","Claim does not belong to this Assignment.");if(plan.researchPlanId&&claim.plan_id&&claim.plan_id!==plan.researchPlanId)throw new Academic.StudError("CROSS_PLAN_CLAIM","Claim belongs to another Research Plan.");this.repository.db.prepare("INSERT OR REPLACE INTO stud_composition_section_claims (section_id,claim_id,placement_order,rationale,created_at) VALUES (?,?,?,?,?)").run(section.id,claim.id,Domain.sectionOrder(input.order,0),Academic.optionalText(input.rationale,"Claim placement rationale",Domain.LIMITS.reason),Academic.now());});
    }

    linkEvidence(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","sectionId","evidenceId","intendedUse"],"Section Evidence planning");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan=>{const section=this.repository.sectionRow(input.sectionId);if(section.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Section belongs to another Composition Plan.");const evidence=this.repository.db.prepare("SELECT * FROM stud_evidence_records WHERE id=?").get(Academic.safeId(input.evidenceId,"Evidence ID"));if(!evidence||evidence.assignment_id!==plan.assignmentId)throw new Academic.StudError("CROSS_ASSIGNMENT_EVIDENCE","Evidence does not belong to this Assignment.");const relation=this.repository.db.prepare(`SELECT 1 FROM stud_composition_section_claims sc JOIN stud_claim_evidence_links l ON l.claim_id=sc.claim_id WHERE sc.section_id=? AND l.evidence_id=? AND l.lifecycle='REVIEWED' AND l.relationship_type<>'NOT_ASSESSED' LIMIT 1`).get(section.id,evidence.id);if(!relation)throw new Academic.StudError("EVIDENCE_RELATION_REQUIRED","Evidence must have an explicit reviewed M8 relationship to a Claim assigned to this Section.");this.repository.db.prepare("INSERT OR REPLACE INTO stud_composition_section_evidence (section_id,evidence_id,intended_use,created_at) VALUES (?,?,?,?)").run(section.id,evidence.id,Academic.optionalText(input.intendedUse,"Intended Evidence use",Domain.LIMITS.reason),Academic.now());});
    }

    unlinkReference(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","sectionId","kind","targetId"],"Composition reference removal");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan=>{const section=this.repository.sectionRow(input.sectionId);if(section.planId!==plan.id)throw new Academic.StudError("CROSS_PLAN_SECTION","Section belongs to another Composition Plan.");const kind=Academic.enumValue(input.kind,["REQUIREMENT","CLAIM","EVIDENCE"],"Reference kind"),id=Academic.safeId(input.targetId,"Reference ID");if(kind==="REQUIREMENT")this.repository.db.prepare("DELETE FROM stud_composition_requirement_coverage WHERE plan_id=? AND section_id=? AND requirement_item_id=?").run(plan.id,section.id,id);else if(kind==="CLAIM")this.repository.db.prepare("DELETE FROM stud_composition_section_claims WHERE section_id=? AND claim_id=?").run(section.id,id);else this.repository.db.prepare("DELETE FROM stud_composition_section_evidence WHERE section_id=? AND evidence_id=?").run(section.id,id);});
    }

    reviewPlan(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion"],"Composition Plan review");
        return this.repository.transaction(()=>{const plan=this.repository.planRow(input.planId);this.repository.assertDraft(plan);this.repository.assertVersion(plan,input.expectedVersion);if(!this.repository.db.prepare("SELECT 1 FROM stud_composition_sections WHERE plan_id=? LIMIT 1").get(plan.id))throw new Academic.StudError("COMPOSITION_PLAN_EMPTY","A reviewed Composition Plan requires at least one Section.");const hash=Domain.canonicalHash(this.repository.canonicalPayload(plan.id)),timestamp=Academic.now(),pointer=this.repository.db.prepare("SELECT current_reviewed_plan_id FROM stud_assignment_composition_plans WHERE assignment_id=?").get(plan.assignmentId);if(pointer&&pointer.current_reviewed_plan_id&&pointer.current_reviewed_plan_id!==plan.id)this.repository.db.prepare("UPDATE stud_composition_plans SET lifecycle='SUPERSEDED',row_version=row_version+1,updated_at=? WHERE id=? AND lifecycle='REVIEWED'").run(timestamp,pointer.current_reviewed_plan_id);const result=this.repository.db.prepare("UPDATE stud_composition_plans SET lifecycle='REVIEWED',plan_hash=?,reviewed_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND row_version=? AND lifecycle='DRAFT'").run(hash,timestamp,timestamp,plan.id,plan.rowVersion);if(!result.changes)throw new Academic.StudError("STALE_COMPOSITION_VERSION","Composition Plan changed before review completed.");this.repository.db.prepare("UPDATE stud_assignment_composition_plans SET current_reviewed_plan_id=?,current_draft_plan_id=NULL,updated_at=? WHERE assignment_id=?").run(plan.id,timestamp,plan.assignmentId);return this.withConditions(this.repository.hydratePlan(plan.id));});
    }

    createRevision(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion"],"Composition Plan revision");
        return this.repository.transaction(()=>{const source=this.repository.planRow(input.planId);this.repository.assertVersion(source,input.expectedVersion);if(!["REVIEWED","SUPERSEDED"].includes(source.lifecycle))throw new Academic.StudError("INVALID_TRANSITION","Only reviewed Composition Plans can seed a revision.");const existing=this.repository.db.prepare("SELECT id FROM stud_composition_plans WHERE assignment_id=? AND lifecycle='DRAFT'").get(source.assignmentId);if(existing)return this.withConditions(this.repository.hydratePlan(existing.id));const latest=this.repository.db.prepare("SELECT MAX(revision) revision FROM stud_composition_plans WHERE assignment_id=?").get(source.assignmentId),plan=this.repository.insertPlan({planKey:source.planKey,assignmentId:source.assignmentId,courseId:source.courseId,workflowId:source.workflowId,researchPlanId:source.researchPlanId,contractId:source.requirementsContractId,contractRevision:source.requirementsContractRevision,contractHash:source.requirementsContractHash,revision:Number(latest.revision||0)+1,parentPlanId:source.id,title:source.title,lengthUnit:source.lengthUnit,authoritativeTotal:source.authoritativeTotal,userPlannedTotal:source.userPlannedTotal,totalSource:source.totalSource,origin:"USER",userNotes:source.userNotes});this.clonePlan(source.id,plan);return this.withConditions(this.repository.hydratePlan(plan.id));});
    }

    clonePlan(sourceId, target) {
        const map=new Map();this.repository.sections(sourceId).forEach(section=>{const created=this.repository.insertSection(target,{...section,parentSectionId:null,order:section.sectionOrder,depth:section.depth});map.set(section.id,created.id);});
        this.repository.sections(sourceId).filter(section=>section.parentSectionId).forEach(section=>this.repository.db.prepare("UPDATE stud_composition_sections SET parent_section_id=? WHERE id=?").run(map.get(section.parentSectionId),map.get(section.id)));
        this.repository.requirementCoverage(sourceId).forEach(link=>this.repository.db.prepare("INSERT INTO stud_composition_requirement_coverage (id,plan_id,section_id,requirement_item_id,requirement_snapshot_hash,disposition,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").run(Academic.createId("composition_requirement"),target.id,link.sectionId?map.get(link.sectionId):null,link.requirementItemId,link.requirementSnapshotHash,link.disposition,link.reason,Academic.now()));
        this.repository.sections(sourceId).forEach(section=>{section.claims.forEach(link=>this.repository.db.prepare("INSERT INTO stud_composition_section_claims (section_id,claim_id,placement_order,rationale,created_at) VALUES (?,?,?,?,?)").run(map.get(section.id),link.claimId,link.placementOrder,link.rationale,Academic.now()));section.evidence.forEach(link=>this.repository.db.prepare("INSERT INTO stud_composition_section_evidence (section_id,evidence_id,intended_use,created_at) VALUES (?,?,?,?)").run(map.get(section.id),link.evidenceId,link.intendedUse,Academic.now()));});
    }

    readiness(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","planId"],"Composition readiness");const assignment=this.repository.assignment(input.assignmentId),plan=this.withConditions(this.repository.hydratePlan(input.planId));if(plan.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_COMPOSITION","Composition Plan belongs to another Assignment.");const reasons=[];
        const requirements=this.repository.db.prepare("SELECT id,label FROM stud_requirement_items WHERE contract_id=? ORDER BY item_order,id LIMIT 200").all(plan.requirementsContractId),covered=new Set(plan.requirementCoverage.map(item=>item.requirementItemId));requirements.filter(item=>!covered.has(item.id)).forEach(item=>reasons.push({code:"REQUIREMENT_UNADDRESSED",message:`Requirement has no planned Section: ${item.label}`,targetId:item.id}));
        plan.sections.forEach(section=>{if(!section.purpose)reasons.push({code:"SECTION_PURPOSE_MISSING",message:`Section has no purpose: ${section.title}`,targetId:section.id});section.claims.forEach(claim=>{const links=this.repository.db.prepare("SELECT relationship_type,lifecycle,evidence_id FROM stud_claim_evidence_links WHERE claim_id=?").all(claim.claimId),reviewed=links.filter(link=>link.lifecycle==="REVIEWED");if(!reviewed.some(link=>link.relationship_type==="SUPPORTS"))reasons.push({code:"CLAIM_UNSUPPORTED",message:`Claim has no reviewed supporting Evidence: ${claim.claimText}`,targetId:claim.claimId});if(reviewed.some(link=>link.relationship_type==="CONTRADICTS"))reasons.push({code:"CLAIM_CONTRADICTED",message:`Claim has reviewed contradictory Evidence: ${claim.claimText}`,targetId:claim.claimId});reviewed.forEach(link=>{if(this.claimEvidence){const item=this.claimEvidence.evidence({assignmentId:assignment.id,evidenceId:link.evidence_id});if(item.freshness.state!=="CURRENT")reasons.push({code:`EVIDENCE_${item.freshness.state}`,message:`Evidence for a planned Claim is ${item.freshness.state.toLowerCase().replace(/_/g," ")}.`,targetId:item.id});if(item.citationIntegrity.state!=="READY")reasons.push({code:`CITATION_${item.citationIntegrity.state}`,message:item.citationIntegrity.reason,targetId:item.id});}});});});
        const openGaps=this.repository.db.prepare("SELECT id,title FROM stud_research_gaps WHERE assignment_id=? AND state='OPEN' LIMIT 100").all(assignment.id);openGaps.forEach(gap=>reasons.push({code:"RESEARCH_GAP_OPEN",message:`Research Gap remains open: ${gap.title}`,targetId:gap.id}));const blockers=this.repository.db.prepare(`SELECT b.id,b.title FROM stud_workflow_blockers b JOIN stud_workflow_instances w ON w.id=b.workflow_id WHERE w.assignment_id=? AND b.status='OPEN' LIMIT 100`).all(assignment.id);blockers.forEach(blocker=>reasons.push({code:"WORKFLOW_BLOCKER_OPEN",message:`Workflow Blocker remains open: ${blocker.title}`,targetId:blocker.id}));
        const planned=plan.sections.reduce((sum,section)=>sum+(section.lengthUnit===plan.lengthUnit?Number(section.plannedLength||0):0),0),target=plan.authoritativeTotal??plan.userPlannedTotal;if(target!==null&&planned!==target)reasons.push({code:planned>target?"LENGTH_OVER_ALLOCATED":"LENGTH_UNDER_ALLOCATED",message:`Planned ${planned} ${plan.lengthUnit.toLowerCase()} versus ${target} ${plan.totalSource==="REQUIREMENTS_CONTRACT"?"authoritative":"user-planned"}.`,targetId:plan.id});
        return Object.freeze({planId:plan.id,state:reasons.length?"NEEDS_REVIEW":"READY_FOR_DRAFT_REVIEW",reasons:Object.freeze(reasons.map(Object.freeze)),counts:Object.freeze({sections:plan.sections.length,requirements:requirements.length,unaddressedRequirements:reasons.filter(item=>item.code==="REQUIREMENT_UNADDRESSED").length,openResearchGaps:openGaps.length,openBlockers:blockers.length}),length:Object.freeze({unit:plan.lengthUnit,planned,target,totalSource:plan.totalSource,delta:target===null?null:planned-target}),noPercentage:true});
    }

    createDraft(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","planId","title"],"Draft Document creation");const assignment=this.repository.assignment(input.assignmentId),plan=this.repository.planRow(input.planId);if(plan.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_COMPOSITION","Composition Plan belongs to another Assignment.");if(plan.lifecycle!=="REVIEWED"||!plan.planHash)throw new Academic.StudError("REVIEWED_COMPOSITION_REQUIRED","Draft creation requires an exact reviewed Composition Plan revision.");const draft=this.repository.insertDraft({assignmentId:assignment.id,courseId:assignment.courseId||null,planId:plan.id,planRevision:plan.revision,planHash:plan.planHash,contractId:plan.requirementsContractId,contractRevision:plan.requirementsContractRevision,contractHash:plan.requirementsContractHash,title:Academic.optionalText(input.title,"Draft title",Domain.LIMITS.title)||`${plan.title} draft`});return this.repository.hydrateDraft(draft.id);
    }

    draft(input = {}) { Academic.assertAllowedKeys(input,["assignmentId","draftId","versionLimit"],"Draft read");const assignment=this.repository.assignment(input.assignmentId),draft=this.repository.hydrateDraft(input.draftId,{versionLimit:input.versionLimit});if(draft.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_DRAFT","Draft belongs to another Assignment.");return draft; }

    draftVersion(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","draftId","versionId"],"Draft Version read");
        const assignment=this.repository.assignment(input.assignmentId),draft=this.repository.draftRow(input.draftId),version=this.repository.hydrateVersion(input.versionId);
        if(draft.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_DRAFT","Draft belongs to another Assignment.");
        if(version.draftId!==draft.id||version.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_DRAFT_VERSION","Draft Version does not belong to this Draft.");
        return version;
    }

    saveDraftVersion(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","draftId","expectedVersion","sections","changeReason","origin"],"Draft version save");const assignment=this.repository.assignment(input.assignmentId),draft=this.repository.draftRow(input.draftId);if(draft.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_DRAFT","Draft belongs to another Assignment.");this.repository.assertVersion(draft,input.expectedVersion,"STALE_DRAFT_VERSION");if(!Array.isArray(input.sections)||input.sections.length>Domain.LIMITS.sections)throw new Academic.StudError("INVALID_INPUT","Draft sections must be a bounded array.");const plan=this.repository.hydratePlan(draft.compositionPlanId),allowed=new Map(plan.sections.map(section=>[section.id,section])),base=draft.currentVersionId?new Map(this.repository.hydrateVersion(draft.currentVersionId).sections.map(item=>[item.sectionId,item.content])):new Map();input.sections.forEach(item=>{Academic.assertAllowedKeys(item,["sectionId","content"],"Draft Section content");const id=Academic.safeId(item.sectionId,"Composition Section ID");if(!allowed.has(id))throw new Academic.StudError("CROSS_PLAN_SECTION","Draft Section does not belong to the Draft's reviewed Composition Plan.");base.set(id,Domain.normalizeDraftContent(item.content));});const snapshots=plan.sections.map(section=>{const content=base.get(section.id)||"";return {sectionId:section.id,content,contentHash:Domain.canonicalHash(content),measuredLength:Domain.measuredLength(content,section.lengthUnit)};});const totalCharacters=snapshots.reduce((sum,item)=>sum+item.content.length,0);if(totalCharacters>Domain.LIMITS.draftTotalCharacters)throw new Academic.StudError("PAYLOAD_TOO_LARGE","Draft Document exceeds its total content bound.");const versionNumber=Number(this.repository.db.prepare("SELECT MAX(version_number) version FROM stud_draft_versions WHERE draft_id=?").get(draft.id).version||0)+1,totalLength=snapshots.reduce((sum,item)=>sum+(allowed.get(item.sectionId).lengthUnit===plan.lengthUnit?item.measuredLength:0),0),contentHash=Domain.canonicalHash({draftId:draft.id,planId:plan.id,planHash:plan.planHash,versionNumber,sections:snapshots.map(item=>({sectionId:item.sectionId,contentHash:item.contentHash}))});return this.repository.transaction(()=>this.repository.insertVersion(draft,{versionNumber,parentVersionId:draft.currentVersionId||null,origin:Academic.enumValue(input.origin||"USER",Domain.DRAFT_ORIGINS,"Draft origin","USER"),changeReason:Academic.optionalText(input.changeReason,"Draft change reason",Domain.LIMITS.reason),contentHash,totalLength,lengthUnit:plan.lengthUnit},snapshots));
    }

    diff(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","draftId","fromVersionId","toVersionId"],"Draft diff");const assignment=this.repository.assignment(input.assignmentId),draft=this.repository.draftRow(input.draftId);if(draft.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_DRAFT","Draft belongs to another Assignment.");const from=this.repository.hydrateVersion(input.fromVersionId),to=this.repository.hydrateVersion(input.toVersionId);if(from.draftId!==draft.id||to.draftId!==draft.id)throw new Academic.StudError("CROSS_DRAFT_VERSION","Draft versions do not belong to the same Draft.");const left=new Map(from.sections.map(item=>[item.sectionId,item])),right=new Map(to.sections.map(item=>[item.sectionId,item])),ids=[...new Set([...left.keys(),...right.keys()])],sections=ids.map(id=>{const a=left.get(id),b=right.get(id),title=b&&b.title||a&&a.title||"Section",changed=!a||!b||a.contentHash!==b.contentHash;return Object.freeze({sectionId:id,title,changed,lengthDelta:Number(b&&b.measuredLength||0)-Number(a&&a.measuredLength||0),diff:changed?Domain.lineDiff(a&&a.content||"",b&&b.content||""):Object.freeze({truncated:false,lines:Object.freeze([])})});});return Object.freeze({draftId:draft.id,from:Object.freeze({id:from.id,version:from.versionNumber,totalLength:from.totalLength}),to:Object.freeze({id:to.id,version:to.versionNumber,totalLength:to.totalLength}),lengthDelta:to.totalLength-from.totalLength,changedSections:sections.filter(item=>item.changed).length,sections:Object.freeze(sections)});
    }

    sectionContext(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","planId","sectionId"],"Composition Section context");const assignment=this.repository.assignment(input.assignmentId),plan=this.repository.hydratePlan(input.planId);if(plan.assignmentId!==assignment.id)throw new Academic.StudError("CROSS_ASSIGNMENT_COMPOSITION","Composition Plan belongs to another Assignment.");const section=plan.sections.find(item=>item.id===Academic.safeId(input.sectionId,"Composition Section ID"));if(!section)throw new Academic.StudError("CROSS_PLAN_SECTION","Section does not belong to this Composition Plan.");const claims=section.claims.map(claim=>{const links=this.repository.db.prepare("SELECT * FROM stud_claim_evidence_links WHERE claim_id=? ORDER BY updated_at DESC LIMIT 100").all(claim.claimId).map(row=>{const evidence=this.claimEvidence?this.claimEvidence.evidence({assignmentId:assignment.id,evidenceId:row.evidence_id}):null;return Object.freeze({...row,evidence});});return Object.freeze({...claim,links:Object.freeze(links)});});return Object.freeze({plan:Object.freeze({id:plan.id,revision:plan.revision,lifecycle:plan.lifecycle,lengthUnit:plan.lengthUnit}),section,claims:Object.freeze(claims),readiness:this.readiness({assignmentId:assignment.id,planId:plan.id})});
    }
}

module.exports = Object.freeze({StudCompositionService});
