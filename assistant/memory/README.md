# Assistant memory

This folder separates public memory documentation and examples from private
local memory.

Committed files:

- `bootstrap/schema.json`
- `bootstrap/public_examples/*.redacted.md`
- this README

Ignored local files:

- `assistant/memory/private/`

Private bootstrap memory can be installed into the macOS app data folder with:

```sh
node scripts/install-assistant-bootstrap-memory.js
```

The installed copy lives in:

```text
~/Library/Application Support/EdexUi-Eng/assistant/memory/bootstrap/
```

This phase does not connect an LLM, embeddings, ChromaDB, retrieval, STT, TTS
or command execution.
