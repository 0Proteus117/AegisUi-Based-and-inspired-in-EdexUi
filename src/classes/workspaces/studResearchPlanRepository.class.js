"use strict";

const Academic = require("./studAcademicModel.class.js");
const Domain = require("./studResearchPlanModel.class.js");

function camel(row) {
    if (!row) return null;
    const result = {};
    Object.entries(row).forEach(([key, value]) => { result[key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())] = value; });
    return result;
}

class StudResearchPlanRepository {
    constructor(store) {
        if (!store) throw new Error("StudAcademicStore is required.");
        this.store = store;
        this.store.initialize();
        this.db = store.db;
    }

    transaction(work) { return this.store.transaction(work); }
    requireAssignment(id) { const value = this.store.getEntity("ASSIGNMENT", Academic.safeId(id, "Assignment ID")); if (!value) throw new Academic.StudError("NOT_FOUND", "Assignment does not exist."); return value; }
    planRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_research_plans WHERE id=?").get(Academic.safeId(id, "Research Plan ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Research Plan does not exist."); return value; }
    topicRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_research_topics WHERE id=?").get(Academic.safeId(id, "Research Topic ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Research Topic does not exist."); return value; }
    questionRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_research_questions WHERE id=?").get(Academic.safeId(id, "Research Question ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Research Question does not exist."); return value; }
    dossierRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_topic_dossier_items WHERE id=?").get(Academic.safeId(id, "Dossier Item ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Dossier Item does not exist."); return value; }
    gapRow(id) { const value = camel(this.db.prepare("SELECT * FROM stud_research_gaps WHERE id=?").get(Academic.safeId(id, "Research Gap ID"))); if (!value) throw new Academic.StudError("NOT_FOUND", "Research Gap does not exist."); return value; }
    assertDraft(plan) { if (plan.lifecycle !== "DRAFT") throw new Academic.StudError("REVIEWED_PLAN_IMMUTABLE", "Reviewed or superseded Research Plans cannot be edited in place.", {lifecycle: plan.lifecycle}); }
    assertVersion(row, expected, code = "STALE_RESEARCH_VERSION") { const version = Domain.expectedVersion(expected); if (row.rowVersion !== version) throw new Academic.StudError(code, "Research data changed in another operation. Reload before saving.", {expected: version, actual: row.rowVersion}); }

    requirementLinks(table, column, id) {
        return Object.freeze(this.db.prepare(`SELECT l.requirement_item_id,l.relationship_basis,l.requirement_snapshot_hash,i.requirement_type,i.label,i.display_value,i.resolution_state
            FROM ${table} l JOIN stud_requirement_items i ON i.id=l.requirement_item_id WHERE l.${column}=? ORDER BY i.item_order,i.id`).all(id).map(row => Object.freeze(camel(row))));
    }

    topics(planId) {
        return Object.freeze(this.db.prepare("SELECT * FROM stud_research_topics WHERE plan_id=? ORDER BY topic_order,id LIMIT 100").all(planId).map(row => {
            const value = camel(row);
            value.requirements = this.requirementLinks("stud_research_topic_requirements", "topic_id", value.id);
            return Object.freeze(value);
        }));
    }

    questions(planId) {
        return Object.freeze(this.db.prepare("SELECT * FROM stud_research_questions WHERE plan_id=? ORDER BY question_order,id LIMIT 200").all(planId).map(row => {
            const value = camel(row);
            value.text = value.questionText; delete value.questionText;
            value.order = value.questionOrder; delete value.questionOrder;
            const links = this.db.prepare(`SELECT l.requirement_item_id,l.requirement_snapshot_hash,i.requirement_type,i.label,i.display_value,i.resolution_state
                FROM stud_research_question_requirements l JOIN stud_requirement_items i ON i.id=l.requirement_item_id WHERE l.question_id=? ORDER BY i.item_order,i.id`).all(value.id).map(row => Object.freeze(camel(row)));
            value.requirements = Object.freeze(links);
            return Object.freeze(value);
        }));
    }

    gaps(planId) { return Object.freeze(this.db.prepare("SELECT * FROM stud_research_gaps WHERE plan_id=? ORDER BY state,updated_at DESC,id DESC LIMIT 200").all(planId).map(row => Object.freeze(camel(row)))); }

    hydrate(planId) {
        const plan = this.planRow(planId);
        const contract = this.db.prepare("SELECT id,assignment_id,revision,lifecycle,completeness,contract_hash,approved_at FROM stud_requirement_contracts WHERE id=?").get(plan.requirementsContractId);
        const topics = this.topics(plan.id);
        const questions = this.questions(plan.id);
        const gaps = this.gaps(plan.id);
        const dossierCounts = Object.freeze(this.db.prepare("SELECT topic_id,COUNT(*) total,SUM(CASE WHEN disposition='ACCEPTED' THEN 1 ELSE 0 END) accepted,SUM(CASE WHEN review_state='REVIEWED' THEN 1 ELSE 0 END) reviewed FROM stud_topic_dossier_items WHERE plan_id=? GROUP BY topic_id").all(plan.id).map(row => Object.freeze(camel(row))));
        return Object.freeze({...plan, contract: contract ? Object.freeze(camel(contract)) : null, topics, questions, gaps, dossierCounts});
    }

    assignmentState(assignmentId) {
        const assignment = this.requireAssignment(assignmentId);
        const pointer = this.db.prepare("SELECT current_plan_id FROM stud_assignment_research_plans WHERE assignment_id=?").get(assignment.id);
        const draft = this.db.prepare("SELECT id FROM stud_research_plans WHERE assignment_id=? AND lifecycle='DRAFT' ORDER BY revision DESC LIMIT 1").get(assignment.id);
        const history = Object.freeze(this.db.prepare("SELECT id,revision,lifecycle,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,origin,plan_hash,row_version,created_at,updated_at,reviewed_at FROM stud_research_plans WHERE assignment_id=? ORDER BY revision DESC LIMIT 100").all(assignment.id).map(row => Object.freeze(camel(row))));
        return Object.freeze({assignment, current: pointer ? this.hydrate(pointer.current_plan_id) : null, draft: draft ? this.hydrate(draft.id) : null, history});
    }

    insertPlan(value) {
        const id = Academic.createId("research_plan"); const timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_research_plans
            (id,assignment_id,course_id,workflow_id,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,lifecycle,revision,parent_plan_id,origin,user_notes,plan_hash,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,'DRAFT',?,?,?,?,NULL,1,?,?)`)
            .run(id,value.assignmentId,value.courseId,value.workflowId,value.contractId,value.contractRevision,value.contractHash,value.revision,value.parentPlanId,value.origin,value.userNotes,timestamp,timestamp);
        return this.hydrate(id);
    }

    bumpPlan(planId, expectedVersion, work) {
        return this.transaction(() => {
            const plan = this.planRow(planId); this.assertDraft(plan); this.assertVersion(plan, expectedVersion);
            work(plan);
            const result = this.db.prepare("UPDATE stud_research_plans SET row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?").run(Academic.now(),plan.id,plan.rowVersion);
            if (!result.changes) throw new Academic.StudError("STALE_RESEARCH_VERSION", "Research Plan changed before the update completed.");
            return this.hydrate(plan.id);
        });
    }

    insertTopic(plan, value, requirementLinks = []) {
        const id = Academic.createId("research_topic"); const timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_research_topics
            (id,plan_id,assignment_id,parent_topic_id,workflow_node_id,title,description,rationale,priority,topic_order,origin,basis,disposition,user_notes,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
            .run(id,plan.id,plan.assignmentId,value.parentTopicId,value.workflowNodeId,value.title,value.description,value.rationale,value.priority,value.order,value.origin,value.basis,value.disposition,value.userNotes,timestamp,timestamp);
        requirementLinks.forEach(link => this.db.prepare("INSERT INTO stud_research_topic_requirements (topic_id,requirement_item_id,relationship_basis,requirement_snapshot_hash,created_at) VALUES (?,?,?,?,?)").run(id,link.id,link.basis,link.snapshotHash,timestamp));
        return this.topicRow(id);
    }

    replaceTopicRequirements(topicId, links) {
        this.db.prepare("DELETE FROM stud_research_topic_requirements WHERE topic_id=?").run(topicId);
        const timestamp = Academic.now();
        links.forEach(link => this.db.prepare("INSERT INTO stud_research_topic_requirements (topic_id,requirement_item_id,relationship_basis,requirement_snapshot_hash,created_at) VALUES (?,?,?,?,?)").run(topicId,link.id,link.basis,link.snapshotHash,timestamp));
    }

    insertQuestion(plan, topic, value, requirementLinks = []) {
        const id = Academic.createId("research_question"); const timestamp = Academic.now();
        this.db.prepare(`INSERT INTO stud_research_questions
            (id,plan_id,topic_id,assignment_id,parent_question_id,question_text,rationale,priority,state,origin,question_order,row_version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
            .run(id,plan.id,topic.id,plan.assignmentId,value.parentQuestionId,value.text,value.rationale,value.priority,value.state,value.origin,value.order,timestamp,timestamp);
        requirementLinks.forEach(link => this.db.prepare("INSERT INTO stud_research_question_requirements (question_id,requirement_item_id,requirement_snapshot_hash,created_at) VALUES (?,?,?,?)").run(id,link.id,link.snapshotHash,timestamp));
        return this.questionRow(id);
    }

    replaceQuestionRequirements(questionId, links) {
        this.db.prepare("DELETE FROM stud_research_question_requirements WHERE question_id=?").run(questionId);
        const timestamp = Academic.now();
        links.forEach(link => this.db.prepare("INSERT INTO stud_research_question_requirements (question_id,requirement_item_id,requirement_snapshot_hash,created_at) VALUES (?,?,?,?)").run(questionId,link.id,link.snapshotHash,timestamp));
    }

    listDossier(topicId, options) {
        const topic = this.topicRow(topicId); const where=["topic_id=?"], args=[topic.id];
        if (options.disposition) { where.push("disposition=?"); args.push(options.disposition); }
        if (options.reviewState) { where.push("review_state=?"); args.push(options.reviewState); }
        if (options.beforeUpdatedAt) { where.push("updated_at<?"); args.push(options.beforeUpdatedAt); }
        args.push(options.limit);
        return Object.freeze(this.db.prepare(`SELECT * FROM stud_topic_dossier_items WHERE ${where.join(" AND ")} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...args).map(row => Object.freeze(camel(row))));
    }

    canonicalPayload(planId) {
        const plan = this.hydrate(planId);
        return {
            assignmentId: plan.assignmentId, courseId: plan.courseId, workflowId: plan.workflowId,
            contract: {id: plan.requirementsContractId, revision: plan.requirementsContractRevision, hash: plan.requirementsContractHash},
            revision: plan.revision, origin: plan.origin, userNotes: plan.userNotes,
            topics: plan.topics.map(topic => ({id: topic.id,parentTopicId: topic.parentTopicId,title: topic.title,description: topic.description,rationale: topic.rationale,priority: topic.priority,order: topic.topicOrder,origin: topic.origin,basis: topic.basis,disposition: topic.disposition,userNotes: topic.userNotes,requirements: topic.requirements.map(item => ({id:item.requirementItemId,snapshotHash:item.requirementSnapshotHash,basis:item.relationshipBasis}))})),
            questions: plan.questions.map(question => ({id:question.id,topicId:question.topicId,parentQuestionId:question.parentQuestionId,text:question.text,rationale:question.rationale,priority:question.priority,state:question.state,origin:question.origin,order:question.order,requirements:question.requirements.map(item => ({id:item.requirementItemId,snapshotHash:item.requirementSnapshotHash}))}))
        };
    }
}

module.exports = Object.freeze({StudResearchPlanRepository, camel});
