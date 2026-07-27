# OSINT Provider Adapters

Adapters translate a provider-specific response into the shared result model.
They are constructed by `AdapterFactory` from `runtimeAdapter`, not selected by
arbitrary UI input.

## Wayback Availability

- Provider: `wayback`
- Capability: `HISTORICAL_ARCHIVE`
- Endpoint: `https://archive.org/wayback/available`
- Input: one manually entered public URL/domain
- Timeout: bounded centrally at 9 seconds
- Output: availability, canonical URL, snapshot timestamp and an informational
  snapshot URL

The snapshot URL is never opened automatically. The adapter does not download
archived content, discover URLs, issue multiple requests or follow links.

## Stub families

Local tools and system integrations are represented by explicit blocked
adapters. They cannot execute programs, call shell commands, access files or
register IPC in this phase. Reference-only providers receive a metadata adapter
only; operational adapter creation fails before any I/O.
