# Security policy

This repository is a personal AegisUi / EdexUi-Eng fork of eDEX-UI. It is
being prepared for safer local sharing, not for handling high-risk secrets.

## What must never be committed

- `.env` or `.env.local`;
- API keys;
- access tokens;
- cookies or sessions;
- Apple, Outlook or university account credentials;
- private certificates or signing keys;
- local exports that contain personal data;
- build caches or generated app-data folders.

The repository includes `.env.example` and `config.example.json` as safe
templates only.

## Current security posture

The app loads its own local `file://` UI and blocks normal navigation away from
that UI. Workspace links are restricted to HTTPS and open in the default
browser.

Known inherited Electron risks remain:

- `nodeIntegration` is enabled in the renderer.
- `contextIsolation` is disabled.
- `@electron/remote` is still used.
- Inline HTML/CSS patterns remain from the original eDEX-UI architecture.

Those choices are part of the legacy architecture and should not be expanded
to remote content. Do not add webviews, remote iframes, arbitrary HTML feeds or
untrusted plugin content before a dedicated Electron hardening phase.

## Local permissions

- Calendar uses a small native macOS EventKit helper with read-only calendar
  access.
- Apple Music uses macOS Automation to read playback metadata and control
  playback.
- The app can launch local applications selected from the discovered
  application index.

## Network services

Optional online services include OpenStreetMap tiles, RainViewer radar, TomTom
traffic, GitHub release checks, public IP lookup and first-run GeoIP database
download. These services should fail gracefully without crashing the HUB.

## Dependency audit

Run:

```sh
npm run security:audit
```

At the time of the v1.4.2 hardening pass, `npm audit` reported zero known
vulnerabilities for both the root package and the `src` package.

## Reporting issues

Open a GitHub issue without including secrets or personal data. If a report
requires sensitive detail, describe the class of issue first and arrange a
private channel before sharing logs or exports.
