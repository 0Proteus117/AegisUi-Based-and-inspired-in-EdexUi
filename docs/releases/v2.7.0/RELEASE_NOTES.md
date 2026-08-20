# AegisUi v2.7.0 — STUD Reality Pass / Moodle Workflow & UX

v2.7.0 turns the existing STUD architecture into a usable, object-centred
academic workflow and validates it against a real sanctioned Moodle account.
It does not add autonomous submission, background crawling or cloud-AI fallback.

## What changed

- Official system-browser Moodle SSO with replay-protected `aegisui://` return.
- Persistent Moodle instance/sync configuration and encrypted macOS
  `safeStorage` credentials.
- User-initiated full and incremental read-only sync for exposed Courses,
  Assignments, statuses, grades, feedback, resources, files, calendar,
  completion and forum/announcement metadata.
- Managed course-file download with stable provider identifiers, SHA-256,
  deduplication and no persisted token-bearing URL.
- Explicit download → ready-for-index → indexed/OCR-required document lifecycle.
- Six primary STUD groups: Home, Courses, Work, Library, Study and Tools.
- Object-centred Course and Assignment views with brief preview, requirements,
  deterministic roadmap, evidence matrix and contextual next actions.
- Progressive disclosure for search, import, capabilities, sync preferences,
  provenance and advanced local details.
- Bounded document library and stable workspace scrolling under real-scale data.
- Deterministic packaging guard: release builds fail when `prebuild-src` does
  not correspond to the current source and commit.

## Real validation, private by design

The real local validation synchronized 14 Courses, 30 Assignments, 1,099
Resources and 625 managed Moodle files. It indexed 292 PDFs into 5,432
provenance-bearing chunks. These aggregate counts are safe to report; no real
Course title, Assignment title, document content, username or credential is
included in this release.

The real selected Assignment was exercised through linked briefs, explainable
requirements, roadmap, notes, Context Packages, local Ollama grounding and an
evidence matrix. The generated local simulation remains explicitly marked
`DRAFT / SIMULATION` and `NOT SUBMISSION-READY`; it is not published here.

## Security and limits

- Moodle remains read-only: no submission, posting, messaging, grading,
  enrolment or quiz attempt.
- Automatic sync is opt-in and OFF by default.
- Notifications, quizzes and participant reads were not proven by the detected
  account contract and remain `UNKNOWN`.
- OCR is not fabricated; 24 scanned PDFs remain honestly `OCR_REQUIRED`.
- Local assistant output is ephemeral until explicit save and has no cloud
  fallback or external tools.
- TomTom HTTP 401, absent `AISSTREAM_API_KEY` and environment-dependent SAT
  checks are inherited configuration warnings, not STUD regressions.

## Visual validation

All images below are generated from in-memory synthetic data in the current
renderer. They contain no private Moodle or academic information.

![STUD Home — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/01-stud-home-dark.png)
![Course Overview — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/02-course-overview-light.png)
![Assignment Overview — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/03-assignment-overview-dark.png)
![Assignment Brief Preview — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/04-brief-preview-light.png)
![Requirements — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/05-requirements-dark.png)
![Course Resources — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/06-resources-light.png)
![Research Context — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/07-research-context-dark.png)
![Assignment Roadmap — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/08-assignment-roadmap-light.png)
![Evidence Matrix — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/09-evidence-matrix-dark.png)
![Document Intelligence — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/10-document-intelligence-light.png)
![Compact Assignment — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/11-compact-assignment-dark.png)
![System Light — Home](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/12-system-light-home.png)
![Moodle Synchronization — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/13-moodle-synchronization-dark.png)
![Research Paper Preview — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/14-research-paper-preview-light.png)
![Academic Context — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/15-academic-context-dark.png)
![Progress Overview — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/16-progress-overview-light.png)
![Student Tool Catalog — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/17-tool-catalog-dark.png)
![Local Academic AI — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.0/docs/releases/v2.7.0/screenshots/18-local-academic-ai-dark.png)

## Distribution

- Apple Silicon macOS DMG: `AegisUi-2.7.0-arm64.dmg`
- Signing: established ad-hoc local signature; not Apple-notarized.
- The DMG checksum is published as a separate release asset.
