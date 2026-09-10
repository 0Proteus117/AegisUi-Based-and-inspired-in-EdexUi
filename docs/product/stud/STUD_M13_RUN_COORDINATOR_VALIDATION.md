# M13 — Run Coordinator, Model Routing, Resource Profiles and Watchdog

Status: isolated implementation under final validation. This document is not a
completion marker. Baseline `6f6afa8984e6b5270d9b5ffda82b49bd93226080`, schema
v25; implementation schema v26; application version remains 2.7.1. The Master
Specification is unchanged and M14 has not started.

## Authority and architecture

M3 remains authoritative for Workflow topology and academic work state. M4
remains authoritative for blockers and human checkpoints. M6 remains the only
Run/Event/Artifact journal. M13 adds persistent execution Plans, Steps,
dependencies, attempts and worker checkpoints; it does not complete Workflow
nodes, resolve M4 conditions, approve academic content or submit work.

`studExecutionModel`, `studExecutionRepository`, `studRunCoordinator`,
`studTaskHandlerRegistry`, `studModelRouter` and `studResourceMonitor` are bounded
domain components over the existing STUD SQLite connection. Mission Control
composes those records with M3/M4/M6. Preparing a Plan creates no M6 Run.
Execution requires explicit preflight confirmation. There is no automatic
startup, daemon, provider chain or background university action.

Migration 26 adds normalized Plan, Step dependency, attempt, execution
checkpoint, handler snapshot, model inventory/assessment/route, resource profile
and watchdog incident tables. It adds exact execution lineage to immutable M10
Draft Versions. Existing Assignments receive none of those records. It also
transactionally extends the closed M6 event taxonomy by rebuilding the same M6
table and Artifact join while preserving historical IDs, sequence and links.
Migrations 1–25 are not rewritten. Tests cover fresh DB, actual M6 history,
v25→v26, rollback and foreign keys.

## Execution and handlers

Scopes are current, selected, from-current and full-available Workflow. The
stored topology and canonical input hashes are revalidated before resume.
Fixed main-process handlers are:

- deterministic canonical-input check;
- Section Draft candidate from one reviewed M10 Section, the matching current
  approved M1 Contract, and reviewed/current M8 Claim/Evidence links;
- existing canonical M11 Humanisation Sessions;
- existing M12 review and correction Sessions.

The latter handlers call the original services/runtimes with a routed model and
retain their canonical M6 child Runs. Missing Session selections are human gates.
No executable code, handler choice, arbitrary prompt or endpoint is stored or
accepted from the renderer.

Draft input preserves exact source object, document/extraction/chunk/page/
locator and source-snapshot identity where available. At most 24 Claims and 12
links per Claim are inspected and omissions are reported. Oversize 64 KiB input
fails instead of silently cutting provenance. A reviewed Composition Plan tied
to another Contract revision is rejected. Output remains a candidate. Explicit
acceptance atomically creates one immutable M10 Version and M6 Artifact with
Plan/Step/attempt/route lineage; rejection is also persisted. Nothing autosaves.

## Models, resources and watchdog

Inventory and generation reuse the fixed Ollama loopback boundary. No model is
downloaded and there is no cloud fallback or tool access. Three synthetic trials
per explicit probe record only outcome, protected-value checks, latency, model
digest and coarse hardware class—not transcripts or academic-quality claims.
Assessments are invalid when model digest/probe version changes. Pinning never
falls back. Draft probe v3 uses a fixed JSON shape; values remain model-generated
and are independently checked. The schema contains no expected answer. See the
[Ollama structured-output contract](https://docs.ollama.com/capabilities/structured-outputs).

Observed model: `llama3.2:3b`, digest
`a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72`.
It remains the only installed model. Its drafting and academic-review probes did
not pass. The router therefore records `NO_SUITABLE_MODEL`; no gate is lowered
and no Master's-quality capability is claimed. A negative drafting outcome is
allowed by Master Specification section 80, but the wider real-execution fixture
also requires one successful real model Step and candidate/Artifact. That
acceptance is currently PARTIAL.

Interactive, Balanced, Overnight and bounded Custom profiles govern concurrent
light/network/model slots, context, timeout, retries, battery, memory reserve and
keep-awake. They do not pretend to cap CPU/GPU percentages. Values are observed
from the local OS: free pages, total RAM, RSS/heap, load average, event-loop lag,
disk availability, battery and suspend state. macOS free pages are explicitly
not labelled reclaimable memory. A Custom profile already recorded by a Plan is
immutable so historical policy cannot change.

Pause is after-current-task. Cancellation aborts owned requests and fences late
output. A handler that ignores AbortSignal cannot retain the scheduler slot or
commit its late result. Suspension interrupts active attempts, retains execution
checkpoints, pauses the M6 parent and requires explicit resume. Restart converts
phantom RUNNING state to INTERRUPTED without replay. Resume revalidates input,
topology, model and resources. Watchdog incidents use real timeout/state; no fake
heartbeat, ETA, progress or activity is emitted.

## Bounds and scale

Normal Mission Control uses 20 Plan summaries, five attempts and three
checkpoints per displayed Step, at most 200 M6 events, 50 Artifacts and a
512-Run parent/child neighborhood. Truncation is visible and does not delete
history. Model metadata is limited to 16 KiB and execution JSON to 64 KiB.

Synthetic scale passed with 100 Courses, 1,000 Assignments, 500 Workflows,
1,000 Plans, 10,000 Steps, 20,000 attempts, 4,000 checkpoints, 21,000 M6 Runs,
20,000 events, five model identities and 35 assessments. One measured run (ms):
Plan 3.337, ready query 0.070, Step 0.323, checkpoint 0.267, restart
reconciliation 19.208, actual route 3.698, bounded Mission composition 436.516,
history 3.526, incidents 0.369, actual DB reopen/hydration 23.719. No scale corpus
was globally executed. An M4 restart benchmark initially exceeded its threshold
while two external-volume suites ran concurrently; an isolated rerun passed at
10.1 ms. The first result is not hidden or relabelled.

## Security, privacy and UX

Sixteen fixed STUD channels pass the hardened preload allowlist. Main validates
sender, keys, IDs, ownership, lifecycle, versions and bounds. Renderer still has
no Node, raw IPC, SQL, filesystem, shell, generic network or model authority.
Structured events reject secret-bearing payloads. Public fixtures and screenshots
are synthetic and cover only the isolated STUD surface.

Mission Control is calm with no Run and operational only from persisted state.
Academic inputs/model/profile controls use progressive disclosure. The rail,
actual elapsed timestamps, indeterminate model state, human/external waits,
incidents, bounded events, artifacts, candidate decisions and history are real
domain fields. No percentage is shown without a numerator/denominator. An
unreadably small Artifact empty state was fixed. Wider STUD navigation complexity
is retained as known debt; M13 does not redesign it.

Real Electron validation uses the application appearance resolver for Dark,
Light, System→Dark and System→Light at 1680×1050@2x, 1440×900@2x and
1200×780@1x. Twenty labelled synthetic layout cases passed overflow/control/
Node-isolation checks. A separate real preload/main deterministic execution
completed one attempt with ten M6 events and left M3 work state unchanged.

## Technical audit

Fixed MAJOR findings:

- volatile M1 inspection timestamps produced false input drift;
- ignored aborts could occupy scheduling forever;
- suspend and restart were conflated;
- source projection could sever nested provenance;
- M8 reviewed-link field mismatch excluded real Evidence;
- mutable recorded profiles could rewrite historical policy;
- Composition/Contract mismatch could draft against obsolete authority;
- placeholder M11/M12 wrappers did not execute canonical services.

Fixed MINOR findings: previous attempt/nested Run history was omitted; bounds were
not visible; retry/skip actions lacked contextual rendering; Artifact empty text
was unreadable. M3/M4 and M6 retain one authority each. No competing persistence,
renderer log sink, generic executor, fake workflow completion or silent model
fallback was found after correction.

Open BLOCKING acceptance finding: the installed model has not produced a
capability-gated successful real model Step and canonical candidate/Artifact.
Implementation tests use an explicitly identified test double and are not cited
as model evidence. Do not integrate or declare M13 complete until the remaining
acceptance and packaged gates pass.

## Validation ledger

- Core coordinator/domain: 20 passed.
- Integration: 12 passed with a labelled synthetic model double.
- IPC: 10 passed; renderer contracts: 8 passed.
- Electron trust boundary: 17 passed; prebuild integrity: 4 passed.
- Scale: PASS; real deterministic preload/main execution: PASS.
- Real local-model execution acceptance: PARTIAL (`NO_SUITABLE_MODEL`).
- Broad regression and private ARM64 package results must be recorded before
  integration. CodeQL CLI availability must be stated separately from its seven
  local targeted checks.

M14 is out of scope. The next task while this status remains is finishing M13,
not beginning M14.
