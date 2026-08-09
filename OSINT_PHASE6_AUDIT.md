# OSINT Phase 6 — Pre-flight Audit

## Protected baseline

- Integration branch: `feature/systems-online-pass`
- Baseline release: `v2.5.0`
- Baseline commit: `69d917c` (merge OSINT Phase 5)
- Phase worktree: `codex/osint-phase6-visual-media`
- Active user checkout: intentionally untouched.

## Relevant existing ownership

| Concern | Current owner | Phase 6 decision |
| --- | --- | --- |
| OSINT catalog and workspace rendering | `src/classes/workspaceManager.class.js` | Add a bounded Visual / Media workspace mode only. |
| Capability taxonomy | `osintCapabilityRegistry.class.js` | Add a separate `VISUAL_MEDIA_VERIFICATION` capability. |
| Provider policy/runtime | registry, schema, policy and runtime classes | Add one local-only, non-network media-inspection provider. |
| Geo verification | `osintGeospatialVerification.class.js` | Reuse only through an explicit, provenance-labelled handoff. |
| Cases and evidence | Case model, services, storage and existing IPC | Reuse existing normalized-result and redaction-before-hash pipeline. |
| Theme and layout | OSINT workspace CSS/theme tokens | Reuse semantic Aegis surfaces; no global theme rewrite. |

## Pre-flight validation

- `scripts/release-health-check.js`: passed on `v2.5.0`.
- Existing OSINT, Cases/Evidence and Geospatial tests: passed in the baseline regression run.
- Inherited environment findings remain separate: TomTom HTTP 401 and an absent
  `AISSTREAM_API_KEY` in a clean worktree.

## Deliberate Phase 6 boundaries

- No `_boot.js` change and no legacy OSINT runtime reconnection.
- No automatic Map handoff or Map mutation.
- No generic file-analysis IPC, filesystem path transfer, directory scanning,
  clipboard monitoring, camera access, external upload or reverse-image search.
- Original media stays in the analyst-selected browser `File` object only and is
  never copied to Aegis userData by this phase.
