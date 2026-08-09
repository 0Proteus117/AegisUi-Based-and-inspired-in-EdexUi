# OSINT Media Security

Phase 6 is deliberately passive and fail-closed.

- The renderer receives only an explicit browser `File` object's bytes.
- There is no generic file-system IPC, path history, directory scan, clipboard
  watcher, camera access or background ingestion.
- The parser performs no network call, upload, shell invocation or local-binary
  execution.
- There is no facial recognition, biometric matching, person search, account
  discovery or OCR-driven tracking.
- Observations stay ephemeral until the analyst explicitly promotes a redacted
  normalized record through the existing Evidence pipeline.

Avoid logging local media paths, coordinates, camera identifiers, raw metadata
or analyst notes. Release validation uses synthetic fixtures only.
