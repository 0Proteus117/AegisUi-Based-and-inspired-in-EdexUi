# STUD course clarity — explicit year, display names and assignment brief

7 October 2026. Isolated branch `codex/stud-ux2-course-clarity`, base `47f0960`
(the connected UX1 slice, not the integration branch). M16 and the complete UX
programme remain open. No Master PDF change, M17 or Map work.

## Delivered contract

- A user explicitly chooses the current academic year from existing course
  metadata. A future Moodle year never becomes current just because it is newest.
  Other years and unclassified courses remain reachable. The current year has a
  direct button even when it falls outside the first year page. Missing/archived
  courses do not cause a silent switch. Clearing is explicit.
- Display names are separate from provider/canonical titles. Course, Assignment,
  Resource and AcademicDocument names can be corrected/reset under disclosure.
  Five conservative title rules suggest material categories: module specification,
  module handbook, assessment brief, marking criteria and reading list. Multiple
  matches/unknown material retain their original title. These are **title-only
  suggestions**, not AI/content analysis. Original names and the rule's limitation
  remain inspectable. Same-category documents may still need distinct user names.
- Assignment summary separates deliverables, key requirements, unresolved inputs
  and unreviewed candidates. It uses the current approved M1 revision when one
  exists; a newer draft is identified separately. Without approval it explicitly
  presents a draft, not confirmed institutional instructions. Excluded candidates
  stay excluded. Original instructions and extraction coverage are folded.
  Missing coverage is not proof that no requirements exist. Dates retain canonical
  identity; ISO deadline values are formatted for display, not reinterpreted.
- Source drift, incomplete/conflicting requirements and missing dates remain
  visible. No contract approval, source acquisition, model call, Run or workflow
  execution occurs through navigation, naming or choosing a year.

## Persistence and security

One transactional SQLite migration **28 → 29**, with no edits to migrations 1–28:

- `stud_navigation_preferences`: singleton explicit year, row version, timestamp.
- `stud_display_labels`: fixed canonical entity type/ID, optional override,
  source-title hash, row version and timestamp. Null label is a reset tombstone;
  it keeps the version so an old client cannot resurrect a superseded choice.

No rows/backfill on migration. Label source hashes report later title changes;
they are not a substitute for document-content provenance. These presentation
records do not claim an academic review. Polymorphic IDs are validated against
the existing canonical store in main; archived/missing objects are rejected.
Presentation rows are retained if their source disappears but not exposed as
available academic objects. No cascading deletion of academic data.

`StudPresentationService` owns validation/mutation; `StudCourseBrowser` decorates
only its bounded result page. No new database, localStorage or generic settings
store. Three fixed preload APIs: `stud-navigation-year-set`,
`stud-display-label-read`, `stud-display-label-set`. Trusted sender validation,
strict keys/types, label/year bounds and optimistic concurrency apply in main.
`STALE_PRESENTATION_VERSION` rejects lost updates. No renderer SQL, Node, raw IPC,
filesystem, shell or network authority is added.

## Validation

- Focused domain/security suite: **27 passed / 0 failed / 0 skipped**; covers schema, transactional rollback, v28
  preservation, no fabricated choices, stale writes, reset versions, main/IPC
  rejection, title ambiguity, source-title drift, restart, canonical title
  preservation, six discipline/manual contexts and honest M1 summaries.
- Legacy tests' current-schema expectations advance to 29. Three legacy
  migration-fixture builders now also remove the new tables when constructing
  older schemas; their rollback/data-integrity assertions are preserved.
- Broad regression after fixture corrections: **120 passed, 1 failed, 1 skipped
  / 122 scripts**. The failed script remains Map providers (TomTom HTTP 401 and
  missing AISSTREAM_API_KEY); SAT/Celestrak is skipped under existing policy.
  No new failing subsystem remains in that run.
- Initial real Electron validation: **132 passing geometry/state observations**,
  zero renderer exceptions, no renderer Node/raw IPC. Four theme modes and
  1680×1050 @2x, 1440×900 @2x, 1200×780 @1x. Real controls exercised year selection,
  saved name correction and M1 handoff; synthetic typed API actions prepared
  draft, explicitly approved-incomplete and source-changed scenarios. These
  approvals are synthetic only. Final packaged verification is recorded below.
- Final source was rechecked after the date-formatting and asynchronous-response
  corrections: the same 132-case matrix passed, zero failures/exceptions; focused
  navigation (20), targeted security (7), trust boundary (17), Working Context IPC
  (8) and release-health checks also passed. These focused reruns supplement the
  broad run rather than pretending it ran again after each small correction.
- Review found a late display-name response could update a newer selection.
  The renderer now rejects responses from older navigation generations; a focused
  asynchronous regression covers it. No canonical data was corrupted.

Logs/screenshots are local-only and synthetic. No private Moodle data, credentials,
user paths or model conversations are included. Full hosted CodeQL has not been
claimed; repository targeted checks and release health are the local gate.

## Remaining scope

This does not complete all UX2 analysis/classification: no model-driven naming,
automatic analysis of every Moodle resource or automatic requirements approval.
Existing M1/M5 specialist screens remain behind the summary; the manual/AI
Workbench simplification and true streaming execution preview remain next.
M16 acceptance, integration and user usability acceptance remain separate gates.
No public release. Packaged validation is required because fixed preload APIs
changed; existing profiles/dependencies and clean-install claims are not conflated.

## Packaged validation — final implementation

Runtime commit: `f21c54004f6a3523e7fed1cf2cc0f2cb3a1972da`.
ARM64 validation artifact: `AegisUi-2.7.1-arm64.dmg` (154,980,542 bytes).
SHA-256: `a112cbed534549cf86248fcc699a2f8a9e640cdb51da2bb152d969b0aba64660`.

- Prebuild/source digest:
  `d7888bbfd86610a22abce72ee3d31b7717e6ce9eccd32a9a9ad142911ce59fa1`.
  Guard passed; 289 source/assets files compared physically to app.asar. Only
  build-only lockfile and dependencies were excluded from this source comparison;
  package.json's expected keywords removal was checked separately. Staging uses
  exact unminified source. Runtime dependencies reused from UX1 with unchanged
  lockfile; native rebuild disabled. This is not a fresh dependency installation.
- DMG integrity verification and strict/deep mounted-app signature verification
  passed. Ad-hoc signed, not Apple notarized. Mounted read-only and launched from
  that volume, never from Applications. Synthetic profile only, offline mode;
  user Moodle accounts/data were not opened or altered.
- **132/132** packaged visual/state observations passed with zero exceptions;
  the new typed year/name APIs were exercised through actual UI controls.
  Renderer require/process/Buffer and raw IPC remained absent.
- Mounted executable loaded the old source to create a real v28 synthetic DB,
  then the packaged store migrated it to v29: canonical Assignment preserved,
  zero fabricated preference/label records and valid foreign keys.
- Packaged smoke passed: canonical Course/Assignment, M1 draft, Workflow,
  Working Context, organisation/classification, Citation.js rendering, Moodle
  status and document/compute capabilities. Terminal/node-pty connected.
  Calendar helper presence and signature passed; no calendar access was requested.
- Ollama status was **DISABLED** in the isolated profile. No generation, live
  institutional SSO/sync or model-quality verification is claimed here.
- Closing/relaunching the mounted application preserved the exact chosen year,
  original titles, display labels and their optimistic versions. The current-year
  button remained visible and Continue did not foreground the unrelated historical
  Assignment selected by the smoke test. No renderer Node access after restart.

Local evidence: `ux2-course-clarity/2026-10-07/` in the external test-artifact
directory; no screenshots, profiles or debug logs are committed.

No public release or integration. M16 remains open. The next product slice is
the simplified Workbench and real execution/preview connection, not Map.
