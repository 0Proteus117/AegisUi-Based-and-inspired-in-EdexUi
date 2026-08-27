"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studResearchPlanModel.class.js");
const {StudResearchPlanRepository} = require("./studResearchPlanRepository.class.js");

const RESEARCH_RELEVANT_REQUIREMENTS = new Set(["DELIVERABLE", "STRUCTURE", "LEARNING_OUTCOME", "RUBRIC", "EVIDENCE", "DEPENDENCY", "OTHER"]);

class StudResearchPlanService {
    constructor(options = {}) {
        if (!options.store) throw new Error("StudAcademicStore is required.");
        this.store = options.store;
        this.repository = options.repository || new StudResearchPlanRepository(this.store);
        this.workingContext = options.workingContextService || null;
        this.artifacts = options.artifactOperationsService || null;
    }

    state(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId"], "Research Plan state");
        const result = this.repository.assignmentState(input.assignmentId);
        return Object.freeze({...result, current: result.current && this.withContractCondition(result.current), draft: result.draft && this.withContractCondition(result.draft)});
    }

    withContractCondition(plan) {
        const contract = this.repository.db.prepare("SELECT id,lifecycle,contract_hash FROM stud_requirement_contracts WHERE id=?").get(plan.requirementsContractId);
        const freshness = this.repository.db.prepare("SELECT review_condition FROM stud_requirement_contract_freshness WHERE contract_id=?").get(plan.requirementsContractId);
        const pointer = this.repository.db.prepare("SELECT current_contract_id FROM stud_assignment_requirement_contracts WHERE assignment_id=?").get(plan.assignmentId);
        let contractCondition = "CURRENT";
        if (!contract) contractCondition = "SOURCE_MISSING";
        else if (contract.contract_hash !== plan.requirementsContractHash) contractCondition = "SOURCE_CHANGED";
        else if (freshness && freshness.review_condition !== "CURRENT") contractCondition = freshness.review_condition;
        else if (!pointer || pointer.current_contract_id !== plan.requirementsContractId) contractCondition = "HISTORICAL";
        return Object.freeze({...plan, contractCondition});
    }

    exactContract(assignmentId, contractId = null) {
        const assignment = this.repository.requireAssignment(assignmentId);
        let row;
        if (contractId) row = this.repository.db.prepare("SELECT * FROM stud_requirement_contracts WHERE id=?").get(Academic.safeId(contractId, "Requirements Contract ID"));
        else row = this.repository.db.prepare("SELECT c.* FROM stud_assignment_requirement_contracts p JOIN stud_requirement_contracts c ON c.id=p.current_contract_id WHERE p.assignment_id=?").get(assignment.id);
        if (!row || row.assignment_id !== assignment.id) throw new Academic.StudError("REVIEWED_CONTRACT_REQUIRED", "A reviewed Requirements Contract for this Assignment is required before creating a Research Plan.");
        if (!["APPROVED", "SUPERSEDED"].includes(row.lifecycle) || !row.contract_hash) throw new Academic.StudError("REVIEWED_CONTRACT_REQUIRED", "Research Plans must reference an exact approved Requirements Contract revision.");
        return {assignment, contract: row};
    }

    workflow(assignmentId, workflowId) {
        if (!workflowId) return null;
        const row = this.repository.db.prepare("SELECT id,assignment_id,lifecycle,is_current FROM stud_workflow_instances WHERE id=?").get(Academic.safeId(workflowId, "Workflow ID"));
        if (!row || row.assignment_id !== assignmentId || row.lifecycle !== "ACTIVE" || !row.is_current) throw new Academic.StudError("INVALID_INPUT", "Research Plan Workflow does not belong to this Assignment.");
        return row.id;
    }

    requirementLink(plan, requirementItemId, basis = "PROPOSED_BY_RESEARCH_PLANNING") {
        const id = Academic.safeId(requirementItemId, "Requirement Item ID");
        const item = this.repository.db.prepare("SELECT * FROM stud_requirement_items WHERE id=? AND contract_id=?").get(id, plan.requirementsContractId);
        if (!item) throw new Academic.StudError("INVALID_REQUIREMENT_LINK", "Requirement Item does not belong to the Research Plan's exact Contract revision.");
        const snapshotHash = Domain.canonicalHash({id:item.id,type:item.requirement_type,subtype:item.subtype,label:item.label,displayValue:item.display_value,normalizedValue:item.normalized_value,unit:item.unit,resolutionState:item.resolution_state});
        return Object.freeze({id:item.id,basis:Academic.enumValue(basis,["REQUIRED_BY_ASSIGNMENT","PROPOSED_BY_RESEARCH_PLANNING"],"Requirement relationship basis","PROPOSED_BY_RESEARCH_PLANNING"),snapshotHash,item});
    }

    requirementLinks(plan, ids, basis) { return Domain.normalizeIds(ids || [], "Requirement Item ID", 50).map(id => this.requirementLink(plan,id,basis)); }

    createDraft(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "contractId", "workflowId", "origin", "userNotes", "seedProposals"], "Research Plan creation");
        const {assignment, contract} = this.exactContract(input.assignmentId, input.contractId || null);
        const existing = this.repository.db.prepare("SELECT id FROM stud_research_plans WHERE assignment_id=? AND lifecycle='DRAFT'").get(assignment.id);
        if (existing) return this.withContractCondition(this.repository.hydrate(existing.id));
        const latest = this.repository.db.prepare("SELECT id,revision FROM stud_research_plans WHERE assignment_id=? ORDER BY revision DESC LIMIT 1").get(assignment.id);
        const workflowId = this.workflow(assignment.id, input.workflowId || null);
        return this.repository.transaction(() => {
            const plan = this.repository.insertPlan({assignmentId:assignment.id,courseId:assignment.courseId || null,workflowId,contractId:contract.id,contractRevision:contract.revision,contractHash:contract.contract_hash,revision:Number(latest && latest.revision || 0)+1,parentPlanId:latest && latest.id || null,origin:Academic.enumValue(input.origin || "USER",Domain.ORIGINS,"Research Plan origin","USER"),userNotes:Academic.optionalText(input.userNotes,"Research Plan notes",Domain.LIMITS.note)});
            if (input.seedProposals !== false) this.seedProposals(plan);
            return this.withContractCondition(this.repository.hydrate(plan.id));
        });
    }

    seedProposals(plan) {
        const items = this.repository.db.prepare("SELECT * FROM stud_requirement_items WHERE contract_id=? ORDER BY item_order,id LIMIT 100").all(plan.requirementsContractId);
        let order = 0;
        items.filter(item => RESEARCH_RELEVANT_REQUIREMENTS.has(item.requirement_type)).forEach(item => {
            const link = this.requirementLink(plan,item.id,"PROPOSED_BY_RESEARCH_PLANNING");
            this.repository.insertTopic(plan,{title:item.label,description:item.display_value || item.original_value || null,rationale:"Proposed from an exact reviewed Requirement Item; this research structure is not itself an institutional requirement.",priority:"NORMAL",order:order++,origin:"DETERMINISTIC",basis:"PROPOSED_BY_RESEARCH_PLANNING",disposition:"PROPOSED",parentTopicId:null,workflowNodeId:null,userNotes:null},[link]);
        });
    }

    updatePlan(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","userNotes"],"Research Plan update");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan => this.repository.db.prepare("UPDATE stud_research_plans SET user_notes=? WHERE id=?").run(Academic.optionalText(input.userNotes,"Research Plan notes",Domain.LIMITS.note),plan.id));
    }

    addTopic(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion","topic"],"Topic creation");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan => {
            const value = Domain.normalizeTopic(input.topic || {});
            this.validateTopicRequirementBasis(value);
            this.validateTopicParent(plan,value.parentTopicId,null);
            this.validateWorkflowNode(plan,value.workflowNodeId);
            this.repository.insertTopic(plan,value,this.requirementLinks(plan,value.requirementItemIds,value.basis === "REQUIRED_BY_ASSIGNMENT" ? "REQUIRED_BY_ASSIGNMENT" : "PROPOSED_BY_RESEARCH_PLANNING"));
        });
    }

    updateTopic(input = {}) {
        Academic.assertAllowedKeys(input,["planId","topicId","expectedPlanVersion","expectedTopicVersion","topic"],"Topic update");
        return this.repository.bumpPlan(input.planId,input.expectedPlanVersion,plan => {
            const topic=this.repository.topicRow(input.topicId); if(topic.planId!==plan.id) throw new Academic.StudError("INVALID_INPUT","Topic does not belong to this Research Plan.");
            this.repository.assertVersion(topic,input.expectedTopicVersion,"STALE_TOPIC_VERSION");
            const current={...topic,order:topic.topicOrder,requirementItemIds:this.repository.requirementLinks("stud_research_topic_requirements","topic_id",topic.id).map(item=>item.requirementItemId)};
            const value=Domain.normalizeTopic({...input.topic,origin:current.origin},current);
            this.validateTopicRequirementBasis(value);
            this.validateTopicParent(plan,value.parentTopicId,topic.id); this.validateWorkflowNode(plan,value.workflowNodeId);
            const result=this.repository.db.prepare(`UPDATE stud_research_topics SET parent_topic_id=?,workflow_node_id=?,title=?,description=?,rationale=?,priority=?,topic_order=?,origin=?,basis=?,disposition=?,user_notes=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`).run(value.parentTopicId,value.workflowNodeId,value.title,value.description,value.rationale,value.priority,value.order,value.origin,value.basis,value.disposition,value.userNotes,Academic.now(),topic.id,topic.rowVersion);
            if(!result.changes) throw new Academic.StudError("STALE_TOPIC_VERSION","Topic changed before the update completed.");
            this.repository.replaceTopicRequirements(topic.id,this.requirementLinks(plan,value.requirementItemIds,value.basis === "REQUIRED_BY_ASSIGNMENT" ? "REQUIRED_BY_ASSIGNMENT" : "PROPOSED_BY_RESEARCH_PLANNING"));
        });
    }

    validateTopicRequirementBasis(value) {
        if (value.basis === "REQUIRED_BY_ASSIGNMENT" && !value.requirementItemIds.length) throw new Academic.StudError("INVALID_REQUIREMENT_LINK", "A Topic described as required by the Assignment must link at least one exact Requirement Item from the Plan's Contract revision.");
    }

    validateTopicParent(plan,parentId,topicId) {
        if(!parentId) return;
        const parent=this.repository.topicRow(parentId); if(parent.planId!==plan.id) throw new Academic.StudError("INVALID_INPUT","Parent Topic belongs to another Research Plan.");
        if(parent.id===topicId) throw new Academic.StudError("RESEARCH_TOPIC_CYCLE","A Topic cannot parent itself.");
        if(parent.parentTopicId) throw new Academic.StudError("RESEARCH_TOPIC_DEPTH","Topic hierarchy is bounded to one parent/child level.");
        if(topicId && parent.parentTopicId===topicId) throw new Academic.StudError("RESEARCH_TOPIC_CYCLE","Topic hierarchy would create a cycle.");
    }

    validateWorkflowNode(plan,nodeId) {
        if(!nodeId) return;
        if(!plan.workflowId) throw new Academic.StudError("INVALID_INPUT","A Topic cannot reference a Workflow node when its Plan has no Workflow.");
        const node=this.repository.db.prepare("SELECT id FROM stud_workflow_nodes WHERE id=? AND workflow_id=?").get(nodeId,plan.workflowId);
        if(!node) throw new Academic.StudError("INVALID_INPUT","Workflow node does not belong to the Research Plan Workflow.");
    }

    addQuestion(input = {}) {
        Academic.assertAllowedKeys(input,["planId","topicId","expectedVersion","question"],"Research Question creation");
        return this.repository.bumpPlan(input.planId,input.expectedVersion,plan => {
            const topic=this.repository.topicRow(input.topicId); if(topic.planId!==plan.id) throw new Academic.StudError("INVALID_INPUT","Question Topic belongs to another Plan.");
            const value=Domain.normalizeQuestion(input.question || {}); this.validateQuestionParent(plan,topic,value.parentQuestionId,null);
            this.repository.insertQuestion(plan,topic,value,this.requirementLinks(plan,value.requirementItemIds));
        });
    }

    updateQuestion(input = {}) {
        Academic.assertAllowedKeys(input,["planId","questionId","expectedPlanVersion","expectedQuestionVersion","question"],"Research Question update");
        return this.repository.bumpPlan(input.planId,input.expectedPlanVersion,plan => {
            const question=this.repository.questionRow(input.questionId); if(question.planId!==plan.id) throw new Academic.StudError("INVALID_INPUT","Question belongs to another Plan.");
            this.repository.assertVersion(question,input.expectedQuestionVersion,"STALE_QUESTION_VERSION"); const topic=this.repository.topicRow(question.topicId);
            const existingLinks=this.repository.db.prepare("SELECT requirement_item_id FROM stud_research_question_requirements WHERE question_id=?").all(question.id).map(row=>row.requirement_item_id);
            const value=Domain.normalizeQuestion({...input.question,origin:question.origin},{...question,text:question.questionText,order:question.questionOrder,requirementItemIds:existingLinks}); this.validateQuestionParent(plan,topic,value.parentQuestionId,question.id);
            const result=this.repository.db.prepare(`UPDATE stud_research_questions SET parent_question_id=?,question_text=?,rationale=?,priority=?,state=?,origin=?,question_order=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`).run(value.parentQuestionId,value.text,value.rationale,value.priority,value.state,value.origin,value.order,Academic.now(),question.id,question.rowVersion);
            if(!result.changes) throw new Academic.StudError("STALE_QUESTION_VERSION","Question changed before the update completed.");
            this.repository.replaceQuestionRequirements(question.id,this.requirementLinks(plan,value.requirementItemIds));
        });
    }

    validateQuestionParent(plan,topic,parentId,questionId) {
        if(!parentId) return; const parent=this.repository.questionRow(parentId);
        if(parent.planId!==plan.id || parent.topicId!==topic.id) throw new Academic.StudError("INVALID_INPUT","Parent Question belongs to another Topic.");
        if(parent.id===questionId || parent.parentQuestionId===questionId) throw new Academic.StudError("RESEARCH_QUESTION_CYCLE","Question hierarchy would create a cycle.");
        if(parent.parentQuestionId) throw new Academic.StudError("RESEARCH_QUESTION_DEPTH","Question hierarchy is bounded to one parent/child level.");
    }

    review(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion"],"Research Plan review");
        return this.repository.transaction(() => {
            const plan=this.repository.planRow(input.planId); this.repository.assertDraft(plan); this.repository.assertVersion(plan,input.expectedVersion);
            const pending=this.repository.db.prepare("SELECT COUNT(*) count FROM stud_research_topics WHERE plan_id=? AND disposition='PROPOSED'").get(plan.id).count;
            if(pending) throw new Academic.StudError("PLAN_REVIEW_INCOMPLETE","Every proposed Topic must be included, rejected or marked unresolved before review.",{pending});
            const retained=this.repository.db.prepare("SELECT COUNT(*) count FROM stud_research_topics WHERE plan_id=? AND disposition IN ('INCLUDED','UNRESOLVED')").get(plan.id).count;
            if(!retained) throw new Academic.StudError("PLAN_EMPTY","A reviewed Research Plan must retain at least one included or unresolved Topic.");
            const payload=this.repository.canonicalPayload(plan.id); const hash=Domain.canonicalHash(payload); const timestamp=Academic.now();
            const previous=this.repository.db.prepare("SELECT current_plan_id FROM stud_assignment_research_plans WHERE assignment_id=?").get(plan.assignmentId);
            if(previous && previous.current_plan_id!==plan.id) this.repository.db.prepare("UPDATE stud_research_plans SET lifecycle='SUPERSEDED',row_version=row_version+1,updated_at=? WHERE id=? AND lifecycle='REVIEWED'").run(timestamp,previous.current_plan_id);
            const result=this.repository.db.prepare("UPDATE stud_research_plans SET lifecycle='REVIEWED',plan_hash=?,reviewed_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND row_version=? AND lifecycle='DRAFT'").run(hash,timestamp,timestamp,plan.id,plan.rowVersion);
            if(!result.changes) throw new Academic.StudError("STALE_RESEARCH_VERSION","Research Plan changed before review completed.");
            this.repository.db.prepare(`INSERT INTO stud_assignment_research_plans (assignment_id,current_plan_id,updated_at) VALUES (?,?,?) ON CONFLICT(assignment_id) DO UPDATE SET current_plan_id=excluded.current_plan_id,updated_at=excluded.updated_at`).run(plan.assignmentId,plan.id,timestamp);
            return this.withContractCondition(this.repository.hydrate(plan.id));
        });
    }

    createRevision(input = {}) {
        Academic.assertAllowedKeys(input,["planId","expectedVersion"],"Research Plan revision");
        return this.repository.transaction(() => {
            const source=this.repository.planRow(input.planId); this.repository.assertVersion(source,input.expectedVersion);
            if(!["REVIEWED","SUPERSEDED"].includes(source.lifecycle)) throw new Academic.StudError("INVALID_TRANSITION","Only reviewed Research Plans can seed a revision.");
            const existing=this.repository.db.prepare("SELECT id FROM stud_research_plans WHERE assignment_id=? AND lifecycle='DRAFT'").get(source.assignmentId); if(existing) return this.withContractCondition(this.repository.hydrate(existing.id));
            const latest=this.repository.db.prepare("SELECT MAX(revision) revision FROM stud_research_plans WHERE assignment_id=?").get(source.assignmentId);
            const plan=this.repository.insertPlan({assignmentId:source.assignmentId,courseId:source.courseId,workflowId:source.workflowId,contractId:source.requirementsContractId,contractRevision:source.requirementsContractRevision,contractHash:source.requirementsContractHash,revision:Number(latest.revision||0)+1,parentPlanId:source.id,origin:"USER",userNotes:source.userNotes});
            this.cloneStructure(source.id,plan);
            return this.withContractCondition(this.repository.hydrate(plan.id));
        });
    }

    cloneStructure(sourcePlanId,targetPlan) {
        const topicMap=new Map();
        this.repository.topics(sourcePlanId).forEach(topic => {
            const links=topic.requirements.map(item=>({id:item.requirementItemId,basis:item.relationshipBasis,snapshotHash:item.requirementSnapshotHash}));
            const created=this.repository.insertTopic(targetPlan,{...topic,order:topic.topicOrder,parentTopicId:null},links); topicMap.set(topic.id,created.id);
        });
        this.repository.topics(sourcePlanId).filter(topic=>topic.parentTopicId).forEach(topic=>this.repository.db.prepare("UPDATE stud_research_topics SET parent_topic_id=? WHERE id=?").run(topicMap.get(topic.parentTopicId),topicMap.get(topic.id)));
        const questionMap=new Map();
        this.repository.questions(sourcePlanId).forEach(question => {
            const topic=this.repository.topicRow(topicMap.get(question.topicId)); const links=question.requirements.map(item=>({id:item.requirementItemId,snapshotHash:item.requirementSnapshotHash}));
            const created=this.repository.insertQuestion(targetPlan,topic,{...question,parentQuestionId:null},links); questionMap.set(question.id,created.id);
        });
        this.repository.questions(sourcePlanId).filter(question=>question.parentQuestionId).forEach(question=>this.repository.db.prepare("UPDATE stud_research_questions SET parent_question_id=? WHERE id=?").run(questionMap.get(question.parentQuestionId),questionMap.get(question.id)));
    }

    dossier(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","topicId","disposition","reviewState","beforeUpdatedAt","limit"],"Topic Dossier query");
        const assignment=this.repository.requireAssignment(input.assignmentId); const topic=this.repository.topicRow(input.topicId); if(topic.assignmentId!==assignment.id) throw new Academic.StudError("INVALID_INPUT","Topic does not belong to this Assignment.");
        const items=this.repository.listDossier(topic.id,{disposition:input.disposition?Academic.enumValue(input.disposition,Domain.DOSSIER_DISPOSITIONS,"Dossier disposition"):null,reviewState:input.reviewState?Academic.enumValue(input.reviewState,Domain.REVIEW_STATES,"Review state"):null,beforeUpdatedAt:input.beforeUpdatedAt?Academic.optionalDate(input.beforeUpdatedAt,"Dossier cursor"):null,limit:this.limit(input.limit,50,Domain.LIMITS.dossierPage)}).map(item=>this.withDossierAvailability(item));
        return Object.freeze({topic,items:Object.freeze(items)});
    }

    withDossierAvailability(item) {
        let artifact=null;
        if(item.artifactId) artifact=this.repository.db.prepare("SELECT availability_state FROM stud_assignment_artifacts WHERE id=?").get(item.artifactId);
        if(item.artifactId&&!artifact)return Object.freeze({...item,availabilityState:"MISSING"});
        if(artifact&&artifact.availability_state!=="AVAILABLE")return Object.freeze({...item,availabilityState:artifact.availability_state});
        if(item.canonicalObjectType&&item.canonicalObjectId)return Object.freeze({...item,availabilityState:this.store.getEntity(item.canonicalObjectType,item.canonicalObjectId)?"AVAILABLE":"MISSING"});
        return Object.freeze({...item,availabilityState:artifact?"UNAVAILABLE":"MISSING"});
    }

    addDossierItem(input = {}) {
        Academic.assertAllowedKeys(input,["planId","topicId","canonicalObjectType","canonicalObjectId","artifactId","membershipOrigin","disposition","reviewState","sourceSuitability","stance","rationale","userNotes"],"Dossier Item creation");
        const plan=this.repository.planRow(input.planId); const topic=this.repository.topicRow(input.topicId); if(topic.planId!==plan.id) throw new Academic.StudError("INVALID_INPUT","Topic does not belong to this Plan.");
        const target=this.validateDossierTarget(plan,input); const timestamp=Academic.now();
        try {
            const id=Academic.createId("dossier_item");
            this.repository.db.prepare(`INSERT INTO stud_topic_dossier_items (id,plan_id,topic_id,assignment_id,canonical_object_type,canonical_object_id,artifact_id,membership_origin,disposition,review_state,source_suitability,stance,rationale,user_notes,row_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(id,plan.id,topic.id,plan.assignmentId,target.canonicalObjectType,target.canonicalObjectId,target.artifactId,Academic.enumValue(input.membershipOrigin||"USER_ADDED",Domain.MEMBERSHIP_ORIGINS,"Dossier origin","USER_ADDED"),Academic.enumValue(input.disposition||"ACCEPTED",Domain.DOSSIER_DISPOSITIONS,"Dossier disposition","ACCEPTED"),Academic.enumValue(input.reviewState||"UNREVIEWED",Domain.REVIEW_STATES,"Dossier review state","UNREVIEWED"),Academic.enumValue(input.sourceSuitability||"UNKNOWN",Domain.SOURCE_SUITABILITY,"Source suitability","UNKNOWN"),Academic.enumValue(input.stance||"NOT_ASSESSED",Domain.STANCES,"Material position","NOT_ASSESSED"),Academic.optionalText(input.rationale,"Dossier rationale",Domain.LIMITS.rationale),Academic.optionalText(input.userNotes,"Dossier notes",Domain.LIMITS.note),timestamp,timestamp);
            return this.withDossierAvailability(this.repository.dossierRow(id));
        } catch(error){ if(/UNIQUE/i.test(error.message)) throw new Academic.StudError("DUPLICATE_DOSSIER_ITEM","This material already has a Dossier relationship for the Topic."); throw error; }
    }

    updateDossierItem(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","itemId","expectedVersion","disposition","reviewState","sourceSuitability","stance","rationale","userNotes"],"Dossier Item update");
        const item=this.repository.dossierRow(input.itemId); if(item.assignmentId!==Academic.safeId(input.assignmentId,"Assignment ID")) throw new Academic.StudError("INVALID_INPUT","Dossier Item belongs to another Assignment."); this.repository.assertVersion(item,input.expectedVersion,"STALE_DOSSIER_VERSION");
        const result=this.repository.db.prepare(`UPDATE stud_topic_dossier_items SET disposition=?,review_state=?,source_suitability=?,stance=?,rationale=?,user_notes=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?`).run(input.disposition===undefined?item.disposition:Academic.enumValue(input.disposition,Domain.DOSSIER_DISPOSITIONS,"Dossier disposition"),input.reviewState===undefined?item.reviewState:Academic.enumValue(input.reviewState,Domain.REVIEW_STATES,"Review state"),input.sourceSuitability===undefined?item.sourceSuitability:Academic.enumValue(input.sourceSuitability,Domain.SOURCE_SUITABILITY,"Source suitability"),input.stance===undefined?item.stance:Academic.enumValue(input.stance,Domain.STANCES,"Material position"),input.rationale===undefined?item.rationale:Academic.optionalText(input.rationale,"Dossier rationale",Domain.LIMITS.rationale),input.userNotes===undefined?item.userNotes:Academic.optionalText(input.userNotes,"Dossier notes",Domain.LIMITS.note),Academic.now(),item.id,item.rowVersion);
        if(!result.changes) throw new Academic.StudError("STALE_DOSSIER_VERSION","Dossier Item changed before the update completed."); return this.withDossierAvailability(this.repository.dossierRow(item.id));
    }

    validateDossierTarget(plan,input) {
        if(Boolean(input.canonicalObjectType)!==Boolean(input.canonicalObjectId) || (!input.canonicalObjectId && !input.artifactId)) throw new Academic.StudError("INVALID_INPUT","Dossier material requires a canonical object or Artifact reference.");
        let canonicalObjectType=null,canonicalObjectId=null,artifactId=null;
        if(input.canonicalObjectId){ canonicalObjectType=Academic.enumValue(input.canonicalObjectType,Domain.DOSSIER_OBJECT_TYPES,"Dossier object type"); canonicalObjectId=Academic.safeId(input.canonicalObjectId,"Dossier object ID"); const object=this.store.getEntity(canonicalObjectType,canonicalObjectId); if(!object) throw new Academic.StudError("NOT_FOUND","Dossier canonical object does not exist."); if(!this.workingContext || !this.workingContext.relationshipScope(canonicalObjectType,object,plan.courseId,plan.assignmentId)) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED","Material must already be related to the Assignment or Course before entering a Topic Dossier."); }
        if(input.artifactId){ const artifact=this.repository.db.prepare("SELECT id,assignment_id,canonical_object_type,canonical_object_id FROM stud_assignment_artifacts WHERE id=?").get(Academic.safeId(input.artifactId,"Artifact ID")); if(!artifact || artifact.assignment_id!==plan.assignmentId) throw new Academic.StudError("CROSS_ASSIGNMENT_ARTIFACT","Artifact does not belong to this Assignment."); artifactId=artifact.id; canonicalObjectType ||= artifact.canonical_object_type; canonicalObjectId ||= artifact.canonical_object_id; }
        return {canonicalObjectType,canonicalObjectId,artifactId};
    }

    addGap(input = {}) {
        Academic.assertAllowedKeys(input,["planId","topicId","gapType","title","description","questionId","requirementItemId","blockerId"],"Research Gap creation");
        const plan=this.repository.planRow(input.planId); const topic=this.repository.topicRow(input.topicId); if(topic.planId!==plan.id) throw new Academic.StudError("INVALID_INPUT","Gap Topic belongs to another Plan.");
        let questionId=null;if(input.questionId){const question=this.repository.questionRow(input.questionId);if(question.topicId!==topic.id)throw new Academic.StudError("INVALID_INPUT","Gap Question belongs to another Topic.");questionId=question.id;}
        let requirementItemId=null;if(input.requirementItemId)requirementItemId=this.requirementLink(plan,input.requirementItemId).id;
        let blockerId=null;if(input.blockerId){const blocker=this.repository.db.prepare("SELECT b.id,w.assignment_id FROM stud_workflow_blockers b JOIN stud_workflow_instances w ON w.id=b.workflow_id WHERE b.id=?").get(Academic.safeId(input.blockerId,"Blocker ID"));if(!blocker||blocker.assignment_id!==plan.assignmentId)throw new Academic.StudError("INVALID_INPUT","Blocker does not belong to this Assignment.");blockerId=blocker.id;}
        const id=Academic.createId("research_gap"),timestamp=Academic.now();this.repository.db.prepare(`INSERT INTO stud_research_gaps (id,plan_id,topic_id,assignment_id,gap_type,title,description,state,question_id,requirement_item_id,blocker_id,row_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'OPEN',?,?,?,1,?,?)`).run(id,plan.id,topic.id,plan.assignmentId,Academic.enumValue(input.gapType||"CUSTOM",Domain.GAP_TYPES,"Research Gap type","CUSTOM"),Academic.requiredText(input.title,"Research Gap title",Domain.LIMITS.title),Academic.optionalText(input.description,"Research Gap description",Domain.LIMITS.description),questionId,requirementItemId,blockerId,timestamp,timestamp);return this.repository.gapRow(id);
    }

    resolveGap(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","gapId","expectedVersion","action","note"],"Research Gap resolution"); const gap=this.repository.gapRow(input.gapId);if(gap.assignmentId!==Academic.safeId(input.assignmentId,"Assignment ID"))throw new Academic.StudError("INVALID_INPUT","Research Gap belongs to another Assignment.");this.repository.assertVersion(gap,input.expectedVersion,"STALE_GAP_VERSION");if(gap.state!=="OPEN")throw new Academic.StudError("INVALID_TRANSITION","Only an open Research Gap can be resolved or dismissed.");const state=Academic.enumValue(input.action,["RESOLVED","DISMISSED"],"Gap action");const timestamp=Academic.now();const result=this.repository.db.prepare("UPDATE stud_research_gaps SET state=?,resolution_note=?,resolved_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND row_version=?").run(state,Academic.optionalText(input.note,"Gap resolution note",Domain.LIMITS.rationale),timestamp,timestamp,gap.id,gap.rowVersion);if(!result.changes)throw new Academic.StudError("STALE_GAP_VERSION","Research Gap changed before resolution completed.");return this.repository.gapRow(gap.id);
    }

    coverage(input = {}) {
        Academic.assertAllowedKeys(input,["assignmentId","topicId"],"Research coverage query"); const assignment=this.repository.requireAssignment(input.assignmentId); const topic=this.repository.topicRow(input.topicId);if(topic.assignmentId!==assignment.id)throw new Academic.StudError("INVALID_INPUT","Topic belongs to another Assignment.");
        const questions=this.repository.db.prepare("SELECT state,COUNT(*) count FROM stud_research_questions WHERE topic_id=? GROUP BY state").all(topic.id);const q=Object.fromEntries(questions.map(row=>[row.state,row.count]));
        const material=this.repository.db.prepare("SELECT disposition,review_state,stance,COUNT(*) count FROM stud_topic_dossier_items WHERE topic_id=? GROUP BY disposition,review_state,stance").all(topic.id);const accepted=material.filter(row=>row.disposition==='ACCEPTED').reduce((n,row)=>n+row.count,0);const reviewed=material.filter(row=>row.disposition==='ACCEPTED'&&row.review_state==='REVIEWED').reduce((n,row)=>n+row.count,0);const contradictions=material.filter(row=>row.disposition==='ACCEPTED'&&['CONFLICTS','ALTERNATIVE','UNCERTAIN'].includes(row.stance)).reduce((n,row)=>n+row.count,0);
        const openGaps=this.repository.db.prepare("SELECT g.gap_type,g.blocker_id,b.status blocker_status FROM stud_research_gaps g LEFT JOIN stud_workflow_blockers b ON b.id=g.blocker_id WHERE g.topic_id=? AND g.state='OPEN'").all(topic.id);const blocked=openGaps.some(gap=>gap.blocker_id&&gap.blocker_status==='OPEN');const reqs=this.repository.db.prepare("SELECT COUNT(*) count FROM stud_research_topic_requirements WHERE topic_id=?").get(topic.id).count;
        const reasons=[];if(!accepted)reasons.push("No accepted material is associated with this Topic.");if(accepted&&!reviewed)reasons.push(`${accepted} material item${accepted===1?' is':'s are'} available but none is marked reviewed.`);if((q.OPEN||0)+(q.UNRESOLVED||0))reasons.push(`${(q.OPEN||0)+(q.UNRESOLVED||0)} research question${(q.OPEN||0)+(q.UNRESOLVED||0)===1?' remains':'s remain'} unresolved.`);if(openGaps.length)reasons.push(`${openGaps.length} explicit research gap${openGaps.length===1?' remains':'s remain'}.`);if(contradictions)reasons.push(`${contradictions} accepted material item${contradictions===1?' records':'s record'} conflict, alternative or uncertainty.`);if(reqs&&!reviewed)reasons.push(`${reqs} linked Requirement${reqs===1?' has':'s have'} no reviewed material yet.`);
        let state="EMPTY";if(blocked)state="BLOCKED";else if(openGaps.length||contradictions||(q.OPEN||0)+(q.UNRESOLVED||0))state="GAPS_REMAIN";else if(reviewed&&reqs)state="SUPPORTED";else if(accepted||q.ANSWERED)state="PARTIAL";else if((q.OPEN||0)||(q.UNRESOLVED||0)||material.length)state="STARTED";
        return Object.freeze({topicId:topic.id,state,reasons:Object.freeze(reasons),counts:Object.freeze({requirements:reqs,questions:Object.freeze(q),acceptedMaterial:accepted,reviewedMaterial:reviewed,contradictoryOrAlternative:contradictions,openGaps:openGaps.length}),noPercentage:true});
    }

    limit(value,fallback,max){if(value===undefined||value===null||value==='')return fallback;const n=Number(value);if(!Number.isInteger(n)||n<1||n>max)throw new Academic.StudError("INVALID_INPUT",`Limit must be between 1 and ${max}.`);return n;}
}

module.exports = Object.freeze({StudResearchPlanService, RESEARCH_RELEVANT_REQUIREMENTS});
