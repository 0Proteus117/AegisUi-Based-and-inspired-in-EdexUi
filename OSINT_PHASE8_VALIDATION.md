# OSINT Phase 8 validation

## Scope

Phase 8 adds `SOURCE_VERIFICATION` without modifying the legacy OSINT runtime,
the global Map, startup/preload paths or unrelated workspaces. It is an
explicit, one-source workflow: public HTTP(S) URL, DOI, or one selected PDF.

## Focused validation

The focused OSINT provider, runtime, geospatial, visual-media, domain,
research-source and Cases/UI/layout/IPC test set passes. The research suite
covers URL/DOI normalization, public/private URL rejection, synthetic local
PDF metadata and SHA-256, fixed Crossref normalization, cancellation,
explicit-only Wayback use, provenance, redaction, and absence of generic proxy,
storage or new IPC paths.

## Visual validation

Electron development runtime was checked with synthetic URL, DOI and local-PDF
states at 1680 x 1050 @2x, 1440 x 900 @2x, and 1200 x 780 @1x. Dark, Light and
System-resolved palettes were checked. Long synthetic title, authors,
publisher, excerpt and analyst-observation values remain in normal grid flow;
no panel overlaps the Provider Policy or Evidence action.

The Evidence Preview was exercised with a synthetic DOI result. Research
redaction fields are presented by the existing preview workflow. No real local
document, user path, case, note, provider result or credentials was used in
release evidence.

## v2.5.5 layout hotfix

The original Phase 8 grid used a flexible `minmax(0, 1fr)` content track inside
each dynamic panel. That let a long source readout or excerpt control render
beyond the height contributed to the parent grid row at compact widths. The
fix changes panel body tracks and every responsive research-grid row to
content-sized tracks. This is a shared layout correction, not a margin or
screenshot-specific offset.

Electron development validation uses the same synthetic long title, publisher,
authors, excerpt and location fixture at 1200 x 780 @1x. It verifies that
neighbouring panels do not intersect and that inputs remain within their
containing panel; outer command-deck scrolling provides access to lower rows.

## Packaging decision

No preload, native helper, startup or packaging path changed. Packaged-runtime
validation and a DMG are therefore intentionally omitted for this incremental
runtime/UI release.

## Inherited environment warnings

The broad regression suite continues to report the existing TomTom HTTP 401
and absent `AISSTREAM_API_KEY` environment warnings. They predate Phase 8 and
are not reclassified as Source Verification regressions.
