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

The current regex readout becomes a candidate extractor, not truth. Proposed
canonical records:

- `stud_requirement_contracts`: assignment, revision, lifecycle
  (`DRAFT`, `NEEDS_REVIEW`, `APPROVED`, `SUPERSEDED`), approval identity/time and
  source snapshot metadata.
- `stud_requirement_items`: typed requirement (`DELIVERABLE`, `DEADLINE`,
  `WORD_COUNT`, `LEARNING_OUTCOME`, `RUBRIC`, `EVIDENCE`, `FORMAT`, `INTEGRITY`,
  `DEPENDENCY`, `CUSTOM`), normalized value, review state and criticality.
- `stud_requirement_sources`: exact source entity plus document/page/chunk or
  provider observation reference.

Candidate extraction never edits an approved contract. Changing requirements
creates a new revision and preserves the previous contract and its run history.
An expensive run cannot launch without explicit contract approval or an explicit
`INCOMPLETE_CONTRACT_ACCEPTED` decision recorded by the student.

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

On restart, any `RUNNING` task becomes `INTERRUPTED` until its coordinator proves
it can resume from a checkpoint. Completed expensive work is not replayed.
Checkpoint payloads never contain credentials, temporary URLs or raw provider
responses.

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
