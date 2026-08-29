# STUD M11 — Humanisation with Diff validation

Date: 2026-08-29  
Implementation baseline: `891fb2a98e7187300e3a2f8817441ecf9ce23580`  
Canonical academic schema: v24  
Product authority: `AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf`

## Scope and outcome

M11 adds an explicit, local editorial transformation after an exact immutable
M10 Draft Version. It does not draft autonomously, claim human authorship,
measure human similarity, evade detectors, call cloud AI, alter source Drafts,
or submit academic work. A model response is only a candidate until a user
accepts all or selected Sections. Acceptance creates another immutable M10 Draft
Version; rejection leaves Draft history unchanged.

## Schema v24

Migration 24 is one transactional extension. It adds:

- `stud_humanisation_profiles` and immutable
  `stud_humanisation_profile_revisions`;
- explicit local `stud_humanisation_writing_samples`;
- `stud_humanisation_sessions`, bounded Section candidates and structured
  integrity checks;
- Working Context pointers for the active Profile and Session;
- exact Humanisation Session/Profile revision lineage on accepted Draft
  Versions.

The Session references the exact canonical M10 Draft Version and stores hashes,
protected-span descriptors and candidate text. It deliberately does **not** copy
the source Draft Section text: source text remains owned by the immutable M10
Draft Version. Existing databases migrate v23 → v24 with zero fabricated
Profiles, Sessions, candidates or accepted output. Fresh, restart, representative
v9/v12, v23 migration and rollback paths passed.

## Humanisation Profile and writing samples

Profiles are versioned local style preferences for these discipline-neutral
genres: academic essay, technical report, lab report, reflective writing, case
analysis, research report, presentation script and custom. Genre defaults are
conservative configuration, not inferred authorship. Editing creates a new
immutable Profile revision; duplication and archival preserve history.

Writing samples enter only through an explicit user action. M11 accepts bounded
manual text or an explicitly selected canonical Note, Draft Version or managed
AcademicDocument extraction. It never scans directories, Moodle, Notes or Drafts
for examples. A sample contributes to analysis only after the user confirms
authorship; `UNKNOWN` samples remain excluded. Sample snapshots stay in the
canonical local STUD database and are never sent to a provider. Canonical source
IDs are retained without private paths, tokens or URLs containing credentials.

## Explainable style fingerprint

The fingerprint is deterministic descriptive text statistics: word, sentence
and paragraph counts, sentence range, selected lexical markers, punctuation,
first-person frequency, transitions, lexical variety and repeated trigrams.
It is genre-separated and repeatable. It is not biometric, does not estimate
identity/authorship probability and does not claim the output is human-written.

## Session and local model boundary

A Session snapshots exact Assignment, Draft/Version, Composition Plan
revision/hash, Requirements Contract revision/hash, Profile revision/hash,
selected Sections, scope and editorial goals. Candidate generation is a separate
explicit action. The main process owns the runtime request ID and validates all
IDs, ownership, bounds, lifecycle and optimistic versions.

`StudHumanisationRuntime` reuses the existing fixed Ollama loopback client. The
structured request supplies no tools, shell, filesystem, provider or network
capability. Draft, profile, Evidence and Note text are labelled untrusted data.
The response must contain exactly the requested Section IDs and bounded text in
strict JSON. Missing, malformed, duplicated, forged or oversized output fails
closed. Cancellation aborts the main-owned Session request and leaves no Draft.
There is no cloud fallback.

Runtime observed during validation:

- Ollama `0.31.1`, loopback only;
- installed model: `llama3.2:3b`, Q4_K_M, approximately 2.0 GB;
- exposed M11 capability: `LIMITED_LOCAL_MODEL`;
- quality claim: **none**. This small model has not been validated as adequate
  for high-quality academic Humanisation; every candidate requires inspection.

## Protected spans and integrity

Before model invocation, M11 replaces bounded exact spans with collision-
resistant placeholders. Covered forms include citations, numbers, ranges,
percentages, common engineering units, equations/inline code, quotations,
DOIs/URLs and Figure/Table/Equation identifiers. Every expected placeholder must
return exactly once; missing, duplicate, forged or changed placeholders fail
closed.

After exact restoration, deterministic checks compare citations, numerical/unit
values, quotations, equations, URL/DOI identifiers and protected terms. Reviewed
Claims force explicit review because deterministic text checks cannot prove
semantic equivalence. M8 Claim/Evidence records and citation relationships are
never mutated. Integrity `CONFLICT` disables acceptance. The limitation is
explicit: deterministic checks cannot prove unchanged meaning for arbitrary
natural language, so human review remains authoritative.

## Diff, decisions and lineage

Candidate text remains Session state, not a Draft Version. A bounded word diff
shows additions/removals for ordinary Sections and falls back to bounded line
diff for large inputs. Decisions are explicit:

- reject all: closes the Session and creates no Draft Version;
- accept all: creates a complete child Draft Version;
- accept selected Sections: merges only chosen candidates with untouched source
  Sections and creates a complete child Draft Version.

The new version records parent Version, Humanisation Session and exact Profile
revision. Source and accepted history remain restart-readable. Acceptance,
Session decision, M6 Artifact registration and `GENERATED_FROM` relation are one
SQLite transaction, preventing partial lineage.

## Working Context, Artifact Bay and Mission Control

Working Context may retain active Profile and Session after canonical ownership
validation. Context changes start no model/provider action. Opening Humanisation
also starts nothing.

Only the real local-model request creates an M6 Run. It is
`INDETERMINATE`; M11 fabricates no progress, percentage, ETA or activity. Profile
and Session CRUD create no Runs. An accepted Draft Version is registered in
Artifact Bay as `MODEL_GENERATED` and related to the exact source Version.

## Security and privacy

- Electron remains `nodeIntegration: false`, `contextIsolation: true`.
- Eighteen fixed M11 IPC channels are allowlisted; raw `ipcRenderer`, generic
  SQL/filesystem/shell/network/model endpoint access are absent.
- Renderer cannot forge Profile origin, AI origin, integrity state or runtime
  request identity.
- Main process validates sender, Assignment/Draft/Version/Section/Profile/
  Session ownership, payload bounds, transitions and optimistic versions.
- No sample harvesting, telemetry, cloud fallback, secret logging, private path
  persistence or public/private academic fixture mixing was introduced.
- Public-safe validation used synthetic content only.

The repository CodeQL-focused and Electron trust-boundary tests pass. A live npm
audit on 2026-08-29 reported pre-existing transitive/dependency advisories in the
unchanged dependency graph (including `tar`, `brace-expansion`, `undici`,
`pdfjs-dist`, `nanoid`, `fast-uri`, `js-yaml` and Electron 42.4.1). M11 adds no
dependency and does not change those packages; remediation requires a separate
dependency-upgrade compatibility pass and is not disguised as an M11 result.

## Bounds and scale

Validated synthetic corpus:

- 100 Courses;
- 1,000 Assignments;
- one immutable source Draft;
- 200 Profiles / 400 Profile revisions;
- 3,000 Humanisation Sessions.

Observed local timings in the validation worktree were approximately 5.77 ms
for 50 Profiles, 8.64 ms for 50 recent Sessions, 1.33 ms for one candidate,
8.50 ms for 12-sample fingerprint analysis, 1.04 ms for normal M10 Assignment
composition state and 0.07 ms for bounded restart hydration. These are local
observations, not performance guarantees. Ordinary Assignment load did not
hydrate Humanisation history.

## Live visual validation

Actual Electron 42.4.1 was launched with isolated temporary user data and the
actual M11 renderer/CSS. Synthetic scenarios covered no Profile, genre/default
entry, candidate ready, integrity pass, numeric conflict, long Section, limited
model message, accepted history and rejection.

Passed:

- Dark, Light, System→Dark and System→Light;
- 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x;
- no horizontal overflow, escaped controls or clipped primary actions;
- conflict visible textually and acceptance disabled;
- progressive Profile controls and Session history remain collapsed at rest;
- no raw prompt, model debug data, fake score or card-wall regression.

Screenshots were kept as local validation artifacts only and contain synthetic
data.

## Tests and regression

M11 focused validation:

- domain/migration/security/integrity: 33 passed;
- typed IPC/preload: 10 passed;
- renderer/UI contract: 5 passed;
- scale: passed;
- visual matrix: 8 scenarios passed.

Full STUD regression: 55 executable suites passed, 0 failed. Broad Aegis
regression: 39 executable suites passed; one inherited environment suite failed
because TomTom returned HTTP 401 and `AISSTREAM_API_KEY` was absent. RainViewer
and Open-Meteo Marine checks remained operational. Release health, CodeQL
hardening, Electron trust boundary, Calendar helper, node-pty packaging,
prebuild integrity and `git diff --check` passed.

## M1–M11 technical audit

### BLOCKING

None remaining.

### MAJOR — fixed

1. Source Draft Section text was initially duplicated in Session persistence.
   Removed: Sessions now resolve the exact immutable M10 Version and verify its
   stored hash.
2. Renderer-selected runtime IDs could make active cancellation target a
   different controller. Removed: the main process uses Session ID; concurrent
   cancellation regression passes.
3. Accepted Draft/session state could commit before Artifact Bay lineage and
   expose a partial success if Artifact registration failed. Fixed by one
   transaction covering accepted version, decision and Artifact relationship.
4. Older current-schema regression fixtures remained pinned to v23. Updated to
   v24 and the representative v9/v12 reconstruction now removes v24 tables
   before replaying migrations.

### MINOR

- Protected-span recognition is deliberately conservative and cannot cover
  every discipline-specific notation. Unrecognised semantic changes remain a
  human-review responsibility.
- The installed 3B model is capability-limited and unsuitable for a quality
  claim.

### INFORMATIONAL

- M11 preserves model-agnostic Profile/Session contracts for a future stronger
  local model but does not implement model routing or installation.
- Manual rich-text editing remains the existing M10 plain Section editor; M11
  does not implement the later rich-text overhaul.

No duplicate Draft authority, cloud fallback, fake M6 progress, cross-Assignment
leakage, renderer-controlled integrity, source mutation or M11-caused
BLOCKING/MAJOR finding remained after correction and rerun.

## Packaging decision

M11 extends preload and the local-AI runtime boundary, so private ARM64 packaged
validation is required. The final validation records the DMG filename/hash,
`app.asar` inspection, mount/launch, signature, Citation.js, Calendar helper,
node-pty architecture, terminal and renderer isolation. No public release is
created for this incremental milestone.

## Boundary

M12 Lecturer Committee, grading estimates, correction loops, submission/export,
worker scheduling, model routing, detector scoring/evasion and cloud fallback
are not implemented. The next product milestone remains M12 — Lecturer
Committee and Corrections.
