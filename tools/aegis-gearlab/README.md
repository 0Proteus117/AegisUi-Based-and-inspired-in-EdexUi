# Aegis GearLab

Aegis GearLab is a local, modular engineering API for parametric gear geometry. It is embedded in the AegisUi repository but its CAD engine is deliberately isolated from the Electron UI. The API uses real involute mathematics and CadQuery/OpenCascade, with STEP as the primary output.

Version: `0.1.0`  
Local URL: `http://127.0.0.1:8765`

## Current generators

- External spur gear.
- Internal spur ring gear.
- Internal ring/pinion assembly.
- External helical gear using an involute loft strategy.
- External herringbone gear using opposing involute lofts.

STEP is the priority format. STL, DXF and JSON geometry reports are available through the same export layer. Helical and herringbone output carries an explicit approximation warning because its two-section loft is not yet a production tooth-surface solver.

## macOS setup

Python 3.11 or newer is required. Python 3.12 is preferred for current CadQuery wheels.

```bash
cd tools/aegis-gearlab
chmod +x setup_mac.sh run_api.sh
./setup_mac.sh
./run_api.sh
```

The installer creates the real environment under `~/Library/Application Support/EdexUi-Eng/aegis-gearlab/.venv`, links the ignored local `.venv`, installs FastAPI/Uvicorn/Pydantic/CadQuery/pytest and prepares the ignored `exports/` directory. This avoids FileProvider offloading and keeps the same environment usable by the unpackaged project. Runtime remains local after installation; the API binds only to `127.0.0.1`.

If CadQuery cannot be installed, schemas and mathematics remain testable and generation returns `CAD_BACKEND_UNAVAILABLE`. GearLab never substitutes decorative fake geometry.

## API examples

```bash
curl http://127.0.0.1:8765/health
curl http://127.0.0.1:8765/capabilities

curl -X POST http://127.0.0.1:8765/generate/spur-external \
  -H 'Content-Type: application/json' \
  --data @examples/spur_external_example.json
```

Generated responses contain relative export links such as `/exports/pinion_test_....step`:

```bash
curl -O http://127.0.0.1:8765/exports/<generated-filename>.step
```

Interactive local documentation is available at `http://127.0.0.1:8765/docs`.

## Tests

```bash
.venv/bin/python -m pytest
```

Tests cover health/capabilities, schemas, gear mathematics, involute generation, internal-pair centre distance, warnings, safe filenames, reports and real CAD exports when the backend is present.

## Boundaries

GearLab currently reports geometry only. It does not calculate torque capacity, fatigue life, Hertzian contact stress, root bending stress, lubrication, thermal growth, tolerances or manufacturing capability. Warnings are engineering review prompts, not certification.

> Generated geometry must be reviewed before manufacturing. This tool does not yet replace professional gear calculation software such as KISSsoft, eAssistant, MESYS or equivalent.

See [ROADMAP.md](ROADMAP.md) and [AegisUI_INTEGRATION.md](AegisUI_INTEGRATION.md).
