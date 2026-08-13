# AegisUi v2.6.14 — STUD Final Acceptance / Academic Workflow

## Milestone validation

This milestone consolidates the existing STUD implementation through schema
v13. It validates the explicit academic workflow from canonical research
records and managed documents through provenance-bearing chunks, Notes,
inspectable Context Packages, restricted local Academic AI, revision context
and Harvard-style bibliography data.

The acceptance fixture is public-safe and synthetic where product data is
needed. Its three bibliographic records point to real, inspectable public
sources. The accompanying PDFs distinguish the technical acceptance evidence
from the resulting grounded academic-output fixture.

## Reproducibility and integrity

- A clean `src` installation now resolves the declared Citation.js packages.
- The lockfile includes Electron's required optional `undici` dependency, so
  `npm ci` does not fail before dependency installation.
- Focused checks cover fresh schema v13 startup and representative v9/v12
  migration paths, explicit persistence, restart behavior and citations that
  resolve to canonical STUD records.
- No second persistence layer, localStorage shadow database, cloud-AI fallback,
  autonomous provider action or privilege expansion was introduced.

## Intentional boundaries

- Research acquisition remains explicit and provider-bound; this release adds
  no crawler, downloader or background sync.
- Context Packages are local, bounded and inspectable. They do not themselves
  invoke a model or provider.
- Local Academic AI remains grounded only in a reviewed package and requires a
  local Ollama model when a live response is requested.

## Visual validation

![Academic Context — Dark](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/releases/download/v2.6.14/context-dark.png)

![Academic Context — Light](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/releases/download/v2.6.14/context-light.png)

![Local Academic AI — System Dark](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/releases/download/v2.6.14/local-ai-system-dark.png)

![Tool Catalog — System Light](https://github.com/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/releases/download/v2.6.14/tool-catalog-system-light.png)

The screenshots use only synthetic public-safe fixture material. They validate
Dark, Light and System appearances at the supported desktop sizes.

## Artifacts

- `AegisUi-2.6.14-arm64.dmg`
- `STUD-End-to-End-Process-Evidence.pdf`
- `STUD-Academic-Output.pdf`
- `SHA256SUMS.txt`

## Known environment warnings

The established Map provider checks may report TomTom HTTP 401 and an absent
`AISSTREAM_API_KEY`. They are environment credentials, remain outside the STUD
change set, and are reported separately from this milestone's validation.
