# OSINT Provider Runtime

## Scope

Phase 3 introduces a typed renderer-side runtime for approved OSINT
capabilities. It is deliberately narrow: the only operational adapter is the
user-initiated Internet Archive Wayback Availability query.

`src/classes/workspaces/osintProviderRuntime.class.js` owns request identity,
query context, cancellation, health state, rate-limit observations, normalized
results and typed errors. It contains no provider-specific geometry, URLs,
credentials, persistence, IPC or browser-launch code.

`src/classes/workspaces/osintProviderAdapters.class.js` owns adapter behavior.
The factory resolves a normalized provider record and fails closed when a
provider is missing, disabled, unsupported or reference-only.

## Runtime contract

`ProviderRuntime.startQuery()` creates one ephemeral request with an
`AbortController`. It records only process-memory state while the OSINT
workspace is open. Cancellation, timeout and provider failures resolve to a
normalized result rather than crashing the workspace.

Supported adapter families are:

- `ExternalWebAdapter` — catalog/launch policy only; no native query.
- `RestApiAdapter` — bounded, fixed-provider REST base.
- `LocalToolAdapter` — explicit disabled stub in this phase.
- `SystemIntegrationAdapter` — explicit disabled stub in this phase.
- `ReferenceOnlyAdapter` — metadata-only; health, query, launch and integration
  all reject before network or disk activity.

## Current operational adapter

`WaybackAdapter` is bound to `https://archive.org/wayback/available`. It accepts
one public HTTP(S) URL or domain entered manually by the user. It does not
accept arrays, objects, private/local targets, file/data/javascript URLs or
arbitrary endpoints. There is no proxy, crawler, scheduler, batch mode,
automatic snapshot opening or URL persistence.

## Phase 4 relationship

v2.4.0 consumes the existing Normalized Result contract only after an explicit
`SAVE TO CASE` action. The new case service does not rerun a query, add a
provider, widen a context, retain the raw response or send case metadata back
to a provider. Wayback remains the sole active native adapter.

## Boundaries

- Case-specific local-persistence IPC is registered separately in the trusted
  main process; it is not provider IPC and cannot issue a provider query.
- `_boot.js` and its legacy WebContentsView stay unchanged.
- No credentials, cookies, account sessions or API keys are handled.
- No queries survive an app restart.
- No raw response is exposed from normalized results.
