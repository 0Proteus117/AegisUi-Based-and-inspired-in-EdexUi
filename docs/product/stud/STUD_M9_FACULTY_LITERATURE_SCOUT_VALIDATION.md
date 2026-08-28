# STUD M9 — Faculty Literature Scout validation

## Milestone boundary

M9 implements an Assignment-scoped, ambiguity-aware path from an observed
teaching-team identity to potentially relevant public scholarly records. It
does not search for private people, crawl profiles, scrape Google Scholar,
assign source quality, create Evidence, invoke a model, run autonomous research
or start a Mission Control Run for ordinary review actions. M10 was not started.

The explicit path is:

1. record a faculty observation from user input or exact canonical provenance;
2. query the fixed OpenAlex Authors endpoint on explicit request;
3. inspect explainable identity candidates;
4. explicitly confirm or reject a candidate;
5. query works for the confirmed OpenAlex Author ID;
6. inspect deterministic Topic relevance reasons;
7. explicitly import a relevant work into the canonical Research library and
   the existing M7 Topic Dossier.

Identity confirmation says only that the selected public scholarly record is
the analyst-reviewed match. A Faculty Gem says only that a confirmed author's
publication passed the bounded Topic relevance gate and was explicitly added.
Neither label establishes authority, academic quality, truth or M8 support.

## Schema v22

Migration v22 is one transactional extension after v21. It creates:

- `stud_faculty_identities`: Assignment/Course scope, observed identity fields,
  independent observed and confirmed ORCID values, explicit resolution state,
  confirmed provider identity and optimistic row version;
- `stud_faculty_observations`: exact user, canonical metadata, Moodle provenance
  or AcademicDocument extraction/chunk/page observation;
- `stud_faculty_identity_candidates`: bounded OpenAlex public identity snapshot,
  explainable assessment and persistent review disposition;
- `stud_faculty_publication_candidates`: exact confirmed identity, Plan/Topic,
  normalized work snapshot, deterministic relevance reasons and explicit import
  or dismissal state.

No existing Assignment receives an identity, observation, candidate, Gem,
Research Paper, Dossier item, Evidence record or support relationship during
migration. Existing canonical Research Papers and M7 Dossier items remain the
authoritative imported objects.

## Faculty observations and provenance

Manual observation works without Moodle. The main process records the origin as
`USER`; renderer input cannot forge a provider or confirmed state. Exact
canonical sources are supported for Assignment metadata, Course metadata,
Moodle provenance and AcademicDocument chunks. Document provenance retains the
document, extraction, chunk, page range, bounded excerpt and content hash, and
requires the normalized observed name to occur in that exact chunk.

Course metadata cannot be selected when a manual Assignment has no Course.
Moodle observations must resolve through the existing provenance table to the
same Assignment or Course and must have a Moodle source type. Stable identity
records are deduplicated per Assignment, normalized name and institution,
including the SQLite `NULL` institution case.

## Identity resolution

OpenAlex candidates remain unconfirmed until the user selects one. The local
assessment records reasons rather than a score:

- exact normalized name;
- observed institution/department matching public affiliation metadata;
- exact observed ORCID.

Name alone is `AMBIGUOUS`. Name plus affiliation or exact ORCID may be
`PROBABLE`, but never becomes `CONFIRMED` automatically. Confirm/reject actions
use optimistic concurrency and stale writes fail with
`STALE_FACULTY_VERSION`. Observed ORCID is never silently promoted to confirmed
ORCID; confirmation records the selected public candidate's identifier.

## Provider contract

M9 extends the existing bounded Research Runtime rather than adding a renderer
network path. It uses fixed HTTPS OpenAlex endpoints for Authors and Works,
fixed GET semantics and URL parameters constructed in main process. The
renderer cannot choose an endpoint, HTTP method, headers or credentials.

Author search is limited to 20 candidates and publication discovery to 25 works
per request. Public responses remain capped at 3 MiB; normalized publication
snapshots are capped at 64 KiB; eight concurrent provider requests are allowed
across the Research Runtime. Existing timeout, cancellation and typed failure
handling remain active. There is no silent retry on rate limiting and no cloud,
model or alternative-provider fallback. Offline, previously persisted reviewed
state remains inspectable and a new provider request fails honestly.

OpenAlex Author ID is the required stable public identity for publication
discovery. ORCID is corroborating identity metadata, not a direct M9 provider
query or an automatically trusted profile. Crossref remains part of the
canonical Research/Citation infrastructure after import; it is not used for
person resolution.

## Publication relevance and Faculty Gems

Publication results are accepted only when the confirmed OpenAlex Author ID
occurs in the normalized work authorship. Relevance uses bounded deterministic
term overlap from the Assignment, selected Topic and optional Research Question
or Claim. The UI exposes matched terms and reasons; it does not expose a hidden
score, source count or quality badge.

A relevant candidate still requires explicit import. Import reuses
`saveResearchObservation()` to create/update the canonical Research Paper and
M7 `addDossierItem()` to add one accepted Dossier reference. An irrelevant or
dismissed candidate cannot become a Gem. Import does not create an M8 Evidence
record, Claim/Evidence relationship, Citation support assertion or M6 Run.
Dossier membership continues to require the explicit M8 `USE AS EVIDENCE` path
before intellectual support can be assessed.

## Working Context and UI

Assignment Workspace exposes one contextual `FACULTY SCOUT` entry. The primary
surface uses progressive disclosure for observation, candidate identity,
publication discovery and Topic Dossier import. It does not add another global
STUD tab or permanently expose provider configuration.

M2 Assignment context and the selected M7 Plan/Topic remain authoritative.
Opening or changing Faculty Scout state does not call Moodle, OpenAlex, Ollama,
Mission Control or any other provider. Provider calls occur only after an
explicit button action. M9 does not persist a new Working Context object type;
it consumes the active Assignment and selected Plan/Topic and leaves M8
Claim/Evidence context unchanged.

## Bounds and scale

Assignment state reads are bounded to 100 identities, 50 observations and 50
identity candidates per identity, and 100 publication candidates for the
selected Topic. Reads are Assignment/Topic scoped and indexed; normal Assignment
load does not hydrate the global faculty corpus.

The synthetic scale fixture contains 100 Courses, 1,000 Assignments, 300
Research Plans, 3,000 faculty identities and 9,000 publication candidates. On
the validation host, active Assignment state loaded in 2.01 ms, an in-memory
relevance filter in 0.05 ms and restart state in 1.50 ms; the SQLite fixture was
14,200,832 bytes. These measurements are local observations, not performance
promises.

## Security and privacy

The Electron boundary remains `nodeIntegration: false` and
`contextIsolation: true`. M9 exposes eight fixed preload channels. Main process
validates sender, payload keys, IDs, Assignment/Plan/Topic ownership, exact
canonical provenance, identity state, author/work identity, optimistic versions
and payload bounds. There is no raw `ipcRenderer`, generic persistence, SQL,
filesystem, shell, network proxy, model invocation or renderer-selected
provider operation.

Visual and scale fixtures are synthetic. No Moodle/UEL data, credentials,
private Assignment, local username/path, signed URL, browser session or private
faculty profile is read or captured.

## Technical audit

One M1–M9 technical audit was performed after implementation.

- **MAJOR — fixed:** Research Runtime had no shared concurrent-request ceiling.
  A fixed eight-request cap now applies before any outbound provider request.
- **MAJOR — fixed:** the first identity record reused observed ORCID as if it
  were confirmed identity. Observed and candidate-confirmed ORCID are now
  separate fields and confirmation is explicit.
- **MAJOR — fixed:** normalized publication snapshots initially relied only on
  the raw provider-response cap. Repository persistence now rejects snapshots
  larger than 64 KiB.
- **MAJOR — fixed:** SQLite uniqueness allowed duplicate identities when
  institution was `NULL`. The repository now performs normalized, null-safe
  Assignment-scoped duplicate validation transactionally.
- **MAJOR — fixed:** Course metadata could be selected as provenance for a
  manual Assignment with no Course. It now fails with `INVALID_PROVENANCE`.
- **MINOR:** Assignment state uses bounded per-identity observation/candidate
  reads. This is intentionally limited to 100 identities but remains an N+1
  query pattern; the measured target fixture is healthy and a batched query can
  replace it if real Assignment data approaches the bound.
- **INFORMATIONAL:** the older generic OpenAlex Research search retains its
  existing configured-key policy, while the narrowly scoped M9 public Author
  and works-by-author operations permit documented unauthenticated public API
  access. M9 does not alter the older product contract.
- **INFORMATIONAL:** provider cancellation exists in the shared Research
  Runtime; the first Faculty Scout surface relies on its bounded request and
  timeout states rather than permanently exposing a cancel control.

No remaining M9-caused BLOCKING or MAJOR finding was identified after focused,
security and broad regression.

## Validation

M9 focused validation includes 25 domain/migration checks, seven IPC/security
checks, nine UI contract checks and one scale suite. It covers fresh v22,
v21→v22, no fabrication, manual and exact canonical observations, null-safe
deduplication, identity ambiguity/confirmation, malformed/rate-limited provider
responses, author-filtered works, relevance, explicit Dossier import, M8/M6
non-effects, ownership, restart/offline behavior and six discipline-neutral
fixtures.

Real Electron validation used synthetic fixtures in Dark, Light, System→Dark
and System→Light at 1680×1050 @2x, 1440×900 @2x and 1200×780 @1x. Scenarios
covered empty, confirmed, ambiguous and long-content Faculty Scout states.
Automated geometry checks found no horizontal overflow or escaped controls.

Broad regression, security/release-health and packaged validation results are
recorded in the final milestone report and implementation commit evidence.

## Packaged validation

The preload allowlist change required a private ARM64 validation package. The
integrated M9 runtime produced `AegisUi-2.7.1-arm64.dmg` with SHA-256
`0d8007f1ed8f50c1d3db13c033e5679e8a136f360e760aaccde652ebdd2ffeb6`.
The image mounted successfully and AegisUi launched from that mounted volume.

The mounted `app.asar` physically contained all four M9 modules, the M9 preload
channels and Citation.js. The packaged Calendar helper was present. `node-pty`
was physically unpacked, executable, ad-hoc signed and ARM64. Runtime validation
confirmed schema v22, the synthetic Faculty Scout surface, Citation.js
rendering, Compute/Research/Academic-AI typed boundaries and authenticated
terminal. Renderer `require` and `process` were absent, raw `ipcRenderer` was not
exposed, and the preload bridge was available. The final bundle passed strict
deep signature verification.

The first local pnpm staging attempt was rejected during validation because its
ASAR contained absolute dependency symlinks back to the worktree. It was not
accepted or reported as launched. The validation artifact was rebuilt from a
hoisted physical production dependency tree, `node-pty` was rebuilt for
Electron ARM64, the ASAR was recreated and the complete mount/signature/launch
checks were repeated. The validated DMG remains a local artifact only.

The current STUD script inventory passes 47 of 47 suites. The broad Aegis
aggregator retains two inherited environment outcomes: TomTom returns HTTP 401
and `AISSTREAM_API_KEY` is absent in Map provider validation; SAT/Celestrak is
skipped when its environment is unavailable. These are not represented as M9
passes or M9 regressions.

## Known limitations and M10 boundary

M9 does not search private/institutional profiles, scrape Google Scholar, infer
identity from name alone, evaluate publication quality, acquire full text,
automatically add sources, create Evidence, resolve citation support, invoke AI,
schedule workers or submit work. OpenAlex coverage can be incomplete or stale
and ambiguous identity remains a human decision.

The next product milestone is M10 — Composition Plan and Draft Versions; it was
not started here.
