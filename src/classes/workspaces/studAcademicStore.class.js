"use strict";

const fs = require("fs");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");
const Model = require("./studAcademicModel.class.js");
const Research = require("./studResearchModel.class.js");
const Citations = require("./studCitationService.class.js");
const Orchestration = require("./studAcademicOrchestration.class.js");
const RevisionPlanner = require("./studRevisionPlanner.class.js");
const {StudAcademicIntelligence} = require("./studAcademicIntelligence.class.js");
const {StudAcademicProgress} = require("./studAcademicProgress.class.js");
const ToolCatalog = require("./studToolCatalog.registry.js");

const TABLES = Object.freeze({
    COURSE: "stud_courses",
    ASSIGNMENT: "stud_assignments",
    RESOURCE: "stud_resources",
    RESEARCH_PAPER: "stud_research_papers",
    NOTE: "stud_notes",
    REVISION_ITEM: "stud_revision_items",
    COMPUTE_RESULT: "stud_compute_results",
    ACADEMIC_DOCUMENT: "stud_academic_documents",
    NOTEBOOK: "stud_notebooks",
    DATASET: "stud_datasets",
    REPOSITORY_REFERENCE: "stud_repository_references"
});

function parseJson(value, fallback = null) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (error) { return fallback; }
}

function rowToCamel(row) {
    if (!row) return null;
    const result = {};
    Object.entries(row).forEach(([key, value]) => {
        const camel = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
        const progress = key === "local_progress" && value !== null ? Number(value) : null;
        if (["spaced_revision_enabled", "pinned", "schedule_requested", "user_pinned", "user_corrected"].includes(key)) result[camel] = Boolean(value);
        else if (key === "local_progress" && value !== null) result[camel] = Number.isFinite(progress) && progress >= 0 && progress <= 100 ? progress : null;
        else result[camel] = value;
    });
    return result;
}

function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

function isCompletedAssignment(assignment) {
    return ["SUBMITTED", "GRADED", "ARCHIVED"].includes(assignment.status);
}

function localDayStart(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
}

function derivePriority(assignment, now = new Date()) {
    if (assignment.priority) return assignment.priority;
    if (isCompletedAssignment(assignment)) return "LOW";
    if (!assignment.dueDate) return "NORMAL";
    const days = (new Date(assignment.dueDate).getTime() - now.getTime()) / 86400000;
    if (days <= 1) return "URGENT";
    if (days <= 7) return "HIGH";
    if (days <= 21) return "NORMAL";
    return "LOW";
}

class StudAcademicStore {
    constructor(options = {}) {
        if (!options.root) throw new Model.StudError("STORAGE_UNAVAILABLE", "Academic storage root is unavailable.");
        this.root = path.resolve(options.root);
        this.dbPath = path.join(this.root, "academic.sqlite");
        this.applicationVersion = options.applicationVersion || "unknown";
        this.db = null;
        this.transactionDepth = 0;
        this.intelligence = null;
        this.progress = null;
    }

    initialize() {
        if (this.db) return this;
        fs.mkdirSync(this.root, {recursive: true, mode: 0o700});
        try {
            this.db = new DatabaseSync(this.dbPath);
            this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
            this.runMigrations();
            this.intelligence = new StudAcademicIntelligence(this);
            this.progress = new StudAcademicProgress(this);
            // A live timer is intentionally not reconstructed after restart.
            // Only elapsed time already checkpointed by PAUSE is retained.
            this.recoverInterruptedStudySessions();
            return this;
        } catch (error) {
            this.close();
            throw new Model.StudError("DATABASE_OPEN_FAILED", "Aegis could not initialize local academic storage without risking existing data.", {cause: error.message});
        }
    }

    close() {
        if (this.db) {
            try { this.db.close(); } catch (error) {}
            this.db = null;
        }
    }

    runMigrations() {
        this.db.exec("CREATE TABLE IF NOT EXISTS stud_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, application_version TEXT NOT NULL);");
        const applied = new Set(this.db.prepare("SELECT version FROM stud_schema_migrations").all().map(row => row.version));
        const migrations = [{version: 1, sql: `
            CREATE TABLE stud_courses (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, short_name TEXT, code TEXT, description TEXT,
                start_date TEXT, end_date TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, archived_at TEXT
            );
            CREATE TABLE stud_assignments (
                id TEXT PRIMARY KEY, course_id TEXT, title TEXT NOT NULL, description TEXT,
                release_date TEXT, due_date TEXT, cutoff_date TEXT, status TEXT NOT NULL,
                submission_status TEXT NOT NULL, submitted_at TEXT, grade REAL, grade_maximum REAL,
                weight REAL, feedback TEXT, local_progress TEXT, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id)
            );
            CREATE TABLE stud_resources (
                id TEXT PRIMARY KEY, course_id TEXT, assignment_id TEXT, type TEXT NOT NULL, title TEXT NOT NULL,
                url TEXT, local_reference TEXT, mime_type TEXT, checksum TEXT, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id)
            );
            CREATE TABLE stud_research_papers (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, year INTEGER, abstract TEXT, venue TEXT, authors TEXT,
                local_document_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
            );
            CREATE TABLE stud_notes (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, course_id TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id)
            );
            CREATE TABLE stud_revision_items (
                id TEXT PRIMARY KEY, course_id TEXT, prompt TEXT NOT NULL, answer TEXT NOT NULL,
                source_type TEXT, source_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id)
            );
            CREATE TABLE stud_external_identifiers (
                id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, namespace TEXT NOT NULL,
                external_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL,
                UNIQUE(entity_type, namespace, external_id)
            );
            CREATE TABLE stud_provenance_records (
                id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field TEXT NOT NULL,
                observed_value TEXT, source_type TEXT NOT NULL, source_id TEXT, source_authority TEXT NOT NULL,
                observed_at TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL
            );
            CREATE INDEX stud_provenance_entity_index ON stud_provenance_records(entity_type, entity_id, field);
            CREATE TABLE stud_relationships (
                id TEXT PRIMARY KEY, from_type TEXT NOT NULL, from_id TEXT NOT NULL, relation_type TEXT NOT NULL,
                to_type TEXT NOT NULL, to_id TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL,
                UNIQUE(from_type, from_id, relation_type, to_type, to_id)
            );
            CREATE INDEX stud_relationship_from_index ON stud_relationships(from_type, from_id);
            CREATE INDEX stud_relationship_to_index ON stud_relationships(to_type, to_id);
            CREATE VIRTUAL TABLE stud_search USING fts5(entity_type UNINDEXED, entity_id UNINDEXED, course_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');
        `}, {version: 2, sql: `
            ALTER TABLE stud_assignments ADD COLUMN priority TEXT;
            CREATE INDEX stud_assignments_due_index ON stud_assignments(due_date, status);
            CREATE INDEX stud_assignments_course_updated_index ON stud_assignments(course_id, updated_at);
        `}, {version: 3, sql: `
            ALTER TABLE stud_research_papers ADD COLUMN object_type TEXT NOT NULL DEFAULT 'ARTICLE';
            ALTER TABLE stud_research_papers ADD COLUMN published_date TEXT;
            ALTER TABLE stud_research_papers ADD COLUMN publisher TEXT;
            ALTER TABLE stud_research_papers ADD COLUMN doi TEXT;
            ALTER TABLE stud_research_papers ADD COLUMN source_url TEXT;
            ALTER TABLE stud_research_papers ADD COLUMN citation_json TEXT;
            ALTER TABLE stud_research_papers ADD COLUMN oa_json TEXT;
            ALTER TABLE stud_research_papers ADD COLUMN document_metadata_json TEXT;
            ALTER TABLE stud_notes ADD COLUMN assignment_id TEXT REFERENCES stud_assignments(id);
            ALTER TABLE stud_notes ADD COLUMN document_version INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE stud_notes ADD COLUMN document_json TEXT;
            CREATE INDEX stud_research_papers_doi_index ON stud_research_papers(doi);
            CREATE INDEX stud_notes_assignment_updated_index ON stud_notes(assignment_id, updated_at);
        `}, {version: 4, sql: `
            CREATE TABLE stud_provider_instances (
                id TEXT PRIMARY KEY, provider_type TEXT NOT NULL, display_name TEXT NOT NULL, base_url TEXT NOT NULL,
                status TEXT NOT NULL, capabilities_json TEXT NOT NULL, last_successful_sync TEXT, last_attempt TEXT,
                last_error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX stud_provider_instances_type_index ON stud_provider_instances(provider_type, updated_at);
        `}, {version: 5, sql: `
            CREATE TABLE stud_orchestration_links (
                id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
                reference_kind TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT,
                observed_start TEXT, observed_end TEXT, source_context_json TEXT,
                match_confidence TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                UNIQUE(entity_type, entity_id, reference_kind, external_id)
            );
            CREATE INDEX stud_orchestration_links_entity_index ON stud_orchestration_links(entity_type, entity_id, updated_at DESC);
        `}, {version: 6, sql: `
            ALTER TABLE stud_revision_items ADD COLUMN title TEXT;
            ALTER TABLE stud_revision_items ADD COLUMN description TEXT;
            ALTER TABLE stud_revision_items ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
            ALTER TABLE stud_revision_items ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL';
            ALTER TABLE stud_revision_items ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'UNKNOWN';
            ALTER TABLE stud_revision_items ADD COLUMN confidence TEXT NOT NULL DEFAULT 'UNKNOWN';
            ALTER TABLE stud_revision_items ADD COLUMN estimated_duration_minutes INTEGER;
            ALTER TABLE stud_revision_items ADD COLUMN accumulated_study_minutes INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE stud_revision_items ADD COLUMN last_studied_at TEXT;
            ALTER TABLE stud_revision_items ADD COLUMN next_planned_revision_at TEXT;
            ALTER TABLE stud_revision_items ADD COLUMN scheduled_revision_at TEXT;
            ALTER TABLE stud_revision_items ADD COLUMN target_mastery REAL;
            ALTER TABLE stud_revision_items ADD COLUMN current_mastery REAL;
            ALTER TABLE stud_revision_items ADD COLUMN spaced_revision_enabled INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE stud_revision_items ADD COLUMN successful_revision_count INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE stud_revision_items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE stud_revision_items ADD COLUMN plan_position INTEGER;
            ALTER TABLE stud_revision_items ADD COLUMN suggestion_dismissed_until TEXT;
            UPDATE stud_revision_items SET title = prompt WHERE title IS NULL OR title = '';
            CREATE INDEX stud_revision_items_course_schedule_index ON stud_revision_items(course_id, scheduled_revision_at, status);
            CREATE INDEX stud_revision_items_plan_index ON stud_revision_items(status, pinned, plan_position, updated_at);
        `}, {version: 7, sql: `
            CREATE TABLE stud_study_sessions (
                id TEXT PRIMARY KEY, revision_item_id TEXT NOT NULL, status TEXT NOT NULL,
                started_at TEXT NOT NULL, last_resumed_at TEXT, paused_at TEXT, ended_at TEXT,
                elapsed_seconds INTEGER NOT NULL DEFAULT 0, difficulty TEXT, confidence TEXT,
                note TEXT, schedule_requested INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(revision_item_id) REFERENCES stud_revision_items(id)
            );
            CREATE INDEX stud_study_sessions_item_index ON stud_study_sessions(revision_item_id, started_at DESC);
            CREATE INDEX stud_study_sessions_status_index ON stud_study_sessions(status, updated_at DESC);
        `}, {version: 8, sql: `
            CREATE TABLE stud_compute_results (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, capability TEXT NOT NULL, tool TEXT NOT NULL, operation TEXT NOT NULL,
                input_json TEXT, normalized_input_json TEXT, output_json TEXT NOT NULL, units_json TEXT, plot_json TEXT,
                runtime_json TEXT NOT NULL, course_id TEXT, assignment_id TEXT, note_id TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(note_id) REFERENCES stud_notes(id)
            );
            CREATE INDEX stud_compute_results_context_index ON stud_compute_results(course_id, assignment_id, updated_at DESC);
        `}, {version: 9, sql: `
            CREATE TABLE stud_academic_documents (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, document_type TEXT NOT NULL, display_name TEXT,
                managed_reference TEXT, mime_type TEXT, byte_size INTEGER, checksum TEXT, page_count INTEGER,
                extraction_status TEXT NOT NULL, extraction_engine TEXT, extraction_version TEXT,
                course_id TEXT, assignment_id TEXT, source_paper_id TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(source_paper_id) REFERENCES stud_research_papers(id)
            );
            CREATE INDEX stud_academic_documents_context_index ON stud_academic_documents(course_id, assignment_id, updated_at DESC);
            CREATE INDEX stud_academic_documents_checksum_index ON stud_academic_documents(checksum);
            CREATE TABLE stud_document_extractions (
                id TEXT PRIMARY KEY, document_id TEXT NOT NULL, engine TEXT NOT NULL, engine_version TEXT,
                status TEXT NOT NULL, page_count INTEGER, warning_json TEXT, created_at TEXT NOT NULL,
                FOREIGN KEY(document_id) REFERENCES stud_academic_documents(id)
            );
            CREATE INDEX stud_document_extractions_document_index ON stud_document_extractions(document_id, created_at DESC);
            CREATE TABLE stud_document_pages (
                id TEXT PRIMARY KEY, extraction_id TEXT NOT NULL, page_number INTEGER NOT NULL, text_content TEXT,
                text_hash TEXT, created_at TEXT NOT NULL,
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id),
                UNIQUE(extraction_id, page_number)
            );
            CREATE TABLE stud_document_sections (
                id TEXT PRIMARY KEY, extraction_id TEXT NOT NULL, page_start INTEGER, page_end INTEGER, ordinal INTEGER NOT NULL,
                heading TEXT, section_type TEXT NOT NULL, confidence TEXT NOT NULL, created_at TEXT NOT NULL,
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id)
            );
            CREATE TABLE stud_document_chunks (
                id TEXT PRIMARY KEY, extraction_id TEXT NOT NULL, section_id TEXT, page_start INTEGER, page_end INTEGER,
                ordinal INTEGER NOT NULL, chunk_type TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL,
                provenance_json TEXT, created_at TEXT NOT NULL,
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id),
                FOREIGN KEY(section_id) REFERENCES stud_document_sections(id),
                UNIQUE(extraction_id, ordinal)
            );
            CREATE TABLE stud_document_references (
                id TEXT PRIMARY KEY, extraction_id TEXT NOT NULL, page_number INTEGER, ordinal INTEGER NOT NULL,
                reference_type TEXT NOT NULL, value TEXT NOT NULL, source_text TEXT, confidence TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id),
                UNIQUE(extraction_id, ordinal)
            );
            CREATE VIRTUAL TABLE stud_document_search USING fts5(document_id UNINDEXED, extraction_id UNINDEXED, chunk_id UNINDEXED, page_start UNINDEXED, section_id UNINDEXED, title, content, tokenize='unicode61 remove_diacritics 2');
        `}, {version: 10, sql: `
            CREATE TABLE stud_academic_concepts (
                id TEXT PRIMARY KEY, term TEXT NOT NULL, normalized_term TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE stud_concept_observations (
                id TEXT PRIMARY KEY, concept_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
                document_id TEXT, chunk_id TEXT, page_start INTEGER, extraction_method TEXT NOT NULL,
                confidence TEXT NOT NULL, metadata_json TEXT, created_at TEXT NOT NULL,
                FOREIGN KEY(concept_id) REFERENCES stud_academic_concepts(id),
                UNIQUE(concept_id, entity_type, entity_id, chunk_id, extraction_method)
            );
            CREATE INDEX stud_concept_observations_entity_index ON stud_concept_observations(entity_type, entity_id, concept_id);
            CREATE INDEX stud_concept_observations_document_index ON stud_concept_observations(document_id, page_start);
            CREATE TABLE stud_context_decisions (
                id TEXT PRIMARY KEY, root_type TEXT NOT NULL, root_id TEXT NOT NULL,
                candidate_type TEXT NOT NULL, candidate_id TEXT NOT NULL, decision TEXT NOT NULL,
                reason TEXT, metadata_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                UNIQUE(root_type, root_id, candidate_type, candidate_id)
            );
            CREATE INDEX stud_context_decisions_root_index ON stud_context_decisions(root_type, root_id, updated_at DESC);
            CREATE TABLE stud_context_packages (
                id TEXT PRIMARY KEY, root_type TEXT NOT NULL, root_id TEXT NOT NULL, title TEXT NOT NULL,
                status TEXT NOT NULL, snapshot_json TEXT NOT NULL, omitted_json TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX stud_context_packages_root_index ON stud_context_packages(root_type, root_id, updated_at DESC);
        `}, {version: 11, sql: `
            CREATE TABLE stud_notebooks (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, notebook_type TEXT NOT NULL,
                language TEXT NOT NULL, execution_status TEXT NOT NULL, course_id TEXT, assignment_id TEXT, note_id TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id), FOREIGN KEY(note_id) REFERENCES stud_notes(id)
            );
            CREATE INDEX stud_notebooks_context_index ON stud_notebooks(course_id, assignment_id, updated_at DESC);
            CREATE TABLE stud_notebook_cells (
                id TEXT PRIMARY KEY, notebook_id TEXT NOT NULL, cell_order INTEGER NOT NULL, cell_type TEXT NOT NULL,
                source TEXT NOT NULL, execution_state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(notebook_id) REFERENCES stud_notebooks(id), UNIQUE(notebook_id, cell_order)
            );
            CREATE INDEX stud_notebook_cells_notebook_index ON stud_notebook_cells(notebook_id, cell_order);
            CREATE TABLE stud_notebook_outputs (
                id TEXT PRIMARY KEY, cell_id TEXT NOT NULL, output_type TEXT NOT NULL, text_content TEXT,
                artifact_reference TEXT, metadata_json TEXT, truncated INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(cell_id) REFERENCES stud_notebook_cells(id)
            );
            CREATE INDEX stud_notebook_outputs_cell_index ON stud_notebook_outputs(cell_id, created_at DESC);
            CREATE TABLE stud_datasets (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, format TEXT NOT NULL, managed_reference TEXT,
                mime_type TEXT, byte_size INTEGER, checksum TEXT, row_count INTEGER, columns_json TEXT, summary_json TEXT,
                course_id TEXT, assignment_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id), FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id)
            );
            CREATE INDEX stud_datasets_context_index ON stud_datasets(course_id, assignment_id, updated_at DESC);
            CREATE UNIQUE INDEX stud_datasets_checksum_index ON stud_datasets(checksum) WHERE checksum IS NOT NULL;
            CREATE TABLE stud_repository_references (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL, owner TEXT NOT NULL, repository TEXT NOT NULL,
                canonical_url TEXT NOT NULL, selected_ref TEXT, commit_sha TEXT, metadata_json TEXT,
                course_id TEXT, assignment_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
                FOREIGN KEY(course_id) REFERENCES stud_courses(id), FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                UNIQUE(provider, owner, repository, selected_ref)
            );
            CREATE INDEX stud_repository_references_context_index ON stud_repository_references(course_id, assignment_id, updated_at DESC);
        `}, {version: 12, sql: `
            ALTER TABLE stud_assignments ADD COLUMN grade_scheme TEXT NOT NULL DEFAULT 'UNKNOWN';
            ALTER TABLE stud_assignments ADD COLUMN grade_text TEXT;
            CREATE INDEX stud_assignments_grade_context_index ON stud_assignments(course_id, grade_scheme, updated_at DESC);
        `}, {version: 13, sql: `
            CREATE TABLE stud_tool_preferences (
                tool_id TEXT PRIMARY KEY, favorite INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0, used_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX stud_tool_preferences_rank_index ON stud_tool_preferences(pinned, favorite, used_at DESC);
            CREATE TABLE stud_discipline_profile (
                discipline TEXT PRIMARY KEY, profile_rank INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX stud_discipline_profile_rank_index ON stud_discipline_profile(profile_rank);
        `}, {version: 14, sql: `
            CREATE TABLE stud_provider_sync_preferences (
                provider_id TEXT PRIMARY KEY, automatic_sync INTEGER NOT NULL DEFAULT 0,
                interval_minutes INTEGER NOT NULL DEFAULT 360, next_sync_at TEXT,
                last_result_json TEXT, updated_at TEXT NOT NULL,
                FOREIGN KEY(provider_id) REFERENCES stud_provider_instances(id)
            );
            CREATE INDEX stud_provider_sync_due_index ON stud_provider_sync_preferences(automatic_sync, next_sync_at);
        `}, {version: 15, sql: `
            CREATE TABLE stud_requirement_contracts (
                id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, revision INTEGER NOT NULL,
                parent_contract_id TEXT, lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','APPROVED','SUPERSEDED')),
                completeness TEXT NOT NULL CHECK(completeness IN ('COMPLETE','INCOMPLETE','CONFLICTING')),
                approved_as_incomplete INTEGER NOT NULL DEFAULT 0 CHECK(approved_as_incomplete IN (0,1)),
                approved_at TEXT, approved_by TEXT, contract_hash TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(parent_contract_id) REFERENCES stud_requirement_contracts(id),
                UNIQUE(assignment_id, revision)
            );
            CREATE INDEX stud_requirement_contracts_assignment_index ON stud_requirement_contracts(assignment_id, revision DESC);
            CREATE INDEX stud_requirement_contracts_lifecycle_index ON stud_requirement_contracts(assignment_id, lifecycle);
            CREATE TABLE stud_assignment_requirement_contracts (
                assignment_id TEXT PRIMARY KEY, current_contract_id TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(current_contract_id) REFERENCES stud_requirement_contracts(id)
            );
            CREATE TABLE stud_requirement_candidate_runs (
                id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, linked_documents INTEGER NOT NULL,
                indexable_documents INTEGER NOT NULL, inspected_documents INTEGER NOT NULL,
                ocr_required_documents INTEGER NOT NULL, chunks_inspected INTEGER NOT NULL,
                truncation_reached INTEGER NOT NULL CHECK(truncation_reached IN (0,1)),
                candidates_generated INTEGER NOT NULL, bounds_json TEXT NOT NULL, created_at TEXT NOT NULL,
                FOREIGN KEY(contract_id) REFERENCES stud_requirement_contracts(id)
            );
            CREATE INDEX stud_requirement_candidate_runs_contract_index ON stud_requirement_candidate_runs(contract_id, created_at DESC);
            CREATE TABLE stud_requirement_candidates (
                id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, run_id TEXT, candidate_key TEXT NOT NULL,
                requirement_type TEXT NOT NULL, subtype TEXT, label TEXT NOT NULL,
                original_value TEXT, display_value TEXT, normalized_value TEXT, unit TEXT,
                disposition TEXT NOT NULL CHECK(disposition IN ('PENDING','INCLUDED','EXCLUDED','UNRESOLVED')),
                resolution_state TEXT NOT NULL CHECK(resolution_state IN ('RESOLVED','UNRESOLVED','CONFLICTING')),
                extraction_method TEXT NOT NULL, confidence TEXT NOT NULL, item_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(run_id) REFERENCES stud_requirement_candidate_runs(id),
                UNIQUE(contract_id, candidate_key)
            );
            CREATE INDEX stud_requirement_candidates_contract_index ON stud_requirement_candidates(contract_id, disposition, item_order);
            CREATE TABLE stud_requirement_items (
                id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, candidate_id TEXT UNIQUE,
                requirement_type TEXT NOT NULL, subtype TEXT, label TEXT NOT NULL,
                original_value TEXT, display_value TEXT, normalized_value TEXT, unit TEXT,
                resolution_state TEXT NOT NULL CHECK(resolution_state IN ('RESOLVED','UNRESOLVED','CONFLICTING')),
                user_note TEXT, item_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(candidate_id) REFERENCES stud_requirement_candidates(id)
            );
            CREATE INDEX stud_requirement_items_contract_index ON stud_requirement_items(contract_id, item_order, created_at);
            CREATE TABLE stud_requirement_sources (
                id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, candidate_id TEXT, requirement_item_id TEXT,
                source_kind TEXT NOT NULL, source_entity_type TEXT, source_entity_id TEXT, source_field TEXT,
                provenance_id TEXT, external_identifier_id TEXT, document_id TEXT, extraction_id TEXT, chunk_id TEXT,
                page_start INTEGER, page_end INTEGER, content_hash TEXT, source_version_hash TEXT,
                snapshot_hash TEXT NOT NULL, presentation_label TEXT, excerpt TEXT, metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(candidate_id) REFERENCES stud_requirement_candidates(id),
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id),
                FOREIGN KEY(provenance_id) REFERENCES stud_provenance_records(id),
                FOREIGN KEY(external_identifier_id) REFERENCES stud_external_identifiers(id),
                FOREIGN KEY(document_id) REFERENCES stud_academic_documents(id),
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id),
                FOREIGN KEY(chunk_id) REFERENCES stud_document_chunks(id),
                CHECK((candidate_id IS NOT NULL AND requirement_item_id IS NULL) OR (candidate_id IS NULL AND requirement_item_id IS NOT NULL))
            );
            CREATE INDEX stud_requirement_sources_contract_index ON stud_requirement_sources(contract_id);
            CREATE INDEX stud_requirement_sources_candidate_index ON stud_requirement_sources(candidate_id);
            CREATE INDEX stud_requirement_sources_item_index ON stud_requirement_sources(requirement_item_id);
            CREATE INDEX stud_requirement_sources_document_index ON stud_requirement_sources(document_id, extraction_id, chunk_id);
            CREATE TABLE stud_requirement_contract_freshness (
                contract_id TEXT PRIMARY KEY,
                review_condition TEXT NOT NULL CHECK(review_condition IN ('CURRENT','SOURCE_CHANGED','SOURCE_MISSING','OCR_BLOCKED','NEEDS_REVIEW')),
                details_json TEXT NOT NULL, checked_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(contract_id) REFERENCES stud_requirement_contracts(id)
            );
        `}, {version: 16, sql: `
            ALTER TABLE stud_courses ADD COLUMN academic_year TEXT;
            ALTER TABLE stud_courses ADD COLUMN academic_term TEXT;
            ALTER TABLE stud_courses ADD COLUMN academic_level TEXT;
            CREATE INDEX stud_courses_academic_organisation_index ON stud_courses(academic_year, academic_term, status, updated_at DESC);
            CREATE TABLE stud_assignment_classifications (
                assignment_id TEXT PRIMARY KEY,
                classification TEXT NOT NULL CHECK(classification IN ('COURSEWORK','EXAM','LAB_PRACTICAL','PRESENTATION','TEAM_PROJECT','INDIVIDUAL_COMPONENT','PEER_FEEDBACK','SUBMISSION_POINT','FORMATIVE_PRACTICE','ADMINISTRATIVE','OTHER','UNKNOWN')),
                source_kind TEXT NOT NULL CHECK(source_kind IN ('EXPLICIT','DETERMINISTIC','USER')),
                source_detail TEXT,
                user_corrected INTEGER NOT NULL DEFAULT 0 CHECK(user_corrected IN (0,1)),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id)
            );
            CREATE INDEX stud_assignment_classifications_kind_index ON stud_assignment_classifications(classification, updated_at DESC);
            CREATE TABLE stud_working_context (
                id TEXT PRIMARY KEY CHECK(id = 'current'),
                active_course_id TEXT,
                active_assignment_id TEXT,
                active_requirement_contract_id TEXT,
                active_object_type TEXT,
                active_object_id TEXT,
                origin_surface TEXT,
                user_pinned INTEGER NOT NULL DEFAULT 0 CHECK(user_pinned IN (0,1)),
                updated_at TEXT NOT NULL,
                FOREIGN KEY(active_course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(active_assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(active_requirement_contract_id) REFERENCES stud_requirement_contracts(id)
            );
        `}, {version: 17, sql: `
            CREATE TABLE stud_workflow_templates (
                id TEXT PRIMARY KEY,
                template_key TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE stud_workflow_template_versions (
                id TEXT PRIMARY KEY,
                template_id TEXT NOT NULL,
                version INTEGER NOT NULL CHECK(version >= 1),
                fingerprint TEXT NOT NULL,
                canonical_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(template_id) REFERENCES stud_workflow_templates(id),
                UNIQUE(template_id, version),
                UNIQUE(template_id, fingerprint)
            );
            CREATE INDEX stud_workflow_template_versions_template_index ON stud_workflow_template_versions(template_id, version DESC);
            CREATE TABLE stud_workflow_template_nodes (
                id TEXT PRIMARY KEY,
                template_version_id TEXT NOT NULL,
                node_key TEXT NOT NULL,
                semantic_type TEXT NOT NULL CHECK(semantic_type IN ('RESEARCH','WRITING','TECHNICAL','HUMAN_TASK','EXTERNAL_TASK','REVIEW','FINALISATION','OTHER')),
                title TEXT NOT NULL,
                description TEXT,
                node_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(template_version_id) REFERENCES stud_workflow_template_versions(id),
                UNIQUE(template_version_id, node_key)
            );
            CREATE INDEX stud_workflow_template_nodes_version_index ON stud_workflow_template_nodes(template_version_id, node_order, node_key);
            CREATE TABLE stud_workflow_template_edges (
                id TEXT PRIMARY KEY,
                template_version_id TEXT NOT NULL,
                from_node_key TEXT NOT NULL,
                to_node_key TEXT NOT NULL,
                FOREIGN KEY(template_version_id) REFERENCES stud_workflow_template_versions(id),
                UNIQUE(template_version_id, from_node_key, to_node_key),
                CHECK(from_node_key <> to_node_key)
            );
            CREATE INDEX stud_workflow_template_edges_version_index ON stud_workflow_template_edges(template_version_id, from_node_key, to_node_key);
            CREATE TABLE stud_workflow_instances (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                template_version_id TEXT NOT NULL,
                template_fingerprint TEXT NOT NULL,
                contract_id TEXT,
                contract_revision INTEGER,
                contract_hash TEXT,
                no_contract_reason TEXT,
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('ACTIVE','HISTORICAL','ARCHIVED')),
                is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1)),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                archived_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(template_version_id) REFERENCES stud_workflow_template_versions(id),
                FOREIGN KEY(contract_id) REFERENCES stud_requirement_contracts(id),
                CHECK((lifecycle='ACTIVE' AND is_current=1) OR (lifecycle IN ('HISTORICAL','ARCHIVED') AND is_current=0)),
                CHECK((contract_id IS NOT NULL AND contract_revision IS NOT NULL AND contract_hash IS NOT NULL AND no_contract_reason IS NULL) OR
                      (contract_id IS NULL AND contract_revision IS NULL AND contract_hash IS NULL AND no_contract_reason IS NOT NULL))
            );
            CREATE UNIQUE INDEX stud_workflow_instances_current_index ON stud_workflow_instances(assignment_id) WHERE is_current=1;
            CREATE INDEX stud_workflow_instances_assignment_index ON stud_workflow_instances(assignment_id, created_at DESC);
            CREATE TABLE stud_workflow_nodes (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                template_node_key TEXT,
                semantic_type TEXT NOT NULL CHECK(semantic_type IN ('RESEARCH','WRITING','TECHNICAL','HUMAN_TASK','EXTERNAL_TASK','REVIEW','FINALISATION','OTHER')),
                title TEXT NOT NULL,
                description TEXT,
                node_order INTEGER NOT NULL DEFAULT 0,
                state TEXT NOT NULL CHECK(state IN ('NOT_STARTED','IN_PROGRESS','COMPLETE','SKIPPED')),
                origin TEXT NOT NULL CHECK(origin IN ('TEMPLATE','USER')),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                started_at TEXT,
                completed_at TEXT,
                skipped_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                UNIQUE(workflow_id, template_node_key)
            );
            CREATE INDEX stud_workflow_nodes_workflow_index ON stud_workflow_nodes(workflow_id, node_order, id);
            CREATE TABLE stud_workflow_edges (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                from_node_id TEXT NOT NULL,
                to_node_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(from_node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(to_node_id) REFERENCES stud_workflow_nodes(id),
                UNIQUE(workflow_id, from_node_id, to_node_id),
                CHECK(from_node_id <> to_node_id)
            );
            CREATE INDEX stud_workflow_edges_workflow_index ON stud_workflow_edges(workflow_id, from_node_id, to_node_id);
            CREATE TABLE stud_workflow_events (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                event_sequence INTEGER NOT NULL CHECK(event_sequence >= 1),
                event_type TEXT NOT NULL CHECK(event_type IN ('TEMPLATE_SELECTED','WORKFLOW_CREATED','NODE_STARTED','NODE_COMPLETED','NODE_SKIPPED','NODE_REOPENED','NODE_RENAMED','NODE_ADDED','EDGE_ADDED','EDGE_REMOVED','WORKFLOW_REPLACED')),
                node_id TEXT,
                actor TEXT NOT NULL,
                details_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(node_id) REFERENCES stud_workflow_nodes(id),
                UNIQUE(workflow_id, event_sequence)
            );
            CREATE INDEX stud_workflow_events_workflow_index ON stud_workflow_events(workflow_id, event_sequence DESC);
            ALTER TABLE stud_working_context ADD COLUMN active_workflow_id TEXT REFERENCES stud_workflow_instances(id);
            ALTER TABLE stud_working_context ADD COLUMN active_workflow_node_id TEXT REFERENCES stud_workflow_nodes(id);
        `}, {version: 18, sql: `
            CREATE TABLE stud_workflow_blockers (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                blocker_type TEXT NOT NULL CHECK(blocker_type IN ('WAITING_LAB','WAITING_TEAM_MEMBER','WAITING_DATA','WAITING_FEEDBACK','WAITING_SUPERVISOR','WAITING_APPROVAL','WAITING_RESOURCE','WAITING_EVENT','WAITING_INTERVIEW','WAITING_SURVEY','WAITING_FIELDWORK','WAITING_EQUIPMENT','WAITING_EXTERNAL_RESULT','CUSTOM')),
                status TEXT NOT NULL CHECK(status IN ('OPEN','RESOLVED','CANCELLED')),
                title TEXT NOT NULL,
                description TEXT,
                reason TEXT,
                expected_resolution_at TEXT,
                owner TEXT,
                required_input TEXT,
                requirement_item_id TEXT,
                source_contract_id TEXT,
                source_contract_revision INTEGER,
                source_contract_hash TEXT,
                source_snapshot_hash TEXT,
                related_entity_type TEXT,
                related_entity_id TEXT,
                provenance_id TEXT,
                origin TEXT NOT NULL CHECK(origin IN ('USER','REQUIREMENT','TEMPLATE','CANONICAL','EXTERNAL')),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                resolved_at TEXT,
                cancelled_at TEXT,
                resolution_note TEXT,
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id),
                FOREIGN KEY(source_contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(provenance_id) REFERENCES stud_provenance_records(id),
                CHECK((related_entity_type IS NULL AND related_entity_id IS NULL) OR (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL))
            );
            CREATE INDEX stud_workflow_blockers_workflow_index ON stud_workflow_blockers(workflow_id, status, node_id, created_at DESC);
            CREATE INDEX stud_workflow_blockers_node_index ON stud_workflow_blockers(node_id, status, created_at DESC);
            CREATE TABLE stud_workflow_checkpoints (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                title TEXT NOT NULL,
                instructions TEXT,
                required_decision TEXT,
                status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
                decision TEXT,
                decision_note TEXT,
                requirement_item_id TEXT,
                source_contract_id TEXT,
                source_contract_revision INTEGER,
                source_contract_hash TEXT,
                source_snapshot_hash TEXT,
                related_entity_type TEXT,
                related_entity_id TEXT,
                provenance_id TEXT,
                origin TEXT NOT NULL CHECK(origin IN ('USER','REQUIREMENT','TEMPLATE','CANONICAL','EXTERNAL')),
                replaces_checkpoint_id TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                decided_at TEXT,
                cancelled_at TEXT,
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id),
                FOREIGN KEY(source_contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(provenance_id) REFERENCES stud_provenance_records(id),
                FOREIGN KEY(replaces_checkpoint_id) REFERENCES stud_workflow_checkpoints(id),
                CHECK((related_entity_type IS NULL AND related_entity_id IS NULL) OR (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL))
            );
            CREATE INDEX stud_workflow_checkpoints_workflow_index ON stud_workflow_checkpoints(workflow_id, status, node_id, created_at DESC);
            CREATE INDEX stud_workflow_checkpoints_node_index ON stud_workflow_checkpoints(node_id, status, created_at DESC);
            DROP INDEX stud_workflow_events_workflow_index;
            ALTER TABLE stud_workflow_events RENAME TO stud_workflow_events_v17;
            CREATE TABLE stud_workflow_events (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                event_sequence INTEGER NOT NULL CHECK(event_sequence >= 1),
                event_type TEXT NOT NULL CHECK(event_type IN ('TEMPLATE_SELECTED','WORKFLOW_CREATED','NODE_STARTED','NODE_COMPLETED','NODE_SKIPPED','NODE_REOPENED','NODE_RENAMED','NODE_ADDED','EDGE_ADDED','EDGE_REMOVED','WORKFLOW_REPLACED','BLOCKER_CREATED','BLOCKER_UPDATED','BLOCKER_RESOLVED','BLOCKER_CANCELLED','CHECKPOINT_CREATED','CHECKPOINT_APPROVED','CHECKPOINT_REJECTED','CHECKPOINT_CANCELLED')),
                node_id TEXT,
                actor TEXT NOT NULL,
                details_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(node_id) REFERENCES stud_workflow_nodes(id),
                UNIQUE(workflow_id, event_sequence)
            );
            INSERT INTO stud_workflow_events (id,workflow_id,event_sequence,event_type,node_id,actor,details_json,created_at)
                SELECT id,workflow_id,event_sequence,event_type,node_id,actor,details_json,created_at FROM stud_workflow_events_v17;
            DROP TABLE stud_workflow_events_v17;
            CREATE INDEX stud_workflow_events_workflow_index ON stud_workflow_events(workflow_id, event_sequence DESC);
        `}, {version: 19, sql: `
            CREATE TABLE stud_assignment_artifacts (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                course_id TEXT,
                workflow_id TEXT,
                workflow_node_id TEXT,
                canonical_object_type TEXT NOT NULL,
                canonical_object_id TEXT NOT NULL,
                artifact_type TEXT NOT NULL CHECK(artifact_type IN ('ACADEMIC_DOCUMENT','SOURCE_DOCUMENT','RESEARCH_PAPER','WEB_REFERENCE','NOTE','DATASET','NOTEBOOK','REPOSITORY_CODE','COMPUTE_INPUT','COMPUTE_RESULT','FIGURE','IMAGE','TABLE','CHART','CALCULATION','SIMULATION_RESULT','REVISION_ITEM','DRAFT_VERSION','CITATION_REFERENCE','EXPORT_PACKAGE','GENERIC_MANUAL')),
                label TEXT NOT NULL,
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('ACTIVE','HISTORICAL','ARCHIVED')),
                origin TEXT NOT NULL CHECK(origin IN ('USER_CREATED','USER_IMPORTED','MOODLE_SYNC','RESEARCH_ACQUISITION','COMPUTE','MODEL_GENERATED','SYSTEM_GENERATED','EXTERNAL_REFERENCE','UNKNOWN')),
                producer TEXT NOT NULL,
                parent_artifact_id TEXT,
                metadata_json TEXT,
                integrity_hash TEXT,
                availability_state TEXT NOT NULL CHECK(availability_state IN ('AVAILABLE','OFFLINE','MISSING','UNAVAILABLE')),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(workflow_node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(parent_artifact_id) REFERENCES stud_assignment_artifacts(id),
                UNIQUE(assignment_id,canonical_object_type,canonical_object_id,artifact_type),
                CHECK(length(label) BETWEEN 1 AND 240),
                CHECK((workflow_node_id IS NULL) OR (workflow_id IS NOT NULL))
            );
            CREATE INDEX stud_assignment_artifacts_assignment_index ON stud_assignment_artifacts(assignment_id,created_at DESC,id DESC);
            CREATE INDEX stud_assignment_artifacts_filter_index ON stud_assignment_artifacts(assignment_id,artifact_type,origin,availability_state,created_at DESC);
            CREATE INDEX stud_assignment_artifacts_workflow_index ON stud_assignment_artifacts(workflow_id,workflow_node_id,created_at DESC);

            CREATE TABLE stud_artifact_relationships (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                from_artifact_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL CHECK(relationship_type IN ('DERIVED_FROM','USES','REFERENCES','SUPERSEDES','EXPORT_OF','GENERATED_FROM')),
                to_artifact_id TEXT NOT NULL,
                producer TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(from_artifact_id) REFERENCES stud_assignment_artifacts(id),
                FOREIGN KEY(to_artifact_id) REFERENCES stud_assignment_artifacts(id),
                UNIQUE(from_artifact_id,relationship_type,to_artifact_id),
                CHECK(from_artifact_id <> to_artifact_id)
            );
            CREATE INDEX stud_artifact_relationships_assignment_index ON stud_artifact_relationships(assignment_id,created_at DESC);
            CREATE INDEX stud_artifact_relationships_from_index ON stud_artifact_relationships(from_artifact_id,relationship_type);
            CREATE INDEX stud_artifact_relationships_to_index ON stud_artifact_relationships(to_artifact_id,relationship_type);

            CREATE TABLE stud_operation_runs (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                workflow_id TEXT,
                workflow_node_id TEXT,
                operation_type TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('CREATED','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED')),
                actor TEXT NOT NULL CHECK(actor IN ('USER','SYSTEM','MOODLE','RESEARCH','COMPUTE','MODEL','WORKFLOW','UNKNOWN')),
                progress_mode TEXT NOT NULL CHECK(progress_mode IN ('NONE','INDETERMINATE','DETERMINATE')),
                progress_current INTEGER,
                progress_total INTEGER,
                progress_unit TEXT,
                status_summary TEXT,
                error_summary TEXT,
                parent_run_id TEXT,
                can_pause INTEGER NOT NULL DEFAULT 0 CHECK(can_pause IN (0,1)),
                can_cancel INTEGER NOT NULL DEFAULT 0 CHECK(can_cancel IN (0,1)),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(workflow_node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(parent_run_id) REFERENCES stud_operation_runs(id),
                CHECK((workflow_node_id IS NULL) OR (workflow_id IS NOT NULL)),
                CHECK((progress_mode='DETERMINATE' AND progress_current IS NOT NULL AND progress_total IS NOT NULL AND progress_current>=0 AND progress_total>0 AND progress_current<=progress_total) OR (progress_mode IN ('NONE','INDETERMINATE') AND progress_current IS NULL AND progress_total IS NULL))
            );
            CREATE INDEX stud_operation_runs_assignment_index ON stud_operation_runs(assignment_id,created_at DESC,id DESC);
            CREATE INDEX stud_operation_runs_active_index ON stud_operation_runs(assignment_id,state,updated_at DESC);
            CREATE INDEX stud_operation_runs_workflow_index ON stud_operation_runs(workflow_id,workflow_node_id,created_at DESC);

            CREATE TABLE stud_operation_events (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                workflow_id TEXT,
                workflow_node_id TEXT,
                run_id TEXT,
                event_sequence INTEGER NOT NULL CHECK(event_sequence >= 1),
                event_type TEXT NOT NULL CHECK(event_type IN ('OPERATION_CREATED','OPERATION_STARTED','OPERATION_PAUSED','OPERATION_RESUMED','OPERATION_COMPLETED','OPERATION_FAILED','OPERATION_CANCELLED','STAGE_ENTERED','STAGE_LEFT','ARTIFACT_REGISTERED','ARTIFACT_UPDATED','ARTIFACT_SUPERSEDED','SOURCE_ACQUIRED','DOCUMENT_INDEXED','EXTRACTION_COMPLETED','MODEL_REQUEST_STARTED','MODEL_REQUEST_COMPLETED','MODEL_REQUEST_FAILED','COMPUTE_STARTED','COMPUTE_COMPLETED','COMPUTE_FAILED','CHECKPOINT_REQUESTED','CHECKPOINT_DECIDED','BLOCKER_CREATED','BLOCKER_RESOLVED','HUMAN_INPUT_REQUESTED','HUMAN_INPUT_RECEIVED')),
                actor TEXT NOT NULL CHECK(actor IN ('USER','SYSTEM','MOODLE','RESEARCH','COMPUTE','MODEL','WORKFLOW','UNKNOWN')),
                severity TEXT NOT NULL CHECK(severity IN ('INFO','NOTICE','WARNING','ERROR')),
                payload_json TEXT,
                canonical_object_type TEXT,
                canonical_object_id TEXT,
                source_workflow_event_id TEXT,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(workflow_node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(run_id) REFERENCES stud_operation_runs(id),
                FOREIGN KEY(source_workflow_event_id) REFERENCES stud_workflow_events(id),
                UNIQUE(assignment_id,event_sequence),
                CHECK(length(summary) BETWEEN 1 AND 1000),
                CHECK((workflow_node_id IS NULL) OR (workflow_id IS NOT NULL)),
                CHECK((canonical_object_type IS NULL AND canonical_object_id IS NULL) OR (canonical_object_type IS NOT NULL AND canonical_object_id IS NOT NULL))
            );
            CREATE INDEX stud_operation_events_assignment_index ON stud_operation_events(assignment_id,event_sequence DESC);
            CREATE INDEX stud_operation_events_run_index ON stud_operation_events(run_id,event_sequence DESC);
            CREATE INDEX stud_operation_events_workflow_index ON stud_operation_events(workflow_id,workflow_node_id,event_sequence DESC);

            CREATE TABLE stud_operation_event_artifacts (
                event_id TEXT NOT NULL,
                artifact_id TEXT NOT NULL,
                PRIMARY KEY(event_id,artifact_id),
                FOREIGN KEY(event_id) REFERENCES stud_operation_events(id) ON DELETE CASCADE,
                FOREIGN KEY(artifact_id) REFERENCES stud_assignment_artifacts(id)
            );
            CREATE INDEX stud_operation_event_artifacts_artifact_index ON stud_operation_event_artifacts(artifact_id,event_id);
        `}, {version: 20, sql: `
            CREATE TABLE stud_research_plans (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                course_id TEXT,
                workflow_id TEXT,
                requirements_contract_id TEXT NOT NULL,
                requirements_contract_revision INTEGER NOT NULL CHECK(requirements_contract_revision >= 1),
                requirements_contract_hash TEXT NOT NULL,
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','REVIEWED','SUPERSEDED')),
                revision INTEGER NOT NULL CHECK(revision >= 1),
                parent_plan_id TEXT,
                origin TEXT NOT NULL CHECK(origin IN ('USER','DETERMINISTIC','AI_ASSISTED','IMPORTED','UNKNOWN')),
                user_notes TEXT,
                plan_hash TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(requirements_contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(parent_plan_id) REFERENCES stud_research_plans(id),
                UNIQUE(assignment_id, revision)
            );
            CREATE UNIQUE INDEX stud_research_plans_draft_index ON stud_research_plans(assignment_id) WHERE lifecycle='DRAFT';
            CREATE INDEX stud_research_plans_assignment_index ON stud_research_plans(assignment_id, revision DESC, created_at DESC);
            CREATE INDEX stud_research_plans_contract_index ON stud_research_plans(requirements_contract_id, requirements_contract_revision);

            CREATE TABLE stud_assignment_research_plans (
                assignment_id TEXT PRIMARY KEY,
                current_plan_id TEXT NOT NULL UNIQUE,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(current_plan_id) REFERENCES stud_research_plans(id)
            );

            CREATE TABLE stud_research_topics (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                parent_topic_id TEXT,
                workflow_node_id TEXT,
                title TEXT NOT NULL,
                description TEXT,
                rationale TEXT,
                priority TEXT NOT NULL CHECK(priority IN ('URGENT','HIGH','NORMAL','LOW')),
                topic_order INTEGER NOT NULL DEFAULT 0 CHECK(topic_order >= 0),
                origin TEXT NOT NULL CHECK(origin IN ('USER','DETERMINISTIC','AI_ASSISTED','IMPORTED','UNKNOWN')),
                basis TEXT NOT NULL CHECK(basis IN ('REQUIRED_BY_ASSIGNMENT','PROPOSED_BY_RESEARCH_PLANNING','USER_DEFINED')),
                disposition TEXT NOT NULL CHECK(disposition IN ('PROPOSED','INCLUDED','REJECTED','UNRESOLVED')),
                user_notes TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(parent_topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(workflow_node_id) REFERENCES stud_workflow_nodes(id),
                CHECK(parent_topic_id IS NULL OR parent_topic_id <> id)
            );
            CREATE INDEX stud_research_topics_plan_index ON stud_research_topics(plan_id, topic_order, id);
            CREATE INDEX stud_research_topics_assignment_index ON stud_research_topics(assignment_id, updated_at DESC);

            CREATE TABLE stud_research_topic_requirements (
                topic_id TEXT NOT NULL,
                requirement_item_id TEXT NOT NULL,
                relationship_basis TEXT NOT NULL CHECK(relationship_basis IN ('REQUIRED_BY_ASSIGNMENT','PROPOSED_BY_RESEARCH_PLANNING')),
                requirement_snapshot_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(topic_id, requirement_item_id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id) ON DELETE CASCADE,
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id)
            );
            CREATE INDEX stud_research_topic_requirements_item_index ON stud_research_topic_requirements(requirement_item_id, topic_id);

            CREATE TABLE stud_research_questions (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                topic_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                parent_question_id TEXT,
                question_text TEXT NOT NULL,
                rationale TEXT,
                priority TEXT NOT NULL CHECK(priority IN ('URGENT','HIGH','NORMAL','LOW')),
                state TEXT NOT NULL CHECK(state IN ('OPEN','ANSWERED','UNRESOLVED','DEFERRED')),
                origin TEXT NOT NULL CHECK(origin IN ('USER','DETERMINISTIC','AI_ASSISTED','IMPORTED','UNKNOWN')),
                question_order INTEGER NOT NULL DEFAULT 0 CHECK(question_order >= 0),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(parent_question_id) REFERENCES stud_research_questions(id),
                CHECK(parent_question_id IS NULL OR parent_question_id <> id)
            );
            CREATE INDEX stud_research_questions_topic_index ON stud_research_questions(topic_id, question_order, id);
            CREATE INDEX stud_research_questions_plan_index ON stud_research_questions(plan_id, state, question_order);

            CREATE TABLE stud_research_question_requirements (
                question_id TEXT NOT NULL,
                requirement_item_id TEXT NOT NULL,
                requirement_snapshot_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(question_id, requirement_item_id),
                FOREIGN KEY(question_id) REFERENCES stud_research_questions(id) ON DELETE CASCADE,
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id)
            );

            CREATE TABLE stud_topic_dossier_items (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                topic_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                canonical_object_type TEXT,
                canonical_object_id TEXT,
                artifact_id TEXT,
                membership_origin TEXT NOT NULL CHECK(membership_origin IN ('USER_ADDED','RESEARCH_ACQUIRED','COURSE_MATERIAL','ASSIGNMENT_MATERIAL','SYSTEM_SUGGESTED','IMPORTED','UNKNOWN')),
                disposition TEXT NOT NULL CHECK(disposition IN ('SUGGESTED','ACCEPTED','REJECTED')),
                review_state TEXT NOT NULL CHECK(review_state IN ('UNREVIEWED','PARTIALLY_REVIEWED','REVIEWED','NOT_RELEVANT')),
                source_suitability TEXT NOT NULL CHECK(source_suitability IN ('PEER_REVIEWED','INSTITUTIONAL','STANDARD_REGULATION','TEXTBOOK','COURSE_MATERIAL','MANUFACTURER_TECHNICAL','GOVERNMENT','NEWS','GENERAL_WEB','UNKNOWN')),
                stance TEXT NOT NULL CHECK(stance IN ('NOT_ASSESSED','AGREES','CONFLICTS','ALTERNATIVE','UNCERTAIN')),
                rationale TEXT,
                user_notes TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(artifact_id) REFERENCES stud_assignment_artifacts(id),
                CHECK((canonical_object_type IS NOT NULL AND canonical_object_id IS NOT NULL) OR artifact_id IS NOT NULL)
            );
            CREATE UNIQUE INDEX stud_topic_dossier_canonical_index ON stud_topic_dossier_items(topic_id,canonical_object_type,canonical_object_id) WHERE canonical_object_id IS NOT NULL;
            CREATE UNIQUE INDEX stud_topic_dossier_artifact_index ON stud_topic_dossier_items(topic_id,artifact_id) WHERE artifact_id IS NOT NULL;
            CREATE INDEX stud_topic_dossier_topic_index ON stud_topic_dossier_items(topic_id,disposition,review_state,updated_at DESC,id DESC);
            CREATE INDEX stud_topic_dossier_assignment_index ON stud_topic_dossier_items(assignment_id,updated_at DESC);

            CREATE TABLE stud_research_gaps (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                topic_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                gap_type TEXT NOT NULL CHECK(gap_type IN ('MISSING_SOURCE','UNANSWERED_QUESTION','INSUFFICIENT_PRIMARY_EVIDENCE','MISSING_DATASET','MISSING_EXPERIMENTAL_RESULT','MISSING_STANDARD','CONTRADICTORY_EVIDENCE','INACCESSIBLE_SOURCE','OCR_REQUIRED','HUMAN_CLARIFICATION','TEAM_DEPENDENCY','LABORATORY_DEPENDENCY','CUSTOM')),
                title TEXT NOT NULL,
                description TEXT,
                state TEXT NOT NULL CHECK(state IN ('OPEN','RESOLVED','DISMISSED')),
                question_id TEXT,
                requirement_item_id TEXT,
                blocker_id TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                resolved_at TEXT,
                resolution_note TEXT,
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(question_id) REFERENCES stud_research_questions(id),
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id),
                FOREIGN KEY(blocker_id) REFERENCES stud_workflow_blockers(id)
            );
            CREATE INDEX stud_research_gaps_topic_index ON stud_research_gaps(topic_id,state,updated_at DESC,id DESC);
            CREATE INDEX stud_research_gaps_assignment_index ON stud_research_gaps(assignment_id,state,updated_at DESC);

            ALTER TABLE stud_working_context ADD COLUMN active_research_plan_id TEXT REFERENCES stud_research_plans(id);
            ALTER TABLE stud_working_context ADD COLUMN active_research_topic_id TEXT REFERENCES stud_research_topics(id);
        `}, {version: 21, sql: `
            CREATE TABLE stud_claims (
                id TEXT PRIMARY KEY,
                claim_key TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                plan_id TEXT,
                topic_id TEXT,
                research_question_id TEXT,
                workflow_node_id TEXT,
                claim_text TEXT NOT NULL CHECK(length(claim_text) BETWEEN 1 AND 12000),
                claim_type TEXT NOT NULL CHECK(claim_type IN ('FACTUAL','ANALYTICAL','INTERPRETIVE','METHODOLOGICAL','DESIGN_ENGINEERING','QUANTITATIVE','COMPARATIVE','EVALUATIVE','CONCLUSION','RECOMMENDATION','LIMITATION','ASSUMPTION','OTHER','UNKNOWN')),
                origin TEXT NOT NULL CHECK(origin IN ('USER','DETERMINISTIC','AI_ASSISTED','IMPORTED','UNKNOWN')),
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','REVIEWED','SUPERSEDED','REJECTED','RETIRED')),
                revision INTEGER NOT NULL CHECK(revision >= 1),
                parent_claim_id TEXT,
                parent_semantic_claim_id TEXT,
                rationale TEXT,
                user_notes TEXT,
                claim_hash TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(research_question_id) REFERENCES stud_research_questions(id),
                FOREIGN KEY(workflow_node_id) REFERENCES stud_workflow_nodes(id),
                FOREIGN KEY(parent_claim_id) REFERENCES stud_claims(id),
                FOREIGN KEY(parent_semantic_claim_id) REFERENCES stud_claims(id),
                UNIQUE(claim_key, revision),
                CHECK((topic_id IS NULL) OR (plan_id IS NOT NULL)),
                CHECK((research_question_id IS NULL) OR (topic_id IS NOT NULL)),
                CHECK(parent_semantic_claim_id IS NULL OR parent_semantic_claim_id <> id)
            );
            CREATE UNIQUE INDEX stud_claims_draft_index ON stud_claims(claim_key) WHERE lifecycle='DRAFT';
            CREATE INDEX stud_claims_assignment_index ON stud_claims(assignment_id,lifecycle,updated_at DESC,id DESC);
            CREATE INDEX stud_claims_topic_index ON stud_claims(topic_id,lifecycle,updated_at DESC,id DESC);
            CREATE INDEX stud_claims_semantic_parent_index ON stud_claims(parent_semantic_claim_id,lifecycle,updated_at DESC);

            CREATE TABLE stud_claim_pointers (
                claim_key TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                current_reviewed_claim_id TEXT,
                current_draft_claim_id TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(current_reviewed_claim_id) REFERENCES stud_claims(id),
                FOREIGN KEY(current_draft_claim_id) REFERENCES stud_claims(id),
                CHECK(current_reviewed_claim_id IS NOT NULL OR current_draft_claim_id IS NOT NULL)
            );
            CREATE INDEX stud_claim_pointers_assignment_index ON stud_claim_pointers(assignment_id,updated_at DESC);

            CREATE TABLE stud_claim_requirements (
                claim_id TEXT NOT NULL,
                requirement_item_id TEXT NOT NULL,
                requirement_snapshot_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(claim_id, requirement_item_id),
                FOREIGN KEY(claim_id) REFERENCES stud_claims(id) ON DELETE CASCADE,
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id)
            );
            CREATE INDEX stud_claim_requirements_item_index ON stud_claim_requirements(requirement_item_id,claim_id);

            CREATE TABLE stud_evidence_records (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                plan_id TEXT,
                topic_id TEXT,
                dossier_item_id TEXT,
                source_object_type TEXT NOT NULL,
                source_object_id TEXT NOT NULL,
                artifact_id TEXT,
                citation_paper_id TEXT,
                location_type TEXT NOT NULL CHECK(location_type IN ('DOCUMENT_CHUNK','DOCUMENT_PAGE','DATASET_RANGE','NOTEBOOK_CELL','COMPUTE_RESULT','ARTIFACT_VERSION','SOURCE_RECORD','NOTE_SECTION','OTHER')),
                document_id TEXT,
                extraction_id TEXT,
                chunk_id TEXT,
                page_start INTEGER,
                page_end INTEGER,
                locator_json TEXT,
                excerpt TEXT,
                source_snapshot_hash TEXT NOT NULL,
                extraction_method TEXT,
                review_state TEXT NOT NULL CHECK(review_state IN ('UNREVIEWED','REVIEWED','REJECTED')),
                reviewer_note TEXT,
                origin TEXT NOT NULL CHECK(origin IN ('USER','IMPORTED','UNKNOWN')),
                evidence_hash TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(dossier_item_id) REFERENCES stud_topic_dossier_items(id),
                FOREIGN KEY(artifact_id) REFERENCES stud_assignment_artifacts(id),
                FOREIGN KEY(citation_paper_id) REFERENCES stud_research_papers(id),
                FOREIGN KEY(document_id) REFERENCES stud_academic_documents(id),
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id),
                FOREIGN KEY(chunk_id) REFERENCES stud_document_chunks(id),
                CHECK((topic_id IS NULL) OR (plan_id IS NOT NULL)),
                CHECK((page_start IS NULL AND page_end IS NULL) OR (page_start >= 1 AND page_end >= page_start))
            );
            CREATE INDEX stud_evidence_assignment_index ON stud_evidence_records(assignment_id,review_state,updated_at DESC,id DESC);
            CREATE INDEX stud_evidence_topic_index ON stud_evidence_records(topic_id,review_state,updated_at DESC,id DESC);
            CREATE INDEX stud_evidence_source_index ON stud_evidence_records(source_object_type,source_object_id,updated_at DESC);
            CREATE INDEX stud_evidence_chunk_index ON stud_evidence_records(chunk_id);

            CREATE TABLE stud_claim_evidence_links (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                claim_id TEXT NOT NULL,
                evidence_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL CHECK(relationship_type IN ('SUPPORTS','CONTRADICTS','QUALIFIES','CONTEXTUALISES','NOT_ASSESSED')),
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','REVIEWED','SUPERSEDED','REJECTED')),
                revision INTEGER NOT NULL CHECK(revision >= 1),
                parent_link_id TEXT,
                rationale TEXT,
                origin TEXT NOT NULL CHECK(origin IN ('USER','IMPORTED','UNKNOWN')),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(claim_id) REFERENCES stud_claims(id),
                FOREIGN KEY(evidence_id) REFERENCES stud_evidence_records(id),
                FOREIGN KEY(parent_link_id) REFERENCES stud_claim_evidence_links(id),
                UNIQUE(claim_id,evidence_id,revision)
            );
            CREATE UNIQUE INDEX stud_claim_evidence_draft_index ON stud_claim_evidence_links(claim_id,evidence_id) WHERE lifecycle='DRAFT';
            CREATE INDEX stud_claim_evidence_claim_index ON stud_claim_evidence_links(claim_id,lifecycle,updated_at DESC,id DESC);
            CREATE INDEX stud_claim_evidence_evidence_index ON stud_claim_evidence_links(evidence_id,lifecycle,updated_at DESC,id DESC);

            ALTER TABLE stud_working_context ADD COLUMN active_claim_id TEXT REFERENCES stud_claims(id);
            ALTER TABLE stud_working_context ADD COLUMN active_evidence_id TEXT REFERENCES stud_evidence_records(id);
        `}, {version: 22, sql: `
            CREATE TABLE stud_faculty_identities (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                course_id TEXT,
                display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 300),
                institution TEXT,
                department TEXT,
                observed_orcid TEXT,
                resolution_state TEXT NOT NULL CHECK(resolution_state IN ('CONFIRMED','PROBABLE','AMBIGUOUS','UNRESOLVED')),
                confirmed_provider TEXT,
                confirmed_provider_author_id TEXT,
                confirmed_orcid TEXT,
                confirmed_candidate_id TEXT,
                confirmation_note TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                confirmed_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(confirmed_candidate_id) REFERENCES stud_faculty_identity_candidates(id),
                UNIQUE(assignment_id, display_name, institution)
            );
            CREATE INDEX stud_faculty_identities_assignment_index ON stud_faculty_identities(assignment_id,resolution_state,updated_at DESC,id DESC);

            CREATE TABLE stud_faculty_observations (
                id TEXT PRIMARY KEY,
                faculty_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                course_id TEXT,
                role TEXT NOT NULL CHECK(role IN ('COURSE_LECTURER','MODULE_LEADER','ASSIGNMENT_AUTHOR','SUPERVISOR','TUTOR','TEACHING_TEAM','OTHER','UNKNOWN')),
                observed_name TEXT NOT NULL CHECK(length(observed_name) BETWEEN 1 AND 300),
                observed_institution TEXT,
                observed_department TEXT,
                source_type TEXT NOT NULL CHECK(source_type IN ('USER','COURSE_METADATA','ASSIGNMENT_METADATA','ACADEMIC_DOCUMENT','MOODLE_PROVENANCE')),
                source_object_type TEXT NOT NULL,
                source_object_id TEXT NOT NULL,
                document_id TEXT,
                extraction_id TEXT,
                chunk_id TEXT,
                page_start INTEGER,
                page_end INTEGER,
                excerpt TEXT,
                source_snapshot_hash TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(faculty_id) REFERENCES stud_faculty_identities(id) ON DELETE CASCADE,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(document_id) REFERENCES stud_academic_documents(id),
                FOREIGN KEY(extraction_id) REFERENCES stud_document_extractions(id),
                FOREIGN KEY(chunk_id) REFERENCES stud_document_chunks(id),
                CHECK((page_start IS NULL AND page_end IS NULL) OR (page_start >= 1 AND page_end >= page_start))
            );
            CREATE INDEX stud_faculty_observations_faculty_index ON stud_faculty_observations(faculty_id,observed_at DESC,id DESC);
            CREATE INDEX stud_faculty_observations_source_index ON stud_faculty_observations(source_object_type,source_object_id);

            CREATE TABLE stud_faculty_identity_candidates (
                id TEXT PRIMARY KEY,
                faculty_id TEXT NOT NULL,
                provider TEXT NOT NULL CHECK(provider IN ('OPENALEX')),
                provider_author_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                orcid TEXT,
                institutions_json TEXT NOT NULL,
                departments_json TEXT NOT NULL,
                topics_json TEXT NOT NULL,
                works_count INTEGER NOT NULL DEFAULT 0 CHECK(works_count >= 0),
                assessment TEXT NOT NULL CHECK(assessment IN ('PROBABLE','AMBIGUOUS','UNRESOLVED')),
                disposition TEXT NOT NULL CHECK(disposition IN ('PENDING','CONFIRMED','REJECTED','NO_MATCH')),
                reasons_json TEXT NOT NULL,
                provider_snapshot_hash TEXT NOT NULL,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                observed_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(faculty_id) REFERENCES stud_faculty_identities(id) ON DELETE CASCADE,
                UNIQUE(faculty_id,provider,provider_author_id)
            );
            CREATE INDEX stud_faculty_candidates_faculty_index ON stud_faculty_identity_candidates(faculty_id,disposition,assessment,updated_at DESC);

            CREATE TABLE stud_faculty_publication_candidates (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                topic_id TEXT NOT NULL,
                faculty_id TEXT NOT NULL,
                identity_candidate_id TEXT NOT NULL,
                provider TEXT NOT NULL CHECK(provider IN ('OPENALEX')),
                provider_work_id TEXT NOT NULL,
                doi TEXT,
                title TEXT NOT NULL,
                authors_json TEXT NOT NULL,
                publication_year INTEGER,
                venue TEXT,
                source_url TEXT,
                normalized_work_json TEXT NOT NULL,
                relevance_state TEXT NOT NULL CHECK(relevance_state IN ('RELEVANT','IRRELEVANT','UNRESOLVED')),
                disposition TEXT NOT NULL CHECK(disposition IN ('SUGGESTED','IMPORTED','DISMISSED')),
                matched_terms_json TEXT NOT NULL,
                reasons_json TEXT NOT NULL,
                provider_snapshot_hash TEXT NOT NULL,
                canonical_paper_id TEXT,
                dossier_item_id TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                observed_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(topic_id) REFERENCES stud_research_topics(id),
                FOREIGN KEY(faculty_id) REFERENCES stud_faculty_identities(id),
                FOREIGN KEY(identity_candidate_id) REFERENCES stud_faculty_identity_candidates(id),
                FOREIGN KEY(canonical_paper_id) REFERENCES stud_research_papers(id),
                FOREIGN KEY(dossier_item_id) REFERENCES stud_topic_dossier_items(id),
                UNIQUE(topic_id,faculty_id,provider,provider_work_id)
            );
            CREATE INDEX stud_faculty_publications_topic_index ON stud_faculty_publication_candidates(topic_id,relevance_state,disposition,updated_at DESC,id DESC);
            CREATE INDEX stud_faculty_publications_faculty_index ON stud_faculty_publication_candidates(faculty_id,updated_at DESC,id DESC);
        `}, {version: 23, sql: `
            CREATE TABLE stud_composition_plans (
                id TEXT PRIMARY KEY,
                plan_key TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                course_id TEXT,
                workflow_id TEXT,
                research_plan_id TEXT,
                requirements_contract_id TEXT NOT NULL,
                requirements_contract_revision INTEGER NOT NULL CHECK(requirements_contract_revision >= 1),
                requirements_contract_hash TEXT NOT NULL,
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','REVIEWED','SUPERSEDED')),
                revision INTEGER NOT NULL CHECK(revision >= 1),
                parent_plan_id TEXT,
                title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
                length_unit TEXT NOT NULL CHECK(length_unit IN ('WORDS','PAGES','SLIDES','MINUTES','ITEMS','OTHER')),
                authoritative_total REAL CHECK(authoritative_total IS NULL OR authoritative_total >= 0),
                user_planned_total REAL CHECK(user_planned_total IS NULL OR user_planned_total >= 0),
                total_source TEXT NOT NULL CHECK(total_source IN ('REQUIREMENTS_CONTRACT','USER_PLAN','NONE')),
                origin TEXT NOT NULL CHECK(origin IN ('USER','REQUIREMENT_PROPOSAL')),
                user_notes TEXT,
                plan_hash TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(workflow_id) REFERENCES stud_workflow_instances(id),
                FOREIGN KEY(research_plan_id) REFERENCES stud_research_plans(id),
                FOREIGN KEY(requirements_contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(parent_plan_id) REFERENCES stud_composition_plans(id),
                UNIQUE(plan_key,revision)
            );
            CREATE UNIQUE INDEX stud_composition_plans_draft_index ON stud_composition_plans(assignment_id) WHERE lifecycle='DRAFT';
            CREATE INDEX stud_composition_plans_assignment_index ON stud_composition_plans(assignment_id,lifecycle,updated_at DESC,id DESC);

            CREATE TABLE stud_assignment_composition_plans (
                assignment_id TEXT PRIMARY KEY,
                current_reviewed_plan_id TEXT,
                current_draft_plan_id TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(current_reviewed_plan_id) REFERENCES stud_composition_plans(id),
                FOREIGN KEY(current_draft_plan_id) REFERENCES stud_composition_plans(id),
                CHECK(current_reviewed_plan_id IS NOT NULL OR current_draft_plan_id IS NOT NULL)
            );

            CREATE TABLE stud_composition_sections (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                parent_section_id TEXT,
                title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
                purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 1 AND 12000),
                section_order INTEGER NOT NULL CHECK(section_order >= 0),
                depth INTEGER NOT NULL CHECK(depth BETWEEN 0 AND 4),
                planned_length REAL CHECK(planned_length IS NULL OR planned_length >= 0),
                length_unit TEXT NOT NULL CHECK(length_unit IN ('WORDS','PAGES','SLIDES','MINUTES','ITEMS','OTHER')),
                origin TEXT NOT NULL CHECK(origin IN ('USER','REQUIREMENT_PROPOSAL','CLAIM_REVIEW_PROPOSAL')),
                origin_reason TEXT NOT NULL,
                notes TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES stud_composition_plans(id) ON DELETE CASCADE,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(parent_section_id) REFERENCES stud_composition_sections(id),
                UNIQUE(plan_id,section_order,id),
                CHECK(parent_section_id IS NULL OR parent_section_id <> id)
            );
            CREATE INDEX stud_composition_sections_plan_index ON stud_composition_sections(plan_id,section_order,id);
            CREATE INDEX stud_composition_sections_parent_index ON stud_composition_sections(parent_section_id,section_order,id);

            CREATE TABLE stud_composition_requirement_coverage (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                section_id TEXT,
                requirement_item_id TEXT NOT NULL,
                requirement_snapshot_hash TEXT NOT NULL,
                disposition TEXT NOT NULL CHECK(disposition IN ('ASSIGNED','EXCLUDED')),
                reason TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES stud_composition_plans(id) ON DELETE CASCADE,
                FOREIGN KEY(section_id) REFERENCES stud_composition_sections(id) ON DELETE CASCADE,
                FOREIGN KEY(requirement_item_id) REFERENCES stud_requirement_items(id),
                UNIQUE(plan_id,requirement_item_id,section_id),
                CHECK((disposition='ASSIGNED' AND section_id IS NOT NULL) OR (disposition='EXCLUDED' AND section_id IS NULL AND reason IS NOT NULL))
            );
            CREATE INDEX stud_composition_requirement_plan_index ON stud_composition_requirement_coverage(plan_id,requirement_item_id,disposition);
            CREATE INDEX stud_composition_requirement_section_index ON stud_composition_requirement_coverage(section_id,requirement_item_id);

            CREATE TABLE stud_composition_section_claims (
                section_id TEXT NOT NULL,
                claim_id TEXT NOT NULL,
                placement_order INTEGER NOT NULL DEFAULT 0 CHECK(placement_order >= 0),
                rationale TEXT,
                created_at TEXT NOT NULL,
                PRIMARY KEY(section_id,claim_id),
                FOREIGN KEY(section_id) REFERENCES stud_composition_sections(id) ON DELETE CASCADE,
                FOREIGN KEY(claim_id) REFERENCES stud_claims(id)
            );
            CREATE INDEX stud_composition_claim_index ON stud_composition_section_claims(claim_id,section_id);

            CREATE TABLE stud_composition_section_evidence (
                section_id TEXT NOT NULL,
                evidence_id TEXT NOT NULL,
                intended_use TEXT,
                created_at TEXT NOT NULL,
                PRIMARY KEY(section_id,evidence_id),
                FOREIGN KEY(section_id) REFERENCES stud_composition_sections(id) ON DELETE CASCADE,
                FOREIGN KEY(evidence_id) REFERENCES stud_evidence_records(id)
            );
            CREATE INDEX stud_composition_evidence_index ON stud_composition_section_evidence(evidence_id,section_id);

            CREATE TABLE stud_draft_documents (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                course_id TEXT,
                composition_plan_id TEXT NOT NULL,
                composition_plan_revision INTEGER NOT NULL CHECK(composition_plan_revision >= 1),
                composition_plan_hash TEXT NOT NULL,
                requirements_contract_id TEXT NOT NULL,
                requirements_contract_revision INTEGER NOT NULL CHECK(requirements_contract_revision >= 1),
                requirements_contract_hash TEXT NOT NULL,
                title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('ACTIVE','ARCHIVED')),
                current_version_id TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(course_id) REFERENCES stud_courses(id),
                FOREIGN KEY(composition_plan_id) REFERENCES stud_composition_plans(id),
                FOREIGN KEY(requirements_contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(current_version_id) REFERENCES stud_draft_versions(id),
                UNIQUE(assignment_id,composition_plan_id,title)
            );
            CREATE INDEX stud_draft_documents_assignment_index ON stud_draft_documents(assignment_id,lifecycle,updated_at DESC,id DESC);

            CREATE TABLE stud_draft_versions (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                assignment_id TEXT NOT NULL,
                version_number INTEGER NOT NULL CHECK(version_number >= 1),
                parent_version_id TEXT,
                origin TEXT NOT NULL CHECK(origin IN ('USER','LOCAL_AI','IMPORTED','REVISION','OTHER')),
                change_reason TEXT,
                content_hash TEXT NOT NULL,
                total_length REAL NOT NULL DEFAULT 0 CHECK(total_length >= 0),
                length_unit TEXT NOT NULL CHECK(length_unit IN ('WORDS','PAGES','SLIDES','MINUTES','ITEMS','OTHER')),
                created_at TEXT NOT NULL,
                FOREIGN KEY(draft_id) REFERENCES stud_draft_documents(id) ON DELETE CASCADE,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(parent_version_id) REFERENCES stud_draft_versions(id),
                UNIQUE(draft_id,version_number)
            );
            CREATE INDEX stud_draft_versions_document_index ON stud_draft_versions(draft_id,version_number DESC,id DESC);

            CREATE TABLE stud_draft_section_versions (
                id TEXT PRIMARY KEY,
                draft_version_id TEXT NOT NULL,
                draft_id TEXT NOT NULL,
                section_id TEXT NOT NULL,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                measured_length REAL NOT NULL DEFAULT 0 CHECK(measured_length >= 0),
                created_at TEXT NOT NULL,
                FOREIGN KEY(draft_version_id) REFERENCES stud_draft_versions(id) ON DELETE CASCADE,
                FOREIGN KEY(draft_id) REFERENCES stud_draft_documents(id) ON DELETE CASCADE,
                FOREIGN KEY(section_id) REFERENCES stud_composition_sections(id),
                UNIQUE(draft_version_id,section_id)
            );
            CREATE INDEX stud_draft_section_version_index ON stud_draft_section_versions(draft_version_id,section_id);

            ALTER TABLE stud_working_context ADD COLUMN active_composition_plan_id TEXT REFERENCES stud_composition_plans(id);
            ALTER TABLE stud_working_context ADD COLUMN active_composition_section_id TEXT REFERENCES stud_composition_sections(id);
            ALTER TABLE stud_working_context ADD COLUMN active_draft_document_id TEXT REFERENCES stud_draft_documents(id);
            ALTER TABLE stud_working_context ADD COLUMN active_draft_version_id TEXT REFERENCES stud_draft_versions(id);
        `}, {version: 24, sql: `
            CREATE TABLE stud_humanisation_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
                genre TEXT NOT NULL CHECK(genre IN ('ACADEMIC_ESSAY','TECHNICAL_REPORT','LAB_REPORT','REFLECTIVE_WRITING','CASE_ANALYSIS','RESEARCH_REPORT','PRESENTATION_SCRIPT','CUSTOM')),
                lifecycle TEXT NOT NULL CHECK(lifecycle IN ('ACTIVE','ARCHIVED')),
                current_revision_id TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(current_revision_id) REFERENCES stud_humanisation_profile_revisions(id)
            );
            CREATE INDEX stud_humanisation_profiles_state_index ON stud_humanisation_profiles(lifecycle,updated_at DESC,id DESC);

            CREATE TABLE stud_humanisation_profile_revisions (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision >= 1),
                origin TEXT NOT NULL CHECK(origin IN ('USER_CONFIGURED','USER_WRITING_SAMPLES','GENRE_DEFAULT','IMPORT_OTHER')),
                preferences_json TEXT NOT NULL,
                preferred_phrases_json TEXT NOT NULL,
                avoided_phrases_json TEXT NOT NULL,
                custom_notes TEXT,
                fingerprint_json TEXT NOT NULL,
                profile_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(profile_id) REFERENCES stud_humanisation_profiles(id) ON DELETE CASCADE,
                UNIQUE(profile_id,revision)
            );
            CREATE INDEX stud_humanisation_profile_revisions_index ON stud_humanisation_profile_revisions(profile_id,revision DESC,id DESC);

            CREATE TABLE stud_humanisation_writing_samples (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                source_type TEXT NOT NULL CHECK(source_type IN ('MANUAL_TEXT','CANONICAL_NOTE','CANONICAL_DRAFT','CANONICAL_DOCUMENT')),
                canonical_object_type TEXT,
                canonical_object_id TEXT,
                authorship TEXT NOT NULL CHECK(authorship IN ('USER_CONFIRMED','UNKNOWN')),
                genre TEXT NOT NULL CHECK(genre IN ('ACADEMIC_ESSAY','TECHNICAL_REPORT','LAB_REPORT','REFLECTIVE_WRITING','CASE_ANALYSIS','RESEARCH_REPORT','PRESENTATION_SCRIPT','CUSTOM')),
                label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 240),
                text_snapshot TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('ACTIVE','REMOVED')),
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(profile_id) REFERENCES stud_humanisation_profiles(id) ON DELETE CASCADE,
                CHECK((canonical_object_type IS NULL AND canonical_object_id IS NULL) OR (canonical_object_type IS NOT NULL AND canonical_object_id IS NOT NULL))
            );
            CREATE INDEX stud_humanisation_samples_profile_index ON stud_humanisation_writing_samples(profile_id,state,updated_at DESC,id DESC);

            CREATE TABLE stud_humanisation_sessions (
                id TEXT PRIMARY KEY,
                assignment_id TEXT NOT NULL,
                draft_id TEXT NOT NULL,
                source_draft_version_id TEXT NOT NULL,
                source_content_hash TEXT NOT NULL,
                composition_plan_id TEXT NOT NULL,
                composition_plan_revision INTEGER NOT NULL CHECK(composition_plan_revision >= 1),
                composition_plan_hash TEXT NOT NULL,
                requirements_contract_id TEXT NOT NULL,
                requirements_contract_revision INTEGER NOT NULL CHECK(requirements_contract_revision >= 1),
                requirements_contract_hash TEXT NOT NULL,
                profile_id TEXT NOT NULL,
                profile_revision_id TEXT NOT NULL,
                profile_hash TEXT NOT NULL,
                scope TEXT NOT NULL CHECK(scope IN ('SECTION','SELECTED_SECTIONS','FULL_DRAFT')),
                goals_json TEXT NOT NULL,
                editorial_note TEXT,
                state TEXT NOT NULL CHECK(state IN ('CREATED','RUNNING','CANDIDATE_READY','NEEDS_REVIEW','ACCEPTED','REJECTED','FAILED','CANCELLED')),
                runtime TEXT,
                model TEXT,
                capability_state TEXT,
                run_id TEXT,
                candidate_hash TEXT,
                integrity_state TEXT NOT NULL CHECK(integrity_state IN ('PENDING','PASS','CONFLICT','REVIEW_REQUIRED')),
                decision TEXT CHECK(decision IS NULL OR decision IN ('ACCEPT_ALL','ACCEPT_SELECTED_SECTIONS','REJECT_ALL')),
                resulting_draft_version_id TEXT,
                error_summary TEXT,
                row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finished_at TEXT,
                FOREIGN KEY(assignment_id) REFERENCES stud_assignments(id),
                FOREIGN KEY(draft_id) REFERENCES stud_draft_documents(id),
                FOREIGN KEY(source_draft_version_id) REFERENCES stud_draft_versions(id),
                FOREIGN KEY(composition_plan_id) REFERENCES stud_composition_plans(id),
                FOREIGN KEY(requirements_contract_id) REFERENCES stud_requirement_contracts(id),
                FOREIGN KEY(profile_id) REFERENCES stud_humanisation_profiles(id),
                FOREIGN KEY(profile_revision_id) REFERENCES stud_humanisation_profile_revisions(id),
                FOREIGN KEY(run_id) REFERENCES stud_operation_runs(id),
                FOREIGN KEY(resulting_draft_version_id) REFERENCES stud_draft_versions(id)
            );
            CREATE INDEX stud_humanisation_sessions_assignment_index ON stud_humanisation_sessions(assignment_id,updated_at DESC,id DESC);
            CREATE INDEX stud_humanisation_sessions_draft_index ON stud_humanisation_sessions(draft_id,updated_at DESC,id DESC);

            CREATE TABLE stud_humanisation_session_sections (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                section_id TEXT NOT NULL,
                section_order INTEGER NOT NULL CHECK(section_order >= 0),
                source_content_hash TEXT NOT NULL,
                protected_spans_json TEXT NOT NULL,
                candidate_content TEXT,
                candidate_content_hash TEXT,
                integrity_state TEXT NOT NULL CHECK(integrity_state IN ('PENDING','PASS','CONFLICT','REVIEW_REQUIRED')),
                editorial_categories_json TEXT NOT NULL,
                decision TEXT NOT NULL CHECK(decision IN ('PENDING','ACCEPTED','REJECTED')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES stud_humanisation_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY(section_id) REFERENCES stud_composition_sections(id),
                UNIQUE(session_id,section_id)
            );
            CREATE INDEX stud_humanisation_session_sections_index ON stud_humanisation_session_sections(session_id,section_order,id);

            CREATE TABLE stud_humanisation_integrity_checks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                section_id TEXT,
                check_type TEXT NOT NULL CHECK(check_type IN ('CITATIONS','NUMBERS_UNITS','QUOTATIONS','EQUATIONS','URL_IDENTIFIERS','PROTECTED_TERMS','CLAIMS','EVIDENCE_LINKS')),
                state TEXT NOT NULL CHECK(state IN ('PASS','CONFLICT','REVIEW_REQUIRED','NOT_APPLICABLE')),
                source_values_json TEXT NOT NULL,
                candidate_values_json TEXT NOT NULL,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES stud_humanisation_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY(section_id) REFERENCES stud_composition_sections(id)
            );
            CREATE INDEX stud_humanisation_checks_session_index ON stud_humanisation_integrity_checks(session_id,section_id,check_type);

            ALTER TABLE stud_working_context ADD COLUMN active_humanisation_profile_id TEXT REFERENCES stud_humanisation_profiles(id);
            ALTER TABLE stud_working_context ADD COLUMN active_humanisation_session_id TEXT REFERENCES stud_humanisation_sessions(id);
            ALTER TABLE stud_draft_versions ADD COLUMN humanisation_session_id TEXT REFERENCES stud_humanisation_sessions(id);
            ALTER TABLE stud_draft_versions ADD COLUMN humanisation_profile_revision_id TEXT REFERENCES stud_humanisation_profile_revisions(id);
        `}];
        for (const migration of migrations) {
            if (applied.has(migration.version)) continue;
            try {
                this.db.exec("BEGIN IMMEDIATE;");
                this.db.exec(migration.sql);
                this.db.prepare("INSERT INTO stud_schema_migrations (version, applied_at, application_version) VALUES (?, ?, ?)")
                    .run(migration.version, Model.now(), this.applicationVersion);
                this.db.exec("COMMIT;");
            } catch (error) {
                try { this.db.exec("ROLLBACK;"); } catch (rollbackError) {}
                throw new Model.StudError("MIGRATION_FAILED", `Academic schema migration ${migration.version} failed safely.`, {version: migration.version, cause: error.message});
            }
        }
    }

    schemaInfo() {
        this.initialize();
        const row = this.db.prepare("SELECT MAX(version) AS version FROM stud_schema_migrations").get();
        return Object.freeze({version: row && row.version || 0, dbPathPolicy: "userData/stud/academic.sqlite", journalMode: "WAL"});
    }

    listToolPreferences() {
        this.initialize();
        return Object.freeze(this.db.prepare("SELECT * FROM stud_tool_preferences ORDER BY pinned DESC, favorite DESC, updated_at DESC LIMIT 1000").all().map(row => Object.freeze(rowToCamel(row))));
    }

    updateToolPreference(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["toolId", "favorite", "hidden", "pinned", "markUsed"], "Tool preference");
        const toolId = Model.safeId(input.toolId, "Tool ID");
        if (!ToolCatalog.getEntry(toolId)) throw new Model.StudError("INVALID_INPUT", "Tool preference references an unknown catalog entry.");
        const bool = (value, label) => {
            if (value === undefined) return undefined;
            if (typeof value !== "boolean") throw new Model.StudError("INVALID_INPUT", `${label} must be boolean.`);
            return value;
        };
        const current = this.db.prepare("SELECT * FROM stud_tool_preferences WHERE tool_id=?").get(toolId) || {};
        const favorite = bool(input.favorite, "Favorite");
        const hidden = bool(input.hidden, "Hidden");
        const pinned = bool(input.pinned, "Pinned");
        const markUsed = bool(input.markUsed, "Mark used");
        const timestamp = Model.now();
        const next = {
            favorite: favorite === undefined ? Number(current.favorite || 0) : Number(favorite),
            hidden: hidden === undefined ? Number(current.hidden || 0) : Number(hidden),
            pinned: pinned === undefined ? Number(current.pinned || 0) : Number(pinned),
            usedAt: markUsed === true ? timestamp : current.used_at || null
        };
        this.db.prepare(`INSERT INTO stud_tool_preferences (tool_id,favorite,hidden,pinned,used_at,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?) ON CONFLICT(tool_id) DO UPDATE SET favorite=excluded.favorite,hidden=excluded.hidden,pinned=excluded.pinned,used_at=excluded.used_at,updated_at=excluded.updated_at`)
            .run(toolId, next.favorite, next.hidden, next.pinned, next.usedAt, current.created_at || timestamp, timestamp);
        return Object.freeze(rowToCamel(this.db.prepare("SELECT * FROM stud_tool_preferences WHERE tool_id=?").get(toolId)));
    }

    resetToolPreferences() {
        this.initialize();
        const result = this.db.prepare("DELETE FROM stud_tool_preferences").run();
        return Object.freeze({reset: true, removed: Number(result.changes || 0)});
    }

    listDisciplineProfile() {
        this.initialize();
        return Object.freeze(this.db.prepare("SELECT discipline,profile_rank FROM stud_discipline_profile ORDER BY profile_rank ASC LIMIT 100").all().map(row => Object.freeze({discipline: row.discipline, rank: Number(row.profile_rank)})));
    }

    replaceDisciplineProfile(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["disciplines"], "Discipline profile");
        if (!Array.isArray(input.disciplines) || input.disciplines.length > 20) throw new Model.StudError("INVALID_INPUT", "Discipline profile must contain up to twenty explicit disciplines.");
        const disciplines = [...new Set(input.disciplines.map(value => String(value || "").trim().toUpperCase()))];
        if (disciplines.some(value => !ToolCatalog.DISCIPLINES.includes(value))) throw new Model.StudError("INVALID_INPUT", "Discipline profile contains an unknown discipline.");
        const timestamp = Model.now();
        this.db.exec("BEGIN IMMEDIATE;");
        try {
            this.db.prepare("DELETE FROM stud_discipline_profile").run();
            const insert = this.db.prepare("INSERT INTO stud_discipline_profile (discipline,profile_rank,created_at,updated_at) VALUES (?,?,?,?)");
            disciplines.forEach((discipline, index) => insert.run(discipline, index + 1, timestamp, timestamp));
            this.db.exec("COMMIT;");
        } catch (error) {
            try { this.db.exec("ROLLBACK;"); } catch (rollbackError) {}
            throw error;
        }
        return this.listDisciplineProfile();
    }

    listProviderInstances(providerType = null) {
        this.initialize();
        const rows = providerType
            ? this.db.prepare("SELECT * FROM stud_provider_instances WHERE provider_type = ? ORDER BY updated_at DESC").all(String(providerType).toUpperCase())
            : this.db.prepare("SELECT * FROM stud_provider_instances ORDER BY updated_at DESC").all();
        return Object.freeze(rows.map(row => Object.freeze({...rowToCamel(row), capabilities: Object.freeze(parseJson(row.capabilities_json, {}))})));
    }

    getProviderInstance(id) {
        this.initialize();
        const row = this.db.prepare("SELECT * FROM stud_provider_instances WHERE id = ?").get(Model.safeId(id, "Provider ID"));
        return row ? Object.freeze({...rowToCamel(row), capabilities: Object.freeze(parseJson(row.capabilities_json, {}))}) : null;
    }

    saveProviderInstance(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["id", "providerType", "displayName", "baseUrl", "status", "capabilities", "lastSuccessfulSync", "lastAttempt", "lastErrorCode"], "Provider instance");
        const id = Model.safeId(input.id, "Provider ID");
        const providerType = Model.requiredText(input.providerType, "Provider type", 64).toUpperCase();
        const displayName = Model.requiredText(input.displayName, "Provider display name", 160);
        const baseUrl = Model.requiredText(input.baseUrl, "Provider base URL", 1024);
        const status = Model.requiredText(input.status, "Provider status", 64).toUpperCase();
        const capabilities = input.capabilities && typeof input.capabilities === "object" && !Array.isArray(input.capabilities) ? input.capabilities : {};
        const lastSuccessfulSync = input.lastSuccessfulSync || null;
        const lastAttempt = input.lastAttempt || null;
        const lastErrorCode = input.lastErrorCode || null;
        const current = this.getProviderInstance(id);
        const timestamp = Model.now();
        this.db.prepare(`INSERT INTO stud_provider_instances (id,provider_type,display_name,base_url,status,capabilities_json,last_successful_sync,last_attempt,last_error_code,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET provider_type=excluded.provider_type,display_name=excluded.display_name,base_url=excluded.base_url,status=excluded.status,capabilities_json=excluded.capabilities_json,last_successful_sync=excluded.last_successful_sync,last_attempt=excluded.last_attempt,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at`)
            .run(id, providerType, displayName, baseUrl, status, JSON.stringify(capabilities), lastSuccessfulSync, lastAttempt, lastErrorCode, current && current.createdAt || timestamp, timestamp);
        return this.getProviderInstance(id);
    }

    getProviderSyncPreference(providerId) {
        this.initialize();
        const id = Model.safeId(providerId, "Provider ID");
        const row = this.db.prepare("SELECT * FROM stud_provider_sync_preferences WHERE provider_id=?").get(id);
        return Object.freeze({providerId: id, automaticSync: Boolean(row && row.automatic_sync), intervalMinutes: Number(row && row.interval_minutes) || 360, nextSyncAt: row && row.next_sync_at || null, lastResult: Object.freeze(parseJson(row && row.last_result_json, {})), updatedAt: row && row.updated_at || null});
    }

    saveProviderSyncPreference(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["providerId", "automaticSync", "intervalMinutes", "nextSyncAt", "lastResult"], "Provider sync preference");
        const providerId = Model.safeId(input.providerId, "Provider ID");
        if (!this.getProviderInstance(providerId)) throw new Model.StudError("NOT_FOUND", "Provider instance does not exist.");
        const previous = this.getProviderSyncPreference(providerId);
        const automaticSync = input.automaticSync === undefined ? previous.automaticSync : Boolean(input.automaticSync);
        const intervalMinutes = input.intervalMinutes === undefined ? previous.intervalMinutes : Math.max(15, Math.min(Number(input.intervalMinutes) || 360, 24 * 60));
        const nextSyncAt = input.nextSyncAt === undefined ? previous.nextSyncAt : (input.nextSyncAt ? Model.optionalDate(input.nextSyncAt, "Next sync time") : null);
        const lastResult = input.lastResult === undefined ? previous.lastResult : (input.lastResult && typeof input.lastResult === "object" && !Array.isArray(input.lastResult) ? input.lastResult : {});
        const serialized = JSON.stringify(lastResult);
        if (Buffer.byteLength(serialized, "utf8") > 8192) throw new Model.StudError("PAYLOAD_TOO_LARGE", "Provider sync result is too large.");
        this.db.prepare(`INSERT INTO stud_provider_sync_preferences (provider_id,automatic_sync,interval_minutes,next_sync_at,last_result_json,updated_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET automatic_sync=excluded.automatic_sync,interval_minutes=excluded.interval_minutes,next_sync_at=excluded.next_sync_at,last_result_json=excluded.last_result_json,updated_at=excluded.updated_at`)
            .run(providerId, automaticSync ? 1 : 0, intervalMinutes, automaticSync ? nextSyncAt : null, serialized, Model.now());
        return this.getProviderSyncPreference(providerId);
    }

    providerFieldCanUpdate(entityType, entityId, field, currentValue) {
        if (currentValue === null || currentValue === undefined || currentValue === "") return true;
        const latest = this.db.prepare("SELECT source_type FROM stud_provenance_records WHERE entity_type=? AND entity_id=? AND field=? ORDER BY observed_at DESC, created_at DESC LIMIT 1").get(entityType, entityId, field);
        return !latest || latest.source_type !== "USER";
    }

    recordProviderObservation(entityType, entityId, field, value, sourceType, sourceId, metadata = {}) {
        const prior = this.db.prepare("SELECT observed_value, source_type, source_id FROM stud_provenance_records WHERE entity_type=? AND entity_id=? AND field=? ORDER BY observed_at DESC, created_at DESC LIMIT 1").get(entityType, entityId, field);
        const observedValue = value === null || value === undefined ? null : String(value);
        if (prior && prior.observed_value === observedValue && prior.source_type === sourceType && prior.source_id === sourceId) return;
        this.createProvenance({entityType, entityId, field, observedValue, sourceType, sourceId, sourceAuthority: "AUTHORITATIVE", observedAt: Model.now(), metadata});
    }

    providerObservationChanged(entityType, entityId, field, value, sourceType, sourceId) {
        const prior = this.db.prepare("SELECT observed_value FROM stud_provenance_records WHERE entity_type=? AND entity_id=? AND field=? AND source_type=? AND source_id=? ORDER BY observed_at DESC, created_at DESC LIMIT 1").get(entityType, entityId, field, sourceType, sourceId);
        const observedValue = value === null || value === undefined ? null : String(value);
        return !prior || prior.observed_value !== observedValue;
    }

    upsertProviderEntity(entityType, namespace, externalId, sourceType, sourceId, value, fieldNames, metadata = {}) {
        const existingIdentifier = this.findByExternalIdentifier(namespace, externalId)[0];
        let entity;
        if (existingIdentifier) {
            entity = this.getEntity(entityType, existingIdentifier.entityId, true);
            if (!entity) throw new Model.StudError("NOT_FOUND", "Provider identifier points to a missing academic object.");
            const updates = {};
            fieldNames.forEach(field => { if (Object.prototype.hasOwnProperty.call(value, field) && this.providerFieldCanUpdate(entityType, entity.id, field, entity[field])) updates[field] = value[field]; });
            if (Object.keys(updates).length) entity = this.updateEntity(entityType, entity.id, updates);
        } else {
            entity = this.createEntity(entityType, value);
            this.createExternalIdentifier({entityType, entityId: entity.id, namespace, externalId, source: sourceType});
        }
        fieldNames.forEach(field => {
            if (Object.prototype.hasOwnProperty.call(value, field)) this.recordProviderObservation(entityType, entity.id, field, value[field], sourceType, sourceId, metadata);
        });
        return entity;
    }

    syncMoodleObservations(provider, payload) {
        this.initialize();
        const providerId = Model.safeId(provider.id, "Provider ID");
        const courses = Array.isArray(payload.courses) ? payload.courses : [];
        const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
        const resources = Array.isArray(payload.resources) ? payload.resources : [];
        const completion = Array.isArray(payload.completion) ? payload.completion : [];
        const sourceType = payload.sourceType === "MOODLE_ICS" ? "MOODLE_ICS" : "MOODLE";
        const courseIds = new Map();
        const assignmentIds = new Map();
        const results = {courses: 0, assignments: 0, resources: 0, newCourses: 0, updatedCourses: 0, newAssignments: 0, updatedAssignments: 0, newResources: 0, updatedResources: 0, conflicts: 0};
        courses.slice(0, 100).forEach(raw => {
                const {moodleId, uid, ...courseInput} = raw;
                const value = Model.normalizeByEntityType("COURSE", courseInput);
                const external = String(moodleId || uid);
                const fields = ["title", "shortName", "code", "description", "startDate", "endDate", "status"];
                const prior = this.findByExternalIdentifier(`${sourceType}_COURSE:${providerId}`, external)[0];
                const priorEntity = prior && this.getEntity("COURSE", prior.entityId, true);
                const changed = priorEntity && fields.some(field => Object.prototype.hasOwnProperty.call(value, field) && this.providerObservationChanged("COURSE", priorEntity.id, field, value[field], sourceType, `course:${external}`));
                const entity = this.upsertProviderEntity("COURSE", `${sourceType}_COURSE:${providerId}`, external, sourceType, `course:${external}`, value, fields, {providerId, capability: "COURSES"});
                if (!priorEntity) results.newCourses += 1; else if (changed) results.updatedCourses += 1;
                courseIds.set(external, entity.id); results.courses += 1;
        });
        assignments.slice(0, 1000).forEach(raw => {
                const courseId = courseIds.get(String(raw.courseMoodleId || "")) || null;
                const {moodleId, uid, courseMoodleId, url, ...assignmentInput} = raw;
                const value = Model.normalizeByEntityType("ASSIGNMENT", {...assignmentInput, courseId});
                const external = String(moodleId || uid);
                const fields = ["title", "description", "releaseDate", "dueDate", "cutoffDate", "status", "submissionStatus", "submittedAt", "grade", "gradeMaximum", "weight", "feedback"];
                const prior = this.findByExternalIdentifier(`${sourceType}_ASSIGNMENT:${providerId}`, external)[0];
                const priorEntity = prior && this.getEntity("ASSIGNMENT", prior.entityId, true);
                const changed = priorEntity && fields.some(field => Object.prototype.hasOwnProperty.call(value, field) && this.providerObservationChanged("ASSIGNMENT", priorEntity.id, field, value[field], sourceType, `assignment:${external}`));
                const entity = this.upsertProviderEntity("ASSIGNMENT", `${sourceType}_ASSIGNMENT:${providerId}`, external, sourceType, `assignment:${external}`, value, fields, {providerId, capability: payload.sourceType === "MOODLE_ICS" ? "CALENDAR" : "ASSIGNMENTS"});
                if (!priorEntity) results.newAssignments += 1; else if (changed) results.updatedAssignments += 1;
                assignmentIds.set(external, entity.id); results.assignments += 1;
        });
        resources.slice(0, 5000).forEach(raw => {
                const courseId = courseIds.get(String(raw.courseMoodleId || "")) || null;
                const assignmentId = assignmentIds.get(String(raw.assignmentMoodleId || "")) || null;
                // downloadUrl/fileSize are transient adapter-only values. They
                // must never become canonical metadata: an authenticated file
                // URL may carry access material and size is revalidated locally
                // when the bytes are actually received.
                const {moodleId, uid, courseMoodleId, assignmentMoodleId, moduleContext, downloadUrl, fileSize, contentHash, ...resourceInput} = raw;
                const providerVersion = /^[a-f0-9]{32,128}$/i.test(String(contentHash || "")) ? String(contentHash).toLowerCase() : null;
                const value = Model.normalizeByEntityType("RESOURCE", {...resourceInput, courseId, assignmentId});
                const external = String(moodleId || uid);
                const fields = ["type", "title", "url", "localReference", "mimeType", "checksum"];
                const prior = this.findByExternalIdentifier(`${sourceType}_RESOURCE:${providerId}`, external)[0];
                const priorEntity = prior && this.getEntity("RESOURCE", prior.entityId, true);
                const changed = priorEntity && (fields.some(field => Object.prototype.hasOwnProperty.call(value, field) && this.providerObservationChanged("RESOURCE", priorEntity.id, field, value[field], sourceType, `resource:${external}`)) || (providerVersion && this.providerObservationChanged("RESOURCE", priorEntity.id, "providerVersion", providerVersion, sourceType, `resource:${external}`)));
                const entity = this.upsertProviderEntity("RESOURCE", `${sourceType}_RESOURCE:${providerId}`, external, sourceType, `resource:${external}`, value, fields, {providerId, capability: "RESOURCES", moduleContext: moduleContext || null, providerFileSize: Number.isFinite(Number(fileSize)) ? Number(fileSize) : null});
                if (providerVersion) this.recordProviderObservation("RESOURCE", entity.id, "providerVersion", providerVersion, sourceType, `resource:${external}`, {providerId, capability: "FILES", kind: "MOODLE_CONTENT_HASH"});
                if (!priorEntity) results.newResources += 1; else if (changed) results.updatedResources += 1;
                results.resources += 1;
        });
        completion.slice(0, 100).forEach(item => {
            const courseId = courseIds.get(String(item.courseMoodleId || ""));
            if (!courseId) return;
            const summary = JSON.stringify(item.value || {}).slice(0, Model.LIMITS.content);
            this.recordProviderObservation("COURSE", courseId, "moodleCompletion", summary, sourceType, `completion:${item.courseMoodleId}`, {providerId, capability: "COMPLETION"});
        });
        return Object.freeze(results);
    }

    transaction(work) {
        this.initialize();
        if (this.transactionDepth > 0) return work();
        try {
            this.transactionDepth += 1;
            this.db.exec("BEGIN IMMEDIATE;");
            const value = work();
            this.db.exec("COMMIT;");
            return value;
        } catch (error) {
            try { this.db.exec("ROLLBACK;"); } catch (rollbackError) {}
            throw error;
        } finally {
            this.transactionDepth = Math.max(0, this.transactionDepth - 1);
        }
    }

    tableFor(type) { return TABLES[Model.validateEntityType(type)]; }

    entityExists(type, id, includeArchived = false) {
        if (type === "EXTERNAL_IDENTIFIER") {
            return Boolean(this.db.prepare("SELECT id FROM stud_external_identifiers WHERE id = ?").get(id));
        }
        const table = this.tableFor(type);
        const clause = includeArchived ? "" : " AND archived_at IS NULL";
        return Boolean(this.db.prepare(`SELECT id FROM ${table} WHERE id = ?${clause}`).get(id));
    }

    requireEntity(type, id) {
        if (!this.entityExists(type, id)) throw new Model.StudError("NOT_FOUND", `${type} reference does not exist or is archived.`);
    }

    getEntity(type, id, includeArchived = false) {
        this.initialize();
        const entityType = Model.validateEntityType(type);
        const safeId = Model.safeId(id, "Entity ID");
        const table = this.tableFor(entityType);
        const clause = includeArchived ? "" : " AND archived_at IS NULL";
        const entity = rowToCamel(this.db.prepare(`SELECT * FROM ${table} WHERE id = ?${clause}`).get(safeId));
        if (!entity) return null;
        return Object.freeze({...entity, entityType});
    }

    listEntities(type, options = {}) {
        this.initialize();
        const entityType = Model.validateEntityType(type);
        const table = this.tableFor(entityType);
        const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
        const params = [];
        let where = options.includeArchived ? "1=1" : "archived_at IS NULL";
        if (["ASSIGNMENT", "RESOURCE", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"].includes(entityType) && options.courseId) { where += " AND course_id = ?"; params.push(Model.safeId(options.courseId, "Course ID")); }
        if (["RESOURCE", "NOTE", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"].includes(entityType) && options.assignmentId) { where += " AND assignment_id = ?"; params.push(Model.safeId(options.assignmentId, "Assignment ID")); }
        const rows = this.db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY updated_at DESC, created_at DESC LIMIT ?`).all(...params, limit);
        return Object.freeze(rows.map(row => Object.freeze({...rowToCamel(row), entityType})));
    }

    createEntity(type, input = {}, options = {}) {
        this.initialize();
        const entityType = Model.validateEntityType(type);
        const value = Model.normalizeByEntityType(entityType, input);
        const id = Model.createId(entityType);
        const timestamp = Model.now();
        return this.transaction(() => {
            this.assertReferences(entityType, value);
            this.insertEntity(entityType, id, value, timestamp);
            this.syncSearch(entityType, id);
            if (options.provenance) this.createProvenance({...options.provenance, entityType, entityId: id});
            return this.getEntity(entityType, id);
        });
    }

    updateEntity(type, id, input = {}) {
        this.initialize();
        const entityType = Model.validateEntityType(type);
        const safeId = Model.safeId(id, "Entity ID");
        const previous = this.getEntity(entityType, safeId);
        if (!previous) throw new Model.StudError("NOT_FOUND", `${entityType} does not exist.`);
        const value = Model.normalizeByEntityType(entityType, input, previous);
        return this.transaction(() => {
            this.assertReferences(entityType, value);
            this.updateEntityRow(entityType, safeId, value, Model.now());
            this.syncSearch(entityType, safeId);
            return this.getEntity(entityType, safeId);
        });
    }

    archiveEntity(type, id) {
        this.initialize();
        const entityType = Model.validateEntityType(type);
        const safeId = Model.safeId(id, "Entity ID");
        this.requireEntity(entityType, safeId);
        return this.transaction(() => {
            const table = this.tableFor(entityType);
            this.db.prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ? WHERE id = ?`).run(Model.now(), Model.now(), safeId);
            this.db.prepare("DELETE FROM stud_search WHERE entity_type = ? AND entity_id = ?").run(entityType, safeId);
            return Object.freeze({id: safeId, entityType, archived: true});
        });
    }

    assertReferences(entityType, value) {
        if (value.courseId) this.requireEntity("COURSE", value.courseId);
        if (value.assignmentId) this.requireEntity("ASSIGNMENT", value.assignmentId);
        if (value.noteId) this.requireEntity("NOTE", value.noteId);
        if (value.sourcePaperId) this.requireEntity("RESEARCH_PAPER", value.sourcePaperId);
        if (entityType === "REVISION_ITEM" && value.sourceType && value.sourceId) this.requireEntity(value.sourceType, value.sourceId);
    }

    insertEntity(type, id, value, timestamp) {
        switch (type) {
        case "COURSE": this.db.prepare("INSERT INTO stud_courses (id,title,short_name,code,description,start_date,end_date,academic_year,academic_term,academic_level,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.shortName,value.code,value.description,value.startDate,value.endDate,value.academicYear,value.academicTerm,value.academicLevel,value.status,timestamp,timestamp); break;
        case "ASSIGNMENT": this.db.prepare("INSERT INTO stud_assignments (id,course_id,title,description,release_date,due_date,cutoff_date,status,submission_status,submitted_at,grade,grade_maximum,grade_scheme,grade_text,weight,feedback,local_progress,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.courseId,value.title,value.description,value.releaseDate,value.dueDate,value.cutoffDate,value.status,value.submissionStatus,value.submittedAt,value.grade,value.gradeMaximum,value.gradeScheme,value.gradeText,value.weight,value.feedback,value.localProgress,value.priority,timestamp,timestamp); break;
        case "RESOURCE": this.db.prepare("INSERT INTO stud_resources (id,course_id,assignment_id,type,title,url,local_reference,mime_type,checksum,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id,value.courseId,value.assignmentId,value.type,value.title,value.url,value.localReference,value.mimeType,value.checksum,timestamp,timestamp); break;
        case "RESEARCH_PAPER": this.db.prepare("INSERT INTO stud_research_papers (id,title,object_type,year,published_date,abstract,venue,publisher,authors,doi,source_url,citation_json,oa_json,local_document_reference,document_metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.objectType,value.year,value.publishedDate,value.abstract,value.venue,value.publisher,value.authors,value.doi,value.sourceUrl,value.citationJson,value.oaJson,value.localDocumentReference,value.documentMetadataJson,timestamp,timestamp); break;
        case "NOTE": this.db.prepare("INSERT INTO stud_notes (id,title,content,course_id,assignment_id,document_version,document_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id,value.title,value.content,value.courseId,value.assignmentId,value.documentVersion,value.documentJson,timestamp,timestamp); break;
        case "REVISION_ITEM": this.db.prepare(`INSERT INTO stud_revision_items (id,course_id,prompt,answer,source_type,source_id,title,description,status,priority,difficulty,confidence,estimated_duration_minutes,accumulated_study_minutes,last_studied_at,next_planned_revision_at,scheduled_revision_at,target_mastery,current_mastery,spaced_revision_enabled,successful_revision_count,pinned,plan_position,suggestion_dismissed_until,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,value.courseId,value.prompt,value.answer,value.sourceType,value.sourceId,value.title,value.description,value.status,value.priority,value.difficulty,value.confidence,value.estimatedDurationMinutes,value.accumulatedStudyMinutes,value.lastStudiedAt,value.nextPlannedRevisionAt,value.scheduledRevisionAt,value.targetMastery,value.currentMastery,value.spacedRevisionEnabled ? 1 : 0,value.successfulRevisionCount,value.pinned ? 1 : 0,value.planPosition,value.suggestionDismissedUntil,timestamp,timestamp); break;
        case "COMPUTE_RESULT": this.db.prepare("INSERT INTO stud_compute_results (id,title,capability,tool,operation,input_json,normalized_input_json,output_json,units_json,plot_json,runtime_json,course_id,assignment_id,note_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.capability,value.tool,value.operation,value.inputJson,value.normalizedInputJson,value.outputJson,value.unitsJson,value.plotJson,value.runtimeJson,value.courseId,value.assignmentId,value.noteId,timestamp,timestamp); break;
        case "ACADEMIC_DOCUMENT": this.db.prepare("INSERT INTO stud_academic_documents (id,title,document_type,display_name,managed_reference,mime_type,byte_size,checksum,page_count,extraction_status,extraction_engine,extraction_version,course_id,assignment_id,source_paper_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.documentType,value.displayName,value.managedReference,value.mimeType,value.byteSize,value.checksum,value.pageCount,value.extractionStatus,value.extractionEngine,value.extractionVersion,value.courseId,value.assignmentId,value.sourcePaperId,timestamp,timestamp); break;
        case "NOTEBOOK": this.db.prepare("INSERT INTO stud_notebooks (id,title,description,notebook_type,language,execution_status,course_id,assignment_id,note_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.description,value.notebookType,value.language,value.executionStatus,value.courseId,value.assignmentId,value.noteId,timestamp,timestamp); break;
        case "DATASET": this.db.prepare("INSERT INTO stud_datasets (id,title,description,format,managed_reference,mime_type,byte_size,checksum,row_count,columns_json,summary_json,course_id,assignment_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.description,value.format,value.managedReference,value.mimeType,value.byteSize,value.checksum,value.rowCount,value.columnsJson,value.summaryJson,value.courseId,value.assignmentId,timestamp,timestamp); break;
        case "REPOSITORY_REFERENCE": this.db.prepare("INSERT INTO stud_repository_references (id,title,provider,owner,repository,canonical_url,selected_ref,commit_sha,metadata_json,course_id,assignment_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.provider,value.owner,value.repository,value.canonicalUrl,value.selectedRef,value.commitSha,value.metadataJson,value.courseId,value.assignmentId,timestamp,timestamp); break;
        }
    }

    updateEntityRow(type, id, value, timestamp) {
        switch (type) {
        case "COURSE": this.db.prepare("UPDATE stud_courses SET title=?,short_name=?,code=?,description=?,start_date=?,end_date=?,academic_year=?,academic_term=?,academic_level=?,status=?,updated_at=? WHERE id=?").run(value.title,value.shortName,value.code,value.description,value.startDate,value.endDate,value.academicYear,value.academicTerm,value.academicLevel,value.status,timestamp,id); break;
        case "ASSIGNMENT": this.db.prepare("UPDATE stud_assignments SET course_id=?,title=?,description=?,release_date=?,due_date=?,cutoff_date=?,status=?,submission_status=?,submitted_at=?,grade=?,grade_maximum=?,grade_scheme=?,grade_text=?,weight=?,feedback=?,local_progress=?,priority=?,updated_at=? WHERE id=?").run(value.courseId,value.title,value.description,value.releaseDate,value.dueDate,value.cutoffDate,value.status,value.submissionStatus,value.submittedAt,value.grade,value.gradeMaximum,value.gradeScheme,value.gradeText,value.weight,value.feedback,value.localProgress,value.priority,timestamp,id); break;
        case "RESOURCE": this.db.prepare("UPDATE stud_resources SET course_id=?,assignment_id=?,type=?,title=?,url=?,local_reference=?,mime_type=?,checksum=?,updated_at=? WHERE id=?").run(value.courseId,value.assignmentId,value.type,value.title,value.url,value.localReference,value.mimeType,value.checksum,timestamp,id); break;
        case "RESEARCH_PAPER": this.db.prepare("UPDATE stud_research_papers SET title=?,object_type=?,year=?,published_date=?,abstract=?,venue=?,publisher=?,authors=?,doi=?,source_url=?,citation_json=?,oa_json=?,local_document_reference=?,document_metadata_json=?,updated_at=? WHERE id=?").run(value.title,value.objectType,value.year,value.publishedDate,value.abstract,value.venue,value.publisher,value.authors,value.doi,value.sourceUrl,value.citationJson,value.oaJson,value.localDocumentReference,value.documentMetadataJson,timestamp,id); break;
        case "NOTE": this.db.prepare("UPDATE stud_notes SET title=?,content=?,course_id=?,assignment_id=?,document_version=?,document_json=?,updated_at=? WHERE id=?").run(value.title,value.content,value.courseId,value.assignmentId,value.documentVersion,value.documentJson,timestamp,id); break;
        case "REVISION_ITEM": this.db.prepare(`UPDATE stud_revision_items SET course_id=?,prompt=?,answer=?,source_type=?,source_id=?,title=?,description=?,status=?,priority=?,difficulty=?,confidence=?,estimated_duration_minutes=?,accumulated_study_minutes=?,last_studied_at=?,next_planned_revision_at=?,scheduled_revision_at=?,target_mastery=?,current_mastery=?,spaced_revision_enabled=?,successful_revision_count=?,pinned=?,plan_position=?,suggestion_dismissed_until=?,updated_at=? WHERE id=?`).run(value.courseId,value.prompt,value.answer,value.sourceType,value.sourceId,value.title,value.description,value.status,value.priority,value.difficulty,value.confidence,value.estimatedDurationMinutes,value.accumulatedStudyMinutes,value.lastStudiedAt,value.nextPlannedRevisionAt,value.scheduledRevisionAt,value.targetMastery,value.currentMastery,value.spacedRevisionEnabled ? 1 : 0,value.successfulRevisionCount,value.pinned ? 1 : 0,value.planPosition,value.suggestionDismissedUntil,timestamp,id); break;
        case "COMPUTE_RESULT": this.db.prepare("UPDATE stud_compute_results SET title=?,capability=?,tool=?,operation=?,input_json=?,normalized_input_json=?,output_json=?,units_json=?,plot_json=?,runtime_json=?,course_id=?,assignment_id=?,note_id=?,updated_at=? WHERE id=?").run(value.title,value.capability,value.tool,value.operation,value.inputJson,value.normalizedInputJson,value.outputJson,value.unitsJson,value.plotJson,value.runtimeJson,value.courseId,value.assignmentId,value.noteId,timestamp,id); break;
        case "ACADEMIC_DOCUMENT": this.db.prepare("UPDATE stud_academic_documents SET title=?,document_type=?,display_name=?,managed_reference=?,mime_type=?,byte_size=?,checksum=?,page_count=?,extraction_status=?,extraction_engine=?,extraction_version=?,course_id=?,assignment_id=?,source_paper_id=?,updated_at=? WHERE id=?").run(value.title,value.documentType,value.displayName,value.managedReference,value.mimeType,value.byteSize,value.checksum,value.pageCount,value.extractionStatus,value.extractionEngine,value.extractionVersion,value.courseId,value.assignmentId,value.sourcePaperId,timestamp,id); break;
        case "NOTEBOOK": this.db.prepare("UPDATE stud_notebooks SET title=?,description=?,notebook_type=?,language=?,execution_status=?,course_id=?,assignment_id=?,note_id=?,updated_at=? WHERE id=?").run(value.title,value.description,value.notebookType,value.language,value.executionStatus,value.courseId,value.assignmentId,value.noteId,timestamp,id); break;
        case "DATASET": this.db.prepare("UPDATE stud_datasets SET title=?,description=?,format=?,managed_reference=?,mime_type=?,byte_size=?,checksum=?,row_count=?,columns_json=?,summary_json=?,course_id=?,assignment_id=?,updated_at=? WHERE id=?").run(value.title,value.description,value.format,value.managedReference,value.mimeType,value.byteSize,value.checksum,value.rowCount,value.columnsJson,value.summaryJson,value.courseId,value.assignmentId,timestamp,id); break;
        case "REPOSITORY_REFERENCE": this.db.prepare("UPDATE stud_repository_references SET title=?,provider=?,owner=?,repository=?,canonical_url=?,selected_ref=?,commit_sha=?,metadata_json=?,course_id=?,assignment_id=?,updated_at=? WHERE id=?").run(value.title,value.provider,value.owner,value.repository,value.canonicalUrl,value.selectedRef,value.commitSha,value.metadataJson,value.courseId,value.assignmentId,timestamp,id); break;
        }
    }

    syncSearch(type, id) {
        const entity = this.getEntity(type, id);
        this.db.prepare("DELETE FROM stud_search WHERE entity_type = ? AND entity_id = ?").run(type, id);
        if (!entity || !["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"].includes(type)) return;
        const content = cleanText([entity.description, entity.abstract, entity.content, entity.prompt, entity.answer, entity.code, entity.authors, entity.venue, entity.doi, entity.publisher, entity.capability, entity.tool, entity.operation, entity.documentType, entity.displayName, entity.notebookType, entity.language, entity.format, entity.owner, entity.repository, entity.selectedRef].filter(Boolean).join(" "));
        this.db.prepare("INSERT INTO stud_search (entity_type,entity_id,course_id,title,content) VALUES (?,?,?,?,?)").run(type, id, entity.courseId || "", entity.title || entity.prompt || "", content);
    }

    linkAcademicContext(entity, context = {}, source = "USER") {
        const links = [
            ["COURSE", context.courseId, "USES"], ["ASSIGNMENT", context.assignmentId, "USES"],
            ["NOTE", context.noteId, "REFERENCES"], ["RESOURCE", context.resourceId, "USES"],
            ["ACADEMIC_DOCUMENT", context.documentId, "REFERENCES"], ["DATASET", context.datasetId, "USES"],
            ["REPOSITORY_REFERENCE", context.repositoryId, "REFERENCES"], ["NOTEBOOK", context.notebookId, "REFERENCES"]
        ];
        links.forEach(([fromType, fromId, relationType]) => {
            if (!fromId) return;
            try { this.createRelationship({fromType, fromId, relationType, toType: entity.entityType, toId: entity.id, source}); }
            catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; }
        });
    }

    createNotebook(input = {}, context = {}) {
        Model.assertAllowedKeys(context, ["courseId", "assignmentId", "noteId", "resourceId", "documentId", "datasetId", "repositoryId"], "Notebook context");
        const {resourceId, documentId, datasetId, repositoryId, ...notebookInput} = input;
        const notebook = this.createEntity("NOTEBOOK", notebookInput, {provenance: {field: "created", observedValue: "EXPLICIT_NOTEBOOK", sourceType: "USER", sourceId: "STUD_NOTEBOOK", sourceAuthority: "AUTHORITATIVE", observedAt: Model.now(), metadata: {execution: "EDITING_ONLY"}}});
        this.transaction(() => this.linkAcademicContext(notebook, {...context, resourceId: resourceId || context.resourceId, documentId: documentId || context.documentId, datasetId: datasetId || context.datasetId, repositoryId: repositoryId || context.repositoryId, courseId: notebookInput.courseId || context.courseId, assignmentId: notebookInput.assignmentId || context.assignmentId, noteId: notebookInput.noteId || context.noteId}, "USER"));
        return notebook;
    }

    listNotebooks(options = {}) { return this.listEntities("NOTEBOOK", options); }

    listNotebookCells(notebookId, limit = 200) {
        this.initialize();
        const id = Model.safeId(notebookId, "Notebook ID"); this.requireEntity("NOTEBOOK", id);
        const max = Math.max(1, Math.min(Number(limit) || 200, 500));
        const rows = this.db.prepare("SELECT * FROM stud_notebook_cells WHERE notebook_id=? ORDER BY cell_order ASC LIMIT ?").all(id, max);
        return Object.freeze(rows.map(row => {
            const outputs = this.db.prepare("SELECT * FROM stud_notebook_outputs WHERE cell_id=? ORDER BY created_at DESC LIMIT 20").all(row.id)
                .map(output => Object.freeze({...rowToCamel(output), truncated: Boolean(output.truncated), metadata: parseJson(output.metadata_json, {})}));
            return Object.freeze({...rowToCamel(row), outputs: Object.freeze(outputs)});
        }));
    }

    createNotebookCell(input = {}) {
        Model.assertAllowedKeys(input, ["notebookId", "cellType", "source", "afterCellId"], "Notebook cell");
        const notebookId = Model.safeId(input.notebookId, "Notebook ID"); this.requireEntity("NOTEBOOK", notebookId);
        const cellType = Model.enumValue(input.cellType, ["MARKDOWN", "CODE", "RAW"], "Notebook cell type", "MARKDOWN");
        const source = Model.optionalText(input.source, "Notebook cell source", 20000) || "";
        const after = input.afterCellId ? Model.safeId(input.afterCellId, "Notebook cell ID") : null;
        const timestamp = Model.now(); const id = Model.createId("notebook_cell");
        return this.transaction(() => {
            const cells = this.db.prepare("SELECT id,cell_order FROM stud_notebook_cells WHERE notebook_id=? ORDER BY cell_order").all(notebookId);
            const anchor = after && cells.find(cell => cell.id === after);
            if (after && !anchor) throw new Model.StudError("NOT_FOUND", "Notebook cell does not belong to this notebook.");
            const order = anchor ? anchor.cell_order + 1 : cells.length;
            this.db.prepare("UPDATE stud_notebook_cells SET cell_order=cell_order+1,updated_at=? WHERE notebook_id=? AND cell_order>=?").run(timestamp, notebookId, order);
            this.db.prepare("INSERT INTO stud_notebook_cells (id,notebook_id,cell_order,cell_type,source,execution_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, notebookId, order, cellType, source, "NOT_EXECUTED", timestamp, timestamp);
            this.updateEntity("NOTEBOOK", notebookId, {});
            return this.listNotebookCells(notebookId).find(cell => cell.id === id);
        });
    }

    updateNotebookCell(input = {}) {
        Model.assertAllowedKeys(input, ["notebookId", "cellId", "cellType", "source"], "Notebook cell update");
        const notebookId = Model.safeId(input.notebookId, "Notebook ID"); const cellId = Model.safeId(input.cellId, "Notebook cell ID");
        const current = this.db.prepare("SELECT * FROM stud_notebook_cells WHERE id=? AND notebook_id=?").get(cellId, notebookId);
        if (!current) throw new Model.StudError("NOT_FOUND", "Notebook cell does not exist.");
        const cellType = input.cellType === undefined ? current.cell_type : Model.enumValue(input.cellType, ["MARKDOWN", "CODE", "RAW"], "Notebook cell type");
        const source = input.source === undefined ? current.source : (Model.optionalText(input.source, "Notebook cell source", 20000) || "");
        return this.transaction(() => {
            this.db.prepare("UPDATE stud_notebook_cells SET cell_type=?,source=?,updated_at=? WHERE id=?").run(cellType, source, Model.now(), cellId);
            this.updateEntity("NOTEBOOK", notebookId, {});
            return this.listNotebookCells(notebookId).find(cell => cell.id === cellId);
        });
    }

    reorderNotebookCells(input = {}) {
        Model.assertAllowedKeys(input, ["notebookId", "cellIds"], "Notebook cell order");
        const notebookId = Model.safeId(input.notebookId, "Notebook ID"); const ids = Array.isArray(input.cellIds) ? input.cellIds.map(item => Model.safeId(item, "Notebook cell ID")) : [];
        const existing = this.listNotebookCells(notebookId, 500).map(item => item.id);
        if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) throw new Model.StudError("INVALID_INPUT", "Notebook order must contain every notebook cell exactly once.");
        return this.transaction(() => {
            const timestamp = Model.now();
            // Move all current positions out of the unique range first. Updating
            // rows one-by-one would otherwise collide with a sibling's order.
            this.db.prepare("UPDATE stud_notebook_cells SET cell_order=cell_order+1000,updated_at=? WHERE notebook_id=?").run(timestamp, notebookId);
            ids.forEach((id, index) => this.db.prepare("UPDATE stud_notebook_cells SET cell_order=?,updated_at=? WHERE id=?").run(index, timestamp, id));
            this.updateEntity("NOTEBOOK", notebookId, {}); return this.listNotebookCells(notebookId);
        });
    }

    deleteNotebookCell(input = {}) {
        Model.assertAllowedKeys(input, ["notebookId", "cellId", "confirmation"], "Notebook cell deletion");
        if (input.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Deleting a notebook cell requires explicit confirmation.");
        const notebookId = Model.safeId(input.notebookId, "Notebook ID"); const cellId = Model.safeId(input.cellId, "Notebook cell ID");
        return this.transaction(() => { const row = this.db.prepare("SELECT cell_order FROM stud_notebook_cells WHERE id=? AND notebook_id=?").get(cellId, notebookId); if (!row) throw new Model.StudError("NOT_FOUND", "Notebook cell does not exist."); this.db.prepare("DELETE FROM stud_notebook_outputs WHERE cell_id=?").run(cellId); this.db.prepare("DELETE FROM stud_notebook_cells WHERE id=?").run(cellId); this.db.prepare("UPDATE stud_notebook_cells SET cell_order=cell_order-1,updated_at=? WHERE notebook_id=? AND cell_order>?").run(Model.now(), notebookId, row.cell_order); this.updateEntity("NOTEBOOK", notebookId, {}); return Object.freeze({deleted: true, cellId}); });
    }

    clearNotebookOutputs(input = {}) {
        Model.assertAllowedKeys(input, ["notebookId", "cellId", "confirmation"], "Notebook output clear");
        if (input.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Clearing notebook output requires explicit confirmation.");
        const notebookId = Model.safeId(input.notebookId, "Notebook ID"); const cellId = Model.safeId(input.cellId, "Notebook cell ID");
        const cell = this.db.prepare("SELECT id FROM stud_notebook_cells WHERE id=? AND notebook_id=?").get(cellId, notebookId); if (!cell) throw new Model.StudError("NOT_FOUND", "Notebook cell does not exist.");
        this.db.prepare("DELETE FROM stud_notebook_outputs WHERE cell_id=?").run(cellId); return Object.freeze({cleared: true, cellId});
    }

    notebookContext(notebookId) {
        const notebook = this.getEntity("NOTEBOOK", notebookId); if (!notebook) throw new Model.StudError("NOT_FOUND", "Notebook does not exist.");
        return Object.freeze({notebook, cells: this.listNotebookCells(notebook.id), relationships: this.listRelationships("NOTEBOOK", notebook.id), provenance: this.listProvenance("NOTEBOOK", notebook.id), execution: Object.freeze({status: "NOT_INSTALLED", detail: "Notebook execution is intentionally not bundled in Phase 11."})});
    }

    saveDataset(managed, context = {}) {
        Model.assertAllowedKeys(managed, ["cancelled", "title", "format", "reference", "mimeType", "size", "sha256", "rowCount", "columns", "summary", "preview"], "Managed dataset");
        if (managed.cancelled === true) throw new Model.StudError("POLICY_BLOCKED", "A cancelled dataset selection cannot be persisted.");
        Model.assertAllowedKeys(context, ["description", "courseId", "assignmentId", "resourceId", "notebookId"], "Dataset context");
        const dataset = this.createEntity("DATASET", {title: managed.title, description: context.description || null, format: managed.format, managedReference: managed.reference, mimeType: managed.mimeType, byteSize: managed.size, checksum: managed.sha256, rowCount: managed.rowCount, columnsJson: JSON.stringify(managed.columns), summaryJson: JSON.stringify(managed.summary), courseId: context.courseId || null, assignmentId: context.assignmentId || null}, {provenance: {field: "import", observedValue: managed.sha256, sourceType: "IMPORT", sourceId: "STUD_DATASET", sourceAuthority: "AUTHORITATIVE", observedAt: Model.now(), metadata: {format: managed.format, explicit: true}}});
        this.transaction(() => this.linkAcademicContext(dataset, context, "IMPORT"));
        return dataset;
    }

    listDatasets(options = {}) { return this.listEntities("DATASET", options); }

    saveRepositoryReference(input = {}, context = {}) {
        Model.assertAllowedKeys(context, ["courseId", "assignmentId", "resourceId", "notebookId", "documentId", "datasetId"], "Repository context");
        const reference = this.createEntity("REPOSITORY_REFERENCE", input, {provenance: {field: "reference", observedValue: input.canonicalUrl, sourceType: "USER", sourceId: "GITHUB_REFERENCE", sourceAuthority: "AUTHORITATIVE", observedAt: Model.now(), metadata: {explicit: true, network: "NONE"}}});
        this.transaction(() => this.linkAcademicContext(reference, context, "USER"));
        if (context.notebookId) { try { this.createRelationship({fromType: "NOTEBOOK", fromId: context.notebookId, relationType: "REFERENCES", toType: "REPOSITORY_REFERENCE", toId: reference.id, source: "USER"}); } catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; } }
        return reference;
    }

    listRepositoryReferences(options = {}) { return this.listEntities("REPOSITORY_REFERENCE", options); }

    createExternalIdentifier(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["entityType", "entityId", "namespace", "externalId", "source"], "External identifier");
        const entityType = Model.validateEntityType(input.entityType);
        const entityId = Model.safeId(input.entityId, "External identifier entity ID");
        const namespace = Model.requiredText(input.namespace, "Identifier namespace", 80).toUpperCase();
        const externalId = Model.requiredText(input.externalId, "External identifier", Model.LIMITS.identifier);
        const source = Model.optionalText(input.source, "Identifier source", Model.LIMITS.source);
        this.requireEntity(entityType, entityId);
        const id = Model.createId("external_identifier");
        try {
            this.db.prepare("INSERT INTO stud_external_identifiers (id,entity_type,entity_id,namespace,external_id,source,created_at) VALUES (?,?,?,?,?,?,?)").run(id,entityType,entityId,namespace,externalId,source,Model.now());
        } catch (error) {
            if (/UNIQUE/i.test(error.message)) throw new Model.StudError("DUPLICATE_EXTERNAL_IDENTIFIER", "This external identifier is already linked.");
            throw error;
        }
        return Object.freeze({id, entityType, entityId, namespace, externalId, source});
    }

    findByExternalIdentifier(namespace, externalId) {
        this.initialize();
        const normalizedNamespace = Model.requiredText(namespace, "Identifier namespace", 80).toUpperCase();
        const normalizedExternalId = Model.requiredText(externalId, "External identifier", Model.LIMITS.identifier);
        return Object.freeze(this.db.prepare("SELECT * FROM stud_external_identifiers WHERE namespace = ? AND external_id = ?").all(normalizedNamespace, normalizedExternalId).map(row => Object.freeze(rowToCamel(row))));
    }

    saveResearchObservation(normalized, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["courseId", "assignmentId", "source"], "Research save options");
        const merged = Research.mergeNormalizedPapers(Array.isArray(normalized) ? normalized : [normalized]);
        for (const identifier of merged.identifiers) {
            const existing = this.findByExternalIdentifier(identifier.namespace, identifier.value)[0];
            if (existing) {
                const paper = this.getEntity("RESEARCH_PAPER", existing.entityId);
                if (paper) {
                    this.linkPaperContext(paper.id, options);
                    return Object.freeze({paper, deduplicated: true, conflicts: merged.conflicts});
                }
            }
        }
        const canonical = merged.canonical;
        const paperValue = {
            title: canonical.title,
            objectType: canonical.objectType || "OTHER",
            year: canonical.year,
            publishedDate: canonical.publishedDate,
            abstract: canonical.abstract,
            venue: canonical.venue,
            publisher: canonical.publisher,
            authors: canonical.authors,
            doi: merged.identifiers.find(item => item.namespace === "DOI")?.value || null,
            sourceUrl: canonical.sourceUrl,
            citationJson: null,
            oaJson: null,
            localDocumentReference: null,
            documentMetadataJson: null
        };
        const paper = this.createEntity("RESEARCH_PAPER", paperValue);
        const citation = Citations.toCsl(paper);
        this.updateEntity("RESEARCH_PAPER", paper.id, {citationJson: JSON.stringify(citation)});
        merged.identifiers.forEach(identifier => this.createExternalIdentifier({entityType: "RESEARCH_PAPER", entityId: paper.id, namespace: identifier.namespace, externalId: identifier.value, source: options.source || normalized.provider || "RESEARCH_PROVIDER"}));
        merged.observations.forEach(observation => this.createProvenance({
            entityType: "RESEARCH_PAPER", entityId: paper.id, field: observation.field,
            observedValue: Array.isArray(observation.value) ? observation.value.join("; ") : String(observation.value),
            sourceType: "RESEARCH_PROVIDER", sourceId: observation.source,
            sourceAuthority: observation.authority >= 3 ? "TRUSTED" : "CORROBORATING", observedAt: observation.observedAt
        }));
        this.linkPaperContext(paper.id, options);
        return Object.freeze({paper: this.getEntity("RESEARCH_PAPER", paper.id), deduplicated: false, conflicts: merged.conflicts});
    }

    linkPaperContext(paperId, options = {}) {
        const targets = [];
        if (options.assignmentId) targets.push({type: "ASSIGNMENT", id: Model.safeId(options.assignmentId, "Assignment ID")});
        if (options.courseId) targets.push({type: "COURSE", id: Model.safeId(options.courseId, "Course ID")});
        targets.forEach(target => {
            this.requireEntity(target.type, target.id);
            try { this.createRelationship({fromType: target.type, fromId: target.id, relationType: "HAS_PAPER", toType: "RESEARCH_PAPER", toId: paperId, source: options.source || "USER"}); }
            catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; }
        });
    }

    setPaperOpenAccess(paperId, oa) {
        const paper = this.getEntity("RESEARCH_PAPER", paperId);
        if (!paper) throw new Model.StudError("NOT_FOUND", "Research paper does not exist.");
        const bounded = JSON.stringify(oa || null);
        if (Buffer.byteLength(bounded, "utf8") > 12000) throw new Model.StudError("PAYLOAD_TOO_LARGE", "Open-access metadata is too large.");
        return this.updateEntity("RESEARCH_PAPER", paper.id, {oaJson: bounded});
    }

    setPaperDocument(paperId, document) {
        Model.assertAllowedKeys(document, ["reference", "displayName", "mimeType", "size", "sha256"], "Local PDF metadata");
        const paper = this.getEntity("RESEARCH_PAPER", paperId);
        if (!paper) throw new Model.StudError("NOT_FOUND", "Research paper does not exist.");
        return this.updateEntity("RESEARCH_PAPER", paper.id, {
            localDocumentReference: Model.requiredText(document.reference, "Managed document reference", 260),
            documentMetadataJson: JSON.stringify({displayName: Model.optionalText(document.displayName, "PDF display name", 240), mimeType: "application/pdf", size: Number(document.size) || 0, sha256: Model.requiredText(document.sha256, "PDF checksum", 64)})
        });
    }

    saveStructuredNote(input = {}) {
        Model.assertAllowedKeys(input, ["noteId", "title", "document", "courseId", "assignmentId", "paperIds", "selectionProvenance"], "Structured note");
        const structured = Research.sanitizeNoteDocument(input.document);
        const value = {
            title: Model.requiredText(input.title, "Note title"), content: structured.plainText,
            courseId: input.courseId || null, assignmentId: input.assignmentId || null,
            documentVersion: structured.version, documentJson: JSON.stringify(structured.document)
        };
        const note = input.noteId ? this.updateEntity("NOTE", input.noteId, value) : this.createEntity("NOTE", value);
        if (!input.noteId && input.assignmentId) this.createRelationship({fromType: "ASSIGNMENT", fromId: input.assignmentId, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
        if (!input.noteId && input.courseId) this.createRelationship({fromType: "COURSE", fromId: input.courseId, relationType: "HAS_NOTE", toType: "NOTE", toId: note.id, source: "USER"});
        (Array.isArray(input.paperIds) ? input.paperIds : []).slice(0, 100).forEach(paperId => {
            try { this.createRelationship({fromType: "NOTE", fromId: note.id, relationType: "CITES", toType: "RESEARCH_PAPER", toId: paperId, source: "USER"}); }
            catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; }
        });
        if (input.selectionProvenance) {
            Model.assertAllowedKeys(input.selectionProvenance, ["sourceType", "paperId", "documentReference", "page", "selectionTextHash", "excerpt", "createdAt"], "PDF selection provenance");
            const sourceType = ["LOCAL_DOCUMENT", "OA_DOCUMENT"].includes(input.selectionProvenance.sourceType) ? input.selectionProvenance.sourceType : null;
            const hash = String(input.selectionProvenance.selectionTextHash || "").toLowerCase();
            if (!sourceType || !/^[a-f0-9]{64}$/.test(hash)) throw new Model.StudError("INVALID_INPUT", "PDF selection provenance is invalid.");
            const paperId = Model.safeId(input.selectionProvenance.paperId, "Selection paper ID");
            this.createProvenance({
                entityType: "NOTE", entityId: note.id, field: "document.selection",
                observedValue: Model.requiredText(input.selectionProvenance.excerpt, "Selected excerpt", 4000),
                sourceType: "LOCAL_EXTRACTION", sourceId: paperId, sourceAuthority: "TRUSTED",
                observedAt: input.selectionProvenance.createdAt || new Date().toISOString(),
                metadata: {sourceType, documentReference: Model.optionalText(input.selectionProvenance.documentReference, "Document reference", 260), page: Math.max(1, Number(input.selectionProvenance.page) || 1), selectionTextHash: hash}
            });
        }
        return this.getEntity("NOTE", note.id);
    }

    // Compute persistence is deliberately explicit: a previewed calculation is
    // ephemeral until the analyst asks to save it to academic context.
    saveComputeResult(run, context = {}) {
        this.initialize();
        Model.assertPlainObject(run, "Compute result");
        Model.assertAllowedKeys(context, ["title", "courseId", "assignmentId", "noteId"], "Compute context");
        if (run.status !== "SUCCESS" || !run.runtime || run.runtime.engine !== "AEGIS_BOUNDED_LOCAL_COMPUTE") throw new Model.StudError("INVALID_INPUT", "Only a successful bounded local calculation can be saved.");
        const assignmentId = context.assignmentId ? Model.safeId(context.assignmentId, "Assignment ID") : null;
        let courseId = context.courseId ? Model.safeId(context.courseId, "Course ID") : null;
        const noteId = context.noteId ? Model.safeId(context.noteId, "Note ID") : null;
        if (assignmentId) {
            const assignment = this.getEntity("ASSIGNMENT", assignmentId);
            if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
            if (courseId && assignment.courseId && courseId !== assignment.courseId) throw new Model.StudError("INVALID_INPUT", "Selected course does not match the selected assignment.");
            courseId ||= assignment.courseId || null;
        }
        if (courseId) this.requireEntity("COURSE", courseId);
        if (noteId) this.requireEntity("NOTE", noteId);
        const title = context.title ? Model.requiredText(context.title, "Compute result title") : `${run.tool.replace(/_/g, " ")} · ${run.operation}`;
        const value = {
            title, capability: "ENGINEERING_COMPUTE", tool: run.tool, operation: run.operation,
            inputJson: JSON.stringify(run.originalInput), normalizedInputJson: JSON.stringify(run.normalizedInput), outputJson: JSON.stringify(run.result),
            unitsJson: run.units ? JSON.stringify(run.units) : null, plotJson: run.plot ? JSON.stringify(run.plot) : null,
            runtimeJson: JSON.stringify(run.runtime), courseId, assignmentId, noteId
        };
        return this.transaction(() => {
            const result = this.createEntity("COMPUTE_RESULT", value, {provenance: {
                field: "result", observedValue: JSON.stringify(run.result), sourceType: "AEGIS_ENGINEERING_COMPUTE",
                sourceId: run.runtime.version, sourceAuthority: "AUTHORITATIVE", metadata: {tool: run.tool, operation: run.operation, offline: true}
            }});
            const relate = (fromType, fromId) => { try { this.createRelationship({fromType, fromId, relationType: "USES", toType: "COMPUTE_RESULT", toId: result.id, source: "AEGIS_ENGINEERING_COMPUTE"}); } catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; } };
            if (courseId) relate("COURSE", courseId);
            if (assignmentId) relate("ASSIGNMENT", assignmentId);
            if (noteId) {
                try { this.createRelationship({fromType: "NOTE", fromId: noteId, relationType: "REFERENCES", toType: "COMPUTE_RESULT", toId: result.id, source: "AEGIS_ENGINEERING_COMPUTE"}); } catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; }
                const note = this.getEntity("NOTE", noteId);
                const document = parseJson(note.documentJson, {type: "doc", content: []});
                if (!Array.isArray(document.content)) document.content = [];
                const inputText = JSON.stringify(run.normalizedInput).slice(0, 1600);
                const outputText = JSON.stringify(run.result).slice(0, 1600);
                document.content.push(
                    {type: "heading", attrs: {level: 2}, content: [{type: "text", text: `Engineering Compute · ${title}`}]},
                    {type: "paragraph", content: [{type: "text", text: `Tool: ${run.tool} · Operation: ${run.operation}`}]},
                    {type: "codeBlock", content: [{type: "text", text: `Input: ${inputText}\nResult: ${outputText}`}]},
                    {type: "paragraph", content: [{type: "text", text: "Source: AEGIS ENGINEERING COMPUTE · local deterministic calculation · explicit save."}]}
                );
                const structured = Research.sanitizeNoteDocument(document);
                this.updateEntity("NOTE", note.id, {title: note.title, courseId: note.courseId, assignmentId: note.assignmentId, content: structured.plainText, documentVersion: structured.version, documentJson: JSON.stringify(structured.document)});
            }
            return this.getEntity("COMPUTE_RESULT", result.id);
        });
    }

    listComputeResults(options = {}) { return this.listEntities("COMPUTE_RESULT", options); }

    listAcademicDocuments(options = {}) { return this.listEntities("ACADEMIC_DOCUMENT", options); }

    saveAcademicDocument(managedDocument, context = {}) {
        this.initialize();
        Model.assertAllowedKeys(managedDocument, ["reference", "displayName", "mimeType", "size", "sha256"], "Managed academic document");
        Model.assertAllowedKeys(context, ["title", "documentType", "courseId", "assignmentId", "sourcePaperId", "sourceResourceId"], "Academic document context");
        const assignmentId = context.assignmentId ? Model.safeId(context.assignmentId, "Assignment ID") : null;
        let courseId = context.courseId ? Model.safeId(context.courseId, "Course ID") : null;
        if (assignmentId) {
            const assignment = this.getEntity("ASSIGNMENT", assignmentId);
            if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
            if (courseId && assignment.courseId && courseId !== assignment.courseId) throw new Model.StudError("INVALID_INPUT", "Selected course does not match the selected assignment.");
            courseId ||= assignment.courseId || null;
        }
        if (courseId) this.requireEntity("COURSE", courseId);
        if (context.sourcePaperId) this.requireEntity("RESEARCH_PAPER", context.sourcePaperId);
        if (context.sourceResourceId) this.requireEntity("RESOURCE", context.sourceResourceId);
        const checksum = Model.requiredText(managedDocument.sha256, "Document checksum", 64).toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Model.StudError("INVALID_INPUT", "Document checksum must be SHA-256.");
        const existing = this.db.prepare("SELECT id FROM stud_academic_documents WHERE checksum = ? AND archived_at IS NULL LIMIT 1").get(checksum);
        if (existing) return Object.freeze({document: this.getEntity("ACADEMIC_DOCUMENT", existing.id), deduplicated: true});
        const document = this.createEntity("ACADEMIC_DOCUMENT", {
            title: context.title || String(managedDocument.displayName || "Untitled document").replace(/\.pdf$/i, ""),
            documentType: context.documentType || "UNKNOWN", displayName: managedDocument.displayName || null,
            managedReference: Model.requiredText(managedDocument.reference, "Managed document reference", 260),
            mimeType: managedDocument.mimeType || "application/pdf", byteSize: Number(managedDocument.size) || 0,
            checksum, pageCount: null, extractionStatus: "NOT_ANALYZED", extractionEngine: null, extractionVersion: null,
            courseId, assignmentId, sourcePaperId: context.sourcePaperId || null
        }, {provenance: {field: "managedReference", observedValue: checksum, sourceType: "LOCAL_EXTRACTION", sourceId: "MANAGED_DOCUMENT", sourceAuthority: "AUTHORITATIVE", metadata: {reference: managedDocument.reference, originalPathPersisted: false}}});
        const relate = (fromType, fromId, relationType = "HAS_DOCUMENT") => {
            if (!fromId) return;
            try { this.createRelationship({fromType, fromId, relationType, toType: "ACADEMIC_DOCUMENT", toId: document.id, source: "USER"}); }
            catch (error) { if (error.code !== "DUPLICATE_RELATIONSHIP") throw error; }
        };
        relate("COURSE", courseId); relate("ASSIGNMENT", assignmentId); relate("RESEARCH_PAPER", context.sourcePaperId || null, "REFERENCES"); relate("RESOURCE", context.sourceResourceId || null, "REFERENCES");
        return Object.freeze({document, deduplicated: false});
    }

    persistDocumentExtraction(documentId, extraction) {
        this.initialize();
        Model.assertPlainObject(extraction, "Document extraction");
        const document = this.getEntity("ACADEMIC_DOCUMENT", documentId);
        if (!document) throw new Model.StudError("NOT_FOUND", "Academic document does not exist.");
        const allowedStatuses = Model.DOCUMENT_EXTRACTION_STATUSES;
        const status = Model.enumValue(extraction.status, allowedStatuses, "Document extraction status");
        const pages = Array.isArray(extraction.pages) ? extraction.pages.slice(0, 10000) : [];
        const chunks = Array.isArray(extraction.chunks) ? extraction.chunks.slice(0, 50000) : [];
        const sections = Array.isArray(extraction.sections) ? extraction.sections.slice(0, 10000) : [];
        const references = Array.isArray(extraction.references) ? extraction.references.slice(0, 10000) : [];
        const warnings = Array.isArray(extraction.warnings) ? extraction.warnings.slice(0, 100) : [];
        return this.transaction(() => {
            const extractionId = Model.createId("document_extraction");
            const timestamp = Model.now();
            this.db.prepare("INSERT INTO stud_document_extractions (id,document_id,engine,engine_version,status,page_count,warning_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
                .run(extractionId, document.id, Model.requiredText(extraction.engine || "PDFJS_BUILT_IN", "Document extraction engine", 120), Model.optionalText(extraction.engineVersion, "Document extraction version", 120), status, Math.max(0, Number(extraction.pageCount) || pages.length), JSON.stringify(warnings), timestamp);
            const pageStatement = this.db.prepare("INSERT INTO stud_document_pages (id,extraction_id,page_number,text_content,text_hash,created_at) VALUES (?,?,?,?,?,?)");
            pages.forEach((page, index) => {
                const pageNumber = Math.max(1, Math.min(10000, Number(page.pageNumber) || index + 1));
                const text = Model.optionalText(page.text, "Document page text", 40000) || "";
                const hash = String(page.textHash || "").toLowerCase();
                if (!/^[a-f0-9]{64}$/.test(hash)) throw new Model.StudError("INVALID_INPUT", "Document page hash is invalid.");
                pageStatement.run(Model.createId("document_page"), extractionId, pageNumber, text, hash, timestamp);
            });
            const sectionIds = new Map();
            const sectionStatement = this.db.prepare("INSERT INTO stud_document_sections (id,extraction_id,page_start,page_end,ordinal,heading,section_type,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
            sections.forEach((section, index) => {
                const id = Model.createId("document_section");
                sectionIds.set(section.id || String(index), id);
                sectionStatement.run(id, extractionId, section.pageStart || null, section.pageEnd || null, index, Model.optionalText(section.heading, "Document section heading", 500), Model.requiredText(section.sectionType || "UNSTRUCTURED", "Document section type", 80), Model.enumValue(section.confidence || "LOW", ["LOW", "MEDIUM", "HIGH"], "Document section confidence"), timestamp);
            });
            const chunkStatement = this.db.prepare("INSERT INTO stud_document_chunks (id,extraction_id,section_id,page_start,page_end,ordinal,chunk_type,content,content_hash,provenance_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
            chunks.forEach((chunk, index) => {
                const content = Model.requiredText(chunk.content, "Document chunk", 40000);
                const hash = String(chunk.contentHash || "").toLowerCase();
                if (!/^[a-f0-9]{64}$/.test(hash)) throw new Model.StudError("INVALID_INPUT", "Document chunk hash is invalid.");
                const chunkId = Model.createId("document_chunk");
                const sectionId = chunk.sectionId ? sectionIds.get(chunk.sectionId) || null : null;
                chunkStatement.run(chunkId, extractionId, sectionId, chunk.pageStart || null, chunk.pageEnd || null, index, Model.requiredText(chunk.chunkType || "TEXT", "Document chunk type", 80), content, hash, JSON.stringify({source: "BUILTIN_PDF", pageStart: chunk.pageStart || null, pageEnd: chunk.pageEnd || null}), timestamp);
                this.db.prepare("INSERT INTO stud_document_search (document_id,extraction_id,chunk_id,page_start,section_id,title,content) VALUES (?,?,?,?,?,?,?)").run(document.id, extractionId, chunkId, chunk.pageStart || null, sectionId, document.title, content);
            });
            const referenceStatement = this.db.prepare("INSERT INTO stud_document_references (id,extraction_id,page_number,ordinal,reference_type,value,source_text,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
            references.forEach((reference, index) => referenceStatement.run(Model.createId("document_reference"), extractionId, reference.pageNumber || null, index, Model.requiredText(reference.referenceType || "IDENTIFIER", "Document reference type", 80), Model.requiredText(reference.value, "Document reference value", 1000), Model.optionalText(reference.sourceText, "Document reference source text", 2000), Model.enumValue(reference.confidence || "LOW", ["LOW", "MEDIUM", "HIGH"], "Document reference confidence"), timestamp));
            const updated = this.updateEntity("ACADEMIC_DOCUMENT", document.id, {pageCount: extraction.pageCount || pages.length, extractionStatus: status, extractionEngine: extraction.engine || "PDFJS_BUILT_IN", extractionVersion: extraction.engineVersion || null});
            this.createProvenance({entityType: "ACADEMIC_DOCUMENT", entityId: document.id, field: "extraction", observedValue: status, sourceType: "LOCAL_EXTRACTION", sourceId: extraction.engine || "PDFJS_BUILT_IN", sourceAuthority: "AUTHORITATIVE", observedAt: timestamp, metadata: {extractionId, pageCount: extraction.pageCount || pages.length, rawParserPayloadPersisted: false}});
            return Object.freeze({document: updated, extractionId, status, pages: pages.length, chunks: chunks.length, references: references.length, warnings: Object.freeze(warnings)});
        });
    }

    documentContext(documentId, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["page", "chunkLimit"], "Document context options");
        const document = this.getEntity("ACADEMIC_DOCUMENT", documentId);
        if (!document) throw new Model.StudError("NOT_FOUND", "Academic document does not exist.");
        const extraction = this.db.prepare("SELECT * FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC LIMIT 1").get(document.id);
        if (!extraction) return Object.freeze({document, extraction: null, pages: Object.freeze([]), sections: Object.freeze([]), chunks: Object.freeze([]), references: Object.freeze([]), provenance: this.listProvenance("ACADEMIC_DOCUMENT", document.id), relationships: this.listRelationships("ACADEMIC_DOCUMENT", document.id)});
        const extractionId = extraction.id;
        const page = options.page ? Math.max(1, Math.min(10000, Number(options.page))) : null;
        const chunkLimit = Math.max(1, Math.min(Number(options.chunkLimit) || 100, 500));
        const pages = this.db.prepare(`SELECT * FROM stud_document_pages WHERE extraction_id=?${page ? " AND page_number=?" : ""} ORDER BY page_number LIMIT 500`).all(...(page ? [extractionId, page] : [extractionId])).map(rowToCamel);
        const sections = this.db.prepare("SELECT * FROM stud_document_sections WHERE extraction_id=? ORDER BY ordinal LIMIT 500").all(extractionId).map(rowToCamel);
        const chunks = this.db.prepare(`SELECT * FROM stud_document_chunks WHERE extraction_id=?${page ? " AND page_start<=? AND page_end>=?" : ""} ORDER BY ordinal LIMIT ?`).all(...(page ? [extractionId, page, page, chunkLimit] : [extractionId, chunkLimit])).map(row => ({...rowToCamel(row), provenance: parseJson(row.provenance_json, {})}));
        const references = this.db.prepare(`SELECT * FROM stud_document_references WHERE extraction_id=?${page ? " AND page_number=?" : ""} ORDER BY ordinal LIMIT 500`).all(...(page ? [extractionId, page] : [extractionId])).map(rowToCamel);
        return Object.freeze({document, extraction: Object.freeze({...rowToCamel(extraction), warnings: Object.freeze(parseJson(extraction.warning_json, []))}), pages: Object.freeze(pages), sections: Object.freeze(sections), chunks: Object.freeze(chunks), references: Object.freeze(references), provenance: this.listProvenance("ACADEMIC_DOCUMENT", document.id), relationships: this.listRelationships("ACADEMIC_DOCUMENT", document.id)});
    }

    searchDocumentChunks(query, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["documentId", "limit"], "Document search options");
        const match = Model.normalizedSearchTerms(query);
        const limit = Math.max(1, Math.min(Number(options.limit) || 30, 100));
        const params = [match];
        let where = "stud_document_search MATCH ?";
        if (options.documentId) { where += " AND document_id=?"; params.push(Model.safeId(options.documentId, "Document ID")); }
        params.push(limit);
        const rows = this.db.prepare(`SELECT document_id,chunk_id,page_start,section_id,title,snippet(stud_document_search, 6, '[', ']', '…', 16) AS snippet FROM stud_document_search WHERE ${where} ORDER BY rank LIMIT ?`).all(...params);
        return Object.freeze(rows.map(row => Object.freeze({documentId: row.document_id, chunkId: row.chunk_id, pageStart: row.page_start, sectionId: row.section_id || null, title: row.title, snippet: row.snippet || ""})));
    }

    createDocumentNote(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["documentId", "chunkId", "title", "courseId", "assignmentId"], "Document note");
        const document = this.getEntity("ACADEMIC_DOCUMENT", input.documentId);
        if (!document) throw new Model.StudError("NOT_FOUND", "Academic document does not exist.");
        const chunk = this.db.prepare("SELECT c.*, e.document_id FROM stud_document_chunks c JOIN stud_document_extractions e ON e.id=c.extraction_id WHERE c.id=? AND e.document_id=?").get(Model.safeId(input.chunkId, "Document chunk ID"), document.id);
        if (!chunk) throw new Model.StudError("NOT_FOUND", "Document chunk does not exist.");
        const courseId = input.courseId || document.courseId || null;
        const assignmentId = input.assignmentId || document.assignmentId || null;
        const excerpt = String(chunk.content).slice(0, 4000);
        const note = this.createEntity("NOTE", {title: input.title || `Document note · ${document.title}`, content: excerpt, courseId, assignmentId, documentVersion: 1, documentJson: JSON.stringify({type: "doc", content: [{type: "paragraph", content: [{type: "text", text: excerpt}]}]})});
        this.createRelationship({fromType: "NOTE", fromId: note.id, relationType: "DERIVED_FROM_DOCUMENT", toType: "ACADEMIC_DOCUMENT", toId: document.id, source: "LOCAL_EXTRACTION"});
        this.createProvenance({entityType: "NOTE", entityId: note.id, field: "document.quote", observedValue: excerpt, sourceType: "LOCAL_EXTRACTION", sourceId: document.id, sourceAuthority: "TRUSTED", observedAt: Model.now(), metadata: {chunkId: chunk.id, pageStart: chunk.page_start, pageEnd: chunk.page_end, contentHash: chunk.content_hash}});
        return note;
    }

    createDocumentRevision(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["documentId", "chunkId", "title", "courseId"], "Document revision item");
        const document = this.getEntity("ACADEMIC_DOCUMENT", input.documentId);
        if (!document) throw new Model.StudError("NOT_FOUND", "Academic document does not exist.");
        const chunk = this.db.prepare("SELECT c.*, e.document_id FROM stud_document_chunks c JOIN stud_document_extractions e ON e.id=c.extraction_id WHERE c.id=? AND e.document_id=?").get(Model.safeId(input.chunkId, "Document chunk ID"), document.id);
        if (!chunk) throw new Model.StudError("NOT_FOUND", "Document chunk does not exist.");
        const revision = this.createEntity("REVISION_ITEM", {title: input.title || `Review · ${document.title}`, prompt: `Review this document excerpt (p. ${chunk.page_start || "?"}).`, answer: String(chunk.content).slice(0, 4000), courseId: input.courseId || document.courseId || null, sourceType: "ACADEMIC_DOCUMENT", sourceId: document.id});
        this.createRelationship({fromType: "REVISION_ITEM", fromId: revision.id, relationType: "DERIVED_FROM_DOCUMENT", toType: "ACADEMIC_DOCUMENT", toId: document.id, source: "LOCAL_EXTRACTION"});
        return revision;
    }

    researchLibrary(options = {}) {
        const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
        return this.listEntities("RESEARCH_PAPER", {limit});
    }

    researchContext(paperId) {
        const paper = this.getEntity("RESEARCH_PAPER", paperId);
        if (!paper) throw new Model.StudError("NOT_FOUND", "Research paper does not exist.");
        const identifiers = this.db.prepare("SELECT * FROM stud_external_identifiers WHERE entity_type = 'RESEARCH_PAPER' AND entity_id = ? ORDER BY created_at").all(paper.id).map(rowToCamel);
        return Object.freeze({paper, identifiers: Object.freeze(identifiers), provenance: this.listProvenance("RESEARCH_PAPER", paper.id), relationships: this.listRelationships("RESEARCH_PAPER", paper.id)});
    }

    createProvenance(input = {}) {
        this.initialize();
        const value = Model.normalizeProvenance(input);
        this.requireEntity(value.entityType, value.entityId);
        const id = Model.createId("provenance");
        this.db.prepare("INSERT INTO stud_provenance_records (id,entity_type,entity_id,field,observed_value,source_type,source_id,source_authority,observed_at,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .run(id,value.entityType,value.entityId,value.field,value.observedValue,value.sourceType,value.sourceId,value.sourceAuthority,value.observedAt,value.metadata ? JSON.stringify(value.metadata) : null,Model.now());
        return Object.freeze({id, ...value});
    }

    listProvenance(entityType, entityId, field = null) {
        this.initialize();
        const type = Model.validateEntityType(entityType);
        const id = Model.safeId(entityId, "Provenance entity ID");
        const rows = field
            ? this.db.prepare("SELECT * FROM stud_provenance_records WHERE entity_type = ? AND entity_id = ? AND field = ? ORDER BY observed_at DESC").all(type,id,Model.requiredText(field, "Provenance field", Model.LIMITS.field))
            : this.db.prepare("SELECT * FROM stud_provenance_records WHERE entity_type = ? AND entity_id = ? ORDER BY observed_at DESC").all(type,id);
        return Object.freeze(rows.map(row => Object.freeze({...rowToCamel(row), metadata: parseJson(row.metadata_json, null)})));
    }

    createRelationship(input = {}) {
        this.initialize();
        const value = Model.normalizeRelationship(input);
        if (value.fromType === value.toType && value.fromId === value.toId) throw new Model.StudError("INVALID_RELATIONSHIP", "An academic object cannot relate to itself.");
        this.requireEntity(value.fromType, value.fromId);
        this.requireEntity(value.toType, value.toId);
        const id = Model.createId("relationship");
        try {
            this.db.prepare("INSERT INTO stud_relationships (id,from_type,from_id,relation_type,to_type,to_id,source,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id,value.fromType,value.fromId,value.relationType,value.toType,value.toId,value.source,Model.now());
        } catch (error) {
            if (/UNIQUE/i.test(error.message)) throw new Model.StudError("DUPLICATE_RELATIONSHIP", "This academic relationship already exists.");
            throw error;
        }
        return Object.freeze({id, ...value});
    }

    listRelationships(entityType, entityId) {
        this.initialize();
        const type = Model.validateRelationshipEntityType(entityType);
        const id = Model.safeId(entityId, "Relationship entity ID");
        return Object.freeze(this.db.prepare("SELECT * FROM stud_relationships WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?) ORDER BY created_at DESC").all(type,id,type,id).map(row => Object.freeze(rowToCamel(row))));
    }

    listReferences(entityType, entityId) {
        this.initialize();
        const type = Model.validateEntityType(entityType);
        const id = Model.safeId(entityId, "Reference entity ID");
        this.requireEntity(type, id);
        const rows = this.db.prepare(`
            SELECT r.id AS relationship_id, r.relation_type, r.source, r.created_at,
                e.id AS identifier_id, e.namespace, e.external_id, e.source AS identifier_source
            FROM stud_relationships r
            JOIN stud_external_identifiers e ON e.id = r.to_id
            WHERE r.from_type = ? AND r.from_id = ? AND r.to_type = 'EXTERNAL_IDENTIFIER'
            ORDER BY r.created_at DESC
        `).all(type, id);
        return Object.freeze(rows.map(row => Object.freeze({...rowToCamel(row), kind: row.relation_type === "RELATED_CALENDAR_EVENT" ? "CALENDAR" : row.relation_type === "RELATED_EMAIL" ? "EMAIL" : "REFERENCE"})));
    }

    listOrchestrationLinks(entityType, entityId) {
        this.initialize();
        const type = Model.validateEntityType(entityType);
        const id = Model.safeId(entityId, "Orchestration entity ID");
        this.requireEntity(type, id);
        const rows = this.db.prepare("SELECT * FROM stud_orchestration_links WHERE entity_type=? AND entity_id=? ORDER BY updated_at DESC").all(type, id);
        return Object.freeze(rows.map(row => Object.freeze({...rowToCamel(row), sourceContext: parseJson(row.source_context_json, {})})));
    }

    assignmentOrchestrationContext(assignmentId) {
        this.initialize();
        const assignment = this.getEntity("ASSIGNMENT", assignmentId);
        if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
        const course = assignment.courseId ? this.getEntity("COURSE", assignment.courseId) : null;
        const provenance = this.listProvenance("ASSIGNMENT", assignment.id);
        const references = this.listReferences("ASSIGNMENT", assignment.id);
        const links = this.listOrchestrationLinks("ASSIGNMENT", assignment.id);
        const conflicts = Orchestration.detectConflicts("ASSIGNMENT", provenance);
        const relationships = this.listRelationships("ASSIGNMENT", assignment.id);
        const notes = relationships.filter(item => item.fromType === "ASSIGNMENT" && item.toType === "NOTE").map(item => this.getEntity("NOTE", item.toId)).filter(Boolean);
        const papers = relationships.filter(item => item.fromType === "ASSIGNMENT" && item.toType === "RESEARCH_PAPER").map(item => this.getEntity("RESEARCH_PAPER", item.toId)).filter(Boolean);
        const resources = this.listEntities("RESOURCE", {assignmentId: assignment.id, limit: 100});
        const computeResults = this.listComputeResults({assignmentId: assignment.id, limit: 100});
        const documents = this.listAcademicDocuments({assignmentId: assignment.id, limit: 100});
        const notebooks = this.listNotebooks({assignmentId: assignment.id, limit: 100});
        const datasets = this.listDatasets({assignmentId: assignment.id, limit: 100});
        const repositories = this.listRepositoryReferences({assignmentId: assignment.id, limit: 100});
        const revisions = this.listRevisionItems({assignmentId: assignment.id, limit: 100});
        const status = Orchestration.orchestrationStatus({references, conflicts});
        return Object.freeze({assignment, course, provenance, references, links, conflicts, relationships, notes: Object.freeze(notes), papers: Object.freeze(papers), resources, computeResults, documents, notebooks, datasets, repositories, revisions, status});
    }

    assignmentRequirements(assignmentId) {
        this.initialize();
        const assignment = this.getEntity("ASSIGNMENT", assignmentId);
        if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
        const requirements = [];
        const add = (entry) => {
            if (requirements.length >= 40 || !entry || !entry.value) return;
            const key = `${entry.kind}:${entry.label}:${entry.value}`.toLowerCase();
            if (requirements.some(item => item._key === key)) return;
            requirements.push({...entry, _key: key});
        };
        if (assignment.dueDate) add({kind: "DIRECT_REQUIREMENT", label: "DUE DATE", value: assignment.dueDate, sourceType: "ASSIGNMENT", sourceId: assignment.id, location: "CANONICAL ASSIGNMENT DEADLINE", confidence: "HIGH"});
        if (assignment.weight !== null && assignment.weight !== undefined) add({kind: "DIRECT_REQUIREMENT", label: "WEIGHT", value: `${assignment.weight}%`, sourceType: "ASSIGNMENT", sourceId: assignment.id, location: "CANONICAL ASSIGNMENT METADATA", confidence: "HIGH"});
        const patterns = Object.freeze([
            Object.freeze({label: "WORD COUNT", expression: /\b\d{2,5}(?:\s*[-–]\s*\d{2,5})?\s+words?\b/i, concise: true}),
            Object.freeze({label: "CITATION STYLE", expression: /\b(?:harvard|apa(?:\s*\d+)?|mla|oscola|chicago)\b(?:\s+(?:style|referencing|citation))?/i, concise: true}),
            Object.freeze({label: "LEARNING OUTCOMES", expression: /\bLO(?:['’]?s)?\s*\d+(?:\s*[,/&–-]\s*\d+)*\b/i, concise: true}),
            Object.freeze({label: "DURATION", expression: /\b(?:no more than|maximum(?:\s+length)?(?:\s+of)?|up to)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+minutes?\b/i, concise: true}),
            Object.freeze({label: "ASSESSMENT WEIGHT", expression: /\b\d{1,3}%\s+(?:of|for)\s+(?:the\s+)?(?:portfolio|assessment|module|component|mark)\b/i}),
            Object.freeze({label: "DELIVERABLE", expression: /\b(?:individual appendix|team design report|pre-recorded (?:presentation )?video|presentation slides|essay|report|presentation|portfolio|case study|literature review|reflection|poster|dissertation)\b/i}),
            Object.freeze({label: "SUBMISSION FORMAT", expression: /\b(?:pdf|docx|pptx|mp4|powerpoint|word document)\b/i}),
            Object.freeze({label: "REQUIRED STRUCTURE", expression: /\b(?:required structure(?: and formatting)?|should adhere to the following structure)\b/i}),
            Object.freeze({label: "MARKING CRITERIA", expression: /\b(?:assessment criteria|marking criteria|rubric)\b/i}),
            Object.freeze({label: "FORMATTING", expression: /\b(?:Arial font|\d{1,2}[- ]point font|line spacing of \d(?:\.\d+)?|margins? (?:must|should))\b/i})
        ]);
        const excerpt = (value, match) => {
            if (!match || match.index === undefined) return "";
            const start = Math.max(0, match.index - 90);
            const end = Math.min(value.length, match.index + match[0].length + 150);
            return value.slice(start, end).replace(/^\S*\s*/, start ? "… " : "").replace(/\s*\S*$/, end < value.length ? " …" : "").trim().slice(0, 360);
        };
        const inspect = (text, source) => {
            const value = String(text || "").replace(/\s+/g, " ").trim();
            if (!value) return;
            patterns.forEach(pattern => {
                const match = value.match(pattern.expression);
                if (!match || requirements.filter(item => item.label === pattern.label).length >= 4) return;
                add({kind: source.kind, label: pattern.label, value: pattern.concise ? match[0].slice(0, 240) : excerpt(value, match), sourceType: source.sourceType, sourceId: source.sourceId, location: source.location, confidence: source.confidence});
            });
        };
        inspect(assignment.description, {kind: "DIRECT_REQUIREMENT", sourceType: "ASSIGNMENT", sourceId: assignment.id, location: "ASSIGNMENT DESCRIPTION", confidence: "MEDIUM"});
        const documents = this.listAcademicDocuments({assignmentId: assignment.id, limit: 100});
        documents.forEach(document => {
            const extraction = this.db.prepare("SELECT id FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC LIMIT 1").get(document.id);
            if (!extraction) return;
            const chunks = this.db.prepare("SELECT page_start,content FROM stud_document_chunks WHERE extraction_id=? ORDER BY ordinal LIMIT 120").all(extraction.id);
            chunks.forEach(chunk => inspect(chunk.content, {kind: "EXTRACTED_REQUIREMENT", sourceType: "ACADEMIC_DOCUMENT", sourceId: document.id, location: `DOCUMENT · ${document.title} · PAGE ${chunk.page_start || "?"}`, confidence: "MEDIUM"}));
        });
        const critical = ["WORD COUNT", "CITATION STYLE", "LEARNING OUTCOMES", "SUBMISSION FORMAT", "REQUIRED STRUCTURE", "MARKING CRITERIA"];
        critical.forEach(label => {
            if (!requirements.some(item => item.label === label)) add({kind: "UNKNOWN", label, value: "Not stated in the currently linked assignment material.", sourceType: "LOCAL_STUD", sourceId: assignment.id, location: "LINKED ASSIGNMENT CONTEXT", confidence: "LOW"});
        });
        if (!requirements.length) add({kind: "UNKNOWN", label: "REQUIREMENTS", value: "No direct or bounded extracted requirement is available from the current local assignment material.", sourceType: "LOCAL_STUD", sourceId: assignment.id, location: "LOCAL ACADEMIC CONTEXT", confidence: "LOW"});
        return Object.freeze(requirements.map(({_key, ...entry}) => Object.freeze(entry)));
    }

    recoverInterruptedStudySessions() {
        if (!this.db) return 0;
        const timestamp = Model.now();
        const result = this.db.prepare("UPDATE stud_study_sessions SET status='INTERRUPTED', last_resumed_at=NULL, ended_at=?, updated_at=? WHERE status IN ('STARTED','PAUSED')").run(timestamp, timestamp);
        return Number(result && result.changes || 0);
    }

    revisionRelationships(revisionItemId) {
        return this.listRelationships("REVISION_ITEM", revisionItemId);
    }

    relatedAssignmentsForRevision(revision) {
        const ids = new Set();
        if (revision.sourceType === "ASSIGNMENT" && revision.sourceId) ids.add(revision.sourceId);
        this.revisionRelationships(revision.id).forEach(link => {
            if (link.fromType === "ASSIGNMENT") ids.add(link.fromId);
            if (link.toType === "ASSIGNMENT") ids.add(link.toId);
        });
        return [...ids].map(id => this.getEntity("ASSIGNMENT", id)).filter(Boolean);
    }

    listRevisionItems(options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["courseId", "assignmentId", "status", "priority", "scheduled", "overdue", "query", "sort", "limit", "includeArchived"], "Revision list options");
        const limit = Math.max(1, Math.min(Number(options.limit) || 100, 250));
        const clauses = [options.includeArchived ? "1=1" : "archived_at IS NULL"];
        const params = [];
        if (options.courseId) { clauses.push("course_id=?"); params.push(Model.safeId(options.courseId, "Course ID")); }
        if (options.status && options.status !== "ALL") { clauses.push("status=?"); params.push(Model.enumValue(options.status, Model.REVISION_STATUSES, "Revision status")); }
        if (options.priority && options.priority !== "ALL") { clauses.push("priority=?"); params.push(Model.enumValue(options.priority, Model.PRIORITY_LEVELS, "Revision priority")); }
        if (options.scheduled === "SCHEDULED") clauses.push("scheduled_revision_at IS NOT NULL");
        if (options.scheduled === "UNSCHEDULED") clauses.push("scheduled_revision_at IS NULL");
        if (options.query) { clauses.push("(title LIKE ? OR description LIKE ? OR prompt LIKE ?)"); const text = `%${Model.optionalText(options.query, "Revision query", Model.LIMITS.searchQuery)}%`; params.push(text, text, text); }
        if (options.overdue === true) { clauses.push("COALESCE(scheduled_revision_at,next_planned_revision_at) < ?"); params.push(new Date(localDayStart()).toISOString()); }
        let order = "pinned DESC, CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, COALESCE(scheduled_revision_at,next_planned_revision_at,'9999-12-31') ASC, updated_at DESC";
        if (options.sort === "LAST_STUDIED") order = "last_studied_at DESC, updated_at DESC";
        else if (options.sort === "CREATED") order = "created_at DESC";
        else if (options.sort === "MODIFIED") order = "updated_at DESC";
        else if (options.sort === "TITLE") order = "title COLLATE NOCASE ASC";
        const rows = this.db.prepare(`SELECT * FROM stud_revision_items WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT ?`).all(...params, limit);
        let items = rows.map(row => Object.freeze({...rowToCamel(row), entityType: "REVISION_ITEM"}));
        if (options.assignmentId) {
            const assignmentId = Model.safeId(options.assignmentId, "Assignment ID");
            items = items.filter(item => this.relatedAssignmentsForRevision(item).some(assignment => assignment.id === assignmentId));
        }
        return Object.freeze(items);
    }

    revisionItemContext(revisionItemId, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["historyLimit"], "Revision context options");
        const revision = this.getEntity("REVISION_ITEM", revisionItemId);
        if (!revision) throw new Model.StudError("NOT_FOUND", "Revision item does not exist.");
        const relationships = this.revisionRelationships(revision.id);
        const linked = type => relationships.map(link => {
            const id = link.fromType === type ? link.fromId : link.toType === type ? link.toId : null;
            return id ? this.getEntity(type, id) : null;
        }).filter(Boolean);
        const assignments = this.relatedAssignmentsForRevision(revision);
        const course = revision.courseId ? this.getEntity("COURSE", revision.courseId) : null;
        const history = this.listStudySessions(revision.id, {limit: options.historyLimit || 30, includeCancelled: true});
        const planner = RevisionPlanner.queueReason(revision, new Date(), assignments);
        return Object.freeze({revision, course, assignments: Object.freeze(assignments), notes: Object.freeze(linked("NOTE")), resources: Object.freeze(linked("RESOURCE")), papers: Object.freeze(linked("RESEARCH_PAPER")), relatedRevisionItems: Object.freeze(linked("REVISION_ITEM")), relationships, provenance: this.listProvenance("REVISION_ITEM", revision.id), history, planning: planner});
    }

    revisionOverview(options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["now", "limit"], "Revision overview options");
        const now = options.now ? new Date(Model.optionalDate(options.now, "Revision overview time")) : new Date();
        const limit = Math.max(1, Math.min(Number(options.limit) || 12, 50));
        const rows = this.db.prepare("SELECT * FROM stud_revision_items WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 2500").all();
        const items = rows.map(row => Object.freeze({...rowToCamel(row), entityType: "REVISION_ITEM"}));
        const assignmentsByItem = new Map(items.map(item => [item.id, this.relatedAssignmentsForRevision(item)]));
        return RevisionPlanner.overview(items, assignmentsByItem, now, limit);
    }

    studyPlan(options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["now", "limit"], "Study plan options");
        const now = options.now ? new Date(Model.optionalDate(options.now, "Study plan time")) : new Date();
        const rows = this.db.prepare("SELECT * FROM stud_revision_items WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 2500").all();
        const items = rows.map(row => Object.freeze({...rowToCamel(row), entityType: "REVISION_ITEM"}));
        const assignmentsByItem = new Map(items.map(item => [item.id, this.relatedAssignmentsForRevision(item)]));
        return RevisionPlanner.buildPlan(items, assignmentsByItem, now, options.limit || 24);
    }

    scheduleRevision(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["revisionItemId", "scheduledRevisionAt", "pinned", "planPosition", "dismissSuggestionUntil", "note"], "Revision schedule");
        const item = this.getEntity("REVISION_ITEM", input.revisionItemId);
        if (!item) throw new Model.StudError("NOT_FOUND", "Revision item does not exist.");
        const updates = {};
        if (Object.prototype.hasOwnProperty.call(input, "scheduledRevisionAt")) updates.scheduledRevisionAt = input.scheduledRevisionAt || null;
        if (Object.prototype.hasOwnProperty.call(input, "pinned")) updates.pinned = input.pinned;
        if (Object.prototype.hasOwnProperty.call(input, "planPosition")) updates.planPosition = input.planPosition;
        if (Object.prototype.hasOwnProperty.call(input, "dismissSuggestionUntil")) updates.suggestionDismissedUntil = input.dismissSuggestionUntil || null;
        const updated = this.updateEntity("REVISION_ITEM", item.id, updates);
        const provenance = this.createProvenance({entityType: "REVISION_ITEM", entityId: item.id, field: Object.prototype.hasOwnProperty.call(updates, "scheduledRevisionAt") ? "scheduledRevisionAt" : "planning", observedValue: Object.prototype.hasOwnProperty.call(updates, "scheduledRevisionAt") ? updates.scheduledRevisionAt : JSON.stringify(updates), sourceType: "USER", sourceId: "STUD_REVISION_PLAN", sourceAuthority: "USER_OVERRIDE", observedAt: Model.now(), metadata: {note: Model.optionalText(input.note, "Planning note", 1000), explicit: true}});
        return Object.freeze({revision: updated, provenance});
    }

    listStudySessions(revisionItemId, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["limit", "includeCancelled"], "Study history options");
        const id = Model.safeId(revisionItemId, "Revision item ID");
        const limit = Math.max(1, Math.min(Number(options.limit) || 50, 250));
        const condition = options.includeCancelled ? "1=1" : "status='FINISHED'";
        return Object.freeze(this.db.prepare(`SELECT * FROM stud_study_sessions WHERE revision_item_id=? AND ${condition} ORDER BY started_at DESC LIMIT ?`).all(id, limit).map(row => Object.freeze(rowToCamel(row))));
    }

    activeStudySession(revisionItemId) {
        const id = Model.safeId(revisionItemId, "Revision item ID");
        const row = this.db.prepare("SELECT * FROM stud_study_sessions WHERE revision_item_id=? AND status IN ('STARTED','PAUSED') ORDER BY updated_at DESC LIMIT 1").get(id);
        return row ? Object.freeze(rowToCamel(row)) : null;
    }

    startStudySession(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["revisionItemId"], "Study session start");
        const revision = this.getEntity("REVISION_ITEM", input.revisionItemId);
        if (!revision) throw new Model.StudError("NOT_FOUND", "Revision item does not exist.");
        if (["COMPLETED", "ARCHIVED"].includes(revision.status)) throw new Model.StudError("POLICY_BLOCKED", "Completed or archived revision items cannot start a study session.");
        if (this.activeStudySession(revision.id)) throw new Model.StudError("SESSION_ACTIVE", "This revision item already has an active local study session.");
        const timestamp = Model.now();
        const id = Model.createId("study_session");
        this.db.prepare("INSERT INTO stud_study_sessions (id,revision_item_id,status,started_at,last_resumed_at,elapsed_seconds,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, revision.id, "STARTED", timestamp, timestamp, 0, timestamp, timestamp);
        return Object.freeze(rowToCamel(this.db.prepare("SELECT * FROM stud_study_sessions WHERE id=?").get(id)));
    }

    sessionWithElapsed(session, timestamp = new Date()) {
        let elapsed = Number(session.elapsedSeconds) || 0;
        if (session.status === "STARTED" && session.lastResumedAt) {
            const started = new Date(session.lastResumedAt).getTime();
            if (Number.isFinite(started)) elapsed += Math.max(0, Math.min(8 * 60 * 60, Math.floor((timestamp.getTime() - started) / 1000)));
        }
        return elapsed;
    }

    transitionStudySession(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["sessionId", "action", "difficulty", "confidence", "note", "scheduleNext"], "Study session transition");
        const id = Model.safeId(input.sessionId, "Study session ID");
        const session = rowToCamel(this.db.prepare("SELECT * FROM stud_study_sessions WHERE id=?").get(id));
        if (!session) throw new Model.StudError("NOT_FOUND", "Study session does not exist.");
        const action = Model.enumValue(input.action, ["PAUSE", "RESUME", "FINISH", "CANCEL"], "Study session action");
        const timestamp = new Date();
        if (action === "PAUSE" && session.status !== "STARTED") throw new Model.StudError("INVALID_TRANSITION", "Only a running study session can be paused.");
        if (action === "RESUME" && session.status !== "PAUSED") throw new Model.StudError("INVALID_TRANSITION", "Only a paused study session can resume.");
        if (["FINISH", "CANCEL"].includes(action) && !["STARTED", "PAUSED"].includes(session.status)) throw new Model.StudError("INVALID_TRANSITION", "This study session is no longer active.");
        const elapsed = this.sessionWithElapsed(session, timestamp);
        const at = timestamp.toISOString();
        if (action === "PAUSE") this.db.prepare("UPDATE stud_study_sessions SET status='PAUSED', elapsed_seconds=?, paused_at=?, last_resumed_at=NULL, updated_at=? WHERE id=?").run(elapsed, at, at, id);
        if (action === "RESUME") this.db.prepare("UPDATE stud_study_sessions SET status='STARTED', last_resumed_at=?, paused_at=NULL, updated_at=? WHERE id=?").run(at, at, id);
        if (action === "CANCEL") this.db.prepare("UPDATE stud_study_sessions SET status='CANCELLED', elapsed_seconds=?, last_resumed_at=NULL, ended_at=?, updated_at=? WHERE id=?").run(elapsed, at, at, id);
        let suggestion = null;
        if (action === "FINISH") {
            const confidence = Model.enumValue(input.confidence || "UNKNOWN", Model.REVISION_CONFIDENCE, "Study confidence", "UNKNOWN");
            const difficulty = Model.enumValue(input.difficulty || "UNKNOWN", Model.REVISION_DIFFICULTIES, "Study difficulty", "UNKNOWN");
            const note = Model.optionalText(input.note, "Study note", 1000);
            const revision = this.getEntity("REVISION_ITEM", session.revisionItemId);
            suggestion = input.scheduleNext === true ? RevisionPlanner.spacedRevisionSuggestion(revision, timestamp, confidence) : null;
            this.transaction(() => {
                this.db.prepare("UPDATE stud_study_sessions SET status='FINISHED', elapsed_seconds=?, difficulty=?, confidence=?, note=?, schedule_requested=?, last_resumed_at=NULL, ended_at=?, updated_at=? WHERE id=?").run(elapsed, difficulty, confidence, note, input.scheduleNext === true ? 1 : 0, at, at, id);
                const current = this.getEntity("REVISION_ITEM", revision.id);
                const updates = {accumulatedStudyMinutes: current.accumulatedStudyMinutes + Math.max(0, Math.round(elapsed / 60)), lastStudiedAt: at, difficulty, confidence};
                if (suggestion && !current.scheduledRevisionAt) { updates.nextPlannedRevisionAt = suggestion.nextPlannedRevisionAt; updates.successfulRevisionCount = suggestion.successfulRevisionCount; }
                this.updateEntityRow("REVISION_ITEM", revision.id, Model.normalizeByEntityType("REVISION_ITEM", updates, current), at);
                this.syncSearch("REVISION_ITEM", revision.id);
                this.createProvenance({entityType: "REVISION_ITEM", entityId: revision.id, field: "studySession", observedValue: `${Math.round(elapsed / 60)} minutes`, sourceType: "USER", sourceId: id, sourceAuthority: "AUTHORITATIVE", observedAt: at, metadata: {difficulty, confidence, suggested: suggestion && suggestion.reason || null}});
            });
        }
        return Object.freeze({session: Object.freeze(rowToCamel(this.db.prepare("SELECT * FROM stud_study_sessions WHERE id=?").get(id))), revision: this.getEntity("REVISION_ITEM", session.revisionItemId), suggestion: action === "FINISH" ? suggestion : null});
    }

    proposeReferenceCandidate(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["assignmentId", "kind", "externalId", "title", "courseCode", "dueDate", "startDate", "endDate"], "Academic match candidate");
        const assignment = this.getEntity("ASSIGNMENT", input.assignmentId);
        if (!assignment) throw new Model.StudError("NOT_FOUND", "Assignment does not exist.");
        const kind = Model.enumValue(input.kind, ["CALENDAR", "EMAIL"], "Reference kind");
        const externalId = Model.requiredText(input.externalId, "Reference identifier", Model.LIMITS.identifier);
        const course = assignment.courseId ? this.getEntity("COURSE", assignment.courseId) : null;
        const namespace = kind === "CALENDAR" ? "ICS_UID" : "EMAIL_MESSAGE";
        const knownExternalIds = this.findByExternalIdentifier(namespace, externalId).map(item => item.externalId);
        const candidate = {
            externalId, title: Model.optionalText(input.title, "Candidate title", 240),
            courseCode: Model.optionalText(input.courseCode, "Candidate course code", 80),
            dueDate: input.dueDate ? Model.optionalDate(input.dueDate, "Candidate due date") : null,
            startDate: input.startDate ? Model.optionalDate(input.startDate, "Candidate start date") : null,
            endDate: input.endDate ? Model.optionalDate(input.endDate, "Candidate end date") : null,
            knownExternalIds
        };
        const match = Orchestration.classifyCandidate(assignment, course, candidate);
        return Object.freeze({kind, assignmentId: assignment.id, candidate: Object.freeze({...candidate, knownExternalIds: undefined}), ...match});
    }

    confirmReferenceCandidate(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["assignmentId", "kind", "externalId", "title", "courseCode", "dueDate", "startDate", "endDate", "confirmation"], "Academic match confirmation");
        if (input.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Linking a suggested academic relationship requires explicit confirmation.");
        const {confirmation, ...candidateInput} = input;
        const proposal = this.proposeReferenceCandidate(candidateInput);
        if (proposal.confidence === "UNRESOLVED") throw new Model.StudError("NO_MATCH", "This reference does not have sufficient deterministic context to link.");
        const assignment = this.getEntity("ASSIGNMENT", proposal.assignmentId);
        const link = this.transaction(() => {
            let reference;
            const existing = this.listReferences("ASSIGNMENT", assignment.id).find(item => item.kind === proposal.kind && item.externalId === proposal.candidate.externalId);
            if (existing) reference = Object.freeze({identifier: existing, relationship: null, kind: proposal.kind, existing: true});
            else {
                const namespace = proposal.kind === "CALENDAR" ? "ICS_UID" : "EMAIL_MESSAGE";
                const relationType = proposal.kind === "CALENDAR" ? "RELATED_CALENDAR_EVENT" : "RELATED_EMAIL";
                const identifier = this.createExternalIdentifier({entityType: "ASSIGNMENT", entityId: assignment.id, namespace, externalId: proposal.candidate.externalId, source: proposal.kind});
                const relationship = this.createRelationship({fromType: "ASSIGNMENT", fromId: assignment.id, relationType, toType: "EXTERNAL_IDENTIFIER", toId: identifier.id, source: proposal.kind});
                reference = Object.freeze({identifier, relationship, kind: proposal.kind, existing: false});
            }
            const id = Model.createId("orchestration_link");
            const timestamp = Model.now();
            this.db.prepare(`INSERT INTO stud_orchestration_links (id,entity_type,entity_id,reference_kind,external_id,title,observed_start,observed_end,source_context_json,match_confidence,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(entity_type,entity_id,reference_kind,external_id) DO UPDATE SET title=excluded.title,observed_start=excluded.observed_start,observed_end=excluded.observed_end,source_context_json=excluded.source_context_json,match_confidence=excluded.match_confidence,updated_at=excluded.updated_at`)
                .run(id, "ASSIGNMENT", assignment.id, proposal.kind, proposal.candidate.externalId, proposal.candidate.title || null, proposal.candidate.startDate || proposal.candidate.dueDate || null, proposal.candidate.endDate || null, JSON.stringify({courseCode: proposal.candidate.courseCode || null, signals: proposal.signals, conflicts: proposal.conflicts}), proposal.confidence, timestamp, timestamp);
            if (proposal.candidate.dueDate) this.createProvenance({entityType: "ASSIGNMENT", entityId: assignment.id, field: "dueDate", observedValue: proposal.candidate.dueDate, sourceType: proposal.kind, sourceId: proposal.candidate.externalId, sourceAuthority: proposal.confidence === "EXACT" || proposal.confidence === "STRONG" ? "CORROBORATING" : "SUGGESTED", observedAt: timestamp, metadata: {matchConfidence: proposal.confidence, signals: proposal.signals, conflicts: proposal.conflicts}});
            return {reference, proposal};
        });
        return Object.freeze({...link, context: this.assignmentOrchestrationContext(assignment.id)});
    }

    applyUserOverride(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["entityType", "entityId", "field", "value", "note"], "Academic user override");
        const entityType = Model.validateEntityType(input.entityType);
        const entity = this.getEntity(entityType, input.entityId);
        if (!entity) throw new Model.StudError("NOT_FOUND", "Academic object does not exist.");
        const field = Model.requiredText(input.field, "Override field", Model.LIMITS.field);
        const normalized = Model.normalizeByEntityType(entityType, {[field]: input.value}, entity);
        const value = normalized[field];
        const updated = this.updateEntity(entityType, entity.id, {[field]: value});
        const provenance = this.createProvenance({entityType, entityId: entity.id, field, observedValue: value === null ? null : String(value), sourceType: "USER", sourceId: "STUD_USER_OVERRIDE", sourceAuthority: "USER_OVERRIDE", observedAt: Model.now(), metadata: {note: Model.optionalText(input.note, "Override note", 1000), resolution: "USER_OVERRIDE"}});
        return Object.freeze({entity: updated, provenance});
    }

    linkReference(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["entityType", "entityId", "kind", "externalId"], "Academic reference");
        const entityType = Model.validateEntityType(input.entityType);
        const entityId = Model.safeId(input.entityId, "Reference entity ID");
        const kind = Model.enumValue(input.kind, ["CALENDAR", "EMAIL"], "Reference kind");
        const externalId = Model.requiredText(input.externalId, "Reference identifier", Model.LIMITS.identifier);
        this.requireEntity(entityType, entityId);
        const namespace = kind === "CALENDAR" ? "ICS_UID" : "EMAIL_MESSAGE";
        const relationType = kind === "CALENDAR" ? "RELATED_CALENDAR_EVENT" : "RELATED_EMAIL";
        return this.transaction(() => {
            const identifier = this.createExternalIdentifier({entityType, entityId, namespace, externalId, source: kind});
            const relationship = this.createRelationship({fromType: entityType, fromId: entityId, relationType, toType: "EXTERNAL_IDENTIFIER", toId: identifier.id, source: kind});
            return Object.freeze({identifier, relationship, kind});
        });
    }

    unlinkReference(input = {}) {
        this.initialize();
        Model.assertAllowedKeys(input, ["entityType", "entityId", "identifierId", "confirmation"], "Academic reference unlink");
        if (input.confirmation !== true) throw new Model.StudError("POLICY_BLOCKED", "Unlinking an academic reference requires explicit confirmation.");
        const entityType = Model.validateEntityType(input.entityType);
        const entityId = Model.safeId(input.entityId, "Reference entity ID");
        const identifierId = Model.safeId(input.identifierId, "Reference identifier ID");
        this.requireEntity(entityType, entityId);
        const identifier = this.db.prepare("SELECT id FROM stud_external_identifiers WHERE id = ? AND entity_type = ? AND entity_id = ?").get(identifierId, entityType, entityId);
        if (!identifier) throw new Model.StudError("NOT_FOUND", "Academic reference does not exist.");
        return this.transaction(() => {
            this.db.prepare("DELETE FROM stud_relationships WHERE from_type = ? AND from_id = ? AND to_type = 'EXTERNAL_IDENTIFIER' AND to_id = ?").run(entityType, entityId, identifierId);
            this.db.prepare("DELETE FROM stud_external_identifiers WHERE id = ?").run(identifierId);
            return Object.freeze({identifierId, unlinked: true});
        });
    }

    getCommandCenter(options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["now", "limit"], "Command Center options");
        const now = options.now ? new Date(Model.optionalDate(options.now, "Command Center time")) : new Date();
        const limit = Math.max(1, Math.min(Number(options.limit) || 12, 50));
        const courses = this.listEntities("COURSE", {limit: 100});
        const assignments = this.listEntities("ASSIGNMENT", {limit: 500});
        const start = localDayStart(now).getTime();
        const end = start + 86400000;
        const active = assignments.filter(item => !isCompletedAssignment(item));
        const knownDue = active.filter(item => item.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const today = knownDue.filter(item => {
            const due = new Date(item.dueDate).getTime();
            return due >= start && due < end;
        }).slice(0, limit);
        const upcoming = knownDue.filter(item => new Date(item.dueDate).getTime() >= start).slice(0, limit);
        const priority = active.map(item => Object.freeze({...item, priorityPresentation: derivePriority(item, now)}))
            .sort((a, b) => {
                const order = {URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3};
                return order[a.priorityPresentation] - order[b.priorityPresentation] || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
            }).slice(0, limit);
        const recent = [
            ...this.listEntities("COURSE", {limit: limit * 2}),
            ...this.listEntities("ASSIGNMENT", {limit: limit * 2}),
            ...this.listEntities("NOTE", {limit: limit * 2}),
            ...this.listEntities("RESOURCE", {limit: limit * 2}),
            ...this.listEntities("RESEARCH_PAPER", {limit: limit * 2}),
            ...this.listAcademicDocuments({limit: limit * 2}),
            ...this.listComputeResults({limit: limit * 2}),
            ...this.listNotebooks({limit: limit * 2}),
            ...this.listDatasets({limit: limit * 2}),
            ...this.listRepositoryReferences({limit: limit * 2}),
            ...this.listRevisionItems({limit: limit * 2})
        ].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit);
        const moduleStatus = courses.map(course => {
            const related = assignments.filter(item => item.courseId === course.id && !isCompletedAssignment(item));
            const nearest = related.filter(item => item.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] || null;
            return Object.freeze({...course, activeAssignmentCount: related.length, nearestDueDate: nearest && nearest.dueDate || null});
        });
        const attention = active.slice(0, 150).map(assignment => {
            const provenance = this.listProvenance("ASSIGNMENT", assignment.id);
            const conflicts = Orchestration.detectConflicts("ASSIGNMENT", provenance);
            const references = this.listReferences("ASSIGNMENT", assignment.id);
            return {assignment, conflicts, references, status: Orchestration.orchestrationStatus({references, conflicts})};
        }).filter(item => item.conflicts.length || item.status === "UNMATCHED").slice(0, limit);
        return Object.freeze({today: Object.freeze(today), upcoming: Object.freeze(upcoming), priority: Object.freeze(priority), continue: Object.freeze(recent), moduleStatus: Object.freeze(moduleStatus), attention: Object.freeze(attention), generatedAt: now.toISOString()});
    }

    getCourseContext(courseId, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["limit"], "Course context options");
        const course = this.getEntity("COURSE", courseId);
        if (!course) throw new Model.StudError("NOT_FOUND", "Course does not exist.");
        const limit = Math.max(1, Math.min(Number(options.limit) || 100, 200));
        const assignments = this.listEntities("ASSIGNMENT", {courseId: course.id, limit});
        const resources = this.listEntities("RESOURCE", {courseId: course.id, limit});
        const notes = this.listEntities("NOTE", {courseId: course.id, limit});
        const computeResults = this.listComputeResults({courseId: course.id, limit});
        const documents = this.listAcademicDocuments({courseId: course.id, limit});
        const notebooks = this.listNotebooks({courseId: course.id, limit});
        const datasets = this.listDatasets({courseId: course.id, limit});
        const repositories = this.listRepositoryReferences({courseId: course.id, limit});
        const revisions = this.listRevisionItems({courseId: course.id, limit});
        const relationships = this.listRelationships("COURSE", course.id);
        const papers = relationships.filter(item => item.fromId === course.id ? item.toType === "RESEARCH_PAPER" : item.fromType === "RESEARCH_PAPER")
            .map(item => this.getEntity("RESEARCH_PAPER", item.fromId === course.id ? item.toId : item.fromId)).filter(Boolean).slice(0, limit);
        return Object.freeze({course, assignments, resources, notes, computeResults, documents, notebooks, datasets, repositories, revisions, papers: Object.freeze(papers), references: this.listReferences("COURSE", course.id), provenance: this.listProvenance("COURSE", course.id)});
    }

    search(query, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["entityTypes", "courseId", "limit"], "Search options");
        const match = Model.normalizedSearchTerms(query);
        const types = Array.isArray(options.entityTypes) && options.entityTypes.length
            ? options.entityTypes.map(Model.validateEntityType).filter(type => ["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"].includes(type))
            : ["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE", "REVISION_ITEM", "COMPUTE_RESULT", "ACADEMIC_DOCUMENT", "NOTEBOOK", "DATASET", "REPOSITORY_REFERENCE"];
        if (!types.length) return Object.freeze([]);
        const limit = Math.max(1, Math.min(Number(options.limit) || 30, Model.LIMITS.searchLimit));
        const params = [match];
        const conditions = [`stud_search MATCH ?`, `entity_type IN (${types.map(() => "?").join(",")})`];
        params.push(...types);
        if (options.courseId) { conditions.push("course_id = ?"); params.push(Model.safeId(options.courseId, "Course ID")); }
        params.push(limit);
        const rows = this.db.prepare(`SELECT entity_type, entity_id, course_id, title, snippet(stud_search, 4, '[', ']', '…', 12) AS snippet FROM stud_search WHERE ${conditions.join(" AND ")} ORDER BY rank LIMIT ?`).all(...params);
        return Object.freeze(rows.map(row => Object.freeze({entityType: row.entity_type, entityId: row.entity_id, courseId: row.course_id || null, title: row.title, snippet: row.snippet || ""})));
    }

    buildAcademicContext(rootType, rootId, options = {}) {
        this.initialize();
        return this.intelligence.build(rootType, rootId, options);
    }

    searchAcademicContext(rootType, rootId, query, options = {}) {
        this.initialize();
        return this.intelligence.contextSearch(rootType, rootId, query, options);
    }

    decideAcademicContext(rootType, rootId, candidateType, candidateId, decision, reason = null) {
        this.initialize();
        return this.intelligence.decide(rootType, rootId, candidateType, candidateId, decision, reason);
    }

    createAcademicContextPackage(rootType, rootId, options = {}) {
        this.initialize();
        return this.intelligence.createPackage(rootType, rootId, options);
    }

    listAcademicContextPackages(rootType, rootId, limit = 20) {
        this.initialize();
        return this.intelligence.listPackages(rootType, rootId, limit);
    }

    getAcademicContextPackage(packageId) {
        this.initialize();
        return this.intelligence.getPackage(packageId);
    }
}

module.exports = {StudAcademicStore, TABLES};
