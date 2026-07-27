# OSINT Provider Schema

## Purpose

The OSINT catalog has one canonical runtime source: `OSINTToolsRegistry.PROVIDERS` in `src/classes/workspaces/osintTools.registry.js`. Compatibility exports `CATEGORIES`, `TOOLS` and `FEATURED` are projections from that provider registry; they are not independent lists.

The schema implementation lives in `src/classes/workspaces/osintProviderSchema.class.js`. It validates the complete registry on load and in the automated test suite.

## Provider versus capability

- A **capability** is a normalized analyst need, such as `HISTORICAL_ARCHIVE` or `GEOSPATIAL_VERIFICATION`.
- A **provider** is a concrete ecosystem entry that may support one or more capabilities.
- A **reference-only entry** is a provider record used only to recognize and contextualize a real tool; it has no operational path in AegisUi.

## Required provider fields

| Field | Meaning |
| --- | --- |
| `id` | Stable unique identifier. |
| `name` / `shortName` | User-facing identity. |
| `description` | Neutral high-level description. |
| `category` | One of the nine catalog categories. |
| `capabilities` | Normalized capability IDs. |
| `providerType` / `accessMode` | Technical class and permitted access surface. |
| `providerStatus` | Current catalog availability state. |
| `riskProfile` / `legalStatus` | Distinct context signals, never a substitute for policy. |
| `inputs` / `outputs` | High-level declared shape; not an execution contract. |
| `authentication` / `costModel` | Provider-context metadata. |
| `officialUrl` / `docsUrl` | Approved public URLs where policy permits them. |
| `launchAllowed` / `copyUrlAllowed` / `integrationAllowed` / `installationAllowed` | Explicit action permissions. |
| `referenceReason` / `legalDisclaimer` / `jurisdictionNote` | Context required for transparent catalog use. |
| `tags` | Compact catalog context. |
| `lastReviewed` / `sourceConfidence` | Review date and confidence classification. |
| `runtimeAdapter` | Approved adapter family; it is resolved only by the runtime factory. |

Optional metadata is deliberately narrow: aliases, maintainer, license, platforms, availability, deprecation/replacement notes and public-reference metadata. Arbitrary blobs are not accepted by the validation layer.

## Official enums

### Provider type

`EXTERNAL_WEB`, `REST_API`, `LOCAL_TOOL`, `SYSTEM_INTEGRATION`, `REFERENCE`

### Access mode

`WEB`, `API`, `LOCAL`, `REFERENCE_ONLY`

### Provider status

`ACTIVE`, `LINK_ONLY`, `REFERENCE_ONLY`, `UNSUPPORTED`, `DISABLED`

### Risk profile

`PASSIVE`, `ACCOUNT_REQUIRED`, `API_KEY_REQUIRED`, `COMMERCIAL`, `SENSITIVE`, `HIGH_ABUSE_POTENTIAL`

### Legal status

`GENERALLY_LEGAL`, `AUTHORIZATION_REQUIRED`, `CONTEXT_DEPENDENT`, `JURISDICTION_DEPENDENT`, `POTENTIALLY_ILLEGAL`, `UNKNOWN`

### Source confidence

`VERIFIED_OFFICIAL`, `VERIFIED_PUBLIC`, `MULTIPLE_PUBLIC_SOURCES`, `UNVERIFIED`, `HISTORICAL`

### Capabilities

`RESEARCH_DISCOVERY`, `HISTORICAL_ARCHIVE`, `EVIDENCE_PRESERVATION`, `INFRASTRUCTURE_CONTEXT`, `THREAT_REPUTATION`, `GEOSPATIAL_VERIFICATION`, `MEDIA_VERIFICATION`, `ENTITY_RESEARCH`, `PUBLIC_PRESENCE`, `TRANSPORT_MONITORING`, `DATA_ANALYSIS`

## Validation rules

The registry fails validation for duplicate IDs, invalid categories/capabilities/enums, missing required fields, invalid URLs, contradictory provider/access pairs or contradictory permission states.

`REFERENCE_ONLY` is a strict schema state:

- `providerType = REFERENCE`
- `accessMode = REFERENCE_ONLY`
- `providerStatus = REFERENCE_ONLY`
- all launch, copy, integration and installation permissions are `false`
- no operational official, documentation or public-reference URL is permitted

The schema also rejects `POTENTIALLY_ILLEGAL` providers presented as `ACTIVE` without a future explicit review model, and high-abuse providers marked integrated without such a model.

## Adding a provider

1. Use an official, public or otherwise reputable source to establish the entry exists.
2. Write neutral, high-level language; do not copy promotional claims or include operational instructions.
3. Select capabilities and policy metadata before considering presentation.
4. Use `REFERENCE_ONLY` whenever AegisUi should inform without facilitating access.
5. Run `node scripts/test-osint-provider-registry.js` and `node scripts/test-osint-reference-only-policy.js`.
6. A native capability requires a dedicated policy review, adapter test and
   normalized-result contract. It must not reuse a legacy IPC or webview route.
