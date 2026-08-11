# STUD Phase 7 Validation

Phase 7 validates the local compute engine with deterministic synthetic inputs:
polynomial equations, systems, matrices, unit conversion and dimensional
errors, numerical methods, dataset bounds, plot metadata, optional-engine
unavailability, explicit Compute Result persistence, Course/Assignment/Note
relationships, restart retention and the sender-validated IPC boundary.

Visual validation covers Dark, Light and System appearances at 1680×1050,
1440×900 and 1200×780 using synthetic calculations only. The release does not
include a DMG: this is an incremental renderer/model capability with unchanged
packaging, startup, preload and native helper paths.

Known intentional limitation: the first-party bounded core is not a substitute
for a bundled SymPy/Pint distribution. Optional scientific packages remain
honestly unavailable until separately approved for architecture, licensing,
Apple Silicon packaging and offline validation.
