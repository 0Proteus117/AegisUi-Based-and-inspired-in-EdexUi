# OSINT Geo Provider Discovery

Phase 5 records the OSINT4ALL discovery collection as the prescribed discovery
origin only. It was not treated as an authoritative runtime source: this phase
did not bulk-import its entries, crawl providers, acquire accounts or run
automated discovery. Candidate adoption was checked against public official
documentation.

| Provider | Official source | Purpose / capability | Access, cost and policy context | Phase 5 decision |
| --- | --- | --- | --- | --- |
| Open-Meteo Geocoding | [docs](https://open-meteo.com/en/docs/geocoding-api) | Public place-name geocoding / `GEOSPATIAL_VERIFICATION` | Documented public endpoint; no ordinary key field for this bounded use. No bulk or background query path is exposed. | `ACTIVE` / `REST_API`; one fixed adapter after explicit investigator action. |
| OpenStreetMap | [site](https://www.openstreetmap.org/) | Map and geographic context | Public web reference; availability/cost varies by downstream service. | Existing `LINK_ONLY`; no native query contract. |
| Google Earth | [site](https://earth.google.com/) | Visual terrain and imagery context | Web product with service-specific terms and possible account features. | Existing `LINK_ONLY`; no imagery retrieval or automation. |
| Mapillary | [site](https://www.mapillary.com/) | Street-imagery context | Service/API access is policy and account dependent. | Existing `LINK_ONLY`; no account, token or API path. |
| Copernicus Browser | [site](https://browser.dataspace.copernicus.eu/) | Satellite imagery context | Access and service controls are provider-specific. | Existing `LINK_ONLY`; no imagery retrieval. |
| NASA Worldview | [site](https://worldview.earthdata.nasa.gov/) | Satellite/environmental context | Public visualization service; specific datasets have their own terms. | Existing `LINK_ONLY`; no imagery retrieval. |
| Nominatim | [usage policy](https://operations.osmfoundation.org/policies/nominatim/) | Geocoding / reverse-geocoding candidate | Public policy requires identification, strict rate limiting and prohibits client-side autocomplete/systematic querying. | Intentionally not connected; not a renderer adapter. |

Official sources reviewed: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) and [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

The registry remains the single source of provider configuration. No separate
Phase 5 provider list exists.
