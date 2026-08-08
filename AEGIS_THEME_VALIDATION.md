# AegisUi Theme Validation

## Structural strategy

The implementation is a final semantic CSS layer plus a renderer-only
appearance resolver. It corrects the shared colour architecture instead of
using screenshots, filters, transforms or layout offsets.

## Invariants

- Dark is unchanged unless the user selects another appearance.
- System follows the OS appearance only while System is selected.
- Manual Light/Dark override System and persist in `settings.json`.
- Theme changes do not reload the renderer or mutate workspace state.
- OSINT `REFERENCE_ONLY` policy, cases/evidence integrity and provider runtime
  stay outside the theme code path.
- Terminal content remains intentionally dark.

## Automated checks

`node scripts/test-aegis-theme-integrity.js` verifies semantic tokens, all
three modes, the single persistence store, live System media handling, Settings
control, OSINT/Cases styling coverage and absence of theme-to-provider/case
calls. `scripts/run-regression-checks.js` and `release-health-check.js` include
the same integrity boundary.

## Visual matrix

The packaged Electron app was opened from the mounted v2.4.1 DMG. Validation
covered Light, Dark and System-resolved appearances across HUB, ENG, OSINT
catalog, active Case, Evidence Detail, Assistant, Student, Artist, Business,
Comms, Launch Bay, Developer and Agent Command at 1280×820 (1×), 1200×780
(1×), 1440×900 (2×) and 1680×1050 (2×). The probe records semantic bounds
rather than machine-specific screenshot coordinates, including the protected
Case/Evidence layout-flow contract.

`scripts/validate-aegis-theme-live.js` only creates its long-content Case and
Evidence fixtures through the existing constrained IPC in a disposable
`--user-data-dir`; it never adds production defaults or writes source data.

## Validation result

The theme integrity, OSINT Case/Evidence suite and release-health checks
passed. The full regression aggregator passed every local module check and
reported only inherited live-map environment failures: TomTom HTTP 401 and a
missing AISStream credential. Those provider credentials and their runtime
were not changed by this appearance pass.

## Known limitation

The terminal is intentionally dark in every appearance mode. Browser-native
colour controls supplied by third-party map content are outside AegisUi’s DOM;
the AegisUi map controls and popup surfaces are themed.
