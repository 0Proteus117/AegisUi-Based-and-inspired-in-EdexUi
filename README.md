# AegisUi / EdexUi-Eng

Local-first macOS engineering cockpit based on the visual spirit of eDEX-UI.

[![Repo health](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/repo-health.yml/badge.svg?branch=feature%2Fsystems-online-pass)](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/repo-health.yml)
[![CodeQL](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/codeql-analysis.yml/badge.svg?branch=feature%2Fsystems-online-pass)](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/codeql-analysis.yml)
![Platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-3BA7FF)
![Local first](https://img.shields.io/badge/local--first-yes-7CCBFF)
![Version](https://img.shields.io/badge/version-2.2.9-13263A)

## Current status

AegisUi is currently developed on `feature/systems-online-pass`.

The app is packaged as `EdexUi-Eng` while the project identity migrates toward
the AegisUi name. The stable local release line is `v2.2.x`.

## What it is

AegisUi is a cockpit-style desktop environment for engineering work:

- HUB dashboard with live map, Calendar, Project Timeline, Apple Music,
  Applications grid and status panels.
- ENG workspace with CAD/CAM/CAE launchers, manufacturing tools, internal
  engineering calculators, materials, standards and research references.
- OSINT Analyst Deck with nine public-source research domains, 161 curated
  resources, compact tool briefs and controlled external launches. It does not
  automate collection, credential access or intrusive actions.
- Live systems map with TomTom traffic, AISStream maritime traffic,
  RainViewer radar, Open-Meteo Marine conditions and CelesTrak SAT support.
- Assistant presence layer with Angie/Gustav/Ares/Aphrodite profiles,
  local Ollama written chat, private local memory bootstrap and a safe
  allowlisted command router.
- Local Apple Music bridge through direct Music.app Automation. It does not use
  System Events and it keeps failures isolated inside the Music panel.
- Standalone Aegis GearLab research module under `tools/aegis-gearlab/`.
  GearLab is intentionally isolated from the AegisUi renderer in this release.

## Stable systems

| System | Status |
| --- | --- |
| HUB | Stable |
| ENG workspace | Stable |
| ENG calculators | Stable |
| Apple Music | Local Music.app bridge |
| Map / Traffic / AIS / Radar / Marine / SAT | Live providers with local fallbacks |
| Calendar | Local macOS integration |
| Project Timeline | Local JSON state |
| Assistant / Ollama | Local written chat |
| Command router | Safe allowlist only |
| DMG packaging | Local macOS build path |

## Workspaces

The top command rail exposes:

1. HUB
2. ENG
3. OSINT
4. STUD
5. ART
6. BUS
7. COMMS
8. BAY
9. DEV
0. AGENT

HUB stays alive while workspaces change. Non-HUB workspaces render only when
opened.

## ENG workspace

ENG is the engineering command deck:

- CAD/CAM/design launchers.
- CAE/simulation references.
- Manufacturing and 3D printing tools.
- Unit, torque/power/RPM, gear ratio, beam deflection, material mass and
  thread/drill calculators.
- Material quick cards.
- Standards and research links.
- Project Timeline integration.

See [ENG_WORKSPACE.md](ENG_WORKSPACE.md) and [WORKSPACES.md](WORKSPACES.md).

## OSINT Analyst Deck

OSINT is a visual, public-source research catalog. Select a domain to open its
resource deck, then inspect a tool brief before choosing `OPEN WEB`. The deck
contains no scraping, credential collection, tracking or destructive tooling.

Release visual overview: [OSINT Analyst Deck preview](docs/releases/v2.2.9/osint-release-preview.html).

## Assistant

The assistant layer is local-first:

- Gustav: dry, technical, private profile.
- Angie: warm, present, private profile.
- Ares: public tactical profile.
- Aphrodite: public warm/elegant profile.

Current capabilities:

- visual orb and HUD panel;
- local written chat through Ollama;
- local conversation memory in userData;
- private bootstrap memory support;
- safe UI command router.

Not connected yet:

- voice;
- STT;
- TTS;
- Apple Native provider;
- arbitrary shell or destructive commands.

See [ASSISTANT_SYSTEM.md](ASSISTANT_SYSTEM.md),
[ASSISTANT_LOCAL_AI.md](ASSISTANT_LOCAL_AI.md),
[ASSISTANT_MEMORY.md](ASSISTANT_MEMORY.md) and
[ASSISTANT_COMMAND_ROUTER.md](ASSISTANT_COMMAND_ROUTER.md).

## Local setup

Requirements:

- macOS on Apple Silicon for the validated app path.
- Node.js matching `.nvmrc`.
- Xcode command line tools.
- Ollama only if using local Assistant chat.

Install:

```sh
npm ci
cd src && npm ci && cd ..
```

Run:

```sh
npm run start
```

Optional local secrets belong in `.env.local` and must never be committed.
See [.env.example](.env.example) and [CONFIGURATION.md](CONFIGURATION.md).

## Validation

Lightweight repo checks:

```sh
node scripts/release-health-check.js
node scripts/run-regression-checks.js
```

Provider-specific checks are available under `scripts/`.

## GitHub workflows

- `Repo health` runs automatically on `feature/systems-online-pass` pushes and
  pull requests.
- `CodeQL` runs on the active AegisUi branch and weekly schedule.
- `Build packaged binaries` is manual-only. DMGs are generated locally because
  Apple Silicon packaging, ad-hoc signing and Music.app Automation identity are
  environment-sensitive.

See [GITHUB_WORKFLOWS.md](GITHUB_WORKFLOWS.md).

## Local/private data

The app creates local userData files for projects, playlists, Assistant memory,
conversation history, map preferences and app configuration.

These are intentionally ignored:

- `.env`, `.env.local`;
- `assistant/memory/private/`;
- `assistant/chat/`;
- generated DMGs/zips;
- audio/model/sample files;
- GearLab venvs and generated exports.

See [SECURITY.md](SECURITY.md) and [CONFIGURATION.md](CONFIGURATION.md).

## Documentation index

- [CHANGELOG.md](CHANGELOG.md)
- [CONFIGURATION.md](CONFIGURATION.md)
- [GITHUB_WORKFLOWS.md](GITHUB_WORKFLOWS.md)
- [ENG_WORKSPACE.md](ENG_WORKSPACE.md)
- [WORKSPACES.md](WORKSPACES.md)
- [OSINT release visual preview](docs/releases/v2.2.9/osint-release-preview.html)
- [MAP_LAYERS.md](MAP_LAYERS.md)
- [MAP_PROVIDER_HARDENING.md](MAP_PROVIDER_HARDENING.md)
- [APPLE_MUSIC.md](APPLE_MUSIC.md)
- [ASSISTANT_SYSTEM.md](ASSISTANT_SYSTEM.md)
- [ASSISTANT_LOCAL_AI.md](ASSISTANT_LOCAL_AI.md)
- [ASSISTANT_MEMORY.md](ASSISTANT_MEMORY.md)
- [ASSISTANT_COMMAND_ROUTER.md](ASSISTANT_COMMAND_ROUTER.md)
- [INTEGRATIONS.md](INTEGRATIONS.md)
- [OFFLINE_MODE.md](OFFLINE_MODE.md)
- [SECURITY.md](SECURITY.md)

## Project policy

AegisUi does not present fake live systems as real functionality. Live modules
must either use real providers, local data, or show an explicit offline/blocked
state. Packaging and release artifacts must be validated locally before being
published.

See [REPOSITORY_POLICY.md](REPOSITORY_POLICY.md).

## License

This fork keeps the upstream eDEX-UI GPL-3.0 license. See [LICENSE](LICENSE).

