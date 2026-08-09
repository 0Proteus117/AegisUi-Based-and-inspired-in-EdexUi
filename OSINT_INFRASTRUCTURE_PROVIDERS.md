# OSINT Infrastructure Provider Decisions

| Provider | Status | Native scope | Reason |
| --- | --- | --- | --- |
| Google Public DNS JSON API | ACTIVE | One explicit domain; six fixed record types | Public documented fixed GET contract, no key, normalized bounded output. |
| RIPEstat Network Info | ACTIVE | One explicit public IP | Public documented fixed GET contract for containing prefix and announcing ASN context. |
| Authoritative RDAP | LINK ONLY | None | Correct authority selection requires bootstrap-driven routing. No dynamic target endpoint or raw registrant contact data is introduced. |
| Certificate Transparency | DEFERRED | None | No direct TLS probing, target socket connection or unbounded SAN expansion. |
| Shodan, Censys, SecurityTrails, VirusTotal, crt.sh | Existing LINK ONLY | None | No credentials, automation or provider-specific adapter added. |

The active adapters own their fixed endpoint, method and parameters. The
renderer cannot supply an endpoint, HTTP method, header or credential.
