# OSINT Phase 7 Validation

## Runtime and layout validation

The initial Electron visual pass found one shared CSS inheritance issue before
release: `.workspace-panel-content` is absolutely positioned by the legacy
compact-panel rule. The new Domain Context panels were content-sized grid
surfaces, so their bodies initially collapsed under their headers. The fix is
structural: every Phase 7 panel explicitly returns its body to normal flow with
`position: relative`, `inset: auto` and content-sized grid rows. No
screenshot-specific offsets were added.

The visual harness renders only synthetic values and checked:

| Surface | 1680 × 1050 @2x | 1200 × 780 @1x |
| --- | --- | --- |
| Domain context / normal | 9 panels in bounds; no horizontal overflow | responsive grid; no horizontal overflow |
| IPv6 / network context | long IPv6 and prefix wrap safely | covered by compact flow |
| Partial provider state | empty/timeout records remain in their DNS panel | covered by compact flow |
| Evidence Preview / redaction | reusable case dialog remains readable and reachable | dialog uses established responsive shell |

Dark and Light were captured with the Aegis semantic appearance tokens. System
mode remains owned by the existing system-theme resolver; its current local
appearance was Light during this validation.

## Automated coverage

The Phase 7 suite covers public-domain/IP normalization, URL hostname
extraction, private/reserved input rejection, fixed DNS and network endpoints,
bounded record behavior, cancellation, normalized-only results, Evidence
redaction and integrity, no storage, no new IPC, no map mutation and no generic
proxy.

Known inherited environment warnings remain outside Phase 7: TomTom HTTP 401
and missing AISStream credentials.
