# OSINT Case Security

OSINT case IPC is deliberately narrow: explicit list/create/read/update/archive
case operations; create/read/remove/verify/export evidence; create a note; and
case export. There is no generic file, directory, path, read/write, proxy or
execution IPC.

The main process validates trusted renderer origin, allowed keys, payload size,
plain-object depth, identifiers, enums, tags, timestamps, text lengths,
prototype-pollution keys, URL format, export extension and policy constraints.
It resolves the userData storage root and native export destination itself.
`REFERENCE_ONLY` is rejected before provider evidence creation.

This phase does not connect the legacy `WebContentsView`, `osint-source-*` or
`osint-native-query` IPC. It adds no provider, API key, scraping, crawling,
batch processing, background monitoring, shell, active scanning or telemetry.
