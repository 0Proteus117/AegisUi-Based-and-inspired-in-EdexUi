# STUD Compute Security Boundary

The Engineering Compute renderer has no generic execution bridge. It cannot
choose an executable, pass shell strings, read arbitrary Aegis files, receive
Moodle/OAuth credentials, access the SQLite database or call a provider.

The main-process boundary accepts only `stud-compute-capabilities`,
`stud-compute-run`, `stud-compute-save-result` and `stud-compute-list`. Each
request is allowlisted, size-bounded and sender-validated by the existing STUD
IPC policy. Saving recomputes the request in main instead of trusting a
renderer-supplied result.

CSV/TSV reading is explicit and occurs in the current renderer File object.
Only bounded numeric column data crosses to the calculation runtime; no path,
directory listing or original file is retained. The capability has no
telemetry, background work, provider invocation, network path or hidden save.
