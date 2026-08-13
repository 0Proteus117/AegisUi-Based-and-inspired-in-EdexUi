# AegisUi

Local-first macOS engineering cockpit based on the visual spirit of eDEX-UI.

[![Repo health](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/repo-health.yml/badge.svg?branch=feature%2Fsystems-online-pass)](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/repo-health.yml)
[![CodeQL](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/codeql-analysis.yml/badge.svg?branch=feature%2Fsystems-online-pass)](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/actions/workflows/codeql-analysis.yml)
![Platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-3BA7FF)
![Local first](https://img.shields.io/badge/local--first-yes-7CCBFF)
![Version](https://img.shields.io/badge/version-2.6.3-13263A)

## Current status

AegisUi is currently developed on `feature/systems-online-pass`.

The application, bundle display name and release artifacts are branded
`AegisUi`. The active local release line is `v2.6.x`.

### Appearance

AegisUi has one local appearance preference in its existing `settings.json`:
`System` (default), `Light` or `Dark`. It updates the cockpit live without
reloading providers, mutating local OSINT Cases/Evidence records or changing
the selected terminal theme. The terminal canvas deliberately remains dark for
legibility. See [AEGIS_LIGHT_MODE.md](AEGIS_LIGHT_MODE.md) and
[AEGIS_THEME_ARCHITECTURE.md](AEGIS_THEME_ARCHITECTURE.md).

## What it is

AegisUi is a cockpit-style desktop environment for engineering work:

- HUB dashboard with live map, Calendar, Project Timeline, Apple Music,
  Applications grid and status panels.
- ENG workspace with CAD/CAM/CAE launchers, manufacturing tools, internal
  engineering calculators, materials, standards and research references.
- OSINT Analyst Deck with a normalized provider registry: public-source
references carry explicit access, provider-status, risk and legal-context
policy before a permitted external browser action is available. Its `TOOL
ACCESS` panel keeps selection, metadata, policy decisions and a private
in-memory session view separate from external actions. The approved Wayback
Availability capability additionally supports one manual URL/domain query via a
fixed endpoint, cancellable and normalized in the renderer; it never opens a
snapshot automatically. v2.4.0 adds an explicit local Investigation Case layer
for selected normalized results only: cases, evidence metadata, notes,
timeline, SHA-256 integrity checks and JSON/Markdown export. It never persists
the ephemeral session by default or sends case data to a provider.
  v2.6.0 is the OSINT Analyst Desk milestone: it consolidates and hardens the
  explicit Investigation Orchestration and Case Overview flow introduced in
  v2.5.7, preserving bounded local Case isolation, explicit handoffs and the
  Evidence integrity model without automatic provider chaining, hidden
  persistence or a second investigation database. v2.5.6 adds local,
  analyst-controlled Entity Resolution: provenance-aware
  entity profiles, evidence-backed relationships, bounded graph review and
  redaction-reviewed Case Evidence promotion. It is not a people-search,
  biometric, social-crawling or enrichment system. v2.5.5 preserves the v2.5.4 Research / Documents / Source Verification
  capability and corrects its content-sized Source Context and Excerpt layout
  at compact widths. It keeps long metadata and every Evidence control in
  normal scrollable document flow. v2.5.4 adds an explicit Research / Documents / Source Verification surface
  for one public URL, DOI or local PDF at a time. Crossref retrieves metadata
  for a DOI through one fixed endpoint; URL archive availability reuses the
  existing explicit Wayback action, and PDF inspection is local and bounded.
  It preserves field-level provenance, short analyst excerpts and only
  redaction-reviewed normalized Evidence; it is not a crawler, scraper,
  downloader or generic web browser. v2.5.3 adds an explicit, passive Domain & Infrastructure Context for one
  public domain or IP at a time. It uses a bounded fixed DNS record set and
  explicit network lookup only; it is not a scanner, crawler or monitor.
  v2.5.2 hardens Visual & Media Verification for one explicitly selected local
  JPEG/PNG/WebP image at a time: bounded preview, normalized file metadata and
  original-byte SHA-256. It does not upload the media, infer authenticity or
  silently persist the original. Image GPS can only hand off to Geospatial
  Verification after an explicit analyst action.
- STUD v2.6.12 adds local, derived Progress Analytics for course work,
  compatible assessment context, explicit deadlines, revision/study activity,
  data completeness and source-visible conflicts. It neither predicts outcomes
  nor contacts Moodle, Calendar, Email, AI or external providers. Text and
  pass/fail grades are represented honestly without averaging them. STUD v2.6.11 adds a discipline-neutral Notebook / Data / GitHub workbench:
  editable local Markdown/code notebooks with an honest `NOT_INSTALLED` execution
  state, managed CSV/TSV data inspection and explicit public GitHub repository
  references. It never exposes a shell, Python runtime, generic network proxy,
  token or hidden import; Notebook/Data/GitHub material reaches Local Academic AI
  only through a reviewed, bounded Academic Context Package. STUD v2.6.10 adds an explicit local Academic AI surface that consumes only
  reviewed Context Packages, uses bounded local retrieval and Ollama without
  tools, cloud fallback or automatic persistence. It builds on the
  explainable, provenance-aware Academic Intelligence layer: bounded local
  context, concepts, coverage, source support, manual decisions and
  inspectable Context Packages. The Academic Intelligence layer itself invokes
  no model, cloud provider or external service.
- STUD v2.6.8 adds a discipline-neutral local Document Intelligence workbench
  for explicit PDF ingestion, page/chunk provenance and academic context. It
  remains offline-first and does not upload or automatically classify documents.
- STUD v2.6.7 adds an explicit local Engineering Compute workbench for bounded
  equations, units, numerical methods, numeric data and plots. Its typed
  engine runs offline and saves a result only on explicit academic promotion;
  SymPy/Pint/CoolProp/python-control remain honest optional local packs rather
  than cloud dependencies. It also retains v2.6.6 deterministic local revision
  and study planning: canonical
  RevisionItems, explicit academic links, bounded study sessions, offline
  history and explainable schedules. It preserves v2.6.5 academic orchestration:
  Moodle observations,
  explicitly selected Calendar/Email references, local resources, notes and
  research can be reviewed around canonical Courses and Assignments without
  automatic external actions. Phase 4's Moodle connection surface remains
  capability-driven and read-only. A sanctioned
  institution-issued Moodle Web Service token is encrypted through macOS
  secure storage; optional same-host ICS exports supply a constrained fallback
  when REST is unavailable. Moodle never receives a university password from
  AegisUi, and no Moodle action can submit work, modify a course, message,
  grade, enrol, upload or mutate Calendar. v2.6.3 adds a serious local-first
  Research and Academic Writing desk to
  the Student Command Center. Explicit OpenAlex/Crossref/DataCite/Unpaywall
  lookups normalize only selected papers into the canonical SQLite store;
  PDF.js, structured Tiptap/ProseMirror notes, KaTeX and Citation.js continue
  working offline after material is explicitly saved. Zotero interoperability
  is optional, local and read-only; no paid service is required.
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

OSINT is a visual, public-source research workspace. Its catalog has nine
domains and a validated provider registry. Approved public references open only
through the existing external browser action. `REFERENCE_ONLY` entries are
visible for defensive ecosystem context but have no launch, copy, install,
integration, IPC or operational route. The workspace does not scrape, collect
credentials, crawl or automate third-party services.

See [OSINT_PROVIDER_SCHEMA.md](OSINT_PROVIDER_SCHEMA.md),
[OSINT_PROVIDER_POLICY.md](OSINT_PROVIDER_POLICY.md),
[OSINT_REFERENCE_ONLY_POLICY.md](OSINT_REFERENCE_ONLY_POLICY.md),
[OSINT_LEGAL_STATUS_POLICY.md](OSINT_LEGAL_STATUS_POLICY.md) and
[OSINT_LEGACY_RUNTIME_MAP.md](OSINT_LEGACY_RUNTIME_MAP.md),
[OSINT_TOOL_ACCESS_PANEL.md](OSINT_TOOL_ACCESS_PANEL.md),
[OSINT_PANEL_STATE_MODEL.md](OSINT_PANEL_STATE_MODEL.md),
[OSINT_SESSION_HISTORY.md](OSINT_SESSION_HISTORY.md) and
[OSINT_ACCESSIBILITY.md](OSINT_ACCESSIBILITY.md),
[OSINT_PROVIDER_RUNTIME.md](OSINT_PROVIDER_RUNTIME.md),
[OSINT_CAPABILITY_MODEL.md](OSINT_CAPABILITY_MODEL.md),
[OSINT_PROVIDER_ADAPTERS.md](OSINT_PROVIDER_ADAPTERS.md),
[OSINT_QUERY_CONTEXT.md](OSINT_QUERY_CONTEXT.md),
[OSINT_NORMALIZED_RESULTS.md](OSINT_NORMALIZED_RESULTS.md),
[OSINT_PROVIDER_ERRORS.md](OSINT_PROVIDER_ERRORS.md) and
[OSINT_PROVIDER_SECURITY.md](OSINT_PROVIDER_SECURITY.md),
[OSINT_WAYBACK_MIGRATION.md](OSINT_WAYBACK_MIGRATION.md),
[OSINT_GEOSPATIAL_VERIFICATION.md](OSINT_GEOSPATIAL_VERIFICATION.md),
[OSINT_GEO_PROVIDER_DISCOVERY.md](OSINT_GEO_PROVIDER_DISCOVERY.md),
[OSINT_GEO_QUERY_MODEL.md](OSINT_GEO_QUERY_MODEL.md),
[OSINT_GEO_EVIDENCE_MODEL.md](OSINT_GEO_EVIDENCE_MODEL.md),
[OSINT_GEO_SECURITY.md](OSINT_GEO_SECURITY.md) and
[OSINT_VISUAL_MEDIA_VERIFICATION.md](OSINT_VISUAL_MEDIA_VERIFICATION.md),
[OSINT_MEDIA_METADATA_MODEL.md](OSINT_MEDIA_METADATA_MODEL.md),
[OSINT_MEDIA_EVIDENCE_MODEL.md](OSINT_MEDIA_EVIDENCE_MODEL.md),
[OSINT_MEDIA_GEO_HANDOFF.md](OSINT_MEDIA_GEO_HANDOFF.md),
[OSINT_MEDIA_SECURITY.md](OSINT_MEDIA_SECURITY.md) and
[OSINT_PHASE3_VALIDATION.md](OSINT_PHASE3_VALIDATION.md),
[OSINT_SOURCE_VERIFICATION.md](OSINT_SOURCE_VERIFICATION.md),
[OSINT_RESEARCH_QUERY_MODEL.md](OSINT_RESEARCH_QUERY_MODEL.md),
[OSINT_RESEARCH_PROVENANCE.md](OSINT_RESEARCH_PROVENANCE.md),
[OSINT_RESEARCH_EVIDENCE.md](OSINT_RESEARCH_EVIDENCE.md),
[OSINT_RESEARCH_SECURITY.md](OSINT_RESEARCH_SECURITY.md),
[OSINT_RESEARCH_PROVIDER_DISCOVERY.md](OSINT_RESEARCH_PROVIDER_DISCOVERY.md) and
[OSINT_PHASE8_VALIDATION.md](OSINT_PHASE8_VALIDATION.md).

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

For a local macOS release build, use the normal Electron Builder path. If the
build host has Electron Builder but no npm executable for its dependency
collector, the controlled fallback `node scripts/build-local-dmg.js` stages the
current source into a fresh ad-hoc-signed `AegisUi.app` and creates
`dist/AegisUi-<version>-arm64.dmg`; it never reuses an older app or DMG as
input.

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
- [OSINT_PROVIDER_SCHEMA.md](OSINT_PROVIDER_SCHEMA.md)
- [OSINT_PROVIDER_POLICY.md](OSINT_PROVIDER_POLICY.md)
- [OSINT_REFERENCE_ONLY_POLICY.md](OSINT_REFERENCE_ONLY_POLICY.md)
- [OSINT_LEGAL_STATUS_POLICY.md](OSINT_LEGAL_STATUS_POLICY.md)
- [OSINT_LEGACY_RUNTIME_MAP.md](OSINT_LEGACY_RUNTIME_MAP.md)
- [OSINT_TOOL_ACCESS_PANEL.md](OSINT_TOOL_ACCESS_PANEL.md)
- [OSINT_PANEL_STATE_MODEL.md](OSINT_PANEL_STATE_MODEL.md)
- [OSINT_SESSION_HISTORY.md](OSINT_SESSION_HISTORY.md)
- [OSINT_ACCESSIBILITY.md](OSINT_ACCESSIBILITY.md)
- [OSINT_PHASE2_VALIDATION.md](OSINT_PHASE2_VALIDATION.md)
- [OSINT_PROVIDER_RUNTIME.md](OSINT_PROVIDER_RUNTIME.md)
- [OSINT_CAPABILITY_MODEL.md](OSINT_CAPABILITY_MODEL.md)
- [OSINT_PROVIDER_ADAPTERS.md](OSINT_PROVIDER_ADAPTERS.md)
- [OSINT_QUERY_CONTEXT.md](OSINT_QUERY_CONTEXT.md)
- [OSINT_NORMALIZED_RESULTS.md](OSINT_NORMALIZED_RESULTS.md)
- [OSINT_PROVIDER_ERRORS.md](OSINT_PROVIDER_ERRORS.md)
- [OSINT_PROVIDER_SECURITY.md](OSINT_PROVIDER_SECURITY.md)
- [OSINT_WAYBACK_MIGRATION.md](OSINT_WAYBACK_MIGRATION.md)
- [OSINT_PHASE3_VALIDATION.md](OSINT_PHASE3_VALIDATION.md)
- [OSINT_GEOSPATIAL_VERIFICATION.md](OSINT_GEOSPATIAL_VERIFICATION.md)
- [OSINT_GEO_PROVIDER_DISCOVERY.md](OSINT_GEO_PROVIDER_DISCOVERY.md)
- [OSINT_GEO_QUERY_MODEL.md](OSINT_GEO_QUERY_MODEL.md)
- [OSINT_GEO_EVIDENCE_MODEL.md](OSINT_GEO_EVIDENCE_MODEL.md)
- [OSINT_GEO_SECURITY.md](OSINT_GEO_SECURITY.md)
- [OSINT_PHASE5_VALIDATION.md](OSINT_PHASE5_VALIDATION.md)
- [OSINT_VISUAL_MEDIA_VERIFICATION.md](OSINT_VISUAL_MEDIA_VERIFICATION.md)
- [OSINT_MEDIA_METADATA_MODEL.md](OSINT_MEDIA_METADATA_MODEL.md)
- [OSINT_MEDIA_EVIDENCE_MODEL.md](OSINT_MEDIA_EVIDENCE_MODEL.md)
- [OSINT_MEDIA_GEO_HANDOFF.md](OSINT_MEDIA_GEO_HANDOFF.md)
- [OSINT_MEDIA_SECURITY.md](OSINT_MEDIA_SECURITY.md)
- [OSINT_PHASE6_VALIDATION.md](OSINT_PHASE6_VALIDATION.md)
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
