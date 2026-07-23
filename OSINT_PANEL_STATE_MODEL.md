# OSINT Panel State Model

The OSINT interaction model is intentionally layered:

| Interaction | Effect | Persistence |
| --- | --- | --- |
| `HOVER` | Shows a transient provider preview only. | None |
| `SELECT` | Sets an active provider and displays normalized metadata. | Current process only |
| `DETAIL` | Opens an accessible provider dialog. | None |
| `OPEN` / `COPY URL` / `DOCS` | Allowed only after central policy approval. | Sanitized session event only |
| `READ REFERENCE` | Opens an informational reference dialog. | Sanitized session event only |

Selection never launches a browser, opens a modal, invokes IPC or fetches a
provider. Hover never selects a provider or records history. This distinction
keeps accidental pointer movement from becoming an access action.

The model reserves `LOADING`, `RESULT`, `OFFLINE`, `RATE_LIMITED` and
`KEY_REQUIRED` for a future approved Provider Runtime. They are display states,
not an implicit promise that the current catalog has native data access.
