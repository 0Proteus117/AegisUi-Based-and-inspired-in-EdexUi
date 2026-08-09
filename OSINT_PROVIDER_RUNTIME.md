# OSINT Provider Runtime

## Scope

Phase 3 introduced a typed renderer-side runtime for approved OSINT
capabilities. Phase 5 keeps that deliberately narrow boundary: the operational
adapters are the user-initiated Internet Archive Wayback Availability query
and one fixed Open-Meteo place-geocoding query.

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

## Current operational adapters

`WaybackAdapter` is bound to `https://archive.org/wayback/available`. It accepts
one public HTTP(S) URL or domain entered manually by the user. It does not
accept arrays, objects, private/local targets, file/data/javascript URLs or
arbitrary endpoints. There is no proxy, crawler, scheduler, batch mode,
automatic snapshot opening or URL persistence.

`OpenMeteoGeocodingAdapter` is bound to
`https://geocoding-api.open-meteo.com/v1/search`. It accepts one manually
entered bounded place text through an explicit Geo verification action. Decimal
and DMS coordinate parsing stays local. The adapter builds only a fixed GET
request with bounded result count, omits credentials, normalizes candidate
fields and never retains raw provider payloads or a search history.

## Phase 4 relationship

v2.4.0 consumes the existing Normalized Result contract only after an explicit
`SAVE TO CASE` action. The new case service does not rerun a query, add a
provider, widen a context, retain the raw response or send case metadata back
to a provider. Phase 5 adds only its constrained place-geocoding adapter; no
Case action can select a provider or create a generic network request.

## Boundaries

- Case-specific local-persistence IPC is registered separately in the trusted
  main process; it is not provider IPC and cannot issue a provider query.
- `_boot.js` and its legacy WebContentsView stay unchanged.
- No credentials, cookies, account sessions or API keys are handled.
- No queries survive an app restart unless the investigator explicitly captures
  a reviewed, normalized finding through the existing Case evidence flow.
- No raw response is exposed from normalized results.
