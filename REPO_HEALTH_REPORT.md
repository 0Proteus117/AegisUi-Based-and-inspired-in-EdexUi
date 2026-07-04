# Repo health report

Phase: `v2.1.9`

## Health model

The repository now separates:

- automatic repository health checks;
- manual/local packaged binary creation.

Automatic GitHub checks should prove that the repository is coherent without
attempting environment-sensitive macOS packaging on every push.

## Automatic checks

`Repo health` runs:

- `npm ci`;
- `npm run lint --if-present`;
- `node scripts/release-health-check.js`.

It does not run the legacy root `npm test` script automatically because that
script performs a full prebuild plus Snyk scan and can create false red checks
without local packaging credentials or Snyk authentication.

## Manual local checks

Use:

```sh
node scripts/release-health-check.js
node scripts/run-regression-checks.js
```

Then validate the development app and packaged app locally.

## Current safety checks

`scripts/release-health-check.js` checks:

- root/package version match;
- private memory is ignored and not tracked;
- chat exports are not tracked;
- secrets are not staged;
- Assistant Local AI files exist;
- Apple Music bridge validation files exist;
- map provider files exist.
