#!/usr/bin/env node

"use strict";

// M5's Assignment Workspace is a renderer composition over canonical STUD
// records. These focused checks exercise the composition contract without a
// DOM, provider, model or filesystem side effect.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudAssignmentWorkspace, WORKSPACE_OBJECT_TYPES, RESOURCE_GROUPS, workspaceObjects, findWorkspaceObject, isBrief} = require("../src/classes/workspaces/studAssignmentWorkspace.class.js");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAssignmentWorkspace.class.js"), "utf8");
const commandCenter = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studCommandCenter.class.js"), "utf8");
const research = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studResearchWorkspace.class.js"), "utf8");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-m5-"));
let passed = 0;
const check = (name, operation) => { operation(); passed += 1; console.log(`${name}: PASS`); };

try {
    const store = new StudAcademicStore({root, applicationVersion: "m5-test"}).initialize();
    const course = store.createEntity("COURSE", {title: "Synthetic discipline-neutral course", code: "SYN-501"});
    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Synthetic assessment workspace"});
    const unrelated = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Other local assessment"});
    const courseResource = store.createEntity("RESOURCE", {courseId: course.id, title: "Course reading", type: "DOCUMENT"});
    const brief = store.createEntity("ACADEMIC_DOCUMENT", {courseId: course.id, assignmentId: assignment.id, title: "Assessment brief and marking criteria", documentType: "COURSE_MATERIAL", extractionStatus: "READY"});
    const paper = store.createEntity("RESEARCH_PAPER", {title: "Local research source"});
    const note = store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: "Explicit working note", content: "Student-owned local note."});
    store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
    store.createRelationship({fromType: "COURSE", fromId: course.id, relationType: "HAS_RESOURCE", toType: "RESOURCE", toId: courseResource.id, source: "USER"});
    store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "REFERENCES", toType: "RESEARCH_PAPER", toId: paper.id, source: "USER"});

    const assignmentContext = store.assignmentOrchestrationContext(assignment.id);
    const courseContext = store.getCourseContext(course.id, {limit: 50});
    const composed = {
        ...assignmentContext,
        resources: [...assignmentContext.resources, ...courseContext.resources],
        documents: [...assignmentContext.documents, ...courseContext.documents],
        notes: [...assignmentContext.notes, ...courseContext.notes],
        papers: [...assignmentContext.papers, ...courseContext.papers]
    };

    check("CANONICAL_TYPES_ONLY", () => {
        assert.deepStrictEqual(WORKSPACE_OBJECT_TYPES, ["ACADEMIC_DOCUMENT", "RESEARCH_PAPER", "NOTE", "RESOURCE", "DATASET", "NOTEBOOK", "REPOSITORY_REFERENCE", "COMPUTE_RESULT", "REVISION_ITEM"]);
        assert.ok(RESOURCE_GROUPS.some(group => group.id === "BRIEF_MARKING"));
        assert.ok(RESOURCE_GROUPS.some(group => group.id === "REPOSITORY_CODE"));
    });
    check("MATERIALS_ARE_DEDUPLICATED_CANONICAL_OBJECTS", () => {
        const objects = workspaceObjects(composed);
        assert.strictEqual(objects.filter(item => item.type === "ACADEMIC_DOCUMENT" && item.id === brief.id).length, 1);
        assert.strictEqual(objects.filter(item => item.type === "RESOURCE" && item.id === courseResource.id).length, 1);
        assert.strictEqual(objects.filter(item => item.type === "NOTE" && item.id === note.id).length, 1);
        assert.strictEqual(objects.find(item => item.id === brief.id).group, "BRIEF_MARKING");
    });
    check("WORKING_NOTES_DEDUPLICATE_DIRECT_AND_COURSE_CONTEXT", () => {
        const workspace = new StudAssignmentWorkspace();
        workspace.setState(assignmentContext, null, courseContext);
        assert.strictEqual(workspace.objectsContext().notes.filter(item => item.id === note.id).length, 1);
    });
    check("NO_TITLE_MATCHING_OR_CROSS_ASSIGNMENT_FABRICATION", () => {
        assert.strictEqual(findWorkspaceObject(assignmentContext, "ASSIGNMENT", assignment.id), null);
        assert.strictEqual(findWorkspaceObject(assignmentContext, "NOTE", "missing_note"), null);
        assert.strictEqual(findWorkspaceObject(assignmentContext, "NOTE", unrelated.id), null);
        assert.strictEqual(isBrief({title: "Workshop note"}), false);
    });
    check("DOCUMENT_RESEARCH_NOTE_PREVIEW_ADAPTERS_ARE_TYPED", () => {
        assert.ok(source.includes('request("stud-document-context"'));
        assert.ok(source.includes('request("stud-research-context"'));
        assert.ok(source.includes('request("stud-dataset-read"'));
        assert.ok(source.includes('request("stud-notebook-read"'));
        assert.ok(source.includes('request("stud-document-create-note"'));
        assert.ok(source.includes("PREVIEW NOT AVAILABLE"));
    });
    check("NO_AUTOMATIC_PROVIDER_OR_AI_EXECUTION", () => {
        assert.ok(!/\bfetch\s*\(/.test(source));
        assert.ok(!/localStorage|sessionStorage|openExternal|window\.require|child_process|\.exec\s*\(/.test(source));
        assert.ok(source.includes("NO WORK EXECUTES AUTOMATICALLY"));
        assert.ok(source.includes("Opening it updates the visible Working Context"));
    });
    check("WORKING_CONTEXT_AND_NOTES_REUSE_EXISTING_CONTRACTS", () => {
        assert.ok(source.includes("this.parent.workingContext.update"));
        assert.ok(source.includes("renderContextualNoteEditor"));
        assert.ok(research.includes("renderContextualNoteEditor"));
        assert.ok(research.includes("stud-note-save-structured"));
        assert.ok(commandCenter.includes("new StudAssignmentWorkspace"));
        assert.ok(commandCenter.includes("this.assignmentWorkspace.restore"));
    });
    check("DISCIPLINE_NEUTRAL_RENDERING_HAS_NO_REQUIRED_STEM_ASSUMPTION", () => {
        ["Engineering report", "Literature essay", "Case analysis", "Social research project", "General coursework"].forEach(title => {
            const objects = workspaceObjects({notes: [{id: title, title}]});
            assert.strictEqual(objects[0].group, "NOTES");
        });
    });
    console.log(`STUD_ASSIGNMENT_WORKSPACE: ${passed} checks passed`);
    store.close();
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
