# STUD Notebook / Data / GitHub Workbench

## Phase 11 decision

Phase 11 uses the existing SQLite academic store (schema v11), typed main-process
IPC and managed-file pattern. It adds no second database, no localStorage shadow
state and no new dependency.

Notebook execution is intentionally **EDITING_ONLY / NOT_INSTALLED**. The audit
found no existing Pyodide, Jupyter or Python runtime. Bundling an interpreter or
exposing an external one would either materially expand the macOS package or require
a new execution/security boundary. A notebook can therefore preserve Markdown, code
and raw academic material, but neither Electron process evaluates it.

## Canonical records

- `NOTEBOOK`: title, description, type, language descriptor, execution state and
  optional academic context.
- `NOTEBOOK_CELL`: ordered `MARKDOWN`, `CODE` or `RAW` source with timestamps.
- `NOTEBOOK_OUTPUT`: bounded normalized output model reserved for a future approved
  engine; the base workbench shows and can clear existing outputs but creates none.
- `DATASET`: explicit CSV/TSV import metadata, checksum, safe managed reference,
  bounded schema and summary.
- `REPOSITORY_REFERENCE`: public GitHub owner/repository, canonical URL, selected
  ref, optional commit SHA and explicitly obtained normalized public metadata.

These records use the existing relationship/provenance model. They can be linked to
Course, Assignment, Note, Resource, AcademicDocument and one another through
explicit relationships; no title similarity creates links automatically.

## Data and plots

CSV/TSV import is an explicit native-file-picker action. The main process accepts a
regular, non-symlinked file only, limits it to 8 MiB, 20,000 data rows and 120
columns, then copies it to `userData/stud/datasets`. The original path is never
persisted. Previews are bounded to 80 rows. The local deterministic surface offers
summary statistics, categorical frequencies and bounded histogram, bar, line or
scatter plot metadata. It does not infer scientific meaning, causation or
statistical significance.

## GitHub boundary

Repository references accept only `owner/repository` or canonical `https://github.com`
public URLs without credentials, query or fragment. `CHECK PUBLIC METADATA` is the
only network action: a user-initiated cancellable `GET` to the fixed
`https://api.github.com/repos/{owner}/{repository}` endpoint, with fixed headers and
a 2 MiB response bound. There is no token, clone, file import, polling, arbitrary
URL/method/header, private repository support or GitHub mutation.

Saved public metadata stays available offline; a new live check honestly returns an
offline/typed failure when unavailable.

## Academic Context and AI

Notebook metadata, Dataset metadata and RepositoryReference metadata are candidates
in the existing local Academic Context Builder. A Context Package includes only
bounded selected notebook Markdown/code cell fragments and normalized metadata; it
does not include full datasets, repositories or unmanaged files. The Local Academic
AI can only read a reviewed Context Package. It cannot execute code, call GitHub,
alter notebooks/datasets or invoke Compute.

## Dependency budget

No package was added. The implementation uses Node built-ins already used by the
main process (`fs`, `path`, `crypto`) and existing SQLite support. Package impact is
0 bytes, licensing impact is none, and Apple Silicon compatibility is unchanged.
Pyodide/Jupyter/Python were deliberately deferred rather than represented as working
capabilities.

## Security and privacy

Notebook and imported source text are untrusted data. Markdown preview is escaped
text, not injected HTML. There is no renderer-to-shell, executable, Node API,
arbitrary filesystem, generic HTTP proxy or secret/environment bridge. No hidden
history is created. Dataset references are validated before every read to prevent
traversal; imported originals are not retained outside managed storage.

## Known limitations

- No notebook execution engine or generated NotebookOutput exists in Phase 11.
- No Excel, JSON, repository clone, selected GitHub-file import, README fetch or
  commit inspection is included.
- Plots are local bounded analytical views, not publication-export artifacts.
