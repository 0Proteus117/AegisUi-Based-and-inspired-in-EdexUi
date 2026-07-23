# OSINT Reference-Only Policy

## Why this state exists

AegisUi can identify a real tool when that recognition has defensive, academic, historical or ecosystem-context value. Inclusion does not recommend, distribute, enable, integrate or teach the tool.

`REFERENCE_ONLY` is designed for entries whose risk, authorization requirements or legal context make an actionable catalog entry inappropriate.

## Allowed information

- Name and public alternate names when relevant.
- Neutral high-level description.
- Category and general capabilities.
- Risk and legal-status context.
- Reason for inclusion.
- Review date, source confidence and jurisdiction note.
- The required legal disclaimer.

## Blocked information and actions

The schema, policy and UI jointly block:

- launch, external URL copying, installation, configuration and integration;
- APIs, IPC, webviews, downloads and provider adapters;
- operational URLs, documentation URLs, mirrors, markets or acquisition links;
- commands, flags, payloads, targets, credentials, setup instructions and evasion guidance;
- disk writes, network requests and navigation from the reference action.

The reference detail contains only `READ REFERENCE` and `CLOSE`. `READ REFERENCE` is an informational acknowledgement inside the existing modal; it does not navigate or perform I/O.

## Required disclaimer

> This entry is included exclusively for ecosystem recognition, defensive analysis, technical context and informational transparency. Possession, distribution or use may be restricted or unlawful depending on the tool, jurisdiction, authorization and context. AegisUi provides no access, download, installation, configuration, automation, integration or operational instructions.

## Technical enforcement

The test fixture checks that a reference entry is visible and selectable, yet has no actionable URL, no operational buttons and no permitted policy action. It also verifies that a direct artificial launch attempt returns `REFERENCE_ONLY` and cannot reach the external-link handler.
