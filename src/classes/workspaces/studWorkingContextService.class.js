"use strict";

// M2 keeps the meaningful academic context in the existing canonical STUD
// database.  This service is deliberately narrow: it validates and persists a
// single current context, but never searches, invokes a provider, opens a file
// or creates a relationship as a side effect of navigation.
const Model = require("./studAcademicModel.class.js");

const CONTEXT_OBJECT_TYPES = Object.freeze([
    "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT",
    "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"
]);
const CLASSIFICATION_LABELS = Object.freeze({
    COURSEWORK: "COURSEWORK", EXAM: "EXAM", LAB_PRACTICAL: "LAB / PRACTICAL",
    PRESENTATION: "PRESENTATION", TEAM_PROJECT: "TEAM PROJECT",
    INDIVIDUAL_COMPONENT: "INDIVIDUAL COMPONENT", PEER_FEEDBACK: "PEER FEEDBACK",
    SUBMISSION_POINT: "SUBMISSION POINT", FORMATIVE_PRACTICE: "FORMATIVE / PRACTICE",
    ADMINISTRATIVE: "ADMINISTRATIVE", OTHER: "OTHER", UNKNOWN: "UNKNOWN"
});

function normalizedText(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase("en-GB").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function deterministicClassification(assignment) {
    const text = normalizedText(`${assignment.title || ""} ${assignment.description || ""}`);
    const definitions = [
        ["PEER_FEEDBACK", /\bpeer (?:feedback|review)\b/],
        ["LAB_PRACTICAL", /\b(?:lab(?:oratory)?|practical)\b/],
        ["PRESENTATION", /\b(?:presentation|oral|pitch)\b/],
        ["TEAM_PROJECT", /\b(?:team|group) (?:\w+\s+)?(?:project|assignment|report|presentation)\b/],
        ["INDIVIDUAL_COMPONENT", /\bindividual (?:component|report|assignment)\b/],
        ["EXAM", /\b(?:exam(?:ination)?|timed assessment)\b/],
        ["FORMATIVE_PRACTICE", /\b(?:formative|practice|mock|self assessment)\b/],
        ["SUBMISSION_POINT", /\b(?:submission point|upload only|turnitin submission)\b/],
        ["ADMINISTRATIVE", /\b(?:induction|attendance|administrative)\b/],
        ["COURSEWORK", /\b(?:coursework|essay|report|portfolio|case analysis|literature review|dissertation)\b/]
    ];
    const matched = definitions.find(([, expression]) => expression.test(text));
    return matched
        ? Object.freeze({classification: matched[0], sourceKind: "DETERMINISTIC", sourceDetail: "Bounded title/description classification; user correction available.", userCorrected: false})
        : Object.freeze({classification: "UNKNOWN", sourceKind: "DETERMINISTIC", sourceDetail: "No supported deterministic classification signal.", userCorrected: false});
}

class StudWorkingContextService {
    constructor(options = {}) {
        if (!options.store) throw new Error("StudAcademicStore is required.");
        this.store = options.store;
        this.db = this.store.db;
        this.requirements = options.requirementsService || null;
    }

    assertPayload(input = {}) {
        Model.assertAllowedKeys(input, ["courseId", "assignmentId", "objectType", "objectId", "workflowId", "workflowNodeId", "researchPlanId", "researchTopicId", "originSurface", "userPinned"], "Working context");
        return input;
    }

    assignmentClassification(assignmentId) {
        const assignment = this.store.getEntity("ASSIGNMENT", Model.safeId(assignmentId, "Assignment ID"));
        if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
        const persisted = this.db.prepare("SELECT * FROM stud_assignment_classifications WHERE assignment_id=?").get(assignment.id);
        const value = persisted
            ? {classification: persisted.classification, sourceKind: persisted.source_kind, sourceDetail: persisted.source_detail, userCorrected: Boolean(persisted.user_corrected), updatedAt: persisted.updated_at}
            : deterministicClassification(assignment);
        return Object.freeze({assignmentId: assignment.id, ...value, label: CLASSIFICATION_LABELS[value.classification] || "UNKNOWN"});
    }

    listClassifications(options = {}) {
        Model.assertAllowedKeys(options, ["limit"], "Assessment classification options");
        const assignments = this.store.listEntities("ASSIGNMENT", {limit: Math.max(1, Math.min(Number(options.limit) || 500, 500))});
        return Object.freeze(assignments.map(assignment => this.assignmentClassification(assignment.id)));
    }

    setClassification(input = {}) {
        Model.assertAllowedKeys(input, ["assignmentId", "classification", "reason"], "Assessment classification");
        const assignment = this.store.getEntity("ASSIGNMENT", Model.safeId(input.assignmentId, "Assignment ID"));
        if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
        const classification = Model.enumValue(input.classification, Model.ASSESSMENT_CLASSIFICATIONS, "Assessment classification", "UNKNOWN");
        const reason = Model.optionalText(input.reason, "Classification reason", 1000);
        const timestamp = Model.now();
        this.store.transaction(() => {
            this.db.prepare(`INSERT INTO stud_assignment_classifications (assignment_id,classification,source_kind,source_detail,user_corrected,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(assignment_id) DO UPDATE SET classification=excluded.classification,source_kind=excluded.source_kind,source_detail=excluded.source_detail,user_corrected=excluded.user_corrected,updated_at=excluded.updated_at`)
                .run(assignment.id, classification, "USER", reason, 1, timestamp, timestamp);
            this.store.createProvenance({entityType: "ASSIGNMENT", entityId: assignment.id, field: "assessmentClassification", observedValue: classification, sourceType: "USER", sourceId: "STUD_M2", sourceAuthority: "USER_OVERRIDE", observedAt: timestamp, metadata: {reason, explicit: true}});
        });
        return this.assignmentClassification(assignment.id);
    }

    courseOrganisation(options = {}) {
        Model.assertAllowedKeys(options, ["limit"], "Academic organisation options");
        const limit = Math.max(1, Math.min(Number(options.limit) || 300, 500));
        const courses = this.store.listEntities("COURSE", {limit});
        const assignments = this.store.listEntities("ASSIGNMENT", {limit: 500});
        const byCourse = new Map(assignments.reduce((all, assignment) => {
            if (!assignment.courseId) return all;
            const list = all.get(assignment.courseId) || [];
            list.push({...assignment, assessmentClassification: this.assignmentClassification(assignment.id)});
            all.set(assignment.courseId, list);
            return all;
        }, new Map()));
        const years = new Map();
        courses.forEach(course => {
            const year = course.academicYear || "UNCLASSIFIED";
            const term = course.academicTerm || "TERM UNKNOWN";
            const yearGroup = years.get(year) || {academicYear: year, unknown: !course.academicYear, terms: new Map(), latest: "", activeCount: 0};
            const termGroup = yearGroup.terms.get(term) || {academicTerm: term, unknown: !course.academicTerm, courses: []};
            const courseAssignments = byCourse.get(course.id) || [];
            termGroup.courses.push(Object.freeze({...course, assignments: Object.freeze(courseAssignments)}));
            yearGroup.terms.set(term, termGroup);
            yearGroup.latest = [yearGroup.latest, course.endDate || course.startDate || course.updatedAt || ""].sort().at(-1);
            if (course.status === "ACTIVE") yearGroup.activeCount += 1;
            years.set(year, yearGroup);
        });
        const sortedYears = [...years.values()].sort((left, right) => {
            if (left.unknown !== right.unknown) return left.unknown ? 1 : -1;
            if (left.activeCount !== right.activeCount) return right.activeCount - left.activeCount;
            return String(right.latest).localeCompare(String(left.latest));
        }).map((year, index) => Object.freeze({
            academicYear: year.academicYear,
            unknown: year.unknown,
            // “Current” is a bounded presentation priority. It relies only on
            // explicit dates/status, never a guessed institution rule.
            current: index === 0 && !year.unknown,
            terms: Object.freeze([...year.terms.values()].sort((left, right) => left.unknown === right.unknown ? left.academicTerm.localeCompare(right.academicTerm, undefined, {numeric: true}) : left.unknown ? 1 : -1).map(term => Object.freeze({...term, courses: Object.freeze(term.courses.sort((left, right) => `${left.code || ""} ${left.title}`.localeCompare(`${right.code || ""} ${right.title}`)))})))
        }));
        return Object.freeze({years: Object.freeze(sortedYears), unassignedAssignments: Object.freeze(assignments.filter(item => !item.courseId).map(item => Object.freeze({...item, assessmentClassification: this.assignmentClassification(item.id)})))});
    }

    activeContract(assignmentId) {
        if (!this.requirements) return null;
        const state = this.requirements.state(assignmentId);
        return state.current || state.draft || null;
    }

    relationshipScope(objectType, object, courseId, assignmentId) {
        if (objectType === "ASSIGNMENT") return object.id === assignmentId ? "ASSIGNMENT" : null;
        if (objectType === "COURSE") return object.id === courseId ? "COURSE" : null;
        if (assignmentId && object.assignmentId) return object.assignmentId === assignmentId ? "ASSIGNMENT" : null;
        if (courseId && object.courseId) return object.courseId === courseId ? "COURSE" : null;
        const endpoints = this.store.listRelationships(objectType, object.id);
        const relatedAssignment = endpoints.some(link => (link.fromType === "ASSIGNMENT" && link.fromId === assignmentId) || (link.toType === "ASSIGNMENT" && link.toId === assignmentId));
        if (relatedAssignment) return "ASSIGNMENT";
        const relatedCourse = endpoints.some(link => (link.fromType === "COURSE" && link.fromId === courseId) || (link.toType === "COURSE" && link.toId === courseId));
        return relatedCourse ? "COURSE" : null;
    }

    validate(input = {}) {
        this.assertPayload(input);
        const assignmentId = input.assignmentId ? Model.safeId(input.assignmentId, "Assignment ID") : null;
        let courseId = input.courseId ? Model.safeId(input.courseId, "Course ID") : null;
        let assignment = null;
        if (assignmentId) {
            assignment = this.store.getEntity("ASSIGNMENT", assignmentId);
            if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
            if (assignment.courseId && courseId && assignment.courseId !== courseId) throw new Model.StudError("INVALID_CONTEXT", "The selected assignment does not belong to the selected course.");
            courseId ||= assignment.courseId || null;
        }
        let course = null;
        if (courseId) {
            course = this.store.getEntity("COURSE", courseId);
            if (!course) throw new Model.StudError("NOT_FOUND", "Course does not exist.");
        }
        const objectType = input.objectType ? Model.enumValue(input.objectType, CONTEXT_OBJECT_TYPES, "Context object type") : null;
        const objectId = input.objectId ? Model.safeId(input.objectId, "Context object ID") : null;
        if (Boolean(objectType) !== Boolean(objectId)) throw new Model.StudError("INVALID_CONTEXT", "A current object requires both its type and ID.");
        let object = null;
        let objectScope = null;
        if (objectType) {
            object = this.store.getEntity(objectType, objectId);
            if (!object) throw new Model.StudError("NOT_FOUND", "Current academic object does not exist.");
            objectScope = this.relationshipScope(objectType, object, courseId, assignmentId);
            if (!objectScope) throw new Model.StudError("CONTEXT_RELATION_REQUIRED", "The selected object is not related to the active course or assignment. Link it explicitly before making it current work.");
        }
        let workflowId = input.workflowId ? Model.safeId(input.workflowId, "Workflow ID") : null;
        if (!workflowId && assignmentId) {
            const currentWorkflow = this.db.prepare("SELECT id FROM stud_workflow_instances WHERE assignment_id=? AND is_current=1 AND lifecycle='ACTIVE'").get(assignmentId);
            workflowId = currentWorkflow && currentWorkflow.id || null;
        }
        let workflow = null;
        if (workflowId) {
            if (!assignmentId) throw new Model.StudError("INVALID_CONTEXT", "A workflow context requires an active Assignment.");
            workflow = this.db.prepare("SELECT id,assignment_id,template_version_id,row_version FROM stud_workflow_instances WHERE id=? AND is_current=1 AND lifecycle='ACTIVE'").get(workflowId);
            if (!workflow || workflow.assignment_id !== assignmentId) throw new Model.StudError("INVALID_CONTEXT", "The selected workflow is not the current workflow for this Assignment.");
        }
        const workflowNodeId = input.workflowNodeId ? Model.safeId(input.workflowNodeId, "Workflow node ID") : null;
        let workflowNode = null;
        if (workflowNodeId) {
            if (!workflowId) throw new Model.StudError("INVALID_CONTEXT", "A workflow node context requires an active workflow.");
            workflowNode = this.db.prepare("SELECT id,workflow_id,title,semantic_type,state,row_version FROM stud_workflow_nodes WHERE id=? AND workflow_id=?").get(workflowNodeId, workflowId);
            if (!workflowNode) throw new Model.StudError("INVALID_CONTEXT", "The selected workflow node does not belong to the active workflow.");
        }
        const researchPlanId = input.researchPlanId ? Model.safeId(input.researchPlanId, "Research Plan ID") : null;
        let researchPlan = null;
        if (researchPlanId) {
            if (!assignmentId) throw new Model.StudError("INVALID_CONTEXT", "A Research Plan context requires an active Assignment.");
            researchPlan = this.db.prepare("SELECT id,assignment_id,workflow_id,lifecycle,revision,row_version FROM stud_research_plans WHERE id=?").get(researchPlanId);
            if (!researchPlan || researchPlan.assignment_id !== assignmentId) throw new Model.StudError("INVALID_CONTEXT", "The selected Research Plan does not belong to the active Assignment.");
        }
        const researchTopicId = input.researchTopicId ? Model.safeId(input.researchTopicId, "Research Topic ID") : null;
        let researchTopic = null;
        if (researchTopicId) {
            if (!researchPlanId) throw new Model.StudError("INVALID_CONTEXT", "A Research Topic context requires an active Research Plan.");
            researchTopic = this.db.prepare("SELECT id,plan_id,assignment_id,title,disposition,row_version FROM stud_research_topics WHERE id=? AND plan_id=?").get(researchTopicId, researchPlanId);
            if (!researchTopic || researchTopic.assignment_id !== assignmentId) throw new Model.StudError("INVALID_CONTEXT", "The selected Topic does not belong to the active Research Plan.");
        }
        const originSurface = input.originSurface === undefined ? null : Model.optionalText(input.originSurface, "Context origin surface", 80);
        if (input.userPinned !== undefined && typeof input.userPinned !== "boolean") throw new Model.StudError("INVALID_INPUT", "Working context pin must be boolean.");
        return {course, courseId, assignment, assignmentId, object, objectType, objectId, objectScope, workflow, workflowId, workflowNode, workflowNodeId, researchPlan, researchPlanId, researchTopic, researchTopicId, originSurface, userPinned: input.userPinned === true};
    }

    hydrate(row) {
        if (!row) return Object.freeze({status: "EMPTY", activeCourse: null, activeAssignment: null, activeRequirementContract: null, activeObject: null, activeWorkflow: null, activeWorkflowNode: null, activeResearchPlan: null, activeResearchTopic: null, originSurface: null, userPinned: false, updatedAt: null});
        const course = row.active_course_id ? this.store.getEntity("COURSE", row.active_course_id) : null;
        const assignment = row.active_assignment_id ? this.store.getEntity("ASSIGNMENT", row.active_assignment_id) : null;
        const object = row.active_object_type && row.active_object_id ? this.store.getEntity(row.active_object_type, row.active_object_id) : null;
        const workflow = row.active_workflow_id ? this.db.prepare("SELECT id,assignment_id,template_version_id,row_version,lifecycle,is_current FROM stud_workflow_instances WHERE id=?").get(row.active_workflow_id) : null;
        const workflowNode = row.active_workflow_node_id ? this.db.prepare("SELECT id,workflow_id,title,semantic_type,state,row_version FROM stud_workflow_nodes WHERE id=?").get(row.active_workflow_node_id) : null;
        const researchPlan = row.active_research_plan_id ? this.db.prepare("SELECT id,assignment_id,workflow_id,lifecycle,revision,row_version FROM stud_research_plans WHERE id=?").get(row.active_research_plan_id) : null;
        const researchTopic = row.active_research_topic_id ? this.db.prepare("SELECT id,plan_id,assignment_id,title,disposition,row_version FROM stud_research_topics WHERE id=?").get(row.active_research_topic_id) : null;
        if ((row.active_course_id && !course) || (row.active_assignment_id && !assignment) || (row.active_object_id && !object) ||
            (row.active_workflow_id && (!workflow || !workflow.is_current || workflow.lifecycle !== "ACTIVE" || workflow.assignment_id !== row.active_assignment_id)) ||
            (row.active_workflow_node_id && (!workflowNode || workflowNode.workflow_id !== row.active_workflow_id)) ||
            (row.active_research_plan_id && (!researchPlan || researchPlan.assignment_id !== row.active_assignment_id)) ||
            (row.active_research_topic_id && (!researchTopic || researchTopic.plan_id !== row.active_research_plan_id || researchTopic.assignment_id !== row.active_assignment_id))) {
            // Canonical objects may be archived externally. A stale context is
            // never resurrected or silently rebound to a different object.
            this.db.prepare("DELETE FROM stud_working_context WHERE id='current'").run();
            return Object.freeze({status: "MISSING_REFERENCE", activeCourse: null, activeAssignment: null, activeRequirementContract: null, activeObject: null, activeWorkflow: null, activeWorkflowNode: null, activeResearchPlan: null, activeResearchTopic: null, originSurface: null, userPinned: false, updatedAt: null});
        }
        const contract = row.active_requirement_contract_id ? this.db.prepare("SELECT id,revision,lifecycle,completeness FROM stud_requirement_contracts WHERE id=?").get(row.active_requirement_contract_id) : null;
        return Object.freeze({status: "READY", activeCourse: course, activeAssignment: assignment, activeRequirementContract: contract ? Object.freeze({id: contract.id, revision: contract.revision, lifecycle: contract.lifecycle, completeness: contract.completeness}) : null, activeObject: object ? Object.freeze({...object, entityType: row.active_object_type}) : null, activeWorkflow: workflow ? Object.freeze({id: workflow.id, assignmentId: workflow.assignment_id, templateVersionId: workflow.template_version_id, rowVersion: workflow.row_version}) : null, activeWorkflowNode: workflowNode ? Object.freeze({id: workflowNode.id, workflowId: workflowNode.workflow_id, title: workflowNode.title, semanticType: workflowNode.semantic_type, state: workflowNode.state, rowVersion: workflowNode.row_version}) : null, activeResearchPlan: researchPlan ? Object.freeze({id:researchPlan.id,assignmentId:researchPlan.assignment_id,workflowId:researchPlan.workflow_id,lifecycle:researchPlan.lifecycle,revision:researchPlan.revision,rowVersion:researchPlan.row_version}) : null, activeResearchTopic: researchTopic ? Object.freeze({id:researchTopic.id,planId:researchTopic.plan_id,assignmentId:researchTopic.assignment_id,title:researchTopic.title,disposition:researchTopic.disposition,rowVersion:researchTopic.row_version}) : null, originSurface: row.origin_surface || null, userPinned: Boolean(row.user_pinned), updatedAt: row.updated_at || null, assessmentClassification: assignment ? this.assignmentClassification(assignment.id) : null});
    }

    read() {
        const row = this.db.prepare("SELECT * FROM stud_working_context WHERE id='current'").get();
        return this.hydrate(row);
    }

    update(input = {}) {
        const value = this.validate(input);
        const contract = value.assignmentId ? this.activeContract(value.assignmentId) : null;
        const timestamp = Model.now();
        this.store.transaction(() => {
            this.db.prepare(`INSERT INTO stud_working_context (id,active_course_id,active_assignment_id,active_requirement_contract_id,active_object_type,active_object_id,active_workflow_id,active_workflow_node_id,active_research_plan_id,active_research_topic_id,origin_surface,user_pinned,updated_at)
                VALUES ('current',?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET active_course_id=excluded.active_course_id,active_assignment_id=excluded.active_assignment_id,active_requirement_contract_id=excluded.active_requirement_contract_id,active_object_type=excluded.active_object_type,active_object_id=excluded.active_object_id,active_workflow_id=excluded.active_workflow_id,active_workflow_node_id=excluded.active_workflow_node_id,active_research_plan_id=excluded.active_research_plan_id,active_research_topic_id=excluded.active_research_topic_id,origin_surface=excluded.origin_surface,user_pinned=excluded.user_pinned,updated_at=excluded.updated_at`)
                .run(value.courseId, value.assignmentId, contract && contract.id || null, value.objectType, value.objectId, value.workflowId, value.workflowNodeId, value.researchPlanId, value.researchTopicId, value.originSurface, value.userPinned ? 1 : 0, timestamp);
        });
        return this.read();
    }

    clear() {
        this.db.prepare("DELETE FROM stud_working_context WHERE id='current'").run();
        return this.read();
    }
}

module.exports = Object.freeze({StudWorkingContextService, CONTEXT_OBJECT_TYPES, CLASSIFICATION_LABELS, deterministicClassification});
