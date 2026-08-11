# STUD Phase 1 validation (preserved baseline)

Phase 2 retains the SQLite/IPC/FTS contract and advances its schema to v2 for
explicit Assignment priority. Phase 2 UI validation is recorded separately in
`STUD_PHASE2_VALIDATION.md`.

## Repository audit

At v2.6.0 STUD was a foundation placeholder with external quick links and no
academic state, SQLite dependency, persistence or dedicated renderer path.
Calendar is owned by the existing macOS helper. No Email subsystem offered a
safe academic persistence contract. OSINT architectural lessons were reused
only conceptually: normalized records, explicit persistence, provenance and
bounded relationships. STUD does not use OSINT Case storage.

## Validation scope

`scripts/test-stud-academic-core.js` uses only synthetic temporary data and
verifies schema initialization/migration, restart persistence, CRUD, archive,
external-ID uniqueness, field-level multiple observations, conflict-ready
representation, relationship integrity, Calendar/Email reference contracts,
FTS5 updates/archive filtering, transaction rollback, IPC sender validation,
offline/no-fetch behavior and a stress dataset of 50 Courses, 500 Assignments,
1,000 Resources, 1,000 Notes and 2,000 Papers.

`scripts/test-stud-workspace.js` verifies the active STUD workspace, main
process boundary, current UI controls, no native provider/network surface and
responsive theme CSS ownership. Existing broad regression and release-health
checks include both tests.

## Visual matrix

Development Electron validation used synthetic records only at 1680x1050 @2x
(Dark), 1440x900 @2x (Light), and 1200x780 @1x (Dark compact). Every check
confirmed the six STUD panels are present, inputs remain inside their owning
panel, there is no horizontal overflow, and compact mode scrolls the command
deck instead of allowing a long form to overlap the next panel. The same
semantic tokens service Light and System appearance; no fixed-dark nested
surface was introduced.

The broad regression suite passed all STUD, theme, Calendar packaging,
Assistant, ENG and OSINT checks. Its only failure remains inherited provider
environment state: TomTom HTTP 401 and a missing AISStream key. Neither is
read, changed or required by STUD.

## Offline and privacy result

No Phase 1 operation makes a network request. The database belongs in
application user data and is never tracked. Synthetic test databases are
temporary and removed by the test. The store holds no credentials, raw email
body, calendar event copy or filesystem path. The original source/assets and
unrelated Aegis workspaces remain outside the STUD data model.

## Intentional deferrals

Moodle import, research providers, document ingestion/PDF.js, rich notes,
revision scheduling, AI/RAG, automatic Calendar creation and Email sync remain
out of scope for Phase 1.
