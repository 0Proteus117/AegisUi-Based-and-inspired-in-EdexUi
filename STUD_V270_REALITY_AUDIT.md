# STUD v2.7.0 Reality Pass — Technical and UX Audit

## Baseline audited

- Base release: `v2.6.14` / `b159e3a`.
- Canonical academic store: SQLite, schema v14 in the audited repository. The
  prompt's schema-v13 statement described the older milestone and was not used
  to downgrade the real database.
- Existing boundaries: Moodle read-only adapter, macOS `safeStorage` credential vault, managed document storage, Document Intelligence, local academic context, notes, citations, revision, progress and local-AI context packages.

## Findings

1. Moodle configuration and sanctioned token handling existed, but the operational sync was intentionally small: it only inspected a narrow course subset and retained resource metadata rather than managed academic files.
2. The previous renderer exposed fourteen peer-level navigation choices. This made a student choose implementation capabilities before choosing the academic task.
3. The command centre repeated technical status cards while its assignment and course journeys were comparatively hidden.
4. Managed PDFs already had a safe local viewer and Document Intelligence pipeline, but Moodle-originated documents were not surfaced as an explicit download-then-index workflow.
5. Assignment data contained enough canonical relationships to guide work, but no compact object-centred roadmap or explainable, bounded requirement readout.
6. STUD typography inherited viewport-relative values that resolved to 4–7px
   on several real surfaces. The document library also rendered all local
   documents and its full import form at once, producing a very tall,
   high-density work surface after real Moodle ingestion.

## Structural response

- Moodle is now a persistent integration: base configuration, stable remote identifiers, minimal sync metadata and user preferences persist locally; the sanctioned Web Service token remains encrypted only in the existing macOS safe-storage vault.
- UEL advertises external/system-browser SSO. The failed embedded Electron login path was removed and replaced with Moodle's official mobile launch callback. The callback is short-lived, replay-protected, signature-validated and registered as the packaged `aegisui` macOS URL scheme.
- A user-initiated sync is bounded but no longer limited to twenty courses. It reconciles accessible courses, assignments, statuses, grades, feedback, course resources, calendar observations and public forum/announcement containers only when the service exposes them.
- Explicit Moodle file downloads are held in managed STUD storage with a SHA-256, MIME type and provider provenance. Temporary token-bearing file URLs are constructed only in memory and never enter SQLite, logs, screenshots or canonical records.
- Download and interpretation are separate: PDFs are `READY FOR INDEX` until the analyst selects **INDEX ALL COURSE MATERIAL** or analyzes a document individually.
- Primary STUD navigation now groups the existing capabilities around HOME, COURSES, WORK, LIBRARY, STUDY and TOOLS; the secondary navigation remains contextual instead of removing functionality.
- Assignment default detail now prioritizes deadline, local roadmap, bounded requirement observations and next actions. Editing, grades, raw/local fields and other inspector information are disclosed progressively.
- Search and document import are now explicit disclosures. The document library
  filters locally, renders forty records at a time and adds further records only
  when requested. Dynamic document lists use a bounded internal scroll region.
- STUD copy, metadata, controls and empty states now have deterministic 10–11px
  minimums while preserving the compact Aegis hierarchy.

## Privacy and security invariants

- No university password, copied browser cookie, browser session or temporary signed URL is stored. Moodle's returned Web Service credentials are encrypted in the existing `safeStorage` vault and never enter SQLite, logs or renderer state.
- `FORGET MOODLE ACCOUNT` deletes secure Moodle credentials and disables future automatic sync; it does not remove already imported academic data.
- Automatic sync is opt-in, OFF by default, bounded to 15 minutes through 24 hours and uses only stored authorized credentials while they are valid.
- Moodle remains read-only: no submissions, messages, forum posts, grading, enrolment, file upload or account mutation is implemented.
- A Moodle handoff/prefill never implies an academic-provider query from another STUD capability.

## Real UEL validation completed

The sanctioned UEL system-browser SSO completed and returned an authorized
Moodle Web Service token directly to Aegis. The token is encrypted by macOS
`safeStorage`; no password or browser cookie was collected.

The explicit real capability/sync run reported:

| Capability | Result |
| --- | --- |
| Site identity, courses, assignments, calendar | `SUPPORTED` |
| Course content, resources and files | `SUPPORTED` |
| Submission status, grades and feedback | `SUPPORTED` |
| Completion, forum metadata and announcement containers | `SUPPORTED` |
| Notifications, quizzes and participant reads | `UNKNOWN` / not proven by this account contract |
| Submission, posting, messaging and quiz attempts | `POLICY_DISABLED` |

The local, private academic store now contains the following aggregate state:

- 14 canonical Courses;
- 30 canonical Assignments;
- 1,099 Resources;
- 625 Moodle files represented in managed storage after the initial real sync;
- 292 PDF AcademicDocuments;
- 5,432 provenance-bearing document chunks;
- 268 PDFs in `READY` extraction state;
- 24 PDFs honestly marked `OCR_REQUIRED` because no embedded text was available;
- 0 documents left in `NOT_ANALYZED` state after the explicit indexing action.

An incremental sync completed with provider state `READY` and no provider
error. A lightweight capability check no longer erases deeper capabilities
that a prior explicit full sync has already demonstrated.

No real Course name, Assignment title, document content or user identifier is
stored in this repository or permitted in public release evidence.

## UX and layout validation completed so far

All fourteen existing internal STUD surfaces remain reachable through six
primary task groups. Semantic layout checks ran at 1680×1050 @2x,
1440×900 @2x and 1200×780 @1x. Across the tested surfaces there was no page
horizontal overflow, no control outside the active work region and no visible
leaf text below 10px. Dark, Light and System ownership remains token-based; the
final sanitized visual matrix is produced only after the real assignment
workflow has been selected and completed.

## Remaining acceptance gate

The real Assignment workflow intentionally requires the user to choose the
Assignment. Aegis must not select one merely because its brief is convenient.
After that explicit choice, the brief, roadmap, source plan, evidence matrix,
draft simulation and rubric review can proceed without submitting anything to
Moodle.
