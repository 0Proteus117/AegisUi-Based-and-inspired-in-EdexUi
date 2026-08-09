# OSINT Capability Model

A capability expresses an analyst need; a provider is one concrete resource
that may satisfy it. `CapabilityRegistry` maps capabilities to normalized
providers without coupling UI cards to adapter implementations.

The Phase 3 registry declares:

- `RESEARCH_DISCOVERY`
- `HISTORICAL_ARCHIVE`
- `EVIDENCE_PRESERVATION`
- `INFRASTRUCTURE_CONTEXT`
- `THREAT_REPUTATION`
- `GEOSPATIAL_VERIFICATION`
- `VISUAL_MEDIA_VERIFICATION`
- `MEDIA_VERIFICATION`
- `ENTITY_RESEARCH`
- `PUBLIC_PRESENCE`
- `TRANSPORT_MONITORING`
- `DATA_ANALYSIS`

Each definition documents supported inputs/outputs, cancellation/evidence
support and an initial risk class. The registry can report matching providers
and a preferred provider without granting an action. In v2.5.0,
`HISTORICAL_ARCHIVE`, `GEOSPATIAL_VERIFICATION` and
`VISUAL_MEDIA_VERIFICATION` have bounded approved
provider query path each. The latter accepts decimal/DMS coordinates locally
and optional manually entered place text through its fixed adapter.

Future capability work must add an explicit provider policy and adapter; a
capability label alone never authorizes networking, integration or launch.
