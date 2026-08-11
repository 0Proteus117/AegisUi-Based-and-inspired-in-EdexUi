# STUD Notes and Citations

## Structured notes

The Notes surface uses bundled Tiptap/ProseMirror with StarterKit, Link, Table
and Mathematics extensions. KaTeX renders editable inline and display math.
Supported bounded structures include headings, paragraphs, lists, emphasis,
HTTPS links, quotes, inline/code blocks, tables, math and citation markers.
There is no code execution.

Documents are stored as sanitized ProseMirror JSON version 1. Unknown nodes,
marks, attributes and dangerous HTML are discarded. Links are reduced to valid
public HTTPS values. A plain-text derivative supports local FTS without storing
arbitrary HTML. Notes may be explicitly related to a Course, Assignment and
canonical ResearchPaper.

## Citation pipeline

Bundled Citation.js converts canonical paper metadata to CSL JSON and BibTeX,
then renders local bibliographies. The reliable bundled style set for Phase 3
is APA, Harvard Cite Them Right and Vancouver. IEEE and Chicago are not exposed
because a verified local CSL resource was not bundled; no manual formatting
rules or fabricated metadata replace them.

Citation actions operate on canonical paper IDs. Missing DOI or bibliographic
fields remain visible rather than being invented. Copy actions write only the
explicitly requested bibliography, BibTeX or CSL JSON.
