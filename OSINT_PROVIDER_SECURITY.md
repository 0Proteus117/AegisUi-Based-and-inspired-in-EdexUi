# OSINT Provider Security

Phase 3 uses an allowlisted provider, fixed endpoint and one-query context.
The renderer cannot select a destination URL, proxy arbitrary traffic, query
lists of targets, crawl, scrape, persist outputs or use credentials.

`REFERENCE_ONLY` remains technically blocked at schema, policy, factory and
UI layers. It receives no query form, adapter, launch, copy, install,
configuration, integration, IPC, navigation, disk write or network request.

Wayback input is limited to one public HTTP(S) URL/domain. The adapter rejects
objects/arrays, data/file/javascript schemes, localhost and common private
network ranges before it builds the fixed availability request.

No localStorage, userData, files, cache, query exports or automatic evidence
case are created in this phase. API keys and `.env` files are not read.
