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

## Safety boundary

Changing appearance does not open links, call providers, invoke OSINT adapters,
write Cases/Evidence, export files, create IPC or alter any stored local data.
