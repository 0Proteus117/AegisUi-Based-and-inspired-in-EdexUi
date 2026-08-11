"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const Orchestration = require("../src/classes/workspaces/studAcademicOrchestration.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase5-"));
const store = new StudAcademicStore({root, applicationVersion: "test"}).initialize();
let passed = 0;
function check(name, work) { try { work(); passed += 1; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; } }

try {
    const course = store.createEntity("COURSE", {title: "Synthetic Thermodynamics", code: "ME-201"});
    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Assignment 03 · Heat Transfer", dueDate: "2026-11-18T14:00:00.000Z", status: "IN_PROGRESS"});
    store.createExternalIdentifier({entityType: "ASSIGNMENT", entityId: assignment.id, namespace: "MOODLE_ASSIGNMENT:test", externalId: "7348", source: "MOODLE"});
    store.createProvenance({entityType: "ASSIGNMENT", entityId: assignment.id, field: "dueDate", observedValue: assignment.dueDate, sourceType: "MOODLE", sourceId: "7348", sourceAuthority: "AUTHORITATIVE"});

    check("NORMALIZATION_PRESERVES_ORIGINAL_AND_MATCHES_CODE", () => assert.strictEqual(Orchestration.normalizedCourseCode("ME – 201"), "me201"));
    check("EXACT_IDENTIFIER_MATCH", () => assert.strictEqual(Orchestration.classifyCandidate(assignment, course, {externalId: "7348", knownExternalIds: ["7348"]}).confidence, "EXACT"));
    check("STRONG_DETERMINISTIC_MATCH", () => assert.strictEqual(Orchestration.classifyCandidate(assignment, course, {externalId: "cal-1", courseCode: "ME-201", title: "Assignment 3", dueDate: assignment.dueDate}).confidence, "STRONG"));
    check("SUGGESTED_MATCH_REQUIRES_CONFIRMATION", () => assert.strictEqual(Orchestration.classifyCandidate(assignment, course, {externalId: "mail-1", courseCode: "ME-201", title: "Assignment 03 question"}).confidence, "SUGGESTED"));
    check("AMBIGUOUS_TITLE_ONLY_IS_NOT_AUTHORITATIVE", () => assert.strictEqual(Orchestration.classifyCandidate(assignment, course, {externalId: "mail-2", title: assignment.title}).confidence, "UNRESOLVED"));
    check("CONFLICTING_DATE_DETECTED", () => assert.strictEqual(Orchestration.classifyCandidate(assignment, course, {externalId: "mail-3", title: "irrelevant", dueDate: "2026-11-17T23:59:00.000Z"}).confidence, "CONFLICTING"));
    check("UNRESOLVED_CANNOT_LINK", () => assert.throws(() => store.confirmReferenceCandidate({assignmentId: assignment.id, kind: "EMAIL", externalId: "mail-x", title: "No signals", confirmation: true}), /sufficient deterministic context/));
    check("EXPLICIT_CONFIRMATION_REQUIRED", () => assert.throws(() => store.confirmReferenceCandidate({assignmentId: assignment.id, kind: "CALENDAR", externalId: "cal-1", courseCode: "ME-201", title: "Assignment 03", dueDate: assignment.dueDate}), /explicit confirmation/));
    check("CALENDAR_LINK_IS_LOCAL_AND_RETAINED", () => {
        const result = store.confirmReferenceCandidate({assignmentId: assignment.id, kind: "CALENDAR", externalId: "cal-1", courseCode: "ME-201", title: "Assignment 03", dueDate: assignment.dueDate, confirmation: true});
        assert.strictEqual(result.proposal.confidence, "STRONG");
        assert.strictEqual(store.listOrchestrationLinks("ASSIGNMENT", assignment.id).length, 1);
    });
    check("EMAIL_CONFLICT_RETAINS_ALL_OBSERVATIONS", () => {
        store.confirmReferenceCandidate({assignmentId: assignment.id, kind: "EMAIL", externalId: "mail-3", courseCode: "ME-201", title: "Assignment 03 deadline", dueDate: "2026-11-17T23:59:00.000Z", confirmation: true});
        const context = store.assignmentOrchestrationContext(assignment.id);
        assert.ok(context.conflicts.some(item => item.field === "dueDate"));
        assert.strictEqual(context.links.length, 2);
    });
    check("USER_OVERRIDE_WINS_CANONICAL_WITH_HISTORY", () => {
        const result = store.applyUserOverride({entityType: "ASSIGNMENT", entityId: assignment.id, field: "dueDate", value: "2026-11-19T12:00:00.000Z", note: "Synthetic clarification"});
        assert.strictEqual(result.entity.dueDate, "2026-11-19T12:00:00.000Z");
        assert.ok(store.listProvenance("ASSIGNMENT", assignment.id, "dueDate").some(item => item.sourceAuthority === "USER_OVERRIDE"));
    });
    check("OVERVIEW_SURFACES_ATTENTION", () => assert.ok(store.getCommandCenter({now: "2026-11-01T12:00:00.000Z"}).attention.some(item => item.assignment.id === assignment.id)));
    check("NO_EXTERNAL_MUTATION_OR_PROVIDER_API", () => {
        const source = fs.readFileSync(path.join(__dirname, "..", "src/classes/workspaces/studAcademicStore.class.js"), "utf8");
        assert.ok(!/fetch\(|calendar-events|sendMail|submitAssignment/.test(source));
    });
    check("BOUNDED_LARGE_LOCAL_MATCHING", () => {
        for (let index = 0; index < 300; index += 1) store.createEntity("ASSIGNMENT", {courseId: course.id, title: `Synthetic assignment ${index}`});
        assert.ok(store.getCommandCenter({limit: 12}).attention.length <= 12);
    });
} finally {
    store.close();
    fs.rmSync(root, {recursive: true, force: true});
}

console.log(`STUD_PHASE5_ORCHESTRATION ${passed} CHECKS PASSED`);
