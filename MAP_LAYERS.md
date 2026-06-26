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
| `SATELLITES` | `SAT` | CelesTrak GP JSON catalog | OFF | No key; `CELESTRAK_GROUP` optional |
| `OCEAN_ALERTS` | `OCEAN` | NOAA/NDBC active stations | OFF | No key |

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
| `POSITION_ENGINE_REQUIRED` | Real satellite catalog data loaded, but map positions need a future orbital propagation engine. |
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

### `AIR_TRAFFIC`

- Uses OpenSky `states/all` with the visible map bounding box.
- Anonymous access is allowed but can be rate-limited.
- Optional auth:
  - `OPENSKY_ACCESS_TOKEN`; or
  - `OPENSKY_CLIENT_ID` + `OPENSKY_CLIENT_SECRET` for OAuth client credentials.
- Cache TTL: 45 seconds.
- Refresh interval: 60 seconds while ON.
- Marker cap: 120 aircraft.
- OFF means no requests and no aircraft markers.

### `MARITIME_AIS`

- Uses AISStream over secure WebSocket.
- Requires `AISSTREAM_API_KEY`.
- Missing key shows `CONFIG_REQUIRED`.
- OFF means no WebSocket and no vessel markers.
- The layer closes the socket and clears markers when disabled.
- Marker cap: 150 vessels.

### `SATELLITES`

- Uses CelesTrak GP JSON data.
- Default group: `stations`.
- Override group with `CELESTRAK_GROUP`.
- Cache TTL: 6 hours.
- The layer does not draw orbital markers yet because the project does not
  include an approved SGP4/orbital propagation engine.
- Successful catalog load reports `POSITION_ENGINE_REQUIRED`, not fake markers.

### `OCEAN_ALERTS`

- Uses NOAA/NDBC active station XML.
- Cache TTL: 10 minutes.
- Refresh interval: 10 minutes while ON.
- Filters stations to the visible map area when possible.
- Marker cap: 180 stations.
- Clicking a station attempts to load its latest public realtime observation.
- If no station exists in the visible area, the layer reports `NO_DATA`.

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
- Satellite catalog data does not become map markers until a real position
  engine is approved.

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
