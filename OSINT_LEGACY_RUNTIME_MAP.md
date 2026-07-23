# OSINT Legacy Runtime Map

The legacy native-access implementation is retained but intentionally disconnected in v2.3.4. It is documented here so a future Provider Runtime phase can reconcile it deliberately.

| Legacy component | Location | Current consumer | Compatibility with normalized registry | Action now | Future phase |
| --- | --- | --- | --- | --- | --- |
| Analyst deck controller | `src/classes/workspaces/osintAccess.class.js` | none from active workspace renderer | Expects old `getToolsForCategory` / embedded metadata | retain, do not reconnect | Provider Runtime |
| Isolated source view | `src/_boot.js` `WebContentsView` helpers | no active catalog card | Requires `getEmbeddedTool`, absent by design in normalized registry | retain security reference, do not alter | Provider Runtime |
| `osint-source-open` / layout / reload / close | `src/_boot.js` | legacy source controller only | No current normalized provider uses isolated mode | retain, no new IPC | Provider Runtime |
| `osint-native-query` | `src/_boot.js` | legacy native overlay only | No current normalized provider is an API adapter | retain, no new API work | Provider Runtime |
| Legacy native-access test | `scripts/test-osint-native-access-foundation.js` | regression suite | Updated to validate the normalized boundary and retained security surface | keep test | Provider Runtime |

## Explicit v2.3.4 boundaries

- `_boot.js` is unchanged.
- No new IPC is registered.
- No legacy IPC is reconnected.
- No `WebContentsView` is opened by the current OSINT catalog.
- No normalized provider claims API, local-tool or system-integration behavior.
- The functional `TOOL ACCESS` panel consumes only the normalized registry and
  central policy; it does not reconnect any legacy component.

The next phase may design a typed provider runtime only after selecting a specific capability, provider policy and adapter. It must not revive legacy behavior merely because the old code exists.
