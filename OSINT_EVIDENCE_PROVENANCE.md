# OSINT Evidence Provenance

Every provider-backed Evidence Object preserves neutral provenance metadata:
provider id/name, capability, acquisition method, query and capture timestamps,
safe source metadata, confidence, warnings, normalized runtime status, schema
version, legal context and risk context.

The sole active native provider remains the bounded Wayback Availability
adapter. A saved Wayback result may contain the normalized original input,
canonical URL, snapshot URL/timestamp, availability, provider name, status and
confidence. It never downloads a snapshot, captures webpage content or opens a
browser automatically.

`REFERENCE_ONLY` entries have no operational query and cannot be promoted to a
provider result. They may only be described through a user-authored neutral
note, manual observation or manual web-reference metadata.
