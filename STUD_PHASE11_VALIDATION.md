# STUD Phase 11 validation

## Architecture audit

The current Electron renderer already communicates with STUD exclusively through
`studAcademicIpc` in the main process. Existing `node-pty` remains part of the
legacy terminal/runtime and is not used by STUD. Existing Engineering Compute stays
pure, typed and bounded. Existing managed PDF ingestion established the safe
native-picker-to-managed-storage model reused for CSV/TSV.

No Python, Jupyter, Pyodide or JupyterLite dependency existed. No prior GitHub
runtime/adapter existed; catalog links were not a native capability. The chosen base
release is therefore editing/data-first, not an unsafe interpreter integration.

## Focused automated coverage

`scripts/test-stud-notebook-workbench.js` covers migration v11; notebook cell CRUD,
ordering and restart persistence; hostile source non-execution; managed CSV import;
malformed input; deterministic analysis/plots; GitHub normalization and explicit
fixed-endpoint metadata; offline/no-automatic-request behavior; Context Package
inclusion; five discipline fixtures; sender validation; and the bounded 500
notebook/10,000 cell/500 dataset/1,000 repository synthetic scale shape alongside
100 Courses and 1,000 Assignments.

Focused STUD coverage passed: Academic Core (28), Command Center (8), Academic
Intelligence (15), Academic Orchestration (14), Document Intelligence (18),
Engineering Compute (22), Moodle (29), Notebook/Data/GitHub (18), Research Writing
(22), Revision Planning (21), Research Scale and Workspace contract. The complete
regression aggregator passed every Phase 11-relevant check. Its only non-zero result
is inherited external map configuration: TomTom HTTP 401 and a missing
`AISSTREAM_API_KEY`; RainViewer and Open-Meteo Marine passed.

## Visual matrix

Electron/CDP validation used a temporary synthetic profile and mock Keychain only;
no account, token or personal academic data was used. Dark, Light and System→Light
passed at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x. Stress coverage includes
long notebook source, unavailable execution, dataset tables, long repository metadata
and compact layout. Dynamic workbench content uses normal grid/document flow and
bounded internal scroll containers; the checks reported no horizontal overflow or
visible control escape.

## Regression boundary

Phase 11 modifies STUD model/store/runtime/UI, its related tests, documentation and
release metadata only. It does not modify `_boot.js`, intro, OSINT, HUB, ENG, map,
Calendar helper, Apple Music, Assistant, GearLab or application packaging.
