# OSINT Geo Query Model

`src/classes/workspaces/osintGeospatialVerification.class.js` owns the local
input contract. Accepted values are:

- decimal `latitude, longitude` pairs using decimal points;
- common DMS values with explicit hemispheres;
- a short public place text.

The model rejects out-of-range coordinates, control characters, URLs, script
content, long strings and coordinate-like strings that would otherwise be
ambiguous. There is no guessed coordinate order and no query history persisted
outside explicit Case evidence.

The approved adapter accepts only `{ kind: "PLACE_TEXT", query }`. It builds a
GET request only for `https://geocoding-api.open-meteo.com/v1/search`, with a
bounded result count. No arbitrary URL, header, method, credential, proxy or
bulk input can cross this boundary. A request has an AbortController; stale or
cancelled completion cannot replace the current visual state.
