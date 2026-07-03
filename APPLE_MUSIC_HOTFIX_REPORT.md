# Apple Music regression hotfix report

Version: v2.1.3

## Files found

- `src/_boot.js`: Electron IPC bridge for Music status, open, artwork,
  playlist launch and playback controls.
- `src/classes/engineeringDashboard.class.js`: Engineering Cockpit Apple Music
  panel, status labels, fallback UI and control buttons.
- `scripts/test-apple-music.js`: direct local Music.app validation script.
- `README.md`, `CONFIGURATION.md`, `CHANGELOG.md`: documentation notes.

## Commands/scripts used before the fix

- `music-status` used JXA with `Application("Music").running()`.
- `music-artwork` also used `Music.running()`.
- playlist and playback controls used JXA direct calls to Music.
- The UI mapped any `-1743` returned from the status bridge to
  `APPLE MUSIC PERMISSION REQUIRED` and set `Music app: UNKNOWN`.

## Root cause

The regression was not that the local playlist index failed. Playlists could
still render, proving the panel itself was alive. The fragile part was the
status bridge: `Music.running()` can trigger an Automation/TCC failure before
any direct Music command returns useful data. The renderer then treated that
single bridge failure as a full Apple Music permission failure.

## Fix

- Removed `Music.running()` from the Apple Music bridge path.
- Added a non-Automation `/usr/bin/pgrep -x Music` process check.
- Switched Music status, open, playlist launch and playback controls to direct
  AppleScript `tell application "Music"` commands.
- Kept artwork retrieval guarded by the process check so it no longer calls
  `Music.running()`.
- Added explicit error classification:
  - `MUSIC_AUTOMATION_PERMISSION_REQUIRED`
  - `SYSTEM_EVENTS_PERMISSION_REQUIRED`
  - `MUSIC_NOT_RUNNING`
  - `CONNECTED_STOPPED`
  - `CONNECTED_NO_TRACK`
  - `ERROR`
- Updated the UI so Music app status is no longer shown as `UNKNOWN` when the
  backend can determine whether Music.app is running.

## System Events

The Apple Music module does not use System Events in v2.1.3. If a future
auxiliary check needs System Events, it must not be allowed to block direct
Music.app playback controls.
