# STUD Moodle adapter

## Capability-driven REST probe

`MoodleAdapter` calls only the fixed Moodle REST endpoint derived from the
configured HTTPS base URL:

`/webservice/rest/server.php`

The sanctioned token is sent only in an explicit form-encoded request with a
fixed method and headers. The renderer cannot forward arbitrary URLs, methods,
headers or Moodle function names. Each response is bounded to 2 MB and each
request has a 12 second timeout and a cancellation signal.

The audited read function set is:

| Capability | Moodle external function |
| --- | --- |
| Site context | `core_webservice_get_site_info` |
| Courses | `core_enrol_get_users_courses` |
| Course content/resources | `core_course_get_contents` |
| Assignments | `mod_assign_get_assignments` |
| Calendar observations | `core_calendar_get_calendar_events` |
| Grades/feedback | `gradereport_user_get_grade_items` |
| Completion | `core_completion_get_activities_completion_status` |
| Forum read (reserved) | `mod_forum_get_forums_by_courses` |

## UEL system-browser SSO

UEL's public Moodle configuration reports Web Services and Mobile Web Services
enabled with `typeoflogin = 2` and the official
`/admin/tool/mobile/launch.php` endpoint. Moodle defines this mode as external
browser SSO. An embedded Electron login window is therefore not a supported
substitute: Microsoft/UEL conditional-access and device checks must complete in
the user's normal system browser.

`CONNECT UEL MOODLE` now performs the official Moodle app flow:

1. fetch the bounded unauthenticated public configuration from the fixed UEL
   Moodle origin;
2. create a short-lived, in-memory passport and open the official launch URL in
   the system browser;
3. receive `aegisui://token=...` through the packaged macOS URL scheme;
4. validate the returned MD5 launch signature against the pending site and
   passport, reject expiry/replay/malformed callbacks, and consume the request;
5. encrypt the Moodle token/private token in the existing macOS `safeStorage`
   vault;
6. run the existing read-only capability probe and bounded initial sync.

The password, MFA challenge, browser cookies and browser profile remain outside
AegisUi. Callback URLs are secrets and are never logged, returned to the
renderer or persisted. Reconnection uses the encrypted Web Service token while
it remains valid.

Submission status and feedback are reported only when the configured Moodle
service exposes defensible read data. Unsupported, hidden or denied functions
remain visible as `UNSUPPORTED`, `NOT_EXPOSED`, `PERMISSION_DENIED` or
`UNKNOWN`; they are never rendered as invented empty data.

## Status and policy

Connection state is one of `UNCONFIGURED`, `CONFIG_REQUIRED`, `READY`,
`PARTIAL`, `OFFLINE` or `ERROR`. Capability state is independently represented
as `SUPPORTED`, `UNSUPPORTED`, `NOT_EXPOSED`, `PERMISSION_DENIED`,
`CONFIG_REQUIRED`, `UNKNOWN` or `POLICY_DISABLED`.

`POLICY_DISABLED` means the server's actual availability is deliberately not
executed by AegisUi. This is distinct from an unavailable Moodle capability.

## Institutional verification

Reviewed on 2026-08-14 using public Moodle and UEL material:

- **Confirmed:** Moodle supports external services and token-based Web Service
  access only when an institution enables an external service, authorizes the
  user and permits the required functions.
- **Confirmed:** UEL public student information identifies Moodle as the
  learning environment and describes normal browser access.
- **Confirmed:** the live UEL Moodle public configuration exposes Web Services,
  Mobile Web Services, external-browser SSO (`typeoflogin = 2`) and the official
  mobile launch endpoint.
- **Conditional:** the exact read-function allowlist and student permissions are
  known only after the authenticated capability probe. Unsupported functions
  remain fail-closed and visible as unavailable.

Sources: [Moodle external services](https://moodledev.io/docs/5.0/apis/subsystems/external),
[Moodle mobile features](https://docs.moodle.org/500/en/admin/setting/mobilefeatures),
[UEL Track My Future](https://www.uel.ac.uk/about/professional-services/it-services/track-my-future).
