#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Model = require("../src/classes/workspaces/studAcademicModel.class.js");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService} = require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService} = require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudResearchPlanService} = require("../src/classes/workspaces/studResearchPlanService.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m7-scale-"));
const started = Date.now();
function timed(name, operation) { const begin = process.hrtime.bigint(); const value = operation(); const ms = Number(process.hrtime.bigint() - begin) / 1e6; console.log(`${name}: ${ms.toFixed(2)} ms`); return {value, ms}; }
try {
    const store = new StudAcademicStore({root, applicationVersion: "m7-scale"}).initialize();
    const requirements = new StudRequirementsContractService({store});
    const context = new StudWorkingContextService({store, requirementsService: requirements});
    const research = new StudResearchPlanService({store, workingContextService: context});
    const courses = [], assignments = [], materials = new Map();
    store.transaction(() => {
        for (let index = 0; index < 100; index += 1) courses.push(store.createEntity("COURSE", {title: `Synthetic Course ${index + 1}`}));
        for (let index = 0; index < 1000; index += 1) assignments.push(store.createEntity("ASSIGNMENT", {courseId: courses[index % courses.length].id, title: `Synthetic Assignment ${index + 1}`}));
    });
    const plans = [];
    for (let index = 0; index < 300; index += 1) {
        const assignment = assignments[index];
        let contract = requirements.createDraft(assignment.id);
        contract = requirements.addManualRequirement({contractId: contract.id, expectedVersion: contract.rowVersion, requirement: {type: "EVIDENCE", label: `Evidence requirement ${index + 1}`, displayValue: "Use traceable evidence", resolutionState: "RESOLVED"}});
        contract = requirements.approve({contractId: contract.id, expectedVersion: contract.rowVersion});
        plans.push(research.createDraft({assignmentId: assignment.id, seedProposals: false}));
        const noteRows = [];
        for (let material = 0; material < 5; material += 1) noteRows.push(store.createEntity("NOTE", {courseId: assignment.courseId, assignmentId: assignment.id, title: `Synthetic source ${index + 1}.${material + 1}`, content: "Bounded synthetic material."}));
        materials.set(assignment.id, noteRows);
    }
    const now = Model.now(); let topicCount = 0, questionCount = 0, dossierCount = 0, gapCount = 0;
    const addTopic = store.db.prepare(`INSERT INTO stud_research_topics (id,plan_id,assignment_id,title,priority,topic_order,origin,basis,disposition,row_version,created_at,updated_at) VALUES (?,?,?,?,'NORMAL',?,'USER','USER_DEFINED','INCLUDED',1,?,?)`);
    const addQuestion = store.db.prepare(`INSERT INTO stud_research_questions (id,plan_id,topic_id,assignment_id,question_text,priority,state,origin,question_order,row_version,created_at,updated_at) VALUES (?,?,?,?,?,'NORMAL','OPEN','USER',?,1,?,?)`);
    const addDossier = store.db.prepare(`INSERT INTO stud_topic_dossier_items (id,plan_id,topic_id,assignment_id,canonical_object_type,canonical_object_id,membership_origin,disposition,review_state,source_suitability,stance,row_version,created_at,updated_at) VALUES (?,?,?,?,'NOTE',?,'ASSIGNMENT_MATERIAL','ACCEPTED','UNREVIEWED','UNKNOWN','NOT_ASSESSED',1,?,?)`);
    const addGap = store.db.prepare(`INSERT INTO stud_research_gaps (id,plan_id,topic_id,assignment_id,gap_type,title,state,row_version,created_at,updated_at) VALUES (?,?,?,?,'MISSING_SOURCE',?,'OPEN',1,?,?)`);
    store.transaction(() => {
        for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
            const plan = plans[planIndex]; const topicTarget = planIndex < 200 ? 7 : 6;
            for (let topicIndex = 0; topicIndex < topicTarget; topicIndex += 1) {
                const topicId = Model.createId("research_topic"); addTopic.run(topicId, plan.id, plan.assignmentId, `Topic ${planIndex + 1}.${topicIndex + 1}`, topicIndex, now, now); topicCount += 1;
                const questionTarget = topicCount <= 1000 ? 3 : 2;
                for (let q = 0; q < questionTarget; q += 1) { addQuestion.run(Model.createId("research_question"), plan.id, topicId, plan.assignmentId, `Question ${topicCount}.${q + 1}?`, q, now, now); questionCount += 1; }
                for (const material of materials.get(plan.assignmentId)) { addDossier.run(Model.createId("dossier_item"), plan.id, topicId, plan.assignmentId, material.id, now, now); dossierCount += 1; }
                const gapTarget = topicCount <= 1000 ? 3 : 2;
                for (let gap = 0; gap < gapTarget; gap += 1) { addGap.run(Model.createId("research_gap"), plan.id, topicId, plan.assignmentId, `Gap ${topicCount}.${gap + 1}`, now, now); gapCount += 1; }
            }
        }
    });
    assert.strictEqual(topicCount, 2000); assert.strictEqual(questionCount, 5000); assert.strictEqual(dossierCount, 10000); assert.strictEqual(gapCount, 5000);
    const targetPlan = plans[150]; const targetTopic = store.db.prepare("SELECT id FROM stud_research_topics WHERE plan_id=? ORDER BY topic_order LIMIT 1").get(targetPlan.id);
    const state = timed("ASSIGNMENT_RESEARCH_PLAN_STATE", () => research.state({assignmentId: targetPlan.assignmentId}));
    const dossier = timed("TOPIC_DOSSIER_PAGE_100", () => research.dossier({assignmentId: targetPlan.assignmentId, topicId: targetTopic.id, limit: 100}));
    const filtered = timed("FILTERED_DOSSIER_PAGE", () => research.dossier({assignmentId: targetPlan.assignmentId, topicId: targetTopic.id, disposition: "ACCEPTED", reviewState: "UNREVIEWED", limit: 50}));
    const coverage = timed("TOPIC_COVERAGE", () => research.coverage({assignmentId: targetPlan.assignmentId, topicId: targetTopic.id}));
    const handoff = timed("WORKING_CONTEXT_HANDOFF", () => context.update({assignmentId: targetPlan.assignmentId, researchPlanId: targetPlan.id, researchTopicId: targetTopic.id, originSurface: "M7_SCALE"}));
    assert.strictEqual(state.value.draft.id, targetPlan.id); assert.strictEqual(dossier.value.items.length, 5); assert.strictEqual(filtered.value.items.length, 5); assert.strictEqual(coverage.value.noPercentage, true); assert.strictEqual(handoff.value.activeResearchTopic.id, targetTopic.id);
    const queryPlan = store.db.prepare("EXPLAIN QUERY PLAN SELECT * FROM stud_topic_dossier_items WHERE topic_id=? AND disposition=? AND review_state=? ORDER BY updated_at DESC,id DESC LIMIT 50").all(targetTopic.id, "ACCEPTED", "UNREVIEWED").map(row => row.detail).join(" ");
    assert.match(queryPlan, /stud_topic_dossier_topic_index/i);
    store.close();
    const reopened = new StudAcademicStore({root, applicationVersion: "m7-scale"}).initialize();
    const restart = timed("RESTART_AND_CONTEXT_HYDRATION", () => new StudWorkingContextService({store: reopened, requirementsService: new StudRequirementsContractService({store: reopened})}).read());
    assert.strictEqual(restart.value.activeResearchTopic.id, targetTopic.id); reopened.close();
    console.log(JSON.stringify({courses: 100, assignments: 1000, plans: 300, topics: topicCount, questions: questionCount, dossierItems: dossierCount, gaps: gapCount, buildMs: Date.now() - started, queryMs: {state: state.ms, dossier: dossier.ms, filtered: filtered.ms, coverage: coverage.ms, handoff: handoff.ms, restart: restart.ms}}, null, 2));
    console.log("STUD M7 SCALE TEST: PASS");
} finally { fs.rmSync(root, {recursive: true, force: true}); }
