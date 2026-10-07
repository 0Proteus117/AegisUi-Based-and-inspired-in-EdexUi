# UX-3 — connected manual workbench slice

Date: 2026-10-07. Base: `672318b6729020bc6241a7572fc597a93129e3e7`.
Branch: `codex/stud-ux3-workbench`. Application 2.7.1; academic schema 29 unchanged.

This is a connected manual-writing delivery, not completion of the automatic
Assignment pipeline. UX acceptance with the user, UX-4, M16 closure and integration
remain separate. No Map/God's Eye work, release or university submission.

## Implemented path

Year → subject → Assignment → Open workbench → Work myself.

- The Assignment opens with two clearly differentiated paths. Manual work is
  actionable; full AI work is explicitly unavailable, with the concrete reason
  shown. It does not create an execution plan or pretend that research started.
- Requirements remain M1-owned. Without reviewed requirements, material and notes
  are available, but draft creation points to the existing review surface.
- An outline is explicitly prepared, headings added, and the human confirms
  review before a canonical M10 Draft is created. Proposed headings are not
  generated academic writing. Incomplete requirements retain their honest state.
- One main writing area; Material, Notes and Requirements open only on request.
  Empty source categories are not rendered. Selecting material reuses M5 preview
  and M2 validation. Related sources are not inferred from names.
- Save creates a new immutable M10 Draft Version. Prior versions remain stored.
  Review & export passes that exact saved version to the M15 package selector.
  It never selects a different draft just because it was updated more recently.
- Package creation, citation inspection, approval and native selected export
  remain the existing M15 operations. No approval is inferred from writing or
  from opening this screen. Advanced specialists remain accessible, folded away.

## Implementation and authority

`StudManualWorkbench` is a renderer-only presentation/controller composed into
`StudAssignmentWorkspace`. It calls only existing fixed typed main APIs for
requirements, composition, draft versions and Working Context. `ui.html` loads
the component before its owner. No preload/main/native/dependency/schema change.

The current reviewed composition plan is preferred over an unreviewed successor.
Only drafts belonging to that exact plan can appear in the simple writer. This
prevents combining old Draft identity with a new outline's section IDs. The
advanced composition surface remains available for plan revision/history.

M2 remains context authority. Source preview preserves the active composition,
section and draft references; saving writing retains the current source where
valid. The main process still validates these relationships.

Unsaved writing is transient memory, not a second database: at most eight edited
drafts, 120,000 characters per section, one million characters combined. Buffers
retain their original expected row version even after a refresh. A stale save
fails without dropping or silently rebasing the user's text. Navigation between
Assignments retains those session buffers; restart restores only explicit saves.
The UI tells the user to save before closing Aegis. It is not an autosave feature.

An unsaved contextual Note blocks button navigation out of its editor until the
user saves or explicitly discards it. A failed Note save keeps the form instead
of replacing it with old canonical text. Notes still use the existing structured
editor, relationships and main-process save operation; no duplicate note store.

## Technical audit

| Finding | Severity | Resolution |
| --- | --- | --- |
| Rerender/panel changes could erase unsaved writing | MAJOR | Bounded session buffers; explicit versioned save; stale-write regression |
| New draft outline could be mixed with an older reviewed Draft | MAJOR | Match Drafts to the explicit reviewed plan identity |
| Final package selector could default to another, newer Draft | MAJOR | Exact version handoff; missing bounded choice requires explicit selection |
| Closing the new Notes panel could discard unsaved note edits | MAJOR | Navigation guard with explicit save/discard; failed save preserves editor |
| Empty material categories overwhelmed source inspection | MINOR | Compact source selector; existing canonical preview reused |
| Full automatic research-to-draft pipeline is not connected | INFORMATIONAL / product gate | Remains UX-4 work; no fake start, progress or preview |

No new storage or execution authority; no ordinary writing action creates a Run.
Input text and source labels remain escaped. No shell, filesystem, network,
provider/model invocation or generic IPC bridge was added to the renderer.

## Validation evidence

- `test-stud-manual-workbench.js`: 24 checks, including canonical writes, stale
  save preservation, restart hydration, five discipline-neutral manual cases,
  source drift/incomplete state, and no renderer Node/provider authority.
- `test-stud-final-package-workspace.js`: 11 checks, including exact version
  selection and an out-of-range version that must not silently fall back.
- Real Electron `validate-stud-ux3-live.js`: 120/120 geometry/scenario checks;
  Dark, Light, System→Dark, System→Light at 1680×1050 @2x, 1440×900 @2x and
  1200×780 @1x. No horizontal overflow, escaped controls or renderer exceptions
  in the tested states. Synthetic STUD-only screenshot crops inspected.
- Live path: actual navigation, outline addition/review, draft creation, writing,
  canonical material handoff, structured Note save, immutable draft save, exact
  package-version selection, package preview, concurrent-write rejection.
  Reviewed requirements were explicitly seeded using the typed API as fixture
  setup; this is not evidence that the old M1 UI has been redesigned.
- Actual Electron process restart plus fresh renderer load: 11/11 assertions;
  exact Draft ID, saved Version ID and content restored; save/export controls
  react to edits; unsaved contextual Note protected from tool navigation.
- Real unit/integration package export uses a temporary native-dialog-selected
  directory fixture and verifies the written review copy and Citation.js source
  identity. The live UI exercised package creation/preview, not a native export
  picker or institutional submission.
- Local evidence is outside Git under `AegisUi-test-artifacts/ux3-manual-workbench/`.
  Screenshots, profiles, logs and academic data are not committed.

Final broad regression: **121 passed, 1 failed, 1 skipped / 123 scripts**.
The failure is `test-map-providers.js`: TomTom HTTP 401 and absent AISSTREAM key;
the SAT/Celestrak check is skipped by the existing runner policy. These match the
UX-2 baseline and were not changed. Release health, 17 trust-boundary checks,
7 CodeQL-targeted hardening checks and the prebuild integrity suite passed.
This is not a new GitHub CodeQL server scan. Syntax and `git diff --check` passed.

Two earlier broad runs each had 120 passed,
2 failed, 1 skipped (123 scripts): Map provider environment failures and a local
Ollama chat timeout. An isolated Ollama retry passed. Do not represent those runs
as all-green or infer academic drafting capability from a chat smoke test.
The closure run, after closing synthetic Electron, passed the Ollama check;
the intermittent timeout and its unresolved load sensitivity remain disclosed.

## Limits and next task

- The simple surface reads up to 25 Drafts for the Assignment, 20 versions of the
  selected Draft and 60 material choices from the existing bounded M5 context.
  It does not globally hydrate the database. Older records remain stored.
- Citation placement, detailed evidence review, advanced outline editing and
  final package inspection retain their existing specialist surfaces. They are
  not yet all simplified. UI acceptance remains pending the user's review.
- Live source fixture was a canonical Resource, honestly reporting when no
  embedded preview exists. No new PDF reader or unrestricted browser was added.
- No real Moodle sync, private material or institutional account used for UX
  screenshots. No local model installation, live academic generation, streaming
  preview or automatic research acceptance is claimed.
- No validation DMG: renderer presentation and existing-channel handoff only;
  no preload, main startup, signing, native helper, dependency or packaging
  contract changed. Existing prebuild guard remains required and tested. This
  delivery is not packaged-app validation and is not a new installed build.

Next: user review of this connected manual path, then UX-4's bounded automatic
execution and genuine operation/content preview. The earlier rejected standalone
workbench mockup is not acceptance evidence. Do not start Map or close M16 from
this document.
