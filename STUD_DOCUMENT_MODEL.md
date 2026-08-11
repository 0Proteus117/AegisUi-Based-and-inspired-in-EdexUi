# AcademicDocument model

`AcademicDocument` is a canonical STUD entity distinct from `ResearchPaper`.
`ResearchPaper` remains suitable for bibliographic/research metadata;
`AcademicDocument` represents a local academic source of any supported kind.

Required canonical data is deliberately small: title, document type, safe
managed reference, MIME type, byte size, original-byte SHA-256, extraction
status/engine and optional Course, Assignment and source ResearchPaper links. A Resource association is kept as an explicit normal relationship, avoiding a duplicate provider-specific field.

Every extraction is versioned. The normalized storage model separates:

- document extraction run;
- pages with text hashes;
- source-supported sections (none are fabricated by PDF.js);
- bounded text chunks with page ranges and content hashes;
- directly observed identifiers such as DOI, URL and ISBN-like strings.

Chunk search uses a dedicated local FTS5 index and returns document/chunk/page
provenance. The original file and raw parser objects are not put in the index or
the academic database.
