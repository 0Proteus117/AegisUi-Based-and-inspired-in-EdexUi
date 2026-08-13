# STUD Progress / Analytics

STUD Progress Analytics is a local, derived reporting surface over the canonical
academic SQLite store. It describes recorded academic work; it does not predict
performance, prescribe study, award points, invoke AI, or contact any provider.

## Model

The surface keeps these dimensions separate:

- Course progress: assignment state and explicit completion state.
- Assessment: numeric grades only when the recorded scheme is compatible.
- Deadlines/workload: explicit due dates and incomplete assignment state.
- Revision/study: explicit RevisionItems and finished local study sessions.
- Context/research: existing canonical material remains inspectable through its
  own provenance and relationship surfaces; no relevance score is invented here.
- Activity: bounded canonical-record and finished-session events.
- Completeness/conflicts: what is known locally, missing, or disagrees.

Every metric is labelled `KNOWN`, `PARTIAL`, `UNKNOWN`, or `CONFLICTING`. These
states concern local record completeness and observation consistency, never a
student's ability, intelligence, likely outcome, or academic correctness.

## Assessment safety

`PERCENTAGE` values are normalized directly. `POINTS` values are normalized only
when a positive maximum is recorded. Existing records with a numeric value and a
maximum can be shown as `POINTS_INFERRED`; a raw numeric value without a maximum
is not averaged. `TEXT` and `PASS_FAIL` are displayed but excluded from numerical
averages. A weighted average uses only explicit compatible numeric entries with
an explicit weight; missing or incompatible values remain visible as exclusions.

The grade metadata migration is schema v12. It adds `grade_scheme` and
`grade_text` to the existing Assignment record. It does not rewrite historic
grades or create grade observations.

## Boundaries

- No Moodle, Calendar, Email, research, GitHub or AI call occurs from analytics.
- No metric, activity event, query history or dashboard state is persisted.
- No localStorage shadow database is used.
- Existing Course, Assignment, RevisionItem, study-session and provenance data
  stays the source of truth.
- Inspect Sources reads only existing canonical/provenance records.

## Scale and disciplines

The report reads bounded data (150 courses, 2,500 assignments, 10,000 finished
study sessions and 100 visible rows per surface). It was tested with five
synthetic discipline-neutral groups: engineering, humanities, law/criminology,
social science and general university work. None of the model assumes equations,
DOIs, numerical grades, papers or laboratory data.
