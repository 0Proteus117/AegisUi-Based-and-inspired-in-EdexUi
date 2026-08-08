# AegisUi Theme Architecture

## Scope

The appearance system controls visual presentation only. It does not change
workspace data, providers, OSINT policy, network behavior, IPC, local cases,
evidence, exports or command-router authority.

## One persisted preference

`settings.json` remains the sole local preference store. The `aegisAppearance`
field accepts `system`, `light` or `dark`; missing or invalid values resolve to
`system`. The existing `theme` field continues to select the legacy terminal
theme and is not repurposed.

## Resolution

The renderer resolves `system` with `prefers-color-scheme`, applies
`data-aegis-appearance` to the document root and listens for macOS appearance
changes while System is selected. Manual Light and Dark selections override
that media change. No reload, provider reconnect or data mutation is required.

## Tokens and compatibility

`src/assets/css/aegis_theme.css` loads after all component sheets. It defines
semantic Aegis tokens and provides a scoped compatibility bridge for inherited
`--color_*` variables. The bridge avoids a destructive stylesheet rewrite and
keeps Dark Mode as the approved baseline.

## Intentional dark content

The terminal canvas continues to use its selected terminal-theme palette in
all appearance modes. This is an intentional content-surface decision, not a
partial implementation of Light Mode.

## Structural OSINT protection

The theme layer styles existing Cases/Evidence layout regions without changing
their DOM, storage, integrity, redaction, provider policy or action handlers.
The v2.4.0 content-flow layout contract remains tested separately.
