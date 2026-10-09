# Reliability investigation checkpoint

2026-10-09, Asia/Tashkent. Branch `main`. Verified implementation HEAD: `75488e3`; this report is saved in a subsequent documentation commit. Started from `1a46b62` (deployed application `f44a7f7`). **No push, deployment, production migration or production data change in this task.** Initial worktree was clean; existing work was preserved.

## Completed work and local commits

- `195d476`: retain failed/unsent study-time entries; shared SDK/keepalive client marker.
- `4a76a30`: indexed recurring pools, transactional validation and unseen-first reuse; pending 090003.
- `2913c85`: short relational attempt-history requests and API-cap pagination; realistic native fixtures.
- `e2a2265`: aggregate Book progress history once; pending 090004.
- `0a42d0e`: authenticated JPEG explanation rendering and native regression.
- `727aadc`: collect queued study-time retries at execution; session/user-specific queues.
- `26ea01a`: load all Vocabulary context passages in bounded pages; native before/after regression.
- `c5cee41`: scope admin dashboard counts and preserve completed history; pending 090005 and native regression. Typed-response predicate also supports historical rows without the legacy marker.
- `24ba829`: reusable native reliability gate, twelve-workflow adversarial browser suite and mobile 500-item regression.
- `ee612ff`: native regression proving typed Book checked/solved totals already work; suspicion not reproduced, no unnecessary query change.
- `75488e3`: canonical daily completion counter excludes timed partial submissions; native regression.

Nine functional findings repaired, plus one measured query optimization. All four requested reports are present. No source changes remain unverified by their targeted checks. This does not establish that every platform feature/provider configuration is bug-free.

## Final test results

| Check                             | Result                                                       | Verification boundary                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:reliability`        | **66 passed, 0 failed, 0 skipped**,302 seconds               | Mixed unit/PGlite/native SQL and real Chromium/Vite/PostgreSQL17.11/PostgREST14.1 journeys. Auth/Storage HTTP transports are fixtures.                     |
| Full unit/PGlite, serialized      | **199 tests: 183 passed, 1 failed, 15 skipped**, 348 seconds | Sole failure: existing C13 book-reset protective digest. Skips include native or additional-environment checks; not a claim of full live verification.     |
| Scoped Playwright regressions     | **90 passed**, 7.2 minutes                                   | Primarily mocked transport; SQL-adapter Homework/review cases. Not hosted Supabase verification.                                                           |
| Final scoped lint                 | **Passed**                                                   | All changed source/tests/helpers/runner; new partial-counter regression separately linted.                                                                 |
| Final build                       | **Passed**                                                   | Frontend sources unchanged after build; subsequent change only corrects pending SQL counter and its test.                                                  |
| Native before/after reproductions | **Confirmed**                                                | Broad pool cap, 500-ID HTTP431, 1,000-row attempt cap, JPEG explanation, context pagination, withdrawn dashboard count and timed-partial counter boundary. |

The native runner contains twelve adversarial browser workflows plus four dedicated Homework browser workflows. Dedicated large-practice/JPEG/context/dashboard/typed-progress tests add five focused browser/database tests. Native separate connections test races and permissions. Test counts include parent/child nodes and are not a count of hosted tests.

An earlier 65-check run also passed. The final 66-check run incorporates the new typed-progress coverage and corrected timed-partial count. The pause-interrupted full-unit run is not used as evidence. Heavy parallel testing previously caused browser timeouts; serialized runs passed. Harness mistakes (void204 parsing, null SQL JSON, wrong finish parameter, publication order) were corrected without changing application guards.

Logs persist outside Git at `/home/otabek/satchi-release-backups/reliability-*.log`. Important logs:

- `reliability-final-native.log`, `reliability-final-unit.log`, `reliability-final-browser.log`, `reliability-final-build.log`, `reliability-final-lint.log`.
- `reliability-large-transport-before.log`, `reliability-history-cap-before.log`, `reliability-history-cap-after.log`.
- `reliability-jpeg-before.log`, `reliability-jpeg-after.log`, `reliability-context-before.log`, `reliability-context-after.log`.
- `reliability-overview-before.log`, `reliability-partial-overview-before.log`, `reliability-open-progress-before.log` (the last passed, disproving the suspicion).

## Restart and run before a release

Tools persist after reboot at:

- `/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin` — PostgreSQL17.11.
- `/home/otabek/.cache/satchi-test-tools/postgrest14/postgrest` — PostgREST14.1.

From this repository:

```sh
npm run test:reliability
```

The runner discovers cache paths, sets the matching library path and validates versions. On another machine, provide `SATCHI_TEST_POSTGRES_BIN` and `SATCHI_TEST_POSTGREST`. Install Chromium through the project's Playwright tooling if missing. Required native tools cause a hard error when missing; tests cannot silently skip.

Each native test creates a fresh loopback cluster, applies migrations in order, launches its own Vite/PostgREST and disposable users, and cleans up. It never reads production database credentials. These clusters are not a persistent manual-testing environment.

For focused native runs:

```sh
export SATCHI_TEST_POSTGRES_BIN=/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin
export SATCHI_TEST_POSTGREST=/home/otabek/.cache/satchi-test-tools/postgrest14/postgrest
export LD_LIBRARY_PATH=/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/lib
node --test --test-concurrency=1 tests/real-user-reliability.test.js
```

Run heavy checks sequentially:

```sh
node --test --test-concurrency=1 tests/*.test.js
npm run test:e2e -- --workers=1
npm run build
```

Default unit runs without native paths skip native cases. Default Playwright uses mock/SQL-adapter transport. For the executed 90-test scope, use the files listed in `reliability-final-browser.log`/the answer report; the complete Playwright suite was not rerun in this checkpoint. Source-package pixel tests still require original packages. Some existing synthetic Homework fixtures have calendar-specific deadlines; renew those fixture dates before running after they expire, rather than weakening real deadline checks.

## Pending migrations and release requirements

Local only, in order after already released migrations:

1. `supabase/migrations/20261009000300_daily_homework_indexed_pool.sql`.
2. `supabase/migrations/20261009000400_book_progress_history.sql`.
3. `supabase/migrations/20261009000500_admin_homework_overview.sql`.

The four October8 migrations and090001/090002 were already deployed in previous work. Do not reapply them. Review the three new migrations and authorize a separate release before applying anything to production. Indexed pools preserve existing JSON versions and completed history; no new Storage-policy migration is required. Frontend repairs also need deployment approval. This task provides no such approval.

## Remaining problems and exact next steps

1. **C13 book-reset operator:** keep its protection intact. The test aborts with `Protected data changed: question_bank_eligibility`. Separately review intended deletions versus derived caches and shared history. Do not execute a real reset or remove the guard merely to obtain a green test.
2. **Exact study-time credit:** the heartbeat's wall-time guard and lack of idempotent batch identity can undercredit multi-position batches or make lost acknowledgements ambiguous. Next: reproduce with isolated actual heartbeat requests, design an atomic/idempotent time batch if warranted, and retain abuse/ownership safeguards. Current frontend repairs do not guarantee exact credit. Answer persistence is a separately verified revision contract.
3. **Managed services and long sessions:** fixture expired-JWT recovery passed; provider refresh/revocation, signed-URL expiry, many-hour mobile background eviction and storage quota/clearing still need an authorized staging/provider soak test. Do not use real student records.
4. **Other old audit risks:** very large group management, single-set Vocabulary caps, source-pixel accuracy and provider security configuration remain outside completed coverage. Reproduce before changing code.
5. **Release preparation:** review pending migrations/local commits, use the established backup/write-gate procedure if a future release is explicitly authorized, then perform disposable authenticated hosted verification. No deployment or production test writes now.

This is a manual continuation checkpoint, not a promise of automatic resumption after usage resets.


## Paused on user request: Check and authentication investigation (2026-10-09)

HEAD remains `e06ea61`, branch `main`. Current repairs and tests are uncommitted; preserve them. Nothing deployed/pushed; no production requests/migrations/data changes. No test suite is currently running: full unit run and shutdown experiment completed.

Confirmed Check defects and repairs:
- Successful Check called `state.reload()`, rendering ContentState and detaching question images. Native before: image detached, 0 document navigations, 2 signing requests and 1 image request. This was UI teardown, not document reload.
- `useContent.reload({background:true})` now keeps data/DOM mounted, reports failed refresh inline with retry, and retains current navigation position. Authoritative versions still refetch. Background retention is scoped to matching dependencies using loadedFor. Default callers retain original foreground behavior.
- Synchronous double clicks could enter before checking state updated, then send a cleared attempt ID after awaits. Added synchronous checkPending ref and captured event ID; added explicit button type.
- Owner-scoped bounded in-memory signing cache: 128 entries, 55-minute TTL for one-hour capability, promise deduplication, failed-entry removal and explicit retry invalidation. No persistent/shared-account capability cache. Preloads only next question (max 5 assets), retains max 10 preload Image objects, skips duplicate preload URLs. No compression/reimport/content changes.
- Modified source: src/features/books/useContent.js, src/features/player/Player.jsx, src/components/QuestionImage.jsx. New helpers: src/components/question-image-cache.js and question-image-source.js.

Tests/evidence (private logs outside Git under /home/otabek/satchi-release-backups):
- check-recovery-before.log reproduced image teardown; its 20 restart checks passed.
- check-recovery-after.log: 3 passed, including reference-image, four image options, open response and 20 genuine process restarts.
- check-recovery-final.log: 4 passed; slow/double Check, failed authoritative refresh retry, navigation, real reload/fresh login and 20 restarts. Grading/save acknowledgements compared with actual PG17/PostgREST rows. Check produced 0 document navigations, 0 signing requests, 0 image requests, no detachment.
- check-auth-complete-unit.log: 251 total, 241 passed, 10 failed, 0 skipped, 1147 seconds. First restart failure plus cascading children/parent; all other checks passed, including reset, concurrency, backup restoration and the new native Check coverage. Native Check measurements: reference 670ms, four options 169ms, open 118ms (observed action/settling spans, not provider latency benchmarks).
- check-auth-first.log: original reliability journey passed all 13 in isolation before repairs.
- question-image-cache.test.js: 2 passed. Full lint passed before final loadedFor tweak; rerun final lint/build still needed. Relevant Playwright regressions still needed.
- auth-shutdown-reproduction.log: immediate fresh login/raw process-close 8/8 persisted; tab-lifecycle-close 8/8 persisted. This experiment DID NOT reproduce loss or establish graceful close as its cure. Do not replace original failing assertion or claim an Auth fix from this result.
- Early adversarial harness used network abort with 5-second assertion despite SDK bounded GET backoff (1/2/4s); two synchronous clicks also exposed a real Check error. Corrected fault injection to explicit HTTP400 post-Check read rejection; actual grading/persistence stays native. One early stalled isolated test worker was stopped with only its descendants; temporary isolated directory may remain outside repository.

Authentication evidence/blocker:
- Modified tests/real-user-reliability.test.js: token-free Storage.getItem/removeItem trace installed before app scripts; original recovery assertions/timeouts unchanged. No application Auth change.
- Complete run confirms storedAuth:true immediately before close. After restart, FIRST SDK storage reads all stored:false, valid:false, hasUser:false, unexpired:false; NO recorded auth-key removal. Then /login. Authoritative saved answers were checked before shutdown. This is profile/storage loss across restart, not a reproduced grading/save conflict or SDK removal after reading a valid session. Exact Chromium shutdown/disk/origin mechanism remains unresolved.
- Added tests/auth-restart-shutdown.test.js to compare immediate shutdown modes. Raw control also passes; do not infer unsupported causality.
- Check flicker and this failure are independent: original restart workflow saves Homework answers without pressing Check.

Next steps on resume:
1. Inspect git diff/status; preserve all uncommitted files and appended handoff.
2. Investigate storage loss in COMPLETE-run conditions. Add origin/profile/process-exit diagnostics or private Chromium browser logs (no tokens), capture storage before app and profile persistence. Do not use storage injection, forced login, arbitrary sleeps, relaxed assertions or unsupported Auth changes to green the suite.
3. Fix actual reproduced shutdown/recovery cause; retain original native recovery assertion and verify DB answers after restart/fresh login. Then rerun complete native unit suite.
4. Run relevant browser specs (books, book-explanations, auth-stability, annotations, practice persistence), full lint and production build.
5. Commit verified changes locally, update readiness report with honest final GO/NO-GO; no deployment/push/production migrations. At pause: NO-GO, exact storage-loss mechanism unresolved.

Native tool environment: SATCHI_TEST_POSTGRES_BIN=/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin; SATCHI_TEST_POSTGREST=/home/otabek/.cache/satchi-test-tools/postgrest14/postgrest; LD_LIBRARY_PATH=/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/lib. Complete run used private SATCHI_BACKUP_ARCHIVE=/home/otabek/satchi-release-backups/20261008T190945Z/application.dump. Serialize heavy suites.

Offline aggregate original image file copies across backup directories: JPEG median 25,601B/p95 66,418/max122,588; PNG median2,853.5B/p95 82,516/max439,186; WebP median12,962B/p95 27,984/max45,720. Copies may duplicate across archives; not unique production asset counts. Native transport uses 1px PNG fixture, so production CDN/TTFB and original-pixel rendering are NOT verified. No assets reencoded or production accessed.


## Bounded final Check/restart checkpoint — 2026-10-09

Decision remains **NO-GO**. Check teardown, synchronous repeated-click entry and late background-snapshot regression have focused verified repairs. Loaded reference/choice images stay attached with zero document navigation or repeated signing/image requests during Check. Cache is memory-only, bounded, owner-scoped and cleared on account change; preloading covers only the next question. No production changes or new migrations.

Corrected full suite: 253 checks, 243 passed, 10 failed, zero skipped. First failure: browser restart loses Auth storage before the SDK's first read, despite session present before shutdown. Later failures cascade. Removing a duplicate Chromium disable-features switch fixes a confirmed launch configuration defect but does NOT solve the full-suite loss. No Auth assertions or revision protections were weakened. Repeated targeted restart successes must not be represented as resolving this blocker.

After final late-snapshot reconciliation: 14 focused unit regressions and 5 native PostgreSQL17/PostgREST/Chromium checks passed, including 20 process restarts and authoritative persisted-answer assertions. Complete suite was run before this final small reconciliation change; it was not repeated again given the unresolved blocker and user usage budget. Scoped browser/lint/build final counts are in docs/check-and-auth-recovery-report.md.

Next work must focus only on the first failing restart in tests/real-user-reliability.test.js: preserve the failing profile before teardown, compare origin/local-storage disk state before and after process shutdown, and distinguish Chromium/profile persistence from harness origin or teardown contamination. Do not force login, inject storage state, sleep, or relax recovery assertions to green the suite. Once root cause is fixed, repeat that journey and then the complete suite. Real managed Auth/Storage latency remains outside fixture-based native transport tests.

Private evidence: /home/otabek/satchi-release-backups/check-auth-final-complete-unit.log, check-final-reconciliation-native.log, check-final-persistence-unit.log, check-final-scoped-browser.log, check-final-lint.log, check-final-build.log. Backup contents/credentials remain outside Git. All testing used isolated data. No deployment/push/production migration authorized or performed in this task.

Verified source/test commit: `5c1deef` on main. Final scoped browser run: 44 passed, 1 failed stale-tab radio selection; unchanged isolated rerun passed 1/1. Do not hide this intermittent failure. Full lint/build passed. Docs are committed separately. Next targeted investigation should preserve first-failure evidence for both Auth storage disappearance and stale-tab initial state synchronization.
