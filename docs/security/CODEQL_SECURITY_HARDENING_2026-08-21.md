# CodeQL security hardening — 2026-08-21

## Scope and evidence

This audit covers all 18 alerts reported open for `feature/systems-online-pass` at baseline commit `1418cd3`. The supplied CodeQL export and the live GitHub Code Scanning API agreed on rule, severity, file and location for every alert. No alert was dismissed before source tracing and remediation. Post-fix dismissals are recorded below with reproducible scope and rationale.

Classification vocabulary follows the security-pass request. `NEEDS_REFACTOR` means the reported pattern did not provide a demonstrated exploit through the current escaped renderer, but violated a production trust-boundary invariant and was changed rather than dismissed.

## Alert ledger

| # | Severity / rule | Reported location | Classification | Reachability and exploitability | Resolution and residual risk |
|---:|---|---|---|---|---|
| 1 | High · `js/incomplete-sanitization` | `file-icons-generator.js:193` | `BUILD_TOOLING_ONLY` | Vendored directory-icon text was partially escaped, converted to a `RegExp`, interpolated into generated JavaScript and written to `file-icons-match.js`. Not loaded from renderer input; exploitable only through compromised build input followed by maintainer generation/execution. | Rules are now bounded `{source, flags, icon}` data serialized with `JSON.stringify`; strings use complete literal-regex escaping. |
| 2 | High · `js/incomplete-sanitization` | `file-icons-generator.js:197` | `BUILD_TOOLING_ONLY` | Same source/boundary/sink as #1 for scalar directory matches. | Same fix as #1. |
| 3 | High · `js/incomplete-sanitization` | `file-icons-generator.js:201` | `BUILD_TOOLING_ONLY` | Same source/boundary/sink as #1 for directory aliases. | Same fix as #1. |
| 4 | High · `js/incomplete-sanitization` | `file-icons-generator.js:212` | `BUILD_TOOLING_ONLY` | Same source/boundary/sink as #1 for array file matches. | Same fix as #1. |
| 5 | High · `js/incomplete-sanitization` | `file-icons-generator.js:216` | `BUILD_TOOLING_ONLY` | Same source/boundary/sink as #1 for scalar file matches. | Same fix as #1. |
| 6 | High · `js/incomplete-sanitization` | `file-icons-generator.js:220` | `BUILD_TOOLING_ONLY` | Same source/boundary/sink as #1 for file aliases. | Same fix as #1. Generated matcher parity was verified over all 695 tracked repository paths. |
| 7 | Critical · `js/code-injection` | `src/classes/terminal.class.js:472` | `TRUE_POSITIVE` | Source was any WebSocket client able to reach the configured terminal port; input crossed directly into `node-pty.write`, an intentional shell-input sink. The server was not loopback-bound, had no capability authentication, and used `clients.length` although `ws` exposes a `Set`. A malicious page or local process could race the UI and submit commands. | Server is loopback-only, each terminal has a 256-bit random capability token delivered only through verified local main-frame IPC, WebSocket path/query are exact, comparison is timing-safe, one-client enforcement uses `Set.size`, payload is bounded to 64 KiB, and listeners are cleaned up. Authorized shell metacharacters remain intact because command entry is the terminal's purpose. A compromised trusted renderer remains equivalent to existing renderer/Node privilege and is not represented as a new security boundary. |
| 8 | High · `js/incomplete-multi-character-sanitization` | `src/classes/workspaces/osintCaseModel.class.js:62` | `NEEDS_REFACTOR` | Case/provider/user text crossed into canonical Case/Evidence JSON. Repeated tag-shaped regex removal can reassemble dangerous-looking markup from nested input. Current UI paths escape output, so no direct executable sink was demonstrated, but the canonical plain-text boundary was not robust. | Regex tag removal was replaced by a deterministic single-pass markup state machine; executable-scheme rejection remains. Canonical/UI escaping remains mandatory. |
| 9 | High · `js/incomplete-url-substring-sanitization` | `scripts/test-osint-entity-resolution.js:25` | `TEST_ONLY` | The source and sink were an in-memory synthetic alias assertion using `includes("example.org")`; no URL was accepted, sanitized, opened or requested. | Assertion now uses exact alias equality. No runtime residual risk. |
| 10 | Medium · `js/bad-code-sanitization` | `scripts/validate-osint-investigation-orchestration-live.js:102` | `TEST_ONLY` | A CLI-selected synthetic visual scenario was embedded in a DevTools `Runtime.evaluate` expression. It cannot run in production, but a malicious local invocation could alter validation code. | Scenario is now an explicit fixed allowlist before any evaluation. |
| 11 | Medium · `js/bad-code-sanitization` | `scripts/validate-osint-phase11-live.js:154` | `TEST_ONLY` | Same test-only DevTools boundary as #10. | Scenario is now an explicit fixed allowlist. |
| 12 | Medium · `js/bad-code-sanitization` | `scripts/validate-stud-phase2-live.js:52` | `TEST_ONLY` | Synthetic Course ID returned by a debug renderer was inserted into another DevTools expression. The validator is not packaged/runtime reachable, but a compromised debug target could alter the returned value. | Returned fixture IDs now pass a strict anchored STUD-ID allowlist before interpolation. |
| 13 | Medium · `js/bad-code-sanitization` | `scripts/validate-stud-phase2-live.js:53` | `TEST_ONLY` | Same boundary as #12 for Assignment selection. | Same fix as #12. |
| 14 | Medium · `js/bad-code-sanitization` | `scripts/validate-stud-phase2-live.js:54` | `TEST_ONLY` | Same boundary as #12 for provenance selection. | Same fix as #12; scenario itself is also allowlisted. |
| 15 | Medium · `js/bad-code-sanitization` | `scripts/validate-stud-phase3-live.js:59` | `TEST_ONLY` | Synthetic scenario/fixture identifiers were used to construct DevTools validation expressions. No production path exists. | Scenario and returned identifiers now use fixed/anchored allowlists. |
| 16 | High · `js/double-escaping` | `src/classes/workspaces/studLmsModel.class.js:126` | `NEEDS_REFACTOR` | Moodle provider HTML crossed the provider boundary into canonical STUD display fields. Chained replacements could decode `&amp;lt;` twice into `<`. Renderer output was already escaped, so direct code execution was not reproduced, but normalization was context-fragile. | Markup removal is a single-pass state machine and supported entities are decoded in one non-recursive replacement pass. Encoded delimiters in Moodle reference/file URLs, including nested percent encoding, now fail closed. |
| 17 | High · `js/incomplete-url-substring-sanitization` | `scripts/test-stud-notebook-workbench.js:62` | `TEST_ONLY` | A test read a trusted source file and asserted that it contained the fixed GitHub API string. It did not validate or forward a URL. | Source assertion now matches the exact constant declaration. Runtime endpoint construction remains fixed and separately tested. |
| 18 | Medium · `js/bad-code-sanitization` | `scripts/validate-stud-v270-live.js:58` | `TEST_ONLY` | CLI visual mode was embedded in renderer-only DevTools evaluation. The script is not packaged and uses synthetic data, but its input was unnecessarily broad. | Mode is now constrained to the fixed validation-mode allowlist. |

## Trust-boundary traces

### Terminal

`terminal UI keystroke → authenticated loopback WebSocket → bounded UTF-8 frame → node-pty.write`

The last transition is deliberately executable: AegisUi exposes an engineering terminal. Security is enforced by authenticating the caller and binding transport scope, not by deleting shell syntax from user commands. Quotes, semicolons, command substitution, newlines, backticks, pipes, redirects, Unicode and paths containing spaces are preserved after authorization. Remote addresses, invalid/duplicate tokens, additional query parameters, subframes and oversized/non-text frames are rejected.

### Moodle normalization and URLs

`fixed Moodle adapter response → bounded HTML-to-text normalization → canonical STUD observation → escaped renderer output`

Entity decoding is non-recursive. URL acceptance uses `URL`, exact HTTPS origin, no credentials, restricted query keys and rejection of encoded `/`, `\\`, `:`, or `@`, including double-encoded variants. Moodle SSO, encrypted credential persistence, managed files and incremental synchronization are otherwise unchanged.

### OSINT Case/Evidence text

`typed Case/provider payload → object/schema bounds → single-pass plain-text normalization → canonical JSON/SHA-256 → escaped renderer output`

This preserves existing Evidence redaction/integrity behavior and does not reconnect legacy OSINT runtime or expand IPC/network authority.

### File-icon build generator

`pinned git submodule configuration → parsed RegExp/text rule → JSON-serialized data → generated matcher`

No vendored icon value is interpolated into executable source. Generation was reproduced after initializing the pinned submodules; the new matcher returned identical results to the baseline matcher for all 695 tracked repository paths.

## Tests added or strengthened

- `scripts/test-codeql-security-hardening.js`
  - trusted renderer/main-frame verification;
  - loopback/token/single-client WebSocket policy;
  - adversarial terminal input preservation and bounds;
  - single-pass Moodle entity normalization;
  - mixed-case, encoded and double-encoded URL delimiter rejection;
  - nested OSINT markup handling;
  - data-only generated file-icon matcher.
- Existing Moodle, OSINT Cases/Evidence, Entity Resolution and STUD Notebook tests cover preserved behavior.
- Live validation scripts now reject unknown scenarios/modes and untrusted fixture identifiers before DevTools evaluation.

## Validation and residual risk

Local CodeQL CLI was not installed, so no local CodeQL database was fabricated. The authoritative GitHub workflow and alert API supplied post-push static-analysis evidence. Runtime residual risk is limited to the already-trusted renderer having terminal authority, which is inherent in the existing Node-enabled terminal architecture. A future renderer sandbox migration could reduce that broader legacy trust, but it is outside this focused pass.

Development Electron 42.4.1 was launched from this worktree with the ARM64 runtime and current `node-pty`. The authenticated frontend reached `Connected to frontend`, while a separate unauthenticated connection to `ws://127.0.0.1:3000/` was rejected with HTTP 401.

No packaging, preload, Calendar helper, node-pty binary, SSO protocol, credential vault or startup path changed. A DMG is therefore not required for this pass.

## Post-fix GitHub CodeQL result

GitHub CodeQL run `32465777388` analyzed commit `3251176` successfully. It closed 14 of the 18 original alerts through code changes. The four original alerts still reported were DevTools visual validators (#10, #11, #15 and #18); each was dismissed as `used in tests` only after its scenario/identifier allowlist was added and its non-packaged scope was verified.

CodeQL reissued the intentional `node-pty.write` sink as new alert #19 after the unauthenticated transport path had been removed. Alert #19 was dismissed as `false positive` because an interactive terminal must deliver authorized shell text unchanged. The dismissal cites the exact loopback, renderer, capability-token, timing-safe, single-client and payload-bound controls plus the live HTTP 401 rejection test. This dismissal does not claim that arbitrary renderer input is safe outside that authenticated terminal capability.

Open alerts on `feature/systems-online-pass` after the successful scan and documented dismissals: **0**.
