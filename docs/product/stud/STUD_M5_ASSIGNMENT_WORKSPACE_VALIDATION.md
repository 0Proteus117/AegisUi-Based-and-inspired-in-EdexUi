# STUD M5 — Assignment Workspace

Status: implemented on the M4 / schema-v18 foundation. This document records
the actual M5 integration and validation boundary. It does not begin M6.

## Scope

M5 changes `WORK → ASSIGNMENTS` from the former list/detail record inspector
into `StudAssignmentWorkspace`, a renderer composition over existing canonical
STUD data. There is no schema migration and no second persistence store.

The workspace shows, in document flow:

- Assignment header: course, assessment classification, canonical Assignment
  status, due date, workflow stage and compact Requirements Contract state;
- a compact M3/M4 workflow rail that selects context only and never transitions
  a node;
- a primary bounded local preview area;
- M4 blocker/checkpoint attention with an honest path to an independent ready
  stage where one exists;
- grouped canonical material; and
- adjacent Working Notes using the existing browser structured-note editor.

Requirements Contract and Workflow open their existing detailed surfaces only
when explicitly requested. This keeps the resting Assignment surface calm while
retaining the full M1–M4 evidence and control model.

## Reused canonical contracts

| Concern | Existing authority reused by M5 |
| --- | --- |
| Assignment / Course | `StudAcademicStore.assignmentOrchestrationContext()` and M2 course context |
| Working context | `StudWorkingContext` via its existing typed main-process update API |
| Requirements | M1 `StudRequirementsContractWorkspace` and immutable revision state |
| Workflow / blockers | M3 `StudWorkflowWorkspace` and M4 derived availability |
| Documents / chunks | Document Intelligence typed context, managed PDF reader and exact `createDocumentNote` provenance |
| Notes | existing `stud-note-save-structured` model and browser structured editor |
| Research / citations | existing canonical paper context and Citation.js surface |
| Data / notebooks | existing bounded managed-dataset and notebook reads |

Course-scoped material may appear alongside direct Assignment material only when
it already has a canonical Course relationship. Direct and course copies are
deduplicated by canonical type/ID, including the adjacent Note selector. No
title similarity creates a link.

## Preview contract

Preview adapters accept only these existing entity types:

`ACADEMIC_DOCUMENT`, `RESEARCH_PAPER`, `NOTE`, `RESOURCE`, `DATASET`,
`NOTEBOOK`, `REPOSITORY_REFERENCE`, `COMPUTE_RESULT`, and `REVISION_ITEM`.

- Academic Documents use `stud-document-context`; page/chunk excerpts retain
  the original document extraction and a chunk note uses
  `stud-document-create-note`.
- Research Papers use `stud-research-context`; opening a locally managed PDF is
  explicit.
- Datasets and notebooks use their existing bounded reads.
- Resources, repository references, compute results and revision items show
  normalized local context or `PREVIEW NOT AVAILABLE` with an explicit handoff.

M5 neither embeds an unrestricted browser nor follows a resource URL. It does
not expose source paths, signed URLs, raw provider payloads or credentials.

## Working Notes

Creating/selecting a note is explicit. The contextual editor receives the
already selected Course and Assignment as fixed local relationship fields. Save
continues through `stud-note-save-structured`; after a successful save the new
canonical Note becomes the current Working Context object. No note is created
on preview, stage selection, navigation or restore.

## Security and persistence

- `nodeIntegration: false`, `contextIsolation: true`; no new preload channel or
  direct renderer Node access.
- M5 uses existing narrow typed IPC reads/mutations only.
- No automatic Moodle, research, GitHub, model, citation or workflow execution
  occurs when context changes.
- The only M5 persistence is existing explicit Working Context update and
  explicit note save/create-note action.
- M5 has no `fetch`, generic filesystem, shell, generic network proxy,
  `localStorage` or `sessionStorage` use.

## Known limits

- A current document page/chunk locator is preview state; it is not a new
  persistent working-context field in M5.
- A Resource without an already-linked managed AcademicDocument has no inline
  file preview. It remains a normalized local reference and can be opened only
  through its existing specialised context where applicable.
- M5 does not add Artifact Bay, event feeds, Mission Control, workflow workers,
  automatic research, AI execution, new claims/evidence records or an embedded
  web browser. These remain outside M5.

## Automated validation

Focused M5 test: `scripts/test-stud-assignment-workspace.js` (**8 checks
passed**).

Scale test: `scripts/test-stud-assignment-workspace-scale.js`. It creates 100
Courses, 1,000 Assignments, 220 material records scoped to one Assignment, 24
Notes and 24 Papers. It verifies the Assignment/Course query caps, no automatic
FTS call, canonical object/note switch and scoped Working Context preview restoration within the
bounded local test budget. The separate M3/M4 scale suites cover the 300
Workflow/condition scenario used by the Workspace rail. The recorded M5 run
measured 3.6 ms Assignment hydration, 2.1 ms Course context read, 0.3 ms object
switch, 0.2 ms Note switch and 0.6 ms Working Context restoration.

It verifies the adapter allowlist, direct/course material deduplication,
brief classification, rejection of invalid/cross-assignment workspace objects,
no title matching, no automatic provider/model action, Working Context reuse,
structured-note reuse and discipline-neutral fixture labels.

Existing Command Center and general STUD workspace tests assert that M5 remains
in the existing renderer/main-process trust boundary and uses Aegis theme/layout
contracts (**9** and **22** checks respectively). M1–M4, Academic Core,
Academic Orchestration, Documents, Research, Notes, Citations, Knowledge, Local
AI, Compute, Notebook/Data, Progress, Moodle, CodeQL hardening, Electron trust
boundary, prebuild integrity and release health all passed in the M5 regression
run. The pre-existing PDF.js standard-font-data warning was emitted during a
passing Research test; it did not affect M5 or cause a test failure.

The full cross-Aegis regression runner reached its inherited Map-provider
environment failure: TomTom returned HTTP 401 and `AISSTREAM_API_KEY` was not
present. RainViewer and Open-Meteo Marine passed; SAT/Celestrak was skipped by
its existing environment policy. These results are outside M5 and were not
relabeled as passing.

## Live visual validation

Synthetic-only live validation covers a populated workspace, direct blocker,
independent ready stage, source preview, related material, contextual notes,
no-contract/empty state and long text. The required appearance matrix is Dark,
Light, System-to-Dark and System-to-Light at 1680x1050 @2x, 1440x900 @2x and
1200x780 @1x. Seven local synthetic screenshots passed the live layout check;
the check detects workspace overflow and controls escaping the main STUD region.

No private Moodle, UEL, assignment, local path or credential data is used.
