# STUD Research Architecture

## Current implementation

STUD Research extends the existing canonical academic store; it does not own a
second database. Online results remain ephemeral runtime tokens until the user
presses `SAVE TO LOCAL LIBRARY`. The selected normalized record is then
deduplicated by strong identifiers, stored as a `RESEARCH_PAPER`, indexed by
FTS5 and linked explicitly to a Course or Assignment.

The renderer owns presentation only. Narrow, allowlisted STUD IPC handlers own
provider calls, local file selection, managed document reads and academic-store
operations. No renderer-supplied endpoint, HTTP method or header is accepted.

## Flow

1. Explicit search or DOI resolution.
2. Typed provider adapter and bounded normalized result.
3. Ephemeral result review.
4. Explicit canonical save and optional Course/Assignment relation.
5. Optional explicit OA lookup or PDF selection.
6. Local reading, structured note and standards-based citation.

Provider errors never invalidate the offline Library, PDFs, Notes, citations or
FTS. Cancellation uses one bounded `AbortController` per explicit request and
latest-request identifiers prevent stale UI replacement.

## Ownership and persistence

- SQLite stores canonical selected metadata, provenance and relationships.
- Provider payloads and search history are not stored.
- Managed PDFs live under `userData/stud/documents`, never inside SQLite.
- Structured notes store sanitized ProseMirror JSON v1 plus bounded plain text.
- Zotero remains the owner of Zotero data; STUD stores only explicitly imported
  canonical metadata and the selected Zotero item key.

## Pre-flight audit result

Phase 3 reused the Phase 1/2 academic model, store, FTS and typed IPC boundary.
It borrowed only fixed-endpoint/cancellation lessons from OSINT; it does not
couple STUD objects to OSINT Cases or reconnect any legacy runtime.
