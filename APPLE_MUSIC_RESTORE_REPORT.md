# Apple Music restore report

Phase: `v2.1.4 restore apple music known good bridge`

## Current Apple Music files

- `src/_boot.js`: main-process IPC bridge for Music.app status, artwork,
  playlist launch, playback controls, shuffle and repeat.
- `src/classes/engineeringDashboard.class.js`: cockpit music UI, diagnostics,
  controls and local playlist launcher rendering.
- `scripts/test-apple-music.js`: earlier direct AppleScript diagnostic.
- `scripts/test-apple-music-runtime.js`: runtime-equivalent JXA/osascript
  diagnostic added in this phase.
- `scripts/diagnose-macos-automation-identity.js`: packaged-app identity and
  codesign diagnostic added in this phase.

## Commits reviewed

- `v2.1.1`: assistant visual/personality polish; Music still used the
  JXA/osascript bridge that was known to work.
- `v2.1.2`: AIS stability and Music hotfix; Music diagnostics were expanded.
- `v2.1.3`: Apple Music regression hotfix; error classification improved, but
  the user still saw `-1743` at runtime.

## Last known good bridge

The restored bridge follows the known-good local macOS path used before the
regression:

- `/usr/bin/osascript -l JavaScript -e <JXA>`
- direct `Application("Music")` calls;
- `/usr/bin/open -a Music` for launching Music.app;
- no Apple Music cloud API;
- no System Events dependency;
- no external service, token or audio capture.

## Relevant regression

The app was showing playlists while Apple Events failed. Those playlists are a
local launcher index (`music-playlists.json`) and must not be treated as proof
of a live Music.app connection.

The packaged manual app also showed a codesign/Info.plist mismatch after build
resources were replaced. macOS Automation/TCC permissions are tied to the app
identity, so an invalid or changed identity can produce `-1743` even when
System Settings already shows the app enabled for Music.

## Fix applied

- Restored the Music bridge to the JXA/osascript route.
- Kept `CONNECTED` dependent on a live Music.app call during the current run.
- Added runtime and packaged-identity diagnostics.
- The final manual package must be re-signed after resource injection while
  preserving the bundle identifier `com.edex.ui.eng`.
