# Homework backend dependency and PostgreSQL17 staging rehearsal

Date: 2026-10-08. Existing uncommitted repairs were retained. No deployment, push, production migration, real student write, or content import into the linked project occurred. Only disposable staging content and accounts were created.

## Two separate causes of the disabled editor

1. **Server incompatibility:** the local `.env.local` URL matches the project in `supabase/.temp/project-ref`. The previously inspected linked schema lacks the four October8 migrations. `assignmentBank` correctly calls `question_bank` with `p_filters: { ...filters, assignment: true }` and `p_page`. The old backend rejects `assignment` as `Invalid filters`; the frontend displays the server-update diagnostic and retains selected IDs. Another frontend rewrite will not enable that backend capability.
2. **Insufficient selection:** a fixed daily pool with seven selected IDs cannot supply ten distinct daily questions. `HomeworkForm` correctly blocks Save while `questionIds.length < count`. This remains true after the backend is upgraded. Select at least three more eligible questions, reduce Questions per day to seven or fewer, or choose Random by filters with a sufficiently large eligible pool. Switching selection mode is not a workaround for missing backend functions.

No additional application-code fix was needed for these two behaviors. Production remains unchanged and the usual localhost connection therefore continues to show the incompatibility message.

## Exact backend contract and dependency

The assignment-filter support comes from **`20261008000100_homework_lifecycle.sql`**, which replaces `public.bank_candidate_ids(p_filters jsonb)` and adds `assignment` to its accepted filter fields. The public RPC remains:

```text
public.question_bank(p_filters jsonb default '{}', p_page integer default 0)
returns jsonb: { count: <matching total>, rows: [<question summary>, ...] }
```

The existing thin RPC, defined in `20261007000400_bank_eligibility_and_thin_queries.sql`, obtains IDs from that helper, returns at most 25 summaries per page, and exposes question text/type/image, section/domain/skill/difficulty, and book/topic titles. It does not expose answer keys.

Dependencies include the existing `question_bank_eligibility` cache, questions, topics, books, profile/auth authorization, and prior eligibility functions. With `assignment: true`, even an admin must choose published books with `student_ready` questions. Migration080002 additionally repairs answer-key eligibility and supplies the revision-aware persistence contract. The full four-file rehearsal preserves the intended dependency order.

Permissions checked on native PostgreSQL17 after migration:

- Authenticated callers can execute `question_bank`; anonymous callers cannot.
- `bank_candidate_ids` remains private to trusted functions; authenticated callers cannot execute it directly.
- Students have no direct UPDATE privilege on `book_practice_items`; answer writes use guarded RPCs.
- Actual withdrawal rejection, cross-student Storage RLS, and completed-history access remain covered by native regressions.

Code references: `src/features/learning/api.js` (`assignmentBank`), `QuestionPicker.jsx`, `HomeworkForm.jsx` (`incompleteSection`/`saveBlocked`), migration080001 (`bank_candidate_ids`), migration070004 (`question_bank`), and migration080002 (`persist_practice_changes`).

## Staging environment

Restored the temporary tools cleared by the laptop restart. Verified `postgres`, `initdb`, and `psql` report **PostgreSQL17.11**, matching the linked server version previously inspected. The server package was obtained from the [official Arch PostgreSQL17 package](https://archlinux.org/packages/extra/x86_64/postgresql-old-upgrade/) and extracted into `/tmp`, without installing or changing system services. The final downloaded package passed `zstd -t` before use; an interrupted preliminary download was replaced.

Each test creates an isolated native cluster bound to `127.0.0.1`, loads the existing migration chain through October7, then applies these pending files in lexical/order sequence:

1. `20261008000100_homework_lifecycle.sql`
2. `20261008000200_practice_answer_integrity.sql`
3. `20261008000300_admin_open_response_review.sql`
4. `20261008000400_homework_snapshot_assets.sql`

The application runs through Vite, Chromium, and PostgREST16.4. Application REST/RPC requests execute real PostgreSQL transactions and RLS; they are not intercepted or replaced with mocked successes. Authentication and Storage HTTP transport use disposable fixture services, with signed local JWTs and database-backed Storage authorization. This is not hosted Supabase Auth/Storage verification or a full cloned production environment. The browser tests assert that no requests leave localhost.

Clusters, fixture accounts, synthetic books/questions, assignments, and subprocesses are cleaned up after each test. They are temporary rehearsals, not a persistent staging website. The real project's `.env.local` was not changed to point at fixtures.

## Verified behavior

| Scenario                            | Actual verification                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing assignment backend          | Pre-upgrade app displays the server-update diagnostic; actual RPC returns Invalid filters. Existing selection stays seven.                                                                                            |
| Seven selected versus ten required  | Browser shows the independent minimum-pool validation and disables Save.                                                                                                                                              |
| Select enough questions             | Post-upgrade picker loads; browser adds three questions, saves ten-per-day/ten-pool, and SQL confirms the saved version.                                                                                              |
| Lower daily count                   | Browser requests eleven with a ten-question pool, sees legitimate validation, then lowers to seven and saves. Reloaded editor and SQL agree.                                                                          |
| Book/topic changes                  | Actual picker requests after book/source and topic selection succeed; selected IDs remain preserved.                                                                                                                  |
| One-time delivery                   | Admin creates ten-question homework in the app; the student's Homework directory shows it and Start opens ten questions.                                                                                              |
| Increase/decrease existing homework | Browser selects additional questions and saves 10→20→10. SQL and student refresh agree; an answer to an unchanged item persists.                                                                                      |
| Group delivery/access               | Admin replaces direct selection with a group; only one assignment row exists. Removing fixture membership removes student visibility and rejects saving. Re-adding membership restores visibility without duplicates. |
| Recurring delivery                  | Admin creates a ten-question recurring template through the app; it appears in the student's Today section and Start creates a ten-item occurrence. Repeated start returns the same session and one instance.         |
| Completed recurring history         | Authenticated database RPCs save/finish the fixture occurrence. Browser edits the template to twelve questions. SQL confirms completed occurrence/answer rows are unchanged; student sees View results.               |
| Revision-aware saving               | Actual HTTP tests preserve pre-migration answers, accept revisions, reject unversioned/stale requests, and roll back mixed batches.                                                                                   |
| Network/reload recovery             | Actual browser offline/retry, refresh, and logout/login checks cover text MCQ, image choices, and open response.                                                                                                      |
| Images and authorization            | Migrated native RLS permits owned frozen Homework references and completed history; denies strangers, withdrawn unfinished attempts, and unearned explanations.                                                       |
| Concurrency                         | Separate PostgreSQL connections verify independent commits, one winner for conflicting answers, and answer/edit race preservation or archival.                                                                        |

Recurring delivery uses the existing scheduled directory and creates a physical instance when the student starts; no external notification is required. Template edits apply from the next Tashkent local day, preserving today's frozen version and completed history.

The rehearsal uses synthetic data and the repository migration chain. It does not establish production-volume performance, exact production data cleanliness, or hosted gateway/Storage behavior. Existing manual-review regressions and the previous migration safety review remain relevant; this task did not repeat the full platform audit.

## Regression files and commands

Added `tests/homework-pg17-workflows.test.js`, which requires PostgreSQL major17 and verifies application editing/delivery plus database privileges and recurring history. Extended `tests/native-app-workflows.test.js` to reproduce the exact 7/10 condition and exercise book/topic filtering. Expanded the shared disposable question fixture to32 questions so 10→20 can be tested. Waits now ensure the picker is loaded before changing selections and images finish loading before intentionally going offline. No application or migration source was edited in this task.

Reproduce with PostgreSQL17 and PostgREST paths available:

```sh
LD_LIBRARY_PATH=/tmp/satchi-pglib/usr/lib \
SATCHI_TEST_POSTGRES_BIN=/tmp/satchi-postgres17/opt/pgsql-17/bin \
SATCHI_TEST_POSTGREST=/tmp/satchi-postgrest/postgrest \
node --test --test-reporter=tap --test-concurrency=1 \
  tests/homework-pg17-workflows.test.js \
  tests/native-app-workflows.test.js \
  tests/migration-compatibility.test.js \
  tests/postgres-concurrency.test.js
```

Tool files under `/tmp` must be restored after restart. Paths are examples for the environment used here; no credentials are needed. Missing native binary paths make tests skip; the new workflow rejects a different PostgreSQL major. Do not count skipped tests as verification.

Early expanded-test failures involved a missing required section title, label selectors, querying a loading picker too soon, and reloading the wrong/cached student page. A withdrawn player correctly rejected its outgoing heartbeat; the test now leaves the player and drains that request before withdrawing membership. These were corrected in fixture/navigation code; failed intermediate runs are not counted as successful verification.

Final combined result: **23 checks passed, zero failed, zero skipped**, including four parent checks. Output: `/tmp/satchi-pg17-confirmed.log`. Scoped lint, formatting and `git diff --check` passed for the changed test/report files. A frontend rebuild was not needed because application code was unchanged.

## Release status and exact next steps

All four migrations remain pending for the linked project. **NO-GO for a live database-only release.** The database dependency is confirmed and PostgreSQL17 fixture compatibility is rehearsed, but production release approval, enforceable maintenance/client draining, recoverable backup confirmation, and successful hosted authenticated verification are still required.

Follow [the coordinated release plan](migration-compatibility-release-plan.md):

1. Freeze reviewed frontend/migration artifacts; obtain approval and verify backup/recovery.
2. Announce maintenance, let old clients finish pending saves, preserve unresolved drafts, and pause writers/scheduling.
3. Gate all mutating RPCs and drain old tabs, including Check and submission. A frontend maintenance page cannot block cached direct Supabase requests. If all active clients cannot be demonstrably drained, a tested server-enforced client-version admission gate is required; these migrations do not implement it.
4. Apply approved migrations in order080001→080002→080003→080004 while closed; verify API exposure/cache and permissions. Each file is atomic, not the whole sequence.
5. Deploy the reviewed revision-aware frontend while still closed; verify newly loaded assets and revision-bearing requests.
6. Run authorized hosted disposable-fixture tests for answers, Homework, recipients, grading and assets before reopening.
7. Reopen and resume scheduling only when gates pass. On failure remain closed and repair forward; never restore unversioned writes or drop post-release progress during rollback.

Staging test success does not remove the old-frontend incompatibility or authorize these release actions. The release was prepared, not executed.
