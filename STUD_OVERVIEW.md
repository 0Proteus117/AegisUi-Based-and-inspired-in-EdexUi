# STUD Overview derivation

The Command Center builds its Overview from canonical local records at render time.

- **Today:** active assignments with a known local due date on the selected local day.
- **Upcoming:** active assignments with a known future due date, bounded by the command-center limit.
- **Priority:** local deterministic presentation: explicit manual priority wins; otherwise deadlines at or below one day are `URGENT`, seven days `HIGH`, twenty-one days `NORMAL`, later or unknown dates `NORMAL`, and completed work is `LOW`.
- **Continue:** recently modified canonical Courses, Assignments, Resources, Notes and Papers.
- **Module status:** active assignment count and nearest known due date for each Course.

`localProgress` is never inferred. It is an optional analyst/student-entered integer from 0 to 100. Unknown dates, grades, submission details and references remain visibly unknown rather than being fabricated.
