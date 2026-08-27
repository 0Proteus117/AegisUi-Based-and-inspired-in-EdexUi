# STUD Assignment Workflow Engine — implementation roadmap

## How to execute this roadmap

Read, in order:

1. the preserved Master Specification;
2. `STUD_ASSIGNMENT_WORKFLOW_ENGINE_GAP_ANALYSIS.md`;
3. `STUD_ASSIGNMENT_WORKFLOW_ENGINE_ARCHITECTURE.md`;
4. this roadmap;
5. the current code and tests at the milestone base commit.

One milestone equals one isolated branch/worktree, a complete implementation,
focused tests, broad regression, required live validation, commit and push. Do
not begin the next milestone while the current milestone has uncommitted work or
unresolved owned regressions. Version/schema numbers below are targets; if the
repository has advanced, preserve monotonic numbering and document the mapping.

## Programme groups

- **A — Foundations:** M1, Electron Trust-Boundary Hardening, M2–M4
- **B — Contextual Assignment UX:** M5–M6
- **C — Research and evidence:** M7–M9
- **D — Composition and quality:** M10–M12
- **E — Execution and storage:** M13–M14
- **F — Completion and acceptance:** M15–M16

## M1 — Reviewed Requirements Contract

- **Objective:** replace the transient regex readout as authority with a reviewed,
  revisioned Requirements Contract for manual and Moodle Assignments.
- **Exact scope:** schema/model/repository/service/IPC for immutable revisions,
  independent lifecycle/completeness/freshness, persistent candidate review,
  explicit Assignment current-contract pointer and exact source snapshots;
  candidate extraction may reuse `assignmentRequirements()` only as a bounded
  non-authoritative input; Assignment UI can create, review, approve (including
  explicit incomplete approval) and supersede a contract.
- **Components:** `StudAcademicModel`, the existing SQLite migration owner, new
  bounded Requirements Contract model/repository/service, `studAcademicIpc`,
  `StudCommandCenter`, STUD CSS and focused documentation.
- **Schema/migration:** v14 → v15; add contract/revision, Assignment pointer,
  candidate/run, item/source and freshness tables with indexes.
  Existing Assignments remain untouched and show `CONTRACT NOT CREATED`.
- **Dependencies:** v2.7.0 canonical Assignments, provenance, document chunks.
- **Non-goals:** no workflow run, DAG, automatic research, model drafting or
  Moodle write; regex output is not auto-approved.
- **Acceptance criteria:** manual and Moodle Assignment can produce candidates;
  extraction coverage/limits are inspectable; exclusion remains review history;
  student reviews and approves; unknown/conflicting requirements remain visible;
  stale writes fail; approved content is immutable; editing creates a new draft;
  current pointer updates transactionally; source drift never mutates history;
  restart preserves exact source resolution and revision history.
- **Automated tests:** fresh v15, v14 upgrade, representative older upgrade,
  validation/limits, source page/chunk trace, approval/supersession, no destructive
  Assignment/provider changes, no provider/model side effects.
- **Live/visual validation:** Dark/Light/System at 1680×1050, 1440×900 and
  1200×780; long brief, missing rubric, conflicting dates and empty contract.
- **Regression:** Moodle sync/files, Documents, Research, Notes/Citations, Context
  Packages, privacy, release health and broad aggregator.
- **User-visible result:** an inspectable `REQUIREMENTS CONTRACT` gate inside the
  Assignment, not a generated checklist pretending certainty.

## Electron Trust-Boundary Hardening intervention

**Status: COMPLETE — 2026-08-24.** See
[`ELECTRON_TRUST_BOUNDARY_HARDENING_2026-08-24.md`](../../security/ELECTRON_TRUST_BOUNDARY_HARDENING_2026-08-24.md).

- **Objective:** incrementally move the primary renderer to a typed preload trust
  boundary before more powerful Workflow Engine surfaces are added.
- **Exact scope:** `nodeIntegration: false`, `contextIsolation: true`, remove
  renderer direct Node dependencies, remove/reduce `@electron/remote`, expose
  narrowly typed preload APIs and preserve existing capability behaviour.
- **Dependencies:** completed M1 and its preload-ready APIs.
- **Non-goals:** no M2 working-context redesign, workflow DAG, new provider,
  feature expansion or unrelated Electron rewrite.
- **Acceptance criteria:** existing Aegis workspaces remain functional through
  typed boundaries; no renderer receives generic Node/filesystem/network/shell
  authority; Calendar, node-pty, Moodle SSO and packaging guard remain green.
- **User-visible result:** no intended UX change; a smaller renderer trust surface.

## M2 — Academic organisation and working context

- **Objective:** make Course/year/term/module/Assignment context explicit and
  propagate the active work context between existing STUD surfaces.
- **Status:** COMPLETE — schema v16 and the M2 validation record implement this
  milestone without beginning M3.
- **Exact scope:** optional Course academic-year/term/level metadata; one
  main-process-validated, persistently meaningful `StudWorkingContext`;
  contextual navigation/prefill and visible correction control.
- **Components:** model/store/IPC for optional Course metadata, Command Center,
  existing STUD workspace classes and a new renderer context coordinator.
- **Schema/migration:** v16; nullable Course organisation fields, presentation
  classification records and one current working-context row. It stores the
  last meaningful context only, never an automatic navigation history.
- **Dependencies:** M1 and existing Course/Assignment hierarchy.
- **Non-goals:** no automatic queries, saves, provider actions, new global tab or
  permanent wall of controls.
- **Acceptance criteria:** Assignment context follows navigation to Documents,
  Research, Notes, Citations, Knowledge and Compute; destination stays idle; user
  can change/clear context; unrelated Assignments do not leak state.
- **Automated tests:** context handoff matrix, no side effects, null old rows,
  Course filtering and cross-Assignment isolation.
- **Live/visual validation:** all themes/viewports; back-navigation, long Course
  labels and context correction.
- **Regression:** every STUD workspace, Moodle, OSINT, ENG, Calendar and Assistant.
- **User-visible result:** the student selects the Assignment once and sees a
  small correctable context indicator across relevant STUD work.

## M3 — Workflow templates and persistent DAG

- **Status:** COMPLETE — schema v17 and the M3 validation record implement the
  persistent planning/state foundation without beginning M4.
- **Objective:** create the real persistent Assignment workflow beneath the UI.
- **Exact scope:** five versioned starting templates; Assignment workflow
  instances; normalized nodes/edges; derived readiness; explicit state
  transitions; bounded meaningful history; pre-work topology editing; explicit
  historical replacement; calm Assignment workflow view.
- **Components:** new `StudWorkflowTemplateRegistry`,
  `StudWorkflowRepository`, `StudWorkflowService`, `StudWorkflowModel`, typed
  IPC/preload, renderer workspace and tests.
- **Schema/migration:** v17; template/version/node/edge, instance/node/edge/event
  tables and optional Working Context workflow references. No backfill creates
  a workflow or marks work complete.
- **Dependencies:** approved or explicitly incomplete M1 Contract, or a recorded
  explicit no-Contract reason.
- **Non-goals:** no task execution, Mission Control animation, research automation
  or model use.
- **Acceptance criteria:** create workflow from template; reject cycles/missing
  dependencies; deterministic next-ready nodes; persistent state after restart;
  static v2.7 roadmap no longer represents authority.
- **Automated tests:** template validation, DAG ordering, parallel branches,
  invalid transitions, idempotent creation and migration.
- **Live/visual validation:** calm milestone history/detail in all themes and compact
  viewport, clearly labelled `NOT STARTED` rather than fake progress.
- **Regression:** M1, Command Center, schema/reproducibility and broad STUD tests.
- **User-visible result:** an Assignment has a real inspectable workflow instance.

## M4 — Blockers, checkpoints and recovery

- **Status:** COMPLETE — schema v18 and the M4 validation record implement
  blockers, explicit human gates, scoped propagation and restart recomputation;
  runtime worker recovery remains deferred to M13.
- **Objective:** represent honest external dependencies and resumable execution
  state without running expensive work yet.
- **Exact scope:** blocker taxonomy, dependency impact, workflow-state journal,
  human checkpoints/transitions, durable human-decision/event contracts and
  branch continuation. Runtime worker crash/resume payloads are deferred to M13
  where the execution coordinator exists.
- **Components:** bounded conditions repository/service/model, workflow DAG
  derivation, typed IPC/preload, Assignment workflow inspector and UI.
- **Schema/migration:** expected v18; blocker, checkpoint and meaningful-event
  tables with bounded payloads and integrity hashes.
- **Dependencies:** M3.
- **Non-goals:** no fictional lab/team data, no generic job queue, no provider/model
  execution.
- **Acceptance criteria:** a missing team geometry artifact blocks only dependent
  nodes; independent nodes remain READY; resolve/reopen blocker with provenance;
  journal/checkpoint contracts persist without pretending a worker can resume.
- **Automated tests:** blocker taxonomy/lifecycle, dependency propagation, human
  decisions/follow-ups, optimistic concurrency, restart recomputation,
  provenance, bounds and fail-closed payload rejection.
- **Live/visual validation:** partial, blocked, waiting and human-input cases; status
  meaning does not rely only on colour.
- **Regression:** Assignment conflicts, Revision sessions, persistence/privacy.
- **User-visible result:** honest blockers and recoverable progress replace vague
  incomplete states.

## M5 — Contextual Assignment Workspace

**Status: complete.** Implemented without a schema migration in
`StudAssignmentWorkspace`, composed from M1 Requirements Contract, M2 Working
Context and M3/M4 Workflow state. The validation record is
[`STUD_M5_ASSIGNMENT_WORKSPACE_VALIDATION.md`](STUD_M5_ASSIGNMENT_WORKSPACE_VALIDATION.md).

- **Objective:** turn Assignment Detail into a calm, contextual workspace.
- **Exact scope:** workspace shell, progressive disclosure, summary/contract/
  blockers/next action, typed preview adapters and adjacent canonical Notes.
- **Components:** `StudCommandCenter`, existing Document/Research/Notebook/Compute
  views, preview adapter registry, CSS and accessibility contracts.
- **Schema/migration:** none expected; reuse Notes, relationships and context.
- **Dependencies:** M1–M4.
- **Non-goals:** no Mission Control, new editor engine, generic webview or permanent
  configuration panels.
- **Acceptance criteria:** PDF/document/resource/repository/data/compute previews
  use safe existing readers; Notes save explicitly to active Assignment; empty and
  unavailable previews remain useful; no repeated context selection.
- **Automated tests:** adapter allowlist, no arbitrary path/URL, explicit note save,
  keyboard/focus and layout invariants.
- **Live/visual validation:** all themes/viewports; portrait/long PDF metadata,
  large notes, disconnected assets and empty Assignment.
- **Regression:** all STUD navigation and shared theme/popups.
- **User-visible result:** one Assignment workspace with preview and notes instead
  of a database-record inspector.

## M6 — Artifact Bay and truthful Mission Control shell

**Status: complete.** Implemented in schema v19. Artifact Bay indexes canonical
objects without duplicating contents; structured Runs and Events provide bounded
restart-persistent history; Mission Control composes real M3/M4/Run/Event state.
No renderer Run/event append channel, worker engine, fake progress or automated
operation was introduced. See
`STUD_M6_ARTIFACT_BAY_MISSION_CONTROL_VALIDATION.md`.

- **Objective:** expose real workflow artifacts and events without yet adding the
  full automated research/composition pipeline.
- **Exact scope:** Artifact Registry/reference index, bounded event-feed contract,
  Mission Control milestone strip, Artifact Bay and a minimal live-work shell fed
  only by real current/historical events.
- **Components:** artifact service, workflow coordinator events, typed IPC,
  Assignment Workspace operational mode and CSS.
- **Schema/migration:** expected v19; artifact reference and availability metadata
  if not included in v18.
- **Dependencies:** M3–M5.
- **Non-goals:** no fake logs, synthetic CPU values, arbitrary filesystem browser,
  worker execution, heartbeats, pause/resume, resource profiles, watchdog,
  high-resource scheduler or provider chaining. Full operations belong to M13.
- **Acceptance criteria:** only actual canonical/managed artifacts appear; event
  sequence is real and bounded; historical run inspectable; idle Assignment hides
  operational complexity.
- **Automated tests:** artifact dedup/reference integrity, event bounds/order,
  unavailable storage, no payload duplication and no fake progress timer.
- **Live/visual validation:** running/paused/blocked/history states, all themes and
  compact workspace.
- **Regression:** previews, Notes, Documents, Compute and privacy logs.
- **User-visible result:** Mission Control becomes visible only for real or
  historical workflow activity.

## M7 — Research Plan, source gate and Topic Dossiers

**Status: COMPLETE.** Implementation and validation are recorded in
`STUD_M7_RESEARCH_PLAN_TOPIC_DOSSIERS_VALIDATION.md`.

- **Objective:** convert explicit Research infrastructure into a reviewed,
  bounded Assignment research process.
- **Exact scope:** research questions, source needs/functions, provider plan,
  quality checks, stopping criteria and versioned Topic Dossiers.
- **Components:** new research-plan/dossier services, existing Research runtime,
  Context Packages, workflow tasks and Assignment Workspace.
- **Schema/migration:** expected v20; plans/questions/source-needs/dossiers/items.
- **Dependencies:** M1, M3–M6.
- **Non-goals:** no crawler, bulk downloader, paywall bypass, arbitrary endpoint,
  autonomous provider expansion or drafting.
- **Acceptance criteria:** student approves plan; each acquisition is within named
  providers/imports; dossiers show agreement/disagreement/gaps/methods; stopping
  rationale is inspectable; unavailable source stays unresolved.
- **Automated tests:** plan validation, provider allowlist, bounded acquisition,
  dossier provenance/dedup, cancellation and offline behaviour.
- **Live/visual validation:** sparse/rich/conflicting sources, blocked paywalled
  source, long dossier and compact view.
- **Regression:** Research, Citation.js, Documents, Moodle files and Local AI.
- **User-visible result:** Research is driven by the Assignment's reviewed needs
  rather than isolated searches.

## M8 — Claim, Evidence Map and citation integrity

**Status: COMPLETE.** Implementation and validation are recorded in
`STUD_M8_CLAIMS_EVIDENCE_CITATION_INTEGRITY_VALIDATION.md`.

- **Objective:** provide bidirectional claim-to-source trace and distinguish
  citation formatting from support integrity.
- **Exact scope:** claim records, evidence roles, exact source/page/chunk/data
  targets, contradictions, Evidence Map and citation-support audit.
- **Components:** model/store/service/IPC, Document chunks, Research papers,
  Citation.js, Artifact Bay and UI.
- **Schema/migration:** expected v21; claims and evidence-link tables plus indexes.
- **Dependencies:** M7 and existing provenance/chunks.
- **Non-goals:** no automatic truth verdict, fabricated quotation/page, semantic
  claim generation or replacement of Citation.js.
- **Acceptance criteria:** navigate claim ↔ evidence ↔ canonical source ↔ exact
  location; unsupported and contradictory claims remain visible; citation audit
  never treats formatting as support.
- **Automated tests:** referential integrity, exact location, contradiction,
  unsupported claim, redacted/unavailable source and bibliography independence.
- **Live/visual validation:** evidence-dense and unsupported sections, long source
  labels, all themes/viewports.
- **Regression:** Document provenance, Research, Notes/Citations and Context.
- **User-visible result:** an inspectable Evidence Map for the active Assignment.

## M9 — Faculty Literature Scout

- **Objective:** add a bounded, ambiguity-aware Faculty Gems workflow.
- **Exact scope:** explicit lecturer identity candidate, affiliation/department
  evidence, public academic identifiers and ordinary source-quality evaluation.
- **Components:** fixed existing academic-provider adapters where contractually
  sufficient, new resolver/service, Research Plan and provenance UI.
- **Schema/migration:** expected v22 only if durable identity candidates/decisions
  need records; otherwise reuse external identifiers/provenance.
- **Dependencies:** M7–M8 and a documented provider review.
- **Non-goals:** no people search, private-profile crawling, forced inclusion,
  flattery or identity certainty from name alone.
- **Acceptance criteria:** CONFIRMED/PROBABLE/AMBIGUOUS/UNRESOLVED are evidence-
  based; user selects identity; publications pass normal gates; offline state is
  honest.
- **Automated tests:** homonyms, affiliation conflict, no match, provider failure,
  no automatic source inclusion and privacy bounds.
- **Live/visual validation:** ambiguous and confirmed synthetic faculty fixtures.
- **Regression:** Research/provider security, Entity privacy and Citation.js.
- **User-visible result:** relevant faculty literature can be discovered without
  pretending certainty or privileging it automatically.

## M10 — Composition Plan, requirement coverage and draft versions

- **Objective:** create an evidence-backed composition plan and versioned drafting
  surface.
- **Exact scope:** section purpose, requirement/LO/rubric links, planned claims,
  evidence, word budget, pre-mortem, draft versions and live coverage.
- **Components:** composition service/store/IPC, structured editor, Evidence Map,
  Requirements Contract and Artifact Bay.
- **Schema/migration:** expected v23; composition plans/sections, draft artifacts/
  versions and requirement mappings.
- **Dependencies:** M1, M8.
- **Non-goals:** no automatic final essay, silent overwrite, submission, invented
  rubric or ungrounded drafting.
- **Acceptance criteria:** budgets reconcile; over/under/pending visible; every
  planned claim can link evidence; new draft preserves parent; UNKNOWN requirements
  remain visible.
- **Automated tests:** budget arithmetic, version immutability, coverage mapping,
  missing evidence, long sections and explicit save.
- **Live/visual validation:** long plan, over-budget section, missing rubric,
  structured draft and compact viewport.
- **Regression:** Notes editor, citations, context packages and document preview.
- **User-visible result:** a composition plan and draft history grounded in the
  reviewed Assignment contract.

## M11 — Versioned Humanisation with diff

- **Objective:** provide controlled author-voice editing without evidence changes
  or detector-evasion claims.
- **Exact scope:** explicit genre/profile selection, bounded local-model transform,
  protected semantic/citation/numeric checks, parent/child draft and visible diff.
- **Components:** Local Academic AI boundary, composition service, diff renderer,
  model capability router interface and review UI.
- **Schema/migration:** reuse v23 draft versions; optional profile table only if
  preferences cannot fit existing secure local settings.
- **Dependencies:** M10 and compatible local model capability.
- **Non-goals:** no typo injection, plagiarism concealment, detector bypass,
  automatic acceptance or cloud fallback.
- **Acceptance criteria:** unavailable model blocks honestly; transform is opt-in;
  citations/numbers/evidence links are invariant or force review; diff and source
  profile visible; original version retained.
- **Automated tests:** invariants, cancellation, malformed model output, no model,
  no persistence before approval and prompt-injection resistance.
- **Live/visual validation:** long diff, rejected transform, unavailable model and
  all themes/viewports.
- **Regression:** Local AI source trace, Notes, drafts and privacy.
- **User-visible result:** an inspectable optional editorial pass, never a hidden
  rewrite.

## M12 — Lecturer Committee and corrections loop

- **Objective:** add rubric-led advisory review and versioned corrections.
- **Exact scope:** panel roles, review rounds/findings, estimate caveat, blocked-
  section handling, accept/reject/defer finding and correction trace.
- **Components:** review service, Requirements Contract/rubric, Evidence Map,
  drafts, Revision Items, Local AI and UI.
- **Schema/migration:** expected v24; review rounds/findings/decisions and links.
- **Dependencies:** M10; M11 optional.
- **Non-goals:** no institutional grade promise, automatic final acceptance,
  penalty for genuine blockers or historical-result rewriting.
- **Acceptance criteria:** findings cite criterion/draft/evidence; disagreements
  visible; correction creates new version; imported real feedback remains a new
  observation and historical estimates remain immutable.
- **Automated tests:** rubric missing/present, blocked milestone, panel disagreement,
  finding lifecycle, correction trace and grade disclaimer.
- **Live/visual validation:** multi-round review, unresolved finding, blocked result
  section and long rubric.
- **Regression:** Revision, Progress Analytics, provenance and Local AI.
- **User-visible result:** a transparent quality-control loop, not a magic mark.

## M13 — Run coordinator, model routing, resource profiles and watchdog

- **Objective:** execute approved workflow tasks manually with honest resource and
  progress control.
- **Exact scope:** launch consent summary, bounded task coordinator, runtime worker
  recovery/checkpoint payloads, local model capability tiers,
  ECO/BALANCED/MAXIMUM/CUSTOM policies, heartbeat/watchdog,
  pause/resume/retry/give-Mac-back/cancel and full Mission Control operation.
- **Components:** workflow runtime, existing provider/model/compute/document
  services, ModelCapabilityRouter, ResourcePolicy, Watchdog and Mission Control.
- **Schema/migration:** expected v25; run consent/profile metadata and durable task
  attempts if not already covered by workflow tables.
- **Dependencies:** M3–M12 contracts; individual branches may execute only when
  their own dependencies are satisfied.
- **Non-goals:** no arbitrary processes, shell, provider chain expansion, cloud
  fallback, background monitoring or automatic submission.
- **Acceptance criteria:** launch lists exact work/network/model/storage; only
  approved tasks run; progress comes from outputs; stall state and controls work;
  checkpointed pause returns resources; limited model is disclosed.
- **Automated tests:** scheduler bounds, consent mismatch, model absent, provider
  failure, heartbeat stall, pause/resume/crash, cancellation and secret rejection.
- **Live/visual validation:** all profiles, stall/retry, parallel independent branch,
  blockers and real telemetry on supported hardware.
- **Regression:** provider runtimes, Local AI, Compute, Documents, Moodle and app
  responsiveness.
- **User-visible result:** a manually launched, observable Assignment Run.

## M14 — External academic storage and portable mode

- **Objective:** complete external academic storage and portable travel support.
- **Ordering note:** deliver Storage Profile Core before the first earlier
  milestone that genuinely requires large local academic model/external model
  storage; M14 completes full artifact migration, cleanup and Portable Mode.
- **Exact scope:** storage profiles/volume identity, managed relative references,
  availability/usage, verified move, cache cleanup classes and portable manifests.
- **Components:** main-process StorageProfileService, store/IPC, file picker,
  Artifact Bay, model/artifact managers and settings UI.
- **Schema/migration:** expected v26; storage profiles, managed-asset mappings and
  portable manifests. Existing references map to local default without moving.
- **Dependencies:** M6 and M13.
- **Non-goals:** no hardcoded Seagate path, arbitrary renderer filesystem, silent
  move/delete, cloud sync or claim of instant HDD performance.
- **Acceptance criteria:** disconnected volume leaves Assignment/deadline visible;
  dependent artifacts OFFLINE; verified migration/rollback; portable size preview,
  hash-verified copy and restore.
- **Automated tests:** traversal/symlink rejection, missing volume, insufficient
  space, hash mismatch, rollback, cache policy and old-reference compatibility.
- **Live/visual validation:** HDD disconnect/reconnect, portable plan, progress and
  errors in all themes.
- **Regression:** managed Moodle files, PDFs, datasets, models, packaging and
  privacy paths.
- **User-visible result:** explicit reliable academic storage profiles and
  `MAKE ASSIGNMENT PORTABLE`.

## M15 — Final package and explicit human approval

- **Objective:** assemble a traceable candidate package and stop at student review.
- **Exact scope:** selected draft/bibliography/appendices, coverage, citation audit,
  committee/blocker reports, run audit, integrity manifest, reveal/export and
  approval state.
- **Components:** final-package service, Citation.js, artifacts, workflow, review,
  typed export IPC and Assignment Workspace.
- **Schema/migration:** expected v27; package metadata/version/approval records;
  exported files remain managed artifacts.
- **Dependencies:** M8, M10, M12–M14 as applicable.
- **Non-goals:** absolutely no Moodle/LMS/university submission, credential use,
  fabricated completion or hidden approval.
- **Acceptance criteria:** package declares unresolved items; hashes verify; student
  previews and explicitly approves; export/reveal is local; no submission IPC or
  network request exists.
- **Automated tests:** manifest/hash, missing artifact, unresolved blocker, approval
  gate, export path bounds and static no-submission audit.
- **Live/visual validation:** complete, partial and blocked package; long reports;
  all themes/viewports.
- **Regression:** Citations, drafts, storage, privacy and release health.
- **User-visible result:** a candidate package ready for human review and manual
  submission outside Aegis.

## M16 — Private real acceptance, hardening and milestone release

- **Objective:** prove the complete engine using public synthetic fixtures and the
  private/local EG4020 RESIT case without publishing private content.
- **Exact scope:** end-to-end run, crash/resume, offline/storage, blocked-team-data
  branch, accessibility/performance/security/privacy, packaged app and milestone
  release evidence.
- **Components:** all Workflow Engine layers, acceptance harness, packaging and
  release-health tooling.
- **Schema/migration:** none unless a defect requires a narrowly justified fix.
- **Dependencies:** M1–M15.
- **Non-goals:** no new feature phase, private fixture commit, false Master's-grade
  claim or automatic submission.
- **Acceptance criteria:** synthetic suite passes; private run shows genuine missing
  geometry/calculation inputs as blockers while independent branches continue;
  restart/checkpoint, offline and mounted packaged app behave correctly; no private
  content appears in Git/release.
- **Automated tests:** full focused suites, migration matrix, security/privacy,
  scale, packaging integrity and broad regression.
- **Live/visual validation:** Dark/Light/System at required viewports; real Mission
  Control, artifacts, evidence, composition, review, package and accessibility.
- **Regression:** every Aegis workspace plus Calendar helper, node-pty, Citation.js,
  Ollama boundary, Moodle SSO/sync and packaging guard.
- **User-visible result:** a validated milestone DMG/release of the completed
  Assignment Workflow Engine.

## Exact next milestone

M1, the dedicated Electron Trust-Boundary Hardening intervention, and M2–M8 are
complete. The exact next product milestone is **M9 — Faculty Literature Scout**.
M8 does not include Faculty identity resolution, autonomous acquisition,
provider-driven research, drafting, workers, resource profiles, watchdog
operation or automatic submission.
