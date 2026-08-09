# OSINT research query model

Every operation is explicit, ephemeral and cancellable.

1. The analyst selects URL, DOI or local PDF.
2. The renderer normalizes and validates the one input locally.
3. DOI queries go only to Crossref; URL archive lookup happens only after
   **CHECK ARCHIVE**; PDF parsing happens in-process on selected bytes.
4. The result is normalized into source metadata and provenance.
5. **ADD TO CASE** opens the established Evidence Preview/redaction flow.

No polling, target history, background refresh, recursive link traversal,
cookie/session use or bulk input exists.
