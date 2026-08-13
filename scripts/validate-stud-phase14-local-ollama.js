#!/usr/bin/env node
"use strict";

// Optional environment validation, intentionally kept out of the broad
// deterministic suite. It proves the configured *local* Ollama integration
// can consume a reviewed package without a cloud fallback or implicit save.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const {StudAcademicStore} = require(path.join(ROOT, "src/classes/workspaces/studAcademicStore.class.js"));
const {StudAcademicAssistantRuntime} = require(path.join(ROOT, "src/classes/workspaces/studAcademicAssistantRuntime.class.js"));

(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase14-ollama-"));
    try {
        const store = new StudAcademicStore({root, applicationVersion: "phase14-local-ollama"});
        const course = store.createEntity("COURSE", {title: "Synthetic local AI validation course"});
        const assignment = store.createEntity("ASSIGNMENT", {courseId: course.id, title: "Synthetic LLM higher education context"});
        const note = store.createEntity("NOTE", {courseId: course.id, assignmentId: assignment.id, title: "Synthetic reviewed source", content: "Local reviewed material: large language models may support drafting and feedback, but human oversight and transparent assessment design remain necessary."});
        store.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
        const pkg = store.createAcademicContextPackage("ASSIGNMENT", assignment.id, {});
        const runtime = new StudAcademicAssistantRuntime({store, userDataRoot: root});
        const status = await runtime.status();
        console.log(`LOCAL_OLLAMA_STATUS: ${status.status} · ${status.model || "NO_MODEL"}`);
        if (status.status !== "READY") process.exitCode = 2;
        else {
            const response = await runtime.generate({packageId: pkg.id, question: "State one opportunity and one limitation using only the supplied local material.", mode: "EXPLAIN", requestId: "phase14_local_ollama"});
            assert.ok(["SUCCESS", "PARTIAL"].includes(response.status), `unexpected local response state: ${response.status}`);
            assert.strictEqual(store.listEntities("NOTE", {limit: 50}).length, 1, "local response persisted without an explicit save");
            assert.ok(response.sourceTrace.length > 0, "local response has no reviewed source trace");
            console.log(`LOCAL_OLLAMA_GROUNDED_RESPONSE: ${response.status}`);
        }
        runtime.dispose(); store.close();
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
