# M15 — Final Package and Explicit Human Approval

## Scope and identity

Implementation branch: `codex/stud-m15-final-package`, integration baseline
`94cff29080230a9f2ec0b5bba03e6c61fd1fad68`, application version unchanged at
2.7.1. M16 has not started. Master Specification PDF unchanged.

M15 assembles an immutable review candidate from an exact saved Draft Version,
its Composition Plan and Requirements Contract. It does not author academic
content, complete workflows or submit anything to a university. All acceptance
data are synthetic. This document separates API, renderer and native evidence.

## Canonical model and boundaries

Migration 28 appends four tables to the existing SQLite database:
`stud_final_packages`, `stud_final_package_sources`, `stud_final_package_files`,
`stud_final_package_approvals`. Assignment/revision is unique. Exact Draft,
Plan and Contract IDs remain foreign keys. Normalized source rows reference
canonical Papers or M6 Artifacts; file rows retain names, sizes and SHA-256.
The bounded JSON report is an immutable inspection snapshot, not a replacement
for live academic entities. Package/approval UPDATE triggers reject mutation.
Existing Assignments receive no packages or approvals. Migrations 1–27 are
unchanged. Historical v9/v12 and v26 fixtures now remove later tables before
replaying migrations; failing those fixtures was not a runtime migration defect.

The Repository owns scoped persistence; the Service owns assembly, canonical
validation and approval; Files owns managed paths and native export. The six
fixed `stud-final-package-*` preload operations are options/create/list/read/
approve/export. Main-process sender, shape, ID and Assignment checks apply.
No renderer path, SQL, generic network, shell, approval actor or submission API
is accepted. Electron remains Node-disabled and context-isolated.

## Package contents and approval

Supported outputs are `candidate.html` and `candidate.md`, bibliography text,
BibTeX and CSL JSON, separate review and bounded run-audit JSON, readme,
selected managed appendices and an integrity manifest. HTML is escaped and
has a restrictive CSP; no academic text becomes executable markup. Non-file
Artifacts are explicit canonical reference-only appendices, not invented files.
The M14 managed-file reader validates selected bytes. M6 indexes the package
as an `EXPORT_PACKAGE`; ordinary preparation creates no fictional operational Run.

Coverage means recorded requirement placement, not academic satisfaction.
References derive exclusively from explicitly placed M8 Evidence and existing
Citation.js records. Free-text in-text citations are **not** automatically
verified; the report requires human checking. Required citation-style variants
and unsupported submission formats require explicit review/conversion. There
is no native PDF/DOCX conversion in M15.

Approval requires the inspected manifest hash, explicit review confirmation and
acknowledgement of remaining notes. Missing/changed Contract or Evidence,
empty sections and open M4 blockers/checkpoints prevent approval. Rejected
checkpoints retain M4 gate semantics until explicitly replaced. Acknowledging
advisory Committee findings does not mark them addressed. Approval cannot
change the immutable candidate. Newer source state reports drift and requires
a new package; historical content/approval remain readable.

Export selects a destination through the native main-process picker. Each
export creates a unique directory, verifies saved bytes and writes a separate
approval receipt. Unapproved review copies are labelled honestly. Approved
export rechecks freshness after the asynchronous picker returns. Filesystem
errors omit private paths. Receipts are local audit records, not signed external
certificates. There is absolutely no upload/submission operation.

## Bounds, persistence and limitations

- 20 appendices; 200 Papers; 300 placed Claims and Evidence each; 1,000 Claim
  assessments; 200 Committee/gate report rows; exceeding inspection bounds
  fails rather than silently creating an incomplete package.
- Report at most 4 MiB; individual file at most 64 MiB; package at most 128 MiB.
  File reads allocate the verified size and reject growth, symlinks, hardlinks
  or hash changes.
- Options show latest 50 Draft Versions/up to 100 Artifacts, disclosed in UI.
  Package history pages contain 25 rows with revision cursors.
- Audit snapshot: latest 100 Runs/200 Events, with explicit omitted counts.
  Routine Assignment load does not hydrate package files/history.
- Packages live beneath the canonical academic root. M14's external managed
  appendix reader is reused; this is not a new portable-environment feature.
- Interrupted preparation may leave an unindexed private staging directory;
  no package row/approval is published on transaction failure. Automatic
  destructive cleanup is intentionally absent.
- Source refresh and cryptographic integrity are local deterministic checks,
  not guarantees of academic correctness. An old approved package may remain
  historically approved while its present source basis is stale.

## Tests and technical audit

Focused tests: `test-stud-final-package.js` (20),
`test-stud-final-package-boundaries.js` (13),
`test-stud-final-package-workspace.js` (8). Covers real SQLite rollback,
no fabricated state, restart, immutable approval, exact citations, source
drift/missing bytes, native-picker export contract, malicious HTML/paths,
foreign senders, explicit M4 gates and stale renderer responses.

Synthetic scale (`test-stud-final-package-scale.js`): 100 Courses, 1,001
Assignments, 100 packages/900 files. On this host: create 100 packages 513.30 ms;
first/second history pages 0.22/0.14 ms; inspection 1.64 ms; bounded options
1.60 ms; database restart 1.90 ms. These are warm synthetic observations, not
production performance guarantees. Five assertions passed.

One integration/security review identified and corrected:

| Severity | Finding | Correction/evidence |
| --- | --- | --- |
| MAJOR | Rejected M4 checkpoints omitted from gate query | Preserve rejection/replacement semantics; two focused tests |
| MAJOR | Canonical appendix metadata alone did not prove current bytes | M14 managed read verifies physical source during inspection; missing-source test |
| MAJOR | Late Artifact handoff could install an old package after changing Assignment | Existing generation/Assignment guard wraps asynchronous handoff |
| MINOR | File growth could allocate beyond initial stat size | Fixed-size read and post-read size/hash/identity checks |
| MINOR | Old-schema test fixtures retained v28 tables | Accurate downgrade fixtures, no weakened runtime checks |
| INFORMATIONAL | Free-text citations and style variants not semantically verified | Explicit report limitation and human acknowledgement |

## Visual and packaged evidence

`validate-stud-m15-live.js` uses the real running Electron renderer and seeded
SQLite/main/preload APIs, not substituted UI objects. Initial matrix: 48 cases
(empty, review, blocked, approved × Dark/Light/System→Dark/System→Light ×
1680×1050 @2×, 1440×900 @2×, 1200×780 @1×). No horizontal overflow or escaped
controls; Node/process/Buffer absent. CPU chart strokes are checked from actual
Smoothie series after each theme change. Representative captures crop only the
synthetic package surface; terminal usernames and other shell content excluded.

The separate user-requested CPU correction uses a readable light-blue stroke
in Dark and a gold stroke/glow in Light, including live System theme changes.

Native window automation initially returned `cgWindowNotFound`; this is not
reported as a successful human click-through. Development startup also exposed
an installed node-pty spawn-helper missing its execute bit; restoring that
local dependency permission allowed the unchanged terminal to connect. Existing
packaging already applies this permission and signing explicitly.

Final packaged/restart and broad regression outcomes are recorded below when
completed. Preload changed, therefore an ARM64 validation DMG is required.
No public release or version bump is authorized/needed for this milestone.

## CPU user-feedback correction (27 September)

The initial Light colour was rejected by the user as dark ochre. It is replaced
with luminous gold `#e8bf58`, a one-pixel warm halo and 1.2-pixel traces; Dark
retains light blue. The user visually accepted the revised gold. This acceptance
does not by itself establish chart correctness.

The misplaced/intermittent plotting report was investigated separately. The
installed Smoothie responsive implementation does not update its backing store
or transform on a DPR-only change, and includes border-box dimensions. Each CPU
chart now owns an independently sized content-area backing store and resets its
transform without accumulating scale. The fixed 0–100 range does not animate
through an invalid startup scale. Missing/rejected telemetry cannot permanently
leave the sampler busy. No CPU load is fabricated.

`test-cpu-chart-rendering.js`: **7 passed**, covering separate group data, DPR,
fractional sizes, invalid samples and sampling recovery.
`validate-cpu-canvases-electron.js`: **5 passed**, real invisible Electron pixel
checks using explicitly synthetic 80%/20% loads. Group one renders near 20% of
its own plot height and group two near 80%, with non-overlapping plot rectangles.
The same test against commit `927184e` passes @1x then fails @2x at unchanged
layout size, reproducing the old DPR defect. The test window is isolated and
does not modify the user's visible graph or telemetry. A macOS sandbox-extension
diagnostic appeared for the external test executable; execution/pixel checks
completed successfully without changing sandbox permissions.

Broad regression after M15 corrections: **104 passed, 1 failed, 1 skipped**
out of 106 suite scripts. The sole failure is inherited Map provider state:
TomTom HTTP 401 and missing AISSTREAM_API_KEY. SAT/Celestrak is skipped by the
existing runner policy. The added CPU suite and theme integrity were then run
separately and passed. CodeQL-targeted security, Electron boundary tests,
release-health and prebuild integrity passed; the CodeQL CLI is unavailable,
so no fresh full CodeQL scan or zero-alert dashboard is claimed.

Initial packaged API cycle and 72-case real-renderer matrix passed on the M15
implementation build. The final image is rebuilt after the CPU correction;
its identity and restart results follow in the final delivery record.
