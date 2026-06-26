# Workspace navigation

AegisUi now has enough workspaces that a fixed equal-width tab bar no longer
scales well. The v1.8.1 navigation update keeps the cockpit feel while making
the top bar able to grow.

## Decision

Use a two-zone navigation bar:

1. `HUB` remains pinned and always visible.
2. Every other workspace lives in a compact horizontal rail.

The rail uses short labels, native tooltips and subtle horizontal scrolling.
This keeps the interface readable without hiding the command deck behind a
generic mobile-style menu.

## Current compact labels

| Workspace | Compact label |
| --- | --- |
| HUB | HUB |
| ENGINEER | ENG |
| OSINT | OSINT |
| STUDENT | STUD |
| ARTIST | ART |
| BUSINESS | BUS |
| COMMS | COMMS |
| LAUNCH BAY | BAY |
| DEVELOPER | DEV |
| AGENT COMMAND | AGENT |

## Keyboard shortcuts

The first nine workspaces use `Command + Option + 1…9`.

The tenth workspace uses:

```text
Command + Option + 0
```

## Behavior

- The active workspace remains visually clear with a blue cockpit underline and
  glow.
- The active non-HUB button scrolls into view automatically.
- Hovering a button shows the full workspace name and shortcut through the
  native tooltip.
- The last active workspace is still remembered through local storage.
- The modal context-preservation behavior remains unchanged: modals must not
  force the app back to `HUB`.

## Why not a dropdown first?

A dropdown would reduce visible clutter, but it would also hide the command
deck. AegisUi benefits from visible mode awareness: the user should always
know that ENGINEER, DEVELOPER, AGENT COMMAND and the other decks exist.

The compact rail is a better first scaling step because it:

- preserves direct one-click access;
- keeps `HUB` anchored;
- supports more workspaces without shrinking text indefinitely;
- does not require a larger navigation rewrite;
- remains visually close to the cockpit language.

## Future options

If the workspace count grows significantly, the next layer should be optional
favorites or grouped filters, for example:

- CORE: HUB;
- OPS: OSINT, BUSINESS, COMMS;
- BUILD: ENGINEER, DEVELOPER, AGENT COMMAND;
- CREATIVE: STUDENT, ARTIST, LAUNCH BAY.

That should be added only if the rail becomes genuinely crowded.
