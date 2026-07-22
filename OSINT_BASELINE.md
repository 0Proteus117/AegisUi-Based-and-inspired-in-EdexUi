# AegisUi OSINT Phase 0 — Protected Baseline

**Purpose:** record a reproducible, non-invasive baseline of the current OSINT workspace before any provider, evidence, case, query-session or API work begins.

## Scope and protection

This is a documentation-only baseline. No renderer, Electron main-process, OSINT runtime, package configuration, local configuration or private data was changed.

Protected without modification in this phase:

- Boot intro and AegisUi branding.
- HUB, ENG, GearLab, map, Apple Music, Calendar and Project Timeline.
- Assistant, Ollama, private memory and Command Router.
- All other workspaces and local/user configuration.

## Snapshot

| Item | Recorded value |
| --- | --- |
| Repository | `0Proteus117/AegisUi-Based-and-inspired-in-EdexUi` |
| Baseline branch | `feature/systems-online-pass` |
| Baseline commit | `55c3ffe` — `v2.3.2 aegisui application identity and icon` |
| Baseline version | `2.3.2` in root and `src/package.json` |
| Audit worktree | `/Volumes/Seagate Basic/AegisUi-worktrees/osint-phase0-protected-baseline` |
| Audit branch | `codex/osint-phase0-protected-baseline` |
| Worktree status before documentation | clean |
| Runtime changes in Phase 0 | none |

## Current OSINT catalog

The active OSINT workspace is a local, declarative public-source catalog:

| Metric | Value |
| --- | ---: |
| Categories | 9 |
| Tools | 161 |
| Featured cards | 4 |
| Duplicate tool IDs | 0 |
| Tools without URL | 0 |
| Tools without tags | 0 |
| Tools with unknown category | 0 |

| Category | ID | Tools |
| --- | --- | ---: |
| Discovery / Research | `discovery` | 18 |
| Archive / Evidence | `archives` | 13 |
| Domains / Infrastructure | `infrastructure` | 24 |
| Threat Intelligence | `threat` | 17 |
| Geo / Visual | `geospatial` | 22 |
| Entities / Records | `entities` | 24 |
| Public Presence | `presence` | 13 |
| Data / Analysis | `data` | 17 |
| Transport / Space | `transport` | 13 |

## Verification performed

### Clean-worktree visual review

The application was launched only from this disposable Seagate worktree, using a temporary Electron user-data directory. The user's active local copy and its userData were not used or changed.

| Check | Result | Evidence / note |
| --- | --- | --- |
| Intro, dark appearance | observed | AegisUi boot sequence and dark cockpit reached normally. |
| Light appearance | observed in isolated test | The boot splash was rendered in light mode in the temporary test instance. |
| macOS theme synchronization | source-level verified; live OS preference not changed | `bootSplash.class.js` follows `prefers-color-scheme`; changing the user's macOS appearance was outside this protected audit. |
| Open OSINT workspace | observed | `OSINT TOOL CATALOG` rendered normally. |
| Main catalog | observed | 9 categories and 161 tools shown by the active registry. |
| Category navigation | observed | Archive / Evidence opened with 13 cards. |
| Tool selection | observed | Wayback Machine detail dialog opened. |
| Detail modal | observed | URL, tags, `OPEN WEB`, `COPY URL` and `CLOSE` were present. |
| External opening | observed | `OPEN WEB` opened Wayback Machine in the external browser. |
| Close and reopen | observed | Closing returned to the category listing; selecting the card reopened its detail dialog. |
| Isolated in-suite webview | not reachable from the active catalog | A legacy isolated-webview implementation exists, but the active catalog no longer supplies the API it requires. This is a Phase 0 finding, not a runtime failure concealed by documentation. |

### Automated checks

Executed with the project’s bundled Node runtime:

| Command | Result | Notes |
| --- | --- | --- |
| `node scripts/release-health-check.js` | **OK** | Version, branding, protected-data and expected project health checks passed. |
| `node scripts/run-regression-checks.js` | **WARN / non-zero** | The broad regression runner exposed two existing clean-worktree defects listed below. It was not modified in this phase. |
| `node scripts/test-osint-workspace.js` | **OK** | Current 9-category, 161-tool catalog and workspace-manager signatures are present. |
| `node scripts/test-osint-native-access-foundation.js` | **FAIL (existing API drift)** | The test calls the obsolete `getToolsForCategory()` registry method, which the active registry does not export. |

Existing clean-worktree findings from the regression runner:

1. `test-osint-native-access-foundation.js` expects the Phase 1 registry contract (`getToolsForCategory()` / embedded-source metadata), while `osintTools.registry.js` now exports only `CATEGORIES`, `TOOLS` and `FEATURED`.
2. `test-assistant-memory-bootstrap.js` expects the deliberately gitignored private bootstrap source directory in the worktree. The installed private userData copy reported `READY` with 10 files; the test itself is not portable to a clean clone/worktree.

Neither condition was changed because this phase explicitly forbids runtime, private-memory and unrelated-module modifications.

## Baseline conclusion

The visible OSINT catalog is stable as a reference-only external-tool catalog. It is **not yet** a provider-backed investigation workspace. A dormant native/isolated access foundation remains in the codebase, but it is structurally disconnected from the current registry and renderer. Any next OSINT phase must make that boundary explicit instead of mixing the two models.
