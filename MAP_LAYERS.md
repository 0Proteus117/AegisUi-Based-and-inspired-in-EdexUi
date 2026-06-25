# Map layers and Situational Awareness

AegisUi's `Local Situation` panel is moving from a fixed map/radar/traffic
widget into a modular situational-awareness surface. The goal is to let each
user profile enable only the layers it needs, without loading future providers,
timers or overlays while those layers are off.

This document describes the v1.5.x foundation. It does not add real air,
maritime, satellite or ocean integrations yet.

## 1. Objective

The map layer system should:

- preserve the existing base map, road traffic and weather radar behavior;
- expose optional layers through compact cockpit toggles;
- keep disabled layers fully idle;
- store user preferences locally;
- degrade cleanly when offline, missing an API key or when a service fails;
- make future provider integrations incremental instead of a rewrite.

## 2. Current layers

| Layer ID | Toggle | Provider type | Current behavior | API key |
| --- | --- | --- | --- | --- |
| `ROAD_TRAFFIC` | `TRAFFIC` | TomTom traffic tiles | Uses the existing live road traffic overlay when a TomTom key is configured. | Required |
| `WEATHER_RADAR` | `RADAR` | RainViewer public weather maps | Uses the existing radar overlay. | Not required |

## 3. Future layers

| Layer ID | Toggle | Future purpose | Current v1.5.x behavior |
| --- | --- | --- | --- |
| `AIR_TRAFFIC` | `AIR` | ADS-B aircraft situation layer. | Placeholder only. No provider calls. |
| `MARITIME_AIS` | `SEA` | AIS vessel movement and maritime logistics layer. | Placeholder only. No provider calls. |
| `SATELLITES` | `SAT` | Orbital objects based on TLE/GP data. | Placeholder only. No provider calls. |
| `OCEAN_ALERTS` | `OCEAN` | Buoys, tsunami alerts, tides, currents and water levels. | Placeholder only. No provider calls. |

## 4. Layer states

The map controller uses these states:

| State | Meaning |
| --- | --- |
| `OFF` | Layer is disabled. No overlay, timer or polling is active. |
| `LOADING` | Layer has been requested and is preparing data or tiles. |
| `ONLINE` | Layer is active and its current provider is responding. |
| `OFFLINE` | App or layer is unavailable because offline mode/network state prevents loading. |
| `API_KEY_MISSING` | Layer needs a user-owned key and none is configured. |
| `ERROR` | Provider call or tile loading failed, but the map remains alive. |
| `PLACEHOLDER` | Future layer is active only as a mock visual indicator. |
| `FUTURE` | Future layer is registered but disabled/not implemented yet. |

## 5. Possible providers

These are candidates for future research, not active dependencies:

- `AIR_TRAFFIC`
  - OpenSky Network;
  - ADS-B Exchange;
  - other public or commercial ADS-B feeds that allow desktop use.
- `MARITIME_AIS`
  - AISStream;
  - AISHub;
  - MarineTraffic or Kpler for commercial/advanced logistics use.
- `SATELLITES`
  - CelesTrak GP/TLE;
  - compatible TLE/GP datasets;
  - filtered subsets such as ISS, Starlink or orbital debris.
- `OCEAN_ALERTS`
  - NOAA NDBC / DART buoys;
  - NOAA CO-OPS tides, currents and water levels.

## 6. API keys

No new API keys are introduced in v1.5.x.

The only current map-related key is:

- `AEGISUI_TOMTOM_API_KEY` for optional TomTom road traffic.

Future provider keys must stay out of the repository. Prefer private `.env`
files or local app-data settings. Never commit personal keys, tokens,
sessions, cookies or account-specific data.

## 7. Privacy considerations

- Future air/maritime/satellite layers may reveal analysis interests, watched
  regions or operational workflows.
- Do not log raw provider responses unless explicitly needed for debugging.
- Do not export API keys with user configuration bundles.
- Keep provider terms of service visible in future integration notes.
- Prefer coarse, explicit refresh intervals over silent real-time tracking.

## 8. Performance considerations

Disabled layers must not:

- fetch metadata;
- create tile layers;
- render markers;
- start timers;
- keep listeners alive;
- retry in a loop.

Enabled layers should define a reasonable `updateIntervalMs` and clean up all
timers/listeners when toggled off. v1.5.x future layers are placeholders and
therefore do not poll.

## 9. Offline mode

The app should remain usable without internet:

- local modules continue to work;
- future layers remain `FUTURE` or `PLACEHOLDER`;
- TomTom traffic reports `API_KEY_MISSING`, `OFFLINE` or `ERROR` instead of
  crashing;
- RainViewer radar reports unavailable states instead of crashing;
- the base map may lose tiles, but the HUB should stay alive.

## 10. Adding a new layer later

When adding a real provider:

1. Add a layer definition in `EngineeringMapPanel.createLayerDefinitions()`.
2. Give it a stable uppercase `id`, short `label`, description, provider type,
   API-key requirement, recommended interval and render priority.
3. Add a toggle label that stays compact in `Local Situation`.
4. Implement activation only inside `activateLayer()`.
5. Start polling only after the user enables the layer.
6. Store timer handles on the layer object.
7. Stop timers and remove overlays inside `cleanupLayer()`.
8. Add explicit `API_KEY_MISSING`, `OFFLINE` and `ERROR` paths.
9. Document provider, privacy and rate limits here.
10. Add safe example configuration without keys.

## 11. Risks and limits

- Public/free providers may be rate-limited, incomplete or legally unsuitable
  for redistribution.
- Some commercial providers forbid caching or require paid keys.
- ADS-B and AIS feeds can be delayed, filtered or jurisdiction-dependent.
- TLE data is predictive and needs careful refresh/orbit handling.
- NOAA/ocean feeds differ widely by region and data cadence.
- A visually convincing layer must not imply verified real-time truth unless
  the provider and refresh cadence are clear.

The v1.5.x design intentionally creates the control surface first and leaves
heavy provider integration for a later, separately reviewed sprint.
