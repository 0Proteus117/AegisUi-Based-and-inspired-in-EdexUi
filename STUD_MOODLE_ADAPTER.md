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

Reviewed on 2026-08-11 using public Moodle and UEL material:

- **Confirmed:** Moodle supports external services and token-based Web Service
  access only when an institution enables an external service, authorizes the
  user and permits the required functions.
- **Confirmed:** UEL public student information identifies Moodle as the
  learning environment and describes normal browser access.
- **Conditional:** a UEL Moodle REST/Mobile service can be used only if UEL
  exposes it to the student and the institution grants a sanctioned token and
  read functions.
- **Unknown:** the live UEL URL, exposed service, token issuance, function
  allowlist and permissions. No UEL configuration or credentials were supplied,
  so live institutional validation was not performed.

Sources: [Moodle external services](https://moodledev.io/docs/5.0/apis/subsystems/external),
[Moodle web services](https://docs.moodle.org/501/en/Using_web_services),
[UEL Track My Future](https://www.uel.ac.uk/about/professional-services/it-services/track-my-future).
