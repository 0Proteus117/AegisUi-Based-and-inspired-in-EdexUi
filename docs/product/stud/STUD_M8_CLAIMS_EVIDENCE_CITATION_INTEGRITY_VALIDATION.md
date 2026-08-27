# STUD M8 — Claims, Evidence Map and Citation Integrity validation

## Milestone boundary

M8 implements an Assignment-scoped intellectual traceability layer over the
existing canonical STUD store. It does not acquire literature, call providers or
models, create operational Runs, draft academic work, decide truth, estimate
support strength or submit university work. M9 was not started.

The implementation keeps five authorities separate:

1. a **Claim** is the assertion under review;
2. **Evidence** is one bounded, inspectable evidential unit;
3. the **Source** remains an existing canonical STUD object or M6 Artifact;
4. **Provenance** identifies the exact chunk/page/cell/result/range used;
5. a **Citation** is the Citation.js representation of canonical bibliographic
   metadata and does not establish support.

## Schema v21

Migration v21 is one transactional extension after v20. It creates:

- `stud_claims`: immutable reviewed Claim revisions plus optional semantic-parent
  decomposition;
- `stud_claim_pointers`: explicit current reviewed/draft revision pointers per
  Claim lineage;
- `stud_claim_requirements`: exact M1 Requirement Item links and snapshot hashes;
- `stud_evidence_records`: canonical source identity, exact provenance, source
  snapshot, review state and optional Citation.js paper identity;
- `stud_claim_evidence_links`: explicit, reviewable and versioned intellectual
  assessments (`SUPPORTS`, `CONTRADICTS`, `QUALIFIES`, `CONTEXTUALISES`,
  `NOT_ASSESSED`);
- two nullable M2 Working Context references for the active Claim and Evidence.

Assignment, Plan, Topic, Question, Workflow Node, Requirement, M6 Artifact,
Research Paper, AcademicDocument extraction and chunk identities are referenced
instead of copied. No migration backfills a Claim, Evidence item, relationship,
review or provenance record for an existing Assignment.

## Claim model and lifecycle

Claims are discipline-neutral and support factual, analytical, interpretive,
methodological, design/engineering, quantitative, comparative, evaluative,
conclusion, recommendation, limitation, assumption, other and unknown types.
The authoritative service forces user-origin mutations from renderer IPC.

A Claim begins as `DRAFT`. Review computes a deterministic SHA-256 fingerprint
over its semantic scope, text, type, hierarchy and exact Requirement snapshots.
Reviewed content cannot be edited in place. A semantic edit creates a new Draft
revision; review supersedes the former reviewed revision transactionally while
history remains queryable. Optional parent Claims are Assignment scoped, bounded
to eight ancestor levels and cycle checked. Every mutable action uses optimistic
row versions and rejects stale writes.

## Evidence and exact provenance

Evidence is a reference, not another document store. Main-process validation
requires canonical Assignment/Course scope and type-specific exact provenance:

- AcademicDocument: exact extraction/chunk or extraction/page range;
- Research Paper and other source records: exact canonical record identity;
- Dataset: explicit bounded field/range/query locator;
- Notebook: exact cell and optional output identity;
- Compute result: exact canonical result identity and parameter/output snapshot;
- M6 Artifact: exact Artifact/version identity.

Vague whole-dataset Evidence is rejected. A document without inspectable text is
reported as `OCR_BLOCKED`. Source snapshots are hashed. Later source mutation,
archival or extraction replacement reports `SOURCE_CHANGED`, `SOURCE_MISSING` or
`OCR_BLOCKED` without altering reviewed Evidence history.

Reviewed Evidence and reviewed Claim/Evidence assessments are immutable. A new
assessment revision is required to change intellectual meaning. No numerical
confidence or source-count strength score exists.

## M7 Dossier boundary

Topic Dossier membership remains research organisation, not Evidence. An
accepted Dossier item appears as an explicit `USE AS EVIDENCE` action only. The
service then resolves the exact canonical source and records the Dossier Item ID
as provenance context. Suggested/rejected or unavailable Dossier records cannot
be promoted. No stance from M7 is silently converted to support or contradiction.

## Citation integrity

M8 reuses the canonical Research Paper and Citation.js service. Computed states
distinguish missing bibliographic identity, incomplete metadata, render failure,
source mismatch, unavailable source and source change from exact Evidence
provenance and explicit Claim support. A renderer cannot replace an Evidence
citation with metadata for a different Research Paper or the wrong canonical
Document source. Ambiguous identity is rejected rather than repaired silently.

## Evidence Map and Working Context

Assignment Workspace adds one contextual Evidence Map surface. Its primary path
is Claim → explicit Evidence → relationship assessment → exact Source/Provenance
inspection → Citation integrity. Draft editing, Claim decomposition, reviewed
revisions, unsupported/contradictory/qualifying states and an exact M5 preview
handoff use progressive disclosure. Raw IDs and hashes are not primary UI.

M2 Working Context persists an active Claim and Evidence only after main-process
ownership validation. Context selection never calls Moodle, a research provider,
Ollama, a Workflow operation or Mission Control.

## Bounds and scale

Normal Assignment reads are indexed, Assignment scoped and bounded to 100 Claims
and 500 Claim/Evidence assessments per Evidence Map request. Evidence and Claim
lists use explicit limits/time cursors. Locator JSON is limited to 8 KiB; Claim,
excerpt, rationale and note strings have explicit length bounds.

The synthetic scale fixture contains 100 Courses, 1,000 Assignments, 300 Research
Plans, 3,000 Claims, 6,000 Evidence records and 18,000 Claim/Evidence assessments.
On the validation host, the active Assignment Evidence Map hydrated in 4.05 ms,
one Claim in 0.35 ms, unsupported/conflicted filtering in 0.01 ms and restart
hydration in 1.61 ms. The SQLite fixture was 17,395,712 bytes. These are local
observations, not performance promises.

## Security and privacy

The completed Electron boundary remains `nodeIntegration: false` and
`contextIsolation: true`. M8 exposes only fixed preload channels. Main process
validates trusted sender, payload keys, IDs, Assignment/Plan/Topic ownership,
canonical source identity, provenance, lifecycle, origin, optimistic versions and
bounds. There is no raw `ipcRenderer`, SQL, filesystem, shell, generic network,
provider or arbitrary model channel.

Visual fixtures are synthetic and use a temporary Electron user-data directory.
No Moodle/UEL content, credentials, private Assignment, username, path, signed
URL or model conversation is read or captured.

## Technical audit

One M1–M8 technical audit was performed after implementation.

- **MAJOR — fixed:** unreviewed Evidence could initially be updated to an
  existing but different Research Paper citation. The service now validates
  citation/source identity during every mutation; a mismatch fails closed.
- **MAJOR — fixed:** the first dataset UI path recorded a descriptive whole-file
  locator. It now refuses Evidence creation until a bounded dataset field/range
  is selected.
- **MAJOR — fixed:** Claim revision creation existed but the renderer initially
  lacked a Draft semantic editor. The Evidence Map now exposes bounded Draft
  editing and optional explicit parent-Claim decomposition.
- **MAJOR — fixed:** M7 Dossier promotion existed only at the service boundary.
  Accepted Dossier material now has a visible explicit promotion action and
  retains the exact Dossier Item reference.
- **MINOR — fixed:** the hierarchy model originally used one field name for both
  semantic parent and version parent. The schema/service now keep
  `parent_semantic_claim_id` separate from immutable revision lineage.
- **MINOR — fixed:** the inherited Engineering Compute regression helper ignored
  boolean return values in three checks, including its stale schema assertion.
  Those checks now use explicit assertions and verify schema v21.
- **INFORMATIONAL:** one current Draft hides its preceding reviewed revision in
  the default map, while that reviewed revision remains queryable in Claim
  history. This prevents old reviewed Evidence from masquerading as support for
  changed Draft semantics.
- **INFORMATIONAL:** source counts describe explicit records only and are not a
  source-quality judgement or completion percentage.

No remaining M8-caused BLOCKING or MAJOR finding was identified.

## Validation

Focused M1–M8 validation comprises 233 named checks plus the M8 scale suite. M8
itself includes 26 domain/migration checks, eight IPC/security checks, eleven UI
contract checks and one scale suite. Fresh v21, v20→v21, atomic rollback,
restart, exact provenance, Claim/Evidence/link immutability, hierarchy, OCR,
source drift/missing source, Citation.js, mismatch rejection, M6/M7 reuse,
Working Context and six discipline-neutral fixtures pass.

Real Electron validation used synthetic fixtures in Dark, Light, System→Dark and
System→Light at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x. Scenarios covered
empty, unsupported, supported, contradictory, qualifying, missing-source,
source-drift, missing-citation, citation-mismatch, long and dense Evidence Maps,
plus Engineering and Humanities. Automated geometry checks found no horizontal
overflow or escaped controls. Closed progressive-disclosure content did not
affect layout.

Broad regression, security/release-health and packaged validation results are
recorded in the final milestone report and implementation commit evidence.

The lockfile-based production dependency audit reports inherited advisories in
the unchanged dependency graph, including `pdfjs-dist`, Electron and transitive
build/runtime packages (`tar`, `brace-expansion`, `fast-uri`, `js-yaml`,
`nanoid` and `undici`). M8 adds or updates no dependency. These findings are not
represented as green and require a separately controlled dependency/runtime
upgrade with Document Intelligence and packaged-runtime regression; they are not
silently force-upgraded inside this isolated domain milestone.

## Packaged validation

The preload change required a private ARM64 validation package. Runtime commit
`0e548f931970a6b3af2455b9a9610c80aa055d64` produced
`AegisUi-2.7.1-arm64.dmg` with SHA-256
`838eb4cd4e19e6ed9539a5b80a7d5f03e87b6fb3c8c995d69891e9c9d6f32d9b`.
The image mounted successfully and AegisUi launched from the mounted volume.
The mounted `app.asar` physically contained all four M8 domain/workspace
modules and the fixed M8 preload channels. Runtime validation confirmed the
typed academic APIs, M8 Evidence Map geometry, Citation.js, Moodle boundary,
Document and Compute capabilities, Ollama bridge and authenticated terminal.
The packaged Calendar helper and ARM64 `node-pty` module were present;
`nodeIntegration` remained disabled and `contextIsolation` enabled. The DMG is
a local validation artifact only and is not a public release.

## Known limitations and M9 boundary

M8 does not automatically extract Claims, decide source quality, infer an
Evidence relationship, acquire literature, resolve OCR, provide generic dataset
selection UI, create drafts, invoke AI/workers or submit work. Those absences are
reported explicitly. The next product milestone is M9 — Faculty Literature
Scout; it was not started here.
