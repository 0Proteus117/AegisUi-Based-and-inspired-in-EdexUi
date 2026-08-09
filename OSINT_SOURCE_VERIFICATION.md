# OSINT Research / Documents / Source Verification

`SOURCE_VERIFICATION` is a passive OSINT capability for one explicit source at
a time. It answers contextual questions about provenance and metadata; it does
not establish that a claim is true or that a document is authentic.

## Inputs

- One public HTTP(S) URL, normalized locally. No page crawler or arbitrary URL
  metadata fetch is available.
- One DOI, resolved only through the approved fixed Crossref Works endpoint.
- One explicitly selected PDF up to 25 MB, inspected locally.

## Output

The workspace distinguishes normalized source fields, local document metadata,
provider observations, archive observations, field provenance and an analyst
note. Missing values remain `NOT AVAILABLE`; no values are inferred.

The original PDF is not persisted. Only redaction-reviewed normalized evidence
can be promoted into an existing Case.
