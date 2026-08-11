# STUD PDF Workflow

PDF.js 6 is bundled locally and runs with PDF evaluation disabled. The viewer
provides explicit open, page navigation, bounded zoom, selectable extracted
text and local search. It never uploads a document or gives PDF content shell,
database or credential access.

## Local PDF

`SELECT LOCAL PDF` opens the native one-file picker. A valid `%PDF-` file no
larger than 40 MB is hashed and, only after that explicit action, copied into
private managed STUD storage. SQLite stores a relative managed reference,
display name, MIME type, size and SHA-256; it does not store bytes or the
original filesystem path.

## Open-access PDF

Unpaywall may identify a legal HTTPS PDF candidate. No download occurs during
metadata lookup. `OPEN OA PDF` performs a bounded ephemeral preview;
`EXPLICITLY SAVE OA PDF` downloads and stores the validated PDF. Both require a
short-lived token derived only from the approved Unpaywall result. Unexpected
content types, files above 40 MB, invalid signatures, timeouts and missing
references fail locally with typed states.

## Selection provenance

`CREATE NOTE FROM SELECTION` requires a real selection in the current PDF text
layer. The resulting quote remains visually distinct from student analysis and
records paper ID, source kind, managed/ephemeral document reference, page,
bounded excerpt, selection SHA-256 and timestamp. Page provenance refers to the
current PDF.js page and is never inferred when unavailable.

Image-only PDFs remain viewable, but text extraction is unavailable; STUD does
not claim OCR capability.
