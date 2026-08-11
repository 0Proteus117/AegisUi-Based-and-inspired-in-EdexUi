# STUD Academic Providers

Reviewed 2026-08-11 against official public documentation.

| Provider | Decision | Cost model | Endpoint model | Configuration |
| --- | --- | --- | --- | --- |
| OpenAlex | Active | `FREEMIUM` | Fixed `api.openalex.org/works`, GET only, max 25 | `AEGISUI_OPENALEX_API_KEY` |
| Crossref | Active | `FREE_SERVICE` | Fixed `api.crossref.org/v1/works/{doi}`, GET only | None |
| DataCite | Active | `FREE_SERVICE` | Fixed `api.datacite.org/dois/{doi}`, GET only | None |
| Unpaywall | Active | `FREE_SERVICE` | Fixed `api.unpaywall.org/v2/{doi}`, GET only | `AEGISUI_UNPAYWALL_EMAIL` |
| Zotero local | Optional local read/import | `FREE_LOCAL` | Fixed `127.0.0.1:23119/api`, GET only | Running Zotero desktop |
| Moodle | Optional read-only institutional LMS | `INSTITUTIONAL` | Fixed same-origin REST endpoint, explicit POST reads only | Institution-issued Web Service token |

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

## Moodle capability decision

Moodle is `CONFIG_REQUIRED` by default, not assumed active. The first adapter
uses only fixed documented read functions and an institution-issued token held
only in macOS `safeStorage`. It does not accept a university password, browser
cookie, arbitrary endpoint, custom method or renderer-selected headers.

UEL public documentation confirms normal Moodle use in the student ecosystem,
but it does not establish that an individual UEL student account is granted a
REST/Mobile Web Service token or any specific external function. Therefore UEL
native capability status is **UNKNOWN until an explicit local capability
probe**. No UEL service was queried during Phase 4.

Moodle write capabilities are permanently `POLICY_DISABLED` by AegisUi.
Optional same-host ICS is constrained to event/deadline normalization; its
calendar observations never mutate Aegis Calendar. Detailed architecture and
fallback policy are in [STUD_MOODLE_ADAPTER.md](STUD_MOODLE_ADAPTER.md) and
[STUD_MOODLE_FALLBACKS.md](STUD_MOODLE_FALLBACKS.md).
