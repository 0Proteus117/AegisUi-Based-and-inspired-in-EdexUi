# Offline and online behavior

AegisUi should not crash when the network is unavailable or an API key is
missing. The goal is graceful degradation: keep local tools alive and clearly
label unavailable services.

## Module classification

| Module | Classification | Notes |
| --- | --- | --- |
| Terminal | Fully offline | Uses a local shell and local pseudo-terminal. |
| System telemetry | Fully offline | CPU, RAM, uptime and process data come from the Mac. |
| Applications grid | Fully offline | Reads installed `.app` bundles locally. |
| Project Timelines | Offline with local data | Uses `projects.json` in app data. |
| Project Control | Offline with local data | Edits the same local project file and keeps a backup. |
| Apple Music | Offline with local app permissions | Talks to the local Music app via macOS Automation. Streaming availability depends on Music itself. |
| Calendar | Offline with local system data | Reads macOS EventKit calendars. iCloud/Outlook/Exchange must already be synced into macOS Calendar/Internet Accounts. |
| Workspaces | Offline with local/default data | External links only open when clicked. |
| Workspace state | Offline with local data | Uses `workspace-state.json` plus renderer local storage to remember the active workspace and navigation mode. |
| Launch Bay | Offline with local data | Uses `launch-bay-games.json`; cloud artwork and auto-detection are not enabled. |
| Developer Deck | Offline with local data | Uses `developer-deck.json`, local Git metadata and local package/runtime information. Script execution is disabled in the foundation build. |
| Agent Command | Offline with local data | Uses `agent-command.json`; AI providers, cloud context sending and autonomous actions are not enabled. |
| OpenStreetMap base map | Online optional | Tiles require network; the panel remains visible if tiles fail. |
| Local Situation layer toggles | Offline with local data | Preferences are stored in `map-layers.json` and mirrored in renderer local storage. |
| RainViewer radar | Online optional | No key required; unavailable service shows a radar-unavailable state. |
| TomTom traffic | Online optional | Requires the user's own key; missing key is a normal state. |
| Future air/maritime/satellite/ocean layers | Offline with placeholder data | Registered as `FUTURE`/`PLACEHOLDER`; no provider calls are made in v1.5.x. |
| GeoIP lookup | Offline after local database exists | First setup can download GeoLite2; offline mode skips download if missing. |
| Update checker | Online optional | Can be disabled with settings or `AEGISUI_DISABLE_UPDATE_CHECK=1`. |

## Environment switches

In a private `.env` file:

```text
AEGISUI_OFFLINE_MODE=1
AEGISUI_DISABLE_UPDATE_CHECK=1
```

Offline mode is intentionally conservative. It avoids optional online work
where currently supported, but it does not turn the app into a complete
offline map product. Live map tiles, radar and traffic still need online
providers.

## Expected fallback states

- No TomTom key: traffic remains off and the UI reports `TRAFFIC KEY MISSING`.
- TomTom unavailable: traffic tile failures report `TRAFFIC SERVICE UNAVAILABLE`.
- RainViewer unavailable: radar reports `RADAR UNAVAILABLE` or
  `RADAR SERVICE UNAVAILABLE`.
- Base map tile failures: the map panel reports `BASE MAP SERVICE UNAVAILABLE`
  while the rest of the HUB remains alive.
- Future map layers: disabled layers show `FUTURE`; enabled mock layers show
  `PLACEHOLDER` and do not contact external providers.
- Launch Bay: missing game images show cockpit placeholders; missing launch
  URLs show `NOT CONFIGURED`; Steam/custom launcher URLs are opened only when
  explicitly clicked.
- Developer Deck: missing Git/package data shows unavailable/placeholder rows;
  sensitive files such as `.env`, keys, tokens and session files are not opened
  from the project structure panel.
- Agent Command: missing or malformed local config falls back to default local
  agents and example tasks; request/run buttons report that AI provider
  integration is not connected.
- Workspace state: missing local state falls back to `HUB`; imported state is
  sanitized to known-safe workspace ids.
- Calendar permission denied: Calendar shows a local permissions/account
  prompt instead of crashing.
- Apple Music permission denied: Music shows a disconnected/permission state
  and keeps the visual fallback.

## Polling and timeouts

- Calendar refreshes every five minutes while connected.
- Music polls local playback state every two seconds while connected.
- Network status checks local interface state every two seconds.
- RainViewer metadata and update checks now have explicit timeouts.
- Situational Awareness future layers do not poll while they are placeholders.
- Launch Bay does not poll or scan libraries in v1.6.0; it only reads the local
  JSON configuration when the workspace is rendered.
- Developer Deck runs short read-only local checks only when the workspace is
  rendered or refreshed. It has no timers, no polling loop and no cloud calls.
- Agent Command reads local JSON only when rendered or when the user updates a
  task. It has no timers, polling loop, provider calls or command execution.
- External IP lookup has a short timeout and does not log raw response bodies.
