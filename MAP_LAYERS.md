# Map layers and Situational Awareness

AegisUi's `Local Situation` panel is a modular, optional-provider map. A layer
must either render real provider data, show an honest fallback/config state, or
stay OFF without consuming resources.

## Base map

v2.0.5 uses TomTom as the primary base-map provider when a key is configured
and valid. If TomTom is missing or unavailable, the app falls back to
OpenStreetMap base tiles.

Accepted TomTom key aliases:

- `TOMTOM_API_KEY`
- `AEGISUI_TOMTOM_API_KEY`
- `TOMTOM_KEY`
- `VITE_TOMTOM_API_KEY`
- `REACT_APP_TOMTOM_API_KEY`

The UI shows only safe diagnostics such as `CONFIGURED`, `MISSING`, `INVALID`
and masked suffixes like `••••1234`. It never displays the full key.

## Current layer registry

| Layer ID | Toggle | Provider | Default | Key/config |
| --- | --- | --- | --- | --- |
| `ROAD_TRAFFIC` | `TRAFFIC` | TomTom Traffic tiles | OFF unless a key exists | TomTom key required |
| `WEATHER_RADAR` | `RADAR` | RainViewer precipitation radar | ON unless offline mode | No key |
| `AIR_TRAFFIC` | `AIR` | OpenSky state vectors | OFF | Anonymous public access; optional OpenSky credentials |
| `MARITIME_AIS` | `SEA` | AISStream WebSocket | OFF | `AISSTREAM_API_KEY` required |
| `MARINE_WEATHER` | `MARINE` | Open-Meteo Marine sea-state cells | OFF | No key |
| `SATELLITES` | `SAT` | CelesTrak GP/TLE + local SGP4 | OFF | No key; `CELESTRAK_GROUP` optional |
| `OCEAN_ALERTS` | `OCEAN` | NOAA/NDBC stations | OFF | No key |

## Map settings popup

The cockpit `⚙` settings popup stores local renderer preferences only. API keys
are not stored there.

It can configure:

- base-map provider and fallback mode;
- `TRAFFIC`, `RADAR`, `AIR`, `SEA`, `MARINE`, `SAT` and `OCEAN` layer toggles;
- CelesTrak group and SAT density;
- AIR marker cap, refresh interval and bounds mode;
- AIS vessel cap and area preset;
- Marine Weather mode/preset/marker cap;
- NOAA/NDBC source/filter/max stations;
- radar provider and opacity;
- local UI sounds and location fallback behavior.

## Layer states

| State | Meaning |
| --- | --- |
| `OFF` | Layer is disabled. No overlay, timer, socket or request is active. |
| `LOADING` | Layer is preparing provider data or tiles. |
| `CONNECTING` | Live socket provider is connecting. |
| `ONLINE` | Provider is active and responding with real data/tiles. |
| `OFFLINE` | Offline mode or network state prevents loading. |
| `API_KEY_MISSING` | A key-backed tile/API layer has no key. |
| `API_KEY_INVALID` | A configured key was rejected by the provider. No fake fallback is drawn. |
| `CONFIG_REQUIRED` | A provider needs local configuration before it can connect. |
| `RATE_LIMITED` | Provider throttled the request; no aggressive retry. |
| `SERVICE_UNAVAILABLE` | Provider/tile service failed but the map remains alive. |
| `NO_DATA` | Provider responded, but no real objects exist in the current view/result. |
| `NO_COVERAGE` | Provider is online but has no coverage for the selected area. |
| `GROUP_UNAVAILABLE` | Selected upstream group is unavailable. |
| `POSITION_ENGINE_ERROR` | Real satellite catalog loaded, but SGP4 propagation failed. |
| `ERROR` | Provider failed in a controlled way. |
| `DISABLED` | Provider exists but is intentionally unavailable. |

## Provider architecture

```text
src/classes/map/
  mapLayerRegistry.js
  providers/
    trafficProvider.js
    weatherRadarProvider.js
    openSkyProvider.js
    aisProvider.js
    marineWeatherProvider.js
    celestrakProvider.js
    noaaOceanProvider.js
  utils/
    mapCache.js
    mapLayerState.js
```

Each provider supports `start`, `stop`, `refresh`, status reporting and cleanup.
OFF providers do not poll, open sockets or draw markers.

## Provider behavior

### `ROAD_TRAFFIC`

- Uses TomTom Traffic tiles.
- Requires a TomTom key.
- Missing key reports `API_KEY_MISSING`.
- Rejected key reports `API_KEY_INVALID` after a real traffic endpoint test.
- There is no fake traffic fallback.

### `WEATHER_RADAR`

- Uses RainViewer public precipitation radar metadata/tiles.
- No key required.
- Radar precipitation is not the same as marine sea-state conditions.
- Maritime precipitation coverage depends on RainViewer's public mosaic. If it
  has no coverage, AegisUi does not synthesize radar.

### `AIR_TRAFFIC`

- Uses OpenSky `states/all` for real ADS-B state vectors.
- Anonymous access can work but is rate-limited.
- Optional credentials can be supplied through OpenSky env variables.
- OFF means no OpenSky requests and no aircraft markers.

### `MARITIME_AIS`

- Uses AISStream over secure WebSocket.
- Requires `AISSTREAM_API_KEY`.
- Missing key reports `CONFIG_REQUIRED` and opens no socket.
- Defaults to `CURRENT_VIEW` and supports controlled maritime presets such as
  Gibraltar, Mediterranean, North Sea, English Channel, Singapore Strait,
  Caribbean, US coasts, Japan and Australia East.
- Does not use the whole world as the normal subscription. The optional
  `WORLD_SAMPLE` mode is limited to selected high-traffic boxes.
- Buffers up to 1000 vessels, deduplicates by MMSI, throttles render batches,
  expires stale vessels and caps visible markers from local settings.
- Markers are created only from live AIS messages.

### `MARINE_WEATHER`

- Uses Open-Meteo Marine public API.
- No key required.
- Shows real sea-state cells: wave height/direction/period, sea-surface
  temperature, ocean current velocity/direction and sea-level height where
  upstream data exists.
- `visible` mode reports `NO_MARINE_CELL_IN_VIEW` for inland views rather than
  drawing fake sea data.
- `nearest` and preset modes can show real coastal/ocean cells without AIS.

### `SATELLITES`

- Uses real CelesTrak GP/TLE catalog data.
- Propagates locally with `satellite.js` SGP4 via `twoline2satrec`.
- `starlink` maps to upstream `GROUP=STARLINK`.
- Density controls limit processed objects and rendered markers.
- CelesTrak can return a cache-window `403` if the same group was downloaded
  recently; AegisUi reports that as `RATE_LIMITED` instead of drawing fake
  satellites.

### `OCEAN_ALERTS`

- Uses NOAA/NDBC active station XML and DART filtering where available.
- Can filter visible/global/coastal stations.
- Clicking a station attempts to load latest public realtime observation.
- If no station exists in the selected area, the layer reports `NO_DATA`.

## Map controls

- `⚙` opens the map settings popup.
- `⛶` expands/collapses the map inside the app.
- `⌖` requests browser/Electron geolocation. If permission is unavailable or
  denied, the app shows a clear location fallback state.

## Offline and fallback behavior

- Base map: TomTom primary, OSM fallback, offline/error state if neither loads.
- Traffic: TomTom-only; no fake fallback.
- Radar: RainViewer precipitation only; no fake maritime radar.
- AIS: requires key; otherwise `CONFIG_REQUIRED`.
- Marine Weather: no key, real Open-Meteo Marine data or `NO_DATA`.
- SAT: real CelesTrak/TLE + SGP4 only.
- OCEAN: real NOAA/NDBC station data only.
