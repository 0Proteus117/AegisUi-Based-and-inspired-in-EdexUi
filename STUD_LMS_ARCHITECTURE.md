# STUD LMS architecture

## Boundary

STUD remains the local, canonical academic model. An LMS adapter is an optional
observer: it supplies bounded, normalized observations only after an explicit
student action. It cannot replace local records, run while STUD is idle or
delete local history when an institution stops returning an object.

Phase 4 introduces the generic components `LmsAdapter`, `StudLmsRuntime` and
`StudCredentialVault`. `MoodleAdapter` is the only implementation. The generic
boundary intentionally permits future reviewed adapters without adding one now.

```text
Moodle REST or optional ICS export
  -> fixed, audited adapter
  -> normalized observation
  -> canonical STUD upsert + field provenance
  -> local-first Course / Assignment / Resource view
```

The renderer only invokes narrow `stud-moodle-*` IPC actions. It cannot choose
an endpoint, HTTP method, request headers or provider function. The main
process accepts an exact allowlist and maps only to the fixed adapter methods.

## Security and privacy

- AegisUi never accepts or stores a university username or password.
- Institution-issued Web Service tokens and optional ICS URLs are encrypted by
  Electron/macOS `safeStorage` in `userData/stud/secure-provider-credentials.json`.
- SQLite stores only non-secret provider instance state: base URL, display
  name, capabilities, sync times and typed error code.
- No token, ICS URL, cookie, raw response, local path or Moodle HTML is stored
  in canonical STUD records, logs, settings, Git or release evidence.
- Configuration fails closed when secure storage is unavailable; no plaintext
  fallback exists.

## Read-only policy

The adapter knows only audited read functions. `ASSIGNMENT_WRITE`, `FORUM_WRITE`,
`MESSAGE_WRITE` and `QUIZ_WRITE` are permanently `POLICY_DISABLED` by AegisUi,
even when an institution exposes them. There is no submission, file upload,
course modification, forum posting, messaging, grading, enrolment, quiz
attempt, profile edit or Calendar mutation path.

## Lifecycle

Every probe/sync is explicit, bounded and cancellable. The adapter has fixed
timeouts and response limits. Courses, assignments, resources, grades,
feedback, completion observations and calendar observations remain available
offline after a successful sync. Calendar observations are shown only in STUD;
they never create or edit Aegis Calendar events.

See [STUD_MOODLE_ADAPTER.md](STUD_MOODLE_ADAPTER.md),
[STUD_MOODLE_SYNC.md](STUD_MOODLE_SYNC.md) and
[STUD_MOODLE_FALLBACKS.md](STUD_MOODLE_FALLBACKS.md).
