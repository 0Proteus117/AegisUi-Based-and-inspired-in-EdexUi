# Map layers and Situational Awareness

AegisUi's `Local Situation` panel is now a modular situational-awareness map.
Each layer is optional, locally remembered and resource-aware:

- OFF layers do not fetch, poll, open sockets or render overlays.
- ON layers must either show real provider data or a real fallback state.
- No layer should draw fake operational markers.
- API keys stay in private `.env` / local settings, never in the repository.

## Current layer registry

| Layer ID | Toggle | Provider | Default | Key/config |
| --- | --- | --- | --- | --- |
| `ROAD_TRAFFIC` | `TRAFFIC` | TomTom Traffic tiles | OFF unless a key exists | `AEGISUI_TOMTOM_API_KEY` or local settings |
| `WEATHER_RADAR` | `RADAR` | RainViewer public weather maps | ON unless offline mode | No key |
| `AIR_TRAFFIC` | `AIR` | OpenSky Network state vectors | OFF | Anonymous public access, optional OpenSky OAuth/Bearer token |
| `MARITIME_AIS` | `SEA` | AISStream WebSocket | OFF | `AISSTREAM_API_KEY` required |
| `SATELLITES` | `SAT` | CelesTrak GP JSON + SGP4 positions | OFF | No key; `CELESTRAK_GROUP` optional |
| `OCEAN_ALERTS` | `OCEAN` | NOAA/NDBC active stations | OFF | No key |

## Map settings popup

v2.0.4 adds a compact cockpit settings button (`⚙`) inside `Local Situation`.
The popup is local-only and lets the user tune provider behavior without
editing JSON by hand:

- enable/disable `TRAFFIC`, `RADAR`, `AIR`, `SEA`, `SAT` and `OCEAN`;
- choose CelesTrak satellite group and density;
- cap AIR aircraft, SEA vessels, SAT objects/markers and OCEAN stations;
- tune AIR refresh interval and wider/visible bounding-box mode;
- select OCEAN source/filter mode;
- adjust radar and traffic opacity;
- see provider status/configuration hints;
- toggle subtle local UI sounds;
- choose default map-location behavior.

The popup writes renderer `localStorage` preferences only. API keys are not
stored there. Existing `map-layers.json` remains the portable layer-state file
for active/opacity/mode preferences.

## Layer states

| State | Meaning |
| --- | --- |
| `OFF` | Layer is disabled. No overlay, timer, socket or request is active. |
| `LOADING` | Layer is preparing provider data or tiles. |
| `CONNECTING` | Live socket provider is connecting. |
| `ONLINE` | Provider is active and responding with real data/tiles. |
| `OFFLINE` | Offline mode or network state prevents loading. |
| `API_KEY_MISSING` | A key-backed tile/API layer has no key. |
| `CONFIG_REQUIRED` | A provider needs user configuration before it can connect. |
| `RATE_LIMITED` | Provider throttled the request; the layer must not retry aggressively. |
| `SERVICE_UNAVAILABLE` | Provider/tile service failed but the map remains alive. |
| `NO_DATA` | Provider responded, but no real objects exist in the current view/result. |
| `POSITION_ENGINE_REQUIRED` | Legacy state for builds without an orbital propagation engine. v2.0.3 should not use this when `satellite.js` is available. |
| `POSITION_ENGINE_ERROR` | Real satellite catalog data loaded, but SGP4 propagation failed or the local engine is unavailable. |
| `ERROR` | Provider failed in a controlled way. |
| `DISABLED` | Provider exists but is intentionally unavailable. |

## Provider architecture

Map providers live under `src/classes/map/`:

```text
src/classes/map/
  mapLayerRegistry.js
  providers/
    trafficProvider.js
    weatherRadarProvider.js
    openSkyProvider.js
    aisProvider.js
    celestrakProvider.js
    noaaOceanProvider.js
  utils/
    mapCache.js
    mapLayerState.js
```

Each provider exposes the same lifecycle shape:

- `isConfigured(context)`
- `start(context)`
- `stop(context)`
- `refresh(context)`
- `getStatus()`

The registry owns activation/deactivation and syncs provider status back into
the existing cockpit UI.

## Provider behavior

Provider references:

- OpenSky REST API: `https://openskynetwork.github.io/opensky-api/rest.html`
- AISStream documentation: `https://aisstream.io/documentation`
- CelesTrak GP data formats: `https://celestrak.org/NORAD/documentation/gp-data-formats.php`
- satellite.js SGP4 propagation engine: `https://github.com/shashwatak/satellite-js`
- NOAA/NDBC active stations: `https://www.ndbc.noaa.gov/activestations.xml`

### `ROAD_TRAFFIC`

- Uses TomTom traffic tiles.
- Does not load unless the toggle is ON and a TomTom key exists.
- Missing key shows `API_KEY_MISSING`.
- Tile failures show `SERVICE_UNAVAILABLE`.
- No polling timer is used.

### `WEATHER_RADAR`

- Uses RainViewer metadata and radar tiles.
- Metadata is cached for 5 minutes.
- Refresh interval is 5 minutes while ON.
- No key is required.
- Failures show `SERVICE_UNAVAILABLE` / `OFFLINE`.
- Radar opacity is configurable in the map settings popup.
- Dedicated maritime radar coverage is marked `NOT SUPPORTED BY CURRENT
  PROVIDER`. RainViewer may show precipitation wherever its public mosaic has
  coverage, but AegisUi does not fake sea radar or infer marine coverage.

### `AIR_TRAFFIC`

- Uses OpenSky `states/all` with the visible map bounding box.
- Anonymous access is allowed but can be rate-limited.
- Optional auth:
  - `OPENSKY_ACCESS_TOKEN`; or
  - `OPENSKY_CLIENT_ID` + `OPENSKY_CLIENT_SECRET` for OAuth client credentials.
- Cache TTL: 45 seconds.
- Refresh interval is configurable: 30s, 60s or 120s.
- Marker cap is configurable: 25, 50, 100 or 200 aircraft.
- Bounding-box mode can use visible map bounds or a wider surrounding area.
- OFF means no requests and no aircraft markers.

### `MARITIME_AIS`

- Uses AISStream over secure WebSocket.
- Requires `AISSTREAM_API_KEY`.
- Missing key shows `CONFIG_REQUIRED`.
- OFF means no WebSocket and no vessel markers.
- The layer closes the socket and clears markers when disabled.
- Marker cap is configurable: 50, 100 or 250 vessels.
- AISStream is the current provider. `TEST CONNECTION` in settings does not
  open a WebSocket unless the SEA layer itself is enabled.

### `SATELLITES`

- Uses CelesTrak GP JSON data.
- Converts CelesTrak OMM/GP records with `satellite.js` `json2satrec`.
- Propagates positions locally with SGP4; no fake satellite markers are drawn.
- Default group: `stations`.
- The settings popup can select:
  - `stations`: small, clean station-related set;
  - `active`: broad active catalog;
  - `starlink`: Starlink constellation;
  - `weather`: meteorological satellites;
  - `gps-ops`: operational GPS;
  - `visual`: commonly visible objects;
  - `last-30-days`: recently updated/launched objects;
  - `geo`: geostationary objects;
  - `science`: science missions.
- `CELESTRAK_GROUP` remains a local fallback, but the UI selector has priority
  once a user chooses a group.
- Density presets:
  - `LOW`: process 200 objects, draw up to 40 markers;
  - `MEDIUM`: process 800 objects, draw up to 80 markers;
  - `HIGH`: process 2000 objects, draw up to 200 markers;
  - `CUSTOM`: user-defined local caps.
- Cache TTL: 6 hours.
- CelesTrak can respond with a `403` cache-window message when the same group
  is requested again before its GP data has updated; AegisUi reports this as
  `RATE_LIMITED`/cache-window status rather than drawing stale fake markers.
- Position refresh interval: 60 seconds while ON.
- OFF means no CelesTrak requests, no propagation timer and no satellite
  markers.
- Successful propagation reports `ONLINE` and draws only real calculated
  positions.
- If the catalog loads but SGP4 cannot calculate positions, the layer reports
  `POSITION_ENGINE_ERROR`.

### `OCEAN_ALERTS`

- Uses NOAA/NDBC active station XML.
- Cache TTL: 10 minutes.
- Refresh interval: 10 minutes while ON.
- Source is configurable between NDBC active stations and DART tsunami buoys.
- Filter mode is configurable:
  - visible map bounds;
  - global;
  - coastal-only best-effort filtering from real NOAA/NDBC station metadata.
- Marker cap is configurable: 100, 500 or 1500 stations.
- Clicking a station attempts to load its latest public realtime observation.
- If no station exists in the visible area, the layer reports `NO_DATA`.

## Map controls

- `⚙` opens the map-layer settings popup.
- `⛶` expands/collapses the map inside the app with a short local cockpit
  transition sound when UI sounds are enabled.
- `⌖` asks the browser/Electron geolocation API for current location. If
  permission is unavailable or denied, the map shows `LOCATION PERMISSION
  REQUIRED` / fallback status and centers on the configured local fallback
  rather than storing or committing private coordinates.

## Configuration

Copy `.env.example` to `.env` for private local development:

```sh
cp .env.example .env
```

Optional map variables:

```text
AEGISUI_TOMTOM_API_KEY=
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=
OPENSKY_ACCESS_TOKEN=
AISSTREAM_API_KEY=
CELESTRAK_GROUP=stations
```

Do not commit `.env`, API keys, tokens, account sessions or exported private
configuration.

Layer toggle preferences are stored locally in app data as `map-layers.json`
and mirrored in renderer localStorage. That file contains active/opacity/mode
preferences only; it should not contain provider secrets.

## Offline and fallback behavior

- If the app is offline, online providers report `OFFLINE` or remain `OFF`.
- Missing TomTom key reports `API_KEY_MISSING`.
- Missing AISStream key reports `CONFIG_REQUIRED`.
- OpenSky throttling reports `RATE_LIMITED`.
- Provider outages report `SERVICE_UNAVAILABLE`.
- Empty real results report `NO_DATA`.
- Satellite catalog data does not become map markers unless local SGP4
  propagation calculates real latitude/longitude positions.

## Privacy and performance

- Disabled layers do not call providers.
- Provider data is not logged by default.
- Refresh intervals are deliberately conservative.
- AIS/OpenSky views can reveal regions of interest; export config carefully.
- API keys are not exported or committed.
- Public providers may be delayed, filtered, incomplete or rate-limited.

## Adding another provider

1. Add a provider file under `src/classes/map/providers/`.
2. Implement `start()`, `stop()`, `refresh()`, `isConfigured()` and `getStatus()`.
3. Register it in `mapLayerRegistry.js`.
4. Add layer metadata in `EngineeringMapPanel.createLayerDefinitions()`.
5. Define cache TTL, marker limit, fallback state and cleanup behavior.
6. Ensure OFF performs no requests, sockets, polling or rendering.
7. Update `.env.example`, `CONFIGURATION.md`, `INTEGRATIONS.md` and this file.
