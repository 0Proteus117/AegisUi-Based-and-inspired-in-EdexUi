# OSINT Phase 10 validation

## Structural checks

- `scripts/test-osint-investigation-orchestration.js` validates bounded context,
  object-index derivation, Source/Domain/Media/Entity/Evidence handoffs,
  provenance retention, invalid-handoff rejection and absence of network, IPC
  and storage APIs in the orchestration module.
- Existing Provider Runtime, Case/Evidence, Geo, Media, Domain, Source and
  Entity tests remain the functional contract for the owned subsystems.

## Visual contract

Case Overview uses normal CSS Grid/document flow. It was exercised with
synthetic Case data at 1680×1050, 1440×900 and 1200×780, in Dark, Light and
System appearances. The compact layout changes column count only; it does not
position dynamic metadata or action rows absolutely.

## Security contract

No provider is invoked when a handoff is made. No raw payload, local path,
cookie, credential, hidden session history or Case persistence is produced.
Existing Evidence Preview/redaction/SHA-256 persistence remains mandatory.

## Completed validation run

The Phase 10 focused suite, Case/Evidence suite, Provider Runtime suite,
Geo/Media/Domain/Source/Entity suites, theme integrity and release-health check
all passed. The broad regression run also passed every owned check, including
the new orchestration contract. It retains three inherited environment warnings:
TomTom flow segment HTTP 401, TomTom flow tile HTTP 401 and a missing
`AISSTREAM_API_KEY`. Those map-provider credentials were not changed by Phase
10 and are reported separately from implementation regressions.

Live Electron validation used only synthetic Case data at 1680×1050 @2x,
1440×900 @2x and 1200×780 @1x. It verified Dark, Light and System appearance,
the selected Available Actions strip, a Source → Domain prefill with zero
provider calls, Source → Entity prefill with provenance, and the existing
Evidence Preview/redaction dialog. The generated release captures crop to the
OSINT workspace/dialog so no terminal, local username, filesystem path or Case
data is published.

`npm` was not available in the isolated worktree runtime, so `npm run lint`
and `npm test` were intentionally not executed; Node-based project checks were
run directly instead. No DMG was generated because this is a renderer/model/UI
increment with no packaging, preload, native-helper or startup-path change.
