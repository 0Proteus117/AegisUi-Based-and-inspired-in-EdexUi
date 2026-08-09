# OSINT Phase 6 Validation

## Pre-flight

The v2.5.0 baseline was inspected from a clean Seagate worktree. Release health
and the regression suite passed before implementation, except for documented
environmental map-provider warnings: TomTom HTTP 401 and missing AISStream
credentials. Those conditions are inherited and outside Phase 6.

## Structural validation

The Phase 6 test fixture covers JPEG metadata/GPS, PNG without EXIF, malformed
and unsupported files, exact SHA-256, unknown timezone, neutral software-tag
semantics, Evidence redaction, no original-byte persistence, Geo provenance,
no automatic Geo query/map mutation and no new IPC/network/storage surface.

## Visual matrix

Development visual checks use sanitized synthetic images at 1680×1050 @2x,
1440×900 @2x and 1200×780 @1x in Dark, Light and System modes. Cases include
landscape, portrait, extremely wide/tall, rich metadata/GPS, no metadata,
malformed input and long analyst observations. The preview uses normal grid
flow, `object-fit: contain`, bounded height and responsive one/two/three-column
layouts to avoid overlaps and clipped controls.

The Evidence Preview/redaction workflow was also exercised with a synthetic
media record. Release validation images are cropped to the OSINT surface or
dialog and contain only synthetic labels, metadata and coordinates. A packaged
runtime build is intentionally not required for this incremental JavaScript/CSS
capability; no DMG is generated for this release.

## Scope confirmation

No legacy OSINT runtime, `_boot.js`, global map behavior, provider adapter,
generic IPC or original-media attachment model is changed by Phase 6.
