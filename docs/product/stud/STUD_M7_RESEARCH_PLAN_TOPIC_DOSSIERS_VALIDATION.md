# STUD M7 — Research Plan and Topic Dossiers

## Scope and result

M7 turns one exact reviewed M1 Requirements Contract revision into a persistent,
reviewable Assignment Research Plan. The plan contains Topics and optional
Research Questions. Each Topic composes a bounded Dossier of references to
existing canonical STUD objects or M6 Artifacts, explicit Research Gaps and an
explainable coverage state.

M7 does not acquire literature, invoke providers or models, generate Claims,
draft academic work, create Mission Control Runs or submit to Moodle. Opening a
Research Plan or changing Topic performs bounded local reads only.

## Schema v20

Migration 20 is one transactional extension of the existing canonical SQLite
database. It adds:

- `stud_research_plans` and `stud_assignment_research_plans` for immutable
  reviewed revisions and the explicit current reviewed-plan pointer;
- `stud_research_topics` and `stud_research_topic_requirements`;
- `stud_research_questions` and `stud_research_question_requirements`;
- `stud_topic_dossier_items` for canonical/M6 Artifact membership references;
- `stud_research_gaps` for research-preparation gaps and optional exact M4
  Blocker references;
- `active_research_plan_id` and `active_research_topic_id` on the existing M2
  Working Context.

Indexes cover Assignment/Plan revision, Plan/Topic order, Requirement reverse
lookup, Topic Dossier filters/time and Gap state/time. Migration tests prove both
fresh schema creation and v19→v20 preservation. Existing Assignments receive no
Research Plan, Topic, Question, Dossier membership, Gap, review state or coverage.
A deliberately failed v20 migration rolls back and does not mark v20 applied.

## Research Plan lifecycle and Requirements Contract authority

A Plan records Assignment, optional Course/Workflow, exact Contract ID, revision
and hash, lifecycle, revision/parent, origin, notes, timestamps and optimistic
row version. Lifecycle is `DRAFT`, `REVIEWED` or `SUPERSEDED`.

The service accepts only an exact approved M1 Contract. Deterministic proposal
seeding reads only research-relevant Requirement Items from that revision; it
does not imply institutional authority. Every proposal remains `PROPOSED` until
the user includes, rejects or marks it unresolved. A reviewed Plan requires all
proposals to have an explicit disposition and at least one retained Topic.

Review stores a canonical SHA-256 fingerprint and updates the Assignment's
reviewed-plan pointer transactionally. Reviewed semantic structure cannot be
edited in place; a later edit clones Topic/Question structure into a new Draft
revision. Contract pointer/hash/freshness drift is reported as `HISTORICAL`,
`SOURCE_CHANGED`, `SOURCE_MISSING` or the M1 freshness condition without mutating
the historical Plan.

## Topics and Research Questions

Topics retain title, scope, rationale, priority, order, origin, basis,
disposition, optional parent, optional Workflow Node, user notes and exact
Requirement links. `REQUIRED_BY_ASSIGNMENT` is rejected without at least one
exact Requirement Item. Parent/child depth is bounded and cycles are rejected.

Questions are optional and remain discipline-neutral: they can represent an
issue, doctrine, design question, analytical question or theme. They retain
text, rationale, priority, state, origin, order, optional parent and exact
Requirement links. Topic and Question origin cannot be rewritten by renderer
edits.

## Topic Dossiers, provenance and material states

A Dossier row stores references only. It does not copy document text, paper
metadata, Note content, datasets, files or Artifact contents. Canonical targets
must already fall within M2's validated Course/Assignment relationship scope;
M6 Artifacts must belong to the same Assignment. Unique Topic/target indexes
prevent duplicate membership. No title-similarity relationship is used.

Membership origin (`USER_ADDED`, `RESEARCH_ACQUIRED`, `COURSE_MATERIAL`,
`ASSIGNMENT_MATERIAL`, `SYSTEM_SUGGESTED`, `IMPORTED`, `UNKNOWN`), disposition
(`SUGGESTED`, `ACCEPTED`, `REJECTED`), review state (`UNREVIEWED`,
`PARTIALLY_REVIEWED`, `REVIEWED`, `NOT_RELEVANT`), suitability and stance are
independent. Indexing never manufactures intellectual review. Renderer-created
membership is fixed to `USER_ADDED` by the main-process handler. Archived or
missing canonical material remains historically referenced and is returned as
`MISSING`; the UI disables preview and says that local material is unavailable.

Supported suitability labels are peer-reviewed, institutional,
standard/regulation, textbook, Course material, manufacturer/technical,
government, news, general web and unknown. They are recorded assessments, not
automatic verification. Stance is `NOT_ASSESSED`, `AGREES`, `CONFLICTS`,
`ALTERNATIVE` or `UNCERTAIN`; STUD does not choose a winner.

## Research Gaps and explainable coverage

Gaps cover missing sources/data/results/standards, unanswered questions,
insufficient primary evidence, contradictions, inaccessible/OCR sources, human
clarification, team/laboratory dependency and custom needs. Resolution preserves
history. An optional Blocker link points to M4; it does not duplicate M4 state.

Coverage is research-preparation status, not correctness. It derives inspectable
reasons and counts for linked Requirements, accepted/reviewed material,
unresolved Questions, contradictions/alternatives and open Gaps. A linked M4 Gap
is `BLOCKED` only while its authoritative Blocker is open. No weighted score,
completion percentage or source-count quality claim exists.

## Assignment Workspace and Working Context

M5 adds one contextual `RESEARCH PLAN` action without adding a permanent top-level
STUD tab. The three-region surface provides Topic navigation, the selected Topic
Dossier and Questions/Gaps/Coverage. Controls use progressive disclosure. M5
preview adapters remain canonical: opening supported material records the M2
Plan/Topic/object context and returns to the existing source preview rather than
creating another preview engine.

M2 Working Context remains the sole context authority. Plan and Topic selection
survive restart while references remain valid and degrade safely when they do
not. Changing Topic never starts a provider, model, FTS scan or Run.

## Bounds and scale

Plan state is Assignment scoped; Topics are capped at 100, Questions and Gaps at
200, and Dossier pages at 100 with filters and a time cursor. Normal Assignment
load does not globally scan Papers/Documents or hydrate unrelated Dossiers.

The synthetic scale fixture contains 100 Courses, 1,000 Assignments, 300 Plans,
2,000 Topics, 5,000 Questions, 10,000 Dossier memberships and 5,000 Gaps. On the
validation host, fixture construction was 2.66 s; Assignment Plan state 5.65 ms;
100-item Dossier page 0.83 ms; filtered Dossier 0.36 ms; coverage 0.42 ms;
Working Context handoff 2.78 ms; restart/hydration 0.53 ms. These are host-specific
validation observations, not performance promises.

## Discipline neutrality

The same model was exercised with Engineering, Humanities, Law/Criminology,
Social Science, group-project and generic/manual Assignment fixtures. No Moodle,
module code, DOI, dataset, laboratory or numerical-compute assumption is required.

## Security and privacy

The hardened Electron boundary remains `nodeIntegration: false` and
`contextIsolation: true`. Fixed preload channels expose domain operations only.
Main process validates trusted sender, IDs, Assignment/Plan/Topic ownership,
Contract/Requirement relationship, canonical scope, transitions, optimistic
versions and bounds. There is no raw `ipcRenderer`, SQL, filesystem, shell,
generic network/provider or model execution channel.

Visual fixtures are synthetic. No Moodle/UEL content, user identity, private
Assignment, local path, credential, signed URL or model conversation is read or
captured.

## Technical audit

One M1–M7 audit was performed after implementation.

- **MAJOR — fixed:** M7 renderer payloads could originally claim a privileged
  Topic, Question or Dossier origin. Main handlers now force user-origin values.
- **MAJOR — fixed:** a Topic could be labelled `REQUIRED_BY_ASSIGNMENT` without
  an exact Requirement Item. Creation/update now fail closed.
- **MAJOR — fixed:** a Plan containing only rejected Topics could be reviewed.
  Review now requires at least one included or unresolved Topic.
- **MAJOR — fixed:** any linked M4 Blocker, including a resolved one, initially
  produced `BLOCKED` coverage. Only authoritative `OPEN` state now blocks.
- **MAJOR — fixed:** Dossier source opening initially stayed on the M7 surface
  instead of using the established M5 preview. Handoff now changes to the M5
  source preview with Plan/Topic context preserved.
- **MINOR — fixed:** author CSS caused closed `<details>` forms to participate in
  layout. Closed content is now explicitly hidden and compact validation passes.
- **MINOR — fixed:** stale canonical Dossier references exposed raw identifiers.
  Service/UI now report `MISSING`/unavailable while preserving history.
- **INFORMATIONAL:** reviewed Plan hash covers immutable Topic/Question semantic
  structure. Dossier assessment and Gap state evolve separately by design.
- **INFORMATIONAL:** M7 does not auto-generate research questions, run acquisition
  or infer source quality. These are explicit limitations, not hidden fallbacks.

No remaining BLOCKING or MAJOR finding was identified.

## Validation

Focused M7 validation currently comprises 34 domain/migration tests, seven typed
IPC/security tests, eight renderer/UI contract tests and one scale suite. M1–M6
focused suites also pass after schema-v20 migration compatibility updates.
Real Electron visual validation used synthetic fixtures in Dark, Light,
System→Dark and System→Light at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x.
The matrix covered no Plan, Draft/reviewed Plans, empty/populated/large Dossiers,
multiple Topics, Questions, Gaps, contradiction/alternative, M4 blocker, OCR,
long labels, manual and discipline-neutral Assignments. Automated checks found
no horizontal overflow or escaped controls after the closed-details fix.

Broad regression, release-health, security/static checks and packaged validation
results are recorded in the milestone completion report and final implementation
commit evidence.

## Known limitations and M8 boundary

M7 provides planning and inspectable research preparation. It does not implement
Claim records, a full Evidence Map, citation-support integrity, Faculty Gems,
literature acquisition, web research, automatic drafting, model routing, workers,
watchdog/recovery, overnight execution or academic submission.

The next product milestone is M8 — Claims, Evidence Map and Citation Integrity.
