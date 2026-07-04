# Assistant Local AI

`v2.1.7` connects the Assistant panel text input to a local Ollama model.

This phase is written chat only:

- no voice;
- no speech-to-text;
- no text-to-speech;
- no command router;
- no file writes by the assistant;
- no shell commands from the assistant;
- no external AI API.

## Provider

Default local provider:

```text
Ollama
```

Default endpoint:

```text
http://127.0.0.1:11434
```

Recommended model:

```text
llama3.2:3b
```

Install the model manually:

```sh
ollama pull llama3.2:3b
```

Then test:

```sh
node scripts/test-assistant-ollama.js
```

If the model is missing, the app shows:

```text
Model not found. Run: ollama pull llama3.2:3b
```

If Ollama is not running, the app shows:

```text
Local AI offline. Start Ollama and install the configured model.
```

## Local configuration

The committed example lives at:

```text
assistant/config/assistant-ai.example.json
```

The real local config lives outside Git at:

```text
~/Library/Application Support/EdexUi-Eng/assistant/config/assistant-ai.json
```

The app creates it automatically if missing.

Stored values include:

- provider;
- enabled/disabled state;
- endpoint;
- model;
- timeout;
- personality temperatures;
- whether bootstrap memory is used.

It does not store API keys, voice samples, model weights or private memory in
the repository.

## Memory

When enabled, local chat injects the installed private bootstrap memory into the
system prompt as limited grounding context:

```text
[PRIVATE MEMORY BOOTSTRAP - SUMMARY CONTEXT]
...
[/PRIVATE MEMORY BOOTSTRAP]
```

The context is capped by `memory.maxChars` and is sent only to the local Ollama
endpoint.

The UI never displays the full private memory.

## Personalities

The active panel profile selects the system prompt:

- Gustav: private, dry, technical, concise.
- Angie: private, warm, tender, present.
- Ares: public, sober, tactical.
- Aphrodite: public, warm, elegant.

All profiles share the same safety boundary:

- command execution is disabled;
- voice is offline;
- system actions are unavailable;
- unavailable capabilities must not be claimed.

## Scripts

```sh
node scripts/test-assistant-ollama.js
```

Checks:

- Ollama health;
- configured model;
- private memory bootstrap;
- one local chat response.

```sh
node scripts/pull-assistant-model.js
```

Uses the local `ollama` CLI to pull the configured model. It does not install
Ollama itself.
