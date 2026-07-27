# OSINT Phase 3 Validation

## Automated contract

`scripts/test-osint-provider-runtime.js` validates the capability map, factory
fail-closed behavior, Wayback input validation, fixed endpoint, normalized
success/empty/offline/cancel states, no raw result exposure, no persistence and
reference-only blocking.

The regression aggregator also runs the normalized-registry, reference-policy,
tool-access-panel, native-boundary and workspace tests.

The Phase 3 contract was exercised with a mocked Wayback response for stable
`SUCCESS`/`EMPTY` rendering, an abortable request for `CANCELLED`, and an
actual bounded availability request for a public test domain. The live adapter
returned `SUCCESS` during validation; an independently rate-limited response
is rendered as `RATE_LIMITED`, never as a false success.

## Manual validation checklist

1. Open OSINT, choose **Wayback Machine** and enter one public URL/domain.
2. Confirm `QUERY WAYBACK` remains disabled for invalid input and enabled only
   for a valid manual target.
3. Confirm loading shows `CANCEL`, then success/empty/error renders without
   opening a browser or snapshot automatically.
4. Cancel an in-flight query and confirm the panel reports `CANCELLED`.
5. Select the reference-only provider and confirm no query form or operational
   action is present.
6. Switch light, dark and system themes; leave/reopen OSINT; visit HUB and ENG.

## Packaging validation

The packaged app must be opened from the final DMG. Validate the Wayback form,
reference-only block, theme changes and clean close. If the external archive is
offline, the expected honest result is `OFFLINE`/`TIMEOUT`, not a false success.

## Inherited regression note

The repository-wide regression aggregator retains the pre-existing map-provider
failure from the protected baseline: TomTom returns HTTP 401 and the local
AISStream key is absent in this clean worktree. RainViewer and Open-Meteo pass;
the OSINT runtime adds no map change and does not suppress this failure.
