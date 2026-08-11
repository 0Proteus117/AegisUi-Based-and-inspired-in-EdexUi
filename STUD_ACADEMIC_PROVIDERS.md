# STUD Academic Providers

Reviewed 2026-08-11 against official public documentation.

| Provider | Decision | Cost model | Endpoint model | Configuration |
| --- | --- | --- | --- | --- |
| OpenAlex | Active | `FREEMIUM` | Fixed `api.openalex.org/works`, GET only, max 25 | `AEGISUI_OPENALEX_API_KEY` |
| Crossref | Active | `FREE_SERVICE` | Fixed `api.crossref.org/v1/works/{doi}`, GET only | None |
| DataCite | Active | `FREE_SERVICE` | Fixed `api.datacite.org/dois/{doi}`, GET only | None |
| Unpaywall | Active | `FREE_SERVICE` | Fixed `api.unpaywall.org/v2/{doi}`, GET only | `AEGISUI_UNPAYWALL_EMAIL` |
| Zotero local | Optional local read/import | `FREE_LOCAL` | Fixed `127.0.0.1:23119/api`, GET only | Running Zotero desktop |

OpenAlex's current free API key requirement differs from the older assumption
in the Phase brief, so the honest classification is `FREEMIUM` with
`CONFIG_REQUIRED` when the private key is absent. Crossref and DataCite remain
usable without accounts. Unpaywall's required email identity is read from a
private environment value and is never stored or logged.

All adapters have bounded responses (3 MB), a 12-second timeout, typed HTTP,
rate-limit, malformed-response and cancellation states. Only normalized fields
from a user-selected result may reach the canonical store. Semantic Scholar,
CORE and OpenCitations remain out of native Phase 3 scope.

Official references:

- https://docs.openalex.org/how-to-use-the-api/api-overview
- https://api.crossref.org/swagger-ui/index.html
- https://support.datacite.org/docs/api
- https://unpaywall.org/products/api
- https://www.zotero.org/support/dev/client_coding/direct_sqlite_access
