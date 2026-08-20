# STUD Moodle synchronization and provenance

## Explicit mapping

Moodle synchronization is not a second data model. It maps selected normalized
observations into canonical STUD objects:

| Moodle observation | Canonical object | Provider-owned fields |
| --- | --- | --- |
| enrolled course | Course | title, code, short name, description, dates, status |
| assignment | Assignment | title, description, availability, due/cutoff, status, submission status |
| grade item | Assignment | grade, grade maximum, feedback when provided |
| course content module | Resource | title, type, safe same-host reference, module context |
| completion response | Course provenance | completion observation |
| ICS event | Assignment | title, description, bounded dates, status |

External identifiers are namespaced (`MOODLE_COURSE`, `MOODLE_ASSIGNMENT`,
`MOODLE_RESOURCE`, `MOODLE_ICS_ASSIGNMENT`) and never replace stable local
STUD IDs. Each accepted field produces a provenance record with source type
`MOODLE` or `MOODLE_ICS`, source ID and observation time.

## Conflict and retention rules

An explicit authoritative `USER` observation wins as the canonical display
value over a later provider observation. The conflicting Moodle value remains
in provenance for review; AegisUi does not silently decide which source is
correct. A remote object disappearing from a later sync never deletes or
archives the local object automatically.

Course-resource links are normalized as bounded references. Moodle HTML
is converted to display text and same-host URLs preserve only numeric Moodle
object identifiers (`id`, `course`, `section`, `cmid`); all other query values
and fragments, including session/token values, are removed before persistence.
Files explicitly exposed by the read service are downloaded only during a
user-initiated or user-enabled bounded sync into managed STUD storage. Each file
keeps SHA-256, MIME type and provider provenance. Token-bearing download URLs
exist only in memory and the provider's raw payload is never persisted. PDF
interpretation remains a separate explicit indexing action.

The lightweight capability probe checks the core contract without repeating a
full course traversal. An `UNKNOWN` result from that lightweight probe does not
erase a deeper capability already demonstrated by a successful explicit full
sync. A later full sync can still change the stored state when the corresponding
read actually succeeds or fails.

Managed-file reconciliation is incremental. A file with the same stable Moodle
identifier, declared hash/size and existing managed copy is not downloaded
again. Changed or missing files are retrieved through the fixed official Moodle
file endpoint and replace only their normalized managed observation; temporary
download credentials remain memory-only.

## Calendar separation

Moodle calendar results can help inform an Assignment but do not create,
update or delete entries in Aegis Calendar. The same rule applies to ICS.
