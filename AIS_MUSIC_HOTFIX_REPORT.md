# AIS / Apple Music Hotfix Report

## v2.1.2 audit

SEA CURRENT:

- provider files:
  - `src/classes/map/providers/aisProvider.js`
  - `src/classes/map/mapLayerRegistry.js`
  - `src/classes/engineeringDashboard.class.js`
  - `src/assets/css/engineering.css`
- websocket lifecycle:
  - before: one AISStream socket per activation, with full marker redraw on
    every incoming AIS message.
  - after: one active socket, explicit close before reconnect, debounced
    viewport subscription updates and batched marker rendering.
- subscription mode:
  - before: normal mode could use `WORLD_SAMPLE` / broad global subscription.
  - after: default is `CURRENT_VIEW`; `WORLD_SAMPLE` is explicit and limited to
    selected high-traffic boxes.
- current bounding box:
  - `CURRENT_VIEW` uses Leaflet map bounds.
  - no-vessel inland views can fall back to a controlled maritime preset.
- current marker cap:
  - default visible cap is 150 vessels.
  - selectable caps: 50, 100, 150, 250.
  - memory buffer cap: 1000 vessels.
- current render frequency:
  - render batch throttle: about 7 seconds.
  - subscription refresh minimum: 60 seconds.
- current dedupe method:
  - MMSI.
- icon used:
  - dedicated teal/cyan vessel hull + wake icon, distinct from aircraft
    triangles.
- observed issue:
  - global/broad AIS input caused visual churn and marker flicker.

MUSIC CURRENT:

- music files:
  - `src/classes/engineeringDashboard.class.js`
  - `src/_boot.js`
  - `src/assets/css/engineering.css`
- Apple Music integration method:
  - local macOS Music.app via JXA/AppleScript executed by `osascript`.
  - no Apple Music cloud API.
- current error:
  - UI treated some local states as generic disconnected/unavailable instead of
    showing `NOT RUNNING`, `PERMISSION_REQUIRED`, `CONNECTED` or `ERROR`.
- permissions/automation status if detectable:
  - `-1743` is mapped to `PERMISSION_REQUIRED`.
- fallback status:
  - if Music.app is not running, the panel shows `NOT RUNNING` and offers
    `OPEN MUSIC`.

No API keys, tokens, local logs, audio samples or model files are included in
this report.
