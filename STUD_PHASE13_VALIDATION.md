# STUD Phase 13 Validation

## Baseline

- Base: `v2.6.12` / `9908dfb`.
- Schema: v12 to v13 migration.
- Scope: registry metadata, explicit local preferences/profile, bounded IPC and STUD `TOOLS` catalog surface.

## Architecture validation

- Registry v1.0.0 validates 67 stable entries and 10 curated packs.
- Definitions remain application-owned JavaScript; no mutable catalog is placed in localStorage or fetched remotely.
- SQLite v13 stores preferences/profile only. The catalog is not copied into the academic model.
- Renderer opens native targets by known target and external sites by entry ID. Main process resolves only registry-validated HTTPS URLs.
- No installer, downloader, shell command, generic proxy, provider chaining, telemetry or hidden recommendation request exists.

## Focused checks

`scripts/test-stud-tool-catalog.js` passes 34 checks covering registry schema/IDs/URLs, cost sorting, free/offline/open-source/integration filters, six discipline-neutral profiles, pack composition, optional availability, reference-only separation, explicit local `MARK USED`, preferences/restart/reset, safe ID-only launch, IPC sender validation, no telemetry and 1,000-entry validation scale.

Existing STUD tests are updated for schema v13 without weakening prior assertions.

## Visual matrix

Synthetic Electron validation passes catalog dark/light/system-dark, free/offline filtering, freemium visibility, optional-engine detail, Engineering/Law/Humanities packs, favorites, native availability and compact layout at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x. Each surface reports zero escaped enabled controls and zero horizontal overflow. Dynamic descriptions and tags participate in grid/document flow; no screenshot-specific positioning is used.

## Known boundaries

- Optional engines remain `NOT_INSTALLED` until a separate approved install/package phase validates them.
- External commercial/licence metadata is a dated category, not a permanent pricing claim.
- The broad regression aggregate is intentionally reported as inherited-warning-only: its Map provider probe receives TomTom HTTP 401 and no AISStream key. STUD, OSINT, Assistant, ENG, Calendar helper, theme and GearLab isolation checks pass.
- No Phase 14 capability is started by this phase.
