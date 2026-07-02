# MAP RUNTIME FIX REPORT — v2.0.7

Generated: 2026-07-02

Scope: Local Situation map runtime only. No API keys are printed here; suffixes
are masked.

## TRAFFIC

- files: `src/classes/map/providers/trafficProvider.js`,
  `src/classes/engineeringDashboard.class.js`, `scripts/test-map-providers.js`
- current provider: TomTom Traffic API
- current tile URL:
  `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?key=****&tileSize=256`
- key source: `.env.local`, masked as `****Gq3D`
- last HTTP status: Flow Tile `200`, Flow Segment Madrid `200`
- visible UI state: confirmed in Electron runtime as `ONLINE / TILES`

## SEA

- files: `src/classes/map/providers/aisProvider.js`,
  `src/classes/engineeringDashboard.class.js`, `scripts/test-map-providers.js`
- provider: AISStream global live WebSocket
- credential source: `.env.local`, masked as `****0f50`
- current AISStream subscription:
  `BoundingBoxes: [[[-90,-180],[90,180]]]`, message types `PositionReport`,
  `ShipStaticData`, `StandardClassBPositionReport`,
  `ExtendedClassBPositionReport`
- last error: none in provider diagnostic
- visible UI state: confirmed in Electron runtime as `ONLINE / AISSTREAM`
  with 250 real vessel markers buffered/rendered

## RADAR

- files: `src/classes/map/providers/weatherRadarProvider.js`,
  `scripts/test-map-providers.js`
- provider: RainViewer public weather maps
- tile URL: `{host}{latestFrame.path}/256/{z}/{x}/{y}/2/1_1.png`
- last frame: detected by diagnostic at runtime
- visible UI state: confirmed in Electron runtime as `ONLINE / RAINVIEWER`

## MARINE

- files: `src/classes/map/providers/marineWeatherProvider.js`,
  `src/classes/engineeringDashboard.class.js`, `scripts/test-map-providers.js`
- provider: Open-Meteo Marine
- endpoint: `https://marine-api.open-meteo.com/v1/marine`
- visible UI state: confirmed in Electron runtime as `ONLINE / OPEN-METEO`
  with 4 real sea cells

## Runtime diagnostics

- `TOMTOM_FLOW_SEGMENT`: OK
- `TOMTOM_FLOW_TILE`: OK
- `AISSTREAM_GLOBAL`: OK
- `RAINVIEWER`: OK
- `OPEN_METEO_MARINE`: OK

## Visual validation

- Electron dev runtime opened successfully.
- `TRAFFIC`: `ONLINE / TILES`
- `SEA`: `ONLINE / AISSTREAM`, 250 vessels
- `RADAR`: `ONLINE / RAINVIEWER`, latest frame loaded
- `MARINE`: `ONLINE / OPEN-METEO`, 4 sea cells
- `SAT`: `ONLINE`, 23 real satellite positions calculated during smoke test
- Expanded map control opened and closed without breaking the map.

## Security

- `.env.local` is ignored by Git.
- No provider key is stored in source, docs, reports or package metadata.
- Diagnostics only show masked suffixes.
