# OSINT Case Overview

Case Overview is a Case-owned analytical inventory, not a new global workspace
or database. It derives its content from the loaded active Case, its Evidence,
Notes and Timeline, plus the current bounded ephemeral Entity graph.

It displays:

- Case status and derived counts;
- normalized investigation objects grouped as Entity, Domain, IP, Source,
  Document, Location, Media and Evidence;
- deterministic Available Actions for the selected object;
- unresolved states and recorded contradictions without resolving them;
- recent persistent Case activity; and
- provenance/integrity coverage.

Opening a related Evidence object uses the existing Evidence Detail surface.
Opening a compatible capability does not query a provider. Entity graph
coordinates and ephemeral navigation are never treated as Evidence.

At compact window sizes the command deck scrolls as one surface; object text,
metadata and actions remain in document/grid flow and wrap rather than overlap.
