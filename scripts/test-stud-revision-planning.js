"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));
const Planner = require(path.join(ROOT, "src/classes/workspaces/studRevisionPlanner.class.js"));

let passed = 0;
function check(name, condition) { assert.ok(condition, name); passed += 1; console.log(`${name}: PASS`); }
function expect(code, work) { try { work(); } catch (error) { check(`REJECTS_${code}`, error.code === code); return; } throw new Error(`Expected ${code}`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase6-"));
try {
    const store = new StudAcademicStore({root, applicationVersion: "phase6-test"});
    check("SCHEMA_MIGRATION_VERSIONED", store.schemaInfo().version === 9 && Model.SCHEMA_VERSION === 9);
    const course = store.createEntity("COURSE", {title: "Synthetic Thermodynamics", code: "THERM-101"});
    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Synthetic Assignment 03", dueDate: "2026-11-18T14:00:00.000Z", status: "IN_PROGRESS"});
    const note = store.createEntity("NOTE", {courseId: course.id, title: "Synthetic entropy note", content: "Local-only source."});
    const resource = store.createEntity("RESOURCE", {courseId: course.id, assignmentId: assignment.id, title: "Synthetic formula sheet", type: "DOCUMENT"});
    const paper = store.createEntity("RESEARCH_PAPER", {title: "Synthetic heat transfer paper"});

    const legacy = store.createEntity("REVISION_ITEM", {courseId: course.id, prompt: "Legacy prompt", answer: "Legacy answer"});
    check("LEGACY_REVISION_COMPATIBILITY", legacy.title === "Legacy prompt" && legacy.answer === "Legacy answer" && legacy.status === "ACTIVE");

    const revision = store.createEntity("REVISION_ITEM", {courseId: course.id, title: "Entropy balance", description: "Synthetic local topic.", priority: "HIGH", estimatedDurationMinutes: 35, spacedRevisionEnabled: true});
    check("REVISION_ITEM_EXTENDED_MODEL", revision.title === "Entropy balance" && revision.estimatedDurationMinutes === 35 && revision.confidence === "UNKNOWN" && revision.currentMastery === null);
    [
        ["ASSIGNMENT", assignment.id, "SUPPORTS"], ["NOTE", note.id, "REFERENCES"], ["RESOURCE", resource.id, "USES"], ["RESEARCH_PAPER", paper.id, "REFERENCES"]
    ].forEach(([toType, toId, relationType]) => store.createRelationship({fromType: "REVISION_ITEM", fromId: revision.id, relationType, toType, toId, source: "USER"}));
    const context = store.revisionItemContext(revision.id);
    check("CANONICAL_RELATIONSHIPS", context.assignments.length === 1 && context.notes.length === 1 && context.resources.length === 1 && context.papers.length === 1);
    check("MATERIAL_HANDOFFS_STAY_LOCAL", context.relationships.every(item => item.source === "USER") && !context.relationships.some(item => /https?:|calendar|email|moodle/i.test(JSON.stringify(item))));

    const scheduled = store.scheduleRevision({revisionItemId: revision.id, scheduledRevisionAt: "2026-11-16T18:00:00.000Z", pinned: true, note: "Synthetic manual schedule"});
    check("MANUAL_SCHEDULE_PROVENANCE", scheduled.revision.scheduledRevisionAt === "2026-11-16T18:00:00.000Z" && scheduled.provenance.sourceAuthority === "USER_OVERRIDE");
    const plan = store.studyPlan({now: "2026-11-16T09:00:00.000Z", limit: 20});
    check("TODAY_PLAN_EXPLAINS_ENTRY", plan.some(item => item.id === revision.id && item.planning.reason === "SCHEDULED TODAY"));
    const suggested = Planner.spacedRevisionSuggestion({...revision, spacedRevisionEnabled: true, successfulRevisionCount: 1}, new Date("2026-11-16T10:00:00.000Z"), "MEDIUM");
    check("SPACED_REVISION_DETERMINISTIC", suggested.intervalDays === 4 && /MEDIUM CONFIDENCE/.test(suggested.reason));
    check("EXPLICIT_SCHEDULE_WINS", Planner.queueReason({...revision, scheduledRevisionAt: "2026-11-18T18:00:00.000Z", nextPlannedRevisionAt: "2026-11-16T10:00:00.000Z"}, new Date("2026-11-16T09:00:00.000Z")).source === "USER_SCHEDULED");

    const session = store.startStudySession({revisionItemId: revision.id});
    check("SESSION_START_EXPLICIT", session.status === "STARTED" && session.elapsedSeconds === 0);
    const paused = store.transitionStudySession({sessionId: session.id, action: "PAUSE"});
    check("SESSION_PAUSE", paused.session.status === "PAUSED");
    const resumed = store.transitionStudySession({sessionId: session.id, action: "RESUME"});
    check("SESSION_RESUME", resumed.session.status === "STARTED");
    const finished = store.transitionStudySession({sessionId: session.id, action: "FINISH", difficulty: "MEDIUM", confidence: "HIGH", note: "Synthetic completed session", scheduleNext: true});
    check("SESSION_FINISH_AND_HISTORY", finished.session.status === "FINISHED" && store.listStudySessions(revision.id).length === 1 && store.getEntity("REVISION_ITEM", revision.id).lastStudiedAt);
    const cancelled = store.startStudySession({revisionItemId: legacy.id});
    store.transitionStudySession({sessionId: cancelled.id, action: "CANCEL"});
    check("CANCEL_DOES_NOT_COMPLETE_STUDY", store.getEntity("REVISION_ITEM", legacy.id).accumulatedStudyMinutes === 0 && store.listStudySessions(legacy.id).length === 0);
    const interrupted = store.startStudySession({revisionItemId: legacy.id});
    store.close();
    const reopened = new StudAcademicStore({root, applicationVersion: "phase6-test"});
    const interruptedHistory = reopened.listStudySessions(legacy.id, {includeCancelled: true});
    check("INTERRUPTED_SESSION_NEVER_FABRICATES_TIME", interruptedHistory.some(item => item.id === interrupted.id && item.status === "INTERRUPTED" && item.elapsedSeconds === 0));
    check("RESTART_PERSISTENCE", reopened.getEntity("REVISION_ITEM", revision.id).title === "Entropy balance");

    expect("INVALID_INPUT", () => reopened.createEntity("REVISION_ITEM", {title: "Bad duration", estimatedDurationMinutes: 1441}));
    const manyCourses = [];
    for (let index = 0; index < 50; index += 1) manyCourses.push(reopened.createEntity("COURSE", {title: `Scale course ${index}`, code: `SC${index}`}));
    for (let index = 0; index < 500; index += 1) reopened.createEntity("ASSIGNMENT", {courseId: manyCourses[index % manyCourses.length].id, title: `Scale assignment ${index}`});
    for (let index = 0; index < 2000; index += 1) reopened.createEntity("REVISION_ITEM", {courseId: manyCourses[index % manyCourses.length].id, title: `Scale revision ${index}`, description: "Synthetic bounded local revision corpus."});
    check("SCALE_LIST_BOUNDED", reopened.listRevisionItems({limit: 120}).length === 120 && reopened.revisionOverview({limit: 12}).plan.length <= 24);
    check("FTS_REVISION_LOCAL_ONLY", reopened.search("scale revision", {entityTypes: ["REVISION_ITEM"], limit: 20}).length === 20);
    const storeSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"), "utf8");
    const ipcSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"), "utf8");
    check("NO_PROVIDER_OR_CALENDAR_MUTATION", !storeSource.includes("fetch(") && !ipcSource.includes("stud-calendar-write") && !ipcSource.includes("stud-moodle-write"));
    check("NO_HIDDEN_TELEMETRY", !storeSource.includes("telemetry") && !storeSource.includes("analytics"));
    console.log(`STUD_PHASE6_REVISION: ${passed} checks passed`);
    reopened.close();
} finally { fs.rmSync(root, {recursive: true, force: true}); }
