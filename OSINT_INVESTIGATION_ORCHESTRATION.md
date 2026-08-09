# OSINT Investigation Orchestration

## Scope

Phase 10 adds a local orchestration layer to the existing OSINT capabilities.
It does not add a provider, query endpoint, IPC channel, persistence store or
legacy-runtime connection.

## Audit basis

At `v2.5.6`, Cases/Evidence are local JSON records reached through the existing
case IPC boundary; Geo, Media, Domain and Source use typed normalized results;
and Entity Resolution is a bounded ephemeral graph. Existing handoffs were
capability-specific. The Phase 10 module normalizes that navigation contract
without changing the underlying Case/Evidence integrity pipeline.

## Investigation Context

`OSINTInvestigationOrchestration` keeps only the current active Case id,
selected normalized object, provenance reference and allowed actions. It is
rebuilt in memory and has no storage, network or IPC access.

## Explicit handoffs

Every handoff is an immutable contract containing the source capability/object,
the destination capability, a minimal normalized payload, provenance and Case
id. Opening a destination only pre-fills its input. The analyst must press the
existing query or verification control before any provider request occurs.

The contract excludes raw provider responses, credentials, cookies, arbitrary
URLs, local paths and hidden metadata.

## Persistence boundary

Navigation, selected objects and handoff context remain ephemeral. Saving a
result still requires the established path:

`normalized observation → ADD TO CASE → Evidence Preview → redaction → canonical hash → local persistence`

No Phase 10 action bypasses Evidence Preview or creates a hidden timeline.
