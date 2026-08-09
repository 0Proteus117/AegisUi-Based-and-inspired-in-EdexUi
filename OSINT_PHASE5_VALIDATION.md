# OSINT Phase 5 Validation

Phase 5 validation is split between pure local model tests, registry/adapter
tests, existing Cases/Evidence tests, the full regression aggregator and
packaged Electron visual checks.

The focused test validates decimal/DMS/place parsing, invalid/ambiguous input
rejection, provider normalization, confidence states, fixed-endpoint adapter
constraints, cancellation compatibility, safe evidence conversion and
pre-hash redaction. Existing OSINT and Case tests remain in the regression
aggregator.

The visual check matrix covers the Geo screen in Dark and Light at large,
medium and compact window sizes, plus a normal Case/evidence-promotion flow.
The global map is inspected separately as a regression surface; Phase 5 does
not implement map handoff.

## Observed validation evidence

- Development Electron rendered an empty Geo workspace at 1680×1050 @2x, a
  long-content stress state at 1440×900 @2x, and a compact System/Dark state at
  1200×780 @1x. Semantic bounds reported no Geo header, input, result or
  observation collisions.
- A real explicit Open-Meteo query for `London` returned a bounded normalized
  candidate and rendered `PARTIALLY VERIFIED / MEDIUM`; no raw response was
  rendered or persisted.
- A disposable Case fixture opened the existing evidence preview with Geo
  redaction controls before SHA-256 creation. It was created only in a
  temporary user-data profile.
- The final mounted ARM64 DMG rendered the same explicit Open-Meteo result.
  Its bundle metadata is `AegisUi`, `com.edex.ui.eng`, version `2.5.0`; the
  packaged Calendar helper contract also passed.

The regression aggregator still reports the inherited external environment
warnings: TomTom responds HTTP 401 and the clean worktree has no
`AISSTREAM_API_KEY`. They are not caused or modified by Phase 5.
