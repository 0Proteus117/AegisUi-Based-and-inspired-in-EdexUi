# STUD v2.7.0 Reality Pass — Technical and UX Audit

## Baseline audited

- Base release: `v2.6.14` / `b159e3a`.
- Canonical academic store: SQLite, schema v13 before this pass.
- Existing boundaries: Moodle read-only adapter, macOS `safeStorage` credential vault, managed document storage, Document Intelligence, local academic context, notes, citations, revision, progress and local-AI context packages.

## Findings

1. Moodle configuration and sanctioned token handling existed, but the operational sync was intentionally small: it only inspected a narrow course subset and retained resource metadata rather than managed academic files.
2. The previous renderer exposed fourteen peer-level navigation choices. This made a student choose implementation capabilities before choosing the academic task.
3. The command centre repeated technical status cards while its assignment and course journeys were comparatively hidden.
4. Managed PDFs already had a safe local viewer and Document Intelligence pipeline, but Moodle-originated documents were not surfaced as an explicit download-then-index workflow.
5. Assignment data contained enough canonical relationships to guide work, but no compact object-centred roadmap or explainable, bounded requirement readout.

## Structural response

- Moodle is now a persistent integration: base configuration, stable remote identifiers, minimal sync metadata and user preferences persist locally; the sanctioned Web Service token remains encrypted only in the existing macOS safe-storage vault.
- A user-initiated sync is bounded but no longer limited to twenty courses. It reconciles accessible courses, assignments, statuses, grades, feedback, course resources, calendar observations and public forum/announcement containers only when the service exposes them.
- Explicit Moodle file downloads are held in managed STUD storage with a SHA-256, MIME type and provider provenance. Temporary token-bearing file URLs are constructed only in memory and never enter SQLite, logs, screenshots or canonical records.
- Download and interpretation are separate: PDFs are `READY FOR INDEX` until the analyst selects **INDEX ALL COURSE MATERIAL** or analyzes a document individually.
- Primary STUD navigation now groups the existing capabilities around HOME, COURSES, WORK, LIBRARY, STUDY and TOOLS; the secondary navigation remains contextual instead of removing functionality.
- Assignment default detail now prioritizes deadline, local roadmap, bounded requirement observations and next actions. Editing, grades, raw/local fields and other inspector information are disclosed progressively.

## Privacy and security invariants

- No university password, copied browser cookie, browser session or temporary signed URL is stored.
- `FORGET MOODLE ACCOUNT` deletes secure Moodle credentials and disables future automatic sync; it does not remove already imported academic data.
- Automatic sync is opt-in, OFF by default, bounded to 15 minutes through 24 hours and uses only stored authorized credentials while they are valid.
- Moodle remains read-only: no submissions, messages, forum posts, grading, enrolment, file upload or account mutation is implemented.
- A Moodle handoff/prefill never implies an academic-provider query from another STUD capability.

## Remaining real-world validation gate

The actual institution determines which official read capabilities its sanctioned Moodle service exposes. The real UEL capability probe and user-selected assignment workflow are therefore an explicit later acceptance step in this same phase; unavailable capabilities must be shown as unavailable rather than simulated.
