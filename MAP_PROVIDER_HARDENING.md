# MAP PROVIDER HARDENING — v2.0.5

Scope: `Local Situation` map only. No non-map workspaces were intentionally
changed.

## Current map implementation

- Map renderer: `src/classes/engineeringDashboard.class.js`.
- Map engine: vendored Leaflet from `src/assets/vendor/leaflet/`.
- Base map before v2.0.5: OpenStreetMap tile layer only.
- Base map after v2.0.5: TomTom primary when a key is configured, with
  OpenStreetMap fallback when TomTom is missing or unavailable.
- Layer registry: `src/classes/map/mapLayerRegistry.js`.
- Shared state/cache utilities:
  - `src/classes/map/utils/mapLayerState.js`
  - `src/classes/map/utils/mapCache.js`

## Provider files

- Traffic: `src/classes/map/providers/trafficProvider.js`
- Radar precipitation: `src/classes/map/providers/weatherRadarProvider.js`
- Air traffic: `src/classes/map/providers/openSkyProvider.js`
- Maritime AIS vessels: `src/classes/map/providers/aisProvider.js`
- Marine weather/sea state: `src/classes/map/providers/marineWeatherProvider.js`
- Satellites: `src/classes/map/providers/celestrakProvider.js`
- NOAA/NDBC ocean stations: `src/classes/map/providers/noaaOceanProvider.js`

## TomTom key handling

Accepted aliases:

- `TOMTOM_API_KEY`
- `AEGISUI_TOMTOM_API_KEY`
- `TOMTOM_KEY`
- `VITE_TOMTOM_API_KEY`
- `REACT_APP_TOMTOM_API_KEY`

The app normalizes these internally to the TomTom key used by the map and
traffic layers. Diagnostics only show safe state and masked suffix, never the
full key.

Diagnostic states:

- `TOMTOM KEY: CONFIGURED`
- `TOMTOM KEY: MISSING`
- `TOMTOM KEY: INVALID`
- `TOMTOM SERVICE: ONLINE`
- `TOMTOM SERVICE: ERROR`

The diagnostic uses a lightweight TomTom base-map tile endpoint from the main
process to avoid frontend CORS ambiguity.

## Provider config requirements

| Provider | Key required | Notes |
| --- | --- | --- |
| TomTom base map | Optional | Used when present; OSM fallback if missing/failing. |
| TomTom traffic | Required | No fake traffic fallback. |
| RainViewer radar | No | Precipitation radar only; not a marine-condition provider. |
| OpenSky AIR | No | Anonymous mode is rate-limited; credentials optional. |
| AISStream vessels | Yes | No WebSocket opens when `AISSTREAM_API_KEY` is missing. |
| Open-Meteo Marine | No | Real sea-state forecast cells. |
| CelesTrak SAT | No | Uses real CelesTrak GP/TLE catalog plus local SGP4. |
| NOAA/NDBC OCEAN | No | Real station/buoy metadata and latest observations. |

## Fallbacks and constraints

- TomTom base failure falls back to OpenStreetMap base tiles.
- TomTom traffic does not fall back to invented traffic.
- AIS without key reports `CONFIG_REQUIRED`; no socket opens.
- Marine weather is separate from AIS and can work without AIS credentials.
- Madrid/inland views may report `NO_MARINE_CELL_IN_VIEW`; presets can show
  real marine data without inventing local sea data.
- RainViewer precipitation radar may or may not show maritime precipitation
  depending on its public mosaic coverage. AegisUi does not synthesize maritime
  radar.
- SAT Starlink maps to CelesTrak `GROUP=STARLINK`; CelesTrak can return a
  cache-window `403` if the same group was downloaded recently.

## Timers/resources

- OFF layers do not fetch, poll, open sockets or render overlays.
- AIR/RADAR/OCEAN/MARINE providers use bounded intervals and cache TTLs.
- AIS sockets close on OFF.
- SAT clears markers/timers on OFF and uses cached TLE where valid.

## Risks addressed

- Inconsistent TomTom environment names.
- Base map depending on a single provider.
- Starlink option using ambiguous lowercase group handling.
- Native browser selects in the map settings popup.
- Maritime AIS being confused with marine weather.
- Radar precipitation being confused with sea-state conditions.
- Broken `satellite.js@7` package loading in the local runtime.

## Remaining limits

- TomTom key validity still depends on the user's own private key and quota.
- AISStream requires user-provided credentials; without them, vessel data
  remains correctly unavailable.
- Open-Meteo Marine provides forecast cells, not AIS vessel positions.
- RainViewer is precipitation radar, not marine-condition radar.
