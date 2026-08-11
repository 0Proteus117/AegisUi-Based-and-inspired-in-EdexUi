"use strict";

const fs = require("fs");
const path = require("path");
const {DatabaseSync} = require("node:sqlite");
const Model = require("./studAcademicModel.class.js");

const TABLES = Object.freeze({
    COURSE: "stud_courses",
    ASSIGNMENT: "stud_assignments",
    RESOURCE: "stud_resources",
    RESEARCH_PAPER: "stud_research_papers",
    NOTE: "stud_notes",
    REVISION_ITEM: "stud_revision_items"
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
        result[camel] = value;
    });
    return result;
}

function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

class StudAcademicStore {
    constructor(options = {}) {
        if (!options.root) throw new Model.StudError("STORAGE_UNAVAILABLE", "Academic storage root is unavailable.");
        this.root = path.resolve(options.root);
        this.dbPath = path.join(this.root, "academic.sqlite");
        this.applicationVersion = options.applicationVersion || "unknown";
        this.db = null;
    }

    initialize() {
        if (this.db) return this;
        fs.mkdirSync(this.root, {recursive: true, mode: 0o700});
        try {
            this.db = new DatabaseSync(this.dbPath);
            this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
            this.runMigrations();
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

    transaction(work) {
        this.initialize();
        try {
            this.db.exec("BEGIN IMMEDIATE;");
            const value = work();
            this.db.exec("COMMIT;");
            return value;
        } catch (error) {
            try { this.db.exec("ROLLBACK;"); } catch (rollbackError) {}
            throw error;
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
        if (entityType === "ASSIGNMENT" && options.courseId) { where += " AND course_id = ?"; params.push(Model.safeId(options.courseId, "Course ID")); }
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
        if (entityType === "REVISION_ITEM" && value.sourceType && value.sourceId) this.requireEntity(value.sourceType, value.sourceId);
    }

    insertEntity(type, id, value, timestamp) {
        switch (type) {
        case "COURSE": this.db.prepare("INSERT INTO stud_courses (id,title,short_name,code,description,start_date,end_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id,value.title,value.shortName,value.code,value.description,value.startDate,value.endDate,value.status,timestamp,timestamp); break;
        case "ASSIGNMENT": this.db.prepare("INSERT INTO stud_assignments (id,course_id,title,description,release_date,due_date,cutoff_date,status,submission_status,submitted_at,grade,grade_maximum,weight,feedback,local_progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,value.courseId,value.title,value.description,value.releaseDate,value.dueDate,value.cutoffDate,value.status,value.submissionStatus,value.submittedAt,value.grade,value.gradeMaximum,value.weight,value.feedback,value.localProgress,timestamp,timestamp); break;
        case "RESOURCE": this.db.prepare("INSERT INTO stud_resources (id,course_id,assignment_id,type,title,url,local_reference,mime_type,checksum,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id,value.courseId,value.assignmentId,value.type,value.title,value.url,value.localReference,value.mimeType,value.checksum,timestamp,timestamp); break;
        case "RESEARCH_PAPER": this.db.prepare("INSERT INTO stud_research_papers (id,title,year,abstract,venue,authors,local_document_reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id,value.title,value.year,value.abstract,value.venue,value.authors,value.localDocumentReference,timestamp,timestamp); break;
        case "NOTE": this.db.prepare("INSERT INTO stud_notes (id,title,content,course_id,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id,value.title,value.content,value.courseId,timestamp,timestamp); break;
        case "REVISION_ITEM": this.db.prepare("INSERT INTO stud_revision_items (id,course_id,prompt,answer,source_type,source_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id,value.courseId,value.prompt,value.answer,value.sourceType,value.sourceId,timestamp,timestamp); break;
        }
    }

    updateEntityRow(type, id, value, timestamp) {
        switch (type) {
        case "COURSE": this.db.prepare("UPDATE stud_courses SET title=?,short_name=?,code=?,description=?,start_date=?,end_date=?,status=?,updated_at=? WHERE id=?").run(value.title,value.shortName,value.code,value.description,value.startDate,value.endDate,value.status,timestamp,id); break;
        case "ASSIGNMENT": this.db.prepare("UPDATE stud_assignments SET course_id=?,title=?,description=?,release_date=?,due_date=?,cutoff_date=?,status=?,submission_status=?,submitted_at=?,grade=?,grade_maximum=?,weight=?,feedback=?,local_progress=?,updated_at=? WHERE id=?").run(value.courseId,value.title,value.description,value.releaseDate,value.dueDate,value.cutoffDate,value.status,value.submissionStatus,value.submittedAt,value.grade,value.gradeMaximum,value.weight,value.feedback,value.localProgress,timestamp,id); break;
        case "RESOURCE": this.db.prepare("UPDATE stud_resources SET course_id=?,assignment_id=?,type=?,title=?,url=?,local_reference=?,mime_type=?,checksum=?,updated_at=? WHERE id=?").run(value.courseId,value.assignmentId,value.type,value.title,value.url,value.localReference,value.mimeType,value.checksum,timestamp,id); break;
        case "RESEARCH_PAPER": this.db.prepare("UPDATE stud_research_papers SET title=?,year=?,abstract=?,venue=?,authors=?,local_document_reference=?,updated_at=? WHERE id=?").run(value.title,value.year,value.abstract,value.venue,value.authors,value.localDocumentReference,timestamp,id); break;
        case "NOTE": this.db.prepare("UPDATE stud_notes SET title=?,content=?,course_id=?,updated_at=? WHERE id=?").run(value.title,value.content,value.courseId,timestamp,id); break;
        case "REVISION_ITEM": this.db.prepare("UPDATE stud_revision_items SET course_id=?,prompt=?,answer=?,source_type=?,source_id=?,updated_at=? WHERE id=?").run(value.courseId,value.prompt,value.answer,value.sourceType,value.sourceId,timestamp,id); break;
        }
    }

    syncSearch(type, id) {
        const entity = this.getEntity(type, id);
        this.db.prepare("DELETE FROM stud_search WHERE entity_type = ? AND entity_id = ?").run(type, id);
        if (!entity || !["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE"].includes(type)) return;
        const content = cleanText([entity.description, entity.abstract, entity.content, entity.code, entity.authors, entity.venue].filter(Boolean).join(" "));
        this.db.prepare("INSERT INTO stud_search (entity_type,entity_id,course_id,title,content) VALUES (?,?,?,?,?)").run(type, id, entity.courseId || "", entity.title || "", content);
    }

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

    search(query, options = {}) {
        this.initialize();
        Model.assertAllowedKeys(options, ["entityTypes", "courseId", "limit"], "Search options");
        const match = Model.normalizedSearchTerms(query);
        const types = Array.isArray(options.entityTypes) && options.entityTypes.length
            ? options.entityTypes.map(Model.validateEntityType).filter(type => ["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE"].includes(type))
            : ["COURSE", "ASSIGNMENT", "RESOURCE", "RESEARCH_PAPER", "NOTE"];
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
}

module.exports = {StudAcademicStore, TABLES};
