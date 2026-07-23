# OSINT Tool Access Panel

## Purpose

The `TOOL ACCESS` panel is the policy-aware interaction surface for the OSINT
catalog. It replaces implicit card launch behavior with an explicit sequence:

1. Hover previews a provider without changing selection or writing history.
2. Selecting a card makes it the active provider and exposes its normalized
   metadata.
3. `DETAIL` opens an accessible modal only on explicit user request.
4. A permitted action is evaluated by the central provider policy before any
   external browser request can reach the existing link bridge.

The implementation lives in
`src/classes/workspaces/osintToolAccessPanel.class.js` and is rendered from
`src/classes/workspaceManager.class.js`.

## Panel states

| Panel state | Meaning |
| --- | --- |
| `IDLE` | No active provider. The panel asks the operator to select one. |
| `SELECTED` | A normal provider is active; metadata and only permitted actions are shown. |
| `READY` | A permitted action has completed its local request path. |
| `LOADING` | Reserved for a future approved adapter; no provider adapter is active in v2.3.4. |
| `RESULT` | Reserved for a future approved adapter result. |
| `ERROR` | The last allowed action failed locally, without retaining its URL. |
| `OFFLINE` / `RATE_LIMITED` / `KEY_REQUIRED` | Reserved provider-runtime outcomes. |
| `REFERENCE_ONLY` | Informational entry; operational access is blocked by schema and policy. |

`QUERY` is displayed separately. It remains `IDLE` in this catalog-only phase;
the panel performs no query, scraping, crawling, background request or provider
API call.

## What the panel shows

For a normal entry it shows identity, category, tags, capabilities, provider
type, access mode, risk and legal context, expected inputs/outputs,
authentication/cost metadata, integration state, policy state, review date and
source confidence. It deliberately does not display a raw operational URL in
the session history or error display.

For a `REFERENCE_ONLY` entry it shows the reason for inclusion, legal context,
jurisdiction note and the required disclaimer. Its only visible actions are
`READ REFERENCE` and `CLOSE`.

## Session history

History is process-memory only. It is capped at 50 events, is cleared when the
application closes and is never written to localStorage, userData, IPC, a file
or the repository. A lightweight two-click confirmation clears the current
session while retaining the selected provider.

## Lifecycle and accessibility

Listeners are delegated to the OSINT workspace and disposed when the workspace
is left. Cards use keyboard-native buttons with listbox/option semantics,
selected state, visible focus, compact tooltips and responsive layouts. Detail
opens a modal dialog with focus transfer; `Escape`, close button and backdrop
close it, then focus returns to the invoking control.

## Boundaries

The panel does not register IPC, connect `WebContentsView`, revive
`osint-source-*` or `osint-native-query`, create an API adapter, persist a case
or collect credentials. Those capabilities remain outside this phase.
