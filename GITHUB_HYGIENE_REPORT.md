# GitHub hygiene report

Phase: `v2.1.9 GitHub hygiene and workflow cleanup`

## Repository state

- Working branch: `feature/github-hygiene-workflow-cleanup`
- Main development branch: `feature/systems-online-pass`
- Stable base commit: `2859c4a v2.1.8 release version bump`
- Remote: `https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi.git`

## Workflows before cleanup

- `Build packaged binaries`
  - Active.
  - Triggered on `push`, `pull_request` and `create`.
  - Repeatedly failed on normal development pushes.
  - Latest inspected failed run: `28709006724`.
  - Observed root cause: legacy packaging workflow used deprecated GitHub
    Actions (`actions/cache@v2`, `actions/upload-artifact@v2`) and attempted
    cross-platform binary packaging on every push.
- `CodeQL`
  - Active.
  - Runs on `master` only plus schedule.

## Workflow actions applied

- Converted `Build packaged binaries` to manual-only `workflow_dispatch`.
- Replaced automatic packaging jobs with a manual packaging preflight.
- Added `Repo health` automatic workflow for push/PR lightweight checks.
- Added `scripts/release-health-check.js`.
- Added `scripts/run-regression-checks.js`.
- Added `GITHUB_WORKFLOWS.md`.

## Pull requests before cleanup

Open PRs before: 7

- `#1 feat: native Apple Silicon (arm64) macOS build`
- `#2 [codex] Modernize eDEX-UI for native Apple Silicon`
- `#3 [codex] Create the first functional EdexUi-Eng dashboard`
- `#4 [codex] Add Engineering Dashboard Sprint 1`
- `#5 [codex] Add visual Project Control center`
- `#6 [codex] Fix Calendar with native week and month views`
- `#7 v1.4 Workspace architecture foundation`

All were old v1.x development lines, conflicted/unstable/dirty relative to the
current repository state, and are superseded by `feature/systems-online-pass`
and later v2.x builds.

## Pull request actions applied

Closed PRs: 7

Close comment used:

```text
Closed as superseded by the current feature/systems-online-pass development
line and later v2.x builds. Branches/tags are left intact; no source history
is deleted.
```

Branches deleted: none.

## Releases before cleanup

Draft releases before: 8

- duplicate draft `v1.1.0` entries;
- duplicate draft `v1.2.0` entries;
- duplicate draft `v1.3.0` entries;
- duplicate draft `v2.2.8` entries.

Published/pre-release historical builds were also present for:

- `edexui-eng-v1.0.0`;
- `edexui-eng-v1.1.0`;
- `edexui-eng-v1.2.0`;
- `edexui-eng-v1.3.0`.

## Release actions applied

Draft releases deleted: 0

Reason:

- every duplicate draft inspected had assets attached;
- the cleanup rules explicitly avoid deleting release artifacts when there is
  uncertainty or useful historical content;
- no tags were touched.

Tags touched: none.

## Risks

- Existing historical draft releases remain visible because they contain
  assets.
- Past failed workflow runs remain in GitHub history, but new normal pushes
  should no longer run the old packaging workflow.
- `Repo health` intentionally avoids DMG packaging and notarization.

## Actions not applied

- No tags deleted.
- No release assets deleted.
- No remote branches deleted.
- No app feature code changed.
- No map, Apple Music, calendar, Project Timeline, Assistant runtime or command
  router code changed.
