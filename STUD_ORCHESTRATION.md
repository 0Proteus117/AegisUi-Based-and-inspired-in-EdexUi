# STUD Academic Orchestration

Phase 5 coordinates local STUD context around canonical `COURSE` and `ASSIGNMENT` objects. It is not an automation engine.

## Matching

Matching is deterministic and local. A stable external identifier is `EXACT`. An exact module code plus normalized assignment number/title and exact instant is `STRONG`. Lesser compatible signals are `SUGGESTED`; title-only input is not authoritative. `UNRESOLVED` candidates cannot be linked.

Candidates are ephemeral. Only an explicit confirmation creates a local relation and its bounded provenance record.

## External boundaries

Moodle remains read-only. Calendar and Email are never modified. Calendar references are explicitly selected and Email references are bounded identifiers plus an analyst-provided safe summary; STUD does not scan mailboxes or persist full message bodies.

## Offline behavior

Confirmed references, links, field observations and conflicts remain available in the local SQLite store. Offline mode makes no provider attempt.
