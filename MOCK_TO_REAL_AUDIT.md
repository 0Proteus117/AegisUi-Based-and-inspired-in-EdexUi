# Mock-to-real activation audit

Phase: **Systems Online Pass — Mock-to-Real Activation**

This audit separates real modules, safe launchers, local-only foundations and
future integrations so AegisUi can become more functional without turning into
a fragile bundle of external calls.

## Activation categories

| Category | Meaning |
| --- | --- |
| `LOCAL_ONLY` | Works with local/offline data and local app configuration. |
| `EXTERNAL_LAUNCHER` | Opens a safe external URL, deep link or installed app. |
| `API_OPTIONAL` | Can use an optional external API and must have fallback states. |
| `SYSTEM_INTEGRATION` | Reads or controls local OS/app state. |
| `AI_AGENT` | Uses AI prompts, agents, context or automation; must stay read-only/draft first. |

## Inventory

| Module | Workspace | File/component | Current simulation | Real target | API external | Offline capable | Activation | Tech risk | Security risk | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local Situation base map | HUB | `src/classes/engineeringDashboard.class.js` | Real map tiles with fallback states. | Keep stable; improve offline messaging only. | Optional network tiles | Partial | `API_OPTIONAL` | Low | Low | Medium |
| Road traffic | HUB | `EngineeringMapPanel` | Real TomTom tile layer only when key exists. | Keep as optional API with clear `API_KEY_MISSING`. | TomTom key | No | `API_OPTIONAL` | Low | Medium | Medium |
| Weather radar | HUB | `EngineeringMapPanel` | Real RainViewer layer; service failures become status text. | Keep optional online layer with timeout/fallback. | RainViewer public | No | `API_OPTIONAL` | Low | Low | Medium |
| Air traffic layer | HUB / Local Situation | `EngineeringMapPanel.createLayerDefinitions()` | Placeholder aircraft vectors. | ADS-B provider adapter later. | Yes | Placeholder only | `API_OPTIONAL` | High | Medium | Later |
| Maritime AIS layer | HUB / Local Situation | `EngineeringMapPanel.createLayerDefinitions()` | Placeholder vessel tracks. | AIS provider adapter later. | Yes | Placeholder only | `API_OPTIONAL` | High | Medium | Later |
| Satellites layer | HUB / Local Situation | `EngineeringMapPanel.createLayerDefinitions()` | Placeholder orbital arcs. | TLE/GP adapter later. | Optional | Placeholder/local possible | `API_OPTIONAL` | Medium | Low | Later |
| Ocean alerts layer | HUB / Local Situation | `EngineeringMapPanel.createLayerDefinitions()` | Placeholder alert rings. | NOAA/NDBC/CO-OPS adapter later. | Optional | Placeholder only | `API_OPTIONAL` | Medium | Low | Later |
| Project Timelines | HUB | `EngineeringProjectsPanel` | Real local JSON data and editor. | Keep local; improve import/export docs. | No | Yes | `LOCAL_ONLY` | Low | Low | Done |
| Project Control modal | HUB / ENGINEER | `EngineeringProjectsPanel.openEditor()` | Real local modal/editor. | Keep context preservation and backup. | No | Yes | `LOCAL_ONLY` | Low | Low | Done |
| Apple Music panel | HUB | `EngineeringMusicPanel` | Real local Music Automation when permitted; visual fallback when disconnected. | Keep local; clarify fallback states. | No | Partial | `SYSTEM_INTEGRATION` | Medium | Medium | Medium |
| Media shuffle/repeat disconnected controls | HUB | `EngineeringMusicPanel.renderConnect()` | Disabled local visual state. | Keep as fallback until Music state can be read reliably. | No | Yes | `SYSTEM_INTEGRATION` | Low | Low | Medium |
| Applications grid | HUB | `ApplicationsDisplay` / `_boot.js` | Real installed `.app` launcher grid. | Keep known-app allowlist behavior. | No | Yes | `SYSTEM_INTEGRATION` | Low | Low | Done |
| ENGINEER project status | ENGINEER | `WorkspaceManager.loadEngineeringProjects()` | Real read-only view of HUB projects. | Keep local. | No | Yes | `LOCAL_ONLY` | Low | Low | Done |
| ENGINEER sector pulse | ENGINEER | `workspaces.config.js` | External links presented as future live feed. | Treat as safe source launcher until RSS/API adapter exists. | Optional later | Yes as launcher | `EXTERNAL_LAUNCHER` | Low | Low | High |
| ENGINEER technical tools roadmap | ENGINEER | `workspaces.config.js` / `createRoadmapPanel()` | Roadmap labels only. | Local calculators/material DB later. | No initially | Yes | `LOCAL_ONLY` | Medium | Low | Medium |
| ENGINEER CAD/CAE launchers | ENGINEER | `workspaces.config.js` / `WorkspaceManager` | Real local app lookup or HTTPS launcher. | Improve explicit status labels. | No | Yes | `EXTERNAL_LAUNCHER` | Low | Low | High |
| OSINT search launchpad | OSINT | `workspaces.config.js` | Placeholder widget plus external tools. | Use external launchers first; case board later. | Optional later | Yes as launcher | `EXTERNAL_LAUNCHER` | Low | Medium | High |
| OSINT geospatial verification | OSINT | `workspaces.config.js` | Placeholder. | Link/open public map tools first; deeper APIs later. | Optional | Partial | `API_OPTIONAL` | Medium | Medium | Later |
| OSINT domain/infrastructure context | OSINT | `workspaces.config.js` | Placeholder. | External launchers first; API checks later with rate limits. | Optional | Partial | `API_OPTIONAL` | Medium | Medium | Later |
| OSINT findings notebook | OSINT | `workspaces.config.js` | Placeholder. | Local notes/case board. | No | Yes | `LOCAL_ONLY` | Medium | Medium | Medium |
| OSINT source monitor/news | OSINT | `workspaces.config.js` | Placeholder. | Optional feeds with fallback and no aggressive polling. | Optional | Partial | `API_OPTIONAL` | Medium | Low | Later |
| Student deadlines | STUDENT | `workspaces.config.js` | Placeholder. | Local calendar/course config or Moodle later. | Optional | Yes local | `LOCAL_ONLY` | Medium | Low | Medium |
| Student reading queue | STUDENT | `workspaces.config.js` | Placeholder. | Local reading list or Zotero integration. | Optional | Yes local | `LOCAL_ONLY` | Medium | Low | Medium |
| Student writing desk | STUDENT | `workspaces.config.js` | Placeholder. | Local docs launcher/checklist. | No | Yes | `EXTERNAL_LAUNCHER` | Low | Low | High |
| Student bibliography status | STUDENT | `workspaces.config.js` | Placeholder. | Zotero local/app launcher first, API later. | Optional | Yes launcher | `SYSTEM_INTEGRATION` | Medium | Low | Medium |
| Student flashcard review | STUDENT | `workspaces.config.js` | Placeholder. | Anki app launcher first, local stats later. | Optional | Yes launcher | `SYSTEM_INTEGRATION` | Medium | Low | Medium |
| Artist moodboard | ARTIST | `workspaces.config.js` | Placeholder. | Local folder/image board later. | No | Yes | `LOCAL_ONLY` | Medium | Low | Medium |
| Artist assets | ARTIST | `workspaces.config.js` | Placeholder. | Local folder launcher/index later. | No | Yes | `SYSTEM_INTEGRATION` | Medium | Low | Medium |
| Artist palette | ARTIST | `workspaces.config.js` | Placeholder. | Local palette extraction later. | No | Yes | `LOCAL_ONLY` | Medium | Low | Later |
| Artist production status | ARTIST | `workspaces.config.js` | Placeholder. | Local project checklist. | No | Yes | `LOCAL_ONLY` | Low | Low | Medium |
| Artist portfolio/publishing | ARTIST | `workspaces.config.js` | Placeholder. | External launchers/checklist first. | Optional | Yes as launcher | `EXTERNAL_LAUNCHER` | Low | Low | Medium |
| Business executive agenda | BUSINESS | `workspaces.config.js` | Placeholder. | Calendar-backed local summary later. | No | Yes | `SYSTEM_INTEGRATION` | Medium | Low | Medium |
| Business KPI quick view | BUSINESS | `workspaces.config.js` | Placeholder. | Local/manual KPI config first; APIs later. | Optional | Yes local | `API_OPTIONAL` | Medium | Low | Later |
| Business market watchlist | BUSINESS | `workspaces.config.js` | Placeholder. | Optional financial data adapter later. | Yes | No | `API_OPTIONAL` | Medium | Medium | Later |
| Business communication queue | BUSINESS | `workspaces.config.js` | Placeholder. | Launchers first; official email APIs later. | Optional | Partial | `API_OPTIONAL` | Medium | Medium | Later |
| Business operations/projects | BUSINESS | `workspaces.config.js` | Placeholder. | Local project/control summaries. | No | Yes | `LOCAL_ONLY` | Low | Low | Medium |
| COMMS launchers | COMMS | `workspaces.config.js` / `WorkspaceManager` | Real HTTPS launchers. | Centralize safe launcher states. | No | Yes as buttons | `EXTERNAL_LAUNCHER` | Low | Low | High |
| COMMS unified notifications | COMMS | `workspaces.config.js` | Placeholder. | Local macOS notification bridge or official APIs later. | Optional | Partial | `SYSTEM_INTEGRATION` | High | High | Later |
| COMMS embedded webviews | COMMS | `COMMS_DECK.md` / status list | Explicitly disabled. | Optional isolated webview only after hardening. | No | No | `SYSTEM_INTEGRATION` | High | High | Later |
| Launch Bay game carousel | LAUNCH BAY | `WorkspaceManager.renderLaunchBay()` | Real local manual JSON + safe URL launcher. | Add missing launcher status/error clarity. | No | Yes | `LOCAL_ONLY` | Low | Low | High |
| Launch Bay artwork placeholders | LAUNCH BAY | `launch-bay-games.json` handling | Generated placeholders when local images missing. | Optional SteamGridDB adapter later. | Optional key | Yes fallback | `API_OPTIONAL` | Medium | Low | Later |
| Launch Bay platform auto-detect | LAUNCH BAY | `GAME_DECK.md` | Not implemented. | Steam/Epic/GOG scans later with explicit consent. | No | Yes | `SYSTEM_INTEGRATION` | Medium | Medium | Later |
| Developer terminal bridge | DEVELOPER | `WorkspaceManager.renderDeveloperTerminal()` | Real terminal state bridge to existing HUB terminal. | Keep read-only/focus behavior. | No | Yes | `SYSTEM_INTEGRATION` | Low | Low | Done |
| Developer Git status | DEVELOPER | `_boot.js` / `getDeveloperGitStatus()` | Real read-only status/log. | Improve states/timeout/fallback labels. | No | Yes | `SYSTEM_INTEGRATION` | Low | Low | High |
| Developer quick scripts | DEVELOPER | `WorkspaceManager.renderDeveloperScripts()` | Detects scripts but execution disabled. | Keep as draft/launcher placeholder until confirmation model. | No | Yes | `SYSTEM_INTEGRATION` | Medium | Medium | Medium |
| Developer commit/push buttons | DEVELOPER | `WorkspaceManager.renderDeveloperGit()` | Placeholder buttons. | Keep disabled; label as `APPROVAL REQUIRED`. | No | Yes | `SYSTEM_INTEGRATION` | Medium | High | Medium |
| Developer logs panel | DEVELOPER | `WorkspaceManager.renderDeveloperLogs()` | Static operational notes. | Real approved-script/process log capture later. | No | Yes | `SYSTEM_INTEGRATION` | Medium | Medium | Later |
| Developer dependency audit | DEVELOPER | `_boot.js` / `getDeveloperHealth()` | Placeholder `run npm audit manually`. | Optional manual audit button later; no polling. | No | Yes | `SYSTEM_INTEGRATION` | Medium | Low | Medium |
| Agent profiles | AGENT COMMAND | `_boot.js` / `agent-command.json` | Real local configurable agents, no AI provider. | Keep read-only/draft config. | No | Yes | `AI_AGENT` | Low | Medium | Done |
| Agent selected output | AGENT COMMAND | `WorkspaceManager.renderAgentCommandOutput()` | Placeholder output from local config. | Local history/prompt copying first; real AI later. | Optional later | Yes local | `AI_AGENT` | Medium | Medium | Medium |
| Agent request proposal button | AGENT COMMAND | `_boot.js` / `agent-command-run-agent` | Always reports provider not connected. | Keep disabled until provider adapter and redaction exist. | Yes later | Yes fallback | `AI_AGENT` | High | High | Later |
| Agent GitHub Issues action | AGENT COMMAND | `workspaces.config.js` | Future link only. | External launcher first; API later. | Optional | Yes launcher | `EXTERNAL_LAUNCHER` | Low | Low | Medium |
| Agent apply/autonomy levels | AGENT COMMAND | `agent-command.json` / docs | Future locked. | Do not enable in this pass. | Optional | No | `AI_AGENT` | High | High | Last |

## Recommended activation order

1. `LOCAL_ONLY`: keep and strengthen persistence for active workspace,
   workspace navigation, project timelines, map layer toggles, media local state
   and local config files.
2. `EXTERNAL_LAUNCHER`: centralize safe launchers and states for COMMS,
   ENGINEER, STUDENT, ARTIST, BUSINESS, OSINT and LAUNCH BAY.
3. Fallback states: ensure every disabled/unconfigured module reports
   `NOT CONFIGURED`, `CONFIG REQUIRED`, `API_KEY_MISSING`, `OFFLINE`,
   `SERVICE_UNAVAILABLE`, `PLACEHOLDER` or `ACTIVE`.
4. `API_OPTIONAL`: add provider adapters only after provider/key/fallback docs
   exist. Do not poll while off.
5. `SYSTEM_INTEGRATION`: expand Developer/Calendar/Music/app integrations only
   with explicit local permissions and no secrets.
6. `AI_AGENT`: keep Agent Command local/read-only/draft until a provider
   adapter, context redaction and explicit approval flow are designed.

## Immediate quick wins selected for this pass

- Add a central safe launcher result model for workspace links/apps.
- Make placeholder widgets visually report `MOCK`, `PLACEHOLDER`,
  `ONLINE READY`, `CONFIG REQUIRED` or `ACTIVE`.
- Preserve all existing local persistence and document it.
- Improve Developer placeholder labels without enabling scripts/commits.
- Document API fallback states and provider boundaries before adding new APIs.
