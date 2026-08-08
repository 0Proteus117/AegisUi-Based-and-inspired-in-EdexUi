# OSINT Case Timeline

The Case Timeline is persistent and local to a single OSINT case. It is
distinct from the global Project Timeline and from the ephemeral Tool Access
session history.

Version 1 supports `CASE_CREATED`, `CASE_UPDATED`, `CASE_STATUS_CHANGED`,
`EVIDENCE_ADDED`, `EVIDENCE_REMOVED`, `NOTE_ADDED`, `EXPORT_CREATED` and
`INTEGRITY_WARNING`, with reserved event types for future edits/import.
Events contain a generated id, case id, enum type, timestamp, neutral summary,
optional related object id and safe metadata. They do not contain raw provider
payloads, query URLs, secrets, hover events or ordinary navigation.
