# M14 — External academic storage and portable mode

Status: ACCEPTED AND INTEGRATED into `feature/systems-online-pass` at merge
`8fd120cd87444987893e7ff5f4b2bbd8e49206db`; no public release.

Latest checkpoint: final isolated-branch ARM64 package, native UI transfer/restore,
real packaged storage cycle and restart validated 2026-09-23. Earlier dated
checkpoints below describe their historical state;
their statements that bootstrap/UI or a DMG were absent are superseded by the
final section. Native packaged visual acceptance and final integration remain open.
Base: integration `89d49b2526b4d55bdd7b11d51a60113b0943c168`, including the
pre-M14 dispatch correction and corrected CI dependency installation.
Integration schema: 26. Isolated M14 development schema: 27.
The Master Specification is unchanged. M15 has not started.

## Repository audit and scope decisions

Actual managed bytes currently live below one main-process STUD root:

| Authority | Actual ownership | M14 integration |
| --- | --- | --- |
| `StudAcademicStore` | `academic.sqlite`, canonical records, observations, chunks, notes, drafts, contexts and history | Keep the database at its existing root; add normalized storage metadata only. |
| `StudResearchRuntime` | `documents/` PDF import, OA save and PDF reads | Resolve existing relative references through one storage service. |
| `StudLmsRuntime` | `documents/` PDFs and `moodle-files/` other managed downloads | Same resolver; encrypted vault, SSO and provider metadata stay in their existing locations. |
| `StudNotebookRuntime` | `datasets/` CSV/TSV import and read | Same resolver; no directory ingestion or notebook execution. |
| `StudDocumentRuntime` | Consumes PDF bytes supplied by Research; no independent filesystem authority | Keep the callback boundary. |
| M6 Artifact Bay | Canonical object references, not file ownership | Derive file availability; do not duplicate the registry. |
| M13 / Ollama client | Model names/digests/capabilities from a separately managed loopback server | No model-file path, model installation or owned Ollama process currently exists. Do not guess or move its files. |

The model-storage boundary is an implementation limitation, not evidence that
models are absent. M14 must label an externally managed Ollama model as outside
the portable asset manifest until a legitimate owned-storage adapter exists.
Copying an academic Assignment must never claim to have copied its model.

## Target implementation contracts

1. One canonical SQLite extension for storage profiles, exact managed-reference
   mappings, verified transfer manifests/items and explicit cleanup records.
   Existing references resolve to the local default with no physical movement.
2. A separate main-process storage repository/service, not additional domain
   logic in `StudAcademicStore`. Source text, PDFs, credentials and provider
   payloads are never copied into the new tables.
3. External profile selection uses a native folder picker. Store volume identity
   and a managed relative root; require both volume identity and an app-owned
   profile marker before reuse. Never recreate a disconnected mount path.
4. Resolve only the established `documents/`, `datasets/`, `moodle-files/`
   namespaces. Reject traversal, symbolic links and special files, including
   parent-directory symlinks. No renderer-supplied absolute path.
5. Prepare a bounded Assignment manifest before copying. Show bytes, shared
   sources, unavailable dependencies, omissions and excluded model/runtime
   dependencies. Refuse to describe a truncated selection as a complete package.
6. Copy to exclusive staged files, stream SHA-256 verification, then change
   mapping pointers transactionally with optimistic versions. Never hold a
   SQLite write transaction across long filesystem operations. Originals remain
   until an independent explicitly approved cleanup; rollback must verify them.
7. Portable mode copies approved dependencies to the local profile. Returning
   uses a verified explicit reverse transfer. Notes, chunks, citations and
   intellectual history remain in the original local database.
8. Actual transfer work may produce an M6 Run; preparation/inspection must not.
   Cancellation or restart before the switch leaves existing active references
   authoritative. No fake progress, ETA or automatic replay.
9. Settings/Assignment controls use progressive disclosure and fixed typed
   preload/main APIs. Main validates scope, identities, versions and bounds.
10. Verify disconnected/reconnected storage using synthetic disposable volumes,
    never by ejecting the developer/user's real academic disk.

## Acceptance still required

- Transactional v26→v27 migration and fresh database, rollback and preservation.
- Managed PDF/Moodle/dataset compatibility, provenance/hash and restart tests.
- Stable volume identity across remount, wrong/cloned volume handling, symlink,
  capacity, tamper, cancellation, stale version and cleanup/rollback tests.
- Explicit portable manifest, missing/offline/model limitations and no provider
  side effects; old Assignment metadata remains usable while bytes are offline.
- Synthetic real Electron visual matrix and packaged ARM64 validation, because
  adding fixed storage preload APIs is packaging-sensitive.
- Broad STUD/Aegis regression, trust boundary, CodeQL-targeted checks,
  prebuild guard, release health, audit and clean integration.

No real academic files or Ollama model files have been moved by this preflight.

## Implemented storage-core checkpoint (2026-09-11)

This is a tested implementation checkpoint, **not completed M14**. The new
storage services are not yet instantiated by Academic IPC or exposed through
preload/UI. Existing Research/Moodle/Notebook runtimes still use their current
local resolver. Do not integrate this branch as a finished product milestone.

| File | Implemented responsibility |
| --- | --- |
| `studStorageModel.class.js` | Migration 27 SQL and bounded storage value contracts. |
| `studStorageRepository.class.js` | Existing canonical SQLite connection; profile persistence, optimistic reconnection, asset identity and indexed canonical-owner lookups. |
| `studStoragePaths.class.js` | Fixed managed namespaces, volume UUID + profile marker identity, no recreation of missing mounts, symlink/hardlink rejection. |
| `studStorageProfileService.class.js` | Native-picker profile setup/reconnection, redacted public profile state, legacy local resolution and canonical file checksum verification. No provider/network calls. |
| `studStorageFileTransfer.class.js` | Cancellable chunked copy, exclusive staging/publication, source and destination verification, retained originals. No mapping switch, canonical mutation or Run creation. |

Migration 27 adds normalized profiles, managed asset mappings, manifests/items,
retained-copy identities and cleanup records. The last four tables establish the
pending transfer lifecycle's persistence contract; no transfer orchestration or
cleanup API exists yet. Only the built-in local storage profile is seeded. No
Assignment, file mapping, Run, manifest, history or approval is fabricated.
Foreign keys restrict deletion of referenced storage/history; no file-deleting
SQLite cascade exists. Migrations 1–26 are unchanged.

The schema also indexes the four existing canonical managed-reference columns
for exact owner lookups. Asset registration requires a real canonical owner and
matching available canonical checksums; conflicting checksums fail closed.
Multiple owners retain the same original relative reference, not duplicate bytes.
The schema stores private main-owned mount hints, not credentials. Profile API
results omit mount hints, volume UUIDs, marker nonces and relative storage roots.

Core bounds: 16 profiles; 500 inspected owners; 64 MiB per verified file;
256 KiB transfer buffers. A copy reports **bytes copied**, not overall operation
completion; readback verification must still succeed. The forthcoming manifest
service must enforce the reserved 500-item / 8 GiB operation bounds. Those
operation-wide bounds are not claimed as implemented by this byte-copy helper.

## Executed checkpoint validation

- `test-stud-storage-paths.js`: 12 checks passed.
- `test-stud-storage-profiles.js`: 18 checks passed, including fresh v27,
  v26→v27, rollback on an actual migration failure, no fabricated asset state,
  restart, indexed bounded lookups, redaction and stale reconnection rejection.
- `test-stud-storage-file-transfer.js`: 12 checks passed, including SHA-256
  readback, cancellation, source tamper, target identity change, wrong existing
  target, exclusive-publication race, symlink, disk space and retained originals.
- `validate-stud-storage-volume.js`: passed on a real disposable macOS HFS+
  image. Exclusive copy, detach, offline rejection, remount, stable Volume UUID,
  marker identity and post-remount SHA-256 verification passed. The real mount
  location did not change in this run; different mount-location reconnection
  is covered by the synthetic profile test, not claimed as live validation.
  The disposable image was detached and deleted. This is **not an Aegis app
  validation DMG**. No user's real disk was ejected.
- CodeQL-targeted security: 7 checks passed; Electron trust boundary: 17;
  prebuild-integrity guard: 4; release health and diff whitespace checks passed.
- Initial STUD regression: 53 suites passed, two failed. The representative
  old-schema fixture incorrectly retained newly added M14 tables/indexes; its
  downgrade setup now removes only those additions before migration replay.
  Research/PDF.js failed because ESM import does not use `NODE_PATH`; installing
  the declared `src/package-lock.json` dependencies in this worktree corrected
  that environment setup. Both suites were rerun successfully, with no skip or
  weakened assertion. The fresh install added 202 packages, changed no dependency
  declarations/lockfile and deliberately skipped native install hooks.
- Final complete STUD regression: **68 suites passed, 0 failed, 0 skipped**,
  including all 13 existing scale suites and the three new storage suites.
  This is a count of executable suites, not the sum of their individual checks.
  The source-level security/guard checks above are additional and not a claim of
  live Electron or packaged acceptance. Legacy current-schema assertions were
  advanced to 27; assertions about historical migration numbers remain unchanged.
- Cross-Aegis regression: 37 suites passed, Map failed with TomTom HTTP 401 and
  absent `AISSTREAM_API_KEY`, and the absent SAT script was skipped under the
  established runner policy. Map reports the same failures previously reproduced
  on the unchanged integration baseline; Map sources were not modified. The
  Calendar/node-pty and Apple Music checks here are their repository tests, not
  newly mounted packaged-runtime validation. Subsequent core audit corrections
  were rerun through the affected storage profile suite (18 checks passed).

Public CI for the integrated pre-M14 correction succeeded at `89d49b2`:
[Repo health](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/runs/34636629923)
and [CodeQL](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/runs/34636629900).
Those results apply to the correction, **not this unintegrated M14 source**.
A successful CodeQL workflow is not a claim that every historical alert is gone.

## Core audit / integration gates

- Fixed during this checkpoint: native directory/dialog failures could have
  exposed a selected private path in an error; service-boundary errors now use
  fixed typed messages, covered by a regression test.
- Fixed during this checkpoint: owner lookups would otherwise scan canonical
  tables repeatedly; migration indexes support the four exact-reference queries.
- Fixed during this checkpoint: Research Papers keep their PDF checksum in
  `document_metadata_json`, not a top-level checksum column. Storage verification
  now checks that canonical hash as well, rejects malformed checksum metadata,
  and checks the managed filename's original digest prefix. A conflicting paper
  checksum cannot be ignored just because another canonical owner agrees.
- No second SQLite store, Artifact registry, secret store or provider authority.
  The main process owns storage identities and validation. No raw IPC, path,
  shell or network capability has been added to renderer/preload.
- A same-user process with arbitrary write access to the storage directory is
  not sandboxed by these helpers. Descriptor/no-follow checks and pre/post
  identity checks detect covered changes, but this is not a kernel-enforced
  directory capability against every parent-directory race. Keep this residual
  risk explicit; do not advertise an unrestricted hostile-filesystem sandbox.
- Failed setup or disconnected/changed-volume cleanup may leave a private
  marker/staged copy. Never recursively delete an unverified location. The
  forthcoming recovery/cleanup service must classify and handle app-owned
  leftovers explicitly, without scanning unrelated folders.
- Canonical file registration is currently synchronous and bounded. Do not
  invoke it for hundreds of files in a UI request: manifest preparation must
  use the asynchronous verifier introduced in the next checkpoint below.
- Native volume identity currently supports macOS local disk volumes. No cloud,
  network-drive, arbitrary model-directory or Ollama-server migration is implied.

## Exact remaining implementation order

1. Assignment-scoped dependency manifest over actual canonical references,
   including M6/M7/M8 and shared Course dependencies. Report missing, historical,
   unsupported and truncated dependencies; no directory scans or false completeness.
2. Transfer lifecycle service with optimistic versions, M6 truthful Runs,
   copy/verification, transactional mapping switch, interrupted-state recovery,
   explicit rollback and verified superseded-copy cleanup. Add fault-injection
   tests at copy/verify/switch boundaries before exposing any operation.
3. Route **both reads and writes** in Research, Moodle and Notebook through the
   same managed resolver. Preserve vault/SSO/SQLite roots. Test offline imports,
   incremental sync, shared references and local portable return semantics.
4. Fixed typed preload/main handlers and progressively disclosed storage UI;
   Assignment portable preview/confirmation and actual progress only.
5. Synthetic live theme/viewport matrix; full regression and technical audit;
   final-commit ARM64 packaged validation after the runtime/preload integration.
6. Only then accept/integrate M14. M15/M16 and public release remain outside this
   checkpoint. The separate-model-server ownership question remains explicit.

## Assignment inventory / verification checkpoint (2026-09-12)

Based on storage-core commit `fab985f`. Still **IN PROGRESS**, isolated, not
integrated, with no user-facing storage UI or new preload handlers. Schema stays
27; no additional migration or dependency change is introduced here.

`StudStorageManifestCatalog` performs read-only, bounded canonical traversal:

- Assignment-owned managed documents, resources, datasets, notes, notebooks,
  saved compute results and repository references.
- Course material only when `includeCourseMaterial` is explicitly true; material
  owned by a different Assignment is not silently included through the Course.
- Existing canonical relationships, M6 Artifact references, accepted M7 Dossier
  items, M8 Evidence/source/citation references and M1 requirement sources.
- Paper→AcademicDocument and Notebook→Note canonical links. No directory scan,
  title matching, model invocation or automatic source acquisition.
- Exact existing M1/M8 source-record, document, extraction, chunk and page IDs
  remain available as provenance pointers. This does not assert that the current
  PDF bytes reconstruct every historical extraction. Pinned extraction cases
  explicitly require historical-file identity review.

It preserves all inclusion reasons when an object is reached through multiple
authorities. Files are deduplicated by their original managed reference; source
records remain distinct. Shared canonical ownership and Course material are
disclosed, without inventing a count of affected Assignments from source counts.
Other Assignment/Course nodes are not traversed into. Missing/foreign canonical
objects, remote/no-managed-byte sources, unsupported references, OCR and unknown
notebook output references are reported as issues, not acquired or repaired.
URL-bearing references are not returned verbatim; inventory data omits source
bodies, provider URLs, code, vault details and absolute filesystem paths.

Bounds are 500 queued canonical objects, 2,000 relationship/source rows, depth 4
and 100 displayed issues with an explicit total issue count. Limits report
truncation. The read-only inventory never claims complete portability:
`portableReady` is always false. Its scope is `CANONICAL_MANAGED_FILES_ONLY`, not
an independent copy of the SQLite database, the whole Assignment intellectual
history, all models, or a runnable application package.

`StudStorageManifestPreview` verifies the selected files asynchronously through
`StudStorageProfileService.inspectCanonicalFileAsync`. It yields between 256 KiB
blocks, supports cancellation, checks canonical checksums (including Research
PDF metadata), managed-reference identity, mapping changes and source changes.
It recomputes the catalog fingerprint after inspection and rejects stale scope.
No asset/manifest/Run/event is persisted by preview. Individual missing/tampered
files have typed status without raw filesystem error text. `checkedAt` describes
an inspection snapshot, not a guarantee about future filesystem state.

Selected bytes are bounded to 8 GiB. At most one additional bounded file (64 MiB)
may be inspected to detect that this sum would be exceeded; subsequent files are
explicitly `NOT_INSPECTED_BYTE_BOUND`. The limit test uses a declared verifier
double; it is not an 8-GiB physical copy/performance claim. No operation may be
launched from this preview alone.

### Validation in this checkpoint

- Catalog: 11 checks passed. Includes Course opt-in, cross-Assignment exclusion,
  shared ownership, note→citation traversal, deterministic/stale fingerprints,
  no private URL output, missing managed bytes, six discipline-neutral manual
  Assignment fixtures, restart and honest bounds. The synthetic 620-resource
  fixture returned the bounded 500-object view in observed runs around
  100–160 ms; this is a local observation, not a performance guarantee.
- Preview: 9 checks passed. Includes actual M1/M6/M7/M8 services/records,
  inspectable Evidence identity, event-loop yielding, cancellation, missing
  bytes, tamper, mid-inspection canonical changes, explicit byte-bound omissions
  and restart without fabricated persistent portable state.
- All five storage suites pass: 62 checks total (12 paths + 18 profiles + 12 copy
  + 11 catalog + 9 preview).
- Focused regression passed 14 executable scripts: the five storage suites,
  M1/M6/M7/M8 domains, canonical dispatch, Electron trust boundary,
  CodeQL-targeted security, prebuild integrity and release health. The added
  provenance-pointer check was rerun with both new suites after the final change.
  No failed or skipped script in that selection. This does not re-label the
  earlier inherited Map/SAT outcomes or claim a new remote CodeQL scan.

### Remaining gate before durable transfer approval

The next implementation step is the persistent, explicitly approved transfer
manifest and lifecycle, not another inventory layer. It must validate the
inspected source set again; handle historical-file/unsupported-output omissions
without promising full coverage; preserve shared-reference consequences; reject
stale optimistic versions; and connect actual copying to M6 Runs. Commit the
mapping switch only after all approved copies verify. Interrupted recovery,
rollback and cleanup remain required. The renderer contract must paginate/bound
serialized output rather than blindly exposing the maximum internal catalog.
Research/Moodle/Notebook read-and-write resolver integration, UI, live visual
validation and packaged ARM64 acceptance remain pending. No real user academic
file, real model, app bundle or release was changed by this checkpoint.

## Durable transfer / runtime compatibility checkpoint (2026-09-12)

Continues from `6a56333` on the isolated M14 branch. **M14 is still incomplete.**
The following services are main-only and not registered by Academic IPC or
exposed to the renderer. Existing application construction still uses the local
runtime path; the new adapter is exercised by explicit synthetic test injection.
No user's files, credentials, models or academic database have been relocated.

### Persistent selection and approval

`StudStorageManifestRepository` uses the same canonical SQLite connection.
The unshipped migration 27 now also records:

- selected source/profile optimistic versions and the asset version produced
  by the mapping switch;
- Course-material selection, omitted-file count, total review-issue count,
  inventory truncation and shared-reference count;
- normalized selected canonical source identities/version timestamps and the
  bounded list of review-issue codes/source IDs (maximum 100 displayed issues,
  with the original total retained);
- explicit approval timestamp, forward Run and latest rollback Run identity.
  Every rollback Run also points to its original transfer parent Run, preserving
  previous failed/cancelled rollback attempts in M6 history.

Migrations 1–26 remain unchanged. Previous isolated schema-27 test databases are
disposable development fixtures, not supported upgraded user databases. No
real user database had this unshipped migration applied. Fresh/v26 migration
tests recreate the current schema and retain old academic records.

Preparation validates a user-selected subset against the current bounded
Assignment inventory, reads actual bytes asynchronously and persists immutable
selection facts. Registering a previously unmapped legacy file records its
verified local identity; it does not move it or modify its canonical source.
The prepared fingerprint includes those newly registered storage versions.
Preparation creates no approval, operational Run or navigation event.

Execution requires the current manifest version plus an explicit limited-scope
acknowledgement; shared references require a separate acknowledgement. These
confirmations are main-process validated. Scope or storage changes require a
new preparation/review. No renderer-selected actor, state, SQL, path or persistent
free-form log payload is accepted.

The historical manifest preserves only source identity/version references and
bounded review facts, not canonical document content, provider URLs or private
mount paths. `portableReady` remains false: this is a selected managed-file
transfer, not a claim that an entire Assignment/runtime/model is portable.

### Transfer, cancellation, recovery and rollback

`StudStorageTransferService` composes the existing byte helper and M6 authority:

1. Start an actual M6 `STORAGE_TRANSFER` Run only on explicit execution.
2. Copy selected files exclusively, verify SHA-256, retain destination-copy
   identities, and report real **verified files / selected files** progress.
3. Re-verify originals and destinations; retain temporary file-identity/stat
   receipts and synchronously recheck them before committing the mapping switch.
4. Atomically switch all selected mappings, persist applied asset versions and
   mark the Run completed. No SQLite transaction spans asynchronous file I/O.
5. Retain original bytes. Cancellation/failure before commit leaves old mappings
   authoritative; a transaction failure rolls back every pointer and completion.

There is no pause, ETA, fake percentage or worker scheduler. A Run reaching its
verified-file count still says that the mapping switch is pending. A stopped
M6 Run cannot be reported as a successful transfer or apply its mappings.

Rollback is an explicit new Run. It verifies retained originals, then switches
all mappings transactionally only if the precise applied versions still match.
A later relocation cannot be silently undone (including an ABA return to the
same profile). Failed/cancelled rollback leaves the preceding applied mappings
and preserves its failed/cancelled Run. Target copies are not removed.

The bounded main-bootstrap recovery helper marks unfinished forward transfers
`INTERRUPTED` and fails their real Run without replaying files. Interrupted
rollback leaves the prior `APPLIED` mapping plus `STORAGE_INTERRUPTED` and its
Run history. Recovery must be wired once at main-process startup, not exposed as
a renderer action or called while another instance owns active work.

### Managed runtime adapter

`StudManagedStorageRuntime` is a main-only injected adapter. Research PDF import,
OA save and PDF read; Moodle file save/existence checks; and Notebook dataset
import/read can use the same active mapping. Both read and write paths are
covered; the encrypted vault, SSO, canonical SQLite and model-server ownership
remain outside that adapter.

New content remains local until explicitly relocated. Reimporting identical
bytes reuses their current active profile after hash verification. An offline
external profile produces a typed error and never falls back to the retained
local copy or silently recreates the missing mount. A genuinely missing file on
an available active profile may be restored there by the existing explicit
import/sync path. Existing conflicting bytes are never overwritten.

Imports use exclusive staging/publication and readback; managed reads are
bounded, no-follow regular-file reads with exact digest validation. Canonical
owner checksums and the original filename digest must agree. The adapter cannot
access SQLite/vault files, arbitrary namespaces or renderer-selected paths.

### Technical audit findings addressed

- **MAJOR, fixed:** registering verified legacy assets changes storage fields
  inside the inventory hash. Freeze the prepared post-registration fingerprint
  transactionally, without ignoring later genuine source/mapping changes.
- **MAJOR, fixed:** verifying a later file yields time in which an earlier
  verified file could change. Final file receipts detect covered replacements
  or content changes before the synchronous mapping commit.
- **MAJOR, fixed:** a late cancellation of the authoritative M6 Run must prevent
  the final mapping switch even after all bytes have verified.
- **MAJOR, fixed:** shared canonical owner identity/checksum changes must affect
  scope freshness, not just owner count. The catalog now hashes bounded exact
  owner identity/checksum tuples.
- **MINOR, fixed:** prepared history must remain inspectable after its source
  changes. Persist normalized selected source identities and bounded review
  facts instead of reconstructing approval solely from current records.
- **INFORMATIONAL:** same-user hostile filesystem races are not fully contained
  by a kernel directory capability. No adversarial-FS sandbox claim is made.
- **INTEGRATION GATE:** do not enable deletion/cleanup until all production
  readers and writers use the resolver. Retained originals are still necessary
  for the unmodified production bootstrap at this checkpoint.

### Validation and remaining work

Final checkpoint results, verified 2026-09-13:

- Transfer lifecycle: **28 checks passed**. Includes real synthetic byte copying,
  atomic switch, rollback, stale versions, concurrent-operation bounds, explicit
  shared/limited-scope approval, missing purpose, source/owner drift, late file
  tamper, cancellation before/during final verification, SQL fault injection,
  restart/recovery and retained historical review facts. One transfer and one
  preparation can be active per main-process service; no unbounded copy fan-out.
- Injected runtime compatibility: **9 checks passed** for Research PDF,
  Notebook dataset and Moodle managed-file methods; external reads/writes,
  offline fail-closed behaviour, no local fallback, canonical identity,
  reimport, tamper, namespace rejection and rollback. No provider/SSO call was
  performed by these tests. All seven storage suites pass **99 checks** in total.
- Established regression runner: **96 executable suites passed, 1 failed,
  1 skipped**. The failure is Map: TomTom HTTP 401 and missing AISSTREAM key.
  The absent SAT script is the established explicit skip. Map was independently
  rerun on unchanged integration `89d49b2` and returned the same failures;
  its script/source have no M14 changes. These are not new storage failures.
- The 13 additional STUD suites outside the established aggregate runner were
  run separately: **13 passed, 0 failed, 0 skipped**. Combined: all **72 STUD
  executable suites passed**; across those two selections, **109 passed,
  1 inherited Map failure, 1 SAT skip**. Counts refer to scripts, not individual
  assertions. The updated fresh-database empty-state assertions were separately
  rerun through the profile suite: 18 checks passed.
- Electron trust-boundary checks: **17 passed**; prebuild guard: **4 passed**;
  CodeQL-targeted security checks and release health passed in the aggregate
  run. Syntax checks passed for 14 changed JavaScript files; diff checks passed.
  No new full remote CodeQL scan or live renderer acceptance is claimed here.
- Real disposable macOS volume validation passed again: exclusive copy,
  disconnect, offline rejection, remount identity and SHA-256 readback. Its
  mount location did not change. The temporary image was detached/deleted;
  this is not an Aegis application DMG and no user disk was ejected.
- M6 regression corpus: 100 Courses, 1,000 Assignments, 300 Workflows, 5,000
  Artifacts, 500 Runs and 25,000 Events. Observed artifact lookup 1.8 ms, bounded
  event lookup 8.4 ms and restart hydration 8.4 ms. Fixture construction took
  165.5 seconds; these are local observations, not a performance guarantee.

No live STUD UI, app DMG or packaged acceptance is implied by these tests.

Next implementation: production service ownership/bootstrap and bounded typed
preload APIs, explicit verified-copy cleanup, progressive storage/Assignment
controls, synthetic live visual matrix, full integration audit and final-commit
ARM64 packaged validation. M14 must not be integrated as complete until those
gates pass. No public release, M15 or M16 work was started here.

## Production wiring / Assignment UI checkpoint (2026-09-15)

This supersedes the previous checkpoint's absent-bootstrap status. It is still
**not complete M14 or packaged acceptance**.

`StudAcademicIpc` now owns a single profile/transfer controller and injects
`StudManagedStorageRuntime` into the actual Research, Moodle and Notebook
constructors. Document Intelligence continues to consume Research's bounded PDF
reader. The canonical database, vault, SSO and provider endpoints did not move.

`StudStorageController` registers ten fixed preload operations: profile list,
native choose/reconnect, Assignment catalog, transfer prepare/read/execute/
cancel/rollback and history. No generic path/read/write/log/network operation is
exposed. Catalog/manifest pages contain at most 50 file items; history remains
bounded. Profile responses omit UUID, nonce, mount hint and private root.
The existing exact-local-main-frame IPC wrapper remains authoritative.

Shutdown aborts preparation and transfers before SQLite closure, preventing
late asynchronous writes. On startup, bounded recovery batches mark unfinished
transfers interrupted; they do not copy, replay, delete or switch mappings.
The inspector shows the latest rollback Run even when rollback failed or was
cancelled, rather than displaying the earlier successful transfer as its result.

`StudStorageWorkspace` is browser-only and reached through Assignment → Files &
storage. It presents destination, bounded file selection, native location
options, explicit scope/shared-reference approval, actual Run progress,
cancellation, retained-original restoration and paginated verification details.
Opening it makes no transfer/provider/model request. UI selection is transient.
Assignment-generation guards reject late picker/catalog/cancellation responses;
out-of-order inspections cannot replace a newer selection. Transfer-active
controls cannot switch the operation being inspected. Focus and open disclosure
state survive checkbox rerender; compact mode places the manifest review before
the bounded-scroll file list. Unknown capacity is not represented as zero.

Validation performed:

- `test-stud-storage-ipc.js`: **9 passed**, including exact sender/subframe
  rejection, payload/approval rejection, real production PDF handler reading an
  active external file, typed offline failure, shutdown and actual DB reopen.
- `test-stud-storage-workspace.js`: **14 passed**, including browser-only load,
  escaped labels, truthful progress, explicit approval, stale async responses,
  active history guard and bounded manifest paging.
- Established aggregate regression: **98 suites passed, 1 failed, 1 skipped**.
  The sole failure is Map: TomTom flow segment/tile HTTP 401 and absent AIS key;
  these were independently reproduced on integration `89d49b2` in the preceding
  checkpoint. SAT script absent/skipped. No new subsystem failure.
- **13 additional STUD suites passed**, covering scripts outside the aggregate.
  Thus **74 executable STUD suites passed** across aggregate and extra runs.
  Additional trust-boundary (17 checks), prebuild-integrity (4 checks), and the
  final workspace test rerun also passed. Their duplicated workspace invocation
  is not counted as another independent STUD suite.
- Live development Electron: fixed storage preload works, schema 27, no
  renderer `require`, `process` or `Buffer`; existing trust-boundary live script
  passed after application startup. Terminal connected. This is not a DMG run.
- `validate-stud-storage-live.js`: **132/132 geometry cases passed**: eleven
  synthetic states × Dark/Light/System-dark/System-light × 1680×1050@2,
  1440×900@2 and 1200×780@1. Cases include empty, resting, preparation, determinate
  and indeterminate copying, failure, applied state, cancelled rollback,
  disconnected profile, open verification and 50 long source labels.
  Five sanitized screenshots were captured; dark/light and compact verification
  were visually inspected. These use the production component/CSS in Electron
  but **synthetic operational states**, not evidence of real file transfers.

The first dev launch failed because the `--ignore-scripts` dependency setup left
node-pty's ARM64 spawn-helper without its executable bit. Applying the same
permission/ad-hoc signature treatment already present in `build/after-pack.js`
to this ignored dependency allowed startup; no packaging guard was weakened.
Calendar helper was built from current Swift source. An early live probe before
UI startup reported missing workspace/terminal; rerun after initialization
passed. Neither failed attempt is described as successful launch evidence.

Logs/captures remain outside Git under the developer's test-artifact directory:
`m14-wiring-regression.log`, `m14-wiring-extra-regression.log`,
`m14-wiring-visual.log`, `m14-wiring-visual/` and `m14-wiring-live.log`.
Only synthetic STUD surfaces were captured. No real Moodle files/models moved.

Remaining gates: explicit safe-copy cleanup, derived Artifact file availability,
full operational UI/native-picker acceptance, final integration audit, repeat
affected regressions and a final-commit ARM64 validation DMG mounted and launched.
No public release; no M15/M16 implementation.

## Cleanup, availability and native UI checkpoint (2026-09-16)

Continues from `457a465`. This checkpoint does **not** accept or integrate M14.

### Implemented boundaries

- `StudStorageCleanupService` uses the same SQLite connection and transfer
  exclusion lock. Only an explicitly confirmed retained original from an APPLIED
  manifest is eligible. It verifies the active file, retained file, canonical
  checksum ownership, source/profile versions and final file receipts before
  unlink. No directory scan, model deletion, cache sweep or renderer path API.
- A real `STORAGE_COPY_CLEANUP` Run records verification/removal. The operation
  does not expose pause/cancel controls it cannot implement. Its durable
  VERIFYING → DELETE_REQUESTED → REMOVED journal distinguishes uncertainty:
  interruption or recording failure after unlink remains INTERRUPTED and needs
  inspection. Startup never replays a deletion or invents successful cleanup.
- The unshipped migration 27 now includes cleanup Assignment/manifest/Run
  references, expected asset version, state and indexed history. Migrations
  1–26 remain unchanged. Old disposable schema-27 development fixtures are not
  a released upgrade source; fresh current fixtures were used. Integration
  remains schema 26.
- A new fixed `stud-storage-copy-remove` operation validates the local sender,
  Assignment, exact managed reference, manifest and asset versions, and explicit
  confirmation. Eleven storage channels exist; there is no generic delete API.
- Artifact reads gain `managedFileAvailability` for Documents, Papers, Resources
  and Datasets. Existing canonical availability remains unchanged. Metadata may
  remain available while managed bytes are OFFLINE/MISSING/UNAVAILABLE. Presence
  is labelled NOT_RECHECKED for integrity; real readers still verify their
  boundary. Reads are capped at 100 and share one volume check per profile/page.
  Existing availability filters still filter canonical availability, not this
  derived file status. No Run/event is generated by inspection.
- Mission Control composes real M6 storage Runs even without an M13 plan or when
  an old completed plan exists. It reads the selected Run's own events, refreshes
  actual active work, and rejects stale asynchronous responses after Assignment
  changes. The old statement that no coordinator exists was replaced with an
  accurate direction to the service-specific operation controls.

### Focused verification

The six affected suites passed **88 checks**: cleanup 17, availability 10, IPC 10,
storage view 17, Mission Control view 12 and M13 coordinator 22. Cleanup covers
tampered copies, offline active storage, stale mapping, canonical checksum
conflict, symlink/hardlink rejection, late source mutation, concurrent transfer,
stopped Run, shutdown/restart, and journal failure after unlink. Restart preserves
cleanup history without replay. Availability tests and real production IPC tests
distinguish metadata from bytes and reject unsafe file states.

Established aggregate: **100 passed, 1 failed, 1 skipped** (102 suite scripts).
The sole failure remains Map (TomTom HTTP 401 and absent AISSTREAM key), previously
independently reproduced at integration `89d49b2`. SAT script remains absent and
skipped. Thirteen additional STUD suites also passed on this checkpoint. The
aggregate preceded the final Mission Control copy-only wording change; its
affected view suite was rerun afterward. No new executed subsystem failure.
Local CodeQL-targeted security checks, Electron trust checks, prebuild-integrity
checks, release-health and `git diff --check` pass. This does not claim a remote
CodeQL scan of this unintegrated branch. An initial validation command referenced
a nonexistent `test-release-health.js`; the actual `release-health-check.js` was
then executed successfully, not skipped or represented as the failed command.

### Live native workflow — synthetic data only

The actual development Electron app, current main/preload and production UI were
used. No picker mocks or runtime response fixtures were installed for this flow:

1. Restored the synthetic Assignment using its real Working Context.
2. Workbench → Data → selected the Assignment explicitly → native CSV picker.
3. Imported `synthetic-measurements.csv`: 40 bytes, two columns, three rows with
   values 12.4, 12.8 and 13.1. SHA-256:
   `41da7f69a0de0d2f1ca06a9ba5ff7d677d0852e30d28110b01037a06f671887a`.
4. Assignment → Files & storage → native folder selection registered a synthetic
   archive. The product created its own managed child/marker; no private folder
   or existing academic material was imported.
5. Selected one file, prepared the manifest, explicitly acknowledged limited
   scope and confirmed transfer. The real result was APPLIED, 1/1 verified files.
6. Activity showed the real CREATED/STARTED/COMPLETED events, no workflow or
   Artifact falsely fabricated by the transfer.
7. Reopened the Dataset through `stud-dataset-read`. Then restarted Electron and
   used Continue → Workbench → Data again. The same three values loaded from the
   persisted active location. Manifest history still showed APPLIED.
8. Explicitly selected Verify and restore originals. The persisted transfer
   changed to ROLLED_BACK; the destination copy was retained.

The disposable application-data root itself is on the test drive to avoid SSD
pressure. This validates default-profile/external-profile ownership and physical
file reads, **not** proof of SSD speed or an actual unplugged travel environment.
The earlier disposable-volume test separately demonstrated offline/remount
rejection/recovery. The user's real external drive was never ejected.

The expanded synthetic layout suite recorded **180/180** passing geometry cases
(15 states × four theme modes × three prescribed resolutions/scales), including
cleanup verification, removal history and uncertain interruption. Its screenshots
are layout fixtures, not proof that an operation executed. The cleanup screenshot
was visually inspected; later retention wording is separately checked in the
live UI. No whole-desktop/private-terminal capture is release evidence.

### Audit findings and residual gates

- MAJOR, fixed: composed M13 state hid a real storage Run behind absent/old
  execution plans; selected storage history now uses its actual Run/events.
- MAJOR, fixed: asynchronous Mission Control reads could install old Assignment
  results after context change; generation/selection guards and a regression
  test now reject them.
- MINOR, fixed: unconditional original-retention text became untrue after
  explicit cleanup; wording now points to removal history and rollback limits.
- INFORMATIONAL: filesystem unlink and SQLite cannot commit atomically. Durable
  intent plus explicit uncertainty avoids replay or false success. Same-user
  adversarial filesystem races are not a kernel capability isolation guarantee.
- INFORMATIONAL: canonical metadata availability differs from active-file
  presence and verified content integrity; UI/API keep those separate.
- OPEN ACCEPTANCE GATES: full portable-return/cleanup interaction acceptance,
  final integration audit, final-commit ARM64 app/asar/DMG inspection, mount and
  packaged launch/dependency checks. No final DMG or public release exists for
  this checkpoint. Ollama files remain externally owned and are not claimed as
  copied or portable. M15/M16 have not started.

Evidence logs outside Git: `m14-final-focused.log`,
`m14-cleanup-availability-regression.log`, `m14-cleanup-extra-regression.log`,
`m14-cleanup-security-health.log`, `m14-cleanup-release-health.log`, and
`m14-cleanup-visual.log`. No real Moodle/user files were moved or deleted.

## Mounted ARM64 package and operational checkpoint (2026-09-16)

This is validation evidence, not M14 acceptance or a public release. Runtime
source commit: `14f3431482390ab5ded0f09703f35a184425a0b2`. Documentation and test
probe commits after it are not claimed as the package's source identity.

### Reproducible identity and integrity

- Artifact: `dist/AegisUi-2.7.1-arm64.dmg`, **155,526,873 bytes**.
- A byte-identical external test-artifact copy is named
  `AegisUi-2.7.1-M14-14f3431-arm64-validation.dmg` to distinguish it from a release.
- SHA-256: `3286e0fbb9a266dbe8bc1f248bf807821ebe277a0848434a78c5dad75f818737`.
- The normal prebuild recipe built the Calendar helper, regenerated/minified
  sources and stamped `.aegis-prebuild-manifest.json`; the beforePack guard
  accepted the same source HEAD. Source digest:
  `664f80eebef9f3cd3d7eb016c639e175cc801bae67bbbd37ca9c8f314f195eff`.
  Prebuild digest:
  `0883f1a0dc2c7d57752f909867a1cbc1688e1cf56b175890a02760f9154db87d`.
- Physical ASAR bytes matched prebuild for preload, Storage Cleanup,
  Availability, Controller, Storage Workspace and Mission Control Workspace.
- `hdiutil verify` and `codesign --verify --deep --strict` passed. Main
  executable and node-pty binary are ARM64. Signing is **ad hoc**, not Developer
  ID/notarization. Existing entitlements and `sandbox: false` are unchanged.
- Mounted read-only and launched the executable from the mounted volume, with
  a disposable synthetic profile. The installed application was not substituted.
- Physical minified bootstrap inspection confirmed `nodeIntegration: false`
  and `contextIsolation: true`; the live renderer lacked require/process/Buffer,
  raw IPC and generic filesystem/shell exposure. The typed bridge and schema 27
  were present.

### Packaged runtime verification

`validate-electron-packaged-runtime.js` passed its synthetic canonical-record,
Requirements, Workflow, Working Context, classification, Citation.js, Moodle
status, document/compute capability and connected terminal checks. The probe
explicitly creates synthetic records; it is not described as read-only. The
terminal used the packaged node-pty. The Calendar helper exists in the package
and its packaged helper test passed, without requesting personal Calendar data.

`validate-stud-storage-packaged-read.js` passed before and after a full packaged
process restart. It resolved the actual imported three-row CSV, original SHA-256,
approved manifest, exact source reference and completed Run. Ollama's explicit
health check returned **READY**; no model generation, model-file relocation or
offline model execution was tested by this probe.

`validate-stud-storage-packaged-cycle.js` exercised the **shipped preload/main
boundary**, not replacement services, against only the known unshared 40-byte
synthetic Dataset and the previously native-selected synthetic archive:

1. RELOCATE local → external, with measured 1/1 verified-file completion.
2. Explicit cleanup of the retained local original; active external data still
   read identically. Missing cleanup confirmation was rejected by main process.
3. Rollback after cleanup was rejected, preserving the active file rather than
   claiming that a removed original had been restored.
4. PORTABLE external → local; explicitly removed the inactive external copy and
   repeated the failed-rollback/read-preservation check.
5. RETURN local → external, then verified rollback to the retained local file.
6. Restarted the mounted app. Canonical Dataset, checksum, approved historical
   source and final ROLLED_BACK/COMPLETED state remained readable.

Result: **3 transfers, 2 verified inactive-copy removals, 8 unchanged-data
assertions passed**. The script refuses a different checksum, shared file, extra
file, other profile label, wrong starting location or missing explicit test flag.
It does not invoke providers or models. Existing unrelated background services
are not claimed to have been network-monitored by this test.

This proves the packaged API/file lifecycle. It does **not** prove a human clicked
the corresponding UI controls. Full portable environment remains explicitly
false: canonical SQLite stays on this Mac and Ollama storage is externally owned.
Both test profile roots live on the test volume; no actual SSD speed or physical
travel/unplug scenario is inferred from this cycle.

On 2026-09-17 the previous test process/volume were no longer present. One retry
failed at the CDP connection (`fetch failed`) before any test operation. The same
checksum-verified image was remounted, launched again and the complete cycle and
final read passed again. This failed setup attempt is not counted as a successful
run or attributed to a storage mutation. Native window selection still failed.

### Native UI limitation

Computer-use selection of the mounted application returned `cgWindowNotFound`
and, after a process restart, timed out. Finder selection also timed out. An
unrelated installed AegisUi instance was left untouched. The runtime/CDP tests
above succeeded, but this is **not** a substitute for mounted native visual
acceptance. The earlier 180 layout cases and development native-picker workflow
remain valid only for their documented scope. Do not mark this gate passed.

### Dependency audit and remaining gates

The clean declared-dependency installation reported **31 npm advisories**:
26 moderate, 4 high and 1 critical. All four package manifests/lockfiles remain
unchanged versus integration `89d49b2`; these are not new M14 dependency changes.
That does not make the advisories harmless or dismissed. See
[the dependency reachability checkpoint](../../security/M14_PACKAGED_DEPENDENCY_AUDIT_2026-09-16.md).
In particular, an existing GeoIP download path reaches node-tar in main process;
it is not correctly classified as build-only. No dependency audit fix or
suppression was applied automatically.

Remaining: mounted native visual acceptance, final M14 integration/security
decision including the inherited dependency risk, and clean validated integration.
No public release, no M15, no whole-environment portable readiness claim.

Checkpoint revalidation: **8 suite scripts passed, 0 failed, 0 skipped** — storage
cleanup, availability, production IPC, storage workspace, Electron trust boundary,
CodeQL-targeted security, prebuild guard and release-health. Both new packaged
probe scripts passed syntax checks; `git diff --check` passed. This narrower rerun
does not replace or change the earlier full-regression counts. The new probes
and this documentation change no runtime/dependency/schema code after `14f3431`.

External evidence: `m14-builder.log`, `m14-packaged-trust.log`,
`m14-packaged-runtime.log`, `m14-packaged-storage-read.log`,
`m14-packaged-storage-cycle.log`, `m14-packaged-storage-restart-read.log`,
`m14-packaged-restart.log`, `m14-runtime-npm-audit.json`,
`m14-packaged-checkpoint-regression.log`.

## Dependency remediation checkpoint — 2026-09-17

Continues from `1a97584`; no M15 or product storage expansion. The inherited
dependency gate was investigated and corrected with explicit compatible
versions, including the real Electron binary (42.5.1), PDF.js (6.2.108), GeoLite's
tar (7.5.22), Tiptap peers (3.30.6), nanoid and brace-expansion. Six affected
build-tool dependency families were separately patched within their existing
parent ranges. See the appended [security audit](../../security/M14_PACKAGED_DEPENDENCY_AUDIT_2026-09-16.md)
for reachability, exact versions and residual risks. Application version remains
2.7.1, schema 27; Master PDF and runtime application source unchanged.

- Runtime and build-root npm audits: **0 affected package entries**, exit 0.
  No suppression, no blind audit-fix command, no zero-vulnerability claim.
- New installed-runtime security regression: **6/6 passed**, including a bounded
  compressed-archive rejection through GeoLite's resolved ESM dependency.
- Full established regression: **101 suite scripts passed, 1 failed, 1 skipped
  (103 total)**. Failure is Map provider environment; SAT script is absent.
- Additional checks: Electron isolation **17/17**, prebuild integrity **4/4**,
  Document Intelligence **19/19**; Research/Writing rerun **22/22**, including real
  PDF.js text extraction and Citation.js. These overlap the broad suite and must
  not be added to it as if they were unique suite scripts.
- Live updated Electron: isolation/typed bridge, schema 27 and terminal passed.
- `git diff --check` passed. Master PDF SHA-256 unchanged.

Native computer-use selection again timed out even against the exact freshly
launched development Electron bundle. The app itself reached its connected
renderer and passed its live boundary probe. This separates control-tool failure
from application startup; **native visual acceptance is still not passed**.

The dependency changes require a newly built, inspected and mounted validation
image. The earlier `14f3431` image is historical evidence only. Do not integrate
M14 or claim its final package complete at this checkpoint.

## Final isolated-branch acceptance (2026-09-23)

Source commit `d716429a35895235ff304459f8dc435b27d53e1e` passed the
prebuild-integrity guard with source digest
`27a450be52c243662358f6519dedfacdac792d4274dc1fb29c899a1ac0aa2c89`.
The final transfer fix verifies the source *after* the last copied chunk, so a
same-size edit on a timestamp-coarse external volume cannot be published by a
late progress callback. A dedicated last-chunk tamper case and the revised
final-switch tamper case passed (13 file-transfer and 28 transfer-service cases).

The ARM64 validation image is
`AegisUi-2.7.1-M14-d716429-arm64-validation.dmg`, 154,823,394 bytes,
SHA-256 `1ab36fdb0feda9375af9367cb0f066f55fd8cdd33193ecdfb526dd74c4ee803b`.
It is a local test artifact outside Git, not a public release. `hdiutil verify`
passed; the image mounted at `/Volumes/AegisUi 2.7.1-arm64`. The mounted app
passed `codesign --verify --deep --strict`. It is ad-hoc signed and **not
notarized**. Its executable and unpacked `node-pty` bundle are ARM64. Its
`app.asar` physically contains the final source-verification code and a
prebuild manifest stamped at `d716429`; Citation.js 0.8.2, PDF.js 6.2.108,
Tiptap 3.30.6, Nanoid 3.3.19 and tar 7.5.22 were inspected in the package.
The Calendar helper was verified in the mounted bundle.

The mounted executable was launched with an isolated synthetic user-data
profile, update checks disabled and offline mode requested. Native computer-use
interaction opened STUD → the synthetic Course and Assignment → Academic files.
It selected the 40-byte synthetic CSV, inspected the reviewed manifest,
explicitly confirmed the transfer, observed `APPLIED`, then verified and
restored the retained original and observed `ROLLED BACK`. No real Moodle,
academic, credential or model file was used. After quitting and relaunching
the same mounted executable, the Academic files history still displayed the
actual relocation/portable/return records; the read-only packaged probe
confirmed schema v27, three dataset rows, identical checksum and completed
Run history. This is native UI evidence distinct from the synthetic layout
fixture.

Packaged runtime checks passed: renderer Node/raw IPC absent; fixed preload
bridge; Requirements Contract, Moodle boundary, documents, compute, Citation.js,
terminal/node-pty and Ollama status. Ollama returned `READY`; this probe did
**not** perform model generation. A separate local assistant chat check passed
on both the integration baseline and M14 after one transient timeout. The
synthetic packaged cycle passed three explicit transfers and two cleanup
removals of the approved 40-byte fixture, preserving the checksum and ending
at the local profile. The 180-case renderer layout matrix passed at
1680×1050 @2×, 1440×900 @2× and 1200×780 @1× in Dark, Light and both System
resolutions; the matrix is synthetic UI geometry evidence, not disk-operation
evidence. Representative synthetic images live outside Git. The native app
screenshot contained the local terminal username and was **not saved to the
repository or used as a public artifact**.

Final broad regression: **101 passed, 1 failed, 1 skipped (103 suites)**.
The sole failure was the unchanged external Map check (TomTom HTTP 401 and
missing `AISSTREAM_API_KEY`); SAT/Celestrak was skipped in this environment.
No new M14 regression remained. CodeQL and Repo Health succeeded for
`d716429` (runs `35915443238` and `35915443281`); local CodeQL-security,
runtime-dependency-security, release-health and prebuild checks are included
among the passing suites. `git diff --check` also passed on the integration
documentation changes.

After the merge, the integration worktree's previously installed runtime tree
still contained `tar` 7.5.16. Its first dependency-security rerun therefore
failed the locked-version assertion. Running `npm ci` from the integrated root
and `src` lockfiles restored the declared tree (`tar` 7.5.22); both installs
reported zero audit advisories on 2026-09-23, and the six focused runtime
dependency-security checks then passed. This was stale local `node_modules`,
not an M14 source regression or a skipped security check.
The full 103-suite regression was then rerun on the integrated worktree:
**101 passed, 1 failed, 1 skipped**, identical to the isolated branch. The
remaining failure is solely the independently inherited Map provider check
(TomTom 401 and absent AIS key); SAT/Celestrak remains skipped.

Technical audit: the canonical academic SQLite connection still owns profile,
mapping, manifest and cleanup state; managed objects retain canonical IDs;
M6/M13 remain the real Run/activity authority. Neither a second database nor
renderer-controlled file, SQL, shell or network access was added. Bounded
inventory/history queries, source and destination checksums, exact volume
identity, retained-copy history and fail-closed offline behavior were exercised.
No BLOCKING or MAJOR M14-caused audit finding remains. The important limitation
is deliberate and visible: M14 can make **selected managed academic files**
available on the Mac and return them to an approved external profile, but it
does not move the canonical SQLite database, secrets, app bundle or externally
owned Ollama models. `portableReady` remains false for a *whole Assignment
environment*. This is not a claim of full-machine or model portability.
An independent process can still mutate a file *after* its last integrity
check; subsequent managed reads verify the stored hash and fail closed rather
than consuming changed bytes. M14 does not claim an immutable filesystem.

No public release was created. No M15 work was started.
