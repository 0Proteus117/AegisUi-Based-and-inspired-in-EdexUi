# STUD Zotero Interoperability

Zotero is optional and never required for STUD.

Phase 3 uses Zotero's documented local HTTP API on the fixed loopback endpoint
`http://127.0.0.1:23119/api/`. A health check and bounded read of up to 50 local
items are available only after explicit user action. Importing one selected
item stores normalized canonical metadata plus its Zotero item key; no bulk
sync or hidden background read exists.

The current local API path is treated as read-only. Aegis does not pretend it
can push, update or synchronize Zotero items, and it does not access Zotero's
SQLite database directly. Zotero remains the external data owner.

- Zotero account required: **No** for the local desktop API.
- Zotero required for STUD: **No**.
- Network cloud dependency: **No**.
- Writes to Zotero: **No**.
- Arbitrary loopback endpoint: **No**; the endpoint is fixed in the runtime.
