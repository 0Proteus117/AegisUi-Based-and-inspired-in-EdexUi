# Entity Provider Discovery

Phase 9 reviewed the existing catalogue entries for organization, sanctions,
registry and public-record context. No external entity provider was promoted to
the native runtime. Existing entries retain their published EXTERNAL_WEB,
LINK_ONLY or REFERENCE_ONLY policy. The sole new provider is `local-entity-resolution`:
an ACTIVE `LOCAL_TOOL` with no endpoint, URL, launch, copy or installation
action. Future provider review must use an official documented contract and
must preserve the explicit, bounded, fail-closed model.

## Reviewed candidates

| Candidate | Decision | Reason |
| --- | --- | --- |
| OpenSanctions | REJECTED for native Phase 9 | Its documented API supports entity search and matching and requires an API key; that would broaden this local, Case-owned capability into external people/company enrichment. |
| OpenCorporates | LINK_ONLY | Its official API is useful company-registry context but requires separately governed access and is not necessary for local entity modeling. |
| Companies House | LINK_ONLY | Its official API is a public-registry resource, but it requires an API key and jurisdiction-specific policy review before any bounded adapter is considered. |

The review used only official public documentation: [OpenSanctions API](https://www.opensanctions.org/docs/api/), [OpenCorporates API reference](https://api.opencorporates.com/documentation/API-Reference?source=post_page---------------------------), and [Companies House API guidance](https://developer.company-information.service.gov.uk/get-started). No person-search broker, data broker, credential source, social platform or automated public-record lookup was reviewed for integration.
