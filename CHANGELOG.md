# Changelog

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
