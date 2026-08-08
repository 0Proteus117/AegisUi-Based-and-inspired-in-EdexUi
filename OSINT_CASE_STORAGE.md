# OSINT Case Storage

Production storage is resolved only by the Electron main process at
`app.getPath("userData")/osint`. The renderer never receives or submits an
internal storage path. Tests inject a temporary root and delete it afterwards.

The local layout is:

```text
osint/
  index.json
  cases/<case-id>/case.json
  cases/<case-id>/evidence/<evidence-id>.json
  cases/<case-id>/timeline.json
  cases/<case-id>/notes.json
  exports/
  backups/
```

Opening OSINT or listing cases does not create this directory. `NEW CASE` is
the first operation that materialises it. Writes validate payloads, write a
private temporary file, fsync where supported, atomically rename, and remove a
temporary file after failure. A lightweight case-id lock serializes concurrent
writes to the same case.

The index contains summary-only case metadata and can be rebuilt from case
files. A corrupt index is retained in a bounded backup before reconstruction;
case directories are never deleted by recovery. Unknown schema versions are
rejected without destruction.

Current limits: title 160 characters, description 4,000, note 8,000, 12 tags
of 40 characters, evidence 64 KiB, 500 evidence objects/case, 1,000 timeline
events and 10 MiB exports.
