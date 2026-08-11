#!/usr/bin/env node

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {StudAcademicStore} = require("../src/classes/workspaces/studAcademicStore.class.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-scale-"));
const count = 5000;

try {
    const store = new StudAcademicStore({root, applicationVersion: "2.6.3-scale"});
    const course = store.createEntity("COURSE", {title: "Synthetic Research Scale", code: "SYN-5000"});
    const paperIds = [];
    const noteIds = [];
    for (let index = 0; index < count; index++) {
        const paper = store.createEntity("RESEARCH_PAPER", {
            title: `Synthetic bounded research paper ${index}`,
            authors: `Researcher ${index}; Example Analyst`,
            year: 2000 + (index % 27),
            abstract: `Deterministic FTS payload for paper ${index} on provenance and canonical academic context.`,
            doi: `10.5555/aegis.scale.${index}`,
            sourceUrl: `https://example.org/research/${index}`,
            objectType: "ARTICLE",
            publisher: "Synthetic Validation Press"
        });
        paperIds.push(paper.id);
        const note = store.saveStructuredNote({
            title: `Synthetic structured note ${index}`,
            courseId: course.id,
            document: {type: "doc", content: [{type: "paragraph", content: [{type: "text", text: `Bounded note ${index} linked to deterministic research context.`}]}]},
            paperIds: index % 100 === 0 ? [paper.id] : []
        });
        noteIds.push(note.id);
    }

    const started = Date.now();
    const paperResults = store.search("aegis.scale.4999", {entityTypes: ["RESEARCH_PAPER"], limit: 20});
    const noteResults = store.search("Bounded note 4999", {entityTypes: ["NOTE"], limit: 20});
    const elapsed = Date.now() - started;
    assert.strictEqual(paperIds.length, count);
    assert.strictEqual(noteIds.length, count);
    assert.strictEqual(paperResults.length, 1);
    assert.strictEqual(noteResults.length, 1);
    assert.strictEqual(store.researchLibrary({limit: 250}).length, 250);
    assert.ok(elapsed < 5000, `Bounded FTS query took ${elapsed}ms`);
    console.log(`STUD_RESEARCH_SCALE: PASS papers=${count} notes=${count} query_ms=${elapsed} library_limit=250`);
    store.close();
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
