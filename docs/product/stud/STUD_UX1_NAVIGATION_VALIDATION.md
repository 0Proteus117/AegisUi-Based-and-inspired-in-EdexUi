# STUD simple navigation — first connected delivery

Date: 6 October 2026. Branch: `codex/stud-ux1-navigation`.
Base: `7f95dda250237ad62f9325880b6eb2744f8d0d9b` (M16 acceptance branch), not a
claim that M16 has been integrated or closed. Integration remains `44107a5`.
The user's latest instruction authorizes proceeding with the connected simple
route. This work is isolated from the unchanged M16 acceptance worktree.

## Delivered scope

Real persisted Years → Subjects → Course content → Assignment summary → existing
Requirements / Workbench. One surface replaces the previous level. Years are
actual `academic_year` values, never inferred from module codes or the newest
Moodle import. The last meaningful Course's year can be shown first with other
years folded; it is labelled **last used**, not current. Unknown year/term remains
available. With no prior meaningful context the user chooses a year explicitly.

Subject search is folded, matches name or code only inside the selected year,
and includes an empty state. Course content separates Assignments, Resources
and AcademicDocuments with accurate scoped totals and next/previous pages.
Dates are the canonical observed dates; no due date is invented. Assignment
selection uses M2 and can be continued after restart. The summary distinguishes
unreviewed requirements and hands off to existing M1/M5 surfaces.

This is the first usable navigation slice, **not closure of the whole UX-1
roadmap**, not a replacement of M5, and not acceptance of the full STUD user
experience. It creates no AI-start button, Run, requirements approval, alias,
provider invocation or artificial activity. The automatic research/drafting and
incremental preview gaps remain recorded in M16 and the simplified UX roadmap.

## Architecture and boundaries

- `StudCourseBrowser`: read-only main-process service using canonical SQLite.
  Three fixed operations on the existing `stud-course-organisation` channel:
  YEARS, COURSES and CONTENT. Fixed table allowlist, parameterized values,
  canonical Course validation, bounded strings, integer pages (1–100, default
  renderer 40) and explicit totals/next offset. No generic SQL/files/network API.
- `StudSimpleNavigation`: renderer route/view only; no localStorage or database.
  Stale response rejection, visible failures, focus restoration and real buttons.
- `StudCommandCenter`: simple home/course entry, specialist access under Tools,
  full canonical reads when selections fall outside old hydrated caches. A
  bounded list is no longer treated as proof that a selected object disappeared.
- Existing Working Context persists meaningful Course/Assignment selections.
  Browsing a year/search/page does not fabricate academic work history.
- No schema migration (v28), dependency change, secret handling or Moodle SSO
  change. Preload allowlist unchanged; existing channel's input is extended and
  validated in main. New browser script is explicitly loaded before CommandCenter.

## Tests and evidence

- New focused suite: 20 checks, all passing. Six disciplinary/manual/year
  fixtures; 620 Assignments; pagination beyond old 500-record hydration; separate
  counts; archived/unknown records; query scoping; input bounds; no fabricated
  context; escaped titles; stale responses; restart; canonical selection outside
  cache; unchanged schema/foreign keys.
- Existing Working Context 13, typed IPC 8, CommandCenter 9, Assignment Workspace
  8, Electron boundary 17 and targeted CodeQL hardening 7 checks passed.
- Two legacy static checks expected the removed `STUDENT COMMAND CENTER` heading.
  They now assert the actual `STUD` heading plus the connected navigation class;
  their existing full specialist-surface/security assertions remain intact.
- Real development Electron: 72 checks (six states × four theme modes × three
  viewport/scale pairs), zero JavaScript exceptions, renderer Node absent/raw IPC
  absent. Real click path: year, subject, material category, assignment and M1.
  Themes: Dark, Light, System→Dark/Light; 1680×1050 @2x, 1440×900 @2x,
  1200×780 @1x. Captures are cropped synthetic STUD content only. Geometry tests
  and developer inspection do not stand in for the user's acceptance.
- Final broad regression: **119 passed, 1 failed, 1 skipped / 121 scripts**.
  The remaining failure is `test-map-providers.js` (TomTom HTTP 401 and absent
  AISSTREAM_API_KEY), matching M16 baseline; SAT/Celestrak is skipped under the
  established policy. No new failing suite remains. This includes release-health,
  package/native guard tests and the existing STUD/Aegis regression suites.
- Packaged checks are recorded below when completed, not assumed from development.

Local-only evidence: `ux1-navigation/2026-10-06/` in the external test-artifact
directory. No private university material, actual course titles, original paths,
credentials or model conversations are committed. Fixtures are synthetic.

## Remaining scope / next slice

1. Persist an explicitly chosen current academic year independently of the last
   working Course, with appropriate canonical preference/migration tests. Last
   used is intentionally not misrepresented as current.
2. Make Moodle's long names intelligible through provenance-backed, correctable
   display labels. This slice removes only exact duplicate stored name prefixes;
   it does not invent semantic aliases or overwrite provider metadata.
3. Simplify the Assignment/Workbench itself. It currently hands off to the
   existing M1/M5 interfaces; their internal controls are not claimed redesigned.
4. Connect authorized research preparation/execution and actual bounded streaming
   preview. Existing manual/review/model capability gates cannot be hidden.

No public release, final STUD completion, AI workflow completion or Map start.
