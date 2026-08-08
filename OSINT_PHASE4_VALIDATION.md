# OSINT Phase 4 Validation

Automated validation covers case/evidence schema boundaries, trusted storage
root behavior, redaction before SHA-256 calculation, invalid-integrity
detection, case/evidence notes, archive/removal confirmation, JSON/Markdown
exports, reference-only blocking, IPC sender/payload/path boundaries, dialog
flow and static UI accessibility hooks.

Run the focused suite with:

```sh
node scripts/test-osint-cases.js
node scripts/test-osint-case-ipc.js
node scripts/test-osint-case-ui.js
node scripts/test-osint-case-layout.js
```

Then run `node scripts/run-regression-checks.js` and
`node scripts/release-health-check.js`. The inherited clean-worktree map
warnings (TomTom credentials, AIS key and skipped SAT) are documented outside
the OSINT Phase 4 result and are not changed by this feature.

Manual validation includes catalog/Tool Access, Wayback result, new/edit/archive
case, preview/redaction, evidence detail/verify/note/export, reference-only
blocking, light/dark/system themes, responsive view and packaged DMG behavior.

The subsequent focused layout-integrity pass is recorded in
`OSINT_CASE_EVIDENCE_LAYOUT.md`. It verifies that Cases/Evidence maintain
content-led flow across normal and stress content instead of depending on the
absolute fixed-panel primitive used elsewhere in the dashboard.
