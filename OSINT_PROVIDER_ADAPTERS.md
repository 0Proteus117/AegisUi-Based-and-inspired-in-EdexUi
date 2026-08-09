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

## Open-Meteo Geocoding

- Provider: `open-meteo-geocoding`
- Capability: `GEOSPATIAL_VERIFICATION`
- Endpoint: `https://geocoding-api.open-meteo.com/v1/search`
- Input: one manually entered bounded place text
- Timeout: bounded centrally at 8 seconds
- Output: bounded normalized geographic candidates only

The adapter has no key, account, arbitrary URL, arbitrary query parameter,
headers, proxy or batch path. It uses an explicit user action and cancellation;
raw provider JSON is discarded after adapter normalization. It does not update
the global Map or persist queries outside an explicit Case evidence capture.

## Stub families

Local tools and system integrations are represented by explicit blocked
adapters. They cannot execute programs, call shell commands, access files or
register IPC in this phase. Reference-only providers receive a metadata adapter
only; operational adapter creation fails before any I/O.
