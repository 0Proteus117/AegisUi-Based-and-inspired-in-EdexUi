#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService} = require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudResearchPlanService} = require("../src/classes/workspaces/studResearchPlanService.class.js");
const {StudWorkflowService} = require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudArtifactOperationsService} = require("../src/classes/workspaces/studArtifactOperationsService.class.js");

let passed = 0;
function check(name, operation) { operation(); passed += 1; console.log(`${name}: PASS`); }
function expect(code, operation) { assert.throws(operation, error => error && error.code === code, code); }
function open(root) {
    const store = new StudAcademicStore({root, applicationVersion: "m7-test"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const workingContext = new StudWorkingContextService({store, requirementsService: requirements});
    const workflow = new StudWorkflowService({store, requirementsService: requirements, workingContextService: workingContext});
    const artifacts = new StudArtifactOperationsService({store, workflowService: workflow, workingContextService: workingContext});
    const research = new StudResearchPlanService({store, workingContextService: workingContext, artifactOperationsService: artifacts});
    return {store, requirements, workingContext, workflow, artifacts, research};
}
function reviewedContract(store, requirements, assignment, requirement = {}) {
    let contract = requirements.createDraft(assignment.id);
    contract = requirements.addManualRequirement({contractId: contract.id, expectedVersion: contract.rowVersion, requirement: {
        type: requirement.type || "EVIDENCE", label: requirement.label || "Use relevant source evidence",
        displayValue: requirement.displayValue || "Support the analysis with traceable sources", resolutionState: "RESOLVED"
    }});
    return requirements.approve({contractId: contract.id, expectedVersion: contract.rowVersion, approveAsIncomplete: false});
}
function fixture(env, title, requirement = {}) {
    const course = env.store.createEntity("COURSE", {title: `${title} course`});
    const assignment = env.store.createEntity("ASSIGNMENT", {courseId: course.id, title});
    const contract = reviewedContract(env.store, env.requirements, assignment, requirement);
    const document = env.store.createEntity("ACADEMIC_DOCUMENT", {courseId: course.id, assignmentId: assignment.id, title: `${title} source`, documentType: "COURSE_MATERIAL", extractionStatus: "READY"});
    const note = env.store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: `${title} note`, content: "Synthetic public-safe note."});
    return {course, assignment, contract, document, note};
}
function includeProposals(research, plan) {
    for (const candidate of plan.topics.filter(topic => topic.disposition === "PROPOSED")) {
        plan = research.updateTopic({planId: plan.id, topicId: candidate.id, expectedPlanVersion: plan.rowVersion, expectedTopicVersion: candidate.rowVersion, topic: {disposition: "INCLUDED"}});
    }
    return plan;
}
function stripV20(dbPath) {
    const db = new DatabaseSync(dbPath);
    db.exec(`PRAGMA foreign_keys=OFF;
        DROP TABLE IF EXISTS stud_research_gaps;
        DROP TABLE IF EXISTS stud_topic_dossier_items;
        DROP TABLE IF EXISTS stud_research_question_requirements;
        DROP TABLE IF EXISTS stud_research_questions;
        DROP TABLE IF EXISTS stud_research_topic_requirements;
        DROP TABLE IF EXISTS stud_research_topics;
        DROP TABLE IF EXISTS stud_assignment_research_plans;
        DROP TABLE IF EXISTS stud_research_plans;
        ALTER TABLE stud_working_context DROP COLUMN active_research_topic_id;
        ALTER TABLE stud_working_context DROP COLUMN active_research_plan_id;
        DELETE FROM stud_schema_migrations WHERE version=20;
        PRAGMA foreign_keys=ON;`);
    db.close();
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m7-"));
try {
    let env = open(path.join(root, "domain"));
    check("CURRENT_SCHEMA_AND_NO_FABRICATED_RESEARCH_STATE", () => {
        assert.strictEqual(env.store.schemaInfo().version, 21);
        ["stud_research_plans", "stud_research_topics", "stud_research_questions", "stud_topic_dossier_items", "stud_research_gaps"].forEach(table => assert.strictEqual(env.store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count, 0));
    });
    const base = fixture(env, "Engineering CFD design report", {type: "DELIVERABLE", label: "Evaluate CFD evidence"});
    let plan = env.research.createDraft({assignmentId: base.assignment.id, seedProposals: true});
    check("PLAN_REFERENCES_EXACT_REVIEWED_CONTRACT", () => {
        assert.strictEqual(plan.requirementsContractId, base.contract.id);
        assert.strictEqual(plan.requirementsContractRevision, base.contract.revision);
        assert.strictEqual(plan.requirementsContractHash, base.contract.contractHash);
        assert.strictEqual(plan.lifecycle, "DRAFT");
    });
    check("DETERMINISTIC_PROPOSALS_ARE_NOT_INSTITUTIONAL_REQUIREMENTS", () => {
        assert.ok(plan.topics.length >= 1);
        assert.ok(plan.topics.every(topic => topic.disposition === "PROPOSED"));
        assert.ok(plan.topics.every(topic => topic.basis === "PROPOSED_BY_RESEARCH_PLANNING"));
        assert.ok(plan.topics.every(topic => topic.requirements[0].requirementSnapshotHash));
    });
    check("REVIEW_REQUIRES_EXPLICIT_PROPOSAL_DISPOSITIONS", () => expect("PLAN_REVIEW_INCOMPLETE", () => env.research.review({planId: plan.id, expectedVersion: plan.rowVersion})));
    const emptyAssignment = fixture(env, "Generic no-research fixture", {type: "OTHER", label: "Administrative requirement"});
    const emptyPlan = env.research.createDraft({assignmentId: emptyAssignment.assignment.id, seedProposals: false});
    check("EMPTY_PLAN_CANNOT_BE_MARKED_REVIEWED", () => expect("PLAN_EMPTY", () => env.research.review({planId: emptyPlan.id, expectedVersion: emptyPlan.rowVersion})));
    check("REQUIRED_TOPIC_NEEDS_EXACT_REQUIREMENT_LINK", () => expect("INVALID_REQUIREMENT_LINK", () => env.research.addTopic({planId: emptyPlan.id, expectedVersion: emptyPlan.rowVersion, topic: {title: "Falsely required", basis: "REQUIRED_BY_ASSIGNMENT"}})));
    const lifecycleFixture = fixture(env, "Law case analysis lifecycle", {type: "EVIDENCE", label: "Use authority"});
    let lifecyclePlan = env.research.createDraft({assignmentId: lifecycleFixture.assignment.id, seedProposals: false});
    lifecyclePlan = env.research.addTopic({planId: lifecyclePlan.id, expectedVersion: lifecyclePlan.rowVersion, topic: {title: "Authorities", disposition: "INCLUDED", requirementItemIds: [lifecycleFixture.contract.items[0].id], basis: "REQUIRED_BY_ASSIGNMENT"}});
    const lifecycleReviewed = env.research.review({planId: lifecyclePlan.id, expectedVersion: lifecyclePlan.rowVersion});
    let lifecycleRevision = env.research.createRevision({planId: lifecycleReviewed.id, expectedVersion: lifecycleReviewed.rowVersion});
    lifecycleRevision = env.research.review({planId: lifecycleRevision.id, expectedVersion: lifecycleRevision.rowVersion});
    check("REVISION_REVIEW_SUPERSEDES_PRIOR_POINTER_WITH_HISTORY", () => { const state=env.research.state({assignmentId:lifecycleFixture.assignment.id}); assert.strictEqual(state.current.id,lifecycleRevision.id); assert.strictEqual(state.history.find(item=>item.id===lifecycleReviewed.id).lifecycle,"SUPERSEDED"); });
    const lifecycleTopic=lifecycleRevision.topics[0];
    check("EMPTY_COVERAGE_IS_EXPLAINED", () => { const coverage=env.research.coverage({assignmentId:lifecycleFixture.assignment.id,topicId:lifecycleTopic.id}); assert.strictEqual(coverage.state,"EMPTY"); assert.ok(coverage.reasons.some(reason=>/No accepted material/.test(reason))); });
    const lifecycleMaterial=env.research.addDossierItem({planId:lifecycleRevision.id,topicId:lifecycleTopic.id,canonicalObjectType:"ACADEMIC_DOCUMENT",canonicalObjectId:lifecycleFixture.document.id,disposition:"ACCEPTED",reviewState:"UNREVIEWED"});
    check("UNREVIEWED_MATERIAL_IS_PARTIAL_NOT_SUPPORTED", () => { const coverage=env.research.coverage({assignmentId:lifecycleFixture.assignment.id,topicId:lifecycleTopic.id}); assert.strictEqual(coverage.state,"PARTIAL"); assert.strictEqual(coverage.counts.reviewedMaterial,0); });
    env.research.updateDossierItem({assignmentId:lifecycleFixture.assignment.id,itemId:lifecycleMaterial.id,expectedVersion:lifecycleMaterial.rowVersion,reviewState:"REVIEWED",disposition:"ACCEPTED"});
    check("REVIEWED_MATERIAL_WITH_REQUIREMENT_CAN_BE_SUPPORTED", () => assert.strictEqual(env.research.coverage({assignmentId:lifecycleFixture.assignment.id,topicId:lifecycleTopic.id}).state,"SUPPORTED"));
    plan = includeProposals(env.research, plan);
    check("STALE_PLAN_MUTATION_REJECTED", () => expect("STALE_RESEARCH_VERSION", () => env.research.addTopic({planId: plan.id, expectedVersion: plan.rowVersion - 1, topic: {title: "Stale topic"}})));
    plan = env.research.addTopic({planId: plan.id, expectedVersion: plan.rowVersion, topic: {title: "Boundary conditions", description: "Inputs and assumptions", basis: "USER_DEFINED", disposition: "INCLUDED", origin: "USER"}});
    let selected = plan.topics.find(topic => topic.title === "Boundary conditions");
    plan = env.research.addQuestion({planId: plan.id, topicId: selected.id, expectedVersion: plan.rowVersion, question: {text: "Which boundary assumptions materially affect the result?", origin: "USER"}});
    selected = plan.topics.find(topic => topic.id === selected.id);
    let question = plan.questions.find(item => item.topicId === selected.id);
    plan = env.research.updateQuestion({planId: plan.id, questionId: question.id, expectedPlanVersion: plan.rowVersion, expectedQuestionVersion: question.rowVersion, question: {text: "Which boundary assumptions materially affect the reported result?", priority: "HIGH", state: "UNRESOLVED", origin: "AI_ASSISTED"}});
    selected = plan.topics.find(topic => topic.id === selected.id); question = plan.questions.find(item => item.id === question.id);
    check("QUESTION_EDIT_PRESERVES_ORIGIN_AND_UPDATES_STATE", () => { assert.strictEqual(question.text, "Which boundary assumptions materially affect the reported result?"); assert.strictEqual(question.priority, "HIGH"); assert.strictEqual(question.state, "UNRESOLVED"); assert.strictEqual(question.origin, "USER"); });
    plan = env.research.updateTopic({planId: plan.id, topicId: selected.id, expectedPlanVersion: plan.rowVersion, expectedTopicVersion: selected.rowVersion, topic: {title: "Boundary conditions and assumptions", order: 12, origin: "AI_ASSISTED"}});
    selected = plan.topics.find(topic => topic.id === selected.id);
    check("TOPIC_EDIT_REORDER_PRESERVES_ORIGIN", () => { assert.strictEqual(selected.title, "Boundary conditions and assumptions"); assert.strictEqual(selected.topicOrder, 12); assert.strictEqual(selected.origin, "USER"); });
    check("TOPIC_DEPTH_AND_CYCLE_ARE_BOUNDED", () => {
        const childPlan = env.research.addTopic({planId: plan.id, expectedVersion: plan.rowVersion, topic: {title: "Inlet conditions", parentTopicId: selected.id}});
        const child = childPlan.topics.find(topic => topic.parentTopicId === selected.id);
        expect("RESEARCH_TOPIC_DEPTH", () => env.research.addTopic({planId: childPlan.id, expectedVersion: childPlan.rowVersion, topic: {title: "Forbidden depth", parentTopicId: child.id}}));
        plan = childPlan;
    });
    const reviewed = env.research.review({planId: plan.id, expectedVersion: plan.rowVersion});
    check("REVIEWED_PLAN_HASH_AND_EXPLICIT_POINTER", () => {
        assert.strictEqual(reviewed.lifecycle, "REVIEWED"); assert.match(reviewed.planHash, /^[a-f0-9]{64}$/);
        assert.strictEqual(env.research.state({assignmentId: base.assignment.id}).current.id, reviewed.id);
    });
    check("REVIEWED_SEMANTIC_STRUCTURE_IS_IMMUTABLE", () => {
        expect("REVIEWED_PLAN_IMMUTABLE", () => env.research.addTopic({planId: reviewed.id, expectedVersion: reviewed.rowVersion, topic: {title: "Not allowed"}}));
        expect("REVIEWED_PLAN_IMMUTABLE", () => env.research.addQuestion({planId: reviewed.id, topicId: selected.id, expectedVersion: reviewed.rowVersion, question: {text: "Not allowed?"}}));
    });
    let revision = env.research.createRevision({planId: reviewed.id, expectedVersion: reviewed.rowVersion});
    check("REVIEWED_EDIT_CREATES_NEW_DRAFT_REVISION", () => {
        assert.strictEqual(revision.lifecycle, "DRAFT"); assert.strictEqual(revision.revision, reviewed.revision + 1); assert.strictEqual(revision.parentPlanId, reviewed.id);
        assert.notStrictEqual(revision.topics[0].id, reviewed.topics[0].id);
    });
    env.store.db.prepare("UPDATE stud_requirement_contract_freshness SET review_condition='SOURCE_CHANGED' WHERE contract_id=?").run(base.contract.id);
    check("CONTRACT_SOURCE_DRIFT_IS_VISIBLE_WITHOUT_PLAN_MUTATION", () => {
        const state = env.research.state({assignmentId: base.assignment.id}); assert.strictEqual(state.current.contractCondition, "SOURCE_CHANGED"); assert.strictEqual(state.current.planHash, reviewed.planHash);
    });

    const dossierTopic = reviewed.topics.find(topic => topic.title === "Boundary conditions and assumptions") || reviewed.topics[0];
    const dossier = env.research.addDossierItem({planId: reviewed.id, topicId: dossierTopic.id, canonicalObjectType: "ACADEMIC_DOCUMENT", canonicalObjectId: base.document.id, membershipOrigin: "ASSIGNMENT_MATERIAL", disposition: "SUGGESTED", sourceSuitability: "COURSE_MATERIAL"});
    check("DOSSIER_INDEXES_CANONICAL_OBJECT_WITHOUT_COPYING_CONTENT", () => {
        assert.strictEqual(dossier.canonicalObjectId, base.document.id); assert.strictEqual(dossier.disposition, "SUGGESTED");
        assert.ok(!Object.keys(dossier).some(key => /content|body|path/i.test(key)));
    });
    let assessed = env.research.updateDossierItem({assignmentId: base.assignment.id, itemId: dossier.id, expectedVersion: dossier.rowVersion, disposition: "ACCEPTED", reviewState: "REVIEWED", sourceSuitability: "COURSE_MATERIAL", stance: "ALTERNATIVE", rationale: "Provides an alternative boundary treatment."});
    check("MEMBERSHIP_REVIEW_SUITABILITY_AND_STANCE_ARE_INDEPENDENT", () => {
        assert.strictEqual(assessed.disposition, "ACCEPTED"); assert.strictEqual(assessed.reviewState, "REVIEWED"); assert.strictEqual(assessed.stance, "ALTERNATIVE");
    });
    check("DUPLICATE_AND_UNRELATED_DOSSIER_REFERENCES_FAIL", () => {
        expect("DUPLICATE_DOSSIER_ITEM", () => env.research.addDossierItem({planId: reviewed.id, topicId: dossierTopic.id, canonicalObjectType: "ACADEMIC_DOCUMENT", canonicalObjectId: base.document.id}));
        const other = env.store.createEntity("NOTE", {title: "Unrelated private note"});
        expect("CONTEXT_RELATION_REQUIRED", () => env.research.addDossierItem({planId: reviewed.id, topicId: dossierTopic.id, canonicalObjectType: "NOTE", canonicalObjectId: other.id}));
    });
    const artifact = env.artifacts.registerArtifact({assignmentId: base.assignment.id, canonicalObjectType: "NOTE", canonicalObjectId: base.note.id, origin: "USER_CREATED", producer: "USER"}).artifact;
    const artifactDossier = env.research.addDossierItem({planId: reviewed.id, topicId: dossierTopic.id, artifactId: artifact.id, disposition: "ACCEPTED"});
    check("DOSSIER_REFERENCES_M6_ARTIFACT_WITHOUT_SECOND_REGISTRY", () => { assert.strictEqual(artifactDossier.artifactId, artifact.id); assert.strictEqual(artifactDossier.canonicalObjectId, base.note.id); assert.strictEqual(env.store.db.prepare("SELECT COUNT(*) count FROM stud_assignment_artifacts WHERE id=?").get(artifact.id).count, 1); });
    let gap = env.research.addGap({planId: reviewed.id, topicId: dossierTopic.id, gapType: "CONTRADICTORY_EVIDENCE", title: "Alternative boundary conditions require comparison"});
    check("RESEARCH_GAP_IS_DISTINCT_FROM_WORKFLOW_BLOCKER", () => { assert.strictEqual(gap.state, "OPEN"); assert.strictEqual(gap.blockerId, null); });
    check("EXPLAINABLE_COVERAGE_HAS_NO_MAGIC_PERCENTAGE", () => {
        const coverage = env.research.coverage({assignmentId: base.assignment.id, topicId: dossierTopic.id});
        assert.strictEqual(coverage.noPercentage, true); assert.ok(["GAPS_REMAIN", "BLOCKED"].includes(coverage.state)); assert.ok(coverage.reasons.length >= 1); assert.strictEqual(coverage.counts.reviewedMaterial, 1);
    });
    const flow = env.workflow.create({assignmentId: base.assignment.id, templateKey: "GENERIC_MANUAL"});
    const workflowNode = flow.graph.nodes[0];
    const blockerState = env.workflow.createBlocker({workflowId: flow.id, nodeId: workflowNode.id, blockerType: "WAITING_DATA", title: "Awaiting synthetic measurement", expectedWorkflowVersion: flow.rowVersion});
    const blocker = blockerState.conditions.blockers.find(item => item.title === "Awaiting synthetic measurement");
    let blockedGap = env.research.addGap({planId: reviewed.id, topicId: dossierTopic.id, gapType: "MISSING_DATASET", title: "Measured data is unavailable", blockerId: blocker.id});
    check("M4_LINKED_OPEN_BLOCKER_MAKES_COVERAGE_BLOCKED", () => assert.strictEqual(env.research.coverage({assignmentId: base.assignment.id, topicId: dossierTopic.id}).state, "BLOCKED"));
    const currentFlow = env.workflow.read({workflowId: flow.id});
    env.workflow.resolveBlocker({workflowId: flow.id, blockerId: blocker.id, note: "Data arrived.", expectedWorkflowVersion: currentFlow.rowVersion, expectedBlockerVersion: blocker.rowVersion});
    check("RESOLVED_M4_BLOCKER_NO_LONGER_FABRICATES_BLOCKED_COVERAGE", () => assert.notStrictEqual(env.research.coverage({assignmentId: base.assignment.id, topicId: dossierTopic.id}).state, "BLOCKED"));
    blockedGap = env.research.resolveGap({assignmentId: base.assignment.id, gapId: blockedGap.id, expectedVersion: blockedGap.rowVersion, action: "RESOLVED"});
    gap = env.research.resolveGap({assignmentId: base.assignment.id, gapId: gap.id, expectedVersion: gap.rowVersion, action: "RESOLVED", note: "Compared explicitly."});
    check("GAP_RESOLUTION_PRESERVES_HISTORY", () => assert.strictEqual(gap.state, "RESOLVED"));

    check("WORKING_CONTEXT_PERSISTS_PLAN_TOPIC_AND_CANONICAL_OBJECT", () => {
        const context = env.workingContext.update({courseId: base.course.id, assignmentId: base.assignment.id, objectType: "ACADEMIC_DOCUMENT", objectId: base.document.id, researchPlanId: reviewed.id, researchTopicId: dossierTopic.id, originSurface: "M7_TEST"});
        assert.strictEqual(context.activeResearchPlan.id, reviewed.id); assert.strictEqual(context.activeResearchTopic.id, dossierTopic.id); assert.strictEqual(context.activeObject.id, base.document.id);
    });
    check("CROSS_ASSIGNMENT_CONTEXT_IS_REJECTED", () => {
        const other = fixture(env, "Humanities essay", {type: "STRUCTURE", label: "Engage with primary texts"});
        const otherPlan = includeProposals(env.research, env.research.createDraft({assignmentId: other.assignment.id}));
        expect("INVALID_CONTEXT", () => env.workingContext.update({assignmentId: base.assignment.id, researchPlanId: otherPlan.id}));
    });
    env.store.close();
    env = open(path.join(root, "domain"));
    check("RESTART_PERSISTS_REVIEWED_PLAN_DOSSIER_GAPS_AND_CONTEXT", () => {
        const state = env.research.state({assignmentId: base.assignment.id}); assert.strictEqual(state.current.id, reviewed.id);
        const items = env.research.dossier({assignmentId: base.assignment.id, topicId: dossierTopic.id, limit: 20}).items; assert.strictEqual(items.length, 2); assert.ok(items.some(item => item.artifactId === artifact.id));
        const context = env.workingContext.read(); assert.strictEqual(context.activeResearchTopic.id, dossierTopic.id);
    });
    env.store.db.prepare("UPDATE stud_academic_documents SET archived_at=? WHERE id=?").run(new Date().toISOString(), base.document.id);
    check("STALE_DOSSIER_REFERENCE_DEGRADES_TO_MISSING_WITHOUT_DELETING_HISTORY", () => {
        const item=env.research.dossier({assignmentId:base.assignment.id,topicId:dossierTopic.id,limit:20}).items.find(value=>value.canonicalObjectId===base.document.id);
        assert.ok(item); assert.strictEqual(item.availabilityState,"MISSING"); assert.strictEqual(item.canonicalObjectId,base.document.id);
    });
    env.store.close();

    let migration = open(path.join(root, "migration"));
    const legacyAssignment = migration.store.createEntity("ASSIGNMENT", {title: "Existing v19 assignment"});
    migration.store.close(); stripV20(path.join(root, "migration", "academic.sqlite")); migration = open(path.join(root, "migration"));
    check("V19_TO_V20_MIGRATION_PRESERVES_ASSIGNMENT_WITHOUT_FABRICATION", () => {
        assert.strictEqual(migration.store.schemaInfo().version, 21); assert.ok(migration.store.getEntity("ASSIGNMENT", legacyAssignment.id)); assert.strictEqual(migration.research.state({assignmentId: legacyAssignment.id}).current, null); assert.strictEqual(migration.research.state({assignmentId: legacyAssignment.id}).draft, null);
    });
    migration.store.close();

    const rollbackRoot=path.join(root,"migration-rollback");
    let rollback=open(rollbackRoot); const rollbackAssignment=rollback.store.createEntity("ASSIGNMENT",{title:"Rollback-preserved v19 assignment"}); rollback.store.close(); stripV20(path.join(rollbackRoot,"academic.sqlite"));
    const rollbackDb=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite")); rollbackDb.exec("CREATE TABLE stud_research_plans (id TEXT PRIMARY KEY);"); rollbackDb.close();
    check("V20_MIGRATION_FAILURE_ROLLS_BACK_WITHOUT_MARKING_SCHEMA_APPLIED", () => {
        assert.throws(()=>open(rollbackRoot),error=>error&&error.code==="DATABASE_OPEN_FAILED"&&/migration 20/i.test(error.details&&error.details.cause||""));
        const inspect=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_schema_migrations WHERE version=20").get().count,0);
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_assignments WHERE id=?").get(rollbackAssignment.id).count,1);
        assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='stud_research_topics'").get().count,0);
        inspect.close();
    });

    const disciplines = [
        ["Engineering heat transfer", "EVIDENCE", "Compare experimental and analytical evidence"],
        ["Humanities modernism essay", "STRUCTURE", "Use primary texts and criticism"],
        ["Law case analysis", "EVIDENCE", "Use legislation and case law"],
        ["Social science survey report", "EVIDENCE", "Use papers, reports and datasets"],
        ["Generic manual coursework", "OTHER", "Investigate the stated topic"]
    ];
    const neutral = open(path.join(root, "neutral"));
    check("DISCIPLINE_NEUTRAL_RESEARCH_PLANS", () => disciplines.forEach(([title, type, label]) => {
        const value = fixture(neutral, title, {type, label}); const draft = neutral.research.createDraft({assignmentId: value.assignment.id});
        assert.ok(draft.topics.length >= 1); assert.ok(draft.topics[0].title.length > 0);
    }));
    neutral.store.close();
    console.log(`STUD M7 RESEARCH PLAN / TOPIC DOSSIER TESTS: ${passed} PASSED`);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
