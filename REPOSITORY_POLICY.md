# AegisUi repository policy

## Active branch

The active development and release branch is:

`feature/systems-online-pass`

GitHub should show the active AegisUi line by default so visitors see the
current cockpit instead of the archived upstream baseline.

## Release hygiene

- Published releases must correspond to validated source state.
- Draft releases should not be duplicated.
- DMG assets must not be published unless the packaged app was opened and
  validated locally.
- Tags should not be deleted during cleanup work.
- Broken release lines should be documented clearly in `CHANGELOG.md`.

## Workflow hygiene

Automatic checks should stay lightweight:

- install dependencies;
- run lint if present;
- run release-health checks;
- avoid macOS signing, notarization and DMG packaging on normal pushes.

Packaging is manual/local until the macOS identity, Automation and signing path
is fully CI-safe.

## Runtime honesty

AegisUi must not report fake live capability:

- map layers must use real providers or explicit offline states;
- Apple Music must only show `CONNECTED` after a live Music.app call;
- Assistant command routing must remain allowlist-only;
- local AI must report Ollama/model/endpoint failures clearly;
- GearLab must remain isolated unless a future integration is validated.

## Privacy

Never commit:

- `.env` or `.env.local`;
- API keys or tokens;
- private Assistant memory;
- Assistant chat exports;
- generated DMGs/zips;
- audio samples;
- model files;
- local GearLab venvs or generated exports.

## Cleanup rules

Safe cleanup:

- close obsolete PRs that are already superseded;
- delete duplicate draft releases;
- delete failed workflow run records that are historical false reds;
- update repo metadata, topics and docs.

Avoid during hygiene passes:

- deleting tags;
- deleting published releases with real assets;
- rewriting public branch history;
- changing stable runtime modules without a focused task.
