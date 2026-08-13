"use strict";

// Phase 12 is deliberately a derived, local reporting layer. It never writes
// metrics, starts a provider, or converts incomplete academic data into a score.
const Model = require("./studAcademicModel.class.js");

const PROGRESS_STATES = Object.freeze(["KNOWN", "PARTIAL", "UNKNOWN", "CONFLICTING"]);
const COMPLETED = new Set(["SUBMITTED", "GRADED", "ARCHIVED"]);
const ACTIVE = new Set(["NOT_STARTED", "IN_PROGRESS"]);
const MAX = Object.freeze({courses: 150, assignments: 2500, activity: 100, sessions: 10000, rows: 120});

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function safeNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function daysUntil(value, now) { const target = new Date(value).getTime(); return Number.isFinite(target) ? Math.ceil((target - now.getTime()) / 86400000) : null; }
function iso(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function countState(known, total, conflict = false) {
    if (conflict) return "CONFLICTING";
    if (!total || !known) return "UNKNOWN";
    return known === total ? "KNOWN" : "PARTIAL";
}
function sourceLabel(source) { return String(source || "UNKNOWN").replace(/_/g, " "); }
function unique(items) { return [...new Set(items.filter(Boolean))]; }

function numericGrade(assignment) {
    const scheme = assignment.gradeScheme || "UNKNOWN";
    const grade = safeNumber(assignment.grade);
    const maximum = safeNumber(assignment.gradeMaximum);
    if (scheme === "TEXT" || scheme === "PASS_FAIL") return {kind: "NON_NUMERIC", scheme, value: assignment.gradeText || "UNKNOWN"};
    if (grade === null) return {kind: "UNKNOWN", scheme};
    if (scheme === "PERCENTAGE") return grade >= 0 && grade <= 100 ? {kind: "NUMERIC", scheme, percent: grade, raw: grade, maximum: 100} : {kind: "INVALID", scheme};
    if (maximum !== null && maximum > 0 && grade >= 0 && grade <= maximum) return {kind: "NUMERIC", scheme: scheme === "UNKNOWN" ? "POINTS_INFERRED" : scheme, percent: grade / maximum * 100, raw: grade, maximum};
    return {kind: "INCOMPATIBLE", scheme, raw: grade, maximum};
}

function conflictFor(store, assignment) {
    const observations = store.listProvenance("ASSIGNMENT", assignment.id);
    const fields = ["dueDate", "grade", "gradeText", "submissionStatus"];
    return fields.filter(field => {
        const values = unique(observations.filter(item => item.field === field).map(item => String(item.observedValue || "")));
        return values.length > 1;
    });
}

function gradeSummary(assignments) {
    const observations = assignments.map(assignment => ({assignment, grade: numericGrade(assignment)}));
    const numeric = observations.filter(item => item.grade.kind === "NUMERIC");
    const nonNumeric = observations.filter(item => item.grade.kind === "NON_NUMERIC");
    const incompatible = observations.filter(item => ["INCOMPATIBLE", "INVALID"].includes(item.grade.kind));
    const weighted = numeric.filter(item => safeNumber(item.assignment.weight) !== null && item.assignment.weight >= 0);
    const knownWeight = weighted.reduce((total, item) => total + Number(item.assignment.weight), 0);
    const weightedAverage = knownWeight > 0 ? weighted.reduce((total, item) => total + item.grade.percent * Number(item.assignment.weight), 0) / knownWeight : null;
    const unweightedAverage = numeric.length ? numeric.reduce((total, item) => total + item.grade.percent, 0) / numeric.length : null;
    const numericComparable = numeric.length > 0;
    const state = incompatible.length ? "PARTIAL" : countState(numeric.length + nonNumeric.length, assignments.length);
    return Object.freeze({
        state, assessedCount: numeric.length + nonNumeric.length, numericCount: numeric.length, nonNumericCount: nonNumeric.length,
        incompatibleCount: incompatible.length, weightedAverage: weightedAverage === null ? null : Number(weightedAverage.toFixed(2)),
        unweightedAverage: unweightedAverage === null ? null : Number(unweightedAverage.toFixed(2)), knownWeight: Number(knownWeight.toFixed(2)),
        remainingWeight: knownWeight > 0 ? Number(Math.max(0, 100 - knownWeight).toFixed(2)) : null,
        method: weightedAverage !== null ? "WEIGHTED_NUMERIC_ONLY" : numericComparable ? "UNWEIGHTED_NUMERIC_ONLY" : "NO_NUMERIC_AVERAGE",
        exclusions: Object.freeze({nonNumeric: nonNumeric.length, incompatible: incompatible.length, ungraded: assignments.length - numeric.length - nonNumeric.length - incompatible.length})
    });
}

function workSummary(assignments, now) {
    const incomplete = assignments.filter(item => ACTIVE.has(item.status));
    const due = incomplete.filter(item => item.dueDate).map(item => ({...item, days: daysUntil(item.dueDate, now)}));
    const overdue = due.filter(item => item.days < 0);
    const next7 = due.filter(item => item.days >= 0 && item.days <= 7);
    const next30 = due.filter(item => item.days > 7 && item.days <= 30);
    const unscheduled = incomplete.filter(item => !item.dueDate);
    return Object.freeze({state: countState(due.length, incomplete.length), incomplete: incomplete.length, overdue: overdue.length, next7: next7.length, next30: next30.length, unscheduled: unscheduled.length, items: Object.freeze([...overdue, ...next7, ...next30].sort((a, b) => a.days - b.days).slice(0, MAX.rows))});
}

class StudAcademicProgress {
    constructor(store) { this.store = store; }

    records() {
        const courses = this.store.listEntities("COURSE", {limit: MAX.courses});
        const assignments = this.store.db.prepare("SELECT * FROM stud_assignments WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(MAX.assignments).map(row => ({...this.camel(row), entityType: "ASSIGNMENT"}));
        const revisions = this.store.db.prepare("SELECT * FROM stud_revision_items WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(MAX.assignments).map(row => ({...this.camel(row), entityType: "REVISION_ITEM"}));
        const sessions = this.store.db.prepare("SELECT * FROM stud_study_sessions WHERE status='FINISHED' ORDER BY ended_at DESC LIMIT ?").all(MAX.sessions).map(row => this.camel(row));
        return {courses, assignments, revisions, sessions};
    }

    camel(row) {
        const result = {};
        Object.entries(row || {}).forEach(([key, value]) => { result[key.replace(/_([a-z])/g, (_match, char) => char.toUpperCase())] = value; });
        return result;
    }

    courseReport(course, assignments, revisions, sessions, now) {
        const own = assignments.filter(item => item.courseId === course.id);
        const conflicts = own.flatMap(item => conflictFor(this.store, item).map(field => ({assignmentId: item.id, title: item.title, field})));
        const complete = own.filter(item => COMPLETED.has(item.status)).length;
        const grades = gradeSummary(own);
        const workload = workSummary(own, now);
        const revisionIds = new Set(revisions.filter(item => item.courseId === course.id).map(item => item.id));
        const ownSessions = sessions.filter(item => revisionIds.has(item.revisionItemId));
        const studyMinutes = ownSessions.reduce((total, item) => total + Math.round((Number(item.elapsedSeconds) || 0) / 60), 0);
        const knownDue = own.filter(item => item.dueDate).length;
        const knownSubmission = own.filter(item => item.submissionStatus !== "UNKNOWN").length;
        const completeness = Object.freeze({state: countState(knownDue + knownSubmission, own.length * 2, conflicts.length > 0), deadlines: countState(knownDue, own.length), submissions: countState(knownSubmission, own.length), grades: grades.state, conflicts: conflicts.length});
        return Object.freeze({course, assignments: own.length, completed: complete, active: own.length - complete, completionPercent: own.length ? Number((complete / own.length * 100).toFixed(1)) : null, grades, workload, revision: {items: revisionIds.size, sessions: ownSessions.length, minutes: studyMinutes, state: ownSessions.length ? "KNOWN" : revisionIds.size ? "PARTIAL" : "UNKNOWN"}, completeness, conflicts: Object.freeze(conflicts)});
    }

    overview(options = {}) {
        Model.assertAllowedKeys(options, ["now", "courseId"], "Progress overview options");
        const now = options.now ? new Date(Model.optionalDate(options.now, "Progress time")) : new Date();
        const {courses, assignments, revisions, sessions} = this.records();
        const reports = courses.map(course => this.courseReport(course, assignments, revisions, sessions, now));
        const selected = options.courseId ? reports.find(item => item.course.id === Model.safeId(options.courseId, "Course ID")) : null;
        const activeAssignments = assignments.filter(item => ACTIVE.has(item.status));
        const grades = gradeSummary(assignments);
        const workload = workSummary(assignments, now);
        const completionCount = assignments.filter(item => COMPLETED.has(item.status)).length;
        const allConflicts = reports.flatMap(report => report.conflicts.map(conflict => ({...conflict, courseId: report.course.id, courseTitle: report.course.title})));
        const attention = [
            ...workload.items.filter(item => item.days < 0).map(item => ({kind: "OVERDUE", severity: "HIGH", assignmentId: item.id, label: item.title, detail: `${Math.abs(item.days)} day(s) overdue`})),
            ...allConflicts.map(item => ({kind: "CONFLICT", severity: "ATTENTION", assignmentId: item.assignmentId, label: item.title, detail: `${item.field} has conflicting local observations`})),
            ...activeAssignments.filter(item => !item.dueDate).slice(0, 16).map(item => ({kind: "MISSING_DEADLINE", severity: "INFO", assignmentId: item.id, label: item.title, detail: "No local due date is known"}))
        ].slice(0, MAX.rows);
        const revisionMinutes = sessions.reduce((total, item) => total + Math.round((Number(item.elapsedSeconds) || 0) / 60), 0);
        const knownAssignments = assignments.filter(item => item.title).length;
        const completeness = Object.freeze({state: countState(knownAssignments, assignments.length, allConflicts.length > 0), assignments: countState(knownAssignments, assignments.length), grades: grades.state, deadlines: countState(assignments.filter(item => item.dueDate).length, assignments.length), revision: revisions.length ? "KNOWN" : "UNKNOWN", conflicts: allConflicts.length});
        return Object.freeze({
            generatedAt: now.toISOString(), policy: Object.freeze({localOnly: true, derivedOnly: true, noPrediction: true, noExternalQueries: true, noHiddenPersistence: true}),
            selectedCourse: selected || null,
            summary: Object.freeze({courses: courses.length, assignments: assignments.length, completedAssignments: completionCount, completionPercent: assignments.length ? Number((completionCount / assignments.length * 100).toFixed(1)) : null, grades, workload, revision: {items: revisions.length, sessions: sessions.length, minutes: revisionMinutes, state: sessions.length ? "KNOWN" : revisions.length ? "PARTIAL" : "UNKNOWN"}, completeness}),
            courses: Object.freeze(reports), workload, attention: Object.freeze(attention), activity: this.activity({limit: 50}), assessments: this.assessments({limit: MAX.rows}), revision: this.revision({limit: MAX.rows})
        });
    }

    assessments(options = {}) {
        Model.assertAllowedKeys(options, ["courseId", "limit"], "Progress assessment options");
        const {assignments} = this.records();
        const courseId = options.courseId ? Model.safeId(options.courseId, "Course ID") : null;
        const rows = assignments.filter(item => !courseId || item.courseId === courseId).map(item => ({assignment: item, grade: numericGrade(item), conflicts: conflictFor(this.store, item)}));
        return Object.freeze({state: rows.some(row => row.conflicts.length) ? "CONFLICTING" : countState(rows.filter(row => row.grade.kind !== "UNKNOWN").length, rows.length), summary: gradeSummary(rows.map(row => row.assignment)), rows: Object.freeze(rows.slice(0, clamp(Number(options.limit) || MAX.rows, 1, MAX.rows)))});
    }

    revision(options = {}) {
        Model.assertAllowedKeys(options, ["courseId", "limit"], "Progress revision options");
        const {revisions, sessions} = this.records();
        const courseId = options.courseId ? Model.safeId(options.courseId, "Course ID") : null;
        const own = revisions.filter(item => !courseId || item.courseId === courseId);
        const ids = new Set(own.map(item => item.id));
        const history = sessions.filter(item => ids.has(item.revisionItemId));
        const minutes = history.reduce((total, item) => total + Math.round((Number(item.elapsedSeconds) || 0) / 60), 0);
        const confidence = ["LOW", "MEDIUM", "HIGH"].map(level => ({level, count: history.filter(item => item.confidence === level).length}));
        return Object.freeze({state: history.length ? "KNOWN" : own.length ? "PARTIAL" : "UNKNOWN", items: own.length, sessions: history.length, minutes, confidence: Object.freeze(confidence), rows: Object.freeze(own.slice(0, clamp(Number(options.limit) || MAX.rows, 1, MAX.rows))), recent: Object.freeze(history.slice(0, 30))});
    }

    activity(options = {}) {
        Model.assertAllowedKeys(options, ["courseId", "limit"], "Progress activity options");
        const courseId = options.courseId ? Model.safeId(options.courseId, "Course ID") : null;
        const limit = clamp(Number(options.limit) || 50, 1, MAX.activity);
        const entities = ["ASSIGNMENT", "NOTE", "RESOURCE", "RESEARCH_PAPER", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "COMPUTE_RESULT"]
            .flatMap(type => this.store.listEntities(type, {courseId, limit: MAX.rows}).map(item => ({kind: type, id: item.id, label: item.title || item.prompt || type, at: item.updatedAt || item.createdAt, courseId: item.courseId || null, provenance: "CANONICAL_LOCAL_RECORD"})));
        const sessions = this.store.db.prepare("SELECT s.*, r.course_id FROM stud_study_sessions s JOIN stud_revision_items r ON r.id=s.revision_item_id WHERE s.status='FINISHED' ORDER BY s.ended_at DESC LIMIT ?").all(MAX.activity)
            .map(row => this.camel(row)).filter(item => !courseId || item.courseId === courseId).map(item => ({kind: "STUDY_SESSION", id: item.id, label: "Completed local study session", at: item.endedAt || item.updatedAt, courseId: item.courseId, provenance: "EXPLICIT_LOCAL_SESSION"}));
        return Object.freeze({state: entities.length || sessions.length ? "KNOWN" : "UNKNOWN", entries: Object.freeze([...entities, ...sessions].filter(item => iso(item.at)).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit))});
    }

    metricSources(input = {}) {
        Model.assertAllowedKeys(input, ["scope", "courseId", "assignmentId"], "Progress metric source request");
        const scope = Model.enumValue(input.scope, ["COURSE", "ASSIGNMENT", "OVERVIEW"], "Progress source scope", "OVERVIEW");
        if (scope === "ASSIGNMENT") {
            const assignment = this.store.getEntity("ASSIGNMENT", input.assignmentId);
            if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
            return Object.freeze({scope, record: assignment, provenance: this.store.listProvenance("ASSIGNMENT", assignment.id), conflicts: conflictFor(this.store, assignment)});
        }
        if (scope === "COURSE") {
            const course = this.store.getEntity("COURSE", input.courseId);
            if (!course) throw new Model.StudError("NOT_FOUND", "Course does not exist.");
            return Object.freeze({scope, record: course, provenance: this.store.listProvenance("COURSE", course.id), assignments: this.assessments({courseId: course.id, limit: MAX.rows})});
        }
        return Object.freeze({scope, policy: this.overview().policy, sources: ["CANONICAL STUD SQLITE", "EXPLICIT PROVENANCE RECORDS", "LOCAL STUDY SESSIONS"].map(source => ({source, mode: "LOCAL_READ_ONLY"}))});
    }
}

module.exports = Object.freeze({StudAcademicProgress, PROGRESS_STATES, MAX, numericGrade, gradeSummary});
