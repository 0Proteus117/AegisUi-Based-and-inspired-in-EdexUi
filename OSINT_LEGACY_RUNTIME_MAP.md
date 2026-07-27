# OSINT Legacy Runtime Map

The legacy native-access implementation is retained but intentionally
disconnected in v2.3.5. Phase 3 adds a separate typed provider runtime for one
fixed Wayback Availability endpoint; it does not reconnect the legacy path.

| Legacy component | Location | Current consumer | Compatibility with normalized registry | Action now | Future phase |
| --- | --- | --- | --- | --- | --- |
| Analyst deck controller | `src/classes/workspaces/osintAccess.class.js` | none from active workspace renderer | Expects old `getToolsForCategory` / embedded metadata | retain, do not reconnect | Legacy cleanup review |
| Isolated source view | `src/_boot.js` `WebContentsView` helpers | no active catalog card | Requires `getEmbeddedTool`, absent by design in normalized registry | retain security reference, do not alter | Legacy cleanup review |
| `osint-source-open` / layout / reload / close | `src/_boot.js` | legacy source controller only | No current normalized provider uses isolated mode | retain, no new IPC | Provider Runtime |
| `osint-native-query` | `src/_boot.js` | legacy native overlay only | Modern Wayback uses `ProviderRuntime`/`WaybackAdapter`, never this IPC | retain, no new IPC | Legacy cleanup review |
| Legacy native-access test | `scripts/test-osint-native-access-foundation.js` | regression suite | Validates legacy boundary while `test-osint-provider-runtime.js` validates the modern adapter | keep test | Provider Runtime expansion |

## Explicit v2.3.5 boundaries

- `_boot.js` is unchanged.
- No new IPC is registered.
- No legacy IPC is reconnected.
- No `WebContentsView` is opened by the current OSINT catalog.
- Only the normalized `wayback` provider claims the approved API query path.
- Local-tool and system-integration adapters remain blocked stubs.
- The functional `TOOL ACCESS` panel consumes only the normalized registry,
  policy and typed runtime; it does not reconnect any legacy component.

Future providers must use the same typed policy/factory/context/result contract.
They must not revive legacy behavior merely because old code exists.
