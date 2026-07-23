# OSINT Session History

OSINT session history is a small, in-memory audit trail for the active app
process. It records provider selection and permitted-action outcomes without
raw URLs, query text, credentials, response bodies, browser history or
third-party data.

- Maximum retained events: 50.
- Storage: JavaScript memory only.
- Persistence: none; relaunching AegisUi starts an empty session.
- Clear: a lightweight two-step `CLEAR SESSION` / `CONFIRM CLEAR` control.
- Privacy: the selected provider remains visible after clearing so the operator
  does not lose the context they explicitly selected.

This is not an Evidence Object, Investigation Case, query store or audit log.
Those concepts require their own explicit privacy and retention policy before
they can be introduced.
