# STUD Academic Intelligence & Knowledge Layer

## Purpose

Phase 9 is a bounded, local layer over the existing canonical STUD SQLite
model. It helps a student inspect which stored academic material is relevant
to a selected Course, Assignment, ResearchPaper, AcademicDocument, Note or
RevisionItem. It is not an autonomous agent, an LLM, semantic inference or a
new academic database.

## Context model

The Context Builder has one explicit root and emits candidate records with a
visible status and one or more reasons:

- `DIRECT`: an explicit canonical relationship exists.
- `DERIVED`: a deterministic Course/Assignment context relationship exists.
- `SUGGESTED`: local FTS terminology overlaps; no canonical link is created.
- `CONFLICTING`: local provenance records for a candidate disagree.
- `UNRESOLVED`: there is insufficient local evidence to establish context.

The user can explicitly `PIN`, `INCLUDE` or `EXCLUDE` a candidate. That local
decision is stored as a provenance-aware context decision; it never mutates a
source document, Moodle, Calendar, Email or provider record. An exclusion does
not delete the academic object.

## Concept observations

Concepts are deterministic normalized terms extracted from bounded canonical
metadata and, for already analysed AcademicDocuments, bounded document chunks.
Every observation retains source entity, extraction method and page/chunk when
available. This is keyword/term extraction, not semantic understanding.

The index deliberately avoids a large NLP/ML dependency. Empty or sparse text
produces an honest insufficient-context state instead of invented concepts.

## Coverage and source support

Assignment Coverage compares identifiable local Assignment terminology with
the concept observations already present in the selected local context.
`SUPPORTED` means relevant local material was found; `UNRESOLVED` means it was
not found locally. It never evaluates whether an assignment is correct.

Notes report `SOURCE_LINKED`, `USER_AUTHORED` or `UNSUPPORTED_LOCAL` based on
local canonical relationships and provenance. `UNSUPPORTED_LOCAL` means that
STUD cannot establish local source support; it does **not** mean the note is
false.

## Context Packages

An Academic Context Package is created only by explicit user action. It stores
an inspectable SQLite snapshot of the selected root, candidates, explanations,
concepts, coverage and bounded document chunks. Limits are applied to
candidates, documents, chunks and normalized text. Any omitted material is
recorded as a reason and the package status becomes `TRUNCATED`.

Packages invoke no assistant, Ollama, cloud model, provider or external API.
They are the explicit, inspectable boundary intended for a future Phase 10;
Phase 9 does not connect that future consumer.

## Bounded graph

The Knowledge view renders only the selected context neighborhood: at most 40
nodes and 80 edges. Explicit canonical edges are `DIRECT`; keyword/context
edges are visibly `SUGGESTED`. It does not load or render a global graph.

## Security and privacy

- Local-only SQLite/FTS5 traversal; no network request or provider call.
- No shell, Python, executable, arbitrary URL or filesystem-scanning bridge.
- No secrets, Email bodies, Calendar contents, absolute paths or tokens enter
  concept observations or Context Packages.
- No telemetry, localStorage academic shadow store or hidden context history.
- Context construction is read-only except for the local concept index; user
  decisions and packages have separate explicit persistence actions.

## Discipline neutrality

The canonical model makes no assumption that an item is an engineering paper,
has a DOI, contains equations or uses one evidence hierarchy. Synthetic tests
cover engineering, humanities, law/criminology and social-science contexts
with the same Course/Assignment/Document/Note/Resource model.
