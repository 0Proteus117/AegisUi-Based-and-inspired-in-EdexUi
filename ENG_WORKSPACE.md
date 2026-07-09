# ENG Workspace — Engineering Command Deck

Version: v2.2.3

The ENG workspace is a specialized engineering command deck for mechanical/product engineering work. It is a workspace tab, not a user account system.

## Scope

ENG provides:

- CAD/CAM/design launchers;
- CAE/simulation launchers and web references;
- manufacturing and 3D printing launchers;
- local quick calculators;
- material quick cards;
- research/documentation links;
- standards references;
- project status reused from the HUB Project Timeline.

## Tool registry

Tools are defined in:

`src/classes/workspaces/engineeringTools.registry.js`

Each tool includes:

- `id`
- `title`
- `category`
- `type`: `app`, `web`, `internal`, `planned`
- `icon`
- `description`
- `status`
- app aliases or URL/action id
- fullscreen/detail support
- command-router support flag

## App detection

ENG uses the existing macOS application index and safe launcher flow. Missing apps show `NOT FOUND` and do not crash the UI. If a web/info URL exists, the user can open that safely in the external browser.

No arbitrary shell execution is used.

## Internal tools

Implemented local calculators:

- Unit Converter
- Torque / Power / RPM
- Material Mass Estimator
- Gear Ratio
- Beam Deflection quick calculator
- Thread / Drill Chart

These run locally and do not require cloud services.

In v2.2.3 the calculators use cockpit-styled controls:

- dark AegisUi number inputs and selects;
- synchronized sliders and numeric inputs;
- live result readouts;
- reset/copy controls;
- representative diagrams for gears, beams, torque/RPM, mass estimation, unit
  conversion and thread references.

## Detail / fullscreen

Tool cards and categories support an ENG detail overlay. It closes with X, ESC,
or outside click. Internal clicks do not close the overlay.

Calculator detail views show the larger diagram, controls, formula/context and
result readout in the same fullscreen/detail shell.

## Future expansion

Planned:

- CAD file indexing;
- real simulation runners;
- BOM generator;
- material database import;
- part library;
- deeper Fusion/FreeCAD integration;
- safe command-router approvals for engineering workflows.
