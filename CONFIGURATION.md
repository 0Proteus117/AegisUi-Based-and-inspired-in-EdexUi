# AegisUi configuration

AegisUi is designed to keep personal data out of the repository.

The current application bundle is still named `EdexUi-Eng`; therefore macOS
stores app data in:

```text
~/Library/Application Support/EdexUi-Eng
```

You can confirm the folder with:

```sh
npm run config:where
```

## Repository files

Safe files to commit:

- source code in `src/`;
- default examples such as `.env.example` and `config.example.json`;
- documentation;
- package manifests and lockfiles.

Private files that must not be committed:

- `.env`;
- `.env.local`;
- `user-config.local.json`;
- `api-keys.local.json`;
- `secrets.local.json`;
- `assistant/profiles/private/`;
- `assistant/voices/private/`;
- `assistant/memory/private/`;
- private voice samples such as `.wav`, `.mp3`, `.flac`;
- model weights such as `.pt`, `.pth`, `.ckpt`, `.safetensors`;
- exported local data;
- build artifacts such as `.dmg`, `.zip` and `dist/`.

## Local app data

The app currently uses JSON files in the macOS application-data folder:

- `settings.json`: UI/app preferences and optional TomTom traffic key.
- `shortcuts.json`: keyboard shortcuts.
- `lastWindowState.json`: fullscreen/window state.
- `projects.json`: Project Timelines and Project Control data.
- `projects.backup.json`: automatic project backup.
- `music-playlists.json`: local Apple Music playlist launcher list.
- `map-layers.json`: Local Situation layer preferences for traffic, radar,
  air, maritime AIS, marine weather, satellite and ocean layers. It does not
  contain API keys.
- `launch-bay-games.json`: manual Launch Bay game library with titles,
  platforms, safe launch URLs and local cover/hero image paths. It does not
  contain tokens or account sessions.
- `developer-deck.json`: Developer workspace preferences, including the active
  project path, favorite scripts and display limits. It should not contain
  secrets.
- `agent-command.json`: Agent Command local agent definitions, task-board
  items, prompt templates and placeholder output. It should not contain API
  keys, tokens, `.env` contents or private chat/history data.
- `workspace-state.json`: last active workspace and navigation mode. It is
  local state only and contains no credentials.
- Assistant Presence settings are stored in renderer localStorage under
  `aegisui-assistant-settings-v1`. They contain only visual preferences,
  aliases, active assistant, muted state and backend status placeholders.
  v2.1.1 also uses these local settings to select Gustav/Ares or
  Angie/Aphrodite microcopy. No assistant prompts, chat history, voice samples
  or API keys are stored there.

## Apple Music local Automation

Apple Music integration is local-only. It uses macOS Music.app Automation via
`/usr/bin/osascript -l JavaScript` and direct `Application("Music")` calls.
It does not use the Apple Music cloud API and does not depend on System Events.

The playlist sidebar is a cached local launcher index from
`music-playlists.json`. A live `CONNECTED` state is shown only after a Music.app
Automation call succeeds in the current run.

Packaged builds must keep a stable identity for macOS Automation/TCC:

- Product name: `EdexUi-Eng`
- Bundle identifier: `com.edex.ui.eng`

When a manual package replaces files inside the `.app`, re-sign the app after
resource injection. Otherwise macOS can reject Music.app Apple Events with
`-1743` even when System Settings already shows Automation permission enabled.
Use `scripts/diagnose-macos-automation-identity.js` to inspect a packaged app.

Generated caches and helpers can also exist there, for example GeoIP data,
application icons and the native Calendar helper. Do not share those by
default.

## API keys and optional map providers

Map/network providers are optional. The app should run without any provider
keys; missing configuration becomes an in-app state such as
`API_KEY_MISSING`, `CONFIG_REQUIRED`, `OFFLINE` or `SERVICE_UNAVAILABLE`.

For local development, copy:

```sh
cp .env.example .env
```

Then add only the keys/configuration you personally want to use:

```text
TOMTOM_API_KEY=
AEGISUI_TOMTOM_API_KEY=
TOMTOM_KEY=
VITE_TOMTOM_API_KEY=
REACT_APP_TOMTOM_API_KEY=
OPENSKY_USERNAME=
OPENSKY_PASSWORD=
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=
OPENSKY_ACCESS_TOKEN=
AISSTREAM_API_KEY=
CELESTRAK_GROUP=stations
```

Never commit `.env` or `.env.local`. Both are ignored by Git. For packaged
local use, the app also checks `~/Library/Application Support/EdexUi-Eng/.env`
and `.env.local`.

Current map providers:

- TomTom base map and road traffic: optional. The base map can fall back to
  OSM; traffic remains TomTom-only. Accepted key aliases are `TOMTOM_API_KEY`,
  `AEGISUI_TOMTOM_API_KEY`, `TOMTOM_KEY`, `VITE_TOMTOM_API_KEY` and
  `REACT_APP_TOMTOM_API_KEY`. v2.0.7 tests TomTom Flow Tiles first and can
  render real Flow Segment polylines when tiles are unavailable but the segment
  endpoint responds.
- RainViewer precipitation radar: optional, no key.
- OpenSky air traffic: optional, can run anonymously with rate limits; OAuth or
  bearer token can be supplied through the OpenSky variables.
- AISStream maritime AIS: optional, requires `AISSTREAM_API_KEY`. v2.1.2 uses
  AISStream live WebSocket data through current-view or named maritime presets
  rather than a normal whole-world subscription. It buffers and deduplicates by
  MMSI, throttles rendering, expires stale vessels and never draws markers
  without real latitude/longitude.
- Open-Meteo Marine: optional, no key. This provides real sea-state conditions,
  not vessel positions; inland map views can fall back to configured sea
  presets so the MARINE layer can still show real ocean cells.
- CelesTrak satellite layer: optional, no key; `CELESTRAK_GROUP` selects the
  initial fallback catalog group, while the in-app map settings selector has
  priority after the user chooses a group. Satellite positions are calculated
  locally with `satellite.js` SGP4 propagation from real GP/TLE records and no
  fake markers are drawn.
- NOAA/NDBC ocean stations: optional, no key for the public station endpoints
  used by AegisUi.

## Local map settings

The `Local Situation` map has an in-app `⚙` settings popup. These preferences
are stored in renderer localStorage on the same Mac and are not committed:

- selected CelesTrak group: `stations`, `active`, `starlink`, `weather`,
  `gps-ops`, `visual`, `last-30-days`, `geo` or `science`;
- SAT density: `LOW`, `MEDIUM`, `HIGH` or `CUSTOM`;
- selected base-map provider/fallback mode;
- AIR marker cap, refresh interval and visible/wide bounds mode;
- SEA AIS marker cap, current-view/preset mode, refresh interval, clustering,
  label and wake preferences;
- Marine Weather mode/preset/marker cap;
- OCEAN source/filter/max station count;
- radar provider, radar opacity and traffic opacity;
- local UI-sound toggle;
- default map-location behavior.

Location coordinates entered as a custom fallback are local-only. Do not copy
private coordinates into repository files, issues or screenshots unless you
intend to share them.

Launch Bay uses local manual configuration and safe launcher URLs; SteamGridDB
is documented only as a future optional artwork API.
Developer Deck uses local read-only Git/package/runtime metadata and does not
need API keys. You can set its initial project with
`AEGISUI_DEVELOPER_PROJECT` or later through the local `developer-deck.json`
file. Agent Command does not connect to AI providers in v1.8.0 and does not
need API keys. Calendar and Apple Music use local macOS permissions rather than
storing account passwords in the project. In v2.1.3, Apple Music status and
controls talk directly to Music.app and do not require System Events.

Assistant voice provider roadmap is local-only in v2.1.1:

- Default Robotic: planned shell, not connected.
- Local Custom Voice: future BYOV/local-only route.
- Google Emotional TTS: optional future cloud route, not connected and never
  required.

## Export and import

Export a portable configuration bundle:

```sh
npm run config:export -- --out ./aegisui-config-export.json
```

Import on another Mac:

```sh
npm run config:import -- --from ./aegisui-config-export.json
```

The exporter removes known sensitive fields such as API keys, tokens, secrets,
passwords, cookies and sessions. Add API keys separately on the destination
Mac.

## Configuration examples

`config.example.json` is a human-readable template for a private
`user-config.local.json`. `map-layers.example.json` shows the safe map layer
preference structure. `launch-bay-games.example.json` shows the manual game
library structure. `developer-deck.example.json` shows the Developer workspace
configuration structure. `agent-command.example.json` shows the Agent Command
agent/task-board structure. `workspace-state.json` is generated by the app and
is exportable through the safe configuration exporter. These examples are
intentionally conservative and contain no secrets. The current app does not
require those files to run; they are safe places to document local preferences
while the code continues to use the macOS application-data folder.
