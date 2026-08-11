# STUD Moodle fallbacks

## Priority

1. **Native REST** — preferred when the institution enables a sanctioned
   external service and grants an individual read-only token.
2. **ICS export** — an optional, constrained same-host HTTPS calendar export
   for event/deadline observations only. It does not expose grades, files,
   messages or Moodle write actions.
3. **Normal browser** — `OPEN IN MOODLE` opens only the configured base URL in
   the user's normal browser. AegisUi neither embeds an authenticated browser
   nor accesses its cookies.

REST failure does not erase prior canonical STUD data. An ICS fallback can work
without a REST token, but its state is honestly `PARTIAL` because it cannot
represent a full Moodle read surface.

## Unsupported institutional state

No institution is assumed to expose REST, Mobile Web Services, a usable token,
the chosen functions or ICS. Capability Probe represents the exact observed
instance/account state. `PERMISSION_DENIED`, `NOT_EXPOSED`, `UNSUPPORTED`,
`OFFLINE` and `ERROR` remain local typed states with recovery guidance; they do
not crash STUD and do not affect unrelated AegisUi workspaces.

No token is present in browser fallback URLs, canonical resource URLs, logs or
evidence. A token can be rotated or removed through secure configuration; it is
never copied to SQLite or source control.
