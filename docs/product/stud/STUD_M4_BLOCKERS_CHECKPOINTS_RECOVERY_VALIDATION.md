# STUD M4 — Blockers, Human Checkpoints and Dependency Propagation

Status: implemented and validated on `feature/systems-online-pass` from the
v2.7.1 / M3 baseline. This record describes the implementation as shipped by
M4; it does not claim runtime-worker recovery or begin M5.

## Scope and semantic contract

M4 adds two explicit facts around the persistent M3 DAG:

- a **blocker** records why work on one stage cannot proceed; and
- a **human checkpoint** records a decision that must be made by the student
  before work may continue.

They do not replace M3 work state. `NOT_STARTED`, `IN_PROGRESS`, `COMPLETE` and
`SKIPPED` remain the only persisted node work states. Availability is derived as
`AVAILABLE`, `DIRECT_BLOCKER`, `HUMAN_INPUT_REQUIRED` or `DEPENDENCY_WAIT`.
`READY` remains a presentation derivation, never fabricated progress.

## Schema v18

Migration 18 is one transaction over the canonical STUD SQLite database. It:

- creates `stud_workflow_blockers` and `stud_workflow_checkpoints`;
- retains exact Workflow and node foreign keys;
- supports exact Requirement Item, Requirements Contract snapshot and canonical
  provenance references;
- uses row versions for optimistic concurrency;
- extends the append-only `stud_workflow_events` type constraint with meaningful
  blocker/checkpoint lifecycle events; and
- creates workflow/node scoped indexes.

Migration never creates blocker, checkpoint, decision, owner, expected date or
progress rows for an existing Workflow. A v17 Workflow therefore upgrades with
an empty condition set. A deliberately broken v18 migration was verified to
roll back without recording migration 18 or partially creating its schema.

## Blocker model

Supported types are `WAITING_LAB`, `WAITING_TEAM_MEMBER`, `WAITING_DATA`,
`WAITING_FEEDBACK`, `WAITING_SUPERVISOR`, `WAITING_APPROVAL`,
`WAITING_RESOURCE`, `WAITING_EVENT`, `WAITING_INTERVIEW`, `WAITING_SURVEY`,
`WAITING_FIELDWORK`, `WAITING_EQUIPMENT`, `WAITING_EXTERNAL_RESULT` and
`CUSTOM`. This taxonomy is discipline-neutral and deliberately does not infer a
severity.

Lifecycle is `OPEN -> RESOLVED` or `OPEN -> CANCELLED`. History is retained;
double resolution and stale writes fail with typed errors. Multiple blockers on
one stage remain independent. Resolving one never clears another. Expected date
and owner are optional information only and never trigger automatic action.
New conditions cannot be attached to terminal work until the stage is explicitly
reopened through the M3 lifecycle.

## Human checkpoint model

Checkpoints use `PENDING`, `APPROVED`, `REJECTED` and `CANCELLED`. Decisions are
explicit `APPROVE`, `REJECT` or `CANCEL` actions. Pending and unreplaced rejected
checkpoints produce `HUMAN_INPUT_REQUIRED`; none of these decisions marks a node
complete. A rejected/cancelled checkpoint remains historical and may be followed
by an explicit replacement checkpoint on the same node. The follow-up decision
does not erase the prior rejection.

## Dependency propagation

Propagation is computed only within one validated Workflow DAG. An open blocker
or active human gate affects its own node directly. Descendants receive one
deduplicated explanation through `impactSources`; the blocker is not copied into
each descendant. Independent branches remain available. At convergence, work
waits until all predecessor work and availability conditions are satisfied.
Resolution recomputes availability immediately but does not start or complete
work.

## Provenance and M1 integration

When linked to a Requirement Item, a condition must refer to the exact immutable
Contract revision recorded by its Workflow. M4 stores Contract ID, revision,
fingerprint and a deterministic snapshot hash of the Requirement Item and its
canonical sources. A later Contract revision or source drift does not mutate the
historical condition. M1 remains authoritative for Contract freshness and
immutability; M4 records the exact reason used at creation time.

Canonical object references must already belong to the active Assignment or
Course. M4 never creates a relationship merely to satisfy a condition.

## M2 and M3 integration

Working Context can continue to identify the active Workflow/node and survives
restart. Selecting, creating or resolving a condition makes no Moodle, provider
or AI call. M3 topology, topology lock, exact template fingerprint, historical
Workflow replacement, work-state transitions and event ordering remain intact.
Historical Workflows are read-only.

## Main-process authority and security

All mutations cross fixed preload channels. Main process validates sender,
allowlisted keys, IDs, Workflow/node ownership, lifecycle, Contract source,
canonical relationships, bounds and expected row versions. Renderer receives no
SQL, raw `ipcRenderer`, filesystem, shell or network authority. Electron remains
`nodeIntegration: false`, `contextIsolation: true`, with no `@electron/remote`.

## UX and accessibility

The Assignment Workflow rail uses distinct text and symbols for blocked work,
human review and dependency wait. Selecting a stage opens a contextual inspector
with source, owner, expected date, impact and lifecycle actions. Creation/edit/
decision forms use progressive disclosure; operational controls do not occupy
the resting Assignment view. Status never depends only on colour.

Live Electron validation passed in Dark, Light, System-to-Dark and
System-to-Light at 1680x1050 @2x, 1440x900 @2x and 1200x780 @1x. Scenarios
included no conditions, direct/transitive blockage, independent branch,
resolved blocker, pending/rejected/approved checkpoint and long text. No
horizontal overflow or escaped controls were detected.

## Scale and restart

The bounded fixture contained 100 Courses, 1,000 Assignments, 300 Workflows,
2,400 nodes, 600 blockers, 600 checkpoints and 1,800 events. On the validation
host: population took 1.57 s; one scoped Workflow read 0.8 ms; impact query
0.9 ms; restart plus scoped hydration 5.1 ms. SQLite query plans used the
workflow indexes. These are local measurements, not universal performance
guarantees.

Restart recovery in M4 means durable blocker/checkpoint/event history plus
deterministic availability recomputation. It does **not** mean autonomous worker
resume, runtime cursor recovery, heartbeats, retry workers or process crash
recovery. Those remain M13 responsibilities after an execution coordinator
exists.

## Automated and regression validation

- M4 domain: 34 checks.
- M4 typed IPC: 14 checks.
- M4 scale: 4 checks.
- M1: 33 domain + 9 IPC checks.
- M2: 13 domain + 6 IPC checks.
- M3: 39 domain + 12 IPC checks; existing M3 scale remains green.
- all 29 STUD test files passed after installing the declared `src` lockfile;
- CodeQL hardening: 7 checks;
- Electron trust boundary: 17 checks;
- release health and prebuild integrity passed;
- broad Aegis regression passed except inherited external Map configuration:
  TomTom HTTP 401 and absent `AISSTREAM_API_KEY`; SAT/Celestrak was skipped by
  the existing environment policy.

No DMG or release was generated. M4 adds canonical schema/domain/UI and fixed
allowlisted IPC calls, but does not change preload architecture, packaging,
startup, native helpers or runtime dependencies.
