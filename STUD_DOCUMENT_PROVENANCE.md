# Document provenance and persistence

Import records the original-byte SHA-256 and a safe managed reference, never an
absolute source path. Analysis records the local engine, timestamp, extraction
status and bounded normalized observations. Page and chunk hashes keep
page-level source traceability without claiming document authenticity.

The persistence boundary is explicit:

1. User selects one PDF.
2. User confirms import into the managed local STUD store.
3. User presses ANALYZE DOCUMENT.
4. User may explicitly create a Note or Revision item from a chunk.

There is no hidden parse history, automatic relation, cloud upload or raw
parser-response persistence. A missing OCR/advanced engine is a capability
state, not a degraded cloud mode.
