"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const Ipc = require(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/studAcademicModel.class.js"));

let passed = 0;
function check(name, condition) {
    assert.ok(condition, name);
    passed += 1;
    console.log(`${name}: PASS`);
}

function expectCode(code, operation) {
    try { operation(); } catch (error) { check(`REJECTS_${code}`, error.code === code); return; }
    throw new Error(`Expected ${code}`);
}

function createIpcMock() {
    const handlers = new Map();
    return {handlers, handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase1-"));
async function run() {
try {
    const store = new StudAcademicStore({root: tempRoot, applicationVersion: "phase1-test"});
    const schema = store.schemaInfo();
    check("DATABASE_INITIALIZATION", schema.version === Model.SCHEMA_VERSION && schema.journalMode === "WAL");
    check("DATABASE_PATH_POLICY", !schema.dbPathPolicy.includes("repo") && schema.dbPathPolicy === "userData/stud/academic.sqlite");

    const course = store.createEntity("COURSE", {title: "Synthetic Applied Mechanics", code: "MECH-101", description: "Local-only synthetic academic record."}, {
        provenance: {field: "title", observedValue: "Synthetic Applied Mechanics", sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}
    });
    check("COURSE_CREATE_RETRIEVE", course.id.startsWith("stud_course_") && store.getEntity("COURSE", course.id).code === "MECH-101");
    const courseUpdated = store.updateEntity("COURSE", course.id, {description: "Updated without network."});
    check("COURSE_UPDATE", courseUpdated.description === "Updated without network.");

    const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Finite Element Report", dueDate: "2026-11-18T14:00:00.000Z", status: "IN_PROGRESS"}, {
        provenance: {field: "dueDate", observedValue: "2026-11-18T14:00:00.000Z", sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}
    });
    check("ASSIGNMENT_COURSE_RELATION", assignment.courseId === course.id && store.listEntities("ASSIGNMENT", {courseId: course.id}).length === 1);
    const optionalAssignment = store.createEntity("ASSIGNMENT", {title: "No deadline needed"});
    check("ASSIGNMENT_OPTIONAL_FIELDS", optionalAssignment.dueDate === null && optionalAssignment.grade === null);

    const note = store.createEntity("NOTE", {title: "Mesh note", content: "Synthetic bounded note for FTS.", courseId: course.id});
    const resource = store.createEntity("RESOURCE", {title: "Reference brief", type: "DOCUMENT", courseId: course.id, assignmentId: assignment.id});
    const paper = store.createEntity("RESEARCH_PAPER", {title: "Synthetic paper", abstract: "Finite elements under offline test conditions."});
    const revision = store.createEntity("REVISION_ITEM", {courseId: course.id, prompt: "What is a mesh?", answer: "A bounded discretization."});
    check("ALL_CORE_MODELS", [note, resource, paper, revision].every(item => item.id.startsWith("stud_")));

    const calendarIdentifier = store.createExternalIdentifier({entityType: "ASSIGNMENT", entityId: assignment.id, namespace: "ICS_UID", externalId: "synthetic-calendar-event-1", source: "CALENDAR"});
    const emailIdentifier = store.createExternalIdentifier({entityType: "ASSIGNMENT", entityId: assignment.id, namespace: "EMAIL_MESSAGE", externalId: "synthetic-mail-1", source: "EMAIL"});
    check("EXTERNAL_IDENTIFIER_LOOKUP", store.findByExternalIdentifier("ICS_UID", "synthetic-calendar-event-1")[0].id === calendarIdentifier.id);
    expectCode("DUPLICATE_EXTERNAL_IDENTIFIER", () => store.createExternalIdentifier({entityType: "ASSIGNMENT", entityId: assignment.id, namespace: "ICS_UID", externalId: "synthetic-calendar-event-1"}));

    const noteRelation = store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
    const resourceRelation = store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_RESOURCE", toType: "RESOURCE", toId: resource.id, source: "USER"});
    const calendarRelation = store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "RELATED_CALENDAR_EVENT", toType: "EXTERNAL_IDENTIFIER", toId: calendarIdentifier.id, source: "CALENDAR"});
    const emailRelation = store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "RELATED_EMAIL", toType: "EXTERNAL_IDENTIFIER", toId: emailIdentifier.id, source: "EMAIL"});
    check("RELATIONSHIPS_AND_EXTERNAL_CONTRACTS", [noteRelation, resourceRelation, calendarRelation, emailRelation].length === 4 && store.listRelationships("ASSIGNMENT", assignment.id).length === 4);
    expectCode("NOT_FOUND", () => store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "RELATES_TO", toType: "NOTE", toId: "stud_note_missing"}));

    store.createProvenance({entityType: "ASSIGNMENT", entityId: assignment.id, field: "dueDate", observedValue: "2026-11-18T14:00:00.000Z", sourceType: "CALENDAR", sourceAuthority: "CORROBORATING"});
    store.createProvenance({entityType: "ASSIGNMENT", entityId: assignment.id, field: "dueDate", observedValue: "2026-11-17T23:59:00.000Z", sourceType: "EMAIL", sourceAuthority: "TRUSTED"});
    const dueObservations = store.listProvenance("ASSIGNMENT", assignment.id, "dueDate");
    check("FIELD_LEVEL_MULTIPLE_OBSERVATIONS", dueObservations.length === 3 && new Set(dueObservations.map(item => item.sourceType)).size === 3);
    check("CONFLICT_READY_NO_AUTO_RESOLUTION", new Set(dueObservations.map(item => item.observedValue)).size === 2);

    check("FTS_INDEXING", store.search("finite").some(item => item.entityId === assignment.id));
    check("FTS_FILTERS", store.search("mesh", {entityTypes: ["NOTE"], courseId: course.id, limit: 10})[0].entityId === note.id);
    store.updateEntity("NOTE", note.id, {content: "Updated local search corpus."});
    check("FTS_UPDATE", store.search("updated").some(item => item.entityId === note.id));
    store.archiveEntity("NOTE", note.id);
    check("FTS_ARCHIVE_CLEANUP", !store.search("updated").some(item => item.entityId === note.id));

    const beforeRollback = store.listEntities("COURSE", {limit: 500}).length;
    expectCode("INVALID_INPUT", () => store.createEntity("COURSE", {title: "Rollback course"}, {provenance: {field: "x".repeat(120), sourceType: "USER", sourceAuthority: "AUTHORITATIVE"}}));
    check("TRANSACTION_ROLLBACK", store.listEntities("COURSE", {limit: 500}).length === beforeRollback);

    // Deliberately above an ordinary active workload. It exercises indexing and
    // filtering without adding any network or user data.
    for (let courseIndex = 0; courseIndex < 50; courseIndex += 1) store.createEntity("COURSE", {title: `Stress course ${courseIndex}`, code: `S${courseIndex}`});
    const stressCourses = store.listEntities("COURSE", {limit: 100});
    for (let index = 0; index < 500; index += 1) store.createEntity("ASSIGNMENT", {courseId: stressCourses[index % stressCourses.length].id, title: `Stress assignment ${index}`, description: "Synthetic performance corpus."});
    for (let index = 0; index < 1000; index += 1) store.createEntity("RESOURCE", {title: `Stress resource ${index}`, type: "REFERENCE"});
    for (let index = 0; index < 1000; index += 1) store.createEntity("NOTE", {title: `Stress note ${index}`, content: "Synthetic searchable note."});
    for (let index = 0; index < 2000; index += 1) store.createEntity("RESEARCH_PAPER", {title: `Stress paper ${index}`, abstract: "Synthetic academic paper metadata."});
    check("LARGE_DATASET_SEARCH_BOUNDED", store.search("synthetic", {limit: 20}).length === 20);
    check("LARGE_DATASET_COURSE_FILTER", store.listEntities("ASSIGNMENT", {courseId: stressCourses[0].id, limit: 500}).length > 0);

    store.close();
    const reopened = new StudAcademicStore({root: tempRoot, applicationVersion: "phase1-test"});
    check("RESTART_PERSISTENCE", reopened.getEntity("ASSIGNMENT", assignment.id).title === "Finite Element Report");
    reopened.close();

    const ipc = createIpcMock();
    const ipcRoot = path.join(tempRoot, "ipc");
    const registration = Ipc.registerStudAcademicIpc({ipc, app: {getPath: () => ipcRoot, getVersion: () => "phase1-test"}});
    const trustedEvent = {sender: {isDestroyed: () => false, getURL: () => "file:///AegisUi/index.html"}};
    const untrustedEvent = {sender: {isDestroyed: () => false, getURL: () => "https://example.invalid/"}};
    check("IPC_ALLOWLIST", registration.channels.length === Ipc.CHANNELS.length && ipc.handlers.size === Ipc.CHANNELS.length);
    check("IPC_REJECTS_UNTRUSTED_SENDER", (await ipc.handlers.get("stud-core-status")(untrustedEvent, {})).code === "POLICY_BLOCKED");
    check("IPC_HAS_ONLY_TYPED_RESEARCH_CHANNELS", Ipc.CHANNELS.includes("stud-research-search") && !Ipc.CHANNELS.some(channel => /proxy|arbitrary|shell/i.test(channel)));
    registration.dispose();

    const source = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicIpc.class.js"), "utf8");
    const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    check("NO_RENDERER_SQLITE_DIRECT_ACCESS", !manager.includes("node:sqlite") && source.includes("senderIsTrusted"));
    check("COST_MODEL_FOUNDATION", Model.COST_MODELS.join(",") === "FREE_OPEN,FREE_LOCAL,FREE_SERVICE,FREEMIUM,PAID,SUBSCRIPTION");
    check("OFFLINE_CORE_NO_FETCH", !fs.readFileSync(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"), "utf8").includes("fetch("));
    console.log(`STUD_ACADEMIC_CORE: ${passed} checks passed`);
} finally {
    fs.rmSync(tempRoot, {recursive: true, force: true});
}
}

run().catch(error => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
});
