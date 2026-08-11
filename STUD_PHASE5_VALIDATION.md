# STUD Phase 5 Validation

Validated with synthetic academic data only:

- exact, strong, suggested, unresolved and conflicting candidate classes;
- explicit confirmation before persistence;
- Calendar/Email reference retention without external mutation or mailbox content persistence;
- field-level conflict retention and `USER_OVERRIDE` provenance;
- bounded overview attention generation with a 300-assignment synthetic corpus;
- Dark, Light, System Dark, System Light and compact layout validation.

Known boundaries: AegisUi has no Email-reading runtime. Email candidates are therefore explicitly supplied bounded references, not mailbox search results. Calendar remains an existing read-only system boundary and this phase does not create a new Calendar IPC surface.
