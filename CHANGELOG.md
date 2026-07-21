# Changelog

## 2.3.2 - 2026-07-21

### AegisUi application identity

- Renamed the visible macOS application, window title and release artifacts to
  `AegisUi`.
- Replaced the inherited eDEX icon with the AegisUi cyan mark used by the
  source-controlled startup sequence.
- Kept the established local data location and technical macOS identity so
  existing Apple Music, map and Assistant data are not reset by the visual
  branding migration.

## 2.3.1 - 2026-07-21

### Fixed

- Restored the source-controlled Aegis boot sequence: particle reveal, branded mark, greeting, breathing glow and radial exit.
- Added a boot-splash integrity check and a clean `src` → `prebuild-src` sync so packaging cannot silently fall back to the upstream eDEX-UI intro.
- Clean builds now synchronize only from current source; no prior `.app` or DMG is used as packaging input.
- Hardened packaged startup by keeping `node-pty`'s `spawn-helper` outside ASAR, restoring its executable permission and signing it during macOS packaging.
- Restored the complete OSINT Analyst Deck: nine categories and 161 source cards, tool briefs and controlled external-launch flow. The temporary FOUNDATION replacement is no longer shipped.

## 2.3.0 - 2026-07-21

### OSINT native access foundation

- Activated the first Analyst Desk domain: Discovery / Search.
- Added an in-suite isolated source surface based on Electron
  `WebContentsView`, with a per-source HTTPS allowlist, sandboxing, no Node
  integration and denied permissions.
- Added the first cockpit-native provider: Internet Archive Wayback
  Availability, with user-directed URL checks and explicit provider errors.
- Added Discovery/Search sources for Bellingcat Toolkit, Google, Bing,
  DuckDuckGo, Yandex, Google Scholar, OSINT Framework and IntelTechniques.
- Added registry, regression test, documentation and release-health coverage.
- Kept browser opening as an explicit fallback; no scraping, credential
  collection, background querying or intrusive actions were added.

## 2.2.9 - 2026-07-21

### AegisUi Boot Branding

- Added the GearLab-inspired AegisUi boot sequence with a progressive particle
  network, identity mark, welcome line, controlled glow and a single clean
  transition into the cockpit.
- Stabilised the boot lifecycle so the sequence cannot restart or clear its
  particle field before the final transition.

### OSINT Analyst Deck

- Replaced the OSINT placeholder layout with a nine-domain, 161-tool
  public-source catalog.
- Added full-workspace category navigation, compact tool briefs, tags and a
  controlled external launch action for each resource.
- Added a static OSINT workspace registry test and release visual evidence.

## Repository hygiene refresh - 2026-07-17

### Changed

- Replaced inherited eDEX/GitSquared README front matter with a clean
  AegisUi-focused repository front page.
- Modernized GitHub Actions metadata for `Repo health`, `CodeQL` and manual
  packaging.
- Added `REPOSITORY_POLICY.md` to document release, workflow, runtime honesty
  and privacy rules.
- Refreshed issue and pull request templates for AegisUi modules.
- Removed stale GitSquared funding/contact references.

### GitHub cleanup

- GearLab was inspected as a read-only reference and was not modified.
- Duplicate draft releases are treated as cleanup targets.
- Historical false-red workflow runs are treated as cleanup targets once the
  latest Repo health run is green.

## 2.2.8 - 2026-07-11

### Recovery

- Reverted broken v2.2.7 runtime integration.
- Restored stable v2.2.6 AegisUI behavior.
- Preserved HUB, Apple Music, Map, Calendar, Project Timeline, Applications
  grid, ENG calculators and Assistant stability.

### Added

- Added standalone `tools/aegis-gearlab` FastAPI/CadQuery module.
- Added standalone GearLab UI served by FastAPI at `/ui`.
- Added STEP-first spur gear generation path with schemas, validators,
  warnings, reports, examples, tests and macOS scripts.
- GearLab is intentionally not integrated into ENG runtime yet.

## 2.2.6 - 2026-07-10

### Improved

- Improved Gear Ratio visualization with centered proportional animated gears.
- Improved Torque/Power/RPM visualization with clearer rotor, torque arrow and power feedback.
- Improved Material Mass Estimator visual with clearer technical block/dimension representation.
- Improved Thread/Drill Chart with screw/thread visual and integrated table.
- Preserved HUB, Apple Music, Assistant and ENG functionality.

## 2.2.5 - 2026-07-10

### Recovery

- Reverted broken v2.2.4 changes.
- Restored v2.2.3 stable HUB behavior.
- Preserved ENG specialized workspace and visual calculators.
- Apple Music failures are isolated to the Apple Music panel.
- No new feature scope.

## 2.2.3 - 2026-07-10

### Fixed

- Hardened the local Apple Music bridge against `-1743` Automation failures with
  clearer `AUTOMATION_BLOCKED`, `MUSIC_NOT_RUNNING` and `ERROR` states.
- Normalized Apple Music JXA calls to target `com.apple.Music` directly and
  kept the bridge free of `System Events`.
- Added Apple Music static/runtime tests for bridge safety and permission
  diagnostics.

### Improved

- Upgraded ENG quick calculators with AegisUi-styled dark inputs, synchronized
  sliders, result readouts, reset/copy controls and technical diagrams.
- Added visual calculator diagrams for gear ratio, beam deflection,
  torque/power/RPM, material mass estimation, unit conversion and thread
  references.

### Security

- Apple Music remains local-only through macOS Music.app Automation.
- No cloud Apple Music API, audio capture, secrets, private memory or chat logs
  are added.

## 2.2.2 - 2026-07-09

### Added

- Converted the ENG workspace into a specialized engineering command deck.
- Added `EngineeringToolsRegistry` with CAD/CAM, CAE/simulation,
  manufacturing, calculators, materials, research, standards and project
  entries.
- Added local ENG calculators for unit conversion, torque/power/RPM, material
  mass, gear ratio, beam deflection and thread/drill lookup.
- Added ENG detail/fullscreen overlay for tools, categories and calculators.
- Added safe ENG command-router actions for opening the workspace, categories,
  selected tools and calculators.
- Added ENG registry, calculator and router tests.

### Security

- ENG app launchers use the existing safe application launcher path.
- Web tools open through the existing external-link handler.
- No shell execution, simulation runner, CAD automation or destructive action
  is introduced.

## 2.2.1 - 2026-07-09

### Fixed

- Expanded Assistant chat no longer auto-opens after relaunch by default.
- User messages now appear immediately while Ollama is generating.
- Added visible cockpit-style `Thinking…` indicator and disabled send state
  while a response is pending.
- Tightened command-router classification so normal conversation is not
  intercepted by router safety rules.
- Updated Angie/Aphrodite prompts so harmless warm conversation is answered
  naturally and does not mention command-router limits.

### Security

- Command router remains allowlist-only.
- Destructive, shell, Git, credential, payment and external-message intents
  remain blocked.

## 2.2.0 - 2026-07-09

### Added

- Expanded Assistant chat view with cockpit HUD styling, preserved session
  transcript, Enter-to-send, Shift+Enter newline and focus restoration.
- Local conversational memory in userData, separated per Assistant profile.
- Bounded Ollama context management using private bootstrap memory, optional
  conversation summary and recent messages only.
- Assistant AI Provider Layer with Ollama active and Apple Native marked as
  planned/not connected.
- Safe Assistant Command Router for allowlisted local UI actions only.
- Angie/Aphrodite warm pink/cyan visual identity and Gustav/Ares cold tactical
  identity.
- Lightweight 3D swarm orb particles with reduced-motion handling.
- Assistant tests for chat sessions, command router and provider layer.

### Security

- Voice, STT, TTS, Google TTS and Apple Native provider remain disconnected.
- The command router does not expose shell, Git, destructive actions, external
  messaging, payments or credential handling.
- Conversation history is stored in userData and is not committed.

## 2.1.9 - 2026-07-04

### Changed

- Converted `Build packaged binaries` to a manual GitHub Actions workflow.
- Added automatic lightweight `Repo health` workflow for push/PR checks.
- Added `scripts/release-health-check.js`.
- Added `scripts/run-regression-checks.js`.
- Added GitHub workflow documentation and weekly stability-freeze notes.
- Closed obsolete v1.x PRs superseded by `feature/systems-online-pass`.

### Security

- No app runtime, map provider, Apple Music, Calendar, Project Timeline,
  Assistant Local AI, voice or command-router code is changed.
- No tags, published releases, private memory, chat exports, `.env`,
  `.env.local`, API keys, audio samples or model files are deleted or staged.

## 2.1.8 - 2026-07-04

### Fixed

- Fixed Assistant panel click handling so settings, dropdowns, input, memory
  and Local AI controls no longer close the panel.
- Added Enter-to-send for the Assistant textarea.
- Added Shift+Enter newline behavior.
- Added duplicate-send guard while Ollama is processing.
- Improved focus restoration after sending.
- Improved Local AI health checks with endpoint validation, 5s `/api/tags`
  health timeout, last-check timestamp and last-error diagnostics.
- Clarified `Assistant backend` vs `Local AI` status so a ready local chat no
  longer looks like a generic backend-offline placeholder.
- Added `scripts/diagnose-assistant-local-ai.js`.

### Security

- Voice, STT, TTS and command router remain offline.
- No Apple Music, map provider, AIS, satellite or runtime module is changed.
- No private memory, `.env`, `.env.local`, model weights, audio samples or API
  keys are committed.

## 2.1.7 - 2026-07-04

### Added

- Added local written Assistant chat through Ollama.
- Added `AssistantOllamaClient` for local `/api/tags` and `/api/chat`.
- Added `AssistantLocalChat` to combine active personality prompts with private
  bootstrap memory context.
- Added `assistant/config/assistant-ai.example.json`.
- Added local userData config creation at
  `~/Library/Application Support/EdexUi-Eng/assistant/config/assistant-ai.json`.
- Added Assistant panel written-chat transcript.
- Added Assistant Settings `LOCAL AI` status/config section.
- Added `scripts/test-assistant-ollama.js`.
- Added `scripts/pull-assistant-model.js`.
- Added `ASSISTANT_LOCAL_AI.md`.

### Security

- Local AI uses only `http://127.0.0.1:11434` by default.
- Voice, STT, TTS, command router and system actions remain disabled.
- Private memory is capped before being sent to local Ollama and is not shown
  fully in the UI.
- No private memory, `.env`, `.env.local`, voice samples, model weights or API
  keys are committed.

## 2.1.6 - 2026-07-04

### Added

- Added private local Assistant memory bootstrap structure.
- Added public memory schema and redacted examples.
- Added `AssistantMemoryBootstrap` local loader for status-only memory checks.
- Added `scripts/install-assistant-bootstrap-memory.js`.
- Added `scripts/test-assistant-memory-bootstrap.js`.
- Added Assistant Settings `MEMORY` panel with status, source, file count,
  bootstrap install status and non-sensitive title preview.
- Added `ASSISTANT_MEMORY.md`.

### Security

- Real private memory remains in `assistant/memory/private/`, which is ignored
  by Git.
- No LLM, Ollama, FastAPI, ChromaDB, embeddings, retrieval, STT, TTS, Google
  TTS or command router is connected.
- No private memory content is included in public documentation.

## 2.1.5 - 2026-07-04

### Changed

- Added a local `AssistantPersonality` layer for Gustav, Angie, Ares and
  Aphrodite.
- Separated public mode (`Ares` / `Aphrodite`) from private mode
  (`Ares / Gustav` and `Aphrodite / Angie`) so private names are not shown in
  public mode.
- Updated Assistant panel microcopy, manual-input placeholders and offline
  responses by personality.
- Refined Assistant orb and panel styling by profile while keeping the cockpit
  HUD visual language.
- Expanded Assistant settings with offline command-router and memory status
  placeholders plus a planned Google Emotional TTS shell.

### Added

- Added public Assistant profile examples for Ares and Aphrodite.
- Added private `.example.json` profile templates for Gustav and Angie.
- Added `ASSISTANT_PERSONALITY_POLISH_REPORT.md`.

### Security

- No LLM, STT, TTS, Ollama, FastAPI, Chatterbox, OpenVoice, Google TTS or
  external API is connected.
- No private profiles, voice samples, models, API keys, `.env` or `.env.local`
  files are added.

## 2.1.4 - 2026-07-03

### Fixed

- Restored the Apple Music bridge to the last known good local macOS
  JXA/osascript path for status, artwork, playlist launch and playback controls.
- Added `scripts/test-apple-music-runtime.js` to validate the same Music.app
  Automation mechanism used by the app.
- Added `scripts/diagnose-macos-automation-identity.js` to check packaged app
  bundle identity, bundle identifier and codesign validity when Automation/TCC
  rejects Apple Events.
- Marked the playlist sidebar as a cached local launcher index so cached
  playlists are not confused with a live Music.app connection.
- Re-signed the manual packaged app after resource injection while preserving
  the stable bundle identifier.

### Security

- Apple Music remains local-only through macOS Music.app Automation.
- No Apple Music cloud API, external service, token, audio capture, private
  media data or System Events dependency is added.

## 2.1.3 - 2026-07-03

### Fixed

- Fixed an Apple Music regression where a failing `Music.running()` bridge call
  could show `PERMISSION REQUIRED` and `Music app: UNKNOWN` even when local
  Music Automation permission was already granted.
- Replaced Music.app status, open, playlist launch and playback controls with
  direct AppleScript `tell application "Music"` commands.
- Added a non-Automation process check for Music.app and clearer states for
  `CONNECTED`, `CONNECTED / STOPPED`, `NO TRACK`, `MUSIC NOT RUNNING`,
  `MUSIC PERMISSION REQUIRED`, `SYSTEM EVENTS PERMISSION REQUIRED` and `ERROR`.
- Added `scripts/test-apple-music.js` for local direct Music.app validation.

### Security

- Apple Music remains a local macOS Music.app integration only.
- No Apple Music cloud API, external provider, token, audio capture or private
  media data is added.

## 2.1.2 - 2026-07-03

### Fixed

- Stabilized AISStream SEA rendering by replacing the normal global
  subscription with current-view and preset-controlled bounding boxes.
- Added AIS buffering, MMSI deduplication, stale-vessel cleanup and throttled
  marker updates so live vessels do not flicker or rebuild every message.
- Changed SEA to default to `CURRENT_VIEW`, with controlled presets such as
  Gibraltar, Mediterranean and Singapore Strait for reliable live checks.
- Replaced the generic SEA triangle with a distinct teal hull/wake marker so
  vessels are visually separate from aircraft.
- Improved Apple Music local diagnostics for `CONNECTED`, `NOT RUNNING`,
  `PERMISSION REQUIRED`, `ERROR` and `UNAVAILABLE` states.
- Added `OPEN MUSIC` and `REFRESH` actions to the cockpit music panel while
  keeping local macOS Music.app Automation as the only integration path.

### Security

- No Apple Music cloud API, assistant backend, voice provider, LLM, STT or TTS
  service is connected in this phase.
- No vessel data, music data, API key, token, audio sample or model file is
  added to Git.

## 2.1.1 - 2026-07-03

### Changed

- Polished the Assistant Presence orb visuals while keeping the lower-left
  cockpit placement, central sphere and orbiting point cloud.
- Refined state visuals for `IDLE`, `LISTENING`, `THINKING`, `SPEAKING`,
  `MUTED`, `OFFLINE` and `ERROR`, including reduced-motion support.
- Polished the assistant HUD panel with clearer status, response, settings,
  backend, voice and test-state sections.
- Added local personality microcopy:
  - Gustav/Ares: dry, technical and command-oriented.
  - Angie/Aphrodite: warm, present and soft without becoming childish.

### Added

- Added `src/classes/assistant/assistantMicrocopy.class.js`.
- Added `ASSISTANT_PERSONALITY.md`.
- Added `ASSISTANT_POLISH_REPORT.md`.
- Added a planned Future Voice Providers section for Default Robotic, Local
  Custom Voice and optional Google Emotional TTS.

### Security

- No Ollama, FastAPI, Chatterbox, OpenVoice, Google TTS, STT, LLM or external
  API is connected in this phase.
- No assistant voice sample, private profile, model weight or API key is added
  to Git.

## 2.1.0 - 2026-07-02

### Added

- Added Assistant Presence Core: a global lower-left cockpit orb for the future
  Angie / Gustav assistant system.
- Added visual assistant states: `IDLE`, `LISTENING`, `THINKING`, `SPEAKING`,
  `MUTED`, `OFFLINE` and `ERROR`.
- Added a compact assistant panel with manual text input, mute/unmute, settings,
  clear and honest backend-offline placeholder.
- Added public/private naming:
  - public: `Ares`, `Aphrodite`;
  - private aliases: `Gustav`, `Angie`.
- Added local-only assistant settings stored in renderer localStorage.
- Added assistant bridge and authority scaffolding for future voice, LLM and
  command-router integration without connecting any backend yet.
- Added `ASSISTANT_SYSTEM.md` and `ASSISTANT_AUTHORITY_MATRIX.md`.

### Security

- No LLM, STT, voice clone, Ollama, Chatterbox or external API is connected in
  this phase.
- Private assistant profiles, memories, voice samples and model files are
  ignored by Git.

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
