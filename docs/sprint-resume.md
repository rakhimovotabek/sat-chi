# Active recovery/deletion/redesign sprint — 2026-10-31

New user scope begins at clean `d7041b2`, branch `feature/universal-book-import`.
Priority order: missing RPC/Books/Daily Homework fixes → actual safe Homework
Delete → College Board selector rename to **SBank** without changing IDs →
comprehensive UI/animated analytics, then full responsive/history acceptance.
User chose **follow the four references closely, balancing light/dark styles**.
Do not push/deploy/apply hosted migrations/modify real student records.

First milestone is implemented and verified; [database-recovery.md](database-recovery.md)
has exact actual hosted metadata, plans, commands/results and release boundary.
Hosted project `ileffhbbaomfimwulvpw` has82 migrations through20261015000800;
Battle/Progress RPCs are genuinely absent. Existing Book/Daily RPC grants/signatures
are present. Production was queried read-only for schema/statistics/plans only.
No real user was signed in or student result returned/modified.

Implemented: typed backend errors, fatal Battle refresh-stop/explicit retry with
saved seat retained, Books catalog survives explicitly diagnosed progress failure,
admin skips unused progress request; additive migrations012/013 bound Daily
projection/paging and privately cache exact Book readiness independently of approval.
All actual import/publication/grading/Realtime/multiplayer regressions pass.

Checks: actual-service combined **12/12**; real-service native pages/reload/fresh
login at390/768/1366 **1/1**; actual PG17 query/cache comparisons **2/2**; diagnostic
unit **1/1**, failure-fixture browsers **2/2**, zero skips. Full historical suite
not rerun. Logs `/tmp/satchi-critical-services-verified.log`,
`/tmp/satchi-critical-native.log`, `/tmp/satchi-query-final.log`,
`/tmp/satchi-backend-error-browser.log`. Lint/build final logs use recovery prefix.

Next: finish Homework deletion. Draft SQL is in ignored
`local-imports/development/homework-deletion.sql` (**not applied/tested/committed**).
It must be reviewed, moved to a new migration and tested before integration.
`src/features/learning/HomeworkActions.jsx` is a new **unused/unverified** draft
confirmation/actions component; keep it out of verified milestone commits until
wired and tested. It uses server preview counts, explicit checkbox, idempotent
Delete RPC and distinguishes permanent/retained results. Full draft coverage:
soft-delete/safe hard-delete, audit snapshot, pending access/session guards,
parent locks, recurring cutoffs/current counters, no shared-question deletion.

Known draft issues to resolve before tests:
- Daily directory currently filters tombstones in ordered/page CTE but **total
  count also needs filtering before pagination**. Rewrite the scheduled CTE union
  as a narrow joined candidate scope with t.deleted_at null for directory only.
  Historical reporting retains due past/submitted data; it stops future canceled
  obligations and daily stats read the retained historical projection.
- `homework_management_directory` draft lists latest200 one-time definitions;
  add bounded paging/search, plus recurring support if replacing its100-template
  UI cap. Must show unassigned/draft and paused/archived eligible definitions.
- Wire shared Actions into one-time and recurring manager; preserve per-student
  results links and original edit/history workflows. Add deletion outcome status.
- Test all requested deletion cases, permissions, purge rejection for any history,
  exact progress/grade invariance, raw pending access, fresh login/reload and actual
  concurrent start/submission/deletion. Parent lock order: definition → assignment
  → session; daily save/Check/finish locks must also lock its template.

Prior continuation evidence remains below for orientation; do not repeat successful
service setup investigations. Existing tool cache is intact. Run heavy suites
serially on3816MiB laptop. One redundant just-started test was interrupted after a
selector replacement failed to match; its own stopped PostgreSQL/temp directory
was cleaned up before the successful full rerun. No service is intentionally left
running after the verified first milestone.

---

# SAT’chi recovery checkpoint — 2026-10-31

Branch: `feature/universal-book-import`. Continuation began clean at `b0c4072`.
Latest verified implementation: **`f3ccc48a385012b7afb8db19fe3edf53e1bdecb5`**.
The documentation checkpoint follows it. Inspect `git status --short --branch`
and `git log -10 --oneline` before modifying; later work may exist.

Read [the continuation acceptance report](continuation-acceptance.md) for the
full evidence matrix and [major sprint report](major-development-sprint.md) for
product context. Do not repeat successful service/tool investigations or reread
the whole codebase. No new Math corpus authorization/export has appeared.

## Implemented and verified in this continuation

1. **Actual isolated backend:** official Storage API 1.81.0/file backend, Edge
   Runtime 1.77.4 user workers, Realtime 2.143.3 beside preserved native PostgreSQL
   17.11/PostgREST 14.1/Auth v2.197.0. Combined suite **12/12**, zero skips. Actual
   30-question ZIP, six assets, durable draft, private denial, correction/replacement,
   retry/publication,
   student MCQ/SPR, Bank canonical identity, hide/archive/restore/history. Separate
   actual WAL/WebSocket member/outsider test **1/1**. Cache/setup, safe rootfs
   extraction, role/listener/plugin/path fixes and cleanup are done. No need to
   install Docker or modify local system services.
2. **Battles:** complete real 1v1/2v2/3v3 and twenty-client concurrent room with
   exact histories; two-browser 2v2 offline/reload recovery; host teams/settings/
   kick and balanced replacement; whole-match/per-question/untimed timers,
   natural 30-second expiry; pool parity fix. Word Matching and typed Word have
   actual browser completion. Meaning Rush/Reverse Meaning and original imported
   R&W now finish full HTTP matches/history (**3/3**). Quick Match pairs compatible
   public 1v1s transactionally; four concurrent Math clients and actual two-browser
   Vocabulary complete (**2/2**). Same server state machine, no second subsystem.
3. **Animated analytics:** Progress daily line with real gaps/exact table;
   Dashboard existing per-day bar motion; admin Homework heatmap entry motion;
   all-time domain/skill/difficulty/source horizontal bars. Breakdown ordering now
   uses the same known-first-result denominator as displayed accuracy and keeps
   section context. Actual saved Checks verify four known/three correct (**75%**), one later
   correction, daily 50/100/100 and Algebra 75%; actual admin cells 100/0/unknown;
   no inferred time and unchanged original Check history. Normal/reduced motion,
   baseline/final geometry, keyboard table, no replay, reload/mobile are tested.
   No chart dependency/per-frame React animation state. Four supplied references
   were inspected; sample statistics were not copied.

Local implementation commits: `a960921`, `fa5aac0`, `1bdba1c`, `68e0407`,
`9df8029`, `f3ccc48`; checkpoint `5c5b951` and this checkpoint follow separately.

## Latest passing checks

All zero skips. Counts are per command; do not sum overlapping narratives.

- Focused units **7/7**: account/env isolation, chunk-safe secret log redaction,
  geometry and performance aggregation/sorting.
- Disposable SQL: lobby 2, timers 2, pool 1, matching + existing Battles 6, Quick 1.
  Matching-history source-change assertion also passed in its focused rerun.
- Actual services: combined 12, Realtime 1, twenty-client 1, natural-timer 1,
  host/timer-browser 1, matching-browser 1, Quick 2, R&W/Vocabulary 3, analytics 1.
- Original default-native two-browser regression **1/1**.
- Final browser fixtures: accuracy line+breakdown **4/4**; original daily bars
  **2/2** after the shared-animation change. One worker throughout.
- Final `npm run lint`, `npm run build`, `git diff --check` pass; detector has no
  findings. Full historical suite has not been rerun. No runtime/peak-memory
  performance claim; run heavy suites serially on this3816 MiB laptop.

Actual synthetic-account captures are committed under `docs/screenshots/analytics/`,
`real-services/`, `native-timer/` and `word-matching/`. Light theme, 1366×768 and
390×844 only. `native-timer` is deliberately the default-native mode. All screenshots
are disposable fixtures, not real student accounts.

## Next highest-value unfinished work

1. Backend boundary: actual **Storage file backend** is complete. S3/MinIO and
   hosted gateway/JWT behavior remain unverified. Add S3 acceptance only in another
   disposable local configuration; preserve the working default native setup.
   Maximum ZIP Edge benchmarking, richer diagnostics/recovery and JPEG/WebP full
   decoding remain open. No production URL/config is a test target.
2. Battles: full browser R&W/Meaning Rush/Reverse Meaning can reuse the completed
   HTTP fixtures in `tests/battle-reading-vocabulary-native.test.js` and existing
   browser helpers. Do not repeat backend-only narratives as a substitute. Failed
   request throttling remains a transport release dependency; SQL successful-call
   limits roll back on failure. Realtime presence/service restart/load, richer
   custom formats/host source edits and dedicated Battle ranking remain open.
3. Analytics: next extend **actual routed** `src/features/learning/Reporting.jsx`
   and its feature components, not unused `src/pages/*/Dashboard.jsx`. Implement
   measured time charts/coherent cross-panel filters and admin cohort metrics
   from authorized saved data. Existing activity controls scope only that panel;
   breakdown/cards are all time. No animated counters/new streak model/XP ledger,
   levels or achievements were implemented. Introduce explicit idempotent earning
   rules/security tests before displaying XP, not invented seed totals.
4. Math: **zero third-party conversions**. Preserved inventory: 2367 occurrences =
   1677 composite MCQs + 690 SPRs, 2060 candidate IDs; 140 collision groups / 447 occurrences =
   307 excess. All 2367 remain rights-blocked. Canonical live unique/already-satisfactory/
   missing-source/review/failure totals remain unknown without a sanitized export.
   Prior two original synthetic layouts / ten lossless crops are separate evidence.
   Complete the reusable crop-review UI and audited canonical application, but
   do not read/convert existing copyrighted sources or rewrite historical IDs
   without processing rights/export reconciliation. See `math-corpus-conversion.md`.
5. True dark theme, 768/1920 widths, broader accessibility, import/route polish and
   measured low-memory/runtime profiling remain open. Never turn Night Light into
   a claimed dark theme or infer duration from idle wall-clock time.

## Reproduce selected checks (serially)

```bash
git status --short --branch
git log -10 --oneline
npm run setup:test-tools       # only if cache missing
npm run setup:test-services    # pinned cache; only if missing
npm run test:realtime
npm run test:battles:reading
npm run test:battles:quick
npm run test:analytics:native
npm run test:sprint:services
node --test tests/native-environment.test.js tests/service-log.test.js tests/accuracy-geometry.test.js tests/performance-breakdown.test.js
npx playwright test tests/browser/accuracy-trend.spec.js tests/browser/performance-breakdown.spec.js tests/browser/progress-activity.spec.js --workers=1
npm run lint
npm run build
```

For changed SQL, run only relevant files via the existing disposable PostgreSQL
helper, e.g. `node --expose-gc --import ./scripts/testing/release-memory.js --test
--test-concurrency=1 tests/battle-quick-match.test.js`. Other exact Battle commands
are in README and focused evidence docs. Do not start PGlite/browser/service suites
concurrently to save time on this laptop.

New pending migrations: `20261031000700_battle_lobby_controls.sql`,
`20261031000800_battle_match_timers.sql`, `20261031000900_battle_pool_parity.sql`,
`20261031001000_battle_word_matching.sql`, `20261031001100_battle_quick_match.sql`,
plus all preceding checkpoint dependencies. Tested only on disposable copies.
Preserve IDs, original grades, frozen match snapshots and historical answers.

Useful temporary logs: `/tmp/satchi-official-final.log`,
`/tmp/satchi-realtime-focused.log`, `/tmp/satchi-battle-network.log`,
`/tmp/satchi-natural-timer.log`, `/tmp/satchi-word-matching-sql.log`,
`/tmp/satchi-quick-native.log`, `/tmp/satchi-reading-vocabulary.log`,
`/tmp/satchi-continuation-unit-final.log`, `/tmp/satchi-performance-native.log`,
`/tmp/satchi-performance-browser-verified.log`,
`/tmp/satchi-progress-bars-regression.log`, `/tmp/satchi-performance-lint.log`,
`/tmp/satchi-performance-build.log`, `/tmp/satchi-performance-design-check.json`.

All disposable services stopped after acceptance; the stale stopped directory
from the earlier interrupted service run was removed. No GitHub push, deployment,
hosted/production migration, real student/config write or real student-account
test occurred. Full requested sprint remains unfinished.
