# STUD Phase 2 validation

## Structural scope

- `StudCommandCenter` owns the renderer-level Overview, Modules and Assignments presentation.
- `StudAcademicStore` schema v2 adds explicit Assignment priority and command-center derivations while retaining the Phase 1 SQLite model.
- `StudAcademicIpc` exposes only narrow, typed local endpoints for command-center data, Course context and opaque reference links.
- Dynamic academic panels use normal Grid/Flex document flow and responsive breakpoints rather than fixed visual tracks.

## Automated checks

`scripts/test-stud-command-center.js` validates schema v2, bounded local progress, deterministic priority, canonical Course relationships, Calendar/Email identifier-only links, renderer/network boundaries and Dark/Light layout ownership.

`scripts/test-stud-academic-core.js` remains the Phase 1 persistence/IPC/FTS security regression suite. `scripts/test-stud-workspace.js` verifies the workspace integration and deferred-module contract.

## Manual matrix

Validate synthetic local data in Dark, Light and System appearances at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x. Required states: empty store, multiple modules, assignment detail with unknown values, long local note/resource title, provenance conflict, opaque Calendar/Email references, and responsive dialog focus/close behavior.

No packaged application or DMG is required for this incremental renderer/domain UI release because no packaging, preload, native helper or startup path changes.
