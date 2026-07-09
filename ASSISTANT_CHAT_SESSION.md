# Assistant Chat Session

v2.2.0 adds local conversational memory for the AegisUi Assistant.

## Scope

- Written chat only.
- Local storage only.
- No cloud sync.
- No voice, STT or TTS.
- No command execution from memory.

## Storage

Conversation files live outside the repository in:

`~/Library/Application Support/EdexUi-Eng/assistant/chat/`

Expected structure:

- `current-session.json`
- `profiles/gustav.json`
- `profiles/angie.json`
- `profiles/ares.json`
- `profiles/aphrodite.json`
- `exports/`
- `backups/`

These files are private runtime data and must not be committed.

## Context management

The assistant sends only a bounded context to the local AI provider:

- private bootstrap memory, capped by config;
- optional conversation summary;
- recent conversation messages;
- latest user message.

It does not send infinite history.

## Controls

The Assistant panel exposes:

- expanded chat view;
- clear current conversation;
- clear active assistant memory;
- export local markdown;
- open chat folder.

Exports are local userData files, not repository files.
