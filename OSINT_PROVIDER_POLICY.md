# OSINT Provider Policy

## Central launch policy

`src/classes/workspaces/osintProviderPolicy.class.js` is the single decision point for catalog actions. The renderer calls the policy before it can invoke the existing external-link path.

| Decision | Policy function | Current scope |
| --- | --- | --- |
| External browser launch | `canLaunch(provider)` | Approved `WEB` provider with an approved URL and launch permission. |
| Clipboard URL copy | `canCopyUrl(provider)` | Only after launch policy passes and copy permission is true. |
| Installation | `canInstall(provider)` | No provider currently receives approval in this phase. |
| Configuration | `canConfigure(provider)` | Blocked in this catalog-only phase. |
| Integration | `canIntegrate(provider)` | No provider currently receives runtime integration. |

The policy returns `{allowed, code, message}`. It does not perform network activity, disk writes, provider execution, scraping, downloads or IPC registration.

## Launch requirements

An external launch requires an existing non-reference provider with `launchAllowed: true`, `accessMode: WEB`, a valid approved HTTP(S) `officialUrl`, and a status other than `DISABLED`, `UNSUPPORTED` or `REFERENCE_ONLY`.

The UI calls `launchOSINTProvider()` rather than calling `openLink()` directly for OSINT cards. A manipulated call still receives the policy rejection before the existing `workspace-open-link` IPC can be reached.

## Integration boundary

This policy does not activate an API adapter, create new IPC, connect the old isolated webview, create provider sessions or use credentials. These remain reserved for a future **Provider Runtime** phase, after an explicit provider policy and typed adapter have been reviewed.

## Badge language

The UI maps policy metadata to compact badges such as `EXTERNAL`, `REFERENCE`, `KEY`, `PAID`, `SENSITIVE`, `AUTH REQUIRED`, `CONTEXT DEPENDENT` and `POTENTIALLY ILLEGAL`. Badges express catalog context; they never grant actions.
