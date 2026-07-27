# OSINT Phase 2 Validation

## Automated coverage

`scripts/test-osint-tool-access-panel.js` verifies the in-memory state model,
the 50-event limit, clear behavior, policy separation and static runtime
boundaries. Existing workspace, registry, reference-only and legacy-boundary
tests remain part of the regression aggregator.

## Manual acceptance checks

1. Open OSINT and confirm the nine-domain catalog and featured cards render.
2. Hover a card: preview appears without selection or session-history write.
3. Select a normal provider: the panel becomes `SELECTED` and shows metadata.
4. Confirm `DETAIL` opens a modal; close via X, `Escape` and backdrop.
5. Confirm a normal approved provider offers only policy-approved actions.
6. Select the reference-only provider: only `READ REFERENCE` and `CLOSE` are
   actionable; no raw URL, open, copy, docs, install or integration control is
   displayed.
7. Invoke a blocked reference action programmatically in test coverage and
   confirm `POLICY_BLOCKED` occurs before external-link IPC.
8. Verify light, dark and system themes; compact layout; navigation away from
   OSINT and back; clean application close.

## Explicit non-goals

This historical Phase 2 record remains valid for its release. v2.3.5 adds one
typed Wayback Availability adapter; see `OSINT_PHASE3_VALIDATION.md`. It still
does not reconnect WebContentsView or legacy IPC, embed external browsers,
store accounts/sessions, create evidence objects or create investigation cases.
