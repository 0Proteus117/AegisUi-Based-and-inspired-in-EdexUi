# OSINT Geo Evidence Model

Geospatial results are ephemeral until the investigator selects **ADD TO CASE**
and confirms the existing evidence preview. The saved object contains only
strictly normalized fields: coordinates, a compact place context, selected
provider observation summaries, verification state, confidence and reasoning.

Raw provider JSON, response headers, hidden query history and credentials are
never stored. Redaction is available for the original input, coordinates,
place context, elevation and provider observations before SHA-256 integrity is
created. Redaction removes the chosen field; it is not a visual mask.

Evidence uses the existing local Case service, atomic storage, locking,
canonical serialization and integrity verification. No new IPC channel or
filesystem access is added.
