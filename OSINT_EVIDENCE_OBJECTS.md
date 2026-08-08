# OSINT Evidence Objects

Evidence Objects are local JSON records linked to one Investigation Case. They
are deliberately small, versioned metadata records rather than captures of
remote pages, raw API payloads, screenshots, HAR/WARC files or binary uploads.

Supported types are `PROVIDER_RESULT`, `WEB_REFERENCE`, `USER_NOTE`,
`USER_ATTACHMENT_METADATA` (schema reserved; no upload path), and
`MANUAL_OBSERVATION`. Provider results, manual observations and user notes are
usable in v2.4.0. A web reference requires a manually entered HTTP(S) URL and
is not fetched or opened by the evidence flow.

Provider evidence is created only from a validated Phase 3 Normalized Result.
The trusted side fixes provider identity, capability, query time, acquisition
method and integrity basis. The operator may edit only title, summary, tags,
optional note and selected redactions in the preview.

Raw responses, response headers, cookies, tokens, API keys, stack traces and
reference-only provider data are rejected from persistent evidence.
