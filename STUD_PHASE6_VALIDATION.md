# STUD Phase 6 validation

Validation uses synthetic academic records only. Dedicated checks cover schema
migration/restart safety, legacy RevisionItem compatibility, CRUD, explicit
relationships, manual schedule provenance, deterministic planning reasons,
spaced suggestions, session lifecycle, cancellation, interrupted sessions,
FTS, bounded scale (50 Courses, 500 Assignments and 2,000 RevisionItems), and
the absence of provider/Calendar/Moodle mutation paths. It also covers the
explicit local material handoff contract for Assignments, Notes, Resources and
Research Papers.

Visual validation exercises REVISION in Dark, Light and System appearance at
1680x1050 @2x, 1440x900 @2x and 1200x780 @1x using synthetic data.
