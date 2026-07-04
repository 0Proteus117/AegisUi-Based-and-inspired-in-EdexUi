# GitHub workflows

## Repo health

`Repo health` is the automatic workflow for normal development pushes and pull
requests.

It runs lightweight repository checks only:

- checkout;
- Node setup from `.nvmrc`;
- `npm ci`;
- `npm run lint --if-present`;
- `node scripts/release-health-check.js`.

It does not build DMGs, sign macOS apps, notarize, upload packaged binaries or
require private credentials.

## Build packaged binaries

`Build packaged binaries` is now manual-only through `workflow_dispatch`.

Reason:

- macOS DMG packaging is currently validated locally;
- Apple Music Automation depends on stable local app identity;
- ad-hoc signing and optional notarization are local-environment sensitive;
- the previous cross-platform workflow used deprecated GitHub actions and
  created false red checks on every push.

To run it manually:

1. Open GitHub Actions.
2. Select `Build packaged binaries`.
3. Use `Run workflow`.

The current manual workflow performs a packaging preflight and release health
check. Official local DMGs should still be generated on the validated Mac with:

```sh
hdiutil create -volname "EdexUi-Eng <version>" -srcfolder <app> -ov -format UDZO dist/EdexUi-Eng-<version>-arm64.dmg
```

## Local release validation

Before publishing or sharing a build:

```sh
node scripts/release-health-check.js
node scripts/run-regression-checks.js
```

Then open the development app and packaged app locally to validate:

- Assistant / Local AI;
- Apple Music;
- map providers;
- calendar;
- Project Timeline;
- fullscreen map.
