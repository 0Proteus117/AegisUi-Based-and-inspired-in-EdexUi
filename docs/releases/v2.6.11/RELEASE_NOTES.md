# AegisUi v2.6.11 — STUD Notebook / Data / GitHub Academic Workbench

STUD now has a discipline-neutral, local-first workbench for structured academic
notebooks, bounded CSV/TSV data inspection and explicit public GitHub repository
context.

## What changed

- Added canonical SQLite schema v11 records for Notebooks, Notebook Cells, Notebook
  Outputs, Datasets and Repository References, each linkable to Course, Assignment,
  Note and existing academic context with provenance.
- Added explicit notebook creation, safe editing, ordered Markdown/Code/Raw cells,
  duplicate/reorder/delete controls and persisted editing state.
- Added explicit managed CSV/TSV import, bounded local preview, deterministic
  summaries/frequencies and labelled line/scatter/histogram data views.
- Added one explicit, unauthenticated public GitHub metadata request against the
  fixed `api.github.com/repos/{owner}/{repo}` endpoint. No token, clone, download,
  write, polling or provider chaining is included.
- Added bounded Notebook Markdown/Code fragments to the inspectable Academic Context
  Package. This does not invoke an LLM or execute a Notebook.

## Execution and security boundary

Notebook execution is intentionally **NOT INSTALLED** in this release. AegisUi does
not bundle Python, Jupyter, Pyodide, JupyterLite, a shell or an arbitrary interpreter.
Cells are stored as academic source text only. There is no automatic run, hidden save,
directory scan, telemetry, cloud compute, credential access or generic network/filesystem proxy.

CSV/TSV input is selected explicitly, copied into managed STUD storage after strict
size/structure checks, and never retains the original absolute path. GitHub lookup is
explicit, cancellable, bounded and public-read-only.

## Validation

- SQLite migration/restart, typed IPC sender validation, local-only import/analysis,
  fixed-endpoint GitHub policy, Context Package inclusion and five discipline-neutral
  fixtures passed.
- Synthetic scale coverage includes 100 Courses, 1,000 Assignments, 500 Notebooks,
  10,000 cells, 500 Datasets and 1,000 Repository References.
- Dark, Light and System visuals passed at 1680×1050 @2x, 1440×900 @2x and
  1200×780 @1x, with no horizontal overflow or visible control escape.

Known inherited environment warnings: TomTom HTTP 401 and an absent
`AISSTREAM_API_KEY` affect existing map-provider checks only. They are unrelated to
this local STUD release.

## Visual validation

![Notebook workbench — Dark](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/notebook-dark.png)

![Notebook workbench — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/notebook-light.png)

![Markdown and code cells — editing only](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/markdown-code-cells.png)

![Execution explicitly unavailable](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/execution-not-installed.png)

![Dataset preview and analysis](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/dataset-preview.png)

![Local plot — Light](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/plot-light.png)

![Explicit public GitHub context](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/github-context.png)

![Compact workbench layout](https://raw.githubusercontent.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/v2.6.11/docs/releases/v2.6.11/screenshots/compact-workbench.png)

DMG: **Not generated** — this is an incremental STUD model/runtime/UI release; it
does not modify packaging, preload, startup, native helpers, signing or bundled runtime dependencies.
