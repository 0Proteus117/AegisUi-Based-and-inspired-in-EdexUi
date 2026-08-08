# AegisUi Light Mode

## Controls

Open the existing Settings modal and set `aegisAppearance` to:

- `system` — follow macOS live; this is the fallback when no preference exists.
- `light` — keep the AegisUi light cockpit active.
- `dark` — keep the approved dark cockpit active.

The preference is written only to the established local `settings.json`.

## Design rules

Light Mode is a deliberate cool white/blue-gray interface, not a colour
inversion. It retains AegisUi’s cyan hierarchy, compact tactical borders,
status colours, dark terminal canvas and dense workspace layout. Controls use
styled surfaces and focus glows rather than browser-default white fields.

## Surface classification

Ordinary cards and controls resolve through semantic surface roles. This
includes HUB map layer controls, Project Timeline cards, Apple Music
diagnostics/playlists, Calendar picker rows and application tiles. The terminal
and map/canvas visualization remain intentionally dark because they are
content surfaces rather than floating cockpit cards.

The same rule applies to nested workspace cards and dialogs: navigation tiles,
Launch Bay cards, ENG tool/detail views, Project Control, DEV status rows,
AGENT task cards, OSINT dialogs and Assistant overlays use the semantic light
surfaces. Modal backdrops remain dimmed for focus, but their content is never
left as a legacy black rectangle. This includes Map Layer Settings and its
custom select menu. Terminal, map, media and technical preview canvases remain
deliberately dark visual surfaces.

## Safety boundary

Changing appearance does not open links, call providers, invoke OSINT adapters,
write Cases/Evidence, export files, create IPC or alter any stored local data.
