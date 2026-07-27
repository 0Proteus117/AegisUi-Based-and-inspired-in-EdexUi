# OSINT Provider Errors

The runtime uses typed, user-safe error codes:

`PROVIDER_NOT_FOUND`, `ADAPTER_NOT_FOUND`, `PROVIDER_DISABLED`,
`REFERENCE_ONLY_PROVIDER`, `POLICY_BLOCKED`, `INVALID_INPUT`,
`NETWORK_DISABLED`, `OFFLINE`, `TIMEOUT`, `RATE_LIMITED`, `KEY_REQUIRED`,
`AUTH_FAILED`, `PROVIDER_ERROR`, `NORMALIZATION_FAILED`, `CANCELLED` and
`UNKNOWN_ERROR`.

Errors expose a concise user message, provider identity and retryability where
appropriate. They do not expose headers, raw body data, filesystem paths,
request secrets or internal stack traces in the Analyst Desk.

Health is distinct from an individual error. Supported states are `UNKNOWN`,
`READY`, `DEGRADED`, `OFFLINE`, `RATE_LIMITED`, `KEY_REQUIRED`, `DISABLED` and
`REFERENCE_ONLY`. Health changes only from a user-initiated operation; no
background polling is introduced.
