# AegisUi v2.6.12 — STUD Progress / Analytics

STUD now has a local, explainable Progress Analytics surface over its existing
canonical academic records. This is a reporting milestone, not a prediction,
gamification or automated-study system.

## Highlights

- Activated **PROGRESS** in the Student Command Center with Overview, Courses,
  Assessments, Workload, Revision and Activity views.
- Separates course state, compatible assessment context, explicit deadlines,
  finished local study sessions, data completeness and conflicts.
- Added schema v12 grade representation: `PERCENTAGE`, `POINTS`, `TEXT`,
  `PASS_FAIL` and `UNKNOWN`. Text/pass-fail records are visible but never
  fabricated into a numeric average.
- Weighted values are calculated only from explicit compatible numeric grades
  and explicit weights. Incomplete/incompatible entries remain transparent.
- Added source inspection for the canonical/provenance records behind metrics.

## Boundaries

Progress Analytics is derived and local-only. It makes no Moodle, Calendar,
Email, research-provider, GitHub or AI request; creates no hidden metric or
query history; writes no localStorage shadow data; and does not predict grades,
effort, outcomes or academic correctness.

## Validation

Focused model, migration, grade-scheme, conflict, workload, study-session,
five-discipline scale, UI layout and theme validation passed. Existing STUD
Academic Core, Moodle, Revision, Compute, Academic Intelligence and Notebook
regression suites also passed. Known inherited environment checks remain:
TomTom HTTP 401, absent `AISSTREAM_API_KEY`, and SAT/Celestrak checks that may
be skipped by environment.

## Visual validation

All captures use synthetic public-safe academic data.

![Progress overview — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-overview-dark.png)

![Progress overview — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-overview-light.png)

![Course progress — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-courses-dark.png)

![Assessments and partial grade context — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-assessments-dark.png)

![Deadline workload — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-workload-light.png)

![Revision and study activity — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-revision-dark.png)

![Academic activity — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-activity-light.png)

![Compact assessment layout — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-compact-dark.png)

![System theme resolving dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-overview-system-dark.png)

![System theme resolving light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.12/docs/releases/v2.6.12/screenshots/progress-overview-system-light.png)

## DMG

Not generated — this is an incremental local SQLite/model/renderer release with
no change to packaging, preload, startup, native helpers, signing or bundled
runtime dependencies.
