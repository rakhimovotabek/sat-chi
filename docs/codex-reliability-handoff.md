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
