# OSINT Panel State Model

The OSINT interaction model is intentionally layered:

| Interaction | Effect | Persistence |
| --- | --- | --- |
| `HOVER` | Shows a transient provider preview only. | None |
| `SELECT` | Sets an active provider and displays normalized metadata. | Current process only |
| `DETAIL` | Opens an accessible provider dialog. | None |
| `OPEN` / `COPY URL` / `DOCS` | Allowed only after central policy approval. | Sanitized session event only |
| `READ REFERENCE` | Opens an informational reference dialog. | Sanitized session event only |
| `QUERY WAYBACK` | Runs the one approved manual historical-archive query. | Sanitized event only |
| `CANCEL` | Aborts the active manual query. | Sanitized cancellation event only |
| `SAVE TO CASE` | Opens explicit evidence preview for a valid permitted result. | Writes only after confirmation |
| `CASE WORKSPACE` | Opens local investigations, evidence, timeline and notes. | Local explicit case data |

Selection never launches a browser, opens a modal, invokes IPC or fetches a
provider. Hover never selects a provider or records history. This distinction
keeps accidental pointer movement from becoming an access action.

`LOADING`, `RESULT`, `CANCELLED`, `OFFLINE`, `RATE_LIMITED` and `KEY_REQUIRED`
are runtime states. In v2.3.5 they are used only by the approved Wayback
Availability adapter. They do not authorize any other catalog entry.

v2.4.0 preserves the ephemeral session layer: clearing it never clears a case,
and opening a case never copies the entire session history into its timeline.
