# STUD Command Center

STUD is a local-first academic workspace backed solely by the canonical SQLite database at `userData/stud/academic.sqlite`. It has no second database, JSON mirror, localStorage cache, provider query, Moodle connection, calendar mutation or mailbox access.

## Active screens

- **Overview** derives Today, Upcoming, Priority, Continue and Module Status from explicit canonical records only.
- **Modules** presents Course context with its linked assignments, resources, notes, papers, bounded Calendar/Email identifiers and field-level provenance.
- **Assignments** supports local filtering, search, due-date/modified ordering, explicit 0–100 local progress, deterministic/manual priority and detail editing.

Research, Notes, Revision, Tools, Progress and Services remain visibly deferred. They do not contain placeholder workflows or hidden network behavior.

## References and policy

Calendar and Email references are opt-in opaque identifiers. They are created and removed only through the local STUD service. STUD does not inspect, open, search, copy, synchronize or mutate either external system.

All navigation and FTS5 search are local and bounded. Provenance is observed per field; multiple values are shown as conflicting observations and are never resolved automatically.
