# OSINT Geo Security

- Queries are manual and user initiated; no background polling, tracking or
  automatic map update exists.
- The only native provider uses a fixed HTTPS endpoint, GET,
  `credentials: omit`, `cache: no-store`, timeout and cancellation.
- The provider adapter accepts bounded place text only. Coordinate parsing is
  local and makes no request.
- Renderer output is normalized before display; raw provider payloads do not
  enter Cases/Evidence persistence.
- `REFERENCE_ONLY`, `LINK_ONLY`, key-required and disabled entries remain
  blocked by the existing provider policy. Phase 5 creates no API-key path,
  account flow, IPC, proxy, scraper or generic network bridge.
- Existing Case redaction, SHA-256 integrity, provenance and sender-validated
  IPC boundaries remain unchanged.
