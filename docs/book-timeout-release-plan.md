# Targeted Book timeout release

2026-10-09 (Asia/Tashkent). Continue from production commit `f621312` and the four already applied October8 migrations. Do not replay those migrations or turn the gate off.

## Diagnosis and reviewed fix

The full restored PostgreSQL17 plan evaluated Book eligibility against all 7,572 questions before joining a two-question leaf topic. Selection took 7,346.928ms locally; production's authenticated role has an 8s statement timeout. The same approval helper ran repeatedly in the Book catalog's nested question counts under student RLS. The expected topic/review indexes already exist. Production had no observed lock waits; a bounded production read-only plan measured the maintenance hook at 5.967ms. Provider logs returned two `57014` events in the failed smoke-test window.

`20261009000100_book_approval_cache.sql` caches the exact existing Book approval rule in the existing private eligibility table. It does not substitute the different Question Bank eligibility rule. New transactional triggers refresh that field for question, answer, open-key, review, package and topic inputs, including old/new review entities and package book IDs. The helper's function identity and existing permissions remain intact. The private evaluator/cache are not exposed to students. Missing cache entries fail closed.

Practice snapshot selection materializes only selected topic questions before expensive eligibility checks. Snapshot fields, ordering, the 500-question limit, frozen keys, existing resume behavior, answer revisions and history are unchanged. No existing answers, sessions, grades, Homework or Storage rows are updated by this migration.

Full restored-data staging checks found zero differences between cached/original approval decisions and unchanged protected application rows. Topic-first startup took approximately58ms including the local command; actual isolated PostgREST requests returned Book list143ms, topics6ms, progress55ms and startup18ms. Revision-aware saving passed and unmarked legacy writes returned426. These measurements describe staging, not guaranteed production latency.

Focused tests cover source edits, review status/warnings/type changes, open keys, packages, question topic moves, private permissions and frozen practice preservation. Backup restore testing now skips migrations already recorded in the archive, rehearses only missing release migrations, checks approval equivalence and executes real student RLS/startup with the unchanged8s limit on the full dataset.

## Execution sequence

1. Confirm production gate remains `maintenance` with zero exemptions and signup remains disabled. Preserve prior operator evidence and the original signup setting. Verify target project/repository/site and the published application version.
2. Use the fresh restricted backup at `/home/otabek/satchi-release-backups/20261008T190945Z`. Require successful isolated PostgreSQL17 restore, the single new migration rehearsal, protected-row/Storage checks, and complete snapshot asset verification before applying it. No secrets or private inventories belong in Git.
3. Capture the current protected-row baseline and existing affected function definitions/ACLs privately. Run `supabase db push --linked --dry-run --skip-vault`; require exactly `20261009000100_book_approval_cache.sql`. Apply with `supabase db push --linked --skip-vault --yes`. Stop on failure; never mark a failed migration applied manually.
4. Verify migration history, cache equivalence and protected rows with maintenance still closed. No frontend API-contract change is needed. Commit/push only reviewed source, tests and sanitized documentation; confirm Netlify publishes the matching commit and the application asset remains the expected version.
5. Add only the two authorized active verification users to the documented maintenance allowlist. Run actual authenticated production browser checks: Book catalog/chapter/topic navigation and startup, questions/images, Check/explanation, acknowledged save/reload/logout recovery, Question Bank filters, Homework editing/direct/group delivery/completion/recurring work, three admin review actions, stale saves and cached legacy rejection.
6. Any critical failure closes the allowlist again and retains `maintenance`; document disposable IDs and preserve existing history. Prefer forward repair. The previous Book function definitions are recorded privately for narrowly scoped recovery, but restoring the slow path is not grounds for reopening the site.
7. Only after all critical checks pass, switch to `compatible`, restore the original signup setting if enabled, and verify marked saves succeed while unmarked clients receive426. Never use `off` on this migrated backend. Record final publication, verification, cleanup and admission state in the execution report.

Storage remains operational under [storage-independent-release-plan.md](storage-independent-release-plan.md). This targeted migration introduces no additional Storage or account-management dependency.

Logs were queried through the supported [Supabase Management API log procedure](https://supabase.com/docs/guides/observability/advanced-log-filtering), with a bounded time window; private logs are retained outside Git.
