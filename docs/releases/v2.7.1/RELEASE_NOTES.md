# AegisUi v2.7.1 — STUD Assignment Workflow Engine Foundation

This release closes the M1–M3 foundation of the STUD Assignment Workflow Engine. It combines reviewed Requirements Contracts, academic organisation and persistent Working Context with a validated, assignment-owned workflow DAG.

## What is validated

- Requirements Contracts retain immutable approved revisions, exact source provenance, drift detection and explicit incomplete approval.
- Academic years, terms, courses and assignments form a canonical, user-correctable Working Context.
- Five versioned workflow templates instantiate independent persistent DAGs without changing their source template or Requirements Contract.
- Node readiness is derived from dependencies; state transitions, graph changes and workflow replacement are validated in the main process and recorded as durable events.
- Branching, convergence, skips, safe reopening, optimistic concurrency and historical workflow inspection are supported.
- Electron remains hardened with `nodeIntegration: false`, `contextIsolation: true`, no raw `ipcRenderer`, no `@electron/remote` and no generic filesystem, shell or network bridge.

## Deliberate boundaries

This release does not implement M4 blocker, waiting, human-input, checkpoint or recovery semantics. It does not provide Mission Control, autonomous execution, automatic research, AI-generated workflows or university submission.

## Validation

- Fresh schema v17 and v16 migration paths.
- Focused M1, M2 and M3 domain/IPC tests.
- Synthetic scale: 100 courses, 1,000 assignments, 300 workflows, 1,860 nodes, 1,620 edges and 600 events.
- Dark, Light, System→Dark and System→Light at 1680×1050, 1440×900 and 1200×780.
- Fresh Apple Silicon package, mounted-volume launch, final `app.asar`, Calendar helper, Citation.js, node-pty, Moodle boundary, Ollama loopback and renderer trust-boundary checks.

## Known environment limitations

- TomTom provider validation returns HTTP 401 with the current external credential.
- AIS validation is unavailable when `AISSTREAM_API_KEY` is absent.
- Celestrak/SAT validation may be skipped when its external environment is unavailable.

## Screenshots

### Working Context — Dark

![Working Context Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/01-working-context-dark.png)

### Workflow setup — Light

![Workflow setup Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/02-workflow-setup-light.png)

### Active persistent DAG — Dark

![Active workflow DAG Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/03-active-dag-dark.png)

### Branched and converged workflow — System Dark

![Branched workflow System Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/04-branched-dag-system-dark.png)

### Historical workflow — System Light

![Historical workflow System Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/05-historical-workflow-system-light.png)

### Skipped stage — Light

![Skipped workflow stage Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/06-skipped-stage-light.png)

### Compact long workflow — Dark

![Compact long workflow Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.7.1/docs/releases/v2.7.1/screenshots/07-compact-long-workflow-dark.png)

## Next milestone

M4 — Blockers, Checkpoints and Recovery.
