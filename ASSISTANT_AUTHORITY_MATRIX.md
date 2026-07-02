# Assistant Authority Matrix

The Assistant Presence Core does not execute real actions yet. This matrix
defines the future safety envelope for Angie / Gustav / Ares / Aphrodite.

| Level | Name | Scope | Current v2.1.0 behavior |
| --- | --- | --- | --- |
| 0 | OBSERVE | Read visible/local state. | Documented only. |
| 1 | NAVIGATE | Open workspaces or tabs. | Not implemented. |
| 2 | CONFIGURE | Change reversible local settings. | Panel settings only. |
| 3 | LAUNCH | Open configured tools/launchers. | Not implemented. |
| 4 | DELEGATE | Create local tasks for future agents. | Not implemented. |
| 5 | CONFIRM_REQUIRED | Scripts, file edits, commits, push, external messages. | Blocked until explicit future approval flow exists. |
| 6 | BLOCKED | Credentials, payments, destructive actions, mass deletion, unsafe automation. | Blocked. |

## Rules

- v2.1.0 is visual/local only.
- No command execution is allowed from Assistant Presence.
- No file writes are allowed from assistant messages.
- No commits or pushes are allowed from the assistant UI.
- No external messages are sent.
- No sensitive context is sent to any model or service.
- Future levels 5 and 6 require explicit confirmation gates before any
  implementation.

## Future notes

Potential future integrations must remain modular:

- local LLM provider;
- local speech-to-text;
- local voice output;
- command router;
- workspace navigation;
- Agent Command task creation.

None of these are active in v2.1.0.
