# GitHub hygiene report

Phase: repository cleanup after AegisUi/GearLab comparison

## GearLab reference

- Repository inspected read-only: `0Proteus117/aegis-gearlab`
- Visibility: private
- Default branch: `main`
- Latest release observed: `Aegis GearLab 1.12.0`
- Draft releases observed: none
- Topics observed: `cad`, `cadquery`, `fastapi`, `gears`, `macos`,
  `mechanical-engineering`, `opencascade`, `python`, `step`
- Style notes: focused README, published release line, per-version reports,
  architecture docs, validation reports and explicit honesty around unsupported
  geometry.
- Remote modifications applied to GearLab: none.

## AegisUi state before cleanup

- Repository: `0Proteus117/AegisUi-Based-and-inspired-in-EdexUi`
- Visibility: public
- Default branch before cleanup: `master`
- Active development branch: `feature/systems-online-pass`
- Latest active commit inspected: `d8ff9be v2.2.8 sync manifest and isolation tests`
- Open PRs before cleanup: 0
- Draft releases before cleanup: 8
- Historical false-red workflow runs before cleanup: present

## Problems found

- GitHub default branch pointed to `master`, not the active AegisUi line.
- README still opened with upstream GitSquared/eDEX badges, download links and
  archived-project messaging.
- Issue template still linked to GitSquared discussions.
- Funding config still referenced upstream funding.
- CodeQL workflow used old action versions and only watched `master`.
- Duplicate draft releases cluttered the Releases page.
- Historical failed packaging runs cluttered Actions with false red status.

## Actions applied in source

- Replaced README with a clean AegisUi-focused repository front page.
- Added `REPOSITORY_POLICY.md`.
- Modernized CodeQL workflow.
- Kept `Build packaged binaries` manual-only.
- Focused `Repo health` on the active branch.
- Refreshed issue and PR templates.
- Removed stale upstream funding config.
- Updated this report and workflow documentation.

## Remote cleanup policy

Applied only to AegisUi:

- delete duplicate draft releases by release ID;
- delete historical failed workflow runs once the latest Repo health run is
  green;
- update repository metadata/topics/default branch.

Not applied:

- no GearLab changes;
- no tag deletion;
- no published release deletion;
- no branch history rewrite.

## Expected final state

- Open PRs: 0
- Duplicate drafts: 0
- Latest automatic check: green Repo health
- Packaging workflow: manual-only
- Default branch: active AegisUi branch
- README: AegisUi-branded, not upstream eDEX-branded

## Local validation

- `node scripts/release-health-check.js`: OK
- `node scripts/run-regression-checks.js`: expected local warning/fail in the
  temporary clean clone because private bootstrap memory and AIS credentials are
  intentionally not copied into `/tmp`.
- Apple Music bridge static/runtime checks: OK inside the regression run.
- Assistant/Ollama, ENG registry/router/calculators and GearLab isolation
  checks: OK inside the regression run.
