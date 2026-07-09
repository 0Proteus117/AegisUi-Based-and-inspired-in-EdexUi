# Assistant Command Router

v2.2.0 adds the first safe local command router for AegisUi.

## Status

`LOCAL / SAFE / CONTROLLED`

The router is not a shell. It is an allowlist of internal UI actions.

## Allowed examples

- open / close Assistant panel;
- open / close expanded chat;
- switch assistant profile;
- navigate to known workspaces;
- open Project Control;
- open Calendar;
- open Apple Music;
- refresh Apple Music;
- play / pause Apple Music;
- refresh map;
- toggle selected map layers;
- show memory status;
- show Local AI status;
- clear the current conversation.

## Blocked

The router blocks:

- arbitrary shell commands;
- Git operations;
- destructive actions;
- deletion / formatting;
- credential handling;
- external messages;
- payments;
- unlisted actions.

## Chat integration

Normal conversation is always treated as chat unless the message clearly
matches an allowlisted system action.

Examples treated as chat:

- “hola”
- “hola estrellita”
- “el mundo te dice hola”
- “cuéntame algo”
- “dime algo bonito”

The model can write a normal response or express an obvious safe intent such as:

- “abre el chat grande”
- “cambia a Angie”
- “abre Apple Music”
- “pausa la música”
- “limpia esta conversación”

AegisUi validates the intent against the allowlist before execution.

If an action is not allowed, the UI returns:

`Command blocked: action not allowed in current authority level.`

The router must not contaminate harmless conversation with command-router
warnings.

## Future

Future router phases may add approval flows, scoped file operations, and test execution. They are not enabled in v2.2.0.
