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

This is not an Evidence Object, Investigation Case, query store or persistent
audit log. v2.4.0 introduces those as a separate opt-in local layer; only
explicit case/evidence actions are recorded there.
