# STUD M1-M3 integration and final technical audit

Date: 2026-08-24
Audited chain: Course -> Assignment -> Requirements Contract -> Working Context
-> Workflow Instance -> nodes/dependencies/events

## Audit method

The audit inspected migrations v15-v17, domain repositories/services, fixed IPC
and preload allowlists, renderer surfaces, persistence/restart tests, synthetic
discipline fixtures, scale results and live Electron layouts. Findings below
were recorded before the correction pass.

## Authority map

- Course and Assignment identity: canonical STUD tables.
- Current approved Requirements Contract: explicit Assignment pointer managed by
  the M1 repository/service.
- Academic selection: one M2 Working Context row validated in main process.
- Workflow structure/state: M3 repository/service over normalized v17 tables.
- Readiness: derived from the persisted graph in the M3 domain model.
- UI: presentation and typed requests only; it is authoritative for none of the
  above.

No duplicate Assignment, Contract, context or workflow authority was found.
Requirements state and workflow state remain independent: a workflow node does
not satisfy a Requirement.

## Findings recorded before correction

### MAJOR — exact Contract selection absent from setup

The domain accepted an explicit approved historical Contract revision, but the
initial renderer only showed the current revision. This contradicted the M1/M3
contract and made exact user selection unavailable.

Correction: setup now lists de-duplicated approved/superseded immutable
revisions and sends the selected Contract ID through the fixed typed API. Tests
verify the exact historical ID/hash is retained.

### MAJOR — historical workflow lifecycle had no product transition

The schema could represent historical instances and the read API could hydrate
them, but the user could neither create a replacement nor inspect prior work.

Correction: explicit replacement requires current workflow ID, expected row
version and bounded reason. One transaction marks the old instance historical,
records `WORKFLOW_REPLACED` and creates the new current instance without copying
activity. Prior instances are shown under progressive disclosure.

### MAJOR — lifecycle/current consistency relied only on service code

`lifecycle` and `is_current` were individually constrained but an invalid pair
could be inserted by privileged code.

Correction: schema v17 now constrains `ACTIVE + current` and
`HISTORICAL/ARCHIVED + not-current` as valid pairs. Service validation and the
partial unique Assignment current index remain in place.

### MINOR — impossible reopen action was rendered

The main process correctly rejected reopening a predecessor after descendant
progress, but the derived action list still offered the button.

Correction: derived actions now suppress `REOPEN` whenever any descendant has
progress. The authoritative transition guard remains and is tested adversarially.

### MINOR — Contract selector could escape its grid

The native selector in advanced replacement/setup did not have an explicit
bounded width.

Correction: selector width, minimum width and box sizing are constrained. Live
layout probes show zero escaped controls.

### MINOR — large target viewport left the workflow in half a STUD deck

At 1680x1050 the fixed shell sidebar reduced usable width while the media query
still retained the Assignment list/detail columns, producing avoidable empty
space beside the long workflow.

Correction: Assignment list/detail collapses before the shell-constrained deck
becomes narrow. The workflow remains full-width at all required target sizes.

### BLOCKING FOR RELEASE — public capture included local terminal identity

The first full-window synthetic capture included the shell terminal and local
username. The STUD fixture itself was synthetic, but that screenshot was not
safe to publish.

Correction: all images were regenerated from a bounded STUD-deck clip. No
full-window image is retained for the release.

## Post-correction integrity

- BLOCKING: 0
- unresolved MAJOR: 0
- unresolved MINOR: 0
- OBSERVATION: M4 execution/blocker/checkpoint semantics intentionally absent

Contract supersession and source drift do not mutate a workflow snapshot.
Replacing a workflow does not mutate or delete the prior graph/history. Stale
Working Context references are cleared rather than rebound. A renderer cannot
write state directly or bypass graph validation.

## Discipline and manual-data audit

The same canonical model passed synthetic Engineering, Humanities,
Law/Criminology, Social Science, group-project, exam and generic/manual cases.
Manual Assignments do not require Moodle. Institution-specific module codes,
DOIs, equations or LMS identifiers are not required by the workflow schema.

## Security and privacy audit

- `nodeIntegration: false`; `contextIsolation: true`.
- no `@electron/remote`, raw `ipcRenderer`, generic filesystem, shell or network
  proxy.
- IDs, edge endpoints, transitions, Contract references, bounds and row versions
  are validated in main process.
- context/workflow changes invoke no provider and no AI.
- template and workflow event payloads are bounded.
- no Moodle data, credentials, local profile or private academic material is in
  fixtures or release screenshots.

## Residual intentional limitations

- No blocker, waiting, human-input runtime, checkpoint or recovery model exists;
  those belong to M4.
- No automated execution or Mission Control exists.
- A replacement is explicit and creates a fresh plan; M3 does not reconcile node
  state between Contract/template revisions.
- Topology becomes immutable after work starts. This avoids silent history/graph
  divergence; later change policy requires an explicit future milestone.

These limitations do not contradict M3 acceptance and are not classified as
defects.
