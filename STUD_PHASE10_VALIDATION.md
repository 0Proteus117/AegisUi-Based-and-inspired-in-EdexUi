# STUD Phase 10 Validation

## Architecture audit

Phase 10 reuses the schema-v10 Academic Context Package tables and the STUD
IPC allowlist. No second database, localStorage academic store, legacy runtime
connection or `_boot.js` change is required. Citation.js remains declared in
`src/package.json` and its lockfile; the local AI feature adds no package.

## Focused automated checks

`scripts/test-stud-academic-ai.js` validates selected-text packages,
package-restricted retrieval, local-only model status, prompt-injection data
handling, accepted source mappings, explicit Note persistence, explicit
Revision acceptance, invalid-input fail-closed behaviour, absence of generic
execution/network primitives and cancellation.

Existing Academic Intelligence and Command Center suites validate schema-v10
packages, discipline-neutral fixtures, coverage/provenance, bounded scale and
renderer/IPC layout contracts.

## Manual visual matrix

The release validation uses synthetic academic records only and covers the AI
workspace at 1680x1050 dark, 1440x900 light/system and 1200x780 compact. It
checks package inspection, unavailable local engine, grounded response, source
trace, limitations, explicit save surface and bounded long content.

## Limitations

Ollama availability is local environment state. A model is never downloaded
and no network fallback exists. The model's prose is not automatically
considered correct; only the visible canonical source trace gives the user a
reviewable local basis.
