# STUD data, provenance, relationships and search

## Canonical objects

| Object | Canonical role |
| --- | --- |
| Course | Local module/course context, dates and status. |
| Assignment | First-class convergence object; course, deadlines, submission, explicit 0–100 local progress and optional manual priority remain local/optional. |
| Resource | Bounded title/type/URL or safe local reference metadata; no file ingestion. |
| ResearchPaper | Local bibliographic shell; no research-provider request. |
| Note | Lightweight title/content placeholder for a future rich editor. |
| RevisionItem | Prompt/answer storage only; no fake scheduling behavior. |
| AcademicDocument | Explicit managed local document metadata and bounded PDF.js extraction. |
| ComputeResult | Explicit local deterministic calculation record. |
| Notebook | Explicit local Markdown/code/raw academic record; base execution is editing-only. |
| Dataset | Explicit managed CSV/TSV metadata, checksum, bounded schema and summary. |
| RepositoryReference | Explicit public GitHub reference and optional normalized metadata. |
| ToolPreference | Explicit local favorite/hide/pin/used state for one shipped catalog entry. |
| DisciplineProfile | Explicit local ordering preference for catalog disciplines only. |
| ExternalIdentifier | Normalized namespace/value reference such as `ICS_UID`, `DOI` or future Moodle IDs. |

All canonical records have stable `stud_<type>_...` IDs, timestamps and an
archive state. Archiving removes the record from normal lists and FTS5 instead
of casually deleting related academic history.

## Tool catalog metadata and preferences

Catalog entries and discipline packs are application-owned versioned metadata,
not mutable academic records. Their stable IDs are validated before use. Schema
v13 keeps only user-owned `stud_tool_preferences` and
`stud_discipline_profile` rows. A hidden catalog entry is still present in the
registry, and reset deletes preferences rather than metadata. Neither table is
indexed by academic FTS5 or sent to a provider.

## Field-level provenance

`stud_provenance_records` describes an observed value independently of a
canonical object value. It records entity, field, observed value, source type,
source ID, authority and observed time. Multiple records for the same field are
valid: corroborating and conflicting observations stay visible; STUD never
resolves them automatically.

Source types: `USER`, `MOODLE`, `MOODLE_ICS`, `CALENDAR`, `EMAIL`, `COURSE_DOCUMENT`,
`RESEARCH_PROVIDER`, `GITHUB`, `LOCAL_EXTRACTION`, `AI_SUGGESTION`, `IMPORT`, `UNKNOWN`.
Authority is explicit: `AUTHORITATIVE`, `TRUSTED`, `CORROBORATING`, `INFERRED`,
`SUGGESTED` or `UNKNOWN`.

## Relationships

Relationships are normalized and require valid endpoints. STUD supports
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

## Academic Intelligence and Workbench (schema v10–v11)

Schema v10 adds `stud_academic_concepts`, provenance-aware
`stud_concept_observations`, explicit `stud_context_decisions` and inspectable
`stud_context_packages`. They are an extension of the same local SQLite model,
not a graph database or localStorage cache. Concept observations may originate
from canonical metadata or already persisted document chunks; they record their
source entity, extraction method and page/chunk when available.

Context decisions are explicit `INCLUDE`, `EXCLUDE` or `PIN` choices made by
the student for one root/candidate pair. They do not alter the linked object or
external system. A Context Package is a bounded local snapshot with omitted
items recorded; it does not invoke an assistant, model or provider.

## Local Academic AI package consumption

Phase 10 does not add a second database table or change the canonical schema.
It upgrades the inspectable package snapshot to include bounded selected text
fragments alongside document chunks. Those fragments are generated only from
the package's already selected canonical records, never from a free database
scan. The Local Academic AI runtime reads one selected package and keeps its
retrieval trace, model response and revision suggestions in process memory.
Only an explicit Save as Note or Accept as Revision Item action reuses the
existing canonical persistence and records `AI_SUGGESTION` provenance.

Schema v11 adds `stud_notebooks`, `stud_notebook_cells`,
`stud_notebook_outputs`, `stud_datasets` and `stud_repository_references` with
foreign-key context fields and normal explicit relationships. Notebook outputs
are bounded normalized records reserved for a future approved engine; Phase 11
does not create fabricated execution output. Dataset managed references are
relative to `userData/stud` and validated before read. Repository metadata is
stored only after an explicit fixed-adapter request and never contains tokens
or raw provider payloads.

## Moodle normalization

Schema v4 adds a non-secret `stud_provider_instances` record for configured
provider status, capability observations and sync timestamps. It deliberately
does not include a token, password, cookie, ICS URL or raw provider response.
Moodle course, assignment, resource and ICS identifiers use namespaced
external identifiers while canonical STUD IDs remain stable. Moodle and ICS
observations create field-level provenance records; an explicit `USER`
observation remains the canonical value when it conflicts with a later
provider observation. A missing remote object never triggers a destructive
local deletion.

## Future economics metadata

The model reserves provider economics without creating a provider catalog:
`FREE_OPEN`, `FREE_LOCAL`, `FREE_SERVICE`, `FREEMIUM`, `PAID`, `SUBSCRIPTION`.
Core STUD workflows require none of them.

## Command Center derivations

Schema v2 stores an optional Assignment priority (`URGENT`, `HIGH`, `NORMAL`,
`LOW`). When absent, Overview presents a deterministic deadline-based priority;
it does not write an inferred value back to the record. `localProgress` is
validated as a number from 0 to 100 and is never derived from completion,
grade or timeline activity.
# Phase 12 — assignment grade representation

Schema v12 extends the canonical Assignment with `gradeScheme` and `gradeText`.
Supported schemes are `PERCENTAGE`, `POINTS`, `TEXT`, `PASS_FAIL` and `UNKNOWN`.
They preserve the source representation; they do not infer a conversion for
letters or pass/fail results. Progress calculations are derived at read time.
