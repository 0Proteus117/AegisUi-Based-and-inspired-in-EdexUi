# Changelog

## 1.5.4 - 2026-06-26

### Added

- Added the shared `COMMS` workspace to the main navigation after `BUSINESS`.
- Added secure external launchers for WhatsApp Web, Slack, Microsoft Teams,
  Discord, Gmail, Outlook, LinkedIn, Instagram and X / Twitter.
- Added COMMS placeholders for unified notifications and communication status.
- Added visible launcher/status states such as `ONLINE`, `OFFLINE`,
  `LOGIN REQUIRED` and `EXTERNAL`.
- Added `COMMS_DECK.md` documenting launcher scope, WhatsApp safety boundaries,
  webview limitations and future official API options.

### Changed

- Workspace navigation now supports seven tabs and `Command + Option + 1…7`.

## 1.5.3 - 2026-06-26

### Added

- Added `MAP_LAYERS.md` with the Situational Awareness layer objective,
  current/future layers, states, possible providers, API-key rules, privacy
  considerations, performance boundaries, offline behavior and extension guide.

### Changed

- Updated README, configuration and offline-mode documentation for the new map
  layer system and `map-layers.json` local preferences.
- Updated package metadata to point to the current AegisUi GitHub repository.
- Updated the optional update checker to query the current AegisUi GitHub
  repository instead of the previous fork URL.
- Marked the map layer documentation milestone as complete in the
  `SITUATIONAL AWARENESS` project timeline.

## 1.5.2 - 2026-06-26

### Added

- Added lightweight visual placeholders for future air, maritime, satellite and
  ocean alert layers.
- Added the `SITUATIONAL AWARENESS` project timeline with milestones for the map
  layer architecture, toggles, placeholders and documentation.

### Changed

- Future map layers now use distinct placeholder geometry instead of generic
  markers: aircraft vector, vessel track, orbital arc and ocean alert ring.

## 1.5.1 - 2026-06-26

### Added

- Added compact Situational Awareness toggles for traffic, radar, air, sea,
  satellite and ocean layers inside Local Situation.
- Added `map-layers.json` as an exportable local user-data file for map layer
  preferences.
- Added `map-layers.example.json` and expanded `config.example.json` with safe
  non-secret map layer configuration examples.

### Changed

- Map layer preferences are mirrored between renderer `localStorage` and the
  local app-data configuration file so they can be exported or imported on
  another Mac without carrying API keys.

## 1.5.0 - 2026-06-26

### Added

- Introduced the Situational Awareness map-layer architecture for Local
  Situation.
- Added canonical layer states: `OFF`, `LOADING`, `ONLINE`, `OFFLINE`,
  `API_KEY_MISSING`, `ERROR`, `PLACEHOLDER` and `FUTURE`.
- Registered initial layers for road traffic, weather radar, air traffic,
  maritime AIS, satellites and ocean alerts.
- Added local map-layer preferences through `localStorage` without storing API
  keys in versioned files.

### Changed

- Existing road traffic and weather radar now run through the modular layer
  controller while preserving their existing behavior.
- Disabled map layers do not create overlays, timers or polling loops.

## 1.4.4 - 2026-06-26

### Added

- Apple Music / Media Player now includes Shuffle and Repeat controls next to
  previous, play-pause and next.
- Repeat cycles through `OFF`, `REPEAT ALL` and `REPEAT ONE`.
- Shuffle and Repeat keep a local visual state in `localStorage` so the UI
  remains coherent if Apple Music Automation cannot report the state.
- Added the timeline task `Media Player — Add shuffle/repeat controls` to
  local project data.

### Changed

- Music status now attempts to read Apple Music shuffle and repeat state through
  macOS Automation.
- Music control backend now attempts to send shuffle/repeat commands to Apple
  Music, with local UI fallback when the system integration is unavailable.

## 1.4.3 - 2026-06-26

### Fixed

- Project Control and generic modals now preserve the workspace context they
  were opened from.
- Opening Project Control from ENGINEER no longer switches the app to HUB
  behind the modal.
- Closing Project Control restores the captured workspace if any internal
  refresh or legacy action changed it unexpectedly.

### Added

- Added the timeline task `UX Polish — Preserve workspace context after modal
  close` to local project data.

## 1.4.2 - 2026-06-25

### Added

- Local configuration helper scripts:
  - `npm run config:where`
  - `npm run config:export`
  - `npm run config:import`
- Safe user configuration export format that excludes API keys, tokens,
  passwords, cookies, sessions and other known secret fields.
- `.env.example` for private local API keys and offline/update-check flags.
- `config.example.json` as a safe, non-secret local profile template.
- `OFFLINE_MODE.md` with module-by-module offline/online classification.
- `CONFIGURATION.md` with local data, API key and export/import guidance.

### Changed

- Map, radar and traffic panels now expose clearer unavailable/offline states.
- RainViewer metadata, GitHub update checks and public-IP lookup now use
  explicit timeouts.
- GitHub update checks can be disabled with local settings or
  `AEGISUI_DISABLE_UPDATE_CHECK=1`.
- GeoIP download is skipped when offline mode is enabled and no local database
  exists.
- Public-IP parsing failures no longer log raw response bodies.

## 1.4.1 - 2026-06-25

### Security / portability audit

- Audited the repository for hardcoded API keys, tokens, cookies, sessions,
  personal paths, local logs and committed `.env` files.
- Confirmed no real secrets or personal local paths were found in versioned
  source during this pass.
- Expanded `.gitignore` to protect local secrets, private configuration,
  exports/imports, caches and generated build artifacts.
- Documented the inherited Electron security risks that should be addressed in
  a future hardening phase.
- Classified cloud dependencies and local/offline modules.

## 1.4.0 - 2026-06-20

### Added

- Modular command-deck navigation for HUB, ENGINEER, OSINT / ANALYST, STUDENT,
  ARTIST and BUSINESS workspaces.
- Central workspace definitions for names, descriptions, categories, widgets,
  quick actions, recommended tools, future modules and implementation states.
- Developed ENGINEER foundation with project status, local application
  launchers, configurable technical sources, research links, standards and a
  future-tools roadmap.
- Structured foundation layouts for OSINT / ANALYST, STUDENT, ARTIST and
  BUSINESS.
- Apple Music artwork for the current track, retrieved locally through macOS
  Automation and cached in memory.
- Workspace research and implementation priorities in `WORKSPACE_RESEARCH.md`.
- Keyboard navigation with `Command + Option + 1…6`.

### Preserved

- The existing HUB is kept mounted when another workspace is selected, so map,
  traffic, radar, Calendar, Music, applications and project timelines retain
  their state.

### Security and performance

- Workspace links accept HTTPS only and open in the default browser.
- No API keys, account tokens or credentials are stored in workspace
  definitions.
- Non-HUB workspaces are rendered lazily and do not add recurring background
  polling.
- Music artwork is loaded only when the track changes and is held in a bounded
  in-memory cache.
- Bundled themes, keyboards and fonts are installed only when missing, avoiding
  unnecessary startup I/O and preserving local customizations.
- An existing GeoIP database is opened directly; the updater is loaded only
  when the local database still needs to be installed.
