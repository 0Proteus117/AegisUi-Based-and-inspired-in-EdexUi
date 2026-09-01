#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const {StudRequirementsContractService} = require(path.join(ROOT, "src/classes/workspaces/studRequirementsContractService.class.js"));
const {StudWorkingContextService} = require(path.join(ROOT, "src/classes/workspaces/studWorkingContextService.class.js"));

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
function expect(code, fn) { assert.throws(fn, error => error && error.code === code); }
function makeStore(root) { return new StudAcademicStore({root, applicationVersion: "m2-test"}).initialize(); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m2-"));
try {
    const store = makeStore(root);
    const requirements = new StudRequirementsContractService({store});
    const service = new StudWorkingContextService({store, requirementsService: requirements});

    check("CURRENT_SCHEMA_AND_NO_FABRICATED_CONTEXT", () => {
        assert.strictEqual(store.schemaInfo().version, 25);
        assert.strictEqual(service.read().status, "EMPTY");
    });
    const engineering = store.createEntity("COURSE", {title: "Structures", code: "ENG101", academicYear: "2025/26", academicTerm: "Term 1"});
    const humanities = store.createEntity("COURSE", {title: "Modern Literature", academicYear: "2025/26", academicTerm: "Term 2"});
    const law = store.createEntity("COURSE", {title: "Criminal Procedure", academicYear: "2024/25", academicTerm: "Term 1", status: "COMPLETED"});
    const social = store.createEntity("COURSE", {title: "Research Methods", academicYear: "2025/26", academicTerm: "Term 2"});
    const generic = store.createEntity("COURSE", {title: "Independent Study"});
    const coursework = store.createEntity("ASSIGNMENT", {courseId: engineering.id, title: "Design report", description: "Submit a coursework report."});
    const lab = store.createEntity("ASSIGNMENT", {courseId: engineering.id, title: "Materials laboratory practical"});
    const essay = store.createEntity("ASSIGNMENT", {courseId: humanities.id, title: "Critical essay"});
    const caseAnalysis = store.createEntity("ASSIGNMENT", {courseId: law.id, title: "Case analysis"});
    const groupWork = store.createEntity("ASSIGNMENT", {courseId: social.id, title: "Group research report"});
    const unknown = store.createEntity("ASSIGNMENT", {courseId: generic.id, title: "Assessment 1"});

    check("DISCIPLINE_NEUTRAL_ACADEMIC_ORGANISATION", () => {
        const organisation = service.courseOrganisation({limit: 50});
        assert.strictEqual(organisation.years[0].academicYear, "2025/26");
        assert.ok(organisation.years.some(year => year.academicYear === "UNCLASSIFIED"));
        assert.ok(organisation.years.flatMap(year => year.terms).some(term => term.academicTerm === "Term 2"));
    });
    check("DETERMINISTIC_CLASSIFICATION_IS_PRESENTATION_ONLY", () => {
        assert.strictEqual(service.assignmentClassification(lab.id).classification, "LAB_PRACTICAL");
        assert.strictEqual(service.assignmentClassification(groupWork.id).classification, "TEAM_PROJECT");
        assert.strictEqual(service.assignmentClassification(unknown.id).classification, "UNKNOWN");
        assert.strictEqual(store.getEntity("ASSIGNMENT", lab.id).title, "Materials laboratory practical");
    });
    check("USER_CLASSIFICATION_PERSISTS_WITH_PROVENANCE", () => {
        const result = service.setClassification({assignmentId: essay.id, classification: "PRESENTATION", reason: "Student correction"});
        assert.strictEqual(result.sourceKind, "USER");
        assert.strictEqual(result.userCorrected, true);
        assert.strictEqual(store.listProvenance("ASSIGNMENT", essay.id, "assessmentClassification")[0].sourceAuthority, "USER_OVERRIDE");
    });
    check("CONTEXT_PRECEDENCE_AND_REQUIREMENTS_POINTER", () => {
        const context = service.update({courseId: engineering.id, assignmentId: coursework.id, originSurface: "ASSIGNMENT", userPinned: true});
        assert.strictEqual(context.activeAssignment.id, coursework.id);
        assert.strictEqual(context.activeCourse.id, engineering.id);
        assert.strictEqual(context.userPinned, true);
        assert.strictEqual(context.activeRequirementContract, null);
    });
    const note = store.createEntity("NOTE", {title: "Design note", content: "Local", courseId: engineering.id, assignmentId: coursework.id});
    check("ASSIGNMENT_CURRENT_OBJECT_IS_VALIDATED", () => {
        const context = service.update({courseId: engineering.id, assignmentId: coursework.id, objectType: "NOTE", objectId: note.id, originSurface: "NOTES", userPinned: true});
        assert.strictEqual(context.activeObject.id, note.id);
        assert.strictEqual(context.activeObject.entityType, "NOTE");
    });
    const unrelated = store.createEntity("NOTE", {title: "Unrelated note", content: "Local", courseId: humanities.id});
    check("UNRELATED_OBJECT_CANNOT_BE_FABRICATED_INTO_CONTEXT", () => expect("CONTEXT_RELATION_REQUIRED", () => service.update({courseId: engineering.id, assignmentId: coursework.id, objectType: "NOTE", objectId: unrelated.id, originSurface: "NOTES"})));
    check("INVALID_CROSS_COURSE_ASSIGNMENT_REJECTED", () => expect("INVALID_CONTEXT", () => service.update({courseId: humanities.id, assignmentId: coursework.id, originSurface: "ASSIGNMENT"})));
    check("CONTEXT_NO_PROVIDER_OR_AI_SIDE_EFFECT", () => {
        const before = store.db.prepare("SELECT COUNT(*) AS count FROM stud_provenance_records").get().count;
        service.update({courseId: engineering.id, assignmentId: coursework.id, originSurface: "ASSIGNMENT"});
        const after = store.db.prepare("SELECT COUNT(*) AS count FROM stud_provenance_records").get().count;
        assert.strictEqual(after, before);
    });
    store.close();
    const reopened = makeStore(root);
    const reopenedService = new StudWorkingContextService({store: reopened, requirementsService: new StudRequirementsContractService({store: reopened})});
    check("RESTART_PERSISTENCE", () => {
        const context = reopenedService.read();
        assert.strictEqual(context.activeAssignment.id, coursework.id);
        assert.strictEqual(context.activeCourse.id, engineering.id);
    });
    check("CLEAR_CONTEXT_DOES_NOT_ARCHIVE_OBJECTS", () => {
        reopenedService.clear();
        assert.strictEqual(reopenedService.read().status, "EMPTY");
        assert.ok(reopened.getEntity("ASSIGNMENT", coursework.id));
    });
    reopened.close();

    const v15Root = path.join(root, "v15");
    let legacy = makeStore(v15Root); const legacyCourse = legacy.createEntity("COURSE", {title: "Existing course"}); legacy.close();
    const db = new DatabaseSync(path.join(v15Root, "academic.sqlite"));
    db.exec(`PRAGMA foreign_keys=OFF;
        DROP TABLE stud_research_gaps; DROP TABLE stud_topic_dossier_items; DROP TABLE stud_research_question_requirements;
        DROP TABLE stud_research_questions; DROP TABLE stud_research_topic_requirements; DROP TABLE stud_research_topics;
        DROP TABLE stud_assignment_research_plans; DROP TABLE stud_research_plans;
        DROP TABLE stud_operation_event_artifacts; DROP TABLE stud_operation_events; DROP TABLE stud_operation_runs;
        DROP TABLE stud_artifact_relationships; DROP TABLE stud_assignment_artifacts;
        DROP TABLE stud_workflow_blockers; DROP TABLE stud_workflow_checkpoints;
        DROP TABLE stud_workflow_events; DROP TABLE stud_workflow_edges; DROP TABLE stud_workflow_nodes; DROP TABLE stud_workflow_instances;
        DROP TABLE stud_workflow_template_edges; DROP TABLE stud_workflow_template_nodes; DROP TABLE stud_workflow_template_versions; DROP TABLE stud_workflow_templates;
        DROP TABLE stud_working_context; DROP TABLE stud_assignment_classifications; DROP INDEX stud_courses_academic_organisation_index;
        DELETE FROM stud_schema_migrations WHERE version IN (16,17,18,19,20); PRAGMA foreign_keys=ON;`);
    db.exec(`CREATE TABLE stud_courses_legacy AS SELECT id,title,short_name,code,description,start_date,end_date,status,created_at,updated_at,archived_at FROM stud_courses; DROP TABLE stud_courses; ALTER TABLE stud_courses_legacy RENAME TO stud_courses;`);
    db.close();
    legacy = makeStore(v15Root);
    check("V15_TO_CURRENT_MIGRATION_NO_FABRICATED_STATE", () => {
        assert.strictEqual(legacy.schemaInfo().version, 25);
        assert.strictEqual(legacy.getEntity("COURSE", legacyCourse.id).academicYear, null);
        assert.strictEqual(new StudWorkingContextService({store: legacy}).read().status, "EMPTY");
    });
    legacy.close();
    check("MODEL_REJECTS_UNBOUNDED_YEAR_TERM_FIELDS", () => expect("INVALID_INPUT", () => Model.normalizeByEntityType("COURSE", {title: "x", academicYear: "x".repeat(81)})));
    console.log(`STUD_WORKING_CONTEXT: PASS (${passed} checks)`);
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
