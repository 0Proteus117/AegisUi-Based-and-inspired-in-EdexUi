# OSINT Phase 0 Regression Matrix

## Phase rule

This phase is documentation-only. The expected source diff contains the four OSINT audit documents and no runtime code, package, configuration, asset or private-data modifications.

## Protected system matrix

| Area | Required preservation | Baseline evidence | Phase 0 result |
| --- | --- | --- | --- |
| Intro | Keep established AegisUi startup sequence untouched | Clean-worktree dark boot visually reached; light splash rendered in temporary test mode | not modified |
| Branding | Keep AegisUi identity and icon untouched | `release-health-check` passed branding health | not modified |
| HUB | Preserve working HUB workspace | Clean-worktree cockpit reached after boot | not modified |
| ENG | Preserve engineering workspace and tools | No ENG files in scope/diff; regression runner executed | not modified |
| GearLab | Preserve standalone/ENG boundaries | No GearLab file in scope/diff | not modified |
| Main map | Preserve map runtime | No map file in scope/diff; regression runner executed | not modified |
| Apple Music | Preserve bridge and UI | No music file in scope/diff; regression runner executed | not modified |
| Calendar | Preserve current calendar behavior | No calendar file in scope/diff | not modified |
| Project Timeline | Preserve current timeline behavior | No timeline file in scope/diff | not modified |
| Assistant / Ollama | Preserve local-AI integration | Regression runner executed; no assistant file changed | not modified |
| Command Router | Preserve safe routing boundary | No router file in scope/diff | not modified |
| Private memory | Never read, stage or alter private bootstrap | Gitignored source was not changed; installed userData remains outside worktree | not modified |
| Local configuration | Never read, stage or alter local config | Temporary Electron profile used for visual review | not modified |
| Other workspaces | Preserve all non-OSINT workspaces | No unrelated runtime file in scope/diff | not modified |

## OSINT behavior matrix

| Behavior | Baseline result | Evidence / limitation |
| --- | --- | --- |
| Enter OSINT | PASS | Active catalog rendered from clean worktree. |
| Catalog home | PASS | 9 category tiles, 4 featured tools, 161 total tools. |
| Category selection | PASS | Archive / Evidence listing rendered 13 sources. |
| Tool detail | PASS | Wayback detail modal displayed URL, tags and actions. |
| Open external web | PASS | Wayback opened through external browser. |
| Close/reopen detail | PASS | Category list remained active and dialog reopened. |
| Static `TOOL ACCESS` panel | PASS | Present in category view; reference-only content. |
| Isolated in-suite web source | BLOCKED BY ARCHITECTURE DRIFT | Legacy implementation exists but active registry cannot resolve embedded tools. |
| Native Wayback query | BLOCKED BY ARCHITECTURE DRIFT | IPC remains, but active renderer provides no native-provider tool contract. |

## Automated validation matrix

| Command | Result | Interpretation |
| --- | --- | --- |
| `node scripts/release-health-check.js` | PASS | Baseline repository health and protected-data checks are green. |
| `node scripts/test-osint-workspace.js` | PASS | Current catalog contract is internally consistent. |
| `node scripts/test-osint-native-access-foundation.js` | FAIL | Existing test targets a removed registry API; no Phase 0 repair was allowed. |
| `node scripts/run-regression-checks.js` | WARN / non-zero | Aggregator surfaces the OSINT API drift plus non-portable private-bootstrap source expectation. |

## Change gates for the next OSINT implementation phase

No future OSINT runtime change should be accepted unless all relevant gates below are explicit and tested.

| Gate | Required condition |
| --- | --- |
| Catalog continuity | Current 9 categories and 161 reference entries remain readable and selectable. |
| Provider policy | Each non-reference provider declares allowed domains, capability, retention and error behavior. |
| IPC boundary | Renderer can invoke only typed allowlisted OSINT actions; no arbitrary URL, filesystem or shell entry point. |
| Web source safety | Any in-suite remote page uses isolated Electron web preferences, no node integration and denied permissions. |
| Evidence privacy | Cases, sessions and evidence stay in userData and cannot be staged by Git. |
| Reference truthfulness | A tool is labelled native, isolated or reference-only according to actual behavior. |
| Test contract | Registry, renderer, IPC and tests share one versioned data contract; obsolete native-access tests are not silently left broken. |
| Protected regression | Intro, AegisUi branding, HUB, ENG, map, Apple Music, Calendar, Timeline, Assistant and other workspaces remain untouched unless explicitly scoped. |

## Security / Git verification required before any OSINT implementation commit

- `git status` and targeted diff review.
- `git ls-files assistant/memory/private` returns nothing.
- `git ls-files assistant/chat` is reviewed; no private exports are staged.
- `.env` and `.env.local` remain unstaged.
- No credentials, captures, downloaded pages, evidence exports or browser data are added.
- New case/session/evidence directories are ignored before any runtime use.

## Phase 0 completion criteria

- [x] Clean Seagate worktree created from `feature/systems-online-pass`.
- [x] Baseline commit/version/branch/status and catalog statistics recorded.
- [x] Required release-health and regression commands executed.
- [x] Manual visible catalog and external-opening flow observed in isolated test runtime.
- [x] Current and dormant architectures distinguished without modifying runtime.
- [x] Protected-system regression surface documented.
