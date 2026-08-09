# OSINT Phase 9 Validation

## Audit

Phase 9 starts from v2.5.5 with the typed Provider Runtime, existing
Cases/Evidence redaction and integrity pipeline, and disconnected legacy OSINT
runtime. No existing provider adapter, map behavior, legacy webview or IPC was
reconnected or changed.

## Structural checks

- Entity attributes preserve field-level provenance.
- Relationships without supporting evidence are rejected.
- Exact identifiers create review hints only; merge needs confirmation.
- Graph limits are 50 nodes / 100 edges.
- Entity Evidence uses the existing redaction-before-hash flow.
- Entity creation and handoff perform no provider query or hidden persistence.

## Visual validation

Synthetic entities only were used for normal and long-label graph/detail views,
an Evidence Preview and an explicit relationship snapshot. The graph and all
dynamic result panels use normal grid/document flow; layout invariants check
that panels do not intersect, controls stay inside their owning panel and no
panel crosses the viewport horizontally.

| Window | Scale | Appearance | Result |
| --- | --- | --- | --- |
| 1680×1050 | 2x | Dark | Normal entity graph, detail and relationship form readable with no panel collision. |
| 1680×1050 | 2x | Light | Normal entity graph/detail readable with theme tokens applied. |
| 1440×900 | 2x | Dark | Long synthetic labels and analyst note wrap inside normal flow. |
| 1200×780 | 1x | Light | Compact grid reflows; no horizontal clipping or control escape. |
| System → Dark / Light | system appearance | System | Existing appearance resolution is retained; the Entity workspace uses shared semantic Aegis tokens, not fixed dark fills. |

The release contains cropped, synthetic screenshots only; no local paths,
private case data, usernames, email addresses or live provider output appear.

## Packaged validation decision

No packaged build or DMG is required for Phase 9. The phase changes only
renderer-side OSINT models, workspace markup and CSS; it does not change
packaging, preload, native helpers, startup or runtime loading. Development
Electron validation and the focused/full regression suite are therefore the
appropriate validation path.
