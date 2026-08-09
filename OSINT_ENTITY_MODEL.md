# Entity Model

An entity contains a local ID, type, preferred label, aliases, attributes,
status and LOW/MEDIUM/HIGH confidence. Every attribute includes its value,
canonical value, source type, source identifier, observed timestamp, confidence
and status. Entity state is ephemeral unless a selected normalized snapshot is
explicitly promoted through Case Evidence.

Exact canonical DOMAIN, EMAIL, IP, ASN, DOI, URL and IDENTIFIER values may
produce a review hint. Names and usernames are never auto-merged.
