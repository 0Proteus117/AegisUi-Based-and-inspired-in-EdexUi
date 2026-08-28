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
const {SCHEMA_VERSION} = require(path.join(SRC, "classes/workspaces/studAcademicModel.class.js"));
const REQUIREMENTS_TABLES = ["stud_requirement_contract_freshness", "stud_requirement_sources", "stud_requirement_items", "stud_requirement_candidates", "stud_requirement_candidate_runs", "stud_assignment_requirement_contracts", "stud_requirement_contracts"];
const M2_TABLES = ["stud_working_context", "stud_assignment_classifications"];
const WORKFLOW_CONDITION_TABLES = ["stud_workflow_blockers", "stud_workflow_checkpoints"];
const WORKFLOW_TABLES = ["stud_workflow_events", "stud_workflow_edges", "stud_workflow_nodes", "stud_workflow_instances", "stud_workflow_template_edges", "stud_workflow_template_nodes", "stud_workflow_template_versions", "stud_workflow_templates"];
const OPERATIONAL_TABLES = ["stud_operation_event_artifacts", "stud_operation_events", "stud_operation_runs", "stud_artifact_relationships", "stud_assignment_artifacts"];
const RESEARCH_PLAN_TABLES = ["stud_research_gaps", "stud_topic_dossier_items", "stud_research_question_requirements", "stud_research_questions", "stud_research_topic_requirements", "stud_research_topics", "stud_assignment_research_plans", "stud_research_plans"];
const CLAIM_EVIDENCE_TABLES = ["stud_claim_evidence_links", "stud_evidence_records", "stud_claim_requirements", "stud_claim_pointers", "stud_claims"];
const FACULTY_SCOUT_TABLES = ["stud_faculty_publication_candidates", "stud_faculty_observations", "stud_faculty_identity_candidates", "stud_faculty_identities"];
const COMPOSITION_TABLES = ["stud_draft_section_versions", "stud_draft_versions", "stud_draft_documents", "stud_composition_section_evidence", "stud_composition_section_claims", "stud_composition_requirement_coverage", "stud_composition_sections", "stud_assignment_composition_plans", "stud_composition_plans"];

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

function removeM2Schema(store) {
    // Recreate the v15 course shape before replaying the v16 migration.
    // SQLite cannot drop the M2 columns in place, so this mirrors a real
    // pre-M2 database without changing any canonical course rows.
    store.db.exec("PRAGMA foreign_keys = OFF;");
    M2_TABLES.forEach(table => store.db.exec(`DROP TABLE IF EXISTS ${table};`));
    store.db.exec("DROP INDEX IF EXISTS stud_courses_academic_organisation_index;");
    store.db.exec("CREATE TABLE stud_courses_v15 AS SELECT id,title,short_name,code,description,start_date,end_date,status,created_at,updated_at,archived_at FROM stud_courses; DROP TABLE stud_courses; ALTER TABLE stud_courses_v15 RENAME TO stud_courses;");
    store.db.exec("PRAGMA foreign_keys = ON;");
}

function freshStore(root) {
    return new StudAcademicStore({root, applicationVersion: "phase14-reproducibility"}).initialize();
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-stud-phase14-repro-"));
try {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(SRC, "package-lock.json"), "utf8"));
    const applicationLock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
    const requiredCitationPackages = ["@citation-js/core", "@citation-js/plugin-bibtex", "@citation-js/plugin-csl"];

    check("CITATION_DEPENDENCIES_DECLARED", () => requiredCitationPackages.forEach(name => assert.ok(manifest.dependencies[name], `${name} is missing from src/package.json`)));
    check("CITATION_DEPENDENCIES_LOCKED", () => requiredCitationPackages.forEach(name => assert.ok(lock.packages[`node_modules/${name}`], `${name} is missing from src/package-lock.json`)));
    check("ELECTRON_OPTIONAL_UNDICI_LOCKED", () => assert.ok(applicationLock.packages["node_modules/undici"], "Electron optional undici dependency is absent from the application lockfile"));
    check("CITATION_CORE_RESOLVES_FROM_SRC", () => {
        const resolved = require.resolve("@citation-js/core", {paths: [SRC]});
        assert.ok(resolved.includes("@citation-js/core"));
        assert.ok(require(resolved).Cite);
    });

    const freshRoot = path.join(root, "fresh-current");
    const fresh = freshStore(freshRoot);
    check("FRESH_DATABASE_REACHES_CURRENT_SCHEMA", () => assert.strictEqual(fresh.schemaInfo().version, SCHEMA_VERSION));
    fresh.createEntity("COURSE", {title: "Fresh schema persistence check"});
    fresh.close();
    const reopenedFresh = freshStore(freshRoot);
    check("FRESH_DATABASE_RESTARTS_WITH_DATA", () => assert.strictEqual(reopenedFresh.listEntities("COURSE", {limit: 10}).length, 1));
    reopenedFresh.close();

    const v12Root = path.join(root, "legacy-v12");
    const v12 = freshStore(v12Root);
    removeTables(v12, [...COMPOSITION_TABLES, ...FACULTY_SCOUT_TABLES, ...CLAIM_EVIDENCE_TABLES, ...RESEARCH_PLAN_TABLES, ...OPERATIONAL_TABLES, ...WORKFLOW_CONDITION_TABLES, ...WORKFLOW_TABLES, ...REQUIREMENTS_TABLES, "stud_provider_sync_preferences", "stud_discipline_profile", "stud_tool_preferences"]);
    removeM2Schema(v12);
    v12.db.prepare("DELETE FROM stud_schema_migrations WHERE version>=13").run();
    v12.close();
    const upgradedV12 = freshStore(v12Root);
    check("MIGRATES_REPRESENTATIVE_V12_TO_CURRENT", () => {
        assert.strictEqual(upgradedV12.schemaInfo().version, SCHEMA_VERSION);
        assert.deepStrictEqual(upgradedV12.listToolPreferences(), []);
        assert.strictEqual(upgradedV12.getProviderSyncPreference("stud_moodle_default").automaticSync, false);
    });
    upgradedV12.close();

    const v9Root = path.join(root, "legacy-v9");
    const v9 = freshStore(v9Root);
    const legacyCourse = v9.createEntity("COURSE", {title: "Legacy course retained across migration"});
    const legacyAssignment = v9.createEntity("ASSIGNMENT", {courseId: legacyCourse.id, title: "Legacy assignment retained across migration"});
    removeTables(v9, [...COMPOSITION_TABLES, ...FACULTY_SCOUT_TABLES, ...CLAIM_EVIDENCE_TABLES, ...RESEARCH_PLAN_TABLES, ...OPERATIONAL_TABLES, ...WORKFLOW_CONDITION_TABLES, ...WORKFLOW_TABLES, ...REQUIREMENTS_TABLES, "stud_provider_sync_preferences", "stud_discipline_profile", "stud_tool_preferences", "stud_repository_references", "stud_datasets", "stud_notebook_outputs", "stud_notebook_cells", "stud_notebooks", "stud_context_packages", "stud_context_decisions", "stud_concept_observations", "stud_academic_concepts"]);
    removeM2Schema(v9);
    v9.db.exec("DROP INDEX IF EXISTS stud_assignments_grade_context_index; ALTER TABLE stud_assignments DROP COLUMN grade_scheme; ALTER TABLE stud_assignments DROP COLUMN grade_text;");
    v9.db.prepare("DELETE FROM stud_schema_migrations WHERE version >= 10").run();
    v9.close();
    const upgradedV9 = freshStore(v9Root);
    check("MIGRATES_REPRESENTATIVE_V9_TO_CURRENT_WITH_DATA", () => {
        assert.strictEqual(upgradedV9.schemaInfo().version, SCHEMA_VERSION);
        assert.strictEqual(upgradedV9.getEntity("ASSIGNMENT", legacyAssignment.id).title, "Legacy assignment retained across migration");
        assert.strictEqual(upgradedV9.getEntity("ASSIGNMENT", legacyAssignment.id).gradeScheme, "UNKNOWN");
    });
    upgradedV9.close();

    console.log(`STUD_PHASE14_REPRODUCIBILITY: ${passed} checks passed`);
} finally {
    fs.rmSync(root, {recursive: true, force: true});
}
