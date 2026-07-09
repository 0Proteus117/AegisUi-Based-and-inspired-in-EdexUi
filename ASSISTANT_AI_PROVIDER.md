# Assistant AI Provider Layer

v2.2.0 introduces a small provider abstraction so the Assistant is not hard-wired to one model backend.

## Current provider

### Ollama

- Status: functional.
- Endpoint: local `http://127.0.0.1:11434` by default.
- Recommended model: `llama3.2:3b`.
- Mode: local written chat.
- Streaming: disabled in this build.
- Tools: disabled.
- Images: disabled.
- Local-only: yes.

## Planned provider

### Apple Native

- Status: planned / not connected.
- No Apple Foundation Models call is made in v2.2.0.
- No dependency is added.
- This is only a placeholder in the provider layer and settings UI.

## Interface

Providers expose:

- `getProviderId()`
- `checkHealth()`
- `listModels()`
- `chat()`
- `getCapabilities()`
- `supportsStreaming()`
- `supportsTools()`
- `supportsImages()`
- `supportsLocalOnly()`

## Safety

The AI provider layer is text-only in v2.2.0. It does not execute commands, write files, access credentials, or control external services directly.
