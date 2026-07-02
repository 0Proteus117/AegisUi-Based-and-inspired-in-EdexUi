# Changelog

## 2.0.7 - 2026-07-02

### Fixed

- Added real TomTom traffic runtime mode selection: Flow Tiles first, Flow
  Segment polylines as a real fallback when tiles are unavailable but segment
  data responds.
- Added a provider diagnostic script for TomTom Flow Segment, TomTom Flow Tile,
  AISStream global live, RainViewer metadata and Open-Meteo Marine.
- SEA now uses AISStream global live by default with global/preset bounding
  boxes and real vessel markers only.
- MARINE now falls back from inland/current-map views to real Open-Meteo sea
  presets instead of staying visually empty.
- RainViewer radar attribution and latest-frame status are explicit.

### Security

- Map provider diagnostics mask key suffixes and never print full API keys.
- `.env.local` remains ignored and is the preferred local place for live map
  provider keys.

## 2.0.6 - 2026-07-02

### Fixed

- TomTom Traffic now runs a real provider diagnostic before adding traffic
  tiles. A rejected key reports `API_KEY_INVALID` instead of the misleading
  generic `SERVICE_UNAVAILABLE`.
- Base-map fallback tiles are brighter and clearer so OSM fallback does not look
  like a dead/black map.
- TomTom diagnostics now distinguish missing, invalid, rate-limited and service
  unavailable states without printing the full key.

### Notes

- If TomTom returns HTTP 401/403 for the locally saved key, AegisUi cannot make
  TomTom traffic real. The correct behavior is `API_KEY_INVALID`; no fake
  traffic is drawn.

## 2.0.5 - 2026-07-02

### Added

- Added `MAP_PROVIDER_HARDENING.md` with the v2.0.5 map-provider audit.
- Added TomTom base-map diagnostics with safe key status, masked suffix and
  service status.
- Added OpenStreetMap base-map fallback when TomTom is missing or unavailable.
- Added cockpit-style custom dropdown controls for the map settings popup.
- Added real Open-Meteo Marine sea-state provider as `MARINE_WEATHER`.

### Changed

- TomTom key loading now accepts `TOMTOM_API_KEY`, `AEGISUI_TOMTOM_API_KEY`,
  `TOMTOM_KEY`, `VITE_TOMTOM_API_KEY` and `REACT_APP_TOMTOM_API_KEY`.
- SAT Starlink now maps explicitly to CelesTrak `GROUP=STARLINK`.
- SAT now consumes real CelesTrak GP/TLE records with `twoline2satrec`, avoiding
  the broken local `satellite.js@7` package path while keeping real SGP4
  propagation.
- AISStream settings now support safe area presets without opening a socket
  when the key is missing.
- Radar copy/status now separates precipitation radar from marine weather.

## 2.0.4 - 2026-06-27

### Added

- Added a cockpit-style `Local Situation` map settings popup for layer toggles,
  provider limits, refresh intervals, opacity controls and local UI-sound
  preference.
- Added CelesTrak SAT group selection for `stations`, `active`, `starlink`,
  `weather`, `gps-ops`, `visual`, `last-30-days`, `geo` and `science`.
- Added SAT density presets: `LOW`, `MEDIUM`, `HIGH` and `CUSTOM`.
- Added expanded-map control with smooth in-app transition and map-size
  recalculation.
- Added “return to my location” map control with geolocation fallback/error
  states and no repository-stored coordinates.

### Changed

- AIR now respects configurable marker caps, refresh interval and visible/wider
  bounding-box mode.
- OCEAN now supports NDBC/DART source selection plus visible/global/coastal
  filtering from real NOAA/NDBC station data.
- SEA settings now surface AISStream key status and max vessel limits without
  opening sockets while disabled.
- Radar settings expose opacity and clearly mark dedicated maritime radar
  coverage as not supported by the current provider.

## 2.0.3 - 2026-06-27

### Added

- Added `satellite.js` as the local SGP4 orbital propagation engine for the
  `SATELLITES` map layer.
- SAT now converts real CelesTrak GP/OMM records with `json2satrec`, propagates
  them locally and renders real satellite markers on the map.
- SAT popups now include satellite name, NORAD ID, calculated latitude/longitude,
  approximate altitude, timestamp and CelesTrak source.

### Changed

- SAT no longer stops at `POSITION_ENGINE_REQUIRED` when the propagation engine
  is available.
- Disabled SAT keeps CelesTrak requests, propagation timers and map markers off.
- Added `POSITION_ENGINE_ERROR` for real catalog data that cannot be propagated.

## 2.0.0 - 2026-06-26

### Added

- Added `MAP_SYSTEMS_AUDIT.md` documenting the existing Local Situation map,
  real providers, placeholder risks, timers, cleanup and implementation plan.
- Added a modular map-layer provider architecture under `src/classes/map/`.
- Added real-provider adapters for TomTom traffic, RainViewer radar, OpenSky
  air traffic, AISStream maritime AIS, CelesTrak GP catalog data and NOAA/NDBC
  ocean stations.

### Changed

- Replaced decorative future-layer placeholder geometry with provider states,
  real data, configuration requirements or no-data fallbacks.
- Map layers now use a central registry for start/stop/refresh/status and
  shared cache behavior.
- Disabled layers do not start provider requests, polling timers, sockets or
  overlays.
- Satellite data loads as a real CelesTrak catalog but reports
  `POSITION_ENGINE_REQUIRED` until an approved orbital propagation engine is
  added.

### Documentation

- Updated map, configuration, offline-mode, integration and README docs for the
  map systems activation pass.

## 1.9.5 - 2026-06-26

### Added

- Added `INTEGRATIONS.md` documenting local-only modules, external launchers,
  optional APIs, system integrations, Agent Command boundaries and fallback
  states.
- Agent Command selected-agent panel can now copy the base prompt and current
  local output without connecting to an AI provider.

### Documentation

- Updated README, configuration and Agent Command docs for the Systems Online
  Pass.

## 1.9.4 - 2026-06-26

### Changed

- Developer Deck now reports Git version and detected package manager in the
  dependency/health panel.
- Developer quick scripts are explicitly labeled `DRAFT ONLY`.
- Developer commit/push placeholder buttons are now labeled as locked
  write-actions requiring future approval.
- Manual dependency audit status now says `MANUAL ONLY` rather than appearing
  like an automatic placeholder result.

### Security

- Script execution, commit and push actions remain disabled.

## 1.9.3 - 2026-06-26

### Changed

- Map/radar/traffic optional-provider failures now use clearer fallback states
  such as `SERVICE_UNAVAILABLE` and `RATE_LIMITED` instead of collapsing every
  provider problem into generic `ERROR`.
- Updated map/offline documentation with explicit optional-provider fallback
  states and no-aggressive-retry expectations.

### Configuration

- Added commented future optional API-key placeholders to `.env.example` for
  documented integrations only. No new provider calls are made in v1.9.x.

## 1.9.2 - 2026-06-26

### Changed

- Workspace action buttons now show default launcher states (`EXTERNAL` for
  links and `APP` for app launchers) even when no explicit status is provided.
- Workspace external launchers now use the same safe URL validation used by
  Launch Bay, allowing only approved external protocols such as HTTPS and safe
  game deep links.
- App launch failures now report `APP NOT FOUND` explicitly.

### Security

- Workspace launchers still do not run shell commands or arbitrary local
  executables.
- Unsafe protocols are rejected before `shell.openExternal()`.

## 1.9.1 - 2026-06-26

### Added

- Added exportable local `workspace-state.json` for the active workspace,
  last non-HUB workspace and navigation mode.
- Added safe IPC read/write handlers for workspace state.

### Changed

- Workspace navigation now mirrors its remembered state to local app data in
  addition to renderer local storage, making workspace state portable through
  the existing config export/import flow.

## 1.9.0 - 2026-06-26

### Added

- Added `MOCK_TO_REAL_AUDIT.md` for the Systems Online Pass.
- Inventoried current placeholders, mock widgets, future integrations,
  disabled actions and local/online/system/AI activation categories.
- Documented recommended mock-to-real activation order, prioritizing local
  data, safe launchers and fallback states before optional APIs or AI agents.

## 1.8.1 - 2026-06-26

### Changed

- Reworked the top workspace navigation into a scalable two-zone layout:
  pinned `HUB` plus a compact horizontal workspace rail.
- Added compact workspace labels such as `ENG`, `BAY`, `DEV` and `AGENT`.
- Added native hover tooltips with full workspace names and shortcuts.
- Added automatic scroll-into-view for the active non-HUB workspace.
- Preserved `Command + Option + 1…9` and `Command + Option + 0` navigation.

### Documentation

- Added `WORKSPACE_NAVIGATION.md` documenting the pinned-HUB/compact-rail
  decision, shortcuts, behavior and future grouping options.

## 1.8.0 - 2026-06-26

### Added

- Added the `AGENT COMMAND` workspace after `DEVELOPER`.
- Added a local-first AI-agent command room with configurable agent windows,
  central task board, selected-agent output panel and approval/safety locks.
- Added default visual agents: Architect, Builder, Reviewer, Security, Tester,
  Docs, UX and Performance.
- Added local task-board fields for priority, type, status, assigned agent and
  result text.
- Added local safe actions for copying task results, marking tasks as reviewed
  and routing tasks to the next configured agent.
- Added `agent-command.json` as a private local Agent Command configuration
  file in app data.
- Added `agent-command.example.json` as a safe non-secret template.
- Added `AGENT_COMMAND_DECK.md` documenting roles, permissions, task board,
  approval flow, safety limits and future AI integration roadmap.

### Changed

- Workspace navigation now supports ten tabs. `Command + Option + 0` opens the
  tenth workspace.
- Configuration/export/offline documentation now includes Agent Command local
  data and no-cloud behavior.

### Security

- Agent Command does not connect to external AI providers in this foundation.
- Agents cannot execute commands, write project files, commit or push.
- Only permission levels 0 (`READ ONLY`) and 1 (`DRAFT`) are enabled.
- Higher autonomy levels are documented as future-only and locked.

## 1.7.0 - 2026-06-26

### Added

- Added the `DEVELOPER` workspace after `LAUNCH BAY`.
- Added Developer Classic Deck panels for terminal focus, read-only Git status,
  detected npm scripts, local logs, curated project structure and dependency /
  runtime health.
- Added `developer-deck.json` as a private local preference file in app data.
- Added `developer-deck.example.json` as a safe configuration template.
- Added `DEVELOPER_DECK.md` documenting modules, safety limits, local
  configuration and future script/terminal integration work.

### Changed

- Workspace navigation now supports nine tabs and `Command + Option + 1…9`.
- Configuration/export/offline documentation now includes Developer Deck local
  data and no-cloud behavior.

### Security

- Developer Deck uses read-only Git/package/runtime checks in this foundation
  version.
- Quick scripts are detected but not executed automatically; command execution
  remains a safe placeholder until an explicit confirmation model exists.
- Sensitive files such as `.env`, tokens, keys, cookies and sessions are
  blocked from the Developer project-structure opener.

## 1.6.0 - 2026-06-26

### Added

- Added the `LAUNCH BAY` workspace after `COMMS`.
- Added a local-first game deck with lightweight 3D carousel, central selected
  game, angled side cards, hero backdrop, keyboard navigation and launch
  button.
- Added `launch-bay-games.json` as a private local game-library file in app
  data.
- Added `launch-bay-games.example.json` as a safe manual configuration example.
- Added secure Launch Bay IPC handlers for reading local game config, opening
  the local config file and launching validated external game URLs.
- Added `GAME_DECK.md` with manual setup, Steam launch URL format,
  SteamGridDB future artwork notes, safety boundaries and limitations.

### Changed

- Workspace navigation now supports eight tabs and `Command + Option + 1…8`.
- Configuration/export documentation now includes Launch Bay local data.

### Security

- Launch Bay does not auto-scan libraries, call cloud artwork APIs, store
  tokens or execute arbitrary user commands.
- Launch URLs are restricted to known safe external protocols such as
  `steam://rungameid/<APP_ID>` and selected launcher URL schemes.

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
