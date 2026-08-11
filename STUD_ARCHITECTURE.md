# STUD academic core

STUD is AegisUi's canonical, local-first academic context. It owns academic
objects and their provenance; it does not own Moodle, Calendar, Email, Zotero
or any commercial service.

## Local store

The canonical store is SQLite FTS5 through Node's bundled `node:sqlite` API.
No native npm package was introduced: this avoids a separate Apple Silicon
binary and keeps the local database compatible with Electron's Node runtime.
The database is created only at `userData/stud/academic.sqlite`, never in the
repository, source tree or public assets. WAL mode and transactional migrations
are enabled. A migration failure surfaces `MIGRATION_FAILED` without deleting
the existing database.

The renderer uses only narrowly allowlisted `stud-*` IPC methods. SQLite is
opened in the main process; the renderer has no direct SQL, filesystem path or
network capability.

## Phase 1 model

Canonical IDs are generated locally and remain independent of external
systems. Phase 1 stores Course, Assignment, Resource, ResearchPaper, Note and
RevisionItem records. External identifiers remain separate, so a future Moodle
ID, ICS UID, DOI or Zotero key never becomes a primary key.

The compact STUD surface is a validation harness, not a replacement Student
Command Center. It creates/selects/edits Courses and Assignments, creates and
links local Notes/Resources, shows field provenance and queries FTS5.

## Boundaries

Calendar and Email may be linked through a bounded ExternalIdentifier and a
relationship such as `RELATED_CALENDAR_EVENT` or `RELATED_EMAIL`. STUD does not
copy events, mail bodies, credentials, OAuth data or create Calendar deadlines.
There is no Moodle, provider, research API, file ingestion, PDF viewer, rich
editor, FSRS scheduler, AI/RAG or network dependency in Phase 1.

Detailed model, provenance, relationships and search behavior are in
[STUD_DATA_MODEL.md](STUD_DATA_MODEL.md) and validation evidence is in
[STUD_PHASE1_VALIDATION.md](STUD_PHASE1_VALIDATION.md).
