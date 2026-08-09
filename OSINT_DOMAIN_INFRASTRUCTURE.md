# OSINT Domain & Infrastructure Context

Phase 7 adds a passive analyst view for one explicitly entered public domain,
public IPv4, public IPv6, or HTTP(S) URL hostname.

It normalizes input locally, displays original and normalized targets, and
separates provider observations from analyst assessment. It is not a port
scanner, vulnerability check, crawler, subdomain enumerator, DNS zone-transfer
tool or batch lookup feature.

Domain queries use the bounded `A`, `AAAA`, `MX`, `NS`, `TXT` and `CNAME`
record set. Network/ASN context for a DNS-observed address requires an explicit
second analyst selection; it never fan-outs automatically.

Registration and certificate context are intentionally unavailable natively in
this release. They are not inferred from DNS or network context.
