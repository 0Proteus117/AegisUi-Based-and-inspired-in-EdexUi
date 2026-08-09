# OSINT Infrastructure Evidence

**ADD TO CASE** uses the established Evidence Preview workflow. It persists
only reviewed normalized fields: target type, bounded DNS observations,
explicitly requested network/ASN context, provider provenance, status,
confidence and optional analyst observation.

Redaction happens before canonical local SHA-256 integrity hashing. Approved
redactions include the original input, normalized target, DNS data, network
context and provider provenance. Raw provider payloads, hidden request metadata
and credentials are never persisted.
