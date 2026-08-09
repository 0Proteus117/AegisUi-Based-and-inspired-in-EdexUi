# OSINT Explicit Handoffs

| Normalized object | Allowed action | Destination | Query started? |
| --- | --- | --- | --- |
| Domain / public IP | Open Domain Context | Domain & Infrastructure | No |
| Domain / public IP | Promote to Entity | Entity Resolution | No |
| Location or Media GPS | Verify Location | Geospatial Verification | No |
| Source / Document | Open Source Verification | Source Verification | No |
| Source with explicit host | Open Domain Context | Domain & Infrastructure | No |
| Entity with explicit compatible field | Open Context | Domain, Geo or Source | No |
| Evidence | Open Evidence / Link to Entity | Existing detail / Entity | No |

Invalid combinations are omitted and rejected again by the orchestration model.
`REFERENCE_ONLY` providers are unchanged: no launch, query, navigation,
installation, API call or network request is introduced by this layer.

The user-facing destination notice records source capability and provenance and
states that the value was prefetched only. It does not imply provider
verification, attribution or identity certainty.
