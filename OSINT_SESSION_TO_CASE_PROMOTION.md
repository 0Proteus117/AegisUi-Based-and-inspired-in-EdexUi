# OSINT Session-to-Case Promotion

The Tool Access Session History remains volatile, in-memory and capped at 50
sanitized events. It never becomes case data automatically.

For a permitted normalized result with status `SUCCESS`, `EMPTY` or `PARTIAL`,
the operator can use `SAVE TO CASE`. AegisUi selects or creates a case when
necessary, presents a safe evidence preview, permits title/summary/tags/note
and selected redactions, then requires confirmation to write an Evidence
Object. No query is re-run, no snapshot opens and no remote content is fetched
as part of promotion.

`REFERENCE_ONLY`, cancelled, error and policy-blocked results never show an
operational promotion path.
