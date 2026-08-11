# STUD Revision & Study Planning

Revision Items are local-first canonical academic objects. They can be created
from a Course, Assignment, saved Note or saved Research Paper. Each creation
path is an explicit user action: it creates only local relationships and never
opens, reads or mutates Moodle, Calendar, Email, a provider or a file.

Phase 6 activates the local **REVISION** desk. A RevisionItem is a canonical
STUD object, connected through existing explicit relationships to Courses,
Assignments, Notes, Resources and Research Papers. It does not copy their
contents or call any external provider.

## Planning model

The local planner uses only explicit schedules, pins, RevisionItem priority,
recorded study state and known related Assignment deadlines. Each queue entry
shows a human-readable reason such as `SCHEDULED TODAY`, `OVERDUE BY 2 DAYS`,
`RELATED ASSIGNMENT DUE IN 4 DAYS` or `NO RECORDED STUDY CONFIDENCE`.

An explicit `scheduledRevisionAt` always takes precedence over a local
suggestion. Suggestions are not Calendar events and require an explicit user
schedule to become one.

## Spaced revision helper

Spaced revision is optional per item. After an explicitly finished session,
the local helper can suggest a date only when the user records LOW, MEDIUM or
HIGH confidence. Its bounded, inspectable intervals are deliberately a simple
planning aid, not a claim of cognitive optimisation. Manual schedules win.

## Boundaries

Revision is offline-first. It never scans Calendar or Email, creates external
events, writes Moodle, invokes a provider, persists private paths, tracks
keystrokes or records background application activity.
