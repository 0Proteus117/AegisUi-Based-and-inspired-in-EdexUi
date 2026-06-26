# MAP SYSTEMS ACTIVATION — Audit

Baseline: `feature/systems-online-pass` at `0e7b0d4 v1.9.6 ui layout rescue controlled navigation polish`

Scope: Local Situation / Situational Awareness map only.

## 1. Current map files and components

| Area | File | Current role |
| --- | --- | --- |
| Engineering dashboard map UI and controller | `src/classes/engineeringDashboard.class.js` | Builds the `LOCAL SITUATION` panel, creates the Leaflet map, defines layer metadata, renders toggles, persists layer preferences, activates/deactivates overlays and draws current placeholders. |
| Electron boot / IPC helpers | `src/_boot.js` | Owns `map-layers.json` in app data, sanitizes map-layer preferences, exposes `map-layers-read`, `map-layers-save`, `rainviewer-metadata` and `traffic-open-key-page` IPC handlers. |
| Map styling | `src/assets/css/engineering.css` | Styles the Leaflet canvas, layer toggle rail, readout cards, traffic key form and placeholder tooltip. |
| Leaflet assets | `src/ui.html`, `src/assets/vendor/leaflet/*` | Loads local Leaflet CSS/JS. |
| Configuration examples | `.env.example`, `config.example.json`, `map-layers.example.json` | Document optional TomTom key and local map-layer preferences. |
| Existing docs | `MAP_LAYERS.md`, `CONFIGURATION.md`, `OFFLINE_MODE.md`, `INTEGRATIONS.md`, `README.md`, `CHANGELOG.md` | Describe the current map foundation and placeholder status of future layers. |

## 2. Base map initialization

The base map is initialized in `EngineeringMapPanel` inside `src/classes/engineeringDashboard.class.js`.

- Library: Leaflet.
- DOM target: `#eng_map_canvas`.
- Initial view: Madrid `[40.4168, -3.7038]`, zoom `10`.
- Base tiles: OpenStreetMap tile endpoint `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
- Leaflet uses `preferCanvas: true`.
- Tile failure updates the top status to either `OFFLINE MODE · LOCAL DATA` or `BASE MAP SERVICE UNAVAILABLE`.
- A local network geo/IP module can later recenter the map through `updateLocation()`.

Current risk: base-map tile errors only affect the status text. There is no provider object or retry/cooldown state around the base map.

## 3. Road traffic

Traffic is currently managed in `EngineeringMapPanel.activateTrafficLayer()`.

- Provider: TomTom traffic flow tiles.
- URL pattern: `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png`.
- Key source: `window.settings.tomtomApiKey` / `this.trafficKey`, with optional runtime config loaded through IPC.
- UI config: `#eng_traffic_form` saves the key into local `settings.json` through renderer filesystem access.
- Missing key state: `API_KEY_MISSING`.
- Offline state: `OFFLINE`.
- Tile error state: `SERVICE_UNAVAILABLE`.
- Timer/polling: none; the tile layer loads only when active.
- Cleanup: `cleanupLayer()` removes the Leaflet tile layer when toggled off.

Current risk: traffic activation logic is embedded directly in the dashboard class, so adding provider-specific behavior increases the size and fragility of one component.

## 4. Weather radar

Radar is currently managed in `EngineeringMapPanel.activateRadarLayer()`.

- Metadata IPC: `rainviewer-metadata` in `src/_boot.js`.
- Provider: RainViewer public weather maps.
- Metadata URL: `https://api.rainviewer.com/public/weather-maps.json`.
- Metadata timeout: `getJSON()` in `_boot.js` uses an 8 second timeout.
- Tile URL: uses the latest `radar.past` frame from RainViewer metadata.
- Key required: no.
- Offline state: `OFFLINE`.
- Missing/unavailable metadata state: `SERVICE_UNAVAILABLE`.
- Tile error state: `SERVICE_UNAVAILABLE`.
- Timer/polling: the layer definition declares an interval, but no recurring refresh timer is started today.
- Cleanup: `cleanupLayer()` removes the Leaflet tile layer when toggled off.

Current risk: radar has no cache beyond the currently attached tile layer and does not refresh on its declared interval.

## 5. Current toggles

Layer toggles are rendered by `EngineeringMapPanel.renderLayerControls()`.

Current toggles:

- `TRAFFIC` → `ROAD_TRAFFIC`
- `RADAR` → `WEATHER_RADAR`
- `AIR` → `AIR_TRAFFIC`
- `SEA` → `MARITIME_AIS`
- `SAT` → `SATELLITES`
- `OCEAN` → `OCEAN_ALERTS`

The toggle state is reflected through button classes and the `small` state label.

Current risk: toggles for future layers can be activated, and activation currently draws decorative placeholder geometry. Under the new phase rules, this must stop: future/optional layers must show real provider data, a real configuration/service state, or remain off with no resource use.

## 6. Real layers today

| Layer | Current reality |
| --- | --- |
| `ROAD_TRAFFIC` | Real TomTom tile overlay when a user key exists. |
| `WEATHER_RADAR` | Real RainViewer metadata + tile overlay. |

## 7. Mock / placeholder layers today

| Layer | Current behavior | Problem |
| --- | --- | --- |
| `AIR_TRAFFIC` | Activating it sets `PLACEHOLDER` and draws an aircraft-like vector near the current map center. | Decorative/fake geometry; no OpenSky or ADS-B provider call. |
| `MARITIME_AIS` | Activating it sets `PLACEHOLDER` and draws a dashed vessel-like track. | Decorative/fake geometry; no AIS provider call or config state. |
| `SATELLITES` | Activating it sets `PLACEHOLDER` and draws an orbital arc. | Decorative/fake geometry; no CelesTrak data or position engine. |
| `OCEAN_ALERTS` | Activating it sets `PLACEHOLDER` and draws an alert ring. | Decorative/fake geometry; no NOAA/NDBC/CO-OPS data. |

The placeholder drawing is implemented in `activatePlaceholderLayer()` and `renderPlaceholderLayer()` inside `src/classes/engineeringDashboard.class.js`.

## 8. External calls currently present

| Service | Where | Trigger | Key |
| --- | --- | --- | --- |
| OpenStreetMap tiles | Renderer Leaflet base layer | Map initialization and map movement | No |
| TomTom traffic tiles | Renderer Leaflet traffic layer | `ROAD_TRAFFIC` active and key exists | Yes |
| RainViewer metadata | Main process IPC `rainviewer-metadata` | `WEATHER_RADAR` active | No |
| RainViewer radar tiles | Renderer Leaflet radar layer | `WEATHER_RADAR` active after metadata | No |
| TomTom key documentation | Main process IPC `traffic-open-key-page` | User clicks `GET FREE KEY` | No |

No OpenSky, AISStream, CelesTrak or NOAA calls exist yet.

## 9. API keys currently used

| Key | Current status |
| --- | --- |
| `AEGISUI_TOMTOM_API_KEY` | Documented in `.env.example`; used indirectly through settings/runtime config for TomTom traffic. |
| `AEGISUI_ADSB_API_KEY` | Documented as future placeholder only; not called. |
| `AEGISUI_AIS_API_KEY` | Documented as future placeholder only; not called. |

There are no hardcoded provider keys in the map code found during this audit.

## 10. Fallbacks currently present

| Area | Existing fallback |
| --- | --- |
| Base map | Updates status on tile error. |
| Traffic | `API_KEY_MISSING`, `OFFLINE`, `SERVICE_UNAVAILABLE`. |
| Radar | `OFFLINE`, `SERVICE_UNAVAILABLE`, normalized provider errors. |
| Future layers | `FUTURE` when off, `PLACEHOLDER` when on. |
| Layer preferences | Falls back to defaults if localStorage or `map-layers.json` cannot be read. |

Current gap: future layers do not have provider-specific states such as `CONFIG_REQUIRED`, `RATE_LIMITED`, `NO_DATA` or `POSITION_ENGINE_REQUIRED`.

## 11. Timers, listeners and polling

| Resource | Current behavior |
| --- | --- |
| Location timer | `locationTimer = setInterval(() => this.updateLocation(), 3000)` starts in the map constructor and is unrelated to optional layers. No explicit destructor was found. |
| Layer timers | Layer objects have a `timer` field and `cleanupLayer()` clears it, but current traffic/radar/future layers do not actually start provider refresh timers. |
| Leaflet tile listeners | Traffic/radar attach `tileerror` listeners to their tile layers; removing the Leaflet layer is the current cleanup path. |
| Placeholder layer | A single `L.layerGroup()` is cleared and removed when placeholders change or layers deactivate. |
| AIS/WebSocket | Not implemented. |
| Fetch abort controllers | Not implemented. |

Current risk: new providers must explicitly own and clean timers, request abort controllers, marker groups and sockets. Disabled layers must not poll.

## 12. Cleanup on layer off

Current cleanup is centralized in `EngineeringMapPanel.cleanupLayer(layer)`.

It currently:

- clears `layer.timer`;
- removes `layer.leafletLayer` from the Leaflet map if present;
- resets `layer.leafletLayer` to `null`;
- rerenders the placeholder layer.

Current gap: this cleanup is enough for simple Leaflet tile layers, but not enough for real provider adapters with multiple marker groups, live sockets, pending fetches, throttled retries or provider-specific caches.

## 13. Current risks

| Risk | Level | Notes |
| --- | --- | --- |
| Fake map signals | High | The four future layers draw convincing but non-real geometry when active. This must be removed. |
| Single large dashboard class | Medium | Map lifecycle, UI, providers, config and rendering are all mixed in one file. |
| No provider registry | Medium | There is no central interface for `start()`, `stop()`, `refresh()`, status and cleanup. |
| Radar interval not active | Low/Medium | Radar declares an interval but does not use it for refresh. |
| No request abort/cooldown | Medium | Future API providers need abort/cooldown handling to avoid leaks and retries after OFF. |
| Satellite position engine missing | Medium | CelesTrak data can be fetched without a new dependency, but real map markers require an orbital propagation engine. No fake satellite positions should be drawn. |
| AIS requires user key | Medium | AISStream-style providers require configuration; without a key the correct state is `CONFIG_REQUIRED`. |
| Renderer filesystem write for traffic key | Existing risk | This predates the phase. It stores locally, not in Git, but is not part of this map-only provider activation unless refactored later. |

## 14. Minimum implementation plan

1. Add a small map-provider architecture under `src/classes/map/` without new dependencies.
2. Move layer metadata/status handling into a `mapLayerRegistry` while keeping the existing UI surface intact.
3. Replace placeholder activation with real provider outcomes:
   - OpenSky fetches real state vectors when `AIR` is ON.
   - AIS shows `CONFIG_REQUIRED` until a user key is configured; if configured, connect through a provider adapter and render only live messages.
   - CelesTrak fetches real GP/TLE JSON data; do not render markers until a real position engine is approved.
   - NOAA fetches real station/buoy metadata and renders only real station coordinates.
4. Keep TomTom traffic and RainViewer radar visually and behaviorally stable, but wrap them in provider objects.
5. Add per-provider cache TTL and resource cleanup:
   - no requests/timers/sockets while OFF;
   - clear timers, marker groups, tile layers and sockets on OFF;
   - classify `OFFLINE`, `API_KEY_MISSING`, `CONFIG_REQUIRED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `NO_DATA`, `POSITION_ENGINE_REQUIRED` and `ERROR`.
6. Update map docs/config examples:
   - `.env.example`;
   - `config.example.json`;
   - `map-layers.example.json`;
   - `MAP_LAYERS.md`;
   - `CONFIGURATION.md`;
   - `INTEGRATIONS.md`;
   - `CHANGELOG.md`.
7. Validate the app start and map behavior after each functional commit.

## Implementation boundary

This audit intentionally does not change runtime startup, workspaces, Project Control, media, calendar, packages, locks or Electron boot ordering.
