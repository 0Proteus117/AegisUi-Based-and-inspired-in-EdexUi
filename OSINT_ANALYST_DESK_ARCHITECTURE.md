# OSINT Analyst Desk architecture

## Current model

The OSINT Analyst Desk is a local-first analyst workspace. It is an explicit,
bounded composition of capabilities rather than a crawler, scanner, generic
network proxy or autonomous research agent.

The active renderer path is owned by `workspaceManager.class.js` and uses the
normalized provider registry, typed Provider Runtime, capability-specific
adapters and the existing Case/Evidence services. The legacy `WebContentsView`,
`osint-source-*` IPC and `osint-native-query` remain disconnected by design.

## Provider model

`osintTools.registry.js` is the single provider source of truth. The catalog
projects categories and featured entries from it. Each provider declares a
capability, access policy, risk/legal context and allowed actions.

| State | Behaviour |
| --- | --- |
| `ACTIVE` | Only its capability-specific adapter may perform a fixed, explicit and bounded action. |
| `LINK_ONLY` | May use the existing guarded external-link route; it has no native adapter. |
| `REFERENCE_ONLY` | Informational only. Launch, copy, install, integration, IPC, network and disk actions are denied by schema, policy and handler checks. |

Active adapters are Wayback Availability, Open-Meteo Geocoding, local media
inspection, Google Public DNS, RIPEstat Network Info, Crossref Works, local PDF
inspection and local Entity Resolution. Inputs, endpoint construction,
timeouts, cancellation and normalized output are owned by their adapters;
there is no renderer-controlled endpoint, HTTP method or header API.

## Explicit analyst workflow

An OSINT result is ephemeral until the analyst deliberately chooses **ADD TO
CASE**. The mandatory retention flow is:

```
normalized observation → Evidence Preview → analyst redaction
→ canonical serialization → SHA-256 Evidence-record hash → local persistence
```

Original media/document hashes, where present, describe original bytes and are
not conflated with the canonical Evidence-record hash. Raw provider responses,
local paths, cookies, credentials and original media/document files are not
persisted by this workflow.

## Investigation Context and handoffs

`osintInvestigationOrchestration.class.js` supplies an in-memory, bounded
`InvestigationContext` for the active Case. A typed handoff transfers only
normalized fields and provenance to a compatible destination. It opens that
destination in an `IDLE` prefilled state; it never queries a provider, creates
an entity/relationship or persists a record.

Context is case-owned. Opening a different Case clears the selected object and
provenance chain before its Case Overview can render. Leaving OSINT cancels all
active generic, Geo, Domain and Source requests and releases the in-memory
media preview.

## Cases, entities and Case Overview

Case storage uses strict local JSON models, atomic writes and per-Case locks.
Evidence integrity is verified by deterministic canonical serialization and
SHA-256. Case Overview is derived from the active Case, its Evidence, timeline,
notes and the ephemeral Entity state; it is not a second database. It exposes
counts, bounded objects, provenance health, contradictions and open questions
without inferring attribution or resolving conflicts automatically.

Entity Resolution is local and analyst-controlled. Each attribute retains
field-level provenance. Relationships require supporting observations; merges
require explicit confirmation. The graph is intentionally limited to 50 nodes
and 100 edges.

## Status, confidence and failure semantics

Shared status text is rendered through `formatOSINTEnum`, so the textual state
is visible across Geo, Media, Domain, Source, Entity, Evidence and Case
Overview. Capability-specific values may add precise context, but they do not
claim authenticity, ownership, identity or attribution. `LOW`, `MEDIUM` and
`HIGH` confidence describe the completeness/quality of observations, never a
probability of a person, owner or claim being true.

Provider errors, cancellation, malformed input and partial results remain in
their owning surface. They do not persist, trigger a follow-up provider,
mutate the global map or corrupt Case state.

## Privacy and security boundaries

- No background query, monitoring, hidden history, batch target input,
  crawling, scanning or enumeration.
- No filesystem path persistence, original-media persistence, raw provider
  payload persistence, telemetry, cloud sync, cookies or credentials.
- No facial recognition, biometric matching, people-search, email probing,
  username enumeration or social crawling.
- Cross-capability navigation is prefill only and never mutates the global Map.
- Private memory, chat exports and environment files remain ignored by Git and
  are checked by release health.

Detailed phase records remain in the corresponding `OSINT_PHASE*_VALIDATION.md`
and capability documents. This document describes the current operating
architecture, not a roadmap.
