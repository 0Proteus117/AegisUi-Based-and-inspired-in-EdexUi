# STUD Final Hardening, Reproducibility and End-to-End Academic Acceptance

## Scope

Phase 14 closes the STUD implementation milestone at schema v13. It does not
add a provider, persistence store, autonomous workflow, cloud-AI fallback, or
privilege boundary. The work is a reproducibility, integrity, privacy,
performance and acceptance pass over the existing canonical SQLite model.

## Reproducibility finding and correction

`src/package.json` declared Citation.js, but `src/package-lock.json` was
incomplete: the optional transitive `undici` package required by Electron's
download stack was absent. In a clean worktree `npm ci` therefore rejected the
lockfile before Citation.js could be installed. The lockfile now contains the
resolved `undici@7.29.0` entry. `scripts/test-stud-phase14-reproducibility.js`
guards the Citation.js declarations, their lock entries, the Electron optional
entry, fresh v13 startup, and representative v9/v12 upgrades.

The clean-install evidence must be produced with a Node runtime available in
`PATH`; this is an execution prerequisite of node-pty's install script, not a
project dependency omission. As with the established macOS workflow,
`npm run install-darwin` must then rebuild node-pty for Electron before an
Electron development or package launch; a plain Node-ABI install is not an
Electron-ABI substitute.

## Final audit boundaries

The audit covers Academic Core, Moodle read-only import, Orchestration,
Revision, Engineering Compute, Document Intelligence, Academic Intelligence,
Local Academic AI, Notebook/Data/GitHub Workbench, Progress Analytics and Tool
Catalog.

The following contracts remain authoritative:

- Canonical data is SQLite in `userData/stud`; there is no localStorage shadow
  database.
- A query, preview, selected object, handoff or AI response is ephemeral until
  a documented explicit save/promotion action occurs.
- Context Packages are local, bounded and inspectable. They never invoke a
  provider or model themselves.
- Local Academic AI receives only a reviewed Context Package and has no tools,
  filesystem access, provider configuration, cloud fallback or automatic save.
- Document extraction stores normalized pages/chunks/provenance rather than a
  raw parser payload; original document storage remains governed by the
  explicit managed-document flow.
- Moodle, Calendar and Email orchestration are reference/link operations. They
  do not write to external systems.

## End-to-end acceptance fixture

The deterministic regression creates a public-safe synthetic course and the
assignment **Evaluate the opportunities and limitations of Large Language
Models in higher education.** It creates canonical records for three real
public sources, imports a deliberately marked source-map PDF fixture through
the real Document Intelligence pipeline, persists provenance-bearing chunks,
creates a note and revision item, builds an inspectable Context Package, calls
the same restricted Academic AI runtime through a local fake client, explicitly
saves its response, creates a revision candidate, renders Harvard bibliography
data and reopens the database.

The fixture is not a substitute for external research acquisition and does not
claim that a model generated an authoritative academic submission. It proves
the local chain and its persistence/provenance semantics without a network or
installed Ollama model.

## Acceptance source set

- UNESCO (2023), *Guidance for generative AI in education and research*,
  https://unesdoc.unesco.org/ark:/48223/pf0000386693
- Kasneci, E. et al. (2023), *ChatGPT for good? On opportunities and
  challenges of large language models for education*, *Learning and Individual
  Differences*, 103, 102274, https://doi.org/10.1016/j.lindif.2023.102274
- Tlili, A. et al. (2023), *What if the devil is my guardian angel: ChatGPT as
  a case study of using chatbots in education*, *Smart Learning Environments*,
  10, 15, https://doi.org/10.1186/s40561-023-00237-x

## Remaining intentional limitations

- Real academic acquisition remains explicit and provider-bound; Phase 14 does
  not add a crawler, downloader, cloud search or background sync.
- A local Ollama response can be validated only when a compatible local model
  is installed and running. No cloud substitution is permitted.
- The acceptance source-map is a short public-safe fixture and does not copy
  full journal articles. Canonical research records preserve the source URLs
  and DOI provenance.
