# STUD Phase 9 validation

## Audit and architecture

Phase 9 reuses the SQLite canonical entities, field provenance,
`stud_relationships`, FTS5 and the explicit PDF.js Document Intelligence
pipeline. It adds migration 10 only: local concepts, concept observations,
explicit context decisions and inspectable Context Package snapshots. No
second database, localStorage mirror, provider adapter or assistant connector
was added.

## Focused checks

`scripts/test-stud-academic-intelligence.js` uses synthetic public-safe data
and verifies schema migration, explainable direct/derived/suggested context,
term provenance, Assignment Coverage, note source-support semantics, user
decision precedence, bounded context search, packages, no-network/runtime
boundary, graph bounds, typed IPC and a 50-Course / 500-Assignment /
500-Document / 20,000-concept-observation fixture.

Existing Document Intelligence, Engineering Compute and Academic Orchestration
tests are rerun as regressions. The documented inherited Map credentials and
isolated-worktree dependency availability remain reported separately.

## Visual contract

The Knowledge view uses normal CSS Grid flow. Dynamic candidate reasons,
concepts and graph labels wrap within their panels; the graph node list and
document chunk inclusion remain bounded scroll regions. CSS reduces the
two-column context grid and import controls to one column below 1230px.

Development Electron validation used synthetic content only and passed the
layout invariants at 1680x1050 @2x (Dark), 1440x900 @2x (Light), 1440x900
@2x (System resolving Dark), and 1200x780 @1x (compact Dark). The checks
asserted that the Knowledge workspace, graph and coverage regions existed,
that no interactive control escaped its containing panel, that no panel
overlapped another panel and that the workspace had no horizontal overflow.
The corresponding sanitized screenshots are attached to the v2.6.9 GitHub
Release and embedded inline in its release body; they are not canonical source
assets and are therefore not stored in the repository.

## Intentional limitations

- Term extraction is deterministic, not semantic/AI understanding.
- Suggested relevance never creates a canonical relationship.
- Source support is local-only and cannot establish truth or correctness.
- Context Packages are preparation artifacts only; no LLM or provider consumes
  them in Phase 9.
