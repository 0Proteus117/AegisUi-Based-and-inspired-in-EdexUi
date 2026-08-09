# OSINT Phase 8 pre-flight audit

Baseline inspected: `v2.5.3` (`0107e0a`) on `feature/systems-online-pass`.

## Reused boundaries

- The typed Provider Runtime owns user-initiated requests, fixed adapters,
  cancellation and normalized results. No legacy OSINT WebContentsView or
  `osint-source-*` IPC is connected.
- The existing Wayback adapter remains the only archive runtime. It is called
  only after the analyst selects **CHECK ARCHIVE**.
- Cases/Evidence remains the sole persistence path. It redacts before canonical
  SHA-256 integrity hashing and never stores raw provider responses.
- The Phase 5 Geo and Phase 6 media modules remain separate capabilities.

## Existing research entries

The catalog already contains public discovery entries for OpenAlex, arXiv,
Semantic Scholar, CORE and Google Scholar. They remain external/link-only;
this phase does not scrape or automate them.

## Phase 8 decision

- **Crossref Works** is the one new active provider: one DOI, one fixed public
  `GET /works/{doi}` endpoint, normalized metadata only.
- **Local PDF inspection** is a local bounded capability: explicit file bytes,
  header/EOF validation, selected document metadata and original-byte SHA-256.
- Arbitrary URL extraction is intentionally unavailable. A URL is normalized
  locally and may receive an explicit Wayback availability observation.

No `_boot.js`, map, legacy runtime, new IPC, Apple Music, Calendar, Assistant
or unrelated workspace runtime was modified.
