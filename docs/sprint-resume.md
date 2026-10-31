# UI redesign checkpoint — 2026-10-31

Resumed from `ba996ca` on `feature/universal-book-import`. User changed priority to
visual redesign, then imposed a battery/time limit. No hosted changes, push or deployment.

Implemented a rounded academic design system, persistent Light/Dark/System themes,
local licensed Manrope font, shared controls/cards/navigation/dialog/table/skeleton
surfaces, responsive student/admin workspaces and short navigation transitions.
Dashboard composition, Progress overview/activity/heatmap, book completion rings,
Question Bank filter framing, vocabulary counters, solving states, admin quick
links and Battle landing/lobby/team/readiness/round/result presentation now use it.
AnimatedValue and ActivityChart animate actual saved values with stable accessible
values, visibility/hidden-tab suspension and reduced-motion support. No backend,
scoring or grading policy changed; SBank IDs and Homework deletion are preserved.

Commits: `67e2a02` establishes shared themes/design system; `138c9b0` refines
learning/analytics/Battles.

Verification this continuation:
- Final lint and production build pass (logs `/tmp/satchi-redesign-final-*.log`).
- Theme storage/system/restricted-storage unit: **1/1**.
- Focused Progress/performance/SBank browsers: **11/11**.
- Broader Books/practice/tools/motion/Settings run: **24/30 initially passed**.
  Five stale tests expected earlier explanation policy, old input labels or the
  former JSON-import button. Updated tests reflect behavior already present at
  `ba996ca`; no grading/explanation business logic was changed. The sixth failed
  during initial account loading. All **six targeted reruns passed**. Entire
  30-case batch was not rerun after those test updates.
- Real local Auth/Postgres/PostgREST walkthrough: **1/1**, repeated successfully
  after fixes. Covers 23 student/admin routes × two themes ×390/768/1366 widths
  (**138 combinations**), plus Battle creation/readiness at all widths/themes,
  refresh/login and exact equality of saved answer/Check history before/after.
  Actual fixture metrics: two distinct questions, 50% first accuracy, two eventually
  correct; no invented student values. Found/fixed a768px Homework overflow caused
  by an absolutely positioned hidden assignment label escaping the table.
- Final native evidence: `.impeccable/review/redesign/manifest.json` and54 PNGs.
  Earlier captures under test-results were removed by Playwright's normal cleanup;
  native captures now live outside that cleaned directory.
- Manual detector ran once: thick result border and width animation warnings;
  both mechanical issues corrected. No new raster illustration assets.

Finish status / next steps:
1. Fresh finish review found input contrast issues: light Question Bank “Search
   book titles” appears charcoal with a dark placeholder; dark Battle invitation
   input looks gray. Diagnose theme/control state, fix, recapture and get the
   reviewer verdict. Review coverage is partial; see its report when available.
   Do not claim whole-surface visual acceptance.
2. DESIGN.md and .impeccable/design.json now document implemented tokens and
   motion. JSON parses; documentation explicitly records pending visual review.
3. Live multiplayer/countdown/round/final-result browser regression, Homework
   deletion regression and extended lower-page visual coverage were not rerun in
   this UI continuation. Previous verified functional milestones remain documented
   below; do not label these additional checks complete.
4. Inspect git status/log before editing. Code-first style decisions remain pinned;
   no further style interview is needed. Run memory-heavy suites serially.

Review locally with `npm run dev:isolated` (disposable PG/PostgREST, fixture Auth
and Storage); `npm run dev:platform` exercises the fuller local platform. Ordinary
`npm run dev` still uses hosted credentials from .env.local and hosted schema drift
remains untouched. Never apply hosted migrations merely to make that command work.

---

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

Homework deletion is now implemented and verified in isolation. See
[homework-deletion.md](homework-deletion.md). Pending migration014 adds safe
permanent removal for unused definitions, tombstones for work/history, private
audit snapshots, roster/recurrence/current-count/session guards and canceled study
tasks. Admin managers include search/pages and Actions; Delete has server preview,
explicit checkbox and retained-history link. Submitted inputs, grade events and
canonical metrics remain equal. Real refresh/fresh-login, recurring UI deletion,
three start/delete races, submission/delete and duplicate requests pass.

Deletion checks: focused database/model/daily regressions **26/26**, real Auth/
PostgreSQL/PostgREST browser/network **1/1**, zero skips; lint/build/detector pass.
Native dialog screenshots at1366/768/390 are in `docs/screenshots/homework-deletion/`.
Logs `/tmp/satchi-homework-delete-regressions-final.log`,
`/tmp/satchi-homework-delete-native-final.log`,
`/tmp/satchi-homework-delete-lint-final.log`, `/tmp/satchi-homework-delete-build.log`.
The native deletion suite uses fixture Storage/Edge transport, which deletion does
not call. No full historical suite claim. Direct archived-recurring resume remains
rejected until explicit Restore to paused, preserving the old safety contract.

SBank rename is verified. Visible source selector/headings/details now say **SBank**;
`college-board` source value/DOM ID/per-account storage keys stay intact. Existing
SAT'chi Bank and SBank state remain independent; unavailable licensed content is
not queried, merged or assigned fake counts. College Board external link/taxonomy
attribution remains accurate and optional. No third-party import occurred.
Seven source-browser scenarios pass, including saved answers/marks, old-key
persistence, independent filters, keyboard focus and1366/768/390/320px. Lint/build
and detector pass. Logs `/tmp/satchi-sbank-browser.log`,
`/tmp/satchi-sbank-{lint,build}.log`. This is browser fixture coverage, not a new
hosted database/content acceptance claim.

**Next:** implement the user's premium full UI/analytics request: primary option3,
cohesive four-reference interpretation, clean blue/white light and navy/electric-
blue dark, distinctive energetic Battles, readable elegant other routes; measured
counters/rings/charts/microinteractions, reduced-motion, no generic repeated
entrance effects or heavy blur/graphics. User repeated priority order: database,
delete, SBank **before** redesign. No additional style clarification is needed.

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
