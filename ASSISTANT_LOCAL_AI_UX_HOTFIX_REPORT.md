# Assistant Local AI UX Hotfix Report

## Relevant files

- `src/classes/assistant/assistantPanel.class.js`
- `src/classes/assistant/assistantPresence.class.js`
- `src/classes/assistant/assistantBridge.class.js`
- `src/classes/assistant/assistantLocalChat.class.js`
- `src/classes/assistant/assistantOllamaClient.class.js`
- `src/classes/assistant/assistantMemoryBootstrap.class.js`
- `scripts/test-assistant-ollama.js`
- `scripts/diagnose-assistant-local-ai.js`

## Ollama detection

Ollama is checked by `AssistantOllamaClient.checkHealth()` using:

- `GET /api/tags`
- configured endpoint from userData:
  `~/Library/Application Support/EdexUi-Eng/assistant/config/assistant-ai.json`

The real runtime issue found during this phase was:

- Ollama CLI was installed;
- model `llama3.2:3b` existed;
- no server was listening on `127.0.0.1:11434`;
- therefore the app correctly showed `OLLAMA_OFFLINE`.

The fix improves diagnostics and starts Ollama as a persistent local service
outside the app during validation.

## Endpoint/model persistence

Endpoint and model are stored outside Git in:

```text
~/Library/Application Support/EdexUi-Eng/assistant/config/assistant-ai.json
```

The committed example remains:

```text
assistant/config/assistant-ai.example.json
```

## Panel click close cause

`AssistantPresence` used a document-level outside-click handler. Clicking a
button inside the panel could trigger a panel re-render before the event
finished bubbling, leaving the original clicked target detached from the new
panel DOM. The outside-click handler then saw it as outside and closed the
panel.

Fix:

- stop propagation on panel internal clicks;
- use `event.composedPath()` when available;
- close only for true outside clicks, ESC or the X button.

## Enter handling cause

The textarea only submitted through the form button. It did not intercept
`keydown`.

Fix:

- Enter sends when text is present;
- Cmd+Enter sends;
- Shift+Enter creates a newline;
- duplicate sends are blocked while processing;
- focus returns to the input after send.
