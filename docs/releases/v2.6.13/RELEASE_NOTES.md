# AegisUi v2.6.13 — STUD Tool Catalog & Discipline Capability Packs

## Summary

STUD now has a local, versioned Tool Catalog instead of an unstructured list of links. It classifies 67 curated entries by capability, integration, availability, cost, offline posture, privacy posture, account requirement, licence state and discipline relevance. Ten discipline-neutral packs organise existing Aegis capabilities, optional local engines and vetted external/reference resources without installing, downloading or executing anything.

## What changed

- Added a validated application-owned registry and SQLite v13 storage for explicit favorites, pins, hidden entries and the local discipline profile only.
- Added catalog filters for discipline, cost, offline posture, integration, free-only, local/offline, no-account and favorites.
- Added native navigation and a narrow ID-only external-launch policy: the main process resolves only registry-approved HTTPS URLs.
- Added honest availability for optional local engines (`NOT INSTALLED` until separately validated), commercial/freemium classifications and transparent alternatives.
- Kept catalog browse/search/filter/profile operations fully local. There is no remote registry refresh, installer, downloader, telemetry, sponsored ranking or provider invocation.

## Boundaries

The catalog is organisational metadata, not a marketplace or recommendation service. It does not infer a discipline from private academic content, install third-party software, transmit profile data, run a tool, call an API or store canonical catalog records in localStorage. External pages open only after an explicit action.

## Validation

- `scripts/test-stud-tool-catalog.js`: 33 focused checks passed.
- STUD model, Moodle, orchestration, revision, compute, document intelligence, knowledge, local-AI, notebook and progress tests passed.
- Electron synthetic visual validation passed for Dark, Light and System-Dark at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x; no enabled control escaped the workspace and no horizontal overflow was detected.
- The broad aggregate reports only inherited Map environment warnings: TomTom HTTP 401 and an absent AISStream key. These are unrelated to STUD Phase 13.

## Visual validation

![STUD Tool Catalog — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/catalog-dark.png)

![STUD Tool Catalog — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/catalog-light.png)

![STUD Tool Catalog — System Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/catalog-system-dark.png)

![Free and offline filter](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/free-offline-filter.png)

![Freemium classification detail](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/freemium-detail-light.png)

![Optional local engine state](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/optional-engine.png)

![Engineering discipline pack](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/engineering-pack.png)

![Law and criminology discipline pack](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/law-pack-light.png)

![Humanities discipline pack](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/humanities-pack.png)

![Local favorites](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/favorites.png)

![Native availability at compact size](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.13/docs/releases/v2.6.13/screenshots/installed-compact-light.png)

## Packaging

DMG intentionally not generated: this is a registry/model/renderer release with no packaging, preload, startup or native-helper path change. The established package-health checks still pass.
