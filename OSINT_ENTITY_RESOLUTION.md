# OSINT Entity Resolution

`ENTITY_RESOLUTION` is a local, analyst-controlled OSINT capability. It models
entities already encountered in an investigation and correlates only explicit
observations. Creating, selecting, linking or viewing an entity does not call a
provider, write to disk or create a global entity history.

The workspace supports explicit create and edit actions, evidence-backed links,
analyst-confirmed merges, archive, bounded graph review and promotion through
the existing Case Evidence Preview. Editing preserves the field-level
provenance already attached to each attribute; it does not re-query a source.

Supported Phase 9 types are PERSON, ORGANIZATION, DOMAIN, EMAIL, USERNAME,
SOURCE, DOCUMENT, LOCATION, IP, ASN and UNKNOWN_ENTITY. The workspace is not a
people search, enrichment engine, biometric tool or social-crawling system.
