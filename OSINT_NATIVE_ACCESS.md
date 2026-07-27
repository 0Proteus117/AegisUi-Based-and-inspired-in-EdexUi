# OSINT Native Access

## Current v2.3.5 boundary

The Analyst Desk has one approved native capability: a user-initiated Wayback
Availability check for one public URL or domain. It runs through the modern
typed provider runtime in the renderer and is not a generic browser, proxy or
scraper.

| Surface | Current state |
| --- | --- |
| Wayback Availability | Approved fixed-endpoint API adapter; cancellable, normalized and ephemeral. |
| Normal catalog provider | Policy-controlled external browser launch where allowed. |
| Reference-only provider | Informational only; no adapter or operational action. |
| Legacy WebContentsView | Retained but disconnected; not used by the modern catalog. |
| Legacy `osint-native-query` IPC | Retained but disconnected; not used by the modern runtime. |

The current Wayback adapter calls only
`https://archive.org/wayback/available`. It validates manual input locally,
does not follow or open snapshot links, and exposes no headers/raw payload.

## Explicitly excluded

- arbitrary web destinations or proxying;
- batch targets, crawling, scraping or background queries;
- credentials, cookies, provider accounts or API keys;
- persistence, evidence objects, cases or export;
- new IPC, WebContentsView activation or `_boot.js` changes.

See `OSINT_PROVIDER_RUNTIME.md`, `OSINT_PROVIDER_ADAPTERS.md` and
`OSINT_LEGACY_RUNTIME_MAP.md` for the technical contract.
