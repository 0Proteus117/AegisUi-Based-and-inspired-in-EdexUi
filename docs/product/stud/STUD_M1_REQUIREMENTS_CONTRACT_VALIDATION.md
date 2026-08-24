# STUD M1 — Reviewed Requirements Contract

## Scope and result

M1 implements the reviewed Requirements Contract described by the Master
Specification and the audit refinements in the target architecture. It does not
implement M2 working context, a workflow DAG, Mission Control, model routing or
any university write/submission action.

The implementation advances the canonical STUD SQLite schema from v14 to v15.
Existing Assignments migrate with no contract pointer and no fabricated
requirements, review, approval, provenance or progress.

## Runtime architecture

- `StudAcademicStore` remains the sole SQLite connection/migration owner.
- `StudRequirementsContractRepository` owns normalized v15 persistence against
  that existing connection.
- `StudRequirementsContractService` owns candidate generation, lifecycle,
  approval, source freshness and optimistic concurrency.
- `StudAcademicIpc` exposes only named Requirements Contract operations. The main
  process validates sender, IDs, allowed fields, transitions and expected row
  version; the renderer receives no SQL, filesystem, network or shell authority.
- `StudRequirementsContractWorkspace` is renderer-only and contains no direct
  Node, SQLite, filesystem or network access. It is ready to move behind the
  planned typed preload boundary.

## State and revision contract

Lifecycle (`DRAFT`, `APPROVED`, `SUPERSEDED`), completeness (`COMPLETE`,
`INCOMPLETE`, `CONFLICTING`) and freshness (`CURRENT`, `SOURCE_CHANGED`,
`SOURCE_MISSING`, `OCR_BLOCKED`, `NEEDS_REVIEW`) are independent.

Approved semantic content is immutable. Editing an approved revision creates a
new draft. Approval computes a deterministic canonical SHA-256, supersedes the
previous current revision and updates the Assignment's explicit current-contract
pointer transactionally. Mutations carry `expectedVersion`; stale operations fail
with `STALE_CONTRACT_VERSION`.

A new revision carries forward explicit user-entered requirements, but regenerates
source-derived candidates against current bounded evidence and returns them to
`PENDING`. This prevents stale source snapshots from making a drift-review draft
impossible to approve or silently treating old evidence as newly reviewed.

Normal approval requires a fully reviewed and resolved contract. Explicit
`APPROVE AS INCOMPLETE` preserves unresolved information and records the decision
without claiming completeness.

## Candidate generation and provenance

The deterministic extractor produces review candidates only. It inspects bounded
canonical Assignment fields/observations and linked, indexable AcademicDocument
chunks. A generation run records linked/indexable/inspected documents,
OCR-required documents, inspected chunks, bounds, truncation and candidate count.
No match is not interpreted as confirmation that no requirement exists.

Candidate disposition (`PENDING`, `INCLUDED`, `EXCLUDED`, `UNRESOLVED`) persists
per revision. Excluded candidates remain queryable review history.

Document sources retain AcademicDocument, extraction and chunk IDs, page range,
content hash and version/snapshot hashes. Assignment/Moodle sources retain the
canonical entity/field plus existing provenance and stable external identifier
where available. Presentation labels are not provenance authority.

Freshness compares approved source snapshots with the current canonical
observation/extraction. Drift or loss updates only the independent freshness
record; the approved revision and fingerprint do not change.

## UI contract

The Assignment surface uses progressive disclosure:

- a no-contract state with one explicit review action;
- a review list with confirmed requirements and persistent candidate disposition;
- a contextual source preview with page/chunk provenance;
- collapsed manual/edit/coverage controls;
- distinct normal and incomplete approval paths;
- an immutable approved summary with revision, timestamp, completeness,
  unresolved count and fingerprint;
- source-change review state without rewriting historical content.

Dynamic content remains in normal flow. The review/source grid collapses to one
column at compact widths. Closed disclosure panels explicitly remove their
internal controls from layout; open edit forms span the row.

## Validation evidence

Focused automated validation ran 21 STUD scripts with 361 checks: 361 passed, 0
failed, 0 skipped. M1-specific coverage comprises 33 repository/service/schema
checks and 9 typed IPC checks.

The broad aggregator ran 49 scripts: 47 passed, one inherited Map-provider script
failed because TomTom returned HTTP 401 and `AISSTREAM_API_KEY` was absent, and
the SAT/Celestrak script was skipped by its established environment gate. No new
regression failed.

Security/static validation passed:

- CodeQL hardening contract: 7 checks;
- prebuild-integrity guard: valid manifest plus source, prebuild and HEAD drift
  rejection;
- release health;
- JavaScript syntax checks for every modified script/runtime file;
- `git diff --check`.

Live Electron validation used synthetic/public-safe data and the current source,
not a browser-only mock. The following matrix passed with zero escaped controls,
zero horizontal overflow, zero contract overflow and zero overlapping row/action
bounds:

| Appearance | 1680×1050 @2x | 1440×900 @2x | 1200×780 @1x |
|---|---|---|---|
| Dark | no contract | candidate review | conflicting evidence |
| Light | incomplete approval | approved contract | source changed |
| System → Dark | long content | candidate review | approved contract |
| System → Light | source changed | conflicting evidence | long content |

Compact open-edit layout was additionally validated in Dark and Light at
1200×780. States covered no contract, candidate review, confirmed/unresolved
requirements, conflicting evidence, exact source preview, incomplete approval,
approved immutable revision, source drift and long source/requirement content.

## Packaging decision

M1 changes renderer/model/UI code and named main-process IPC registration but does
not change preload, packaging, startup, native helpers, entitlements or bundled
runtime dependencies. No DMG or release was generated. The existing deterministic
prebuild/package guard remains tested and unchanged.

## Next task

`Electron Trust-Boundary Hardening intervention`

Only after that intervention: `M2 — Academic Organisation / Working Context`.
