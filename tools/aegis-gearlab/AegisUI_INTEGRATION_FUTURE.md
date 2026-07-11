# AegisUI Integration Future

Aegis GearLab is intentionally standalone in v0.1.0 / AegisUI v2.2.8.

Current rule:

- Do not load GearLab from the AegisUI renderer.
- Do not add GearLab to the ENG registry.
- Do not add GearLab to the assistant command router.
- Do not start the GearLab API with AegisUI.
- AegisUI must run normally if Python, CadQuery or GearLab are missing.

Future integration may use this local base URL:

`http://127.0.0.1:8765`

Future safe endpoints:

- `GET /health`
- `GET /capabilities`
- `GET /ui`
- `POST /generate/spur-external`
- `GET /exports/{filename}`

Future fetch example:

```js
async function generateSpurExternal(params) {
  const response = await fetch("http://127.0.0.1:8765/generate/spur-external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw payload;
  }
  return payload;
}
```

Future UI mapping:

- left: parameters;
- center: technical preview;
- right: warnings, errors and exports.

Future warnings should be shown as non-fatal engineering warnings. Fatal API
errors must block export and must not be disguised as successful geometry.

Risk note:

The broken v2.2.7 release proved that direct runtime integration can contaminate
HUB, ENG, music and map loading. Future integration must be behind a narrow,
optional, failure-isolated boundary.
