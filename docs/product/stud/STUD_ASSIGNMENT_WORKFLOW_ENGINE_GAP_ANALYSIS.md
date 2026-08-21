# STUD Assignment Workflow Engine — v2.7.0 gap analysis

## Audit identity

- Product authority: `AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf`
- Audited baseline: AegisUi `v2.7.0`, commit `d2a39be9ea26a5431d14da9c61af8c1470704018`
- Canonical STUD database: SQLite/WAL, schema v14
- Audit method: code, schema, IPC, renderer, test and packaging inspection; names
  alone were not treated as implementation evidence.

Classifications:

- **EXISTS / REUSE** — implemented contract can be used without redesign.
- **EXISTS / REFACTOR** — real implementation exists but its ownership or UI must
  move behind the Workflow Engine.
- **PARTIAL** — useful implementation exists but does not satisfy the Master Spec.
- **MISSING** — no implementation contract exists.
- **REPLACE** — current behaviour is intentionally transitional and should not
  become the target implementation.

## Protected v2.7.0 foundations

These are migration inputs, not rewrite candidates:

| Foundation | Actual implementation evidence | Decision |
| --- | --- | --- |
| Canonical academic store | `studAcademicStore.class.js`; schema migrations 1–14; WAL; `userData/stud/academic.sqlite` | EXISTS / REUSE |
| Canonical Course/Assignment IDs | `stud_courses`, `stud_assignments`; provider IDs remain in `stud_external_identifiers` | EXISTS / REUSE |
| Field provenance | `stud_provenance_records`, multiple observations, authority and source types | EXISTS / REUSE |
| Relationships | `stud_relationships`, validated endpoints and bounded relationship types | EXISTS / REUSE, extend types only through migrations |
| Moodle SSO and credentials | official system-browser mobile launch callback; `StudCredentialVault`; macOS `safeStorage` | EXISTS / REUSE |
| Incremental Moodle sync | fixed Moodle adapter, provider sync preferences, managed-file reconciliation | EXISTS / REUSE |
| Managed Moodle files | relative managed references, SHA-256, token URLs remain memory-only | EXISTS / REUSE |
| Academic documents | `stud_academic_documents` plus extraction/page/chunk/reference tables | EXISTS / REUSE |
| PDF/chunk provenance | PDF.js runtime, bounded extraction, page/chunk hashes and `provenance_json` | EXISTS / REUSE |
| Research | OpenAlex/Crossref/DataCite/Unpaywall adapters, canonical papers, explicit save/link | EXISTS / REUSE |
| Citations | Citation.js over canonical paper IDs; verified bundled APA/Harvard/Vancouver styles | EXISTS / REUSE |
| Academic Context Packages | schema v10 concepts, decisions and bounded inspectable package snapshots | EXISTS / REUSE |
| Local Academic AI | package-restricted local Ollama, loopback only, no tools/cloud/automatic save | EXISTS / REUSE |
| Engineering Compute | typed deterministic main-process runtime and explicit canonical result save | EXISTS / REUSE |
| Packaging integrity | `build/prebuild-integrity.js` manifest/digest/HEAD guard and regression test | EXISTS / REUSE |

## Major capability map

| Master Spec capability | Result | Current evidence | Gap / implementation consequence |
| --- | --- | --- | --- |
| Assignment as primary work object | PARTIAL | First-class `ASSIGNMENT`; Assignment Detail and orchestration context aggregate related records | Navigation still capability-led; no persistent Assignment Workspace or run ownership |
| Manual Assignments | EXISTS / REUSE | Typed `stud-entity-create`; model validation and provenance | Intake UI must become first-class and feed a Requirements Contract |
| Provider-created Assignments | EXISTS / REUSE | Moodle normalizes to canonical IDs and external identifiers | Preserve reconciliation and never re-import destructively |
| Course/year/term/module organisation | PARTIAL | Course title/code/dates/status and Course Detail | No explicit academic year/term organisation; module is currently represented by Course |
| Requirements reconstruction | REPLACE | `assignmentRequirements()` applies bounded regular expressions and emits transient observations | Keep as candidate extractor only; add reviewed, revisioned Requirements Contract |
| Requirements Contract | MISSING | No contract/item/decision tables or approval gate | New canonical schema and explicit review lifecycle required |
| Assignment roadmap | REPLACE | Static 13-step renderer list; `workflowAssignmentId` is renderer memory | Replace with persisted milestone instances derived from versioned templates |
| Workflow DAG and dependencies | MISSING | No workflow, milestone or dependency records | New normalized DAG model and validator |
| Honest execution states | PARTIAL | Provider/document/AI/study statuses exist independently | Add shared workflow states including WAITING, BLOCKED and HUMAN_INPUT without flattening domain statuses |
| Blocker objects | MISSING | Conflicts exist; no dependency-scoped blocker entity | Add typed blockers with expected artifact/owner and downstream impact |
| Checkpoints and resume | PARTIAL | Study sessions recover as INTERRUPTED; individual runtimes have cancellation | No assignment-run checkpoint/event cursor or resumable task contract |
| Working-context propagation | PARTIAL | Most surfaces accept `courseId`/`assignmentId`; Command Center passes some values directly | Add one renderer context coordinator; selection remains ephemeral and cannot invoke work automatically |
| Assignment Workspace | PARTIAL | Assignment Detail aggregates context, requirements and roadmap | Refactor into calm workspace shell with contextual surfaces and progressive disclosure |
| Contextual preview | PARTIAL | Managed PDF viewer, resource preview, repository/data/document workspaces | Add typed preview adapter; no generic browser/filesystem access |
| Persistent contextual notes | EXISTS / REFACTOR | Notes have `course_id`, `assignment_id`, structured ProseMirror JSON and relationships | Surface adjacent to active work; preserve explicit save and canonical note storage |
| Artifact Bay | MISSING | Canonical resources/documents/results exist but no unified artifact/run index | Add artifact references to existing canonical objects; do not duplicate payloads |
| Mission Control | MISSING | No run UI or real workflow telemetry | Build only on persisted real events/progress; never animate fabricated activity |
| Topic Dossiers | MISSING | Context Packages/concepts can supply candidates | Add reviewed dossier objects referencing canonical evidence |
| Evidence Map | PARTIAL | Relationships, concepts, Context Packages and temporary requirement rows | Add claims and typed evidence links; preserve contradictions and exact locations |
| Claim → evidence → source → page/chunk | PARTIAL | Document chunks have page and provenance; citations use canonical papers | Missing claim objects and link integrity from draft text to evidence target |
| Research plan | MISSING | Research UI accepts explicit searches and links papers | Add approved questions, source needs, quality gates and stopping criteria |
| Source acquisition | EXISTS / REFACTOR | Fixed research providers and managed PDF import/download | Orchestrate only approved bounded tasks; no crawler or arbitrary endpoint |
| Faculty Gems | MISSING | Paper author strings exist; no lecturer identity resolution | New explicit, ambiguity-aware scout; normal source quality gate still applies |
| Citation workflow | EXISTS / REFACTOR | Citation.js and canonical paper metadata | Connect citations to claims/draft spans and add support-integrity audit |
| Composition plan / word budget | MISSING | Notes and AI responses exist; Assignment may hold description only | Add section plan, purpose, requirement/evidence links and budgets |
| Drafting | PARTIAL | Structured Notes and ephemeral grounded Local AI output | Add explicit versioned draft artifact; AI remains bounded to approved context |
| Humanisation with diff | MISSING | No author profile, transform or draft diff model | Add opt-in versioned transform; never detector evasion or evidence mutation |
| Lecturer Committee | MISSING | Revision Items and progress analytics are not rubric review | Add advisory review rounds/findings tied to rubric; estimates are not grades |
| Corrections loop | PARTIAL | Revision Items exist and can link to sources | Add finding → correction → new draft version trace; preserve prior versions |
| Manual high-resource run | MISSING | Operations run individually; no consented run plan | Add explicit launch summary and run consent envelope |
| Lightweight/heavy model routing | PARTIAL | Local Ollama status/model is capability checked | Add task capability profiles and user-visible routing; model is never schema identity |
| Resource profiles | MISSING | No ECO/BALANCED/MAXIMUM/CUSTOM run controller | Add bounded scheduler policy; no generic process execution |
| Watchdog/stall handling | PARTIAL | AbortControllers/timeouts exist per runtime | Add meaningful-progress heartbeat and task-level wait/retry/skip/pause rules |
| External academic storage | MISSING | Managed files live below `userData/stud`; paths are relative | Add user-selected profile/volume identity; retain local default references |
| Portable mode | MISSING | No dependency manifest/copy workflow | Add explicit bounded package plan, copy verification and return/reconcile operation |
| Final package | PARTIAL | Citation/export and Phase 14 acceptance artifacts prove pieces | Add versioned candidate package, integrity reports and unresolved blocker report |
| Final human approval | PARTIAL | Existing boundaries never submit automatically | Add explicit approval record; continue to expose no university-submission IPC |
| Post-grade learning loop | PARTIAL | Moodle grades/feedback and progress analytics exist | Add immutable comparison against committee findings; no retroactive prediction edits |
| Real EG4020 RESIT acceptance | PARTIAL / PRIVATE | Real dataset exists only in the user's local environment | Keep local and untracked; use synthetic structural twin in public tests |

## Current component inventory

### Database and canonical models

- `studAcademicStore.class.js`: schema v14, entity persistence, provenance,
  relationships, FTS5, documents, context packages, Moodle sync preferences.
- `studAcademicModel.class.js`: typed validation, canonical entity/status enums and
  strict payload bounds.
- Current entities: Course, Assignment, Resource, ResearchPaper, Note,
  RevisionItem, ComputeResult, AcademicDocument, Notebook, Dataset and
  RepositoryReference.
- No workflow, requirement-contract, blocker, checkpoint, run artifact, claim,
  composition, draft-version or committee entities exist.

### Runtime and services

- `StudLmsRuntime`/`MoodleAdapter`: real SSO, encrypted token, bounded read sync.
- `StudDocumentRuntime`: bounded local PDF.js extraction.
- `StudResearchRuntime`: fixed academic provider adapters and managed PDFs.
- `StudAcademicIntelligence`: deterministic local context/concepts/packages.
- `StudAcademicAssistantRuntime`: reviewed-package-only local Ollama.
- `StudComputeRuntime`: typed local deterministic compute.
- No assignment workflow scheduler or resumable worker runtime exists.

### IPC

`studAcademicIpc.class.js` exposes a large but allowlisted `stud-*` surface.
Payload keys are checked and domain services own effects. New workflow IPC must
remain domain-specific; no generic SQL, filesystem, HTTP, model or command proxy
is permitted.

### Renderer and UX

`StudCommandCenter` groups HOME, COURSES, WORK, LIBRARY, STUDY and TOOLS. It has
an Assignment Detail, static roadmap, requirement observations and links to
existing surfaces. Workspace classes remain individually stateful and do not
share a formal active-work context. The target is a contextual Assignment
Workspace, not more peer-level tabs or permanent panels.

### Tests and packaging

Existing focused suites cover academic core, Command Center, Moodle, Research,
documents, intelligence, Local AI, Compute, revision, notebook, progress, tool
catalog, Phase 14 acceptance and v2.7.0 reality behaviour. The broad regression
aggregator and release-health check remain mandatory. Packaging uses
`prebuild-src`; the v2.7.0 integrity guard verifies source HEAD and source/prebuild
digests before packaging.

## Unknowns that must remain explicit

1. The exact provider contract and institutional policy available for Faculty
   Gems beyond already approved academic metadata APIs.
2. Which local Ollama models are installed on a user's machine and which tasks
   they can perform acceptably; capability detection must decide at runtime.
3. The storage-volume identity mechanism that is most reliable across macOS
   reconnects; implement and test before promising transparent remount recovery.
4. Exact output formats required by each Assignment; they belong in the reviewed
   Requirements Contract, not global assumptions.
5. Private EG4020 RESIT content and unresolved team/project inputs; these remain
   local and must never be added to fixtures, screenshots or releases.
