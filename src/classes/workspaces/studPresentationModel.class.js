"use strict";

// Presentation choices are not provider metadata or academic review decisions.
const SCHEMA_SQL = `
CREATE TABLE stud_navigation_preferences (
    id INTEGER PRIMARY KEY CHECK(id=1),
    academic_year TEXT CHECK(academic_year IS NULL OR length(academic_year) BETWEEN 1 AND 80),
    row_version INTEGER NOT NULL CHECK(row_version>=1),
    updated_at TEXT NOT NULL
);
CREATE TABLE stud_display_labels (
    entity_type TEXT NOT NULL CHECK(entity_type IN ('COURSE','ASSIGNMENT','RESOURCE','ACADEMIC_DOCUMENT')),
    entity_id TEXT NOT NULL,
    label TEXT CHECK(label IS NULL OR length(label) BETWEEN 1 AND 160),
    source_title_hash TEXT NOT NULL,
    row_version INTEGER NOT NULL CHECK(row_version>=1),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(entity_type,entity_id)
);
`;

module.exports = {SCHEMA_SQL};
