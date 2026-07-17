## Scope

- [ ] Code/docs only
- [ ] UI/runtime change
- [ ] Packaging/release change
- [ ] GitHub hygiene / workflow change

## Validation

- [ ] `node scripts/release-health-check.js`
- [ ] `node scripts/run-regression-checks.js`
- [ ] Dev app opened locally, if runtime changed
- [ ] Packaged app opened locally, if packaging/runtime changed

## Safety

- [ ] No `.env` / `.env.local`
- [ ] No private memory
- [ ] No chat exports
- [ ] No generated DMGs/zips/models/audio
- [ ] No unrelated stable module changes

## Notes

Describe what changed and anything intentionally left manual/local.
