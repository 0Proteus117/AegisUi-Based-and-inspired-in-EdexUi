# Electron trust-boundary hardening — 2026-08-24

## Scope and baseline

This intervention follows M1 at baseline `d2dd0933fb53628002f1bc9d418a16765b13dddc`.
It changes Electron authority boundaries without adding a STUD product capability
or starting M2. The CodeQL controls documented in
`CODEQL_SECURITY_HARDENING_2026-08-21.md` remain required.

Before this change the primary `BrowserWindow` used `nodeIntegration: true`,
`contextIsolation: false` and `@electron/remote`. A renderer compromise could
therefore reach Node, Electron and user files with the application's authority.
The renderer is now treated as untrusted for every privileged mutation even
though the page is local.

## Renderer Node dependency inventory

The baseline contained 12 production JavaScript files with direct Node/Electron
tokens. Package manifests also declared `@electron/remote`.

| Baseline file | Privilege used | Classification | Migration |
| --- | --- | --- | --- |
| `src/_renderer.js` | `fs`, `path`, `os`, `process`, dynamic `require`, Electron and remote | MIGRATE_TO_PRELOAD | Bootstrap, settings, themes, keyboards, window actions, shortcuts and system information now use typed bridge domains. |
| `src/classes/terminal.class.js` | renderer Electron/xterm and main node-pty/ws/process access in one dual-role file | NEEDS_SPECIAL_HANDLING | The current renderer uses `terminalClient.class.js`; the hardened server remains main only. The old client branch is no longer loaded. |
| `src/classes/assistant/assistantLocalChat.class.js` | filesystem, process, Ollama client and remote | MAIN_PROCESS_ONLY | Local chat and loopback Ollama execute in main; `assistantClient.class.js` is the renderer facade. |
| `src/classes/assistant/assistantMemoryBootstrap.class.js` | private-memory filesystem and remote | MAIN_PROCESS_ONLY | Main owns memory operations; renderer receives status and explicit actions only. |
| `src/classes/assistant/assistantChatSession.class.js` | chat filesystem/export and remote | MAIN_PROCESS_ONLY | Main owns persistence/export; renderer receives bounded structured results. |
| `src/classes/engineeringDashboard.class.js` | Electron IPC, environment/files and settings mutation | MIGRATE_TO_PRELOAD | Uses fixed service and main-owned map credential/config operations. |
| `src/classes/updateChecker.class.js` | HTTPS, Electron shell and remote | MAIN_PROCESS_ONLY | Fixed GitHub release check and approved release open operation run in main. |
| `src/classes/workspaceManager.class.js` | Electron IPC plus GearLab filesystem/spawn/open | MAIN_PROCESS_ONLY | Uses fixed IPC; GearLab exposes status/start/approved-open actions only. |
| `src/classes/audiofx.class.js` | path/dirname and CommonJS Howler | SAFE_RENDERER_REPLACEMENT | Browser Howler globals and packaged asset URLs are used. |
| `src/classes/locationGlobe.class.js` | path/dynamic require for local assets | SAFE_RENDERER_REPLACEMENT | Browser ENCOM and preload-supplied bounded grid data are used. |
| `src/_multithread.js` | Electron/systeminformation | MAIN_PROCESS_ONLY | Remains an Electron utility process with a strict operation allowlist. |
| `src/_boot.js` | application main-process authority | MAIN_PROCESS_ONLY | Remains main and now registers trusted IPC plus domain runtimes. |

The current page loads 82 scripts. Fourteen retain conditional CommonJS tokens
because they are also imported by Node test/runtime code (map and OSINT dual-target
modules plus browser vendor bundles). In the live renderer `require`, `process`
and `Buffer` are absent, so those branches are unreachable. No loaded current
renderer operation depends on them.

## Final BrowserWindow boundary

The primary window now uses:

```js
preload: path.join(__dirname, "preload.js")
nodeIntegration: false
nodeIntegrationInSubFrames: false
contextIsolation: true
webSecurity: true
webviewTag: false
nativeWindowOpen: false
allowRunningInsecureContent: false
sandbox: false
```

`sandbox` remains false because the preload uses Electron IPC, bounded hashing
and clipboard APIs and the packaged runtime includes native helpers. This is
residual hardening work, not renderer Node authority. The OSINT source
`WebContentsView` remains `sandbox: true`, isolated and navigation constrained.

## Preload API surface

`src/preload.js` exposes `window.aegis` through `contextBridge`. It does not expose
`ipcRenderer`, Electron, Node modules or mutable privileged objects.

- `runtime`: sanitized bootstrap, named theme/keyboard reads, validated settings,
  logs and approved settings/shortcut opens;
- `window` and `shortcuts`: enumerated actions/events;
- `terminal`: authenticated loopback bootstrap and fixed lifecycle operations;
- `clipboard`: bounded text only;
- `system`: allowlisted systeminformation calls;
- `network`: fixed external-IP provider and configured ping target only;
- `updates`: fixed GitHub repository contract;
- `gearlab`: status, fixed start and approved targets;
- `assistant`: main-owned bounded loopback chat, memory/session operations and
  approved folder opens;
- `crypto`: bounded SHA-256, random IDs and UTF-8 byte counts;
- `stud`: 127 exact STUD channels registered by name;
- `osint`: exact OSINT channels plus one source-view event subscription;
- `services`: exact existing application-domain channels.

There is no generic `invoke(channel, payload)` in the page bridge, no filesystem
domain, no shell/exec operation and no HTTP proxy. The compatibility
`rendererBridge.class.js` accepts only the represented fixed channels and returns
`IPC_NOT_EXPOSED` for any other name.

Main handlers use `ipcSecurity.class.js` to require the exact top-level local
`ui.html` sender. Query strings, fragments, credentials, subframes and other
origins fail closed. Subsystem validation remains authoritative after sender
validation: IDs, operation enums, bounds, lifecycle and provider contracts are
still checked in main.

## STUD, filesystem and network boundaries

All STUD persistence, Moodle, managed documents, Research/Citation.js, Context
Packages, local academic AI, Revision, Compute, Notebook/Data, Progress and M1
Requirements Contract operations cross explicit main-process APIs. STUD renderer
files cannot access SQLite, arbitrary paths, provider credentials or environment
variables.

No generic filesystem IPC handlers are registered or exposed. Existing file
selection/import remains owned by each narrow STUD or OSINT runtime and uses
managed references. Network authority stays in fixed main runtimes. Map
credentials are not returned to the renderer; TomTom tiles use a fixed custom
protocol and exact provider paths.

Packaged validation exposed one compatibility defect: a passive Moodle status
read called `safeStorage.isEncryptionAvailable()` and could block a mounted
ad-hoc build on macOS Keychain. Status now reports safeStorage API support without
touching Keychain. Actual credential reads/writes still check availability and
fail closed. Encrypted Moodle credential behaviour is otherwise unchanged.

## Terminal

The CodeQL controls remain: loopback-only WebSocket, 256-bit random token, exact
local renderer validation, timing-safe comparison, one client, 64 KiB input
bound, listener cleanup and unauthenticated rejection. The browser terminal gets
xterm libraries and its capability token through preload. node-pty, ws, process
inspection and native helpers remain main only. Development and mounted-DMG
validation both established an authenticated connected terminal.

## `@electron/remote`

Baseline: nine files/dependency records referenced `@electron/remote`.

Current: zero references and no package dependency. No compatibility shim remains.

## Validation

- Electron trust-boundary contract: 17 checks passed.
- CodeQL hardening contract: 7 checks passed.
- M1: 33 domain and 9 IPC checks passed.
- Moodle: 57 checks passed, including metadata-only status not touching Keychain.
- Academic Core, Documents, Research/Citation, Knowledge, local AI, Revision,
  Compute, Notebook, Progress, Tool Catalog, OSINT, ENG, Assistant, Calendar and
  node-pty focused suites passed.
- Live development: ten workspaces, fourteen STUD views and terminal passed with
  no renderer exception.
- Required Dark/Light/System and 1680x1050, 1440x900, 1200x780 M1 layout matrix
  passed without horizontal overflow or escaped controls.

Packaged validation used temporary artifact `AegisUi-2.7.0-arm64.dmg` (SHA-256
`b37b30698164e48878721058deb5a9809093c56fafe37975e705de051a83482e`).
It mounted read-only, its ad-hoc signature verified and it launched from the
mounted volume with an isolated synthetic profile. Calendar helper, Citation.js
and ARM64 node-pty assets were physically present. Live checks passed for the
trust contract, all workspaces/STUD views, M1, Moodle, Documents, Compute,
Citation rendering, Ollama loopback and terminal.

The broad aggregator passed 47 scripts after its theme single-store assertion was
updated for main-owned settings. The only aggregate failure remains inherited
Map environment state: TomTom HTTP 401 and absent `AISSTREAM_API_KEY`. Optional
SAT/Celestrak validation was reported skipped. No new failure remains.

## Residual risk and intentional debt

- `sandbox: false` remains for the primary preload.
- Browser-loaded dual-target sources retain unreachable CommonJS test branches.
- The legacy client branch in `terminal.class.js` remains source-compatible but
  is not loaded.
- The fixed STUD channel list is explicit but should eventually be generated
  from typed contracts to reduce maintenance drift; it is not generic IPC.
- Developer Tools remain an explicit local window action but do not restore Node,
  raw IPC or Electron authority.
- M2 has not started.
