# STUD Phase 8 validation

Validation uses synthetic fixtures only: engineering calculation notes,
humanities reading, legal/criminology material, social-science report and
course/lecture material. The fixtures prove that document type is explicit and
not inferred from prose.

Focused coverage verifies schema migration, explicit import, PDF.js normalized
extraction through a fake local PDF engine, cancellation, encrypted/no-text
states, no-network policy, page/chunk hashing, FTS provenance, Note/Revision
promotion, bounded 500-document index stress and optional-engine honesty.

Development visual checks cover the available compact desktop display in Dark
and Light using synthetic metadata. Responsive CSS has explicit desktop and
compact breakpoints at 1450px and 1230px; the focused workspace test verifies
that the shared theme and compact-layout contract remains loaded. Dynamic
document text is in normal grid flow and bounded scroll regions so it cannot
overlap the capability policy surface. A three-display physical HiDPI matrix
was not available in this environment and is not claimed as executed.
