# Workspace navigation

AegisUi now has enough workspaces that a fixed equal-width tab bar or a long
horizontal rail no longer scales comfortably. The v1.9.6 navigation update
keeps the cockpit feel while making the top bar easier to read and safer to
grow.

## Decision

Use a three-part command selector:

1. `HUB` remains pinned and always visible.
2. The current workspace is shown as a larger active-deck readout.
3. `ALL DECKS` opens a cockpit-style selector pop-up with every workspace.

This avoids shrinking labels into unreadable tabs while still keeping the user
oriented. It also leaves room for future workspaces without turning the top
bar into visual noise.

## Selector groups

| Group | Workspaces |
| --- | --- |
| Core | HUB |
| Build / Engineering | ENGINEER, DEVELOPER, AGENT COMMAND |
| Operations / Comms | OSINT, BUSINESS, COMMS |
| Study / Creative / Play | STUDENT, ARTIST, LAUNCH BAY |

## Keyboard shortcuts

The first nine workspaces use `Command + Option + 1…9`.

The tenth workspace uses:

```text
Command + Option + 0
```

## Behavior

- The active workspace remains visible in the top bar.
- `HUB` is always one click away.
- The selector uses larger readable cards, deck icons and grouped sections.
- Hovering a deck still shows the full workspace name and shortcut through the
  native tooltip where available.
- The last active workspace is still remembered through local storage.
- The modal context-preservation behavior remains unchanged: modals must not
  force the app back to `HUB`.
- Pressing `Escape` closes the selector without changing workspace.

## Why replace the compact rail?

The compact rail was a good first scaling step, but once COMMS, LAUNCH BAY,
DEVELOPER and AGENT COMMAND were added it made the cockpit feel too busy. The
selector pattern is more comfortable because it:

- keeps `HUB` anchored;
- shows the current deck clearly;
- avoids tiny text and horizontal scroll hunting;
- supports future decks without redesigning the top bar again;
- keeps the visual language technical instead of using a generic mobile menu.

## Future options

If the workspace count grows significantly again, the next layer should be
optional favorites or user-configured deck ordering. That should be added only
after real usage shows which decks are daily tools and which are occasional.
