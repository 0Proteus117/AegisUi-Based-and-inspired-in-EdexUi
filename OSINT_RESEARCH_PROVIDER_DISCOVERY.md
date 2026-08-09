# OSINT research provider discovery

| Provider | Decision | Reason |
| --- | --- | --- |
| Crossref Works | ACTIVE | Official public DOI metadata API, fixed `GET /works/{doi}` contract, no renderer-controlled endpoint or credential. |
| Wayback Availability | ACTIVE (reused) | Existing fixed, explicit archive-availability adapter; never queried automatically from URL entry. |
| OpenAlex | LINK_ONLY | Official documentation currently requires an API key; no key belongs in this phase. |
| arXiv | LINK_ONLY | Public research source, but no dedicated bounded identifier contract is required for Phase 8. |
| Semantic Scholar | LINK_ONLY | Useful discovery source; not added without a narrowly reviewed phase-specific adapter. |
| CORE | LINK_ONLY / REJECTED FOR RUNTIME | No stable contract was approved during this review. |
| Google Scholar | LINK_ONLY | No scraping, browser automation or credential/session handling. |

OSINT4ALL may remain a discovery reference only; it is not scraped or imported.
