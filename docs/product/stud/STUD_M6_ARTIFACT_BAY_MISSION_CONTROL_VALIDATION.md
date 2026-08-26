# STUD M6 — Artifact Bay and Mission Control Foundation

## Scope and result

M6 adds a persistent observational foundation to the existing Assignment
Workspace. It separates three concepts:

- **Artifact Bay:** what canonical Assignment work exists;
- **Operational Event Journal:** what a real bounded operation recorded;
- **Mission Control:** a read-only composition of what is active or historical.

M6 does not add workers, autonomous execution, provider chaining, research
automation or simulated activity. Opening Artifact Bay or Mission Control causes
bounded local reads only.

## Schema v19

Migration 19 is transactional and leaves all existing Assignments without
fabricated Artifacts, Runs or Events. It adds:

- `stud_assignment_artifacts` — stable Assignment-scoped references to canonical
  STUD objects, with optional Workflow/Node, parent, origin, lifecycle,
  availability, bounded metadata and integrity reference;
- `stud_artifact_relationships` — explicit `DERIVED_FROM`, `USES`, `REFERENCES`,
  `SUPERSEDES`, `EXPORT_OF` and `GENERATED_FROM` links;
- `stud_operation_runs` — persistent bounded operation lifecycle and progress;
- `stud_operation_events` — structured ordered domain events;
- `stud_operation_event_artifacts` — exact Event-to-Artifact links.

Indexes cover Assignment/time, filtered Artifact, active Run, Workflow/Node and
Run/event-page queries. The migration does not rewrite v1–v18.

## Artifact domain

The registry recognizes the discipline-neutral taxonomy required by the Master
Specification, including documents, papers, web references, Notes, datasets,
notebooks, code references, compute inputs/results, figures, images, tables,
charts, calculations, simulations, revision items, drafts, citations, exports
and generic manual references. A registry row points to an existing canonical
object already related to the Assignment or its Course through M2's validated
scope rules. Course and Assignment rows are context, not duplicated Artifacts.

Registration is deterministically deduplicated by Assignment, canonical object
identity and Artifact type. Multiple canonical versions may coexist. Explicit
supersession preserves both versions. Acyclic lineage relations reject cycles,
self-links, missing records and cross-Assignment links.

The renderer may register only an already related current object. It cannot
claim `MOODLE_SYNC`, `MODEL_GENERATED`, `SYSTEM_GENERATED` or another privileged
origin. Renderer registration is persisted honestly as `UNKNOWN` with producer
`USER`; trusted main-process producers may supply a more specific validated
origin when they genuinely perform that action.

## Run and progress domain

Runs use `CREATED`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED` and `CANCELLED`.
Transitions are explicit, optimistic-concurrency protected and timestamped.
Pause/cancel transitions are rejected unless the Run declares the capability.
Failed Runs require a bounded error summary.

Progress is one of:

- `NONE` — no measurable progress exists;
- `INDETERMINATE` — real work is active but the total is unknown;
- `DETERMINATE` — `0 <= current <= total`, `total > 0`, with an optional unit.

Mission Control never creates a percentage without a total and M6 never estimates
ETA. Elapsed duration is derived from persisted start/finish timestamps.

## Operational Event Journal and M3/M4 authority

Operational Events are structured bounded records, not arbitrary logs. Type,
actor, severity, summary, payload, Workflow/Node, Run, canonical reference and
Artifact links are validated in the main process. Secret-bearing keys, credential
URLs, oversized strings, deep metadata and oversized payloads fail closed.

M3 `stud_workflow_events` remains the source of truth for Workflow topology/state
history. M4 blocker/checkpoint rows remain the source of truth for conditions.
M6 can reference one exact M3 event and renders current M3/M4 state, but it does
not backfill, rewrite or duplicate their history. An Artifact is shown as produced
by a Run only when that Run's operational Event explicitly links the Artifact.

No renderer IPC exists to create/transition Runs or append Events. These APIs are
domain services for future trusted bounded producers. This prevents Mission
Control from becoming a persistent renderer-controlled log sink.

## Assignment Workspace and UX

M5 remains calm at rest. Two contextual actions open `ARTIFACTS` or `ACTIVITY`;
normal Assignment load does not hydrate operational history. Artifact Bay groups
and filters bounded references and hands supported canonical objects to the
existing M5 preview adapter. It is not a filesystem browser and does not display
raw local paths.

Mission Control has:

- a calm resting state that explicitly says nothing is running;
- an active/historical heading derived from persisted Run state;
- an M3 stage rail and M4 blocker/checkpoint conditions;
- exact Event-linked Artifact activity;
- actual progress only when declared by the Run;
- bounded operational events and restart-persistent Run history.

Pause/cancel controls are absent in M6 because there is no worker coordinator to
execute them. Full controls remain M13 work.

## Bounds and scale

Reads require Assignment or Run scope and explicit limits. Artifact and Run
pages are capped at 100/50 records and Event pages at 200. Normal Assignment
Workspace load performs no M6 history read. Event metadata and Artifact metadata
are capped at 16 KiB with nested-value and string bounds.

The scale fixture contains 100 Courses, 1,000 Assignments, 300 Workflows, 5,000
Artifacts, 500 Runs and 25,000 Events. On the validation host:

- fixture population: 12.25 s;
- initial Assignment Artifact query: 1.3 ms;
- filtered Artifact query: 0.1 ms;
- current Mission state: 4.9 ms;
- Run history: 0.1 ms;
- bounded Event page: 1.4 ms;
- second Event page: 0.1 ms;
- restart: 4.8 ms;
- bounded hydration: 2.2 ms.

SQLite query inspection confirms the Assignment Artifact query uses its index.
These measurements are environment-specific evidence, not performance promises.

## Security and privacy

The hardened Electron boundary remains `nodeIntegration: false` and
`contextIsolation: true`. M6 uses fixed preload channels and main-process payload,
sender, ID, canonical scope, Workflow scope and size validation. There is no raw
`ipcRenderer`, generic persistence channel, SQL, filesystem, shell, network
proxy, provider action, signed URL or credential field.

Every Artifact read/mutation and Run read reaffirms Assignment scope. Renderer
calls cannot forge privileged Artifact origin or integrity/availability claims.
Public visual fixtures are synthetic and contain no Moodle/UEL data, username,
private path, credential, signed URL or private Assignment.

## Technical audit

One M1–M6 integration audit was performed after implementation.

- **MAJOR — fixed:** renderer registration originally accepted privileged origin
  and producer values. IPC now fixes manual registration to `UNKNOWN` / `USER`.
- **MAJOR — fixed:** individual Artifact/Run reads and Artifact mutations did not
  reaffirm Assignment scope. Every exposed operation now requires and validates
  `assignmentId`.
- **MAJOR — fixed:** Mission Control initially associated all Artifacts sharing a
  Workflow/Node with a Run. It now shows only Artifact IDs explicitly linked by
  that Run's Events.
- **MINOR — fixed:** Event canonical/source references lacked full scope checks.
  Canonical objects and exact M3 source events are now validated.
- **MINOR — fixed:** critical operational text was too small at compact desktop
  sizes. M6-specific minimum font sizes preserve readable density.
- **MINOR — fixed:** a historical Run initially resolved Artifact labels only
  through the Assignment's most-recent Artifact page. A separate fixed,
  Assignment-validated and bounded Run-to-Artifact query now resolves exact
  Event links even when an older Artifact is outside that recent page.
- **INFORMATIONAL:** M3/M4 and M6 histories remain intentionally separate because
  they describe different authorities. Mission Control composes them.

No remaining BLOCKING or MAJOR finding was identified. Full Run controls,
workers, heartbeats, resource profiles, watchdog/recovery payloads and retention
policy remain intentional later-milestone work.

## Automated validation

Focused M6 suites cover schema/migration, Artifact references/dedup/lineage,
origins, concurrency, Run lifecycle, progress semantics, Event ordering and
bounds, restart persistence, discipline neutrality, typed IPC, renderer origin
forgery, Assignment scoping, resting/active/failed UI, M4 conditions, M5 preview
handoff and no fake activity timer. The scale fixture validates bounded indexed
reads and confirms normal M5 load does not hydrate M6 history.

M1–M5 focused suites were rerun after the v19 compatibility updates. Broad
regression completed with 61 passing suites, one inherited Map environment
failure (TomTom HTTP 401 and absent `AISSTREAM_API_KEY`) and one environment
skip (`test-sat-celestrak.js` absent). Eleven additional focused suites for
Moodle, Documents, Research/Citations, Knowledge, Revision, Compute,
Notebook/Data, Progress, Orchestration, the Electron trust boundary and the
prebuild guard passed. Release-health, CodeQL hardening and `git diff --check`
passed. Packaged validation is recorded after the implementation commit because
the fixed preload allowlist changed.

## Live visual validation

Real Electron was validated with synthetic fixtures in Dark, Light, System→Dark
and System→Light at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x. Scenarios:
resting, determinate, indeterminate, branching Workflow, populated/new Artifact
activity, blocker, checkpoint/human input, failed Run, completed history, long
labels, empty Artifact Bay and generic/manual Assignment. Automated layout checks
found no horizontal overflow or escaped controls; visual inspection confirmed
the compact layouts remain scrollable and the resting M5 surface is not filled
with permanent telemetry.

## M7 boundary

M6 implements no Research Plan, Topic Dossier, source acquisition, Faculty Gems,
claims, Evidence Map expansion, drafting, model routing, worker scheduler,
overnight execution or university submission. The next product milestone is
M7 — Research Plan and Topic Dossiers.
