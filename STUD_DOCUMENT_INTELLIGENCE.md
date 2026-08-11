# STUD Document Intelligence

## Scope

Document Intelligence is a local, explicit academic-document workflow. It is
not a paper-only system: `AcademicDocument` can describe course material,
technical standards, legal material, reports, theses, books, datasets or an
unknown document without forcing a disciplinary interpretation.

An analyst selects one PDF, then explicitly requests analysis. The local
workflow is: managed PDF -> PDF.js extraction -> normalized pages/chunks ->
optional explicit Note or Revision item. It never uploads a file, invokes a
provider, crawls a directory or persists the original path.

## Current engine

PDF.js is bundled with the existing renderer dependency set and is used only
from the main-process document boundary. It produces flat page text and bounded
text chunks. Pages, chunks and direct textual identifiers retain page-level
provenance. If heading/section semantics cannot be defensibly extracted, the
result is deliberately marked as flat/unstructured rather than invented.

The first implementation supports explicitly selected PDFs. Original bytes are
copied only into the established managed STUD document store, under a safe
content-derived reference; their SHA-256 is retained. No original absolute path
is written into SQLite, local storage, logs or releases.

## Academic integration

Documents can be explicitly related to Course, Assignment, ResearchPaper and Resource. The import form keeps every association opt-in.
Creating a Note from a chunk or a Revision item is an explicit save action. The
created record records `LOCAL_EXTRACTION`, the document ID, chunk ID, page range
and content hash. It does not auto-create citations, grade a document, or infer
authors, field of study, references, tables, figures, equations or claims.

## Limitations

- Image-only PDFs report `OCR_REQUIRED`; no OCR is fabricated.
- Structured sections, tables, figures, equations and footnotes are empty until
  a capable approved local engine can provide them.
- Direct DOI/URL/ISBN-like strings are observations, not validated citations.
- Analysis is bounded to 500 pages, 2 MiB normalized text and 40 KiB per page.

## Security and privacy

The Document runtime has no network, shell, environment or arbitrary-path
authority. It can only obtain bytes through the pre-existing managed-PDF reader.
There is no cloud fallback, telemetry, background parsing, directory scan,
provider chaining or hidden persistence. Temporary UI state remains ephemeral
until an explicit import/analyze/save action reaches the canonical SQLite store.
