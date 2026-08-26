# STUD M1–M4 Integration Audit

Audit point: after focused M4 tests and before integration. Scope is the current
Requirements Contract, Working Context, persistent Workflow DAG and M4
conditions. The audit stopped feature development and did not begin M5.

## Result

| Severity | Open | Corrected in M4 |
|---|---:|---:|
| BLOCKING | 0 | 0 |
| MAJOR | 0 | 2 |
| MINOR | 0 | 4 |
| OBSERVATION | 3 | n/a |

## Corrected findings

### MAJOR — terminal stages accepted new conditions

Creating a blocker/checkpoint on `COMPLETE` or `SKIPPED` work could have made a
historical terminal decision appear unavailable after the fact. Creation now
fails with `INVALID_TRANSITION`; the user must explicitly reopen the M3 stage
before adding a condition. Focused regression covers both blocker and checkpoint.

### MAJOR — representative migration tests did not remove schema v18 objects

M1–M3 legacy-database fixtures were written before M4 and could leave v18 tables
behind while replaying earlier migrations. Their fixture teardown now removes
v18 condition tables and migration records in dependency order. The Phase 14
reproducibility test now includes M4 tables in representative v9/v12 replay.

### MINOR — IPC inventory omitted registered M4 channels

Handlers and preload entries existed, but the exported `CHANNELS` inventory did
not include them. The fixed channel list now matches registration and preload;
the M4 IPC test enforces this contract.

### MINOR — replaced rejected checkpoints were overcounted in UI

The header counted all rejected checkpoints although a pending/approved explicit
follow-up had replaced the gate. It now displays the derived active gate count,
while still showing full history.

### MINOR — blocker type was not correctable in edit UI

The main service supported validated type changes but the UI rendered a readonly
field. It now offers only the bounded M4 taxonomy.

### MINOR — broad regression/release health omitted M4 contracts

The aggregator and release-health inventory now include domain, IPC, scale and
validation-document checks for M4.

### TEST-ONLY — Electron optional dependency checked in wrong lockfile

The Phase 14 reproducibility test looked for Electron's optional `undici` in the
renderer `src/package-lock.json`. Electron belongs to the application root. The
test now reads the root lock for Electron and retains the src lock checks for
Citation.js. Runtime behaviour and dependencies were not changed.

## Integration observations

1. **State separation is coherent.** Node work state is persisted by M3;
   readiness and M4 availability are derived. There is no second blocker
   authority or copied descendant blocker row.
2. **Recovery is intentionally limited.** Restart restores canonical state and
   recomputes availability. Worker runtime cursors, heartbeats and autonomous
   resume are absent and remain reserved for M13.
3. **M5 can consume the contract.** The Assignment Workspace can use the current
   Workflow, selected node, `conditions`, derived `availability` and
   `impactSources` without changing topology or inventing progress.

## Contract-by-contract result

- **M1:** exact Contract revision/hash remains immutable and linked; later
  Contract revisions do not rewrite an existing Workflow or condition.
- **M2:** Working Context remains one validated canonical pointer. Missing or
  unrelated objects fail closed. No context/condition action invokes providers
  or AI.
- **M3:** DAG acyclicity, topology lock, work-state lifecycle, stable node IDs,
  historical replacement and ordered event history remain authoritative.
- **M4:** multiple conditions are independent; propagation is transitive and
  scoped; resolution is explicit and concurrency protected; human decisions
  remain separate from work completion.

## Residual known boundaries

- OBSERVATION: generic provenance records are existence-validated; exact
  Requirement and canonical object links carry the stronger Assignment/Contract
  scope validation used by M4.
- OBSERVATION: the event journal is an audit feed, not runtime-worker recovery.
- OBSERVATION: external Map checks still depend on valid TomTom/AIS credentials;
  these inherited failures are unrelated to M1–M4.

No justified BLOCKING or MAJOR finding remains open. M5 was not implemented.
