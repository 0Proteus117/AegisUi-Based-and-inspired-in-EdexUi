# Weekly stability freeze

Status: prepared after `v2.1.9 GitHub hygiene and workflow cleanup`.

## Stable local baseline

- App version: `v2.1.9`
- Main development branch: `feature/systems-online-pass`
- Local build target: macOS Apple Silicon
- Bundle id: `com.edex.ui.eng`
- Product name: `EdexUi-Eng`

## Freeze rule

During the pause:

- do not start new feature branches unless there is a clear hotfix;
- do not touch map providers, Apple Music, Assistant runtime, calendar or
  Project Timeline without a regression plan;
- do not change packaging identity;
- do not commit private memory, `.env`, `.env.local`, API keys, audio samples,
  model files or local chat exports.

## Resume checklist

Before new development:

```sh
node scripts/release-health-check.js
node scripts/run-regression-checks.js
```

Then open the dev app and packaged app locally.
