# STUD assignment workflow

1. Create a Course or choose an existing local module.
2. Create an Assignment with only known fields.
3. Review or edit its local status, due date, local progress, priority and description.
4. Add bounded local Notes or Resources through canonical entities and relationships.
5. Optionally link one Calendar event identifier or Email message identifier. No external event or message is opened, copied or modified.
6. Review field-level provenance and conflicting observations. STUD records observations but never selects a winner automatically.

The screen supports module/status filters, due-date or modified ordering and local FTS search. These actions query only SQLite FTS5 and are bounded. No academic record is copied to `localStorage`, external services or a separate persistence model.
