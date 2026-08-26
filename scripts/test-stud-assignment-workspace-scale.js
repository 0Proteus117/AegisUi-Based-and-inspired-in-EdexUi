#!/usr/bin/env node

"use strict";

// M5 scale contract: the Assignment Workspace composes only the selected
// Assignment and Course context. It must not turn a large local STUD store
// into a global renderer load or automatically invoke FTS.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {performance} = require("perf_hooks");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudAssignmentWorkspace, workspaceObjects} = require("../src/classes/workspaces/studAssignmentWorkspace.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m5-scale-"));
const elapsed = operation => {
    const start = performance.now();
    const value = operation();
    return {value, milliseconds: performance.now() - start};
};
const elapsedAsync = async operation => {
    const start = performance.now();
    const value = await operation();
    return {value, milliseconds: performance.now() - start};
};

(async () => { try {
    const store = new StudAcademicStore({root, applicationVersion: "m5-scale-test"}).initialize();
    let targetCourse = null;
    let targetAssignment = null;
    let createdAssignmentCount = 0;
    for (let courseIndex = 0; courseIndex < 100; courseIndex += 1) {
        const course = store.createEntity("COURSE", {title: `Synthetic course ${courseIndex}`, code: `SYN-${String(courseIndex).padStart(3, "0")}`});
        if (courseIndex === 0) targetCourse = course;
        for (let assignmentIndex = 0; assignmentIndex < 10; assignmentIndex += 1) {
            const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: `Synthetic assessment ${courseIndex}-${assignmentIndex}`});
            createdAssignmentCount += 1;
            if (courseIndex === 0 && assignmentIndex === 0) targetAssignment = assignment;
        }
    }

    for (let index = 0; index < 220; index += 1) {
        store.createEntity(index % 2 ? "RESOURCE" : "ACADEMIC_DOCUMENT", {
            courseId: targetCourse.id,
            assignmentId: targetAssignment.id,
            title: `Synthetic related material ${index}`,
            ...(index % 2 ? {type: "DOCUMENT"} : {documentType: "COURSE_MATERIAL", extractionStatus: "READY"})
        });
    }
    const notes = Array.from({length: 24}, (_, index) => store.createEntity("NOTE", {courseId: targetCourse.id, assignmentId: targetAssignment.id, title: `Synthetic working note ${index}`, content: "Bounded local scale fixture."}));
    notes.forEach(note => store.createRelationship({fromType: "ASSIGNMENT", fromId: targetAssignment.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"}));
    const papers = Array.from({length: 24}, (_, index) => store.createEntity("RESEARCH_PAPER", {title: `Synthetic local paper ${index}`}));
    papers.forEach(paper => store.createRelationship({fromType: "ASSIGNMENT", fromId: targetAssignment.id, relationType: "REFERENCES", toType: "RESEARCH_PAPER", toId: paper.id, source: "USER"}));

    let searchCalls = 0;
    const originalSearch = store.search.bind(store);
    store.search = (...args) => { searchCalls += 1; return originalSearch(...args); };
    const hydration = elapsed(() => store.assignmentOrchestrationContext(targetAssignment.id));
    const courseContext = elapsed(() => store.getCourseContext(targetCourse.id, {limit: 100}));
    const workspace = new StudAssignmentWorkspace();
    workspace.setState(hydration.value, {activeAssignment: targetAssignment, activeCourse: targetCourse, activeObject: {entityType: "NOTE", id: notes[0].id}}, courseContext.value);
    const objects = workspaceObjects(workspace.objectsContext());
    const objectSwitch = await elapsedAsync(() => workspace.loadPreview("NOTE", notes[1].id));
    const noteSwitch = await elapsedAsync(() => workspace.loadPreview("NOTE", notes[2].id));
    const notePreviewId = workspace.state.preview && workspace.state.preview.id;
    const restore = await elapsedAsync(() => workspace.restore());

    assert.strictEqual(store.listEntities("COURSE", {limit: 200}).length, 100);
    assert.strictEqual(createdAssignmentCount, 1000);
    assert.strictEqual(store.listEntities("ASSIGNMENT", {limit: 2000}).length, 500, "The existing global list cap must remain enforced.");
    assert.ok(hydration.value.resources.length <= 100 && hydration.value.documents.length <= 100, "Assignment context must remain bounded.");
    assert.ok(courseContext.value.resources.length <= 100 && courseContext.value.documents.length <= 100, "Course context must remain bounded.");
    assert.ok(objects.length <= 400, "Workspace material composition must remain locally bounded.");
    assert.strictEqual(searchCalls, 0, "Opening or restoring the Workspace must not invoke global FTS.");
    assert.strictEqual(notePreviewId, notes[2].id, "Note switch should use a canonical scoped object.");
    assert.strictEqual(restore.value, true, "Restore should return to the explicit current Working Context object.");
    assert.strictEqual(workspace.state.preview.id, notes[0].id, "Restore must stay scoped to the canonical current Note.");
    assert.ok(hydration.milliseconds < 1500 && courseContext.milliseconds < 1500 && objectSwitch.milliseconds < 250 && noteSwitch.milliseconds < 250 && restore.milliseconds < 250, "M5 local operations exceeded their bounded test budget.");

    console.log(`STUD_ASSIGNMENT_WORKSPACE_SCALE: PASS courses=100 assignments=1000 related_material=220 notes=24 papers=24 hydration_ms=${hydration.milliseconds.toFixed(1)} course_context_ms=${courseContext.milliseconds.toFixed(1)} object_switch_ms=${objectSwitch.milliseconds.toFixed(1)} note_switch_ms=${noteSwitch.milliseconds.toFixed(1)} restore_ms=${restore.milliseconds.toFixed(1)}`);
    store.close();
} finally {
    fs.rmSync(root, {recursive: true, force: true});
} })().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
