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
  |-- Working Context (ephemeral selection, explicit navigation)
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

## Core decisions

### Assignment ownership and organisation

- `Course` continues to represent a module/course. Add optional, provenance-aware
  `academicYear`, `term` and `level` fields only through a migration; existing rows
  remain valid with `NULL` values.
- `Assignment` remains the primary work object and retains its stable ID whether
  created manually or reconciled from Moodle.
- Provider IDs continue in `stud_external_identifiers`; no provider ID becomes a
  primary key.
- One Assignment may have many workflow runs. A run references the Assignment and
  a versioned Requirements Contract; it never owns a duplicate Assignment record.

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

Workflow templates are versioned application metadata. Instances are canonical
local records:

- `stud_assignment_workflows`: assignment, template version, contract ID and
  overall state.
- `stud_workflow_milestones`: M0–M14 instance, state, attempt, timestamps and
  output contract.
- `stud_workflow_dependencies`: normalized directed edges plus dependency policy.
- `stud_workflow_tasks`: bounded executable units owned by one milestone.

The DAG validator rejects cycles, missing nodes, incompatible output contracts
and unsafe skip policies before a run exists. Renderer code never computes the
authoritative next task.

Shared workflow states:

- `READY`, `RUNNING`, `COMPLETE`, `PARTIAL`, `WAITING`, `BLOCKED`,
  `HUMAN_INPUT`, `NEEDS_REVIEW`, `PAUSED`, `FAILED`, `CANCELLED`.

Domain-specific provider/document/model states remain intact and are mapped to a
workflow state with the original code retained in details. `BLOCKED` means a
required dependency prevents progress. `WAITING` means a known external event or
resource is expected. `HUMAN_INPUT` means the next transition requires an
explicit student decision or artifact.

### Blockers, checkpoints and recovery

- `stud_workflow_blockers`: taxonomy, affected node, expected input/artifact,
  responsible party when explicitly supplied, downstream impact, state and
  resolution provenance.
- `stud_workflow_checkpoints`: immutable bounded state snapshot, completed task
  cursor, artifact references, runtime/model profile, source/context package IDs
  and integrity hash.
- `stud_workflow_events`: append-only meaningful events, bounded payload and
  sequence. It is an audit feed, not developer logs or every click.

M4 introduces blocker propagation, the workflow-state journal, human checkpoints
and dependency semantics. It defines durable checkpoint/event contracts but does
not speculate about process-worker crash payloads before an execution coordinator
exists. Runtime worker recovery, heartbeat and resumable execution payloads belong
with M13.

Once M13 exists, any interrupted `RUNNING` task becomes `INTERRUPTED` until its
coordinator proves it can resume from a valid checkpoint. Completed expensive
work is not replayed. Checkpoint payloads never contain credentials, temporary
URLs or raw provider responses.

### Working context and Assignment Workspace

`StudWorkingContext` is a renderer coordinator containing selected Course,
Assignment, canonical object and originating surface. It is ephemeral by default;
opening a surface pre-fills context but performs no query or save. Context changes
are visible and correctable.

The Assignment Workspace progressively discloses:

1. calm summary, deadline, contract status, blockers and next valid action;
2. contextual Preview and persistent Notes;
3. Research, Evidence, Citations, Composition and Review surfaces;
4. Mission Control only while a real run or inspectable historical run is open.

Preview uses a typed adapter registry:

- PDF/AcademicDocument: reuse managed PDF.js reader;
- Note/draft: sanitized ProseMirror document;
- dataset/compute/repository/media: reuse normalized existing detail surfaces;
- web source: fixed approved external-open behaviour, never a generic embedded
  authenticated browser or renderer-controlled URL fetch.

### Artifact Bay

`stud_workflow_artifacts` is an index, not a payload database. Each record points
to an existing canonical entity, managed relative asset or versioned workflow
document and records role, milestone, provenance, integrity and availability.
The same PDF, Note or ResearchPaper is not copied merely to appear in Artifact
Bay. Disconnected external storage yields `OFFLINE`, not deletion or duplication.
M6 also defines the bounded event-feed contract and a minimal Mission Control
shell for real historical/current events. Full operational controls, workers,
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
