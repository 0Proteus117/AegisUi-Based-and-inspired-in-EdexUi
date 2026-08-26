# STUD Assignment Workflow Engine — target architecture

## Authority and invariants

This document translates the Master Specification into implementation contracts
for the audited v2.7.0 codebase. It does not authorize broad implementation by
itself. Each change must follow the independently completable milestones in the
roadmap.

Non-negotiable invariants:

1. `Assignment` remains a stable canonical STUD object, independent of Moodle.
2. Existing v2.7.0 IDs, managed files, provider observations and provenance are
   migrated in place; no destructive re-import is required.
3. Moodle SSO, encrypted credential storage, incremental sync and fixed provider
   boundaries remain unchanged unless a milestone explicitly demonstrates a bug.
4. An observation, preview, model response or handoff remains ephemeral until an
   explicit canonical save.
5. A workflow may automate only an explicitly approved bounded plan. It may not
   submit work, invent missing inputs, select arbitrary endpoints, execute a shell
   or access arbitrary files.
6. Progress and telemetry are emitted by real operations. Absence of meaningful
   progress becomes `POSSIBLE_STALL`, never cinematic activity.
7. The final university submission is always outside the Workflow Engine and is
   performed by the student.

## Architecture layers

```text
STUD Assignment Workspace (renderer)
  |-- Working Context (one validated, meaningful local work reference)
  |-- Preview adapters / Notes / Evidence / Research / Citations
  |-- Mission Control (real events only)
  v
Typed stud-workflow-* IPC
  v
StudAssignmentWorkflowService (main-process domain service)
  |-- RequirementsContractService
  |-- WorkflowTemplateRegistry + DAG validator
  |-- WorkflowRunCoordinator + checkpoint store
  |-- ArtifactIndexService
  |-- Research/Evidence/Composition/Review coordinators
  |-- ResourcePolicy + ModelCapabilityRouter + Watchdog
  v
Existing protected services
  |-- StudAcademicStore / provenance / relationships / FTS5
  |-- StudLmsRuntime / MoodleAdapter / CredentialVault
  |-- StudDocumentRuntime / managed files / PDF.js
  |-- StudResearchRuntime / Citation.js
  |-- StudAcademicIntelligence / Context Packages
  |-- StudAcademicAssistantRuntime / local Ollama
  |-- StudComputeRuntime
```

The workflow service orchestrates domain operations; it does not absorb or
duplicate their stores. Provider and local-model services keep their current
fixed security boundaries.

### Implemented Electron trust boundary

The pre-M2 hardening intervention is complete. The primary renderer now runs
with `nodeIntegration: false` and `contextIsolation: true` through the typed
`window.aegis` preload contract. Renderer code has no direct Node, raw Electron,
raw IPC, generic filesystem, generic shell or generic network authority. Main
process sender and domain validation remain authoritative. `@electron/remote` is
removed. The primary preload is not yet sandboxed; this residual and the full
migration inventory are recorded in
[`ELECTRON_TRUST_BOUNDARY_HARDENING_2026-08-24.md`](../../security/ELECTRON_TRUST_BOUNDARY_HARDENING_2026-08-24.md).

## Core decisions

### Assignment ownership and organisation

- `Course` continues to represent a module/course. M2 provides optional,
  provenance-aware `academicYear`, `academicTerm` and `academicLevel` fields in
  schema v16; existing rows remain valid with `NULL` values and appear honestly
  under `UNCLASSIFIED` / `TERM UNKNOWN`.
- `Assignment` remains the primary work object and retains its stable ID whether
  created manually or reconciled from Moodle.
- Provider IDs continue in `stud_external_identifiers`; no provider ID becomes a
  primary key.
- One Assignment may have many workflow runs. A run references the Assignment and
  a versioned Requirements Contract; it never owns a duplicate Assignment record.

### Implemented M2 academic organisation and Working Context

M2 adds a bounded organisation/presentation layer without rewriting canonical
Course or Assignment identity:

- Courses group by explicitly stored academic year then term. No module-code or
  title heuristic invents a year or term.
- Assessment presentation classification is separate from `stud_assignments`.
  A small deterministic title/description readout may produce a classification;
  `UNKNOWN` is the fallback. Student corrections persist in
  `stud_assignment_classifications` and carry `USER_OVERRIDE` provenance.
- `stud_working_context` stores only one meaningful last-work reference: Course,
  optional Assignment, optional related current object, applicable Requirements
  Contract and visible origin/pin. It is not click history, a hidden task queue
  or a second academic database.
- `StudWorkingContextService` validates canonical IDs and relationship scope in
  main process. The renderer `StudWorkingContext` coordinator can only request
  typed read/update/clear operations. Context changes prefill compatible
  surfaces; they never query Moodle/providers, call Ollama, create notes or
  persist relationships.
- A missing/archived referenced object clears the stale context rather than
  rebinding it. A user can always change or clear context from the compact
  visible strip.

### Requirements Contract

The current regex readout becomes bounded candidate generation, never truth.
Requirements Contracts live behind a dedicated repository/service over the one
canonical STUD SQLite connection; lifecycle logic must not enlarge
`StudAcademicStore` into a broader domain god class.

Contract state has three independent dimensions:

- lifecycle: `DRAFT`, `APPROVED`, `SUPERSEDED` (and `ARCHIVED` only if a later
  milestone demonstrates a real requirement);
- completeness: `COMPLETE`, `INCOMPLETE`, `CONFLICTING`;
- freshness/review condition: `CURRENT`, `SOURCE_CHANGED`, `SOURCE_MISSING`,
  `OCR_BLOCKED`, `NEEDS_REVIEW`.

Approval therefore does not imply completeness or source freshness. Valid states
include `APPROVED + INCOMPLETE + CURRENT` and
`APPROVED + COMPLETE + SOURCE_CHANGED`.

Canonical M1 records are:

- `stud_requirement_contracts`: Assignment, monotonically increasing revision,
  immutable approved semantic state, completeness, approval identity/time,
  optimistic row version and deterministic canonical hash;
- `stud_assignment_requirement_contracts`: an explicit transactional pointer from
  the Assignment to the currently applicable approved revision (never inferred
  by sorting timestamps);
- `stud_requirement_candidates`: generated review candidates and persistent
  disposition (`PENDING`, `INCLUDED`, `EXCLUDED`, `UNRESOLVED`);
- `stud_requirement_candidate_runs`: bounded extraction coverage including linked,
  indexable, inspected and OCR-blocked documents, chunks inspected, truncation and
  candidate count;
- `stud_requirement_items`: discipline-neutral typed requirements, original and
  normalized values, units, resolution, note and order;
- `stud_requirement_sources`: exact canonical evidence references and approval-
  time snapshot hashes;
- `stud_requirement_contract_freshness`: mutable review condition derived without
  changing the approved semantic revision.

Document sources identify the AcademicDocument, extraction, chunk, page range and
content hash wherever available. Assignment/Moodle sources identify the canonical
entity/field and existing provenance observation or stable external identifier.
Human-readable labels are presentation metadata only. The output text of
`assignmentRequirements()` is never provenance authority.

Candidate extraction records what was and was not inspected. `UNKNOWN` means that
no supported pattern was found in bounded inspected evidence; it is not
institutional confirmation that no requirement exists. OCR-required and truncated
sources remain visible. Exclusion is retained as review history rather than being
regenerated as an unseen candidate.

Approved revisions are semantically immutable. Editing an approved contract first
creates a new `DRAFT` revision. Approval computes a deterministic canonical hash,
supersedes the prior current revision and updates the Assignment pointer in one
transaction. Normal approval requires resolved completeness; an explicit
`APPROVE AS INCOMPLETE` decision records unresolved information honestly. Every
mutation supplies an expected row version; stale writes fail with
`STALE_CONTRACT_VERSION` instead of overwriting newer state.

Freshness checks compare stored source snapshots with current canonical evidence.
Drift changes only the independent freshness record: historical approved content
and its hash remain unchanged. The user may then create, review and approve a new
revision. A new revision retains explicit user-entered requirements and regenerates
source-derived candidates from current bounded evidence; it does not copy stale
source-derived approval as if still reviewed. Future workflow executions will
reference the exact approved contract revision and hash used.

### Persistent workflow and DAG

M3 implements versioned application templates separately from canonical local
instances. The normalized schema is:

- `stud_workflow_templates` and `stud_workflow_template_versions`;
- `stud_workflow_template_nodes` and `stud_workflow_template_edges`;
- `stud_workflow_instances`, linked to one Assignment and an exact approved
  Requirements Contract ID/revision/hash or an explicit no-Contract reason;
- `stud_workflow_nodes` and `stud_workflow_edges`;
- `stud_workflow_events`, a bounded meaningful event journal.

`StudWorkflowTemplateRegistry`, `StudWorkflowRepository` and
`StudWorkflowService` own the domain boundary over the existing SQLite
connection. Five version-1 starting templates are registered: standard written,
technical/engineering, exam preparation, group/project and generic/manual. A
published version's canonical JSON and SHA-256 fingerprint cannot change under
the same version number.

M3 persists only `NOT_STARTED`, `IN_PROGRESS`, `COMPLETE` and `SKIPPED`.
`READY` is derived from predecessor terminal state and is never persisted as
user truth. Branching and convergence are supported. Main-process validation
rejects self, duplicate, missing, cross-workflow and cyclic edges. Existing
instances never change when a template or Requirements Contract changes.
Explicit replacement preserves the prior instance as `HISTORICAL`; it does not
copy activity or reset history silently.

M4 adds derived `DIRECT_BLOCKER`, `HUMAN_INPUT_REQUIRED` and `DEPENDENCY_WAIT`
availability without changing the four persisted M3 work states. Runtime worker
state and autonomous recovery remain reserved for M13. Human/external semantic
node types do not themselves fabricate a blocker or checkpoint.

### Blockers, checkpoints and recovery

- `stud_workflow_blockers`: taxonomy, affected node, expected input/artifact,
  responsible party when explicitly supplied, exact optional Contract/
  provenance references, lifecycle and resolution history. Downstream impact is
  derived from the DAG rather than copied into descendant rows.
- `stud_workflow_checkpoints`: explicit student review gate with instructions,
  required decision, exact optional source references, decision history and
  controlled follow-up chain. It is not a runtime worker cursor.
- `stud_workflow_events`: append-only meaningful events, bounded payload and
  sequence. It is an audit feed, not developer logs or every click.

M4 implements blocker propagation, meaningful journal events, human checkpoints
and dependency semantics in schema v18. Restart recovery means restoring those
canonical facts and deterministically recomputing availability. Runtime worker
recovery, heartbeat, cursor snapshots and resumable execution payloads belong
with M13 and are not represented by M4's human checkpoints.

Once M13 exists, any interrupted `RUNNING` task becomes `INTERRUPTED` until its
coordinator proves it can resume from a valid checkpoint. Completed expensive
work is not replayed. Checkpoint payloads never contain credentials, temporary
URLs or raw provider responses.

### Working context and Assignment Workspace

`StudWorkingContext` persists one meaningful, validated Course/Assignment/object
selection through the canonical SQLite store. It deliberately excludes hover,
modal and provider-operation state. Opening a compatible surface pre-fills
context but performs no provider, model or save operation. Context changes are
visible, correctable and validated against canonical object relationships.

M5 implements the first two layers of the Assignment Workspace:

1. a calm header, compact workflow-stage rail, Requirements Contract state and
   explicit blocker/checkpoint attention;
2. a primary bounded local Preview alongside a contextual structured Note editor;
3. related canonical materials grouped as brief/marking, course material,
   research, notes, data, repository/code or other; and
4. explicit prefill-only handoffs to existing Research, Knowledge, Citation,
   Documents, Revision, Compute and Notebook/Data surfaces.

No M5 selection starts a Workflow node, provider request, model request, external
browser request or persistence mutation. A contextual Note is persisted only by
the existing explicit save action. An unavailable adapter says `PREVIEW NOT
AVAILABLE`; it never exposes a source path or arbitrary embedded browser.

Preview uses a typed adapter registry:

- PDF/AcademicDocument: bounded existing document context and the managed PDF.js
  reader; a chunk can create a Note with exact existing provenance;
- Research Paper: existing canonical metadata/provenance and local-PDF reader
  when one is managed;
- Note: existing sanitized browser structured-document editor;
- Dataset/Notebook: existing bounded managed-data/cell reads;
- Resource, Compute, Revision and Repository Reference: normalized local detail
  or an honest unavailable state, with an explicit handoff to the owning surface.

M5 does not embed arbitrary web content. Existing public GitHub metadata remains
an explicit Workbench operation; it is never queried by the Workspace.

### Artifact Bay

Schema v19 implements Artifact Bay and the Mission Control observational
foundation in the existing canonical SQLite database:

- `stud_assignment_artifacts` is an Assignment-scoped index over an existing
  canonical entity. It stores identity, type, origin, Workflow/Node placement,
  availability and bounded metadata, but never copies source text, PDFs, Notes,
  datasets or provider payloads.
- `stud_artifact_relationships` records explicit Artifact-to-Artifact relations.
  Derivation, supersession and export lineage are cycle checked and cannot cross
  Assignments.
- `stud_operation_runs` records an explicitly initiated bounded operation and
  its truthful lifecycle/progress contract.
- `stud_operation_events` plus `stud_operation_event_artifacts` form a structured,
  bounded operational journal. This is not a renderer-controlled log sink.

M3 `stud_workflow_events` remains authoritative for DAG/history changes and M4
blocker/checkpoint tables remain authoritative for conditions. M6 may reference
an exact M3 event and composes current M3/M4 state for display; it does not copy
or rewrite either source of truth. Artifact-to-Run association is represented by
an exact operational Event link, not by shared labels or merely sharing a stage.

Progress is `NONE`, `INDETERMINATE` or `DETERMINATE`. Determinate progress requires
a real non-zero total and a bounded current count no greater than that total.
Mission Control derives elapsed time from persisted timestamps and supplies no
ETA, simulated telemetry or animation. Full operational controls, workers,
heartbeats, resource profiles and watchdog remain M13 responsibilities.

### Research, Topic Dossiers and Faculty Gems

- A Research Plan records reviewed questions, source needs, evidence functions,
  quality requirements, approved provider capabilities and stopping criteria.
- Acquisition delegates to existing fixed research providers or explicit local
  import. No crawler, arbitrary web client or hidden provider chain is introduced.
- Topic Dossiers group selected canonical sources/chunks, methods, agreements,
  disagreements, gaps and student decisions. They remain inspectable.
- Faculty Gems resolve public academic identity only with affiliation and
  ambiguity evidence. States are `CONFIRMED`, `PROBABLE`, `AMBIGUOUS` or
  `UNRESOLVED`. A lecturer name alone never proves identity, and a publication
  still passes the ordinary source-quality gate.

### Evidence and citation integrity

Add canonical `stud_claims` and `stud_claim_evidence_links`. A link identifies:

- claim and optional draft span/version;
- evidence role (`SUPPORTS`, `CONTRADICTS`, `CONTEXT`, `LIMITATION`);
- canonical source entity;
- exact document extraction/chunk/page or data/result reference;
- source and decision provenance.

Citation formatting remains Citation.js. Citation integrity is separate: a
well-formatted bibliography entry does not prove claim support. Audits report
unsupported claims, missing source locations, contradictory evidence and
metadata conflicts without inventing corrections.

### Composition, drafting and Humanisation

- Composition Plans contain versioned sections, purpose, requirement/learning-
  outcome links, planned claims/evidence and word budgets.
- Drafts are versioned canonical workflow artifacts with parent version and
  immutable source/context snapshot IDs. They are not silently overwritten.
- Local AI may draft only from an approved Context Package/source plan and keeps
  the existing no-tools/no-cloud/no-automatic-save boundary.
- Humanisation is an opt-in draft transformation with author/genre profile,
  parent/child versions and visible diff. It must not alter citation targets,
  evidence meaning or numerical results and must never claim detector evasion.

### Lecturer Committee and corrections

Review rounds reference a rubric/Requirements Contract, exact draft version,
model/runtime profile and panel-role findings. Findings contain severity,
criterion, evidence, suggested correction and uncertainty. Estimated ranges are
advisory and never institutional predictions.

Corrections create a new draft version and trace each accepted/rejected finding.
Real lecturer grade/feedback may later be imported as new observations and
compared with historical findings without rewriting them.

### Execution, models, resource profiles and watchdog

The run launch screen shows contract version, planned tasks, provider/network
use, model capability, storage, blockers and resource profile. Launch is a single
explicit consent envelope for those named bounded operations; expanding the plan
requires another decision.

`ModelCapabilityRouter` discovers loopback local models and maps declared task
needs to capability tiers. Model name/size is execution metadata, never canonical
schema identity. An unavailable adequate model yields `LIMITED_CAPABILITY` or a
blocker; no cloud fallback.

Resource profiles (`ECO`, `BALANCED`, `MAXIMUM`, `CUSTOM`) constrain approved
worker concurrency, memory intent and network concurrency. They do not expose
arbitrary process control. The watchdog consumes real task heartbeats and output
progress. `GIVE MAC BACK` checkpoints and pauses/reduces workers safely.

### External academic storage and portable mode

Separate Storage Profile Core from Portable Mode. The core must be available
before the first milestone that genuinely depends on large local academic model
or external model/artifact storage. Portable Mode remains a later explicit copy
and reconciliation workflow.

Introduce a narrow main-process `StudStorageProfileService`:

- local default profile maps to current `userData/stud` managed references;
- optional external profile stores volume identity plus managed relative roots;
- renderer receives profile/availability/capacity metadata, never arbitrary file
  access;
- existing managed references remain valid and are not moved automatically;
- explicit migration copies, hashes, verifies, switches references transactionally
  and retains rollback metadata.

Portable mode calculates a dependency manifest, displays required size, copies
only approved artifacts/models to the local profile, verifies hashes and records
the temporary mapping. Returning artifacts is another explicit verified action.

### Final package and human approval

The final package references a specific draft, bibliography, appendices,
requirement/rubric coverage, citation audit, committee report, unresolved blockers
and run audit. Generation does not imply approval. The student explicitly marks a
package `APPROVED_FOR_MANUAL_SUBMISSION` after review.

There will be no `submit`, `upload-to-university` or Moodle-write IPC in this
programme. Aegis may reveal/export a package; submission remains outside Aegis.

## Migration strategy

1. Start from schema v14 and add one transactional migration per milestone that
   needs persistence. Never rewrite migrations 1–14.
2. New fields are nullable or have truth-preserving defaults. Existing Courses,
   Assignments, provider IDs, managed references and provenance remain unchanged.
3. Backfill creates no inferred Requirements Contract, workflow completion or
   approval. Existing Assignments initially show `CONTRACT NOT CREATED`.
4. Existing v2.7.0 static roadmap data is not migrated because it is renderer
   presentation, not canonical state.
5. Existing managed Moodle files remain in the local default storage profile.
   External storage adoption is opt-in and verified.
6. Every schema migration must test fresh startup, v14 upgrade, representative
   older-schema upgrade and rollback-on-failure while protecting private data.
7. Public fixtures are synthetic. The private EG4020 RESIT case is exercised only
   through a local acceptance harness that emits sanitized counts/statuses.

## IPC and security policy

New channels are narrowly named (`stud-workflow-*`, `stud-requirements-*`, etc.),
allowlist payload keys, validate sender and IDs, and return normalized bounded
objects. No channel accepts SQL, executable, shell command, arbitrary path, URL,
HTTP method/header, model endpoint, secret or raw provider response.

M1 remains compatible with the legacy BrowserWindow configuration but all of its
renderer calls are preload-ready and main-process authoritative. A dedicated
incremental Electron Trust-Boundary Hardening intervention follows M1 before M2.
Its target is `nodeIntegration: false`, `contextIsolation: true`, typed preload
APIs, removal of renderer direct Node dependencies and removal/reduction of
`@electron/remote`. That migration is deliberately not folded into the M1 domain
change.

Automatic scheduling is local workflow scheduling, not authorization expansion.
Tasks can call only adapters named in the approved run plan. Moodle remains
read-only, Reference/Link-only policies remain fail-closed, and no task can mutate
Calendar, Email or university systems.

## Private acceptance case

EG4020 RESIT remains a private/local acceptance case. The engine must represent
missing team geometry/calculation inputs as blockers attached only to dependent
milestones while Research, Requirements and other independent DAG branches may
continue. No brief, name, grade, source file, local path or screenshot from this
case enters Git, release assets or public logs.
