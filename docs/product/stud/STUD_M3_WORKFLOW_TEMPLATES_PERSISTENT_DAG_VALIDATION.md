# STUD M3 — Workflow Templates and Persistent DAG validation

Date: 2026-08-24
Baseline: `feature/systems-online-pass` at `58f938a`
Canonical schema: v17

## Implemented boundary

M3 adds a persistent, validated Assignment work plan. It defines structure,
dependency state and meaningful user-recorded transitions. It does not execute
research, call Moodle/Ollama, generate artifacts, infer completion, implement
blockers or provide Mission Control.

The domain path is:

```text
Assignment renderer
  -> fixed stud-workflow-* preload channel
  -> trusted-sender IPC handler
  -> StudWorkflowService
  -> StudWorkflowRepository
  -> canonical STUD SQLite v17
```

The renderer has no SQLite, Node, filesystem, shell or network authority.

## Schema v17

Migration v17 is transactional and adds:

- `stud_workflow_templates`
- `stud_workflow_template_versions`
- `stud_workflow_template_nodes`
- `stud_workflow_template_edges`
- `stud_workflow_instances`
- `stud_workflow_nodes`
- `stud_workflow_edges`
- `stud_workflow_events`
- nullable `active_workflow_id` and `active_workflow_node_id` references on
  `stud_working_context`

Existing Assignments receive no workflow, template selection, node, state or
history. A workflow instance has exactly one of:

- an approved Contract ID + revision + hash; or
- an explicit bounded no-Contract reason.

Only one instance is current for an Assignment. Lifecycle/current consistency
is also constrained in SQLite. Explicit replacement marks the old instance
`HISTORICAL` and creates the new current instance in one transaction.

## Templates and instances

The registry provides five initial templates:

1. Standard written coursework
2. Technical / engineering coursework
3. Exam preparation
4. Group / project work
5. Generic / manual

Templates are immutable by `(template, version)`. Canonical JSON and SHA-256
fingerprint drift under the same version fails with
`TEMPLATE_REGISTRY_DRIFT`. Assignment instances copy normalized nodes and edges
from the selected version and retain its fingerprint. Later registry changes do
not rewrite existing instances.

Template suggestions are deterministic and correctable. They can use M2's
assessment classification and reviewed Requirement types; they never create a
workflow automatically.

## DAG and state contract

Stable node IDs, not titles, own dependencies and history. Renaming a node does
not change its identity.

Persisted node states:

- `NOT_STARTED`
- `IN_PROGRESS`
- `COMPLETE`
- `SKIPPED`

`READY` is derived. A `NOT_STARTED` node is ready only when all predecessors are
`COMPLETE` or `SKIPPED`. Workflow completion means every node is terminal; the
UI reports exact terminal and skipped counts and does not call them a percentage.

Main-process transitions are:

- derived `READY` -> `IN_PROGRESS`
- `IN_PROGRESS` -> `COMPLETE`
- derived `READY` or `IN_PROGRESS` -> `SKIPPED`
- `COMPLETE` or `SKIPPED` -> `NOT_STARTED` only when no descendant has progress

The validator rejects self edges, duplicate edges, missing endpoints,
cross-workflow endpoints and direct or multi-hop cycles. Topology mutation is
locked after explicit work starts. Workflow and node row versions reject stale
writes.

## Requirements Contract integration

Setup lists every approved/superseded immutable Contract revision belonging to
the Assignment. The user selects the exact revision. Incomplete approval is
accepted honestly. The workflow stores the Contract ID, revision and hash;
Contract content and lifecycle are not mutated.

Later Contract supersession or source drift does not rewrite the workflow. The
workflow reports whether its snapshot is current, historical, missing a current
pointer or source-changed. Explicit replacement is required to adopt another
plan and preserves the old graph and events.

## Working Context integration

Selecting an Assignment resolves its current workflow. Selecting a node writes
its validated workflow/node IDs into M2 Working Context. Invalid or
cross-Assignment references fail closed. Context changes make no provider or AI
call. An explicit workflow replacement updates context to the new current
instance; stale historical references are never rebound silently.

## UX

The Assignment surface uses:

- explicit setup with deterministic suggestions and exact Contract choice;
- a bounded stage rail with text and non-colour state marks;
- one focused node inspector;
- dependency and event details under progressive disclosure;
- pre-work-only topology controls;
- explicit replacement and inspectable historical instances under advanced
  disclosure.

At shell widths through 1680 px the Assignment list/detail layout collapses to
one column so the workflow is not stranded in half of the usable STUD deck.
Long values wrap and the 1200x780 rail receives a bounded internal scroll.

## Scale and performance

Synthetic scale fixture:

- 100 Courses
- 1,000 Assignments
- 300 workflow instances
- 1,860 nodes
- 1,620 edges
- 600 events

Measured on the validation host: population approximately 0.76 seconds; scoped
Assignment workflow query 1.2-3.4 ms; Assignment without workflow 0.9-1.1 ms.
No global workflow graph is loaded at STUD startup. Assignment history is
bounded to 100 instances and event history to 500 events by the domain model.

## Focused automated validation

- M3 domain/DAG: 39 checks passed.
- M3 typed IPC: 12 checks passed.
- M3 scale: passed.
- M1 Requirements Contract: 33 + 9 checks passed.
- M2 Working Context: 13 + 6 checks passed.
- Command Center: 9 checks passed.
- Electron trust boundary: 17 checks passed.
- CodeQL hardening regression: 7 checks passed.
- Prebuild integrity guard: 4 outcomes passed.

## Live visual validation

Real development Electron was validated with synthetic data in:

- Dark, Light, System -> Dark and System -> Light;
- 1680x1050 at 2x, 1440x900 at 2x and 1200x780 at 1x;
- no workflow, setup, active branch/convergence, ready/in-progress/complete,
  skipped, historical and long-title states.

All probes reported no horizontal overflow and no escaped controls. Public
captures are cropped to the STUD deck; the initial full-window capture was
rejected because it contained a local terminal username.

## M4 boundary and limitations

M3 does not implement `BLOCKED`, `WAITING`, `HUMAN_INPUT`, checkpoint/recovery,
workers, artifacts or execution telemetry. `HUMAN_TASK` and `EXTERNAL_TASK` are
only semantic node categories. Skipping is an explicit M3 terminal decision and
does not claim that external work occurred. Full blocker dependency propagation
is the next M4 milestone.
