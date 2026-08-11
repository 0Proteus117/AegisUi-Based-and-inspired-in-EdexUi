# STUD Phase 4 validation

## Scope

Phase 4 adds a capability-driven, read-only Moodle adapter to the existing
local-first Student Command Center. It does not introduce an institutional
credential, write workflow, automated polling, Calendar mutation, LMS browser
embedding or additional LMS provider.

## Automated coverage

`scripts/test-stud-moodle-integration.js` uses a deterministic synthetic
Moodle REST/ICS fixture. It covers strict HTTPS/base URL validation, encrypted
credential storage, capability probing, write-policy disablement, canonical
mapping, external identifiers, HTML/token sanitation, grades/feedback,
provenance conflicts, ICS fallback, cancellation, typed failures, non-
destructive disappearance and the absence of a generic proxy/write endpoint.

Existing STUD academic-core, command-center, workspace and research/writing
tests remain part of the regression set. The Phase 4 UI is checked at desktop
and compact dimensions with synthetic records; no real course, UEL target,
token, private calendar, name or filesystem path is used in public evidence.

The completed validation recorded: 28 academic-core checks, 8 command-center
checks, 22 research/writing checks, 11 static workspace checks and 29 Moodle
integration checks passing. The live renderer assertion passed at 1680×1050
@2x (Light), 1440×900 @2x (Dark and System-resolved Dark/Light) and 1200×780
@1x (Dark compact), with no escaped controls, horizontal overflow or broken
section flow.

The broad release-health check passed. The broad regression aggregator retains
two inherited Map configuration failures: TomTom returned HTTP 401 and
`AISSTREAM_API_KEY` was absent. They were not changed by Phase 4; all reached
STUD, OSINT, Assistant, ENG, Apple Music, Calendar-helper and theme checks
passed.

## Manual/institutional validation status

The generic REST adapter and local ICS parser have been validated with
synthetic responses. **UEL live validation was not performed:** this release
has no UEL URL configuration, sanctioned Web Service token or approved account
permission. The UI therefore starts `CONFIG_REQUIRED`; it does not claim UEL
REST/Mobile availability.

## Packaging

No preload, native helper, startup or packaging path changes are made in Phase
4. A DMG is intentionally not generated for this incremental runtime/UI
release. The completed release includes sanitized development visual evidence.
