# AegisUi Workspaces

The top navigation represents workspaces, not user accounts.

Current workspace line:

- HUB — main cockpit
- ENG — engineering command deck
- OSINT — analyst desk
- STUD — student workspace
- ART — creative workspace
- BUS — business workspace
- COMMS — communications deck
- BAY — Launch Bay
- DEV — developer deck
- AGENT — Agent Command

## ENG

ENG is implemented as a specialized engineering workspace with CAD/CAM, CAE, manufacturing, calculators, materials, research, standards and project status.

ENG reuses safe launcher and Project Timeline systems rather than duplicating HUB logic.

As of v2.2.3, ENG quick calculators use visual cockpit controls with sliders,
numeric precision inputs and representative technical diagrams.

## OSINT

OSINT is the public-source Analyst Desk. v2.3.0 activates the first domain,
Discovery / Search, through a native-access foundation:

- Internet Archive Wayback Availability renders as a native AegisUi provider
  result.
- Selected public websites open in an isolated in-suite source surface.
- The visible browser fallback remains available for sources that require it.
- The remaining domains are staged until their provider-specific security and
  validation work is complete.

See [OSINT_NATIVE_ACCESS.md](OSINT_NATIVE_ACCESS.md).
