# Pre-M14 execution dispatch hardening

Baseline: `78811907da3a54bbaeec7a26e60008e69b72bca3`, STUD schema 26,
application 2.7.1. This intervention does not claim M14 completion.

## Confirmed defect and correction

`StudRunCoordinator.classifyNode()` used case-insensitive title substrings to
select executable handlers. The public Workflow rename operation could therefore
change dispatch (including manual/model-driven classification). Titles are user
presentation data, not operation identity. This did not provide arbitrary code
execution: handlers remained fixed and launch/model/input gates still applied.

Dispatch now depends on canonical stage semantics, the immutable template node
key, or a user's explicit canonical Section/Session selection:

- Template `drafting` + WRITING retains the Section draft handler after renaming.
- Composition planning and untyped manual writing are not implicitly drafting.
- An explicit Section selects bounded drafting only on a WRITING stage.
- An explicit Session is resolved by exact ID and Assignment against the fixed
  M11/M12 canonical tables. Its actual type chooses humanisation, academic review
  or correction. Editorial/correction Sessions require WRITING; academic reviews
  require REVIEW. Ownership, state and snapshot validation remain in the
  existing canonical services. Ambiguous, missing, foreign or incompatible
  references fail closed; Section and Session cannot both be supplied.
- REVIEW without a Session retains the deterministic canonical-input check.
- Human, finalisation and external stages remain gates, regardless of title.

There is no new renderer-controlled handler field, IPC channel, network call,
schema migration, model download or automatic execution. Preparing a plan remains
non-operational. Existing typed input selectors are reused without UI changes.
The real-model acceptance harness now explicitly selects the Section for its
user-created WRITING stage; it no longer relies on an English title.

The selected handler identity already persists in M13 Execution Steps. Prior
results remain untouched. Before pending work executes/resumes, dispatch is
revalidated against canonical inputs. A mismatched historical preflight requires
rebuilding, not silent reinterpretation. The existing topology guard still
requires a new preflight when a stage is renamed after plan creation.

## Regression contract

`scripts/test-stud-execution-dispatch.js` covers translated/adversarial labels,
template identity, manual non-promotion, explicit input, protected human gates,
invalid selection, real Workflow rename, unchanged input hashes, restart,
historical dispatch mismatch and absence of operational/provider side effects.
The M13 integration suite executes the existing M11/M12 services with renamed
Spanish stage labels and a clearly synthetic model double.

The broad regression aggregator now includes the dispatch suite. Repository
health CI adds a deterministic domain job using declared `src/package-lock.json`
dependencies, Node 24, and no native install hooks. It includes M3/M4, dispatch,
M13 domain/integration/IPC/UI and CodeQL-targeted security regression. This is not
a replacement for CodeQL analysis, native builds or real-model acceptance.

## Boundaries retained

The model probe remains a bounded protocol/capability check, not an academic
quality evaluation. The installed model's previous `NO_SUITABLE_MODEL` result is
not overridden. Full product acceptance remains M16. M14 is storage/portability,
not model-quality certification or a global UX redesign.

## Validation

On Node 24.19.0 the focused validation passes 164 checks: dispatch 11, M13
domain 21, integration 13, IPC 10, UI contract 8, M3 DAG 39, M4 conditions 34,
CodeQL-targeted security 7, Electron trust boundary 17 and prebuild guard 4.
Release health and `git diff --check` pass. The new dispatch and integration
tests also pass without `NODE_PATH` after a fresh declared-dependency install
in this worktree (`npm ci --prefix src --ignore-scripts`: 202 packages).
Native install hooks were intentionally not run for these pure Node domain
checks; this is not a native/package validation claim.

The full 65 `test-stud-*` suites pass, including M1–M13 domain, IPC, UI contracts,
Moodle, Documents, Research, Revision, Compute, Notebook and scale scenarios.
The additional cross-Aegis selection passes 37 scripts. Map fails identically
on the unchanged integration baseline: TomTom HTTP 401 and absent AIS key.
The SAT script is absent in both trees (the established aggregator skips it;
an initial direct invocation reported module-not-found, not a product regression).
Two exploratory invocations used nonexistent Research/Revision script names;
the actual `test-stud-research-writing.js` and `test-stud-revision-planning.js`
were subsequently executed and passed. These invocation mistakes are not
counted as passed tests or hidden product failures.

M6 scale retained 5,000 Artifacts / 25,000 Events with Assignment artifact lookup
1.6 ms and Mission lookup 16.9 ms in the observed run. M13 scale passed with
1,000 Plans / 10,000 Steps / 20,000 attempts; these are local observations, not
performance guarantees. No UI,
preload, startup, native helper or dependency declaration changed; no new DMG or
public release is required for this correction. No live model quality or full
academic acceptance is claimed. GitHub CI/CodeQL results must be checked after
push; a local targeted security suite does not constitute a CodeQL scan.
