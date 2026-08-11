# STUD Matching and Conflict Model

`EXACT`, `STRONG`, `SUGGESTED`, `UNRESOLVED` and `CONFLICTING` describe match evidence, not assignment completion.

Canonical fields are selected through the existing field-level provenance model. An explicit user choice creates a `USER` observation with `USER_OVERRIDE` authority. It changes only STUD's local interpretation; older Moodle, Calendar and Email observations remain intact.

Conflicts are detected for assignment release, due and cutoff dates, grade and submission status, and for material course dates/code/title divergence. The UI presents the canonical value alongside every observation. It never silently resolves an email-versus-Moodle disagreement.
