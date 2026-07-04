# Assistant Memory

`v2.1.6` adds the first local private memory bootstrap for AegisUi Assistant.

This memory system is intentionally offline and local:

- v2.1.7 can pass a limited memory context to local Ollama written chat;
- no FastAPI service is connected;
- no embeddings are generated;
- no ChromaDB/vector database is connected;
- no retrieval pipeline is connected;
- no command router is connected;
- no voice/STT/TTS is connected.

## What is committed

Only public structure and redacted examples are committed:

- `assistant/memory/README.md`
- `assistant/memory/bootstrap/schema.json`
- `assistant/memory/bootstrap/public_examples/*.redacted.md`
- loader code;
- installer/test scripts;
- documentation.

## What is private

Real memory lives locally in:

```text
assistant/memory/private/
```

That folder is ignored by Git and must not be committed.

After installation, the app reads the local copy from:

```text
~/Library/Application Support/EdexUi-Eng/assistant/memory/bootstrap/
```

## Install

```sh
node scripts/install-assistant-bootstrap-memory.js
```

The installer:

- copies the private bootstrap into userData;
- creates a timestamped backup if a previous bootstrap exists;
- does not delete private memory silently;
- prints source, destination and copied-file count.

## Test

```sh
node scripts/test-assistant-memory-bootstrap.js
```

The test checks:

- public schema exists;
- private bootstrap exists locally;
- private bootstrap is ignored by Git;
- private bootstrap is not tracked;
- install script works;
- userData contains the installed copy;
- loader reports `READY`;
- `.env` and `.env.local` are not staged.

## Assistant UI

Assistant Settings now includes a `MEMORY` section:

- Status;
- Source;
- Files;
- Bootstrap installed/not installed;
- Index status;
- Embeddings status;
- Retrieval status;
- brief title-only preview.

The UI does not display the full private memory content.

## Future phases

Added in `v2.1.7`:

- local written chat through Ollama;
- optional bootstrap memory injection into the local system prompt;
- no embeddings, indexing or retrieval yet.

`v2.1.8` does not change the private memory format. It only improves the
Local AI status/UX around Ollama availability and panel input handling.

Planned, not implemented yet:

- local memory index;
- retrieval;
- embeddings;
- safe command router;
- voice shell.
