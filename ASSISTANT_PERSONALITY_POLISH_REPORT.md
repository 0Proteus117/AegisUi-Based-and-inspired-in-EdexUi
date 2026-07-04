# Assistant personality polish report

Phase: `v2.1.5 assistant personality polish`

## Files modified

- `src/classes/assistant/assistantPersonality.class.js`
- `src/classes/assistant/assistantMicrocopy.class.js`
- `src/classes/assistant/assistantSettings.class.js`
- `src/classes/assistant/assistantPanel.class.js`
- `src/classes/assistant/assistantPresence.class.js`
- `src/assets/css/assistant-presence.css`
- `src/assets/css/assistant-panel.css`
- `assistant/profiles/public/*.json`
- `assistant/profiles/private/*.example.json`
- `ASSISTANT_SYSTEM.md`
- `ASSISTANT_PERSONALITY.md`
- `CONFIGURATION.md`
- `README.md`
- `CHANGELOG.md`

## UI integration point

Assistant Presence is loaded from `src/ui.html` and mounted globally by
`AssistantPresence`. The new personality layer is loaded before settings and
microcopy so the panel, orb and bridge placeholder share the same active
profile.

## Current settings

- Assistant mode: `public` or `private`
- Active assistant: `ares` or `aphrodite`
- Private aliases: Gustav / Angie
- Voice provider shell: not configured, default robotic, local custom or
  Google Emotional TTS planned
- Backend placeholders: assistant, voice, command router and memory are
  offline in this build

## Current states

`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `MUTED`, `OFFLINE`, `ERROR`

## Regression risks

- Public mode must not expose private names.
- Manual input must not imply LLM, command routing or execution.
- Voice settings must remain shell-only.
- Orb animation changes must stay CSS-light and not interfere with fullscreen
  map or other cockpit layers.
