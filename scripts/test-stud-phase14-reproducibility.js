#!/usr/bin/env node
"use strict";

// Phase 14 protects the clean-worktree contract.  This test is deliberately
// offline: it validates the manifest/lock relationship and exercises real
// SQLite upgrades without relying on a developer's pre-existing node_modules.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const {StudAcademicStore} = require(path.join(SRC, "classes/workspaces/studAcademicStore.class.js"));

let passed = 0;
function check(name, fn) {
    try { fn(); passed += 1; console.log(`${name}: PASS`); }
    catch (error) { console.error(`${name}: FAIL`); throw error; }
}

function removeTables(store, tables) {
    store.db.exec("PRAGMA foreign_keys = OFF;");
    tables.forEach(table => store.db.exec(`DROP TABLE IF EXISTS ${table};`));
    store.db.exec("PRAGMA foreign_keys = ON;");
}

function freshStore(root) {
    return new StudAcademicStore({root, applicationVersion: "phase14-reproducibility"}).initialize();
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase14-repro-"));
try {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(SRC, "package-lock.json"), "utf8"));
    const requiredCitationPackages = ["@citation-js/core", "@citation-js/plugin-bibtex", "@citation-js/plugin-csl"];

    check("CITATION_DEPENDENCIES_DECLARED", () => requiredCitationPackages.forEach(name => assert.ok(manifest.dependencies[name], `${name} is missing from src/package.json`)));
    check("CITATION_DEPENDENCIES_LOCKED", () => requiredCitationPackages.forEach(name => assert.ok(lock.packages[`node_modules/${name}`], `${name} is missing from src/package-lock.json`)));
    check("ELECTRON_OPTIONAL_UNDICI_LOCKED", () => assert.ok(lock.packages["node_modules/undici"], "Electron optional undici dependency is absent from the lockfile"));
    check("CITATION_CORE_RESOLVES_FROM_SRC", () => {
        const resolved = require.resolve("@citation-js/core", {paths: [SRC]});
        assert.ok(resolved.includes("@citation-js/core"));
        assert.ok(require(resolved).Cite);
    });

    const freshRoot = path.join(root, "fresh-v14");
    const fresh = freshStore(freshRoot);
    check("FRESH_DATABASE_REACHES_SCHEMA_V14", () => assert.strictEqual(fresh.schemaInfo().version, 14));
    fresh.createEntity("COURSE", {title: "Fresh schema persistence check"});
    fresh.close();
    const reopenedFresh = freshStore(freshRoot);
    check("FRESH_DATABASE_RESTARTS_WITH_DATA", () => assert.strictEqual(reopenedFresh.listEntities("COURSE", {limit: 10}).length, 1));
    reopenedFresh.close();

    const v12Root = path.join(root, "legacy-v12");
    const v12 = freshStore(v12Root);
    removeTables(v12, ["stud_provider_sync_preferences", "stud_discipline_profile", "stud_tool_preferences"]);
    v12.db.prepare("DELETE FROM stud_schema_migrations WHERE version>=13").run();
    v12.close();
    const upgradedV12 = freshStore(v12Root);
    check("MIGRATES_REPRESENTATIVE_V12_TO_V14", () => {
        assert.strictEqual(upgradedV12.schemaInfo().version, 14);
        assert.deepStrictEqual(upgradedV12.listToolPreferences(), []);
        assert.strictEqual(upgradedV12.getProviderSyncPreference("stud_moodle_default").automaticSync, false);
    });
    upgradedV12.close();

    const v9Root = path.join(root, "legacy-v9");
    const v9 = freshStore(v9Root);
    const legacyCourse = v9.createEntity("COURSE", {title: "Legacy course retained across migration"});
    const legacyAssignment = v9.createEntity("ASSIGNMENT", {courseId: legacyCourse.id, title: "Legacy assignment retained across migration"});
    removeTables(v9, ["stud_provider_sync_preferences", "stud_discipline_profile", "stud_tool_preferences", "stud_repository_references", "stud_datasets", "stud_notebook_outputs", "stud_notebook_cells", "stud_notebooks", "stud_context_packages", "stud_context_decisions", "stud_concept_observations", "stud_academic_concepts"]);
    v9.db.exec("DROP INDEX IF EXISTS stud_assignments_grade_context_index; ALTER TABLE stud_assignments DROP COLUMN grade_scheme; ALTER TABLE stud_assignments DROP COLUMN grade_text;");
    v9.db.prepare("DELETE FROM stud_schema_migrations WHERE version >= 10").run();
    v9.close();
    const upgradedV9 = freshStore(v9Root);
    check("MIGRATES_REPRESENTATIVE_V9_TO_V14_WITH_DATA", () => {
        assert.strictEqual(upgradedV9.schemaInfo().version, 14);
        assert.strictEqual(upgradedV9.getEntity("ASSIGNMENT", legacyAssignment.id).title, "Legacy assignment retained across migration");
        assert.strictEqual(upgradedV9.getEntity("ASSIGNMENT", legacyAssignment.id).gradeScheme, "UNKNOWN");
    });
    upgradedV9.close();

    console.log(`STUD_PHASE14_REPRODUCIBILITY: ${passed} checks passed`);
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
