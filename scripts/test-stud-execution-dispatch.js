#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRunCoordinator} = require("../src/classes/workspaces/studRunCoordinator.class.js");
const {academicFixture} = require("./stud-m13-fixtures.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-dispatch-"));
let store, coordinator, passed = 0;
function check(name, test) { test(); passed++; console.log(`${name}: PASS`); }
function expect(code, test) { assert.throws(test, error => error.code === code); }
try {
    store = new StudAcademicStore({root}).initialize();
    const f = academicFixture(store, root);
    coordinator = new StudRunCoordinator({store, workflowService:f.workflow,
        artifactOperationsService:f.artifacts, requirementsService:f.requirements,
        compositionService:f.composition, researchPlanService:f.research, claimEvidenceService:f.claims,
        assistantRuntime:{client(){throw new Error("No provider may be invoked during dispatch review.");}}});
    const base = coordinator.contextSnapshot(f.assignment.id, f.flow);
    const labels = ["Draft section", "Redactar sección", "Humanisation", "Correction",
        "Academic review", "Lecturer review", "設計", "Dra\u0301ft", "'\"; `x` $(x)\n| > /tmp/example"];
    const classify = (node, selection={}) => coordinator.classifyNode(node, base, selection).handlerType;
    check("LABELS_NEVER_PROMOTE_MANUAL_WORK", () => {
        for (const title of labels) for (const semanticType of ["WRITING", "OTHER", "TECHNICAL", "RESEARCH"])
            assert.strictEqual(classify({title, semanticType, origin:"USER"}), null);
    });
    check("TEMPLATE_DRAFT_IDENTITY_SURVIVES_ALL_LABELS", () => {
        for (const title of labels) assert.strictEqual(classify({title, semanticType:"WRITING",
            origin:"TEMPLATE", templateNodeKey:"drafting"}), "SECTION_DRAFT_CANDIDATE");
    });
    check("PLANNING_IS_NOT_DRAFTING", () => {
        for (const title of labels) assert.strictEqual(classify({title, semanticType:"WRITING",
            origin:"TEMPLATE", templateNodeKey:"composition_planning"}), null);
    });
    check("EXPLICIT_SECTION_DETERMINES_MANUAL_WRITING_OPERATION", () => {
        for (const title of labels) assert.strictEqual(classify({title, semanticType:"WRITING"},
            {sectionId:f.section.id}), "SECTION_DRAFT_CANDIDATE");
    });
    check("REVIEW_IS_A_DETERMINISTIC_CHECK_WITHOUT_EXPLICIT_SESSION", () => {
        for (const title of labels) assert.strictEqual(classify({title, semanticType:"REVIEW"}), "DETERMINISTIC_STUD_CHECK");
    });
    check("HUMAN_AND_EXTERNAL_GATES_CANNOT_BE_PROMOTED", () => {
        for (const semanticType of ["HUMAN_TASK", "FINALISATION", "EXTERNAL_TASK"]) {
            for (const title of labels) assert.strictEqual(classify({title, semanticType}), null);
            expect("INVALID_TASK_SELECTION", () => classify({semanticType}, {sectionId:f.section.id}));
        }
    });
    check("MISSING_SESSION_AND_AMBIGUOUS_SELECTION_FAIL_CLOSED", () => {
        expect("INVALID_TASK_SELECTION", () => classify({semanticType:"WRITING"}, {sessionId:"stud_missing_session"}));
        expect("INVALID_TASK_SELECTION", () => classify({semanticType:"WRITING"}, {sectionId:f.section.id, sessionId:"stud_missing_session"}));
    });
    let flow = f.flow;
    let node = flow.graph.nodes.find(item => item.title === "Draft bounded section");
    let activePlan;
    const create = () => {
        if(activePlan)coordinator.repository.updatePlan(coordinator.repository.planRow(activePlan.id),{state:"CANCELLED"});
        activePlan = coordinator.createPlan({assignmentId:f.assignment.id, workflowId:flow.id,
        scope:"SELECTED_STAGES", selectedNodeIds:[node.id], taskSelections:[{workflowNodeId:node.id, sectionId:f.section.id}]}).plan;
        return activePlan;
    };
    const before = create();
    check("REAL_RENAME_PRESERVES_DISPATCH_AND_INPUT", () => {
        flow = f.workflow.renameNode({workflowId:flow.id, nodeId:node.id, title:"Discusión crítica",
            expectedWorkflowVersion:flow.rowVersion, expectedNodeVersion:node.rowVersion});
        node = flow.graph.nodes.find(item => item.id === node.id);
        const after = create();
        assert.strictEqual(after.steps[0].handlerType, before.steps[0].handlerType);
        assert.strictEqual(after.steps[0].inputHash, before.steps[0].inputHash);
        expect("RUN_INPUT_CHANGED", () => coordinator.validateInputDrift(before));
    });
    check("NO_RUN_OR_PROVIDER_CALL_FROM_PREFLIGHT", () => {
        assert.strictEqual(store.db.prepare("SELECT count(*) n FROM stud_operation_runs").get().n, 0);
    });
    const current = create();
    check("LEGACY_MISMATCHED_HANDLER_REQUIRES_NEW_PREFLIGHT", () => {
        store.db.prepare("UPDATE stud_execution_steps SET handler_type='DETERMINISTIC_STUD_CHECK' WHERE id=?").run(current.steps[0].id);
        expect("RUN_INPUT_CHANGED", () => coordinator.validateInputDrift(current));
    });
    const durable = create();
    coordinator.dispose(); store.close();
    store = new StudAcademicStore({root}).initialize();
    check("RESTART_PRESERVES_EXACT_OPERATION_IDENTITY_WITHOUT_MIGRATION", () => {
        assert.strictEqual(store.schemaInfo().version,27);
        assert.strictEqual(store.db.prepare("SELECT handler_type FROM stud_execution_steps WHERE id=?").get(durable.steps[0].id).handler_type,"SECTION_DRAFT_CANDIDATE");
        assert.deepStrictEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
    });
    console.log(`EXECUTION DISPATCH: ${passed} PASSED`);
} finally {
    if (coordinator) coordinator.dispose();
    if (store) store.close();
    fs.rmSync(root,{recursive:true,force:true});
}
