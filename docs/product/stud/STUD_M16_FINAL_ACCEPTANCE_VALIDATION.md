# M16 — Private acceptance and final hardening

## Status and scope

**IN PROGRESS — not milestone completion or release approval.** Updated 29
September 2026; continuation evidence added 6 October 2026 below. Isolated branch `codex/stud-m16-final-acceptance`, base
`44107a50c4062948464f36c8f9ac8862b7614ca8` on `feature/systems-online-pass`.
Application 2.7.1; schema remains 28. No migration, fabricated backfill,
credential change, provider integration or university submission was added.
The Master PDF is unchanged.

The user's confirmed order is M16 technical acceptance, then a dedicated STUD
usability simplification and human validation, then the queued Map programme.
Passing geometry tests must not be represented as passing that usability review.

## Findings and corrections

| Finding | Classification | Correction / evidence |
| --- | --- | --- |
| Updating an unreviewed Evidence locator wrote only JSON, leaving exact extraction/chunk/page identity and snapshot attached to the previous location; the update did not revalidate source ownership | MAJOR | Main resolves the new location against the canonical source. One optimistic SQL update persists the resulting identity, snapshot and excerpt. Cross-document and malformed locators fail without mutation. Reviewed Evidence remains immutable. |
| A page range was accepted if any page existed, even when the remaining pages did not | MAJOR | Every page in the requested historical extraction range must exist. |
| Artifact-backed Evidence computed a current hash but did not compare it with the reviewed snapshot | MAJOR | Version/integrity drift now reports SOURCE_CHANGED rather than CURRENT. No historical record is rewritten. |
| Node PDF.js received a file-URL string for its standard font directory, which its Node factory passed directly to fs.readFile | MINOR | Pass the resolved bundled directory path. Real PDF.js extraction now loads standard fonts on a volume path containing spaces. No renderer filesystem authority is added. |
| General regression omitted Documents, Research/Writing, Revision, Compute, Notebook, trust-boundary, prebuild and two scale suites | MAJOR validation gap | Add those suites permanently, plus the two M16 tests. The Compute suite's obsolete expected schema 27 failed against unchanged baseline schema 28; update the explicit expected value to 28, not a weakened assertion. |
| Live test activated STUD before the fresh renderer finished its startup sequence | Test harness defect | Poll actual workspace readiness with a 30-second deadline. |
| M13 validation cited nonexistent Master section 80 | Documentation defect | Correct to section 19's weak-model scenario, without claiming successful academic drafting. |

`test-stud-m16-evidence-location.js` adds 14 checks. It generates a synthetic PDF
with the existing fixture generator and uses the **real bundled PDF.js**, not
the injected parser used by older unit fixtures. It covers exact provenance,
invalid/foreign references, range validation, concurrency, immutable review,
artifact drift, Notes/Context Packages, restart and absence of fictitious Runs.

`test-stud-m16-process-recovery.js` adds six checks. A child process completes one
real deterministic handler and is killed with SIGKILL while the next handler is
deliberately held in flight. A new process/database connection records
INTERRUPTED, reconciles operational history, requires explicit resume, and does
not rerun the completed handler. SQLite integrity and foreign keys pass. This is
process/WAL recovery evidence, not a claim of restoring an LLM token stream.

## Validation recorded so far

- Baseline broad regression: **105 passed, 1 failed, 1 skipped / 107 scripts**.
- Expanded regression after corrections: **116 passed, 1 failed, 1 skipped /
  118 scripts**. These are suite-script counts, not individual assertion counts.
- The single remaining failure is Map provider configuration: TomTom HTTP 401
  and absent AISSTREAM_API_KEY, observed both before and after these changes.
  SAT/Celestrak remains skipped under the existing runner policy.
- Focused hardening run: 13 scripts passed, zero failed. Added extended baseline
  run: 8 passed, 1 failed (obsolete Compute schema assertion described above);
  corrected Compute subsequently passed all 22 checks and the expanded runner.
- CodeQL-targeted tests, Electron boundary, release-health, migration regression
  and deterministic prebuild guard pass. No fresh full CodeQL database/remote
  dashboard result is claimed.
- Evidence scale: 100 Courses, 1,000 Assignments, 300 Research Plans, 3,000 Claims,
  6,000 Evidence records, 18,000 relationships. Recorded local map query 4.5 ms,
  claim lookup 0.35 ms, filter 0.01 ms, reopen 1.77 ms. These are single fixture
  observations, not hardware-independent performance guarantees.
- Final package scale: 100 Courses, 1,001 Assignments, 100 packages/900 files;
  first history page 0.23 ms, inspection 1.64 ms, reopen 1.88 ms.

## Real local model acceptance

Ollama returned READY with the installed `llama3.2:3b`. Its real academic-drafting
capability probe returned LIMITED (41,919 ms). The coordinator recorded
NO_SUITABLE_MODEL and did not create a model draft or candidate Artifact. An
independent deterministic branch completed; external-input and human gates
remained visible; explicit pause/resume passed. The result is
PASS_WITH_EXPECTED_NO_SUITABLE_MODEL, **not** successful academic drafting or
proof of Master's-level quality. No model was installed, downloaded or replaced,
and no cloud fallback was used. The acceptance profile explicitly disabled
free-memory pausing; pressure-policy behavior has separate controlled tests.

## Private/local intake — limited evidence

The source academic database was opened read-only. Integrity is OK with zero
foreign-key violations. The designated case with linked material resolves
unambiguously and retains six indexed documents. It had no M1 Contracts,
workflow instances, research/composition plans, Claims, Evidence or final
packages. Therefore previous feature completion cannot be called a completed
private end-to-end workflow.

`validate-stud-m16-private-intake.js` requires explicit source/course/Assignment
selection and a new private destination outside the repository. It takes a
consistent SQLite backup; mutations occur only there. It does not copy the
vault, browser session, credentials or managed document bytes. The local
snapshot contains private academic data and must never be committed or released.

On that snapshot, candidate intake produced an **unapproved DRAFT** and a bounded
Context Package. Requirement coverage was six linked documents, four inspected,
52 chunks, zero OCR-required documents, **truncation reached**, 80 candidates.
The Context Package contains 80 chunks and 80 candidate records. These counts
do not imply exhaustive source coverage. An explicit no-approved-Contract
workflow was created only in the acceptance copy. Draft and Context Package
survived reopen. No provider or model was invoked and no missing input, approval,
review or academic correctness was invented.

Still required: inspect the real source requirements, represent genuine missing
team/geometry/calculation inputs with exact provenance, exercise independent
branches on this case, and preserve the human-review boundary. Database-only
intake does not validate the physical managed files or complete private acceptance.

## Live renderer and native export

An isolated synthetic profile ran the current **development Electron** source
with offline mode and update checks disabled. The 72-case package renderer
matrix passed: four theme modes (Dark, Light, System-Dark, System-Light),
1680x1050 @2x, 1440x900 @2x, 1200x780 @1x, six package states. Screenshots are
cropped to synthetic STUD surfaces. This matrix does not cover every M1–M16
screen or establish human usability.

After a real application quit/relaunch with the same synthetic profile, exact
approval timestamp, manifest hash and immutable package files were retained;
the 72-case matrix passed again. The legacy harness prints a PACKAGED_RESTART
label; build identity here is explicitly development Electron, not a DMG.

Live renderer security verified no require/process/Buffer, no raw IPC/Electron
or generic files/exec bridge, a functioning terminal, and schema 28.

The native macOS export picker was actually operated through accessibility UI:
cancel returned to STUD; a subsequent explicit destination selection exported a
synthetic **unapproved review copy**. STUD showed “Export verified: 10 files.
Unapproved review copy.” The eight manifest-listed content hashes and sizes
were checked from disk; the receipt has approval=null. A stale unapproved review
copy is deliberately exportable; it is not an approved submission. The approved
stale-package rejection remains covered separately. A transient capture-tool
error after closing the picker was recovered by reattaching to the app; output
files and the resulting UI state were both verified.

## Evidence, privacy and remaining gates

Local evidence lives under the external test-artifact directory `m16-validation/`:
`regression-baseline.log`, `regression-hardened.log`, `focused-hardening.log`,
`extended-baseline.log`, `local-model-acceptance.log`, `live/`, `native-export/`,
and the private intake snapshot. Raw broad-regression logs may contain unrelated
local/provider information; they are **not release attachments**. Only curated,
sanitized evidence may be published. No private contents or absolute user paths
are included in this document.

Pending closure gates:

1. Complete private-case blocked/independent-branch acceptance without inventing
   review or missing academic data.
2. Finish final restart, live cross-module and M16 integration inspection.
3. Build from an identified committed source, inspect app.asar, mount/launch the
   new ARM64 validation DMG and retest affected runtime/font/provenance paths,
   Calendar, terminal/node-pty, Citation.js and local-model boundary.
4. Curate privacy-safe release evidence and document all capability limitations.
5. Integrate/push/release only after the applicable acceptance gates pass.

At the original report cutoff no M16 DMG was claimed. The continuation below
supersedes that packaging status, not the remaining acceptance gates.
The subsequent UX programme must make an Assignment usable without learning
the domain's internal terminology; it has not been implemented in this pass.

## Continuation — 6 October 2026

Runtime source remains commit `f0515d39c49da625d836ffda4af13407246433e2`.
Changes in this continuation are acceptance scripts/tests and documentation,
not a new product capability. Existing uncommitted private-intake and packaged
validation scripts were preserved and inspected before editing.

### Packaged provenance defect was in the harness

The earlier packaged-provenance log failed with `CONTEXT_RELATION_REQUIRED`.
`validate-stud-m16-packaged-provenance.js` instantiated the Evidence service
without its Working Context dependency. The production guard correctly rejected
the source. The harness now supplies the existing Working Context service both
initially and after reopen. No ownership check was removed or weakened.
An additional assertion rejects the same document under an unrelated Assignment.

The corrected test passed using **the mounted app executable and app.asar
modules**: real PDF.js extraction/standard fonts, valid location change,
nonexistent-page rejection, cross-Assignment rejection, immutable reviewed
Evidence, exact provenance after database reopen and no network use. File bytes
were supplied by an explicit synthetic fixture; this is not a native import
picker test.

### Build identity and live packaged checks

The existing validation DMG was reused only after verification:

- Artifact: `AegisUi-2.7.1-arm64.dmg`.
- SHA-256: `6a0d920656c99f36ddc49813f392309a236aa0265324e74649b63e79807a1afa`.
- Prebuild guard passed against the runtime commit above; source digest
  `0e0489b65991e32356aeac9d2516d21da13ba793010fcc339be5ceed179145b0`.
- The asar prebuild manifest, Evidence service, Document runtime, Run
  Coordinator and preload bytes matched verified prebuild files.
- Full comparison subsequently checked 284 packaged source/assets files:
  contents match verified prebuild, except the expected removal of `keywords`
  from package.json by electron-builder. No code mismatch was excluded.
- Mounted read-only; launched the executable from that volume with a fresh
  synthetic profile, offline mode, update checks disabled and a separate
  terminal port. The user's profile/vault was not used.
- `codesign --verify --deep --strict` passed. This is the repository's ad-hoc
  signature/integrity check, **not Apple notarization**.
- 324 STUD geometry/nonblank checks passed, zero failures/uncaught renderer
  exceptions: 27 surfaces, four appearance modes, three prescribed viewports.
- Packaged typed APIs passed for Course, Assignment, Requirements draft,
  Workflow, Working Context, organisation/classification, Citation.js, Moodle
  status, document/compute capabilities; terminal WebSocket connected. Renderer
  `require`, `process` and `Buffer` were absent. Ollama read-only status was READY;
  this did not run generation, evaluate model quality or redo institutional SSO.
- 72 final-package scenarios passed on the mounted app, including a synthetic
  create/explicit-approval/read cycle. Approval belongs only to the synthetic
  fixture, not the user's real academic work.
- After closing that app and launching again from the mounted volume, the
  exact approval timestamp, manifest hash and file integrity persisted. The
  72-case matrix passed again. Total here is 324 + 72 + 72 = **468 geometry/state
  observations**, not 468 independent academic capabilities.

The first new synthetic launch used a string for `shellArgs`, which node-pty
rejects on Unix. Correcting **only the test profile** to an argument array allowed
launch. This was harness configuration, not a runtime source change. The surface
validator now polls actual renderer/academic-store readiness with a 30-second
deadline. The package-cycle validator also needed a bounded wait for the first
DevTools page: a cold restart can expose the port before creating a window.
It then passed. These harness fixes are not evidence that the current UX is intuitive.

### Branch acceptance and regression

The existing private snapshot report `m16-private-branches-restart` records an
independent deterministic check completed, a human gate waiting, a dependent
branch pending with zero attempts and exact chunk provenance after reopen.
It explicitly leaves the Contract unapproved and actual project inputs
unconfirmed. Only its status report was inspected in this continuation; no new
private import, review or academic computation is claimed.
The independent stage is labelled "Check saved academic context": its real
handler checks presence of canonical inputs, not academic coverage or correctness.

Added `test-stud-m16-intake-branches.js`: eight passing checks using a synthetic
stored-extraction fixture and the **same branch-acceptance helper**, now importable
without launching the private CLI. It tests invalid/unmatched evidence without
workflow mutation, current versus historical extraction, independent execution,
human/dependency waits, zero dependent attempts, restart, exact note provenance,
unapproved Contract and SQLite integrity. This test does not parse a PDF; the
separate 14-check provenance suite exercises the real bundled PDF.js.

Current validation counts:

- Focused: provenance 14/0/0, process recovery 6/0/0, intake branches 8/0/0
  (passed/failed/skipped checks).
- Broad runner: **116 passed, 1 failed, 1 skipped / 118 scripts**. The new
  branch suite was added after this runner started and passed separately;
  combined coverage is **117 passed, 1 failed, 1 skipped / 119 distinct scripts**,
  not a claimed single 119-script run.
- Failure remains `test-map-providers.js`: TomTom HTTP 401 and missing
  AISSTREAM_API_KEY, matching the recorded baseline. SAT/Celestrak skipped under
  existing runner policy. No newly failing suite observed.
- Broad coverage includes release health, targeted CodeQL hardening, Electron
  boundary, prebuild integrity, M1–M15, other Aegis modules and native-helper
  checks. No fresh remote CodeQL dashboard scan claimed.

Raw regression logs are private/local validation material, not public assets.
Screenshots contain only cropped synthetic STUD surfaces. No runtime, schema,
credentials, original academic database, approval or public release was changed.

### Still not closed

- Real-case academic source review and remaining integration gates must not be
  inferred from synthetic tests or the private snapshot. Physical managed-file
  integrity is now checked directly, as recorded below.
- The full automatic research-to-output path is not available: RESEARCH nodes
  remain MANUAL_ONLY and model drafting has explicit reviewed-input/capability
  gates. Existing local-model evidence is LIMITED, not successful drafting.
  A read-only Ollama model-list check on 6 October found only `llama3.2:3b`
  (3.2B, Q4_K_M); no new generation/probe or model installation was performed.
- Real model-text preview is not yet wired: Ollama chat requests use
  `stream: false`; Mission Control polls recorded state every two seconds and
  exposes completed candidates, not an incremental text feed.
- Human UX acceptance is **not passed**. The user rejected the isolated
  workbench mockup as unclear; test counts do not override that finding.
- No M16 integration, public release, UX milestone closure or Map start is
  authorized by these passing technical checks alone.

### Direct managed-file verification — 6 October 2026

`validate-stud-m16-managed-case.js` is an opt-in, read-only CLI. It opens the
explicitly selected original academic database with SQLite read-only mode and
`query_only` and one read transaction, without initializing/migrating it. Selection must identify exactly
one Assignment with linked documents. It inspects only that case's managed
references; it never opens the credential vault or invokes a provider/model.

On the designated private acceptance case, **six of six managed PDFs passed**:
regular/non-linked file, bounded size, canonical byte length and SHA-256,
PDF header, canonical managed-reference provenance, stored chunk hashes and
page ranges. **153 stored chunks** were checked across those six latest
extractions. SQLite quick-check and foreign-key checks passed. No source record,
requirement approval, workflow state or original file was modified.

This is not a new extraction or full PDF conformance check. A matching hash
establishes correspondence with stored bytes, not that the academic content is
correct or that a student has reviewed it. Chunk checks establish consistency
of the stored extraction, not independently rerun text extraction. Previously
reported candidate truncation (four inspected documents/52 chunks) remains a
separate limitation; 153 integrity-checked chunks do not mean 153 chunks were
reviewed by the requirements extractor.

The checker reuses `StudStoragePaths`, canonical active storage profiles and
managed namespaces. It does not fall back to a local copy if an active profile
is missing. Reads are capped at 32 documents, 40 MiB per PDF, 2,000 chunks per
document, with fixed-size hashing buffers, non-following descriptors and a
before/after file-stat check. These checks are not a claim of an atomic snapshot
against concurrent external filesystem mutation. It preserves all histories and reports failure rather
than repairing files. Output contains only ordinal results/counts/error codes,
not source IDs, titles, text, paths or private hashes.

`test-stud-m16-managed-case.js`: **15 passed / 0 failed / 0 skipped**. Synthetic
checks cover valid local and registered assets, database/file non-mutation,
restart reads, same-size byte tampering, missing/oversized files, symlink and
hardlink rejection, path traversal, missing active profile/no silent fallback,
storage metadata mismatch, missing provenance, corrupt chunks/page ranges,
OCR/no readable chunks, missing/ambiguous selection, input/document bounds and
report redaction. Its controlled byte/extraction fixture does not claim PDF
parsing. External volume identity continues to use the existing storage boundary;
no new physical unplug/replug or external-volume test is claimed here.

All four M16 focused suites rerun: **43 passed / 0 failed / 0 skipped** checks
(14 provenance + 6 process recovery + 8 private-intake branches + 15 managed
case). CodeQL-targeted hardening (7 checks), prebuild guard (4 checks),
release-health and `git diff --check` passed again. The broad 118-script run
above was not repeated for this test-only addition; adding the two separately
passing new suites gives **118 passed / 1 failed / 1 skipped across 120 distinct
scripts**, not a single newly executed 120-script run. The Map environment
failure and SAT/Celestrak skip remain unchanged.

Sanitized local evidence: `m16-validation/2026-10-06/managed-case-status.json`.
The private database/files are not included in Git or release assets. No new
DMG is needed for these validation-only files; the identified mounted runtime
remains the previously validated committed build.

### Current closure ledger

| Gate | Evidence/status |
| --- | --- |
| Exact source identity and immutable evidence | Real PDF.js tests, packaged test and restart passed. |
| Original case managed-file integrity | Six PDFs/153 stored chunks directly verified read-only. |
| Independent branch versus missing-input/human gates | Private snapshot plus synthetic regression; deterministic check completes, dependent attempts remain zero, no fake approval. |
| Crash/restart and mounted application | Recorded actual SIGKILL/reopen and mounted ARM64 app validation passed. |
| Private academic approval / completed real academic output | Not established; no human approval invented. |
| Fully automatic research-to-draft | Not implemented by existing handlers; RESEARCH is MANUAL_ONLY. Installed model failed the earlier drafting capability gate. |
| Actual incremental model/document activity preview | Not connected; completed-output polling is not live generation. |
| Simple year/subject/assignment UX | Not implemented/accepted; rejected mockup is not a completed workflow. |
| Integration / final release | Pending; this ledger does not authorize describing the full requested product as complete. |

Next product work must address the real automatic-work and preview boundaries
before presenting an AI-start button as a working end-to-end action. It must not
substitute more technical acceptance counts, decorative telemetry, hidden manual
steps or unearned academic approvals for the requested user workflow.
