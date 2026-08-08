# OSINT Evidence Integrity

Each Evidence Object receives a SHA-256 value over canonical JSON on the
trusted side. The hash excludes only the mutable `integrity` envelope itself;
all factual evidence metadata remains in scope. Its envelope includes
algorithm, value, creation time, verification time and `VALID`, `INVALID` or
`UNKNOWN` status.

Opening or listing individual evidence recomputes its hash without mass
verification or background work. `VERIFY INTEGRITY` writes a new verification
time. If data was altered, it is retained, shown as `INVALID`, and a case
timeline warning is added. It can still be exported with its invalid state and
the explicit technical-integrity disclaimer; AegisUi makes no legal chain of
custody or authenticity claim.
