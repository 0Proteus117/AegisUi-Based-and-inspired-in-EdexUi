# STUD data, provenance, relationships and search

## Canonical objects

| Object | Phase 1 role |
| --- | --- |
| Course | Local module/course context, dates and status. |
| Assignment | First-class convergence object; course, deadlines, submission and local progress remain optional. |
| Resource | Bounded title/type/URL or safe local reference metadata; no file ingestion. |
| ResearchPaper | Local bibliographic shell; no research-provider request. |
| Note | Lightweight title/content placeholder for a future rich editor. |
| RevisionItem | Prompt/answer storage only; no fake scheduling behavior. |
| ExternalIdentifier | Normalized namespace/value reference such as `ICS_UID`, `DOI` or future Moodle IDs. |

All canonical records have stable `stud_<type>_...` IDs, timestamps and an
archive state. Archiving removes the record from normal lists and FTS5 instead
of casually deleting related academic history.

## Field-level provenance

`stud_provenance_records` describes an observed value independently of a
canonical object value. It records entity, field, observed value, source type,
source ID, authority and observed time. Multiple records for the same field are
valid: corroborating and conflicting observations stay visible; Phase 1 never
resolves them automatically.

Source types: `USER`, `MOODLE`, `CALENDAR`, `EMAIL`, `COURSE_DOCUMENT`,
`RESEARCH_PROVIDER`, `LOCAL_EXTRACTION`, `AI_SUGGESTION`, `IMPORT`, `UNKNOWN`.
Authority is explicit: `AUTHORITATIVE`, `TRUSTED`, `CORROBORATING`, `INFERRED`,
`SUGGESTED` or `UNKNOWN`.

## Relationships

Relationships are normalized and require valid endpoints. Phase 1 supports
`BELONGS_TO`, `RELATES_TO`, `SUPPORTS`, `USES`, `REFERENCES`, `HAS_RESOURCE`,
`HAS_NOTE`, `HAS_PAPER`, `RELATED_EMAIL` and `RELATED_CALENDAR_EVENT`.
Calendar and Email references target an ExternalIdentifier, not duplicated
records. Self-relationships and duplicate relationships are rejected.

## FTS5

SQLite FTS5 indexes only Course title/code/description, Assignment
title/description, Resource title, Paper title/abstract and Note title/content.
Queries are tokenized locally, parameterized, bounded to 100 results and may
filter by canonical entity types and Course ID. Credentials, hidden metadata,
raw email content and filesystem paths are not indexed.

## Future economics metadata

The model reserves provider economics without creating a provider catalog:
`FREE_OPEN`, `FREE_LOCAL`, `FREE_SERVICE`, `FREEMIUM`, `PAID`, `SUBSCRIPTION`.
Core STUD workflows require none of them.
