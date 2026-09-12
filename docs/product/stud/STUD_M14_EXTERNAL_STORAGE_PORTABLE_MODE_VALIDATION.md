# M14 — External academic storage and portable mode

Status: IN PROGRESS — not accepted, not integrated, no release.
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
