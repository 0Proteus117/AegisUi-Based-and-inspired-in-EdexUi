# STUD M10 — Composition Plan and Draft Versions validation

## Milestone boundary

M10 implements one explicit, Assignment-scoped path:

1. start from an exact reviewed M1 Requirements Contract;
2. create a Draft Composition Plan;
3. review Section purpose, hierarchy, length allocation and explicit
   Requirement/Claim/Evidence placement;
4. review the Plan into an immutable fingerprinted revision;
5. explicitly create a Draft Document;
6. write one Section at a time and explicitly save immutable Draft Versions;
7. inspect any historical version or a bounded line diff.

It does not implement Humanisation, Lecturer Committee, autonomous drafting,
workers, model routing, submission or M11. Planning and writing actions do not
create fake M6 Runs or Mission Control events.

## Schema v23

Migration v23 is one transactional extension after v22. It creates:

- `stud_composition_plans` and `stud_assignment_composition_plans`: revision
  lineage, exact Contract/Research Plan/Workflow references, independent
  authoritative and user-planned totals, explicit current reviewed/Draft
  pointers, deterministic reviewed hash and optimistic row version;
- `stud_composition_sections`: bounded hierarchy, purpose, order, length,
  origin/reason and Draft-only mutation;
- `stud_composition_requirement_coverage`: exact Requirement Item/hash,
  Section assignment or reasoned exclusion;
- `stud_composition_section_claims` and
  `stud_composition_section_evidence`: reference-only M8 placement;
- `stud_draft_documents`, `stud_draft_versions` and
  `stud_draft_section_versions`: exact Plan/Contract snapshot identity,
  immutable version lineage, complete Section snapshots and hashes;
- four nullable Working Context references for Plan, Section, Draft and exact
  Draft Version.

Existing Assignments receive no Plan, Section, Draft, content, reviewed state,
length or progress during migration. Fresh database, v22→v23 and forced-failure
rollback are covered by focused tests.

## Composition Plan and versioning

A Plan can be created only from an exact reviewed Contract. The existing
deterministic Requirements extractor remains M1 candidate generation; M10 seeds
only exact reviewed `STRUCTURE` Requirement Items and labels the result
`REQUIREMENT_PROPOSAL`. It never treats absence as proof of no required Section.

Draft Plans are mutable under optimistic concurrency. Review requires at least
one Section and stores a deterministic hash over exact Contract identity,
lengths, Sections and all Requirement/Claim/Evidence placements. Reviewed and
superseded Plans reject in-place edits. `CREATE PLAN REVISION` clones the
reviewed structure into a new Draft while preserving the explicit current
reviewed pointer until the new revision is reviewed.

## Sections, coverage and length

Sections are discipline-neutral and retain title, purpose, parent, bounded
depth, order, length unit/allocation, origin, reason and notes. M10 supports
`WORDS`, `PAGES`, `SLIDES`, `MINUTES`, `ITEMS` and `OTHER`.

An authoritative total is selected only when the reviewed Contract contains one
unambiguous resolved LENGTH value with a supported unit. User-planned totals are
stored separately and never overwrite Contract authority. Plain text provides a
deterministic automatic count only for words and line items; page/slide/minute
length is shown as not automatically measured rather than falsely inferred.

Requirement coverage is planning, not academic satisfaction. A Requirement can
be assigned to a Section or intentionally excluded with an explicit user reason.
Claims are placed explicitly. Evidence can be planned only when an existing M8
reviewed, assessed Claim/Evidence relationship connects it to a placed Claim.
No Evidence, source, provenance or Citation metadata is copied.

## Readiness and traceability

Readiness is a bounded explainable condition list, never a quality score or
completion percentage. It can report unaddressed Requirements, missing Section
purpose, unsupported/contradicted Claims, stale Evidence, Citation integrity
conditions, open M7 Research Gaps, open M4 Workflow Blockers and length
allocation differences. These records do not automatically complete or block a
Workflow node.

The writing inspector reads M8 Citation integrity and offers insertion only for
a rendered canonical Citation.js result. Insertion changes the unsaved textarea;
persistence still requires the explicit `SAVE NEW VERSION` action.

## Drafts and diff

A Draft binds to one exact reviewed Plan and Requirements Contract hash. Every
save is a new immutable version. The service carries unchanged Section content
forward so each version remains a complete document snapshot. Historical
versions remain readable in a disabled editor. The line diff is deterministic,
bounded to 12,000 lines and falls back to bounded before/after excerpts when the
comparison matrix would be excessive.

M10 does not invoke Local Academic AI. The existing no-tools, no-cloud and
explicit-save AI boundary remains unchanged for a later milestone.

## Security and privacy

The hardened Electron boundary remains `nodeIntegration: false` and
`contextIsolation: true`. Nineteen fixed Composition/Draft channels are exposed
through preload. Main process validates trusted sender, payload keys, IDs,
Assignment/Plan/Section/Draft ownership, exact M1/M8 references, lifecycle,
optimistic versions, hierarchy and content bounds. Renderer input cannot forge
Section/Draft origin. There is no raw `ipcRenderer`, generic SQL, filesystem,
shell, network proxy, provider or model invocation.

Draft content is escaped before rendering. Synthetic fixtures contain no Moodle
data, institutional identifiers, private Assignment, credential, local path or
signed URL.

## Bounds and scale

Normal reads are Assignment/Plan/Draft scoped. Plan history is capped at 100,
Sections at 200 and Draft history at 100. Draft Section content is capped at
120,000 characters and a complete Draft at 500,000 characters.

The deterministic scale fixture contains 100 Courses, 1,000 Assignments, 2,000
Composition Plans, 4,000 Sections, 1,000 Draft Documents, 3,000 Draft Versions
and 6,000 Section snapshots. On the validation host, the sampled Assignment Plan
hydration was 0.738 ms, Draft/history hydration 0.261 ms and historical Version
hydration 0.068 ms. These are local observations, not performance promises.

## Tests and validation

Focused M10 tests cover schema/migration/rollback, no fabricated state,
Contract proposal boundaries, authority/user length separation, hierarchy,
optimistic concurrency, requirement placement/exclusion, M8 Claim/Evidence
reuse, explainable readiness, immutable Plan review/revision, immutable Draft
Versions, historical reads, diff, restart, Working Context, cross-Assignment
rejection, discipline neutrality, typed IPC, origin anti-forgery, XSS escaping,
responsive UI contracts and scale.

The focused domain suite passed 21 checks, IPC 8 checks and UI contract 12
checks. The bounded scale fixture also passed. M1–M9 focused domain regression
passed before broad regression.

## Technical audit

One M1–M10 integration audit was performed against actual service, IPC, schema
and renderer flows.

- **MAJOR — fixed:** historical Draft rows were listed but their full immutable
  Section snapshots were not readable from the renderer. A scoped exact-version
  API and read-only historical editor were added.
- **MAJOR — fixed:** the first UI exposed Section allocation but not Plan-level
  title/unit/user budget or reasoned Requirement exclusion. Both now use Draft-
  only optimistic mutations and progressive disclosure.
- **MAJOR — fixed:** the candidate Evidence list included unreviewed and
  `NOT_ASSESSED` relationships that the authoritative service would reject.
  Renderer candidates now match the reviewed relationship gate.
- **MINOR — fixed:** plain-text Draft totals displayed zero for page/slide/minute
  units as though measured. The UI now states that these units are not measured
  automatically.
- **INFORMATIONAL:** Draft Versions are canonical M10 records and are not also
  registered in Artifact Bay. This avoids a duplicate registry before the
  Artifact taxonomy has an explicit Draft Version canonical object type.
- **INFORMATIONAL:** Plan readiness is computed on request from bounded canonical
  state; it is not persisted as a competing Workflow/quality authority.

No M10-caused BLOCKING or unresolved MAJOR finding remains at this stage.

## Visual validation

Real Electron was launched with an isolated synthetic user-data directory. CDP
validation passed with no horizontal overflow or escaped interactive controls
for:

- Dark at 1680×1050 @2x, reviewed Plan and active Draft;
- Light at 1440×900 @2x, Draft Plan/review controls;
- System→Dark at 1200×780 @1x, source/citation conflict;
- System→Light at 1440×900 @2x, read-only historical Draft Version;
- empty state, long content and Humanities interpretation fixtures.

Four synthetic screenshots were inspected visually. The Assignment Workspace
remains calm outside Composition; M10 uses one Section outline, primary writing
surface and contextual support inspector. The compact layout reflows without a
card wall. No private Moodle, institutional or local-path data was captured.

## Packaged validation

M10 adds fixed preload channels, so an ARM64 validation DMG was required. The
implementation commit `8ed1d5d2efb204004678876395613fc2fd95a188` produced the
private validation artifact `AegisUi-2.7.1-arm64-m10-validation.dmg` with
SHA-256 `feedefee782e82278bb7feadb440cfac5b252b2693852dbe4a47c47dcb2a7662`.
The disk image passed `hdiutil verify`, mounted read-only and AegisUi launched
from the mounted volume with an isolated synthetic user-data directory.

The mounted bundle passed strict deep ad-hoc signature verification. Its real
`app.asar` physically contained the four M10 modules, the fixed M10 preload
channels and Citation.js, with no dependency symlink back to a worktree. The
Calendar helper was packaged. The unpacked `node-pty` ARM64 module and signed
spawn helper were present, and an authenticated terminal connected during
startup. Runtime inspection confirmed schema v23, the typed Composition
handler, Citation and Compute handlers, and the M10 Workspace. Renderer
`require` and `process` were absent, raw `ipcRenderer` was not exposed, and the
preload bridge remained available. Ollama was not invoked because M10 does not
use Local Academic AI.

## Known limitations and M11 boundary

- No rich-text composition editor, automatic bibliography assembly or file
  export is added in M10; the first Draft surface is bounded plain text.
- Page, slide and minute counts require human/document-specific review.
- The UI opens the most recently updated Draft for an Assignment; multiple Draft
  selection is not yet a primary interaction.
- Local AI is not invoked and no cloud fallback exists.

The next product milestone is **M11 — Humanisation with Diff**. M10 does not
start it.
