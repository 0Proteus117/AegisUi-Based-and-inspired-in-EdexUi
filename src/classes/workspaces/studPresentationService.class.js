"use strict";
const Model = require("./studAcademicModel.class.js");
const {createHash} = require("crypto");
const TYPES = ["COURSE", "ASSIGNMENT", "RESOURCE", "ACADEMIC_DOCUMENT"];
const hash = text => createHash("sha256").update(text).digest("hex");

class StudPresentationService {
    constructor(store) { this.store = store; this.db = store.db; }
    preference() {
        const row = this.db.prepare("SELECT * FROM stud_navigation_preferences WHERE id=1").get();
        const academicYear = row?.academic_year ?? null;
        const available = academicYear !== null && !!this.db.prepare("SELECT 1 FROM stud_courses WHERE academic_year=? AND archived_at IS NULL LIMIT 1").get(academicYear);
        return {academicYear, available, rowVersion: row?.row_version || 0};
    }
    expect(value, current) {
        if (!Number.isSafeInteger(value) || value < 0) throw new Model.StudError("INVALID_INPUT", "Expected presentation version is required.");
        if (value !== current) throw new Model.StudError("STALE_PRESENTATION_VERSION", "This choice changed. Reload before saving again.");
    }
    chooseYear(input) {
        Model.assertAllowedKeys(input, ["academicYear", "expectedVersion"], "Academic year preference");
        const year = input.academicYear;
        if (year !== null && (typeof year !== "string" || !year.trim() || year.length > 80)) throw new Model.StudError("INVALID_INPUT", "Choose an existing academic year or clear the selection.");
        return this.store.transaction(() => {
            this.expect(input.expectedVersion, this.preference().rowVersion);
            if (year !== null && !this.db.prepare("SELECT 1 FROM stud_courses WHERE academic_year=? AND archived_at IS NULL LIMIT 1").get(year)) throw new Model.StudError("NOT_FOUND", "This academic year has no available courses.");
            this.db.prepare(`INSERT INTO stud_navigation_preferences(id,academic_year,row_version,updated_at) VALUES(1,?,1,?)
                ON CONFLICT(id) DO UPDATE SET academic_year=excluded.academic_year,row_version=row_version+1,updated_at=excluded.updated_at`).run(year, Model.now());
            return this.preference();
        });
    }
    entity(type, id) {
        if (!TYPES.includes(type)) throw new Model.StudError("INVALID_INPUT", "Unsupported display-label object.");
        return this.store.getEntity(type, Model.safeId(id, "Object ID"));
    }
    label(input) {
        Model.assertAllowedKeys(input, ["entityType", "entityId"], "Display label");
        if (!TYPES.includes(input.entityType)) throw new Model.StudError("INVALID_INPUT", "Unsupported display-label object.");
        this.store.requireEntity(input.entityType, Model.safeId(input.entityId, "Object ID"));
        return this.describe(input.entityType, this.entity(input.entityType, input.entityId));
    }
    describe(type, entity) {
        const original = entity.title || entity.displayName || "Untitled";
        const row = this.db.prepare("SELECT * FROM stud_display_labels WHERE entity_type=? AND entity_id=?").get(type, entity.id);
        let label = original, origin = "ORIGINAL", explanation = "Original saved name.";
        if (row?.label) { label = row.label; origin = "USER"; explanation = "Display name chosen by you; the original source is unchanged."; }
        else if (["RESOURCE", "ACADEMIC_DOCUMENT"].includes(type)) {
            const normalized = original.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
            const rules = [
                [/\bmodule specification\b/i, "Module specification"],
                [/\bmodule handbook\b/i, "Module handbook"],
                [/\b(?:assessment|assignment) brief\b/i, "Assessment brief"],
                [/\bmarking (?:criteria|rubric)\b/i, "Marking criteria"],
                [/\breading list\b/i, "Reading list"]
            ];
            const matches = rules.filter(([pattern]) => pattern.test(normalized));
            if (matches.length === 1) { label = matches[0][1]; origin = "TITLE_RULE"; explanation = "Suggested category from words in the original name, not an analysis of the document. Check the original before relying on it."; }
        }
        return {entityType: type, entityId: entity.id, label, original, origin, explanation,
            sourceChanged: !!row?.label && row.source_title_hash !== hash(original), rowVersion: row?.row_version || 0};
    }
    setLabel(input) {
        Model.assertAllowedKeys(input, ["entityType", "entityId", "label", "expectedVersion"], "Display label choice");
        const label = input.label;
        if (label !== null && (typeof label !== "string" || !label.trim() || label.length > 160 || /[\u0000-\u001f\u007f]/.test(label))) throw new Model.StudError("INVALID_INPUT", "Use a name of 1–160 characters, or reset it.");
        return this.store.transaction(() => {
            const current = this.label({entityType: input.entityType, entityId: input.entityId});
            this.expect(input.expectedVersion, current.rowVersion);
            this.db.prepare(`INSERT INTO stud_display_labels(entity_type,entity_id,label,source_title_hash,row_version,updated_at) VALUES(?,?,?,?,1,?)
                ON CONFLICT(entity_type,entity_id) DO UPDATE SET label=excluded.label,source_title_hash=excluded.source_title_hash,row_version=row_version+1,updated_at=excluded.updated_at`)
                .run(input.entityType, input.entityId, label === null ? null : label.trim(), hash(current.original), Model.now());
            return this.label({entityType: input.entityType, entityId: input.entityId});
        });
    }
}
module.exports = {StudPresentationService};
