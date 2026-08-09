# OSINT Geospatial Verification

Phase 5 adds a narrow analytical workflow to the OSINT workspace. It is not a
replacement for the global AegisUi map and it never changes global map state.

## Workflow

1. The investigator enters decimal coordinates, common DMS coordinates, or a
   short public place name.
2. Coordinates are range-checked and normalized locally. Ambiguous coordinate
   formats, URLs, scripts and arbitrary parameters are rejected.
3. A place name can be sent once, after an explicit **VERIFY LOCATION** action,
   to the approved fixed Open-Meteo Geocoding endpoint.
4. The renderer receives a bounded normalized candidate list, not raw provider
   JSON. The investigator selects a candidate and may add an explicit local
   observation.
5. Nothing is retained by browsing or querying. A reviewed result can be added
   to an Investigation Case only through the existing evidence preview.

## Verification language

`UNVERIFIED` means coordinates were normalized locally without a supporting
provider observation. `PARTIALLY_VERIFIED` means one provider observation
supports the selected location. `CONSISTENT` requires agreement from two
independent observations. `INCONSISTENT` records a material disagreement or a
local investigator contradiction. `INCONCLUSIVE` means no location was
returned. These states describe the available context; they do not establish
ground truth.

Confidence is explainable: LOW for unverified/inconsistent context, MEDIUM for
one provider observation, and HIGH only for independent agreement or an
explicitly recorded supporting observation alongside one provider result.

## Map boundary

No Phase 5 action sends coordinates to the global map. A future handoff, if
added, must be explicit and transfer only reviewed latitude, longitude and a
safe label through an existing map boundary. It must never add a permanent
global POI or mutate map state automatically.
