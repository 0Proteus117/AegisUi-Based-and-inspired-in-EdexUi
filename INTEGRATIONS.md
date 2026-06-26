# AegisUi integrations

This document tracks which parts of AegisUi are real integrations, which are
safe launchers, which are local-only, and which remain placeholders for future
work.

## Integration states

| State | Meaning |
| --- | --- |
| `ACTIVE` | Real local or online functionality is implemented. |
| `ONLINE READY` | The module can go online when configured, but has safe fallback states. |
| `CONFIG REQUIRED` | The module needs a user-owned key, local file or account login. |
| `EXTERNAL` | The module opens a safe external URL/deep link or app. |
| `MOCK` | Visual or local test representation only. |
| `PLACEHOLDER` | Architecture exists, provider/backend pending. |
| `FUTURE` | Documented roadmap only. |

## Local-only integrations

| Module | Current status | Storage |
| --- | --- | --- |
| Project Timelines | `ACTIVE` | `projects.json` |
| Project Control | `ACTIVE` | `projects.json`, `projects.backup.json` |
| Map layer toggles | `ACTIVE` | `map-layers.json` + renderer local storage |
| Launch Bay manual library | `ACTIVE` | `launch-bay-games.json` |
| Agent Command config/task board | `ACTIVE` local foundation | `agent-command.json` |
| Developer Deck config | `ACTIVE` local foundation | `developer-deck.json` |
| Workspace state | `ACTIVE` | `workspace-state.json` |
| Music shuffle/repeat UI fallback | `ACTIVE` local state | renderer local storage |

These should remain usable offline and must not require cloud services.

## External launchers

Workspace launchers use a safe opener. They do not run shell commands.

Allowed external URL families:

- `https://...`;
- `steam://rungameid/<APP_ID>`;
- `steam://open/games`;
- `com.epicgames.launcher://...`;
- `goggalaxy://...`;
- `battlenet://...`.

Installed Mac applications are launched only through the discovered
application index. Unknown app paths are rejected.

Launchers currently appear in:

- `ENGINEER`;
- `OSINT`;
- `STUDENT`;
- `ARTIST`;
- `BUSINESS`;
- `COMMS`;
- `LAUNCH BAY`;
- `DEVELOPER`;
- `AGENT COMMAND`.

## Optional API integrations

| Module | Current behavior | Future provider candidates | Key required |
| --- | --- | --- | --- |
| TomTom road traffic | `ACTIVE` when user key exists; otherwise `API_KEY_MISSING` | TomTom Traffic API | Yes |
| RainViewer radar | `ONLINE READY`; public metadata/tile fallback | RainViewer | No |
| Air traffic | `PLACEHOLDER` only | OpenSky Network, ADS-B Exchange | Maybe |
| Maritime AIS | `PLACEHOLDER` only | AISStream, AISHub, MarineTraffic, Kpler | Usually |
| Satellites | `PLACEHOLDER` only | CelesTrak GP/TLE | No/Maybe |
| Ocean alerts | `PLACEHOLDER` only | NOAA NDBC/DART, NOAA CO-OPS | No/Maybe |
| Game artwork | Local images only; generated placeholder fallback | SteamGridDB | Yes |
| Business/market data | Placeholder only | FRED, SEC EDGAR, financial providers | Maybe |
| News/source feeds | Launcher/placeholder only | RSS/provider-specific feeds | Maybe |

No new optional API provider is called in v1.9.x.

## System integrations

| Module | Current behavior |
| --- | --- |
| Terminal | Existing local terminal backend. |
| Applications grid | Reads installed Mac apps and opens known `.app` bundles. |
| Calendar | Local EventKit helper; accounts must already be configured in macOS. |
| Apple Music | macOS Automation for playback metadata/control when permitted. |
| Developer Git status | Read-only `git status` / `git log`. |
| Developer scripts | Detected from `package.json`; execution remains disabled. |
| Developer health | Local Node/Electron/Chrome/npm/Git/package manager status. |

System integrations must avoid `.env`, credentials, tokens and arbitrary
commands.

## AI / Agent integrations

Agent Command is local-only in v1.9.x.

Implemented:

- configurable agents;
- roles;
- base prompts;
- task board;
- local output/history fields;
- copying prompts/results/output;
- routing tasks between agents.

Not implemented:

- AI provider calls;
- context upload;
- model selection with real tokens;
- generated diffs from a provider;
- applying changes;
- running commands;
- commits/pushes.

Any future AI integration must be modular, opt-in, redacted and approval-first.

## Fallback states

Optional online modules should use:

- `API_KEY_MISSING`;
- `OFFLINE`;
- `SERVICE_UNAVAILABLE`;
- `RATE_LIMITED`;
- `ONLINE`;
- `PLACEHOLDER`;
- `FUTURE`.

Disabled modules must not poll, retry aggressively or keep timers alive.

## Security rules

- Never commit `.env`, API keys, tokens, cookies, sessions or local histories.
- Keep user-specific settings in local app data.
- Do not execute arbitrary commands from launcher config.
- Do not add webviews without a dedicated Electron isolation review.
- Do not send project context to cloud services without explicit confirmation.
- Do not convert a placeholder into an online integration without fallback,
  timeout and rate-limit behavior.
