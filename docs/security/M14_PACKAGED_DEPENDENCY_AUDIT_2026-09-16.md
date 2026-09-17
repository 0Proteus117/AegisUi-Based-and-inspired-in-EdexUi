# M14 packaged dependency audit — checkpoint, not security clearance

Runtime inspected: `14f3431482390ab5ded0f09703f35a184425a0b2`, app 2.7.1,
schema 27. Package identity is recorded in the
[M14 validation document](../product/stud/STUD_M14_EXTERNAL_STORAGE_PORTABLE_MODE_VALIDATION.md).
No user material, credentials or dependency tree from private data is included.

## Result and scope

`npm audit --omit=dev --json` on the clean runtime install reported **31 affected
package entries**: 26 moderate, 4 high, 1 critical. This counts npm package
entries, not 31 distinct exploit paths. Exit 1 is an advisory result, not a pass.
`package.json`, `package-lock.json`, `src/package.json` and
`src/package-lock.json` are identical to integration `89d49b2`.

All five high/critical entries below are physically present in the validation
ASAR. Presence, runtime reachability and exploitability are separate facts.
This bounded investigation prioritizes them; it is not a full review of the
remaining 26 moderate entries. No advisory was dismissed or suppressed. No
`npm audit fix`, lockfile rewrite or new runtime dependency was introduced.

## High/critical reachability

| Installed dependency | Observed path | Assessment / remaining risk |
| --- | --- | --- |
| `tar` 7.5.16 | `_boot.js:initGeoIP` → `geolite2-redist` 3.1.3 → `downloadDatabases` → `tar.x` in main process. Runs when the database is missing and offline mode is off; the provider also supplies an updater. | **Runtime reachable, not build-only.** Download URL is fixed to the upstream GeoLite redistribution mirror, not renderer-selected. The extraction filters to the database basename, but the call sets no archive/decompression resource bounds. A malformed/compromised upstream archive can reach the reported parse/DoS surface. M14 does not add this path; it remains a security-hardening item, not a false positive. |
| `pdfjs-dist` 6.0.227 | `docReader.class.js`, `studResearchWorkspace.class.js` use low-level `getDocument`/canvas/text; `studDocumentRuntime.class.js` extracts text. | **Runtime library reachable; the reported scripting chain was not found in these consumers.** No `PDFScriptingManager`, bundled web viewer or scripting-enabled AnnotationLayer is instantiated by these source paths. Existing `isEvalSupported:false` is not interchangeable with `enableScripting:false` and is not alone a valid dismissal. No malicious-PDF exploit regression was performed for this advisory. Keep affected-version advisory open. |
| `@tiptap/core` 3.30.0 | Declared directly and through starter-kit; package present. Source searches found catalog/editor naming but no production import/require of the package, Markdown attribute parser or `mergeAttributes`. | **No application call path identified in this bounded scan.** Names/CSS do not prove Tiptap execution. No exploitability or comprehensive non-reachability claim; actual future editor wiring must use a corrected version. |
| `nanoid` 3.3.13 | Direct declared dependency; no application import/call found in `src` outside package manifests/dependency code. | **No application call path identified.** The reported non-secure/custom generator size loops are not proven reachable from renderer/provider input. Package remains affected; not dismissed. |
| `brace-expansion` 5.0.6 | Lockfile chain `geolite2-redist` → `rimraf` → `glob` → `minimatch` → brace expansion. Inspected GeoLite cleanup invokes `rimraf` with `glob:false`. | **The inspected cleanup path does not expand caller patterns.** No application glob/brace-expansion call was found; other transitive usage has not been exhaustively proven absent. Not classified as a safe package merely because this one path disables globbing. |

## Advisory references and verification

- node-tar unrestricted parsing/decompression:
  [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw).
  The local audit also lists PAX path/type/NUL, replace-loop and recursion issues
  (GHSA-w8wr-v893-vjvp, GHSA-gvwx-54wh-qm9j, GHSA-8x88-c5mf-7j5w,
  GHSA-r292-9mhp-454m). Not every affected function is used by AegisUi.
- PDF.js scripting:
  [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j).
  The advisory specifically concerns enabled scripting and absent protective CSP;
  it identifies 6.2.108 as patched. This checkpoint does not update the package.
- Tiptap Markdown attribute parsing:
  [GHSA-j95f-988m-3j2f](https://github.com/advisories/GHSA-j95f-988m-3j2f),
  plus prototype/attribute issue GHSA-cp6q-959q-f8rh in the local audit.
- nanoid: GHSA-28wg-ghj8-5hjv and GHSA-2v37-7h3g-55p8 in the local audit.
- brace expansion: GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg and
  GHSA-rgw5-rvv9-x895 in the local audit.

The first three linked advisory pages were inspected on 2026-09-16. Other IDs
above are recorded from the npm audit response, not independently retested.

## Decision

Do not describe this package as dependency-security-clean. Passing CodeQL-targeted
repository tests, Electron isolation checks, byte-copy tests and release-health
does not erase dependency advisories. No public release is produced at this
checkpoint. A scoped follow-up must decide/update the reachable GeoIP archive
dependency and validate that integration without disguising the existing risk as
an M14-created failure. Avoid turning the storage milestone into an unreviewed
bulk dependency upgrade. The remaining advisory entries need explicit triage.

## Scoped remediation — 2026-09-17

The preceding sections describe the original `14f3431` image; they are retained
as evidence, not a description of the updated dependency tree. No advisory was
suppressed and no `npm audit fix` was used.

### Runtime and Electron

| Dependency | Selected correction | Verification / limitation |
| --- | --- | --- |
| GeoLite's `tar` | 7.5.16 → **7.5.22**, scoped override under `geolite2-redist` | Actual GeoLite-resolved ESM build extracts a valid synthetic database; rejects a bounded 4 MiB compressed expansion fixture using the default ratio guard. No production mirror request needed. |
| `pdfjs-dist` | 6.0.227 → **6.2.108** | Minimum patched release identified by the advisory. Existing real PDF text extraction and Research tests are rerun; this is not a malicious full-viewer exploit test. |
| Tiptap family | 3.30.0 → **3.30.6** | All coupled core/extension/PM peer versions remain aligned. `mergeAttributes` no longer inherits an attacker-supplied `onclick` via an own `__proto__` property. No new editor integration. |
| `nanoid` | 3.3.13 → **3.3.19** | Negative/zero non-secure and zero custom-generator inputs terminate; normal ID creation still works. No major-version/ESM migration. |
| `brace-expansion` | 5.0.6 → **5.0.12** | Explicit runtime override; normal expansion and bounded adversarial sequence/product/empty-brace cases pass. |
| Electron | 42.4.1 → **42.5.1** | Corrects [GHSA-r4w5-6pfg-jxp5](https://github.com/advisories/GHSA-r4w5-6pfg-jxp5). This also updates the actual build runtime, not merely the optional Electron entry in the application lockfile. Live isolation test verifies absent Node/raw IPC and working STUD/terminal. New packaged validation is required. |

The original 26 moderate entries consist of **25 Tiptap dependent entries**
whose audit `via` chain reaches the affected core, plus **one Electron entry**.
They are not 26 independent demonstrated attack paths. All are addressed by the
explicit corrections above. Aegis' inspected map protocol uses `protocol.handle`
with `Response`/`net.fetch`, not the older `ProtocolResponse.url` callback;
nevertheless the Electron binary is updated rather than dismissing its version.

Updating PDF.js also removes the old optional Electron installer peer subtree
from `src/package-lock.json`. This removal alone would not fix the packaged
Electron executable; the root manifest/lock and binary were updated separately.
Citation.js, node-pty, Calendar source, Moodle, SQLite schema and all application
runtime source remain unchanged in this remediation.

### Build-tool tree

A separate root audit found six affected package entries. These are tooling
dependencies, not additional STUD runtime modules. Their concrete consumers:

- `tar`: app-builder-lib / node-gyp archive handling.
- `brace-expansion`: minimatch in ASAR, universal packaging, directory comparison,
  glob and file lists. Patched within each existing 1.x/2.x/5.x range; no forced
  cross-major override in build tooling.
- `@xmldom/xmldom`: plist parsing in the package/native toolchain.
- `fast-uri`: AJV schema URI processing in the build toolchain.
- `js-yaml`: builder-util, app-builder-lib and dmg-builder configuration.
- `undici`: Electron download tooling and node-gyp HTTP client.

Only these six transitive names were updated within their existing declared
ranges. Resulting versions: tar 7.5.22; brace-expansion 1.1.21 / 2.1.7 / 5.0.12;
xmldom 0.8.15; fast-uri 3.1.8; js-yaml 4.3.2; undici 6.28.1 / 7.29.1.
No parent builder/rebuild major upgrade. Root lockfile version differences were
inspected independently of npm's peer-flag normalization.

### Reproducible checks and residual risk

`scripts/test-runtime-dependency-security.js` adds six checks to the established
regression runner. Adversarial cases use separate 128 MiB-heap child processes,
12-second deadlines and at most 4 MiB synthetic archives, never multi-gigabyte
bombs. It resolves runtime dependencies from `src`, not potentially different
root build-tool copies. The archive case uses the ESM build GeoLite resolves.

Fresh advisory responses on 2026-09-17:

- Root `npm audit --json`: **0 affected entries**, exit 0.
- Runtime `npm audit --omit=dev --json`: **0 affected entries**, exit 0.

These are advisory-database results, **not a claim of zero vulnerabilities**.
Tar's default decompression ratio guard is not an application-specific absolute
download-size/time limit or independent mirror authenticity guarantee. The
existing fixed GeoLite mirror/updater remains a supply-chain dependency. No
new generic networking or renderer archive API is introduced.

External evidence: `m14-build-npm-audit-remediated.json`,
`m14-runtime-npm-audit-remediated.json`, `m14-pdfjs-update-research.log`,
`m14-updated-electron-trust-live.log`, `m14-security-remediation-regression.log`.
The new image identity and final regression result belong in the M14 validation
document; the old DMG must not be relabelled as containing these corrections.
