# OSINT Media Geo Handoff

When—and only when—GPS coordinates are actually present in image metadata, the
analyst can select **VERIFY LOCATION**. This creates an ephemeral Geospatial
Verification input with provenance `IMAGE_METADATA`.

The handoff does not:

- make an Open-Meteo request;
- create Case Evidence;
- persist coordinates;
- move or mutate the global map.

Geospatial Verification owns any subsequent explicit verification. Its Evidence
record retains the `IMAGE_METADATA` provenance so it cannot be confused with
manual coordinate input.
