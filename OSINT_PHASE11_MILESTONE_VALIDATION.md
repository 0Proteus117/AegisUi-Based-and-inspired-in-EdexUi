# OSINT Phase 11 — Analyst Desk milestone validation

## Audit scope

Phase 11 audited the normalized registry/runtime, Tool Catalog, Cases,
Evidence Preview/redaction, integrity model, Geo, Media, Domain, Source,
Entity Resolution, Investigation Context, Case Overview, handoffs, provenance,
timeline and open-question/contradiction derivation.

The audit found two runtime lifecycle defects:

1. Leaving OSINT cancelled generic and Geo work, but not active Domain or
   Source provider requests.
2. Opening a different Case kept the in-memory selected-object/provenance
   context, even though Case Overview derives a new object list.

Both fixes are structural: `disposeOSINTDeck()` now always tears down delegated
listeners when present and cancels all provider-backed request owners; Case
opening resets ephemeral selection/provenance when the Case ID changes. Neither
change introduces IPC, persistence, provider chaining or a legacy reconnect.

The audit also found a shared-panel contract mismatch in Geo: its command deck
used a collapsed `minmax(0, 1fr)` body row together with the generic absolutely
positioned panel body. Because Geo intentionally grows from intrinsic content,
the body had no definite height and could render outside a header-only panel.
Geo now uses the same normal-flow `header + content` grid contract as Media,
Domain, Research, Entity and Case Overview. This corrects the entire Geo
surface rather than applying viewport-specific offsets.

## Performance and bounded-state audit

OSINT uses one delegated listener set on its workspace view and removes it on
exit. Provider Runtime owns active `AbortController` instances and removes them
when a result completes or cancellation is requested. The media preview is an
in-memory FileReader URL and is released when the visible workspace is cleared
or exited. Entity graph bounds remain 50 nodes / 100 edges.

`scripts/test-osint-analyst-desk-milestone.js` constructs a synthetic 50-node,
100-edge state, checks the documented limit, verifies Case object isolation,
tests the prefill-only handoff payload and statically protects the complete
workspace teardown contract.

## Layout, themes and interaction contract

The existing content-sized grid layout is retained. Dynamic Case, Evidence,
Geo, Media, Domain, Source and Entity content remains in normal grid/document
flow; the compact workspace owns scroll when necessary. The visual-validation
matrix covers 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x in Dark, Light and
System-resolved Dark/Light appearance with synthetic data only.

Dialogs use existing focus return, Escape dismissal and focus trapping.
Controls remain textual as well as colour-coded. The milestone does not start a
new Light Mode redesign.

## Persistence and integrity checks

The Case/Evidence contract remains:

```
explicit promotion → preview → redaction → canonical data → SHA-256 → storage
```

Tampered Evidence is marked invalid on read. Normalized observations and
handoffs never write storage by themselves. No raw response, original media,
local path, credential or hidden query history is included in Evidence.

## Inherited environment warnings

The broad map-provider check can fail when the local TomTom credential returns
HTTP 401 or `AISSTREAM_API_KEY` is absent. These are environment/provider
credentials outside the OSINT model and are recorded separately from Phase 11
regressions.

## Packaged validation

The v2.6.0 milestone requires a final arm64 DMG. The final record is updated
with its signed bundle inspection, mounted-DMG launch, Calendar helper check,
sanitized OSINT visual evidence and checksum after the package gate completes.
