# Assistant Presence Core

`v2.1.0` introduces the first visual core for the future Angie / Gustav
assistant system inside AegisUi.

This phase is intentionally local and visual only:

- no LLM is connected;
- no speech-to-text is connected;
- no custom voice model is connected;
- no external API is called;
- no commands, files, commits, pushes or messages are executed by the
  assistant.

## Visual presence

The assistant appears as a cockpit-style orb in the lower-left corner. It is
rendered globally, so it remains visible when switching between HUB, ENGINEER,
OSINT, STUDENT, ARTIST, BUSINESS, COMMS, LAUNCH BAY, DEVELOPER and AGENT
COMMAND.

The orb supports these states:

- `IDLE`
- `LISTENING`
- `THINKING`
- `SPEAKING`
- `MUTED`
- `OFFLINE`
- `ERROR`

The current state can be changed internally with:

```js
window.assistantPresence.setState("IDLE")
window.assistantPresence.setState("LISTENING")
window.assistantPresence.setState("THINKING")
window.assistantPresence.setState("SPEAKING")
window.assistantPresence.setState("MUTED")
window.assistantPresence.setState("OFFLINE")
window.assistantPresence.setState("ERROR")
```

## Panel

Clicking the orb opens a compact cockpit panel. The panel includes:

- active assistant name;
- state readout;
- last response;
- manual text input;
- send button;
- mute/unmute;
- settings;
- clear;
- honest backend placeholder: `Assistant backend not connected yet.`

Sending text does not call an AI model. It only exercises the local state
machine and returns the placeholder response.

## Names and aliases

Public names:

- `Ares`
- `Aphrodite`

Private aliases:

- `Ares` → `Gustav`
- `Aphrodite` → `Angie`

The user can switch public/private mode and active assistant in the panel
settings.

## Settings

Settings are currently stored in renderer `localStorage` under:

```text
aegisui-assistant-settings-v1
```

Persisted fields:

- assistant mode: public/private;
- aliases;
- active assistant;
- muted;
- voice mode;
- panel open/closed;
- backend status placeholders.

No API keys, tokens, voice samples, model weights or private memory are stored.

## Future bridge

`src/classes/assistant/assistantBridge.class.js` exposes placeholder methods
for future integration:

- `sendText(message)`
- `startListening()`
- `stopListening()`
- `speak(text)`
- `checkBackendHealth()`
- `checkVoiceHealth()`

All methods are currently local and non-external.

## Voice safety

The settings panel includes this warning:

> Only use voices you own or have explicit permission to use.

Private voice assets must stay out of Git. The ignored paths are:

- `assistant/voices/private/`
- `*.wav`
- `*.mp3`
- `*.flac`
- model files such as `*.pt`, `*.pth`, `*.ckpt`, `*.safetensors`

## Files

Core files:

- `src/classes/assistant/assistantPresence.class.js`
- `src/classes/assistant/assistantState.class.js`
- `src/classes/assistant/assistantSettings.class.js`
- `src/classes/assistant/assistantPanel.class.js`
- `src/classes/assistant/assistantBridge.class.js`
- `src/classes/assistant/assistantPermissions.class.js`
- `src/assets/css/assistant-presence.css`
- `src/assets/css/assistant-panel.css`

Public examples:

- `assistant/config/assistant-settings.example.json`
- `assistant/profiles/public/default.json`

Ignored private folders:

- `assistant/profiles/private/`
- `assistant/voices/private/`
- `assistant/memory/private/`
