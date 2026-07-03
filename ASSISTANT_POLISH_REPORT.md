# Assistant Polish Report

## v2.1.1 visual/personality audit

ASSISTANT CURRENT:

- orb files:
  - `src/classes/assistant/assistantPresence.class.js`
  - `src/assets/css/assistant-presence.css`
- panel files:
  - `src/classes/assistant/assistantPanel.class.js`
  - `src/assets/css/assistant-panel.css`
- settings files:
  - `src/classes/assistant/assistantSettings.class.js`
  - `assistant/config/assistant-settings.example.json`
- state machine files:
  - `src/classes/assistant/assistantState.class.js`
- personality/microcopy files:
  - `src/classes/assistant/assistantMicrocopy.class.js`
  - `ASSISTANT_PERSONALITY.md`
- integration point:
  - CSS and scripts are loaded in `src/ui.html`.
  - `window.assistantPresence = new AssistantPresence()` is mounted from
    `src/_renderer.js`.
- known issues:
  - Assistant backend is intentionally offline.
  - Speech-to-text and real voice are intentionally not connected.
  - The voice provider selector is a shell for future work only.
  - Manual input only exercises local state and placeholder responses.

No map provider, runtime boot code or terminal backend code is changed in this
phase.
