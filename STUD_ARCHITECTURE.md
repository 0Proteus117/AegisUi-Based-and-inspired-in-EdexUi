# STUD academic core and Command Center

## Assignment Workflow Engine programme

The authoritative product specification for the next STUD development programme
is preserved at
[docs/product/stud/AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf](docs/product/stud/AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf).
Its audited v2.7.0 gap analysis, target architecture and independently completable
implementation roadmap are indexed in
[docs/product/stud/README.md](docs/product/stud/README.md). Future workflow work
must preserve the proven foundations described below and must not reinterpret
historical phase documents as newer product authority.

STUD is AegisUi's canonical, local-first academic context. It owns academic
objects and their provenance; it does not own Moodle, Calendar, Email, Zotero
or any commercial service. Moodle is an explicit, optional read-only provider:
it observes bounded institutional data only after the student configures and
starts a sync. It never replaces the canonical STUD model.

## Local store

The canonical store is SQLite FTS5 through Node's bundled `node:sqlite` API.
No native npm package was introduced: this avoids a separate Apple Silicon
binary and keeps the local database compatible with Electron's Node runtime.
The database is created only at `userData/stud/academic.sqlite`, never in the
repository, source tree or public assets. WAL mode and transactional migrations
are enabled. A migration failure surfaces `MIGRATION_FAILED` without deleting
the existing database.

The renderer uses only narrowly allowlisted `stud-*` IPC methods. SQLite is
opened in the main process; the renderer has no direct SQL, filesystem path or
network capability.

## Tool Catalog (Phase 13)

`TOOLS` is a local, versioned capability registry, not a package manager. Its
definitions ship as validated application metadata and cover native STUD
surfaces, optional local engines, external tools, learning resources and
reference material. An entry distinguishes cost, offline operation, privacy,
account requirements, open-source/licence status, availability and integration
depth. `UNKNOWN` remains a valid disclosure when current evidence is missing.

Only catalog preferences and an explicitly selected discipline profile are
stored in the canonical SQLite database (schema v13). These choices never
change Courses, Assignments, Notes or other academic data, and STUD does not
infer a discipline from private material. Native items navigate to existing
surfaces. External launch receives a registry ID only; the main process resolves
that ID to its prevalidated HTTPS website. No custom URL, download, installation,
remote registry update, telemetry or provider action is available. See
[STUD_TOOL_CATALOG.md](STUD_TOOL_CATALOG.md) and
[STUD_PHASE13_VALIDATION.md](STUD_PHASE13_VALIDATION.md).

## Engineering Compute (Phase 7)

The STUD Tools view includes a deliberately bounded, offline-first Engineering
Compute workbench. It is not a terminal, notebook or generic Python bridge:
the renderer submits a typed request to the main process and receives a
normalized result. The local runtime supports a practical deterministic subset
of equations, SI-oriented unit conversion, numerical operations, bounded CSV
or TSV data summaries and SVG plot metadata. It never launches a shell,
selects an executable, reads arbitrary Aegis files or contacts a network
provider.

The calculation engine intentionally does not claim full SymPy, Pint, NumPy,
SciPy, pandas or Matplotlib compatibility. Optional Python engines (including
CoolProp and python-control) are reported as capability-detected and remain
`NOT_INSTALLED` unless a separately maintained local runtime is supplied in a
future, explicitly scoped change. There is no cloud fallback.

Results remain ephemeral until the analyst explicitly saves them. The main
process reruns the typed request before persistence, then writes a canonical
`COMPUTE_RESULT` with local deterministic provenance. A result can be linked
explicitly to a Course, Assignment and/or Note; Note insertion appends a
labelled provenance block and does not overwrite prior academic observations.
The original imported dataset file and its absolute path are never persisted.

Detailed use, supported bounded operations, security boundary, data/plot
limits and validation evidence are in
[STUD_ENGINEERING_COMPUTE.md](STUD_ENGINEERING_COMPUTE.md),
[STUD_COMPUTE_SECURITY.md](STUD_COMPUTE_SECURITY.md),
[STUD_COMPUTE_DATA_PLOTS.md](STUD_COMPUTE_DATA_PLOTS.md) and
[STUD_PHASE7_VALIDATION.md](STUD_PHASE7_VALIDATION.md).

## Notebook / Data / GitHub Workbench (Phase 11)

Phase 11 adds a separate discipline-neutral workbench. Notebook is not
Engineering Compute: notebook source is editable canonical academic material but
is not evaluated by Electron. The base capability is honestly
`EDITING_ONLY / NOT_INSTALLED`, because the audited project contained no safe
existing Python/Jupyter/Pyodide runtime and no packaged execution boundary was
added.

CSV/TSV arrives only through the existing explicit native-picker pattern, then
is copied into bounded managed STUD storage. The renderer receives preview and
normalized statistics rather than a local path. A repository reference is
local-first; its only optional network action is a user-initiated fixed GitHub
public metadata adapter. It has no token, clone, generic URL/method/header,
polling or write capability. Notebook cells and workbench metadata enter
Academic Context Packages only through the existing bounded review path, so
Local Academic AI remains a reader and has no notebook/data/GitHub tool use.

See [STUD_NOTEBOOK_DATA_GITHUB.md](STUD_NOTEBOOK_DATA_GITHUB.md) and
[STUD_PHASE11_VALIDATION.md](STUD_PHASE11_VALIDATION.md).

## Phase 1 model

Canonical IDs are generated locally and remain independent of external
systems. Phase 1 stores Course, Assignment, Resource, ResearchPaper, Note and
RevisionItem records. External identifiers remain separate, so a future Moodle
ID, ICS UID, DOI or Zotero key never becomes a primary key.

Phase 2 introduces the Student Command Center without adding a second storage
model. Overview, Modules and Assignments are renderer views over the same
SQLite records and typed IPC boundary. It creates/selects/edits Courses and
Assignments, creates and links local Notes/Resources, shows field provenance
and queries FTS5. Calendar and Email remain opaque explicit identifiers.

## Boundaries

Calendar and Email may be linked through a bounded ExternalIdentifier and a
relationship such as `RELATED_CALENDAR_EVENT` or `RELATED_EMAIL`. STUD does not
copy events, mail bodies, credentials, OAuth data or create Calendar deadlines.
There is no Moodle, provider, research API, file ingestion, PDF viewer, rich
editor, FSRS scheduler, AI/RAG or network dependency in Phase 1.

Detailed model, provenance, relationships and search behavior are in
[STUD_DATA_MODEL.md](STUD_DATA_MODEL.md), [STUD_COMMAND_CENTER.md](STUD_COMMAND_CENTER.md)
and validation evidence are in [STUD_PHASE1_VALIDATION.md](STUD_PHASE1_VALIDATION.md)
and [STUD_PHASE2_VALIDATION.md](STUD_PHASE2_VALIDATION.md). The generic LMS
boundary, Moodle adapter, secure credential policy and REST/ICS/Web fallback
are documented in [STUD_LMS_ARCHITECTURE.md](STUD_LMS_ARCHITECTURE.md),
[STUD_MOODLE_ADAPTER.md](STUD_MOODLE_ADAPTER.md) and
[STUD_MOODLE_FALLBACKS.md](STUD_MOODLE_FALLBACKS.md).
# Document Intelligence (Phase 8)

STUD core is discipline-neutral. `AcademicDocument` represents explicit local
academic documents without assuming that every source is a research paper or an
engineering calculation. Engineering Compute remains a specialised optional
local capability beside the core model, not an architectural assumption.

See [STUD_DOCUMENT_INTELLIGENCE.md](STUD_DOCUMENT_INTELLIGENCE.md) for the
offline PDF.js boundary, model, provenance and optional-engine policy.

## Academic Intelligence (Phase 9)

Phase 9 adds a local, explainable Context Builder above existing canonical
records. It derives direct and deterministic Course/Assignment relationships,
then presents bounded FTS terminology matches only as suggestions. Concepts,
coverage, source support, user decisions and Context Packages remain in the
same SQLite database and retain provenance. No LLM, cloud inference, provider,
filesystem scan or automatic action is connected. See
[STUD_ACADEMIC_INTELLIGENCE.md](STUD_ACADEMIC_INTELLIGENCE.md).

## Local Academic AI (Phase 10)

Phase 10 adds an opt-in local Ollama consumer of a reviewed Context Package;
it is not a second academic store and it never bypasses the Context Builder.
FTS5 ranking is restricted to the selected package candidates, while source
chunks and bounded canonical fragments from that snapshot form the only model
context. The assistant exposes a source trace, limitations and only verified
package source identifiers. It has no tools, cloud fallback, automatic action
or automatic persistence. Generated text is ephemeral until the user
explicitly saves it as a canonical Note or accepts an individual Revision
candidate, each with `AI_SUGGESTION` provenance. See
[STUD_LOCAL_ACADEMIC_AI.md](STUD_LOCAL_ACADEMIC_AI.md) and
[STUD_PHASE10_VALIDATION.md](STUD_PHASE10_VALIDATION.md).
# Phase 12 — Progress Analytics

`StudAcademicProgress` is a read-only derived layer over the canonical SQLite
records. It is deliberately separate from providers and orchestration: its five
typed IPC reads can inspect local Courses, Assignments, RevisionItems, finished
StudySessions and provenance, but cannot mutate them, launch a provider, access
Calendar/Email or persist a dashboard/history. See `STUD_PROGRESS_ANALYTICS.md`.
