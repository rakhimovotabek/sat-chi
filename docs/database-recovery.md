# Database recovery — 2026-10-31

Starting branch `feature/universal-book-import`, clean HEAD `d7041b2`. No hosted
migrations, API configuration changes or student-record writes were made.

## Actual target and migration drift

`.env.local` points Vite to **ileffhbbaomfimwulvpw.supabase.co**. It was inspected
without printing the API key. Read-only `supabase migration list --project-ref`
and catalog queries confirm migration history stops at **20261015000800**.
The October 30–31 Battle/Progress migrations are absent. Catalog inspection
confirms **no battle_action or progress_activity function**, rather than merely
a stale cache. Their required local signatures are `battle_action(p_action text,
p_data jsonb)` and `progress_activity(p_days integer,p_section text)`. Existing
Books and Daily Homework RPC signatures and authenticated grants are present;
anonymous execution is absent. [Catalog metadata](verification/hosted-schema-metadata.json).
No write-capable hosted schema-cache reload or migration repair was attempted.

The frontend now keeps structured database error codes. Missing/ambiguous RPCs,
missing columns/relationships, permissions and statement timeouts are distinct
from fetch/network/service availability. Battles stops automatic refresh retries
on a permanent backend error, retains the stored seat and offers explicit Retry
and Back actions. Genuine network recovery and member polling remain. The
Realtime callback no longer passes an event payload as a truthy forced-retry flag.

## Books request and bounded readiness

The catalog first requests `/rest/v1/books?...book_topics(questions(count))`, then
**POST /rest/v1/rpc/learning_book_progress**. Failure in that second request used
to discard the entire successful catalog with a generic content error. It now
keeps books available with an explicit progress-error/retry message; admins skip
the unused student-progress request. No missing progress is reported as zero.

Read-only hosted `pg_stat_statements` for actual PostgREST RPC calls reports Book
progress mean about **3201ms**, maximum **7922ms**; chapter progress mean about
**1045ms**, maximum **6772ms**. A fresh failing request from a real student's
browser was not replayed: acceptance uses disposable clients. Do not present a
fixture-injected timeout as a captured production browser failure.

Migration `20261031001300_book_progress_readability_cache.sql` caches the exact
existing `(question_practicable OR book_package_question_ready)` rule privately,
separate from Book approval and Bank readiness. Existing transactional eligibility
updates refresh it after question/key/review/package/universal changes. It does
not broaden approval, expose answer tables, change IDs or rewrite grades. The
catalog materializes selected eligible IDs and checks the administrator role
once; chapter counts reuse the same cached predicate. Synthetic 1500-question
acceptance compares old/new Book and chapter results, invalid/restored options,
key changes, review withholding/reapproval and private-helper/table grants.
Original test writes require review approval, matching the real publication gate.

## Daily Homework execution analysis

Actual read-only hosted plans were captured without returning student rows:
[schedule](verification/hosted-daily-plan.json),
[directory](verification/hosted-directory-plan.json). At capture, there were
11 templates,35 revisions,93 enrollments,173 opened instances. The schedule plan
returned2014 eligible occurrences in **31.8ms**; the full directory projection
measured **439.4ms**. The reported timeout was **not reproduced in this sample**.
Historical actual RPC statistics include directory maximum **3137ms** and report
maximum **5249ms**; these do not prove current steady-state performance.

The old directory materialized all detailed rows, including correlated active-item
counts and wide JSON-backed revision projections, before limiting the display to
50. Migration `20261031001200_daily_homework_query_bounds.sql` counts a narrow
schedule/instance union, orders/pages first, then projects details for at most50.
It adds an ID tie-breaker for same-title rows and a window-range index. Revision
selection is materialized per template/day before enrollment joins; original
window, timezone, local-midnight, version and deduplication semantics are retained.
No timeout setting is increased. Reports reuse the bounded schedule projection.

Disposable PostgreSQL17 plans and exact-result comparisons use40 original
synthetic templates/five students/31days,6201 rows including the original fixture,
and2000 opened synthetic sessions. Schedule-only execution was about22.6→22.9ms
(no improvement claimed there); detailed directory **128.4→46.9ms**. Book progress
on1531 eligible questions measured **185.1→15.0ms**. These are local single-run
measurements, not production guarantees. Saved plan artifacts:
[daily](verification/daily-query-plans.json),
[Books](verification/book-progress-plans.json).

## Isolation and release boundary

Use `npm run dev:isolated`/`npm run dev:platform` for existing disposable
migration-complete development environments. Ordinary `npm run dev` still honors
`.env.local`; the hosted schema remains old until a separately authorized release.
Do not claim the hosted-backed localhost errors are gone after local-only tests.
The new cache migration backfills eligibility metadata only, never student history.
All earlier pending migrations must be reviewed/applied in order in isolation,
then separately authorized for production. A cache notification alone cannot
create absent functions. PostgREST's documented
[error categories](https://docs.postgrest.org/en/v14/references/errors.html)
distinguish PGRST202 from permission/network errors.

Verification results and the next priority are maintained in `sprint-resume.md`.


## Verified first milestone

- Real Supabase services + browser import/multiplayer regression: **12/12**, zero
  skips (`/tmp/satchi-critical-services-verified.log`). The typed-word test needed
  a precise spinbutton selector; the successful full rerun includes it.
- Real Auth/Storage/Edge/Realtime native page check: **1/1**, zero skips
  (`/tmp/satchi-critical-native.log`), student and admin,390/768/1366px, reloads and
  fresh login, no runtime errors or document overflow. The test uses one browser
  context at a time and tests viewport changes without repeated cold navigation.
- Actual PostgreSQL17 query/cache regressions: **2/2**, zero skips
  (`/tmp/satchi-query-final.log`). Exact original/cached counts and directory/
  report/schedule outputs match. Plans are committed above.
- Diagnostic unit **1/1**; browser failure fixtures **2/2**
  (`/tmp/satchi-backend-error-{unit,browser}.log`). The latter deliberately inject
  missing RPC/timeout responses and prove no automatic schema-error reconnect
  loop, retained seat, explicit retry and accurate Progress/Books diagnostics.

Hosted-backed `npm run dev` remains on the older schema by design. Isolated
verification must not be reported as a production repair or deployment.
