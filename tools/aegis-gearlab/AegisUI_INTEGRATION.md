# AegisUi integration

GearLab is a local service at `http://127.0.0.1:8765`. AegisUi treats it as a special ENG tool, not as UI-owned CAD logic.

## Endpoints

- `GET /health`
- `GET /capabilities`
- `POST /generate/spur-external`
- `POST /generate/spur-internal`
- `POST /generate/internal-gear-pair`
- `POST /generate/helical-external`
- `POST /generate/herringbone-external`
- `GET /exports/{filename}`
- `POST /cleanup/exports`
- `GET /docs`

```js
async function generateSpurExternal(params) {
  const response = await fetch("http://127.0.0.1:8765/generate/spur-external", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    throw new Error("Gear generation failed");
  }

  return await response.json();
}
```

## UI contract

The ENG fullscreen tool uses three areas:

1. Parameter panel with validated technical inputs.
2. Vector preview of pitch/base/root/addendum circles.
3. Warnings, fatal errors and generated exports.

Warnings never masquerade as errors. A warning response can still expose STEP/report files. Fatal errors use `{status, code, message, details}` and block export. `CAD_BACKEND_UNAVAILABLE` directs the user to `setup_mac.sh` and never produces fake output.

The UI checks `/health`, then `/capabilities`. It displays `API OFFLINE`, `API STARTING`, `API READY`, `CAD BACKEND MISSING` or `ERROR`. When the API is offline, HUB and ENG continue running normally.

Generated links are relative API paths. The UI can show the filenames and open the local exports directory. Direct download is available by joining the base URL with the returned path.

The fixed `START API` action is allowlisted to GearLab's own `run_api.sh`; it is not a general shell bridge. In packaged builds the module is included under app resources. If the local venv is absent, setup instructions remain available instead of silently installing software.

