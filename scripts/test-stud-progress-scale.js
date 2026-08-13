"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-progress-scale-"));
const store = new StudAcademicStore({root, applicationVersion: "test"}).initialize();
const disciplines = ["Engineering", "Humanities", "Law and criminology", "Social science", "Generic university coursework"];
const courses = disciplines.flatMap((discipline, group) => Array.from({length: 20}, (_value, index) => store.createEntity("COURSE", {title: `Synthetic ${discipline} ${index}`, code: `S${group}${index}`, status: "ACTIVE"})));
const started = Date.now();
courses.forEach((course, courseIndex) => {
    for (let index = 0; index < 10; index += 1) {
        store.createEntity("ASSIGNMENT", {courseId: course.id, title: `Synthetic assignment ${courseIndex}-${index}`, status: index % 4 === 0 ? "GRADED" : "IN_PROGRESS", submissionStatus: index % 4 === 0 ? "SUBMITTED" : "UNKNOWN", dueDate: index % 5 === 0 ? null : `2026-12-${String((index % 20) + 1).padStart(2, "0")}T12:00:00.000Z`, gradeScheme: index % 4 === 0 ? "PERCENTAGE" : "UNKNOWN", grade: index % 4 === 0 ? 50 + index : null, weight: index % 4 === 0 ? 10 : null});
    }
});
const report = store.progress.overview({now: "2026-08-13T00:00:00.000Z"});
const elapsed = Date.now() - started;
assert.equal(report.summary.courses, 100);
assert.equal(report.summary.assignments, 1000);
assert.equal(report.courses.length, 100);
assert.ok(elapsed < 5000, `bounded derived report should remain responsive, got ${elapsed}ms`);
assert.equal(report.policy.noExternalQueries, true);
assert.equal(report.policy.derivedOnly, true);
store.close(); fs.rmSync(root, {recursive: true, force: true});
console.log(`STUD Phase 12 scale (5 discipline-neutral fixtures, 100 courses / 1000 assignments): PASS in ${elapsed}ms`);
