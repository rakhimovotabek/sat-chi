# Reliability release readiness

Prepared locally on 2026-10-09, Asia/Tashkent, from `874da31`, with deployed application baseline `f44a7f7`. No production request, migration, deployment, GitHub push or student-data change was performed during this preparation. **Final decision: NO-GO.** The final full native run exposed an intermittent browser-restart authentication recovery failure. Its isolated rerun passes, but the first failure has not been explained or repaired. Do not release on the strength of targeted green reruns.

## Remaining unit failure

The protected book-reset failure was a real operator-script compatibility defect, not a reason to loosen data protection or skip the test. The script considered all `question_bank_eligibility` rows protected, although its explicit deletion of source questions intentionally cascades to those derived rows. It also lacked classifications for package metadata, source open keys, and practice open keys/manual reviews. Its transaction correctly aborted instead of partially deleting anything.

`scripts/books/delete-imported-content.sql` now captures source IDs before deletion and excludes only their source-owned cache/package rows from preservation hashes. Open practice keys and manual reviews use the same non-Book-session preservation scope as existing practice keys. Unknown tables remain protected. Tests retain shared Bank/Homework/Vocabulary snapshots, frozen open keys, review decisions, and indexed recurring pools, and prove that unexpected Vocabulary mutation aborts and rolls back source deletion. This operator is not a release step and must never be run as part of deployment.

## Reviewed repairs

There are nine functional findings and one measured optimization; the overnight report numbers them R01–R10.

| Finding | Reproduction and repair | Regression evidence / preservation |
| --- | --- | --- |
| R01: broad daily pool | Legacy save rejects >5,000 candidates even for 8/day. 090003 stores frozen candidates in indexed private rows and selects only the daily subset at start. | Native legacy error → repaired browser 7→8 save; >5,000 pool, next-day delivery, unchanged completed occurrence and legacy JSON version. |
| R02: unseen-first reuse | Replacement SQL lost never-assigned-first priority. 090003 restores it in both formats. | `homework-indexed-pool.test.js`: indexed and JSON versions, deduplication, exhausted pools and atomic invalid edits. |
| R03: unsent study time | Clearing the batch loses its unattempted remainder; queued flush captures before restored entries arrive. Retain/recollect entries and scope queue per session/user. | Five focused batching tests, actual student navigation/recovery journeys. Exact server credit is a known separate limitation. |
| R04: keepalive gate header | Raw page-hide request lacked SDK's client header. Both now use shared `20261008`. | Native browser request succeeds under compatible gate; unmarked writes rejected. No privileged browser credentials. |
| R05: large attempt request | 500 UUIDs in a URL cause real HTTP431. Query through session relationship instead. | Native before/after gateway/browser reproduction; unchanged owner RLS, 500-item Check/reload/mobile navigation. |
| R06: truncated attempt history | API caps responses at 1,000; later checks disappear. Stable bounded pagination restores history. | Native 1,001-row fixture; first item restores all checks, another Check and reload persist. No grading/history mutations. |
| R07: historical Book query | Question × owned-session joins multiply work. 090004 aggregates owner history once. | Actual PG17 old/new result equality, other-account isolation, 2,000 sessions / 6,000 items; measured improvement. This is the additional optimization. |
| R08: JPEG explanations | Strict Markdown renderer recognized PNG only. Same authorized loader now accepts JPG/JPEG. | Native authenticated explanation image after answer; package syntax remains restricted. Fixture bytes do not verify original source pixels/provider MIME. |
| R09: Vocabulary context | Study view requests only first ten supplied passages. Load bounded stable pages. | Native eleven passages before/after/reload; all existing content retained, no fabricated examples. |
| R10: monitoring scopes | Withdrawn rows counted active; daily history omitted. 090005 counts active one-time assignments and canonical daily completion, adds explicit labels, supports historical typed answers. | Native admin/student permission regression, unchanged completed history, timed partial submissions excluded, manual decisions reflected. |

The native suite includes separate student/admin journeys, three simultaneous students, two books, Question Bank, direct/group Homework, reviews, reload/logout/browser-process restart, lost acknowledgements, expired fixture JWT, interrupted submission and stale concurrent tabs. Database rows are checked independently of UI success. No new silent loss of an acknowledged answer was reproduced. All evidence is local; Auth and Storage HTTP transports are fixtures, while PostgreSQL17/PostgREST14 and browser/application requests are real.

## Additional release-blocking pagination finding

The complete diagnostic browser run caught **R11 (Medium)**: Books returned to page one after clicking Next quickly. Its retained trace showed successful requests for offset0 → offset50 → offset0, followed by 50 cards instead of5. On initial mount, a search effect scheduled a 250ms callback which unconditionally reset paging even though `search` already equaled `query`. The same effect exists in BookSelect, Vocabulary catalog and Vocabulary Study.

The smallest repair skips scheduling when search/query already match and tracks both in the effect dependencies. It preserves debouncing and resets paging when the search actually changes. No database contract, saved answer, grading or content changes. Source files: `src/features/books/{Books,BookSelect}.jsx`, `src/features/learning/{Vocabulary,VocabularyStudy}.jsx`.

Controlled browser regressions hold only the 250ms UI debounce, load page one, move to page two, then release that callback. Old source reproduced the reset in Books (5→50) and Vocabulary Study (5→100); selector/catalog regressions also cover the shared pattern. Repaired source passes all four plus the original large-catalog search/selection case. Native coverage uses actual PG17/PostgREST14 catalogs with disposable student/admin accounts and verifies successful page-offset requests and unchanged stored catalog counts.

The first controlled-clock harness attempt suspended SDK Auth initialization and was discarded as application evidence. The first native assertion expected HTTP200; actual PostgREST correctly returned206 for partial catalog responses. It was corrected to accept successful200/206 responses, retaining row/count assertions. Neither harness error is counted as an application bug. Original calculator startup timeout remains unexplained/not reproduced; traces/screenshots now persist on future failures.

## Migration review

Apply only the following new files, in this order, after the already released October8 files and 090001/090002. Each file is transactional. Do not reapply or manually mark any older migration.

1. **20261009000300_daily_homework_indexed_pool.sql**: add nullable `pool_count`, create private `daily_homework_pool_questions` with `(version_id,question_id)` primary key, replace save/start/template-list functions. Requires existing daily version/roster/window/scheduling helpers, assignment-compatible `bank_candidate_ids`, maintained eligibility, frozen open keys and snapshot asset authorization. Historical versions get null marker and keep their JSON; no backfill or source-question FK can erase frozen pools. Active admins alone can read keys, students cannot read/write the private pool; existing RPC ACLs and signatures remain. Template locks serialize concurrent start/edit; insufficient pools/recipients roll back the whole save. New pool writes remain proportional to eligible content; no arbitrary cap and no claim of constant-cost saves.
2. **20261009000400_book_progress_history.sql**: replace only `book_practice_progress(uuid)` with owner-history aggregation. Active-user guard, publication/approval eligibility and JSON/count semantics stay intact. No stored progress update, index build or table rewrite. Native historical-data comparisons verify equivalent output and bounded timing.
3. **20261009000500_admin_homework_overview.sql**: replace only `admin_overview()`. Active admin check and fixed empty search path remain. Existing response keys remain; daily fields are additive. The completed count uses `daily_homework_instances.completed_at`, not partial session submission. No grading, assignment or student row changes.

No DROP, TRUNCATE, source import, answer rewrite, Storage operation, policy weakening or concurrency bypass appears in these three migrations. Replacement functions keep ACLs/argument defaults/results. New pool grants allow authenticated SELECT subject to admin RLS and service-role access; authenticated INSERT/UPDATE/DELETE are denied. Security-definer functions use qualified objects and empty search paths. 090004/090005 are logically independent replacements but the reviewed manifest order should be retained.

Reviewed migration fingerprints (SHA256; no migration SQL was edited during this task):

```text
090003  00cf170211388d66e33e66acd091b2a866a571ab484e8b496b3d7056711fc540
090004  ae0eaea504f22f49127fe1849bfccb0e9857f4ccfb372a69a3d7f1604733b3b2
090005  fe7706632afa241db05a030260e570c43de867cfcba49960edf909ee5e286ecd
```

### Compatibility and rollback

The deployed `f44a7f7` source already uses observed answer revisions and `x-satchi-client-version: 20261008`. Its daily save/start calls use the unchanged parameter names, and the admin form uses `data.questionIds`/`pool_count`, not the private `versions.pool`. The rehearsal checks exact existing RPC signatures/defaults/return types/ACLs and exercises their deployed payloads after migration. Old JSON versions and new indexed versions both remain supported. An older dashboard ignores additive daily fields; the new dashboard tolerates their absence before 090005.

These migrations do **not** recreate October8's frontend/signature incompatibility. Database and frontend can be applied separately in order without unversioned-save compatibility tricks. Recommend a brief application write-maintenance window for a fresh recovery point and integrity verification; this is an operational safeguard, not a new mandatory client-version change. Keep the existing compatible gate and answer revisions. Current f44a7f7 tabs remain compatible after reopening; genuinely pre-October8 unmarked/versionless clients remain rejected. Preserve queued drafts; do not force-refresh pending saves.

Rollback 090004/090005 can restore captured prior function definitions under maintenance. **Do not restore the old daily starter or drop the new pool table/column after any indexed version has been saved**: old code would see an empty JSON pool. Prefer frontend rollback while retaining the compatible new database, or forward repair under maintenance. Do not roll back answer revisions or restore an old database over post-backup progress. A restore requires explicit row reconciliation and compatible managed-service recovery.

Storage can remain operational for independent new uploads. None of these migrations changes Storage objects/policies/mappings, and frozen snapshots still become owned practice items before the existing asset helper authorizes them. Pause content/import/direct-SQL writers and destructive changes to referenced assets during recovery-point capture. Do not resurrect the superseded blanket signed-upload freeze requirement. Recovery must preserve post-backup independent uploads and new student progress.

## Final checks

| Check | Fresh result | Boundary |
| --- | --- | --- |
| Complete unit/database suite, native tools enabled, serialized | **243 checks: 242 passed, 0 failed, 1 skipped**, 592 seconds | Includes native browser/PG17/PostgREST14, concurrency, answer integrity, Homework and write-gate suites. Only skip is archive-specific restore, executed separately below. |
| Final reset and migration-contract regressions | **3 passed, 0 failed/skipped**; strengthened asset/key baseline separately rerun **1 passed** | Frozen pools, shared open keys/reviews and rollback guard; current deployed schema plus existing submitted/reviewed history; exact RPC ACL/default/result equality and per-migration row digests. |
| Private historical backup restore | **1 passed, 0 skipped**, 50 seconds | PG17 restore with original ACLs/native managed-role stubs; 7,572 questions / 3,961 practice items, all 49 existing public tables and Storage metadata preserved. Archive predates 090001/090002: those two already-released optimizations were bridged only in isolation, followed by the three reviewed files (five rehearsed total). No production migration replay. |
| Full browser suite, first run | **132 passed, 1 failed, 3 skipped**, 12.4 minutes | Mobile calculator scenario timed out before the practice-start button; not a calculator assertion failure. No retained failing trace in that original configuration. |
| Calculator investigation | Isolated failure scenario **1 passed**; all five calculator scenarios repeated three times **15 passed** | No retry or timeout increase, no calculator/Question Bank code change. Original startup timeout remains unexplained; not claimed fixed. Failure traces/screenshots now retained. |
| Full browser suite, diagnostic rerun before pagination fix | **132 passed, 1 failed, 3 skipped**, 10.3 minutes | Original calculator scenario passed; tracing exposed a real initial-search pagination race in Books. |
| Controlled pagination regressions | Old source: **2 failed, 2 passed**; repaired source: **5 passed** including the original large-catalog case | Books and Vocabulary Study demonstrably reset page two; analogous selector/catalog components share the same timer pattern. Search changes still reset and filter correctly. |
| Final complete unit/database tests after the additional repair | **245 checks: 235 passed, 10 failed, 0 skipped**, 643 seconds | Archive restore included. First failure is automatic session restoration after Chromium restart; The initial journey and eight dependent subtests fail, together with their parent. This is not ten independent application defects. |
| Isolated native recovery investigation | **13 passed, 0 failed/skipped**, 93 seconds | Added token-free storage/path/expiry diagnostics. Stored Auth was present before restart. All twelve workflows passed in isolation, including full restart and expired-token recovery. Full-run root cause remains unresolved. |
| Native catalog paging | **1 passed**, covering student/admin roles | Real PG17/PostgREST14; successful partial-content200/206 requests, correct second-page counts and unchanged stored catalog counts. |
| Post-repair full browser suite | **137 passed, 0 failed, 3 skipped**, 15.7 minutes | All140 scenarios, without retries or relaxed timeouts. Executed independently after the native gate failed. The three skips require original Algebra/MathBook3 source packages. This green browser run does not resolve the native restart failure. |
| Full lint and production build | **Passed** | Final additions also passed scoped lint; production build embeds the intended production Supabase URL. No browser was launched against production. |

Broad recurring save on the restored historical dataset took **567.428 ms** under the deployed eight-second statement limit and was explicitly rolled back. Existing Book RLS/start queries stayed below three seconds. These are isolated-laptop measurements, not promises of hosted latency. The archived dataset and private integrity inventories remain outside Git.

Logs: `readiness-full-browser-final.log`, `readiness-calculator-repro.log`, `readiness-calculator-repeated.log`, `readiness-full-unit.log`, `readiness-targeted.log`, `readiness-migration-contracts.log`, `readiness-backup-restore.log`, `readiness-full-browser.log`, `readiness-lint.log`, `readiness-build.log`, under `/home/otabek/satchi-release-backups/`. Final evidence also includes `readiness-final-all-unit.log`, `readiness-recovery-isolation.log`, `readiness-post-repair-browser.log`, `readiness-pagination-before-controlled.log`, `readiness-pagination-after-controlled.log`, `readiness-pagination-native-final.log`, `readiness-final-lint.log` and `readiness-final-build.log`. This preparation resolves the overnight sole unit failure, but the later native recovery failure blocks release.

Local-only commits: `6d7cd35` (protected reset), `8de1c89` (migration/restore rehearsal and failure diagnostics), `c1863e9` (pagination race and browser/native regressions), `36b63f9` (token-free recovery diagnostics). No migration SQL was changed.

### Blocking native recovery failure

In the final full run, the mixed-answer workflow saved MCQ/image/open answers, checked each HTTP acknowledgement and authoritative SQL row, closed the persistent Chromium profile, reopened it, and then landed on `/login` instead of its owned practice. Subsequent steps sharing that page failed in the signed-out state. Separate multi-student and broad recurring workflows continued to pass. There is **no established loss of acknowledged database answers**; the failing assertion concerns session restoration.

The isolated rerun passes all13 parent/child checks. Neither a passing rerun nor a suspected laptop/fixture issue establishes root cause. No Auth code, protection, assertion or timeout was weakened. Native `open()` now logs only token-free metadata (`storedAuth`, `hasUser`, `unexpired`, route path, JS exceptions) on failure; before-restart storage presence is also recorded. These diagnostics are verified by the isolated run but have not yet captured the full-run failure.

To remove the blocker: reproduce the complete native run with retained browser traces and these diagnostics; establish whether persistent-profile storage, the fixture Auth service, SDK session validation or application restoration is responsible; repair the reproduced cause; rerun the full native and browser gates with no retries/skips beyond unavailable original source packages. Do not substitute a forced login or injected storage state for the recovery assertion. Keep production unchanged until that gate is stable.

### Known limits and release-time gates

- No new hosted authenticated verification in this task. Managed Auth refresh/revocation, signed-URL expiry/provider MIME, mobile OS eviction, storage quota/clearing and many-hour session soak remain outside the local evidence. Auth/Storage transports are fixtures; do not call these hosted E2E tests.
- Exact per-question study-time credit is not established: existing heartbeat wall-time allowance and lack of idempotent time-event identity can undercredit multiple-position batches or make lost acknowledgements ambiguous. This is separate from verified durable answer revisions; the frontend batching repair does not solve the server accounting protocol. Retain it as follow-up, without claiming exact analytics time.
- Original Algebra/MathBook3 source-pixel browser tests need original inspected package directories (`SATCHI_PACKAGE_DIR`, `SATCHI_MATHBOOK3_PACKAGE_DIR`). Their fixture rendering/permissions coverage is not original-pixel verification.
- No fresh production backup was taken, no linked schema drift check was executed, and no production safety state was changed. Fresh backup/restore, actual-target/schema confirmation and authenticated production smoke tests are mandatory execution checkpoints after authorization.
- New indexed versions consume storage proportional to the source pool per edit. Full-history/scaled tests passed; monitor production latency and size. Never raise timeouts blindly or restore the pre-indexed daily starter over indexed versions.

The newly added migration-contract rehearsal is included in `npm run test:reliability`. Its prior 66 component checks ran in the complete native-enabled suite; the new contract check was executed explicitly. The updated runner's combined total was not redundantly rerun as a separate command. The later complete unit run includes both new native tests and the private restore prerequisite; its recovery failure takes precedence over earlier green results.

## Exact authorized-release sequence (not executed)

1. First resolve the native restart blocker and pass the complete gates. Then obtain release authorization. Verify Supabase project `ileffhbbaomfimwulvpw`, GitHub `rakhimovotabek/sat-chi`/`main`, Netlify target and actual deployed commit against the reviewed f44a7f7 baseline. Stop on contract/schema drift. Review diff, secret exclusions and build artifact.
2. Run the local gates below. Confirm the linked migration history includes 080001–080004 and 090001/090002 and excludes only 090003–090005. A linked `supabase db push --dry-run --skip-vault` must list exactly those three in order; stop on any different pending set.
3. Record current gate/Auth/signup/job settings privately. Allow pending saves to acknowledge; keep tabs/drafts for recovery. Pause independent application SQL/import/Edge/account-management writers and destructive referenced-asset writers. Activate the existing `satchi_release.set_mode('maintenance')` through the documented privileged connection with bounded lock timeout. Confirm ordinary cached-tab/direct API writes receive503 and admitted transactions drain. Read-only GET routes remain available; POST RPC reads may also be gated. Add only recorded disposable active verification accounts when needed; never disable the hook.
4. Create a fresh checksummed backup outside Git using `scripts/release/backup.py`; restore into isolated PG17 using `tests/release-backup-restore.test.js`. Check all migration-dependent public rows and Storage mappings; retain separately verified copies of referenced object files and provider recovery records. The historical archive used in this preparation is **not** a fresh cutover recovery point. Stop on export, restore, asset or row-integrity failure.
5. Apply exactly 090003 → 090004 → 090005 with the reviewed Supabase procedure. Check each transaction/history entry, cache refresh and resulting grants/functions; never skip failures or repair migration history manually. Compare existing rows/digests with the fresh baseline, allowing only nullable `pool_count` addition. Preserve gate state.
6. Commit/push the reviewed application changes only after authorization, deploy the matching Netlify build, and verify intended commit/asset hashes. No local credentials, backups, private inventories or generated fixtures in Git. Do not execute the book-reset operator.
7. With disposable verification accounts and the current header, verify production login; Book chapters/start/MCQ/image/open Check/explanations/save/reload; Question Bank filters and large history; Homework10→20→10/direct/groups/access withdrawal; broad recurring7→8 delivery and preserved completed history; all three manual grading actions and dashboard counts; retry and two-tab stale rejection. Inspect HTTP acknowledgements and database values, not just saved badges. No unrelated student edits.
8. If any critical check fails, keep affected writes gated and forward-repair; record the committed prefix. If all pass, use `set_mode('compatible')`, restore only recorded jobs/signup settings, confirm current/f44a7f7 revision-aware writes and permanent legacy rejection, and record cleanup and monitoring. Do not set mode `off`.

This three-migration manifest supersedes the pending-file list and legacy-frontend incompatibility assumptions in the earlier October8 release runbook. The existing gate/recovery implementation remains applicable; do not execute the old four-file cutover again.

After authorization, verify the manifest before the production push:

```sh
supabase migration list --linked
supabase db push --linked --dry-run --skip-vault
# Only after fresh backup, gate/drain and manifest verification:
supabase db push --linked --skip-vault
supabase migration list --linked
```

Activation/reopening uses the reviewed `satchi_release.set_mode` function via the privileged connection, with `SET LOCAL lock_timeout='30s'` inside a transaction. Activation is `maintenance` with no ordinary-user exemptions; subsequent verification may allow only recorded disposable accounts. Reopening is `compatible`, never `off`. Do not put connection credentials or private verification UUID inventories into Git.

Local commands:

```sh
export SATCHI_TEST_POSTGRES_BIN=/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin
export SATCHI_TEST_POSTGREST=/home/otabek/.cache/satchi-test-tools/postgrest14/postgrest
export LD_LIBRARY_PATH=/home/otabek/.cache/satchi-test-tools/pg17/opt/pgsql-17/lib
node --test --test-concurrency=1 tests/*.test.js
npm run test:reliability
npm run test:e2e -- --workers=1
npm run lint
npm run build
```

For restore rehearsal, set `SATCHI_BACKUP_ARCHIVE` to a private checksummed successful archive, then run `node --test tests/release-backup-restore.test.js`. That test contacts only an isolated cluster; its output does not disclose student records. Retain backup/verification files outside Git with restricted permissions. Serialize heavy suites on this laptop.
