# OSINT Provider Migration Report — v2.3.3

## Result

The informal `CATEGORIES` / `TOOLS` / `FEATURED` catalog has been migrated to one normalized provider registry. Compatibility exports are projections from that registry so current navigation and card composition remain intact.

| Metric | Before | After |
| --- | ---: | ---: |
| Categories | 9 | 9 |
| Migrated existing tools | 161 | 161 retained |
| Reference-only sample entries | 0 | 1 |
| Total catalog entries | 161 | 162 |
| Featured entries | 4 | 4, derived from provider metadata |
| Duplicate IDs | 0 | 0 |

## Category continuity

All baseline categories remain: Discovery / Research, Archive / Evidence, Domains / Infrastructure, Threat Intelligence, Geo / Visual, Entities / Records, Public Presence, Data / Analysis and Transport / Space.

The only count change is Threat Intelligence, from 17 to 18, because it hosts the single reference-only ecosystem-context sample.

## Reclassification

- The 161 existing entries are represented as `EXTERNAL_WEB` / `WEB` / `LINK_ONLY` records with their existing legitimate URLs retained.
- Their categories, titles, descriptions, tags and featured placement are retained.
- No existing item receives native API, local execution, installation or runtime integration in this phase.
- One verified real entry, Cobalt Strike, is represented as `REFERENCE` / `REFERENCE_ONLY`. It has no catalog URL, no copy action and no operational route. Its purpose is defensive ecosystem recognition only.

## Verification

Registry validation checks ID uniqueness, category/capability membership, enum correctness, action-policy consistency, URL constraints and strict reference-only invariants. The release test suite additionally verifies derived category counts, derived featured records and the absence of a reference-only launch path.

## No hidden provider runtime

This migration does not activate APIs, credentials, scraping, crawling, query sessions, evidence capture, cases, webviews, legacy IPC or external tool installation. The catalog is still a transparent analyst workspace, not a provider runtime.
