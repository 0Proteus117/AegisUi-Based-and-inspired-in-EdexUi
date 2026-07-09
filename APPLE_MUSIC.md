# Apple Music Local Bridge

Version: v2.2.3

AegisUi controls Apple Music through local macOS Automation only. It does not use
Apple Music cloud APIs, tokens, audio capture or `System Events`.

## Bridge

- Bridge: `/usr/bin/osascript -l JavaScript`
- Target: `Application("com.apple.Music")`
- Bundle id expected for AegisUi: `com.edex.ui.eng`
- Product name: `EdexUi-Eng`

Allowed actions:

- read player state;
- read current track metadata;
- read playlists;
- play/pause;
- next/previous;
- shuffle/repeat;
- play a configured playlist name.

## Automation error `-1743`

`-1743` means macOS blocked Apple Events from `EdexUi-Eng` to Music.

Recovery:

1. Open Music.app.
2. Press `CONNECT APPLE MUSIC` in AegisUi.
3. If macOS prompts, allow `EdexUi-Eng` to control Music.
4. If needed, check System Settings → Privacy & Security → Automation.
5. Press `REFRESH`.

The UI reports this as `AUTOMATION_BLOCKED` and keeps the app stable. If Music is
closed, the UI reports `MUSIC_NOT_RUNNING` instead of pretending the bridge is
connected.

## Tests

```bash
node scripts/test-apple-music-bridge-static.js
node scripts/test-apple-music-runtime.js
```

The runtime test may report `AUTOMATION_BLOCKED` if macOS permission is missing;
that is a diagnosable local permission state, not a silent bridge crash.

## Packaged final validation

Dev validation is not enough for Apple Music Automation. macOS TCC evaluates the
real packaged app identity, so the final `.app` must keep:

- `CFBundleIdentifier`: `com.edex.ui.eng`
- Product name: `EdexUi-Eng`
- a valid app signature after `app.asar` and `Info.plist` are updated
- direct Music automation target: `com.apple.Music`

Run:

```bash
node scripts/test-apple-music-packaged-final.js
```

If the final app still shows `AUTOMATION_BLOCKED`, do not mark Apple Music as
connected. Use the manual TCC reset only if needed:

```bash
tccutil reset AppleEvents com.edex.ui.eng
```

Then close EdexUi-Eng and Music.app, open the final app from Finder, press
`CONNECT APPLE MUSIC`, accept the macOS prompt and press `REFRESH`.
