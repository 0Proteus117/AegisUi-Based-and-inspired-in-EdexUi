# OSINT Provider Policy

## Central launch policy

`src/classes/workspaces/osintProviderPolicy.class.js` is the single decision point for catalog actions. The renderer calls the policy before it can invoke the existing external-link path.

| Decision | Policy function | Current scope |
| --- | --- | --- |
| External browser launch | `canLaunch(provider)` | Approved `WEB` provider with an approved URL and launch permission. |
| Clipboard URL copy | `canCopyUrl(provider)` | Only after launch policy passes and copy permission is true. |
| Documentation view | `canViewDocs(provider)` | Approved documentation URL only; no reference entry can expose one. |
| Reference reading | `canReadReference(provider)` | Informational reference detail only; it never provides an operational route. |
| Installation | `canInstall(provider)` | No provider currently receives approval in this phase. |
| Configuration | `canConfigure(provider)` | Blocked in this catalog-only phase. |
| Native query | `canQuery(provider)` | Approved active API provider with an explicit runtime adapter. |
| Integration | `canIntegrate(provider)` | Explicit provider-runtime approval only. |

The policy returns `{allowed, code, message}`. It does not perform network activity, disk writes, provider execution, scraping, downloads or IPC registration.

The Phase 2 `TOOL ACCESS` panel calls these decisions for every action. A
normal provider may expose `DETAIL`, `OPEN`, `COPY URL` or `DOCS` only when the
specific decision permits it. A `REFERENCE_ONLY` provider exposes only `READ
REFERENCE` and `CLOSE`; a manipulated launch, copy or docs call still returns
`POLICY_BLOCKED` before the external-link bridge.

## Launch requirements

An external launch requires an existing non-reference provider with `launchAllowed: true`, `accessMode: WEB`, a valid approved HTTP(S) `officialUrl`, and a status other than `DISABLED`, `UNSUPPORTED` or `REFERENCE_ONLY`.

The UI calls `launchOSINTProvider()` rather than calling `openLink()` directly for OSINT cards. A manipulated call still receives the policy rejection before the existing `workspace-open-link` IPC can be reached.

## Runtime boundary

The only Phase 3 query permission is the user-initiated, fixed-endpoint Wayback
Availability adapter. It does not create IPC, connect the old isolated webview,
create provider accounts or use credentials. Every other catalog provider
remains external, local stub, system stub or reference-only until separately
reviewed.

## Badge language

The UI maps policy metadata to compact badges such as `EXTERNAL`, `REFERENCE`, `KEY`, `PAID`, `SENSITIVE`, `AUTH REQUIRED`, `CONTEXT DEPENDENT` and `POTENTIALLY ILLEGAL`. Badges express catalog context; they never grant actions.
