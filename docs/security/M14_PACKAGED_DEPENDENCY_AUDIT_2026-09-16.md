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
