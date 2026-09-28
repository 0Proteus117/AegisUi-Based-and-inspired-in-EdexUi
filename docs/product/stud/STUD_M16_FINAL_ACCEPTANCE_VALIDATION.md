# M16 — Private acceptance and final hardening

## Status and scope

**IN PROGRESS — not milestone completion or release approval.** Updated 29
September 2026. Isolated branch `codex/stud-m16-final-acceptance`, base
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

No M16 DMG, integration, public release or milestone completion is claimed here.
The subsequent UX programme must make an Assignment usable without learning
the domain's internal terminology; it has not been implemented in this pass.
