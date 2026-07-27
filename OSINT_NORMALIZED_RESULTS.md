# OSINT Normalized Results

All adapters return one immutable result envelope with a status, timing,
provider/capability identity, summary, safe structured data, warnings, source
metadata, confidence and typed error when applicable. Raw payloads are never
attached.

Supported statuses are `SUCCESS`, `EMPTY`, `PARTIAL`, `ERROR`, `CANCELLED`,
`POLICY_BLOCKED`, `OFFLINE`, `RATE_LIMITED` and `KEY_REQUIRED`.

The Wayback adapter normalizes only the information needed by the panel:

- availability;
- original manual input;
- canonical URL;
- informational snapshot URL;
- snapshot timestamp;
- provider/source;
- timestamps, confidence and safe warnings.

The session-history list stores only an action/state summary. It never stores
the raw query, snapshot URL, response payload, headers, credentials or tokens.
