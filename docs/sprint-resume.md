# SAT’chi continuation checkpoint — 2026-10-31

Required branch: `feature/universal-book-import`.
Start: `f23032d` with existing uncommitted importer work, preserved and included
in the tested package milestone. Implementation HEAD: `a8a225a`. This checkpoint
is committed immediately after it; final checkout HEAD is that documentation-only
child (`git rev-parse HEAD` / `git log -5 --oneline` gives the exact checkout ID).

Local implementation commits:

1. `f1b9778` — original 30-question fixture, CLI, digest validation, schema fixes.
2. `185558f` — metadata-only Math corpus inventory and ID collision report.
3. `46df194` — mask Battle current-round score/order; reject impossible pools.
4. `a8a225a` — own canonical daily Progress aggregates, chart and accessible table.

## Evidence and current limits

- Import: 10 tests pass, including 3 actual disposable SQL tests and 7 parser/
  authorization/CLI checks. Four fixture browser tests pass. Full browser upload,
  Auth/Storage/Edge/draft/publish/student-history flow remains **BLOCKED**.
- Math: every record in three available structured local ZIPs inventoried: 2367
  occurrences, 2060 distinct candidate IDs, 1677 composite MCQs, 690 SPR. All
  rights unverified. HardBook: 140 colliding source-ID groups / 447 occurrences.
  Zero actual conversions. Entire current database total is **UNKNOWN**, not 2060.
  Six more Math sources exist only as historical package reports; see
  `docs/math-corpus-conversion.md` for the complete per-source local scope.
- Battles: five actual PostgreSQL tests pass, using independent authenticated
  roles for 1v1/2v2/3v3/20-player, two vocabulary modes, answer privacy, deadlines,
  retries, history, membership, host transfer and pool rollback. Sequential
  clients only. Live Realtime/concurrency/reconnect remain unverified.
- Progress: three SQL tests pass; new checks prove 10 distinct / 7 first-correct /
  3 corrected / 70%, preserved across Books/Bank repeats, empty scope and separate
  account. Two browser fixture tests pass for exact bars, normal/reduced motion,
  filters, keyboard table, reload and laptop/mobile overflow. Full integration,
  source filtering, date-boundary/DST regressions, line charts, animated counters,
  full motion system and domain drilldown remain open.
- Additional SAT numeric and canonical-history regressions: 3 pass (1 pure + 2 SQL).
- Math metadata tests: 4 pure Python tests pass. No assets are opened by the audit.
- Unique focused totals: **12 unit (including 4 Python), 13 SQL, 6 browser fixture
  tests passed; zero skips/failures in final focused runs**. Full suite not run.
  Earlier SQL alias syntax and a browser status-locator conflict were corrected.
- ESLint and Vite production build pass. Mechanical UI detector: `[]`.
  Screenshot artifacts under `docs/screenshots/sprint/progress-*.png` are synthetic.
  Existing import/Battle screenshots remain available. New theme/tablet/1920-wide
  checks and performance measurements have not run; no performance claim.
- XP ledger/levels/streak redesign/badges/XP leaderboards: **NOT IMPLEMENTED** in
  this continuation. Existing statistics/streak behavior was retained. No Battle
  XP is awarded. Admin metrics/heatmaps/new insights: **NOT IMPLEMENTED** here.

## Reproduce without production credentials

```bash
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/universal-acceptance.test.js tests/universal-book.test.js tests/import-authorization.test.js
python3 tests/math-corpus-audit.py
python3 scripts/imports/audit-math-corpus.py --packages /home/otabek/Desktop
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/battles.test.js tests/first-attempt-statistics.test.js tests/sat-numeric-response.test.js tests/shared-question-history.test.js
npx playwright test tests/browser/universal-book-preview.spec.js tests/browser/progress-activity.spec.js --workers=1
npm run lint
npm run build
```

The SQL helper prints `pglite://memory` before writes; guard rejects hosted URLs,
credentials and missing explicit loopback ports. No dotenv reads in write tests.
Playwright starts Vite with explicit loopback URL/key overrides; all shown REST
journeys use synthetic fixtures. Do not start plain Vite and perform writes using
`.env.local`. No development server is intentionally left running.

`npm run test:platform` was attempted and fails before startup at absent
`/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin/postgres`.
Docker and Deno are also absent. Do not substitute production endpoints. PGlite
is the actual embedded PostgreSQL used, not a running Supabase/Auth/Storage stack.
Native prerequisites: `docs/platform-improvements-report.md`.

## Next unfinished work, in specification order

1. Provision isolated Supabase/native prerequisites, then complete actual admin
   ZIP upload → draft → corrections → publication → student Books/Bank → persisted
   MCQ/SPR history → hide/restore acceptance. Add missing duplicate-candidate and
   grouped validation diagnostics. Mixed-subject packages/multiple explanations
   remain unsupported; two separate subject packages are currently required.
2. Obtain sanitized current canonical Math export plus processing rights. Resolve
   HardBook duplicate IDs and MathBook 3 local 418 versus historical 414 records.
   Run metadata audit first; no PDF extraction/cropping until rights are verified.
   Implement reversible crop proposal/review/apply UI and run authorized batches.
3. Real independent network Battle clients, simultaneous last-slot joins,
   transport throttling and reconnect/Realtime tests. Vocabulary pool rejection
   still happens at start; bring it to creation. Complete typed/matching modes,
   source/topic selection UI, custom settings, total timers and Quick Match.
4. Extend analytics with midnight/DST fixtures, source and domain filters,
   meaningful review links, animated counters/lines and viewport-aware motion.
5. Add audited server XP events with replay protection and stable event identity,
   then levels, badges and privacy-safe leaderboards. Reuse existing canonical
   events; never award from a client-supplied amount.
6. Admin Homework/cohort analytics and question heatmap from real authorized
   aggregates. Finish theme/responsive/accessibility/performance regressions.

New local pending migrations: `20261031000200_battle_answer_privacy_and_pool.sql`
and `20261031000300_progress_activity.sql`. Prior migrations, including import
ownership, remain prerequisites. No backfill or existing-grade rewrite; each new
migration's dependencies/permissions are documented in its feature report. Review
all migrations against a disposable copy before separately authorized release.

**No GitHub push, hosted migration, production account/data write or deployment
occurred.** No remote PR was created. Full sprint remains unfinished. No work is
promised after this session ends.
