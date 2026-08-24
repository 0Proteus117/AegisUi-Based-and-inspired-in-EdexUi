# STUD M2 — Academic Organisation / Working Context validation

## Scope and identity

- Base: `feature/systems-online-pass` after M1 and Electron trust-boundary hardening.
- Schema: v15 → v16.
- Product scope: Course/year/term organisation, presentation-only assessment
  classification, visible/correctable active work context and bounded contextual
  prefill. M3 workflow/DAG work is not included.

## Schema impact

Migration 16 is transactional and adds:

- nullable `academic_year`, `academic_term` and `academic_level` to
  `stud_courses`;
- `stud_assignment_classifications`, a presentation layer separate from the
  canonical Assignment record;
- `stud_working_context`, one `current` row containing only a meaningful
  Course/Assignment/current-object reference.

Existing Courses remain `NULL` where the source did not expose organisation
metadata. Existing Assignments receive neither classification overrides nor a
Working Context automatically.

## Academic hierarchy and classification

The Courses surface presents explicit `Academic Year → Term → Course` groups.
`UNCLASSIFIED` and `TERM UNKNOWN` are deliberate honest states. The service
does not infer them from course code or title.

Classification supports `COURSEWORK`, `EXAM`, `LAB_PRACTICAL`, `PRESENTATION`,
`TEAM_PROJECT`, `INDIVIDUAL_COMPONENT`, `PEER_FEEDBACK`, `SUBMISSION_POINT`,
`FORMATIVE_PRACTICE`, `ADMINISTRATIVE`, `OTHER` and `UNKNOWN`. A bounded local
readout may classify title/description. A user correction is persisted locally
with Assignment field-level `USER_OVERRIDE` provenance; it never changes Moodle
or canonical Assignment identity.

## Working Context contract

The main-process `StudWorkingContextService` is authoritative. It validates:

- canonical Course and Assignment existence;
- Assignment-to-Course ownership;
- current object type/ID pairs;
- object relationship scope (Assignment direct, Course related, or existing
  canonical relationship).

An unrelated object is rejected with `CONTEXT_RELATION_REQUIRED`; no fake
relationship is created. The precedence is explicit user pin, Assignment
selection, related current object, prior valid context, then no context.

The renderer uses typed preload methods only:

- `stud-working-context-read`
- `stud-working-context-update`
- `stud-working-context-clear`
- `stud-course-organisation`
- `stud-assessment-classification-list`
- `stud-assessment-classification-set`

Changing context only pre-fills compatible Research/Knowledge/Notes/Documents
work. It does not invoke a provider, Moodle sync, local AI, save a note or make
a relationship. Restart restores only the last valid meaningful context; stale
references clear safely.

## Course, Assignment and Continue UX

The Command Center retains `HOME / COURSES / WORK / LIBRARY / STUDY / TOOLS`.
Courses now use an expandable hierarchy rather than a flat module wall. A compact
`ACTIVE CONTEXT` strip is visible on compatible surfaces with `CHANGE` and
`CLEAR`. Assignment detail shows assessment type and M1 Requirements Contract
state without weakening its lifecycle. Home `CONTINUE YOUR WORK` prioritises the
persisted context and does not fabricate progress.

Notes created from an active Assignment now retain both `courseId` and
`assignmentId`, as well as the explicit canonical relationship.

## Automated validation

Focused M2 tests cover:

- fresh v16 storage and v15→v16 migration;
- no fabricated organisation/context state;
- Engineering, Humanities, Law/Criminology, Social Science and generic fixtures;
- deterministic classification, `UNKNOWN`, user correction and provenance;
- context selection, pinning, restart, clearing and invalid/cross-course rejection;
- object scope validation and no provider/AI side effect;
- typed IPC allowlisting and malformed-payload rejection.

Existing M1, Command Center, workspace, v2.7.0 reality-pass and Electron
trust-boundary suites remain required regression checks.

## Visual validation matrix

The committed renderer fixture defines synthetic academic hierarchy/context
targets for Dark, Light, System→Dark and System→Light at 1680×1050, 1440×900
and 1200×780; the existing v2.7.0 visual suite keeps the adjacent
Assignment/Requirements Contract states covered. Required states are current and historical years,
unknown term, mixed assessment types, context correction, contextual document,
Requirements Contract draft/current, long labels and a compact viewport. No
provider call, model call or Moodle sync occurs because context changes.

The M2 temporary ARM64 validation DMG was rebuilt from the integrity-verified
source, mounted, signature-checked and launched. Its Resources contained the
Calendar helper and ARM64 `node-pty` spawn helper; source inspection confirmed
the packaged Working Context IPC and hardened BrowserWindow settings. The
temporary macOS lock screen prevented an additional interactive screenshot pass
from that mounted window; no screenshot or local profile is retained as a
project artifact.

## Known limitations

M2 intentionally does not create a workflow DAG, blockers, Mission Control,
Artifact Bay, automatic association, provider chaining or AI activity. Some
Moodle providers may not expose year/term; those Courses remain visibly
unclassified until a valid local or provider-backed update is made.
