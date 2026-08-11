# STUD Phase 3 Validation

## Automated coverage

- Phase 1 academic core and typed IPC regression.
- Phase 2 Student Command Center regression.
- Phase 3 provider normalization, fixed endpoints, configuration, typed failure
  states, canonical deduplication, provenance and security boundaries.
- Structured-note sanitization, PDF-selection provenance and local citations.
- Real PDF.js parsing/text extraction from a deterministic synthetic PDF.
- Explicit managed PDF copy, checksum, path traversal and invalid-file rejection.
- Native selector-to-managed-store contract, including rejection of transient
  dialog state at the persistent schema boundary.
- Zotero fixed loopback/read-only policy.
- Synthetic scale: 5,000 papers, 5,000 notes and bounded FTS/library queries.

## Live renderer matrix

Validated with synthetic records at 1680×1050 @2x, 1440×900 @2x and
1200×780 @1x. Research Search, Library, Paper Detail/OA, Notes, Assignment
Research, Citations, Services and compact layout were checked for escaped
controls and horizontal overflow in Dark and Light. System appearance uses the
same semantic token resolver and is covered by the established theme suite.

The live pass found and corrected three implementation defects before release:
the Tiptap CommonJS modules needed direct renderer `require`, and structured
note JSON required script-safe JSON rather than HTML entity escaping. The final
editor uses Tiptap, not its fallback, and renders persisted text and KaTeX. The
native PDF flow also exposed a transient `cancelled` flag crossing into strict
persistent metadata; the IPC boundary now removes that control field before the
managed document is linked. The full selector → managed copy → paper link →
PDF.js viewer path was then repeated successfully in the running Electron app.

Focused validation finished with 67 passing checks across Academic Core,
Command Center, Workspace and Research/Writing, plus the 5,000-paper /
5,000-note scale test. Crossref and DataCite fixed-endpoint smoke tests returned
normalized public metadata; OpenAlex and Unpaywall correctly reported
configuration-required without exposing or persisting credentials.

## Privacy and regression

All fixtures are synthetic. No real papers, notes, grades, emails, local paths
or credentials are used in release images. The broad suite preserves all Aegis
workspaces, OSINT, Calendar/Email references, Assistant, Map and isolated
GearLab. TomTom HTTP 401 and absent `AISSTREAM_API_KEY` are inherited
environment warnings, not Phase 3 regressions.

No DMG is required: Phase 3 changes incremental STUD model/runtime/renderer UI
and uses existing Electron IPC/package paths; it adds no helper, preload,
startup, entitlement or packaging path.
