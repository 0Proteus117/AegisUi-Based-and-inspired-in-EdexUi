# AegisUi v2.2.9 — Boot Branding & OSINT Analyst Deck

## What changed

- Refined the AegisUi boot identity around the GearLab-inspired particle
  sequence, mark, welcome line, controlled glow and one-way handoff into the
  cockpit.
- Replaced the OSINT placeholder with a visual Analyst Deck: nine research
  domains, 161 public-source resources, tool briefs, tags and controlled
  external opening.
- Added release evidence: a packaged boot capture, a packaged OSINT overview
  capture and a reproducible local visual preview.

## Operating boundary

The OSINT workspace is an evidence-aware catalogue of public resources. It
does not run crawlers, harvest credentials, automate private access, perform
intrusion or open tools silently.

## Validation

- `scripts/test-osint-workspace.js`: registry loaded, 9 categories, 161 tools,
  no duplicate identifiers.
- `scripts/release-health-check.js`: package versions match and private local
  data remains excluded from the repository.
- Packaged application: renderer connected and the Analyst Deck rendered with
  `CATEGORIES 9`, `TOOLS 161` and `MODE PUBLIC`.
- DMG: verified with `hdiutil verify` before publication.

## Package

- Product: `EdexUi-Eng`
- Bundle ID: `com.edex.ui.eng`
- Version: `2.2.9`
- Asset: `EdexUi-Eng-2.2.9-arm64.dmg`

The DMG is a local macOS package. Apple signing/notarization is not claimed by
this release.
