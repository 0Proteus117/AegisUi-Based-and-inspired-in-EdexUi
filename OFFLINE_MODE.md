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
| OpenStreetMap base map | Online optional | Tiles require network; the panel remains visible if tiles fail. |
| RainViewer radar | Online optional | No key required; unavailable service shows a radar-unavailable state. |
| TomTom traffic | Online optional | Requires the user's own key; missing key is a normal state. |
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
- Calendar permission denied: Calendar shows a local permissions/account
  prompt instead of crashing.
- Apple Music permission denied: Music shows a disconnected/permission state
  and keeps the visual fallback.

## Polling and timeouts

- Calendar refreshes every five minutes while connected.
- Music polls local playback state every two seconds while connected.
- Network status checks local interface state every two seconds.
- RainViewer metadata and update checks now have explicit timeouts.
- External IP lookup has a short timeout and does not log raw response bodies.
