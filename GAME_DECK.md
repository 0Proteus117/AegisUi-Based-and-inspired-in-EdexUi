# Launch Bay game deck

`LAUNCH BAY` is AegisUi's local-first game launcher workspace. It provides a
futuristic hangar-style library with a lightweight 3D carousel, selected-game
hero backdrop and direct launch button.

This foundation is manual by design. It does not scan installed games yet, does
not call cloud artwork services and does not execute arbitrary shell commands.

## Current behavior

- Adds the `LAUNCH BAY` workspace after `COMMS`.
- Reads games from the private local app-data file `launch-bay-games.json`.
- Shows configured games as a lightweight 3D carousel.
- Supports left/right navigation with buttons or keyboard arrow keys.
- Supports `Enter` to launch the selected configured game.
- Uses local cover and hero images when valid image paths are provided.
- Shows generated cockpit placeholders when images are missing.
- Shows `NOT CONFIGURED` when a game has no safe `launchUrl`.

## Local configuration file

The app creates this file on first run:

```text
~/Library/Application Support/EdexUi-Eng/launch-bay-games.json
```

You can use `launch-bay-games.example.json` as a safe template.

Each game supports:

```json
{
  "id": "my-steam-game",
  "title": "My Steam Game",
  "platform": "Steam",
  "launchUrl": "steam://rungameid/123456",
  "coverPath": "/Users/you/Pictures/Game Covers/my-steam-game-cover.jpg",
  "heroPath": "/Users/you/Pictures/Game Covers/my-steam-game-hero.jpg",
  "status": "installed",
  "tags": ["steam", "favorite"]
}
```

## Launch URLs

Launch Bay opens validated URLs through Electron's safe external opener.

Allowed protocol families in this foundation:

- `steam://rungameid/<APP_ID>`;
- `steam://open/games`;
- `https://...`;
- `com.epicgames.launcher://...`;
- `goggalaxy://...`;
- `battlenet://...`.

If `launchUrl` is empty, the UI shows `NOT CONFIGURED`.

The app does not run arbitrary shell commands, scripts or user-entered
executables. That is intentional.

## Local images

`coverPath` and `heroPath` should be absolute local paths to image files:

- `.jpg`;
- `.jpeg`;
- `.png`;
- `.webp`;
- `.gif`.

If the image is missing or unsupported, Launch Bay falls back to a cockpit
placeholder. No image is uploaded and no cloud provider is contacted.

## Future integrations

Future work can be added incrementally:

- Steam local library scan;
- SteamGridDB API for covers and hero images;
- Epic Games library import;
- GOG Galaxy library import;
- Battle.net library import;
- emulator profiles;
- manually installed games with stricter path validation.

SteamGridDB is a good future candidate for visual assets, but it would require
an API key and a separate opt-in integration. It is not used in this version.

## Security boundaries

Launch Bay must not:

- store tokens in Git;
- upload local game paths;
- execute arbitrary commands;
- open `file://`, `javascript:` or shell-like URLs;
- break if Steam or another launcher is not installed;
- scan private folders without explicit future consent.

Personal game configuration stays local and is ignored by Git unless the user
explicitly exports it through the safe configuration-export flow.

## Limitations

- No automatic game detection yet.
- No cloud artwork download yet.
- No launcher installation detection yet.
- No per-platform account integration yet.
- Local image paths must be absolute.
- Missing launchers are handled by macOS/provider behavior after opening the
  URL; AegisUi itself remains stable.
