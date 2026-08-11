# STUD Engineering Compute

## Purpose

Engineering Compute is a local STEM workbench inside STUD. It accepts one
explicit calculation or one explicitly selected CSV/TSV dataset at a time and
returns bounded normalized results. It is not MATLAB, a notebook, a terminal
or a general programming environment.

## Runtime and trust boundary

`StudComputeRuntime` is a first-party, deterministic Node runtime in the main
process. The renderer can request only an allowlisted tool/operation/input
shape through `stud-compute-*` IPC channels. The runtime does not use network
requests, child processes, shell commands, environment secrets, provider
credentials or filesystem paths.

The initial core is available offline:

- bounded polynomial simplification, linear/quadratic solving, 2–3 equation
  linear systems, differentiation, integration, substitution and small matrix
  determinant;
- SI/common engineering conversions and dimensional checks;
- statistics, linear interpolation, bounded polynomial roots/integration and
  small matrix-vector operations;
- explicit numeric CSV/TSV summary and SVG line/scatter/histogram metadata.

SymPy, Pint, CoolProp and python-control are intentionally reported as
`NOT_INSTALLED` unless a future audited local pack is bundled and validated.
There is no cloud or web fallback, and unavailable engines never fabricate a
result.

## Academic persistence

Nothing persists when a calculation is typed, run, previewed or plotted. An
analyst must choose **SAVE LOCAL RESULT**. Main recomputes the typed request,
then stores a canonical `COMPUTE_RESULT` record with input, normalized input,
output, optional units/plot metadata, runtime identity and
`AEGIS_ENGINEERING_COMPUTE` provenance.

Optional Course, Assignment and Note associations are explicit. Selecting a
Note appends a clearly labelled compute block and creates a relationship; it
does not overwrite external systems or infer academic context from text.

## Limits

- expression: 4,000 characters;
- ordinary vectors: 4,096 values;
- matrices: 8×8;
- CSV/TSV: explicit browser selection, numeric columns only, 2 MB, 32 columns,
  10,000 rows;
- plot data remains bounded and stored only as normalized metadata after an
  explicit save.

Original files and absolute paths are never persisted by this capability.
