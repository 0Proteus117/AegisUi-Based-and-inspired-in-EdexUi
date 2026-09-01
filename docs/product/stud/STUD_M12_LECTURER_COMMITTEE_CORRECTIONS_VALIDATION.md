# STUD M12 — Lecturer Committee and Corrections validation

Date: 2026-09-01
Implementation baseline: `b3684d05212872e0b0997da4590592e89ca26442`
Canonical academic schema: v25
Product authority: `AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf`

## Scope and outcome

M12 adds an Assignment-scoped advisory academic review and explicit correction
loop over an exact immutable M10 Draft Version. It does not impersonate a
lecturer, assert academic correctness, promise or generate an institutional
grade, auto-accept corrections, mutate Workflow state, invoke cloud AI or submit
academic work. Human academic judgement remains authoritative.

## Schema v25

Migration 25 is one transactional extension over schema v24. It adds:

- review Sessions, independent reviewer Passes, typed Findings and immutable
  finding-event history;
- post-pass Synthesis groups and optional rubric-bound Formative Estimates;
- explicit Correction Plans, Correction Items and finding links;
- Correction Sessions, Section decisions and deterministic integrity checks;
- exact M12 lineage columns on accepted M10 Draft Versions;
- validated M12 pointers in the persistent Working Context;
- Assignment/Run/time-oriented indexes for bounded review and correction reads.

Existing Assignments migrate with zero fabricated Sessions, Findings, Plans,
Corrections, review state or Draft lineage. Fresh v25, representative v24→v25,
restart and forced-failure rollback paths pass. Migrations 1–24 were not
rewritten.

## Exact review basis and committee passes

A Session binds one Assignment to an exact immutable Draft Version and snapshots
the Draft content hash, reviewed Composition Plan revision/hash, current
Requirements Contract revision/hash, bounded Citation snapshot hash and optional
M11 Humanisation Session lineage. The canonical source records remain owned by
M1/M8/M10/M11; M12 does not create a second Draft, Evidence or Citation store.

The five discipline-neutral reviewer roles are Requirements, Argument and
Structure, Evidence and Citation, Methods and Technical, and Academic
Communication. Applicability is explicit, so Methods/Technical may be marked not
applicable rather than forced onto every discipline. Deterministic checks run
first. Each local-model pass receives the same bounded basis and never receives
another reviewer's findings. Synthesis is a separate post-pass step and retains
agreement, complementarity, disagreement and unresolved states without silently
choosing a winner.

## Findings, history and formative estimate

Findings retain role, category, severity, provenance, exact source basis,
explanation, recommended action, status and optimistic row version. Status
changes append history instead of rewriting it. Renderer input cannot forge
model/system provenance or reviewed state.

The optional formative estimate is available only when the user explicitly
requests it and an authoritative, inspectable rubric exists. It returns a range,
readiness label and bounded rationale; it is never a single mark, institutional
prediction or lecturer decision. Missing or ambiguous rubric authority fails
closed.

## Correction plans, candidates and immutable lineage

A Correction Plan is created only from explicitly selected Findings. Each item
is manual or a local-AI candidate action. Manual editing remains available when
Ollama is absent or unsuitable. Local output is stored as a candidate rather
than a Draft Version and is shown through the existing bounded diff contract.

M11 protected spans and deterministic integrity checks cover citations,
quotations, numerical values/units, equations, identifiers and URL/DOI values.
An integrity conflict disables ordinary acceptance. Any override is explicit,
confirmed and scoped to one exact Section plus protected-content type; no global
integrity bypass exists.

Full or selected-Section acceptance creates a complete immutable M10 Draft child
and atomically records parent Version, M12 Review Session, Correction Plan and
Correction Session lineage plus the resulting M6 Artifact. Rejection and
cancellation preserve review/candidate history and create no Draft. A late model
result after cancellation cannot revive a Session or create output.

## M1–M11 integration

- M1 Requirements Contract and rubric identity remain canonical and immutable.
- M2 Working Context may retain active Review/Finding/Plan/Item/Correction IDs
  after main-process ownership validation; context changes start no operation.
- M3/M4 Workflow, blockers and checkpoints remain authoritative. M12 recheck is
  explicit, deterministic and does not change Workflow state.
- M5 Assignment Workspace provides the calm `ACADEMIC REVIEW` entry and
  contextual review/correction surface.
- M6 records only genuine local-model calls as indeterminate Runs and registers
  accepted Draft artifacts; CRUD and deterministic checks create no fake Runs.
- M7–M9 research, Evidence, Citation and faculty records are referenced by exact
  canonical identities and are never silently converted or duplicated.
- M10 owns Draft documents/versions and creates immutable accepted children.
- M11 optional source lineage and protected-span contracts remain intact.

## Security and privacy

Electron remains `nodeIntegration: false` and `contextIsolation: true`.
Twenty-two fixed typed M12 channels are allowlisted. There is no raw
`ipcRenderer`, generic SQL/filesystem/shell/network/model endpoint, tool
capability or cloud fallback. Main process validates sender, IDs, Assignment
ownership, exact Draft/Plan/Contract relationships, role applicability,
lifecycle, optimistic versions, payload bounds and correction integrity.

The fixed Ollama loopback runtime receives bounded untrusted academic text in a
strict JSON request with no tools. Malformed, forged-ID, duplicate or oversized
responses fail closed. Screenshots and scale fixtures are synthetic and contain
no Moodle/UEL records, credentials, local usernames, private paths or personal
academic material.

## Bounds and scale

Validated synthetic corpus:

- 100 Courses and 1,000 Assignments;
- 3,000 Review Sessions and 3,000 reviewer Passes;
- 15,000 Findings;
- 1,000 Correction Plans and 3,000 Correction Items.

Observed local bounded reads were approximately 1.66 ms for recent review
history, 0.48 ms for exact Session hydration, 0.12 ms for filtered Findings,
0.27 ms for recent Correction Plans, 1.18 ms for normal Composition state and
1.01 ms for restart hydration. These are local observations, not performance
guarantees. Normal Assignment/Composition loading did not hydrate review
history.

## Live visual validation

Actual Electron 42.4.1 was launched with isolated temporary user data and the
real M12 renderer/CSS. Twelve synthetic combinations passed:

- Dark, Light, System→Dark and System→Light;
- 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x;
- entry/no review, active pass, completed review, disagreement, unavailable
  model, correction candidate, protected-content conflict, accepted estimate,
  long text and generic/manual Assignment;
- no horizontal overflow, escaped controls, clipped primary actions, fake
  percentage or card-wall regression.

Representative captures were visually inspected. Review is calm at entry,
findings/synthesis use progressive disclosure, correction diffs remain readable
at compact size and controls do not imply unavailable actions.

## Tests and regression

Focused M12 source validation:

- domain/migration/lifecycle/runtime/cancellation: 21 passed;
- typed IPC/preload: 11 passed;
- renderer/UI contract: 5 passed;
- scale: passed;
- live visual matrix: 12 passed.

M10 (21), M11 (33), Working Context (13), Electron trust boundary (17),
CodeQL-focused security (7), prebuild integrity (4) and clean-environment schema
reproducibility (8) passed after M12 corrections. Full regression,
release-health and packaged-runtime results are reported after final committed
source validation.

## M1–M12 technical audit

### BLOCKING

None remaining after correction and rerun.

### MAJOR — fixed

1. A cancellation race allowed a late model response to overwrite the terminal
   `CANCELLED` state in review or correction execution. The service now reloads
   authoritative Session state before accepting runtime output and preserves
   terminal cancellation in finalisation. Delayed-runtime regressions prove that
   cancelled work creates no Draft.
2. Older reproducibility fixtures replayed migrations from a simulated v24
   database without removing the newly created v25 objects. The fixture now
   removes only v25 objects before replay and verifies representative v9/v12
   migration to the current schema.

### MINOR

- Deterministic review cannot establish semantic academic correctness; model
  findings and synthesis require human inspection.
- Protected-span recognition remains conservative for discipline-specific
  notation. Unknown semantic changes are a human-review responsibility.

### INFORMATIONAL

- The currently installed 3B model remains capability-limited and carries no
  quality claim.
- M12 intentionally does not implement model routing, workers, resource profiles,
  watchdog operation or lecturer-feedback import.

No duplicate Draft/Evidence/Citation/Workflow authority, fabricated progress,
renderer-controlled review provenance, cloud fallback or M12-caused BLOCKING/
MAJOR finding remained after correction and rerun.

## Packaging and release boundary

M12 extends preload and the local-model runtime boundary, so private ARM64
packaged validation is required. The final DMG identity, mount/launch evidence,
`app.asar` inspection and packaged dependency checks are reported after the
final committed source is packaged. M12 does not create a public release.

## Next milestone boundary

M12 does not start autonomous execution. The next product milestone is M13 — Run
Coordinator, Model Routing, Resource Profiles and Watchdog.
