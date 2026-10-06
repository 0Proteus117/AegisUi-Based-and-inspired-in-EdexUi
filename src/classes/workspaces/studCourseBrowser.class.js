"use strict";

// Read-only, paged academic navigation. No provider access, inferred years,
// relationship writes or independent persistence layer.
const Model = require("./studAcademicModel.class.js");
class StudCourseBrowser {
    constructor(store) { this.store = store; this.db = store.db; }
    read(input) {
        Model.assertAllowedKeys(input, ["browse", "academicYear", "courseId", "kind", "limit", "offset", "query"], "Course browser");
        if (!["YEARS", "COURSES", "CONTENT"].includes(input.browse)) throw new Model.StudError("INVALID_INPUT", "Unknown course browser view.");
        const limit = input.limit === undefined ? 40 : input.limit, offset = input.offset === undefined ? 0 : input.offset;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000000) throw new Model.StudError("INVALID_INPUT", "Invalid page bounds.");
        const query = input.query === undefined ? "" : input.query;
        if (typeof query !== "string" || query.length > 120) throw new Model.StudError("INVALID_INPUT", "Invalid course search.");
        const page = (items, total) => Object.freeze({items: Object.freeze(items), total, offset, limit, nextOffset: offset + items.length < total ? offset + items.length : null});
        if (input.browse === "YEARS") {
            const total = this.db.prepare("SELECT count(*) n FROM (SELECT academic_year FROM stud_courses WHERE archived_at IS NULL GROUP BY academic_year)").get().n;
            const items = this.db.prepare("SELECT academic_year academicYear,count(*) courseCount FROM stud_courses WHERE archived_at IS NULL GROUP BY academic_year ORDER BY academic_year IS NULL,academic_year DESC LIMIT ? OFFSET ?").all(limit, offset);
            return page(items, total);
        }
        if (input.browse === "COURSES") {
            if (!Object.hasOwn(input, "academicYear") || (input.academicYear !== null && (typeof input.academicYear !== "string" || !input.academicYear.trim() || input.academicYear.length > 80))) throw new Model.StudError("INVALID_INPUT", "Choose a stored academic year.");
            const params = [input.academicYear, query, query, query];
            const where = "archived_at IS NULL AND academic_year IS ? AND (?='' OR instr(lower(title),lower(?))>0 OR instr(lower(COALESCE(code,'')),lower(?))>0)";
            const total = this.db.prepare(`SELECT count(*) n FROM stud_courses WHERE ${where}`).get(...params).n;
            const rows = this.db.prepare(`SELECT id FROM stud_courses WHERE ${where} ORDER BY academic_term IS NULL,academic_term COLLATE NOCASE,title COLLATE NOCASE,id LIMIT ? OFFSET ?`).all(...params, limit, offset);
            return page(rows.map(row => this.store.getEntity("COURSE", row.id)), total);
        }
        const courseId = Model.safeId(input.courseId, "Course ID");
        this.store.requireEntity("COURSE", courseId);
        const course = this.store.getEntity("COURSE", courseId);
        const definitions = {ASSIGNMENT: "stud_assignments", RESOURCE: "stud_resources", ACADEMIC_DOCUMENT: "stud_academic_documents"};
        if (!Object.hasOwn(definitions, input.kind)) throw new Model.StudError("INVALID_INPUT", "Unsupported course content.");
        const table = definitions[input.kind]; // fixed allowlist, never renderer SQL
        const counts = {};
        for (const [kind, name] of Object.entries(definitions)) counts[kind] = this.db.prepare(`SELECT count(*) n FROM ${name} WHERE course_id=? AND archived_at IS NULL`).get(course.id).n;
        const order = input.kind === "ASSIGNMENT" ? "due_date IS NULL,due_date,title COLLATE NOCASE,id" : "title COLLATE NOCASE,id";
        const rows = this.db.prepare(`SELECT id FROM ${table} WHERE course_id=? AND archived_at IS NULL ORDER BY ${order} LIMIT ? OFFSET ?`).all(course.id, limit, offset);
        return Object.freeze({...page(rows.map(row => this.store.getEntity(input.kind, row.id)), counts[input.kind]), course, counts});
    }
}
module.exports = {StudCourseBrowser};
