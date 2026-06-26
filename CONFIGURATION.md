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
- `map-layers.json`: Local Situation layer preferences for traffic, radar and
  future air/maritime/satellite/ocean placeholders. It does not contain API
  keys.
- `launch-bay-games.json`: manual Launch Bay game library with titles,
  platforms, safe launch URLs and local cover/hero image paths. It does not
  contain tokens or account sessions.
- `developer-deck.json`: Developer workspace preferences, including the active
  project path, favorite scripts and display limits. It should not contain
  secrets.
- `agent-command.json`: Agent Command local agent definitions, task-board
  items, prompt templates and placeholder output. It should not contain API
  keys, tokens, `.env` contents or private chat/history data.

Generated caches and helpers can also exist there, for example GeoIP data,
application icons and the native Calendar helper. Do not share those by
default.

## API keys

Traffic is optional and uses TomTom.

For local development, copy:

```sh
cp .env.example .env
```

Then add your own key:

```text
AEGISUI_TOMTOM_API_KEY=
```

Never commit `.env`. It is ignored by Git.

Weather radar currently uses RainViewer public metadata and does not require a
key. Air, maritime, satellite and ocean layers are placeholders in v1.5.x and
do not require keys yet. Launch Bay uses local manual configuration and safe
launcher URLs; SteamGridDB is documented only as a future optional artwork API.
Developer Deck uses local read-only Git/package/runtime metadata and does not
need API keys. You can set its initial project with
`AEGISUI_DEVELOPER_PROJECT` or later through the local `developer-deck.json`
file. Agent Command does not connect to AI providers in v1.8.0 and does not
need API keys. Calendar and Apple Music use local macOS permissions rather than
storing account passwords in the project.

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
agent/task-board structure. These examples are intentionally conservative and
contain no secrets. The current app does not require those files to run; they
are safe places to document local preferences while the code continues to use
the macOS application-data folder.
