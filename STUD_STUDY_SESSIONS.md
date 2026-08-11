# STUD Study Sessions

Study sessions are explicit local records: `START`, `PAUSE`, `RESUME`,
`FINISH` and `CANCEL`. A completed session may store user-entered difficulty,
confidence and a short note. Only explicit completion adds duration to a
RevisionItem's accumulated study time.

## Interrupted-session policy

On store restart, any `STARTED` or `PAUSED` session becomes `INTERRUPTED`.
Only elapsed time previously checkpointed by `PAUSE` is retained. The system
never estimates elapsed time across a crash or restart, so it cannot invent
study duration.

`CANCEL` keeps an audit record but does not mark time as completed study.
History is local academic data created by the student, not telemetry.
