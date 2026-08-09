# OSINT Phase 7 — Pre-implementation audit

## Baseline

- Branch: `codex/osint-phase7-domain-infrastructure`
- Base: `3b1f862` (`merge OSINT media preview hotfix`)
- Released baseline: `v2.5.2`
- Worktree: isolated Seagate worktree; the active user checkout is not used.

## Existing architecture

| Concern | Current owner | Phase 7 decision |
| --- | --- | --- |
| Provider registry/schema | `osintTools.registry.js`, `osintProviderSchema.class.js` | Extend with two fixed, passive adapters only. |
| Provider runtime/policy | `osintProviderRuntime.class.js`, `osintProviderPolicy.class.js` | Reuse its typed, cancellable, fail-closed lifecycle. |
| Native adapters | `osintProviderAdapters.class.js` | Add provider-specific DNS and IP-network adapters; no generic client. |
| Cases/Evidence | OSINT case/evidence model and preview | Reuse the existing preview, redaction and integrity pipeline. |
| Geospatial / media | Dedicated Phase 5/6 modules | Preserve unchanged. No map mutation. |
| Legacy runtime | legacy WebContentsView, `osint-source-*`, `osint-native-query` | Remain disconnected and unmodified. |

## Existing infrastructure references

The catalogue already contains link-only/reference entries for infrastructure research services including VirusTotal, Censys, Shodan, SecurityTrails and crt.sh. They are not native provider-runtime integrations. Phase 7 will not activate or automate them.

## Candidate decisions

| Candidate | Decision | Reason |
| --- | --- | --- |
| Google Public DNS JSON DoH | `ACTIVE` | Fixed public GET contract; one explicit domain; six fixed record types only (`A`, `AAAA`, `MX`, `NS`, `TXT`, `CNAME`). |
| RIPEstat Network Info | `ACTIVE` | Fixed public GET contract for one explicit public IP; returns containing prefix and announcing ASN context. |
| Authoritative RDAP | `LINK_ONLY` | Domain authorities require bootstrap-driven service selection. This phase does not introduce dynamic provider routing or raw registration contact exposure. |
| Certificate Transparency | `LINK_ONLY` | No direct TLS probing and no approved fixed CT adapter in this phase. |
| Commercial/credentialed services | unchanged `LINK_ONLY` | No keys, accounts or credential paths are added. |

## Boundaries verified before implementation

- No scanning, ports, crawling, brute force, DNS zone transfer, target lists or automatic follow-up.
- The renderer receives normalized observations only; it cannot select endpoints, methods or headers.
- One supplied domain may receive at most six fixed DNS record requests. A domain-derived address is not queried for ASN until the analyst explicitly selects one address.
- One supplied public IP may receive one fixed RIPEstat request.
- Raw provider payloads, target history and query history are not persisted.
- Reference-only policy remains authoritative and fail-closed.

## Preflight note

The desktop shell does not expose `node` on `PATH`; validation uses the bundled Codex Node executable. The initial broad regression must continue to report inherited TomTom HTTP 401 and missing AISStream credential warnings separately from Phase 7 results.
