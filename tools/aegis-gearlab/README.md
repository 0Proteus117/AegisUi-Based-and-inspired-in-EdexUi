# Aegis GearLab

Aegis GearLab is a standalone local engineering tool for parametric gear
generation and STEP-first export.

It lives under `tools/aegis-gearlab/` and does not load inside the AegisUI
runtime in v2.2.8.

## What it does

- Runs a local FastAPI service at `http://127.0.0.1:8765`.
- Serves a standalone local UI at `http://127.0.0.1:8765/ui`.
- Provides schemas, validation, warnings, reports and export management.
- Generates external spur gears as STEP when CadQuery/OpenCascade is available.
- Produces JSON geometry reports when requested.
- Keeps generated exports under `tools/aegis-gearlab/exports/`.

## What it does not guarantee

Generated geometry must be reviewed before manufacturing. This tool does not
yet replace professional gear calculation software such as KISSsoft, eAssistant,
MESYS or equivalent.

GearLab v0.1.0 does not calculate strength, root bending stress, Hertzian
contact stress, lubrication, heat, noise, life, tolerance stack-up or real load
capacity.

## Install on macOS

```bash
cd tools/aegis-gearlab
chmod +x setup_mac.sh run_api.sh run_ui.sh
./setup_mac.sh
```

The setup script creates a virtual environment in:

`~/Library/Application Support/EdexUi-Eng/aegis-gearlab/.venv`

CadQuery is attempted as an optional CAD backend. If it cannot be installed, the
API can still run and returns `CAD_BACKEND_UNAVAILABLE` for CAD export requests.

## Run API

```bash
cd tools/aegis-gearlab
./run_api.sh
```

Open:

`http://127.0.0.1:8765/ui`

## API examples

Health:

```bash
curl http://127.0.0.1:8765/health
```

Capabilities:

```bash
curl http://127.0.0.1:8765/capabilities
```

Generate a spur external gear:

```bash
curl -X POST http://127.0.0.1:8765/generate/spur-external \
  -H "Content-Type: application/json" \
  -d @examples/spur_external_example.json
```

## Supported architecture

- Spur external: implemented when CadQuery is available.
- Spur internal: implemented when CadQuery is available.
- Internal gear pair: implemented when CadQuery is available.
- Helical external: partial approximation.
- Herringbone external: partial approximation.
- Bevel, worm, rack/pinion, planetary: schemas and planned endpoints only.

Unimplemented generators return `NOT_IMPLEMENTED`. GearLab does not export fake
CAD and label it as usable geometry.

## Standalone boundary

This module must not be imported from AegisUI `src/` in v2.2.8. It must not add
ENG cards, command router actions, Electron resources or runtime services.
