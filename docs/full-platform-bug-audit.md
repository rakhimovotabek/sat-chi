# SAT’chi full platform bug audit

Audit date: **2026-10-08**, Asia/Tashkent. Scope: existing checkout, all migrations, existing tests, recent repair reports, linked Supabase catalog and aggregate content checks. **Audit only: no application fixes, migrations, deployment, push, production account/data changes, or book imports were performed.** Existing test suites create books and accounts only inside isolated local fixtures.

## Executive result

- **16 confirmed bugs:** 0 Critical, 8 High, 8 Medium, 0 Low.
- **5 suspected bugs/risks:** 1 High, 4 Medium; impact needs further verification.
- **3 separate missing-functionality/configuration findings:** 2 Medium, 1 Low. These are excluded from confirmed/suspected bug totals.
- The uncommitted Homework repair passes its local database/browser workflows, but its migration is **not applied to the hosted database**. Six confirmed findings below concern the hosted version or compatibility with it; they are not six additional failures of the repaired local backend.
- Production student-facing create/edit/complete workflows remain **BLOCKED / NOT VERIFIED** in this audit. Read-only hosted catalog inspection and local PostgreSQL execution are not hosted student end-to-end verification.

## Connection, migration and version status

The newly installed Supabase CLI works: version **2.120.0**, linked project confirmed. `.env.local` exists; `.env` and `.env.production` do not. Existing CLI authentication successfully ran migration listing, Management API read-only SQL, advisors, and Edge Function listing. No secrets were printed. A direct temporary-login connection failed once with SQLSTATE `28P01`; Management API queries subsequently worked. That connection error does not demonstrate an application outage and no database password is needed for the read-only checks already completed.

Migration history: **63 local migrations, 62 applied remotely**. History matches through `20261007000600_source_passage_markup.sql`. Only `20261008000100_homework_lifecycle.sql` is pending. Nothing was applied during this audit. Hosted `bank_candidate_ids`, `update_homework`, `start_daily_homework`, and `book_practice_open_review` definitions were read directly and compared with the source migrations.

The existing uncommitted changes in README, Homework components/model, tests, and the October 8 migration were preserved. The previous [Homework repair report](homework-repair-report.md) correctly describes local verification, but its statement that no connection configuration exists is now outdated. This audit supplies the newer hosted readback. The [Reading/Writing repair report](reading-writing-format-repair.md) records an earlier frontend deployment gap; that historical statement alone cannot identify today’s deployed release.

The public frontend returned HTTP 200. Its current authenticated behavior and exact deployed commit were not verified. `manage-student` is deployed and ACTIVE, version 1; deployment presence does not prove account creation works end to end. A later coordinated migration/frontend release is necessary to publish the local Homework repair, but this audit neither authorizes nor performs it.

## Verification and test evidence

| Check                                                   | Result                                        | What it establishes                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                              | **141 tests: 139 passed, 2 failed**           | Local unit and PGlite database behavior; not hosted Auth/PostgREST                                                                  |
| `node --test tests/covers.test.js` isolated rerun       | **3/3 passed**                                | Full-run cover failure is an environment-sensitive timeout                                                                          |
| `npm run test:e2e -- --workers=1`                       | **124 tests: 121 passed, 3 skipped**, 8.8 min | Browser workflows against local fixtures                                                                                            |
| SQL-backed browser subset                               | **2/2 passed**, included above                | Real local SQL/RLS plus browser, simulated authentication                                                                           |
| Additional audit browser reproductions                  | **4 reproduced bugs**                         | Unsaved navigation loss, blank admin open answer, JPEG explanation, context truncation; mocked transport                            |
| Additional current-schema SQL reproductions             | **4 cases**                                   | Admin open-review denial, dashboard scope, premature reuse, missing-key eligibility                                                 |
| Additional hosted-version SQL reproductions             | **6 cases**                                   | Excludes October 8 migration; mixed-answer Save, group delivery, withdrawal, stale snapshots, directory cap, picker incompatibility |
| Study-time queue reproduction                           | **1 case**                                    | Actual extracted `flush` function loses later pending entries on failure; injected failing transport                                |
| `npm run lint`, `npm run build`, `npm run format:check` | **Passed**                                    | Build/lint plus the configured vocabulary-only formatting scope                                                                     |
| Hosted catalog/security/content/plan queries            | **Succeeded, read-only**                      | Actual migration/function/policy state and aggregate content health                                                                 |
| Hosted student-facing write E2E                         | **0; BLOCKED**                                | Audit-only scope and no explicitly approved disposable hosted-account workflow                                                      |

The four added browser cases were isolated under `/tmp/satchi-audit-browser`; application code was not instrumented or edited. Initial instrumentation attempts failed because a dynamic React import required its default export and an exact request-count assertion ignored development StrictMode duplication. After correcting only temporary instrumentation, the targeted reproductions passed. Those harness mistakes are not platform failures. Reproduction “passes” mean the tests observed the defective behavior.

Full-run failures:

1. `tests/book-content-reset.test.js:6`: `Protected data changed: question_bank_eligibility` (C13). Reproduces independently of the pending Homework repair. Transaction aborts instead of deleting protected data.
2. `tests/covers.test.js:33`: ImageMagick grayscale/threshold subprocess timed out; ~75 seconds. The same cover suite passed alone in 7.5 seconds. Classify as test/resource sensitivity, not a proven broken cover feature.

Three skipped browser tests require retained source packages: two Algebra original-pixel checks at 1280/390px (`SATCHI_PACKAGE_DIR`) and the MathBook 3 JPEG/numeric-response check (`SATCHI_MATHBOOK3_PACKAGE_DIR`). These package directories were not found in the local import files inspected. Source-pixel correctness is **BLOCKED**, not passed.

Session logs, without credentials: `/tmp/satchi-platform-audit-unit.log`, `/tmp/satchi-platform-audit-browser.log`, `/tmp/satchi-audit-covers-rerun.log`, `/tmp/satchi-audit-baseline.log`, `/tmp/satchi-audit-repro.log`, `/tmp/satchi-audit-timer.log`, and `/tmp/satchi-audit-*-browser.log`. These are temporary session artifacts; the findings and relevant outputs are captured below.

## Hosted read-only health and performance

- 13 books; **7,572 questions**, all in published books; **6,714 student-eligible** questions; 22 active students; 3 one-time homework definitions; 11 recurring templates.
- **0** duplicate one-time assignment pairs; **0** duplicate recurring student/template/date instances; **0** student-eligible questions without a `question_answers` row; **0** published open questions missing their open key.
- **0** questions unsupported by `question_answer_ui_supported`. An initial raw options check flagged 3,732 rows, but that is **not 3,732 bugs**: supported image choices and embedded choices legitimately have blank/plain-text-free options. 2,817 questions explicitly carry embedded image-choice metadata.
- 2,069 nonempty passages; **1,082** contain literal blank markers and **103** have `passage_markup`. Presence checks do not prove every source gap/underline is correct. The prior source audit flags additional uncertain material; no source re-import or formatting writes were attempted.
- **5,845 missing explanation texts** (M01); 859 pending and 8,729 approved Content Review items across content types. Pending items are not automatically incorrect answers, and can be intentionally withheld from practice.
- 56 vocabulary passages; no vocabulary set currently exceeds 100 words; no group currently exceeds 100 members; no current JPEG explanation Markdown rows.
- All **48 public tables have RLS enabled**. This is positive catalog evidence, not proof of every authorization path. Local RLS/ownership tests passed; C03 identifies a narrower withdrawn-assignment authorization defect.
- Read-only `EXPLAIN (ANALYZE, BUFFERS)` on an eligibility/topic/book join returning 25 question rows: **planning 6.209 ms, execution 1.253 ms**. This is an administrative SQL query, not an authenticated end-to-end RPC latency or load test. No platform database timeout was reproduced.
- Advisors report 16 foreign keys without a covering index, one per-row Auth/RLS evaluation warning on `question_check_attempts`, 18 multiple-permissive-policy warnings, and three unused indexes. These are scale/maintenance signals (S01), not proof of slow user operations. In particular, do not remove an index solely because it is currently unused.
- Security advisors flag disabled leaked-password protection (M03), 84 authenticated executable definer functions, and one anonymous executable trigger function, `fill_package_open_practice_key()`. Most authenticated RPC grants are intentional. The anonymous helper returns a trigger and is not a demonstrated directly callable data-exfiltration endpoint; do not describe the warning as an exploited Critical vulnerability. Review/restrict its grants during a later permission-hardening pass.

## Confirmed findings

### C01 — Hosted one-time Homework rejects an added open-response question

- **Feature:** Homework editing
- **Severity:** High
- **Classification:** Hosted-version bug; locally repaired, migration pending
- **Description:** Hosted one-time Homework rejects an added open-response question.
- **Reproduction:** On a backend matching the applied migrations, create MCQ homework, then increase its explicit selection by adding a student-ready open question. The isolated hosted-version fixture changed five MCQs to six questions including one open response.
- **Expected:** All selected, eligible question types save atomically and remain usable by students.
- **Actual:** RPC raises `Not enough eligible questions for section Math`. The requested open question is excluded. This is a mixed-type selection failure, not evidence that every increase or every count above 10 fails.
- **Likely root cause:** The active `update_homework` selection is restricted to `question_type='mcq'`; the legacy snapshot schema requires a non-null integer key and does not freeze an open-answer key. Picker eligibility and assignment eligibility also differed.
- **Evidence:** `supabase/migrations/20261007000200_homework_editing.sql:71`; hosted function readback; `/tmp/satchi-audit-baseline.log`. The current local lifecycle suite passes 10→5/15/20/30 and mixed open/MCQ editing.
- **Proposed fix:** Review the existing additive October 8 repair and its rollback/key-snapshot coverage; publish compatible backend/frontend together only after a separately authorized verification/release.
- **Verification status:** CONFIRMED: hosted definition plus isolated matching-schema reproduction. Hosted Save write test BLOCKED; repaired local workflows passed.

### C02 — New group members do not receive existing one-time homework

- **Feature:** Homework delivery / groups
- **Severity:** High
- **Classification:** Hosted-version bug; locally repaired, migration pending
- **Description:** New group members do not receive existing one-time homework.
- **Reproduction:** Create a group with Student A, assign one-time homework to the group, then add Student B without re-saving the homework.
- **Expected:** B receives an assignment row and sees the group homework; future roster changes synchronize eligibility.
- **Actual:** Hosted-version fixture produced **0 assignment rows for B**.
- **Likely root cause:** Group membership is resolved when creating/updating homework. Existing roster triggers maintain recurring templates but not one-time definitions.
- **Evidence:** `20261007000200_homework_editing.sql:24,79`; `20261004002800_daily_homework.sql:43`; hosted catalogs and baseline fixture.
- **Proposed fix:** Review the already-written one-time roster synchronization triggers, preserving completed history and resolving legacy recipient intent explicitly.
- **Verification status:** CONFIRMED locally against hosted-version SQL; current repaired group add/remove/rejoin tests pass. Live student delivery BLOCKED.

### C03 — Removed recipients retain write access to an already-started session

- **Feature:** Homework access / permissions
- **Severity:** High
- **Classification:** Hosted-version bug; locally repaired, migration pending
- **Description:** Removed recipients retain write access to an already-started session.
- **Reproduction:** Student A starts homework. Admin removes A while retaining B. A saves an answer using the original session ID.
- **Expected:** The removed assignment disappears and unfinished assignment writes are refused; completed history is preserved under an explicit history policy.
- **Actual:** Baseline fixture accepted `save_book_practice` after removal: `saved_after_removal: true`.
- **Likely root cause:** Assignment activity is checked by directory/start paths, but the older general practice-save path checks session ownership and account activity without checking withdrawn Homework eligibility.
- **Evidence:** `20261007000200_homework_editing.sql:79,85,87`; general `save_book_practice` delegation; baseline fixture. October 8 migration contains the new assignment-access guards.
- **Proposed fix:** Review consistent read/save/check/finish guards for unfinished withdrawn assignments; retain completed history without granting new assignment access.
- **Verification status:** CONFIRMED matching-schema SQL reproduction; repaired local withdrawal tests pass. No real account was removed.

### C04 — Started students retain stale question snapshots after definition edits

- **Feature:** Homework editing / snapshots
- **Severity:** High
- **Classification:** Hosted-version bug; locally repaired, migration pending
- **Description:** Started students retain stale question snapshots after definition edits.
- **Reproduction:** Start a 10-question homework session, then save a five-question definition and resume the existing session.
- **Expected:** Unfinished sessions receive the current definition with valid retained-answer progress; completed attempts retain their historical definition.
- **Actual:** Baseline fixture saved **5 definition questions**, while the student session still contained **10**.
- **Likely root cause:** `start_homework` returns the existing session unchanged; the older update replaces definition sections without synchronizing existing practice items.
- **Evidence:** `20261007000200_homework_editing.sql:48,90`; baseline SQL output. New local migration has private session synchronization and removed-item history.
- **Proposed fix:** Review the existing synchronization implementation for additions/removals, timing, answers, and completed-session immutability.
- **Verification status:** CONFIRMED hosted-version local SQL; repaired current SQL-backed browser 10→20 and progress workflow passed. Live resume BLOCKED.

### C05 — Hosted student directory silently truncates assigned homework at 200 rows

- **Feature:** Homework visibility
- **Severity:** High
- **Classification:** Hosted-version boundary bug; locally repaired, migration pending
- **Description:** Hosted student directory silently truncates assigned homework at 200 rows.
- **Reproduction:** In an isolated fixture, give one student 202 active assignments and call `homework_directory`.
- **Expected:** All assignments are reachable through a complete directory or explicit pagination.
- **Actual:** Only **200 of 202** active assignments returned.
- **Likely root cause:** An unconditional `LIMIT 200` applies to the student path. Older/less-prioritized homework becomes unreachable from the directory.
- **Evidence:** `20261007000200_homework_editing.sql:100`; hosted readback and baseline fixture. Hosted current data has only three definitions, so current production loss from this cap was not observed.
- **Proposed fix:** Review the existing unlimited student directory repair; provide explicit admin pagination rather than an invisible cap.
- **Verification status:** CONFIRMED local boundary reproduction and hosted SQL; pending local repair passes the >200 student-directory case.

### C06 — Uncommitted Homework picker sends a filter rejected by the hosted backend

- **Feature:** Frontend/backend compatibility
- **Severity:** High
- **Classification:** Deployment/version mismatch
- **Description:** Uncommitted Homework picker sends a filter rejected by the hosted backend.
- **Reproduction:** Run the current local UI against the linked hosted backend and open the specific-question picker; equivalently call hosted-version `question_bank` with `{assignment:true}` in an isolated database.
- **Expected:** Picker queries use a backend-supported eligibility contract.
- **Actual:** Hosted-version RPC raises **`Invalid filters`**. The current picker includes `assignment:true`; hosted `bank_candidate_ids` does not accept that key.
- **Likely root cause:** Frontend and pending October 8 backend changes are coupled. Deploying this UI alone would break picker loading.
- **Evidence:** `src/features/learning/QuestionPicker.jsx:15`; `20261007000400_bank_eligibility_and_thin_queries.sql` filter whitelist; actual hosted definition; baseline SQL.
- **Proposed fix:** Keep compatible frontend/backend changes together in a reviewed release and verify against the intended migration state before deployment.
- **Verification status:** CONFIRMED actual schema incompatibility and isolated RPC reproduction; current fully migrated local tests pass.

### C07 — Completed open-response attempts fail to load for admins

- **Feature:** Admin completion monitoring
- **Severity:** High
- **Classification:** Current local and hosted bug
- **Description:** Completed open-response attempts fail to load for admins.
- **Reproduction:** Student completes a book/bank/homework attempt containing an open response; admin opens `/admin/sessions/<session-id>`.
- **Expected:** Admin can inspect the submitted student attempt in read-only mode.
- **Actual:** General review succeeds, but open-review RPC rejects with **`Submit your own book practice first`**. `getPractice` treats this as a failed page load.
- **Likely root cause:** `review_book_practice` permits admins; `book_practice_open_review` requires `student_id=auth.uid()` with no admin branch.
- **Evidence:** `src/features/books/api.js:172,195`; `src/features/learning/Reporting.jsx:436`; `20261007000100_homework_answers_and_bank_loading.sql:242`; hosted readback; local SQL: student review 1 row, admin general review 1 row, admin open-review denied.
- **Proposed fix:** Add an active-admin read-only review path with consistent ownership rules and an admin/student regression workflow.
- **Verification status:** CONFIRMED current local SQL and hosted function definition. Hosted authenticated admin page not exercised.

### C08 — Failed answer saves are lost when navigating through the sidebar

- **Feature:** Practice / progress persistence
- **Severity:** High
- **Classification:** Current frontend bug
- **Description:** Failed answer saves are lost when navigating through the sidebar.
- **Reproduction:** Open practice, make the save RPC fail, select an answer, observe the save error, click the sidebar Books link, and reopen the same session.
- **Expected:** Navigation prevents silent loss, flushes successfully, or preserves a durable retry snapshot that can be recovered.
- **Actual:** The route changes and the answer is gone on resume. The audit browser reproduced the loss.
- **Likely root cause:** Unsaved answers exist only in component memory. `beforeunload` guards full-page exit, but SPA sidebar links bypass it and the controlled `leave()` save path.
- **Evidence:** `src/features/player/Player.jsx:68,114,238`; extra browser case `reproduce unsaved answer lost after sidebar navigation` passed by observing the defect.
- **Proposed fix:** Introduce route-level unsaved-state handling and/or durable, session-scoped retry recovery; test failed saves plus sidebar/browser navigation.
- **Verification status:** CONFIRMED browser reproduction using injected failed transport. No production progress changed.

### C09 — Saved open responses render as blank student answers

- **Feature:** Admin student analytics
- **Severity:** Medium
- **Classification:** Current frontend bug
- **Description:** Saved open responses render as blank student answers.
- **Reproduction:** Admin opens an in-progress attempt whose open item stores `selected_response: "42"`, `selected_answer: 0`, and `options: []`.
- **Expected:** The saved typed response is displayed verbatim; open-response checks use typed-response labels.
- **Actual:** The page renders **`Student answer:`** without the response. Its check-history display also assumes A–D selection labels.
- **Likely root cause:** The template always looks up `question.options[selected_answer]` and ignores `selected_response`.
- **Evidence:** `src/features/learning/Reporting.jsx:494,502`; extra admin browser fixture confirmed the blank output independently of C07.
- **Proposed fix:** Render type-specific saved answers/check history and reuse safe stimulus/image rendering where needed for admin inspection.
- **Verification status:** CONFIRMED browser fixture. Actual hosted student attempts were not opened.

### C10 — Heartbeat retry drops later pending question-time entries

- **Feature:** Study time / analytics reliability
- **Severity:** Medium
- **Classification:** Current frontend bug
- **Description:** Heartbeat retry drops later pending question-time entries.
- **Reproduction:** Queue 5 seconds for position 0 and 7 for position 1. Fail the first heartbeat in a flush, then retry successfully.
- **Expected:** All 12 pending seconds remain queued or are eventually credited once.
- **Actual:** Only position 0 is restored. Retry sends `[0,5]` and `[1,0]`: **5 of 12 seconds**, losing 7.
- **Likely root cause:** `flush` clears the full pending map before sending and requeues only the entry whose request failed, abandoning the rest of the batch.
- **Evidence:** `src/features/player/useStudyTimer.js:19,23,50`; `/tmp/satchi-audit-timer.log` executes the actual extracted flush implementation with a failing transport.
- **Proposed fix:** Requeue the failed and unsent remainder while preserving order and preventing duplicate credit; include a multi-position failed-batch test.
- **Verification status:** CONFIRMED isolated execution of actual queue logic. Server-side study-time accuracy under real network failures remains untested.

### C11 — Allow-reuse repeats assigned questions before the pool is exhausted

- **Feature:** Recurring homework selection
- **Severity:** Medium
- **Classification:** Current local and hosted bug
- **Description:** Allow-reuse repeats assigned questions before the pool is exhausted.
- **Reproduction:** Create a 12-question daily pool with daily count 1 and reuse enabled. Record yesterday’s assigned but unanswered question as today’s hash-preferred candidate. Start today.
- **Expected:** Previously assigned questions are used only after unused pool questions are exhausted, as the form states.
- **Actual:** Today repeats yesterday’s question despite **11 never-assigned questions** remaining.
- **Likely root cause:** The October 7 replacement of `start_daily_homework` retained answered-history priority but lost the earlier never-assigned priority. `allowRepeat` admits every question immediately.
- **Evidence:** `20261007000100_homework_answers_and_bank_loading.sql:98`; compare `20261004003100_daily_homework_statistics.sql`; actual hosted definition and current local 12-question fixture.
- **Proposed fix:** Restore explicit never-assigned-first ordering, using unanswered/answered history as a secondary preference.
- **Verification status:** CONFIRMED current local SQL and hosted definition. No production recurrence was started.

### C12 — Ordinary questions without an answer key remain eligible and create undersized practice

- **Feature:** Question Bank eligibility / content review
- **Severity:** Medium
- **Classification:** Current local and hosted latent integrity bug
- **Description:** Ordinary questions without an answer key remain eligible and create undersized practice.
- **Reproduction:** In an isolated 12-question ordinary-MCQ fixture, remove one answer-key row, query the bank, then request 12 questions.
- **Expected:** The keyless question becomes ineligible; displayed counts and created-session size agree, or a clear validation error is returned.
- **Actual:** Cache still marks it student-ready; bank count **12**, created session **11**.
- **Likely root cause:** The `ordinary` eligibility branch validates options but not key existence/range. Practice selection joins answer rows and silently skips missing keys; it only rejects a zero-question result.
- **Evidence:** `20261007000400_bank_eligibility_and_thin_queries.sql:25`; `20261004003800_package_question_bank.sql` start selection; local SQL fixture. Hosted health currently found zero eligible missing keys.
- **Proposed fix:** Require valid keys for ordinary eligibility and validate requested versus actual session counts consistently.
- **Verification status:** CONFIRMED local SQL boundary case; actual hosted implementation matches, but no current malformed hosted row found.

### C13 — Book-reset safety script aborts on the eligibility cache

- **Feature:** Maintenance / database test reliability
- **Severity:** Medium
- **Classification:** Current tooling bug
- **Description:** Book-reset safety script aborts on the eligibility cache.
- **Reproduction:** Run `node --test tests/book-content-reset.test.js` against the current local migrated fixture.
- **Expected:** Book-scoped cache rows can disappear with books while unrelated history/vocabulary/accounts stay unchanged.
- **Actual:** `Protected data changed: question_bank_eligibility`; transaction aborts.
- **Likely root cause:** The protected-table hash defaults newly added tables to `true`. It incorrectly treats the book-derived eligibility cache as unrelated data, although question deletion cascades remove its rows.
- **Evidence:** `tests/book-content-reset.test.js:6`; `scripts/books/delete-imported-content.sql:18,44`; full unit output. Failure predates the uncommitted Homework repair.
- **Proposed fix:** Explicitly classify new dependent/cache tables and review protected predicates for open keys and archives, retaining transactional safety checks.
- **Verification status:** CONFIRMED local test failure. Reset script was never run against production; no actual data loss observed.

### C14 — Supported JPEG explanation assets render as literal Markdown

- **Feature:** Books / explanations
- **Severity:** Medium
- **Classification:** Current frontend boundary bug
- **Description:** Supported JPEG explanation assets render as literal Markdown.
- **Reproduction:** Give `ExplanationContent` valid package-image Markdown ending in `.jpg` or `.jpeg`.
- **Expected:** The private JPEG explanation is rendered through the signed image component, like PNG.
- **Actual:** The audit browser shows literal `![Answer](...)` text and **zero images**.
- **Likely root cause:** Explanation Markdown regex accepts only `.png`, although `QuestionImage` and package assets support JPEG.
- **Evidence:** `src/features/player/BookExplanation.jsx:14`; `src/components/QuestionImage.jsx:32`; extra JPEG component browser reproduction passed. Hosted JPEG-explanation count is currently zero.
- **Proposed fix:** Align the safe package-image extension whitelist across explanation and image rendering, preserving URL restrictions.
- **Verification status:** CONFIRMED local component browser case; latent in current hosted content, not a demonstrated current production explanation failure.

### C15 — Only the first ten context passages are reachable for a visible set pool

- **Feature:** Vocabulary / read in context
- **Severity:** Medium
- **Classification:** Current frontend boundary bug
- **Description:** Only the first ten context passages are reachable for a visible set pool.
- **Reproduction:** Study visible sets containing eleven supplied passages and choose Read in Context.
- **Expected:** All passages for the selected/visible sets can be reached through fetching or passage pagination.
- **Actual:** Only the first ten appear. Browser requests use `limit=10&offset=0`; no passage-page navigation requests the eleventh.
- **Likely root cause:** `vocabPassages` pages by ten, but `VocabularyStudy` always calls its default page. Word pagination is not passage pagination.
- **Evidence:** `src/features/learning/api.js:190`; `src/features/learning/VocabularyStudy.jsx:32`; eleven-passage browser fixture. Hosted library has 56 passages in total; whether a current visible combination exceeds ten was not tested.
- **Proposed fix:** Add explicit passage pagination or load the bounded passage collection for the visible sets.
- **Verification status:** CONFIRMED realistic local browser fixture; current production subset impact not established.

### C16 — Dashboard homework totals exclude recurring work and count inactive assignments

- **Feature:** Admin homework analytics
- **Severity:** Medium
- **Classification:** Current local and hosted analytics scope bug
- **Description:** Dashboard homework totals exclude recurring work and count inactive assignments.
- **Reproduction:** Create/start a recurring assignment with no one-time assignments, then load `admin_overview`; separately remove a one-time recipient and inspect the total-count query.
- **Expected:** Cards labeled Assigned homework / Completed homework clearly state their scope and reflect eligible work; recurring totals are included or separately labeled.
- **Actual:** Local fixture has one started daily occurrence but dashboard `assignments: 0`. The assignment query also counts inactive withdrawn rows.
- **Likely root cause:** `admin_overview` predates recurring and soft-withdrawal models and still counts only all `homework_assignments`/one-time attempts. Unlike student metric cards, admin labels do not say One-time.
- **Evidence:** `src/features/learning/Reporting.jsx:355`; `20261003000700_practice_filter_hardening.sql:47`; hosted function readback and current local overview fixture. Dedicated daily analytics works separately.
- **Proposed fix:** Define explicit active/history and one-time/daily scopes; calculate cards consistently and regression-test withdrawal and daily-only activity.
- **Verification status:** CONFIRMED current local SQL and hosted function definition; frontend label verified in source and existing reporting tests.

## Suspected findings requiring further verification

### S01 — Index/RLS warnings may slow larger histories

- **Feature:** Reliability and performance
- **Severity:** Medium
- **Description:** Sixteen uncovered foreign keys, per-row Auth checks, and overlapping policies may increase lookup/maintenance costs as histories grow.
- **Reproduction:** Profile representative authenticated question-check, reporting, asset-authorization, and recurring-history queries on a realistic isolated large dataset; compare plans with the advisor-flagged relations.
- **Expected:** Bounded, indexed operations with predictable latency.
- **Actual:** Hosted advisors warn; the audited question-list join is fast. No user-facing timeout was reproduced.
- **Likely root cause:** Some relationships lack covering indexes; `checks_read` evaluates Auth helpers per row; multiple permissive policies add predicates.
- **Evidence:** Linked performance advisors: 16 uncovered foreign keys, one `auth_rls_initplan`, 18 `multiple_permissive_policies`; measured list execution 1.253 ms. Examples include `daily_homework_instances.version_id`, `book_package_assets.book_id/question_id`, and `content_review_audit.item_id`.
- **Proposed fix:** Measure the actual slow paths first; add justified indexes and simplify equivalent policy evaluation while retaining authorization tests.
- **Verification status:** SUSPECTED scaling impact; actual hosted warnings confirmed. Load/real authenticated RPC latency not tested.

### S02 — Long-running practice may reuse expired private image URLs

- **Feature:** Books / Question Bank images
- **Severity:** Medium
- **Description:** A mounted question image obtains a one-hour signed URL without scheduled renewal.
- **Reproduction:** Keep a session open beyond 3,600 seconds, then force image re-fetch/zoom with browser cache disabled.
- **Expected:** Valid assets remain available throughout an active session, with automatic renewal when necessary.
- **Actual:** Source has signing and manual retry but no expiry-driven refresh; a cached image may continue working, so a failure is not established.
- **Likely root cause:** The effect reruns for source/retry changes rather than token expiry.
- **Evidence:** `src/components/QuestionImage.jsx:39` calls `createSignedUrl(path, 3600)`.
- **Proposed fix:** Renew before expiry or automatically recover authorization-related fetch failures.
- **Verification status:** SUSPECTED; no one-hour hosted asset reproduction performed. Ordinary mocked image/retry tests pass.

### S03 — Group member management truncates large groups

- **Feature:** Admin groups
- **Severity:** Medium
- **Description:** Member queries stop at 100 without member pagination, potentially hiding students from management/removal.
- **Reproduction:** Create a disposable group with 101 active members in an isolated fixture and inspect member list versus server summary.
- **Expected:** Every member is accessible through pagination or a complete bounded query.
- **Actual:** Source requests `.limit(100)`; hosted data currently has no group above that boundary.
- **Likely root cause:** Fixed client cap without a pagination UI.
- **Evidence:** `src/features/learning/api.js:31`; `src/features/learning/Groups.jsx` uses the returned member array; hosted aggregate `groups_over100: 0`.
- **Proposed fix:** Add explicit member pagination and total count before supporting larger groups.
- **Verification status:** SUSPECTED boundary impact from code review; 101-member browser reproduction not run. Ordinary group CRUD browser tests pass.

### S04 — Single-set vocabulary paths assume at most 100 entries

- **Feature:** Vocabulary / admin authoring
- **Severity:** Medium
- **Description:** Single-set word and source-test editors use 100-row limits without pagination; later entries could disappear if manual editing grows beyond that boundary.
- **Reproduction:** Build an isolated manually authored set exceeding 100 words/source questions, then open its single-set learning/editor routes.
- **Expected:** Supported content remains accessible, or the same explicit size constraint is enforced on every write path.
- **Actual:** Source has fixed caps. Hosted sets have at most 100 words; JSON import intentionally enforces that word limit.
- **Likely root cause:** Per-set UI assumptions are not represented as universal database constraints for manual additions.
- **Evidence:** `src/features/learning/api.js:122,131`; `src/features/learning/VocabTestsEditor.jsx:17`; `20261004001500_bank_workspace_vocabulary_publication.sql` import bound; hosted `vocabulary_sets_over100: 0`.
- **Proposed fix:** Define a consistent supported bound or paginate authoring/learning paths; test a manually grown set.
- **Verification status:** SUSPECTED future/manual-authoring impact; no existing hosted oversized set found. Aggregate vocabulary pagination tests pass.

### S05 — Existing “live verification” scripts can select real students

- **Feature:** Verification tooling / student history safety
- **Severity:** High
- **Description:** Two opt-in live scripts search for names containing test/fixture, then fall back to the first eligible real student; they authenticate as that user and create practice activity.
- **Reproduction:** Read their account-selection logic with no matching fixture user. Do not execute this scenario against production during an audit.
- **Expected:** Verification uses an explicitly approved disposable account ID and fails closed when unavailable.
- **Actual:** `eligible.find(... /test|fixture/i ...) || eligible[0]` permits real-account fallback. A matching display name alone also does not establish that an account is safe to use.
- **Likely root cause:** Convenience selection predates strict disposable-fixture requirements.
- **Evidence:** `scripts/books/verify-package-student.js:60`; `scripts/books/verify-bank-images.js:69`; subsequent `generateLink`/practice workflows in those scripts.
- **Proposed fix:** Require explicit allowlisted fixture IDs and isolated data ownership/cleanup; remove real-user fallback before authorizing hosted write verification.
- **Verification status:** SUSPECTED adverse data impact, confirmed unsafe selection path by inspection. Scripts were deliberately not executed; no real student was impersonated or modified.

## Missing functionality and configuration gaps

### M01 — Most question keys lack explanation content

- **Feature:** Books / Question Bank explanations
- **Severity:** Medium
- **Description:** Many otherwise published questions have no authored explanation text. This is a content-coverage gap, distinct from an explanation-button failure.
- **Reproduction:** Run the read-only aggregate on `question_answers` where trimmed explanation is empty; open a corresponding answered question when an authorized fixture is available.
- **Expected:** Supplied/source-verified explanations are available where the product promises them; missing content is shown honestly.
- **Actual:** Hosted aggregate found **5,845** empty explanation texts. The UI deliberately displays “Explanation is not available for this question.” No explanations were invented.
- **Likely root cause:** Imported source packages did not supply explanations for many items, or retained explanation coverage is incomplete.
- **Evidence:** Actual hosted read-only count; `src/features/player/BookExplanation.jsx:6`; existing explanation browser tests pass for supplied content.
- **Proposed fix:** Inventory explanation availability by source and acquire/review legitimate explanation content; retain the explicit unavailable state.
- **Verification status:** CONFIRMED content gap, not counted as a runtime bug. Source completeness and every empty item not individually verified.

### M02 — Question Bank lacks a book-topic selector

- **Feature:** Student Question Bank
- **Severity:** Medium
- **Description:** The bank exposes section/domain/skill/book/difficulty filters but no control for choosing a book’s topic hierarchy.
- **Reproduction:** Open Question Bank, select a book, and look for a book-topic filter.
- **Expected:** If book-topic selection is part of the intended bank workflow, a usable topic selector maps to the backend topic filter.
- **Actual:** Domain/skill selection exists; book-topic selection is absent. Backend candidate filters already accept `topic` and resolve descendants.
- **Likely root cause:** UI implementation did not expose the existing topic contract.
- **Evidence:** `src/features/learning/QuestionBank.jsx`; hosted/local `bank_candidate_ids` topic branch. Existing bank tests cover domain/skill rather than a book-topic control.
- **Proposed fix:** Decide whether domain/skill alone is the intended design; if book-topic selection is required, add a hierarchical selector using existing book/topic data.
- **Verification status:** CONFIRMED missing control; product requirement should be clarified before changing the design. Not counted as a runtime bug.

### M03 — Compromised-password protection is disabled

- **Feature:** Supabase Auth configuration
- **Severity:** Low
- **Description:** Hosted Auth does not enable the leaked-password protection setting.
- **Reproduction:** Read the linked security advisor output; do not create or change accounts during this audit.
- **Expected:** Security configuration follows the chosen account/password policy.
- **Actual:** `auth_leaked_password_protection` warning is present. No compromised account or successful unauthorized access was observed.
- **Likely root cause:** Hosted Auth configuration has not enabled this optional control.
- **Evidence:** Actual linked security advisor result.
- **Proposed fix:** Review support/plan requirements and enable protection if appropriate during an authorized configuration pass.
- **Verification status:** CONFIRMED configuration gap; password admission behavior not tested. Excluded from bug totals.

## Feature coverage and what is working

“Passed” in this table means the listed local tests passed. It does not establish deployed, hosted student behavior.

| Feature                                 | Local verification                                                                                                                                                                                                                                                                                                             | Hosted verification / limits                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Question Bank                           | Domain/skill unions, difficulty multi-select, source/book filtering, stable session creation, MCQ/open checks, correct/wrong outlines, explanations, overview, saved marks/elimination, resume and responsive layouts passed. Invalid-filter errors/retry and bounded request behavior passed.                                 | Actual eligibility cache and function definitions read; no missing eligible keys or unsupported answer UI found. M02 missing book-topic selector; C12 malformed-key boundary; C08 failed-save navigation; S01 scale risk. Actual student session recovery and grading BLOCKED. |
| Books                                   | Catalog paging/search and counts, hierarchy selection, mixed/open grading, original-style image/embedded options, plain/markup passages, blanks/underlines, explanation access, session navigation, marks, saved answers and tools passed.                                                                                     | Actual content counts/formatting presence verified. C14 JPEG explanation boundary; M01 explanation gaps. Three original-source visual checks skipped. Full PDF/key comparison and live asset fetching not performed.                                                           |
| Desmos and annotations                  | Configured SDK mounting and fallback, in-app calculator, drawing/highlight/eraser, mobile tools and state preservation passed with fixtures.                                                                                                                                                                                   | External live Desmos SDK, long-lived signed assets, and actual hosted annotation persistence were not verified. No general frontend exception observed in the full mocked suite.                                                                                               |
| Vocabulary                              | Definitions/examples, sets/source labels, favorites/search, multi-set study, recall progress/reload, typed tests and strict recall, saved test answers/resume, mistake-only replay, publication and draft hiding passed.                                                                                                       | Actual counts: 56 passages, no oversized word sets. C15 context collection truncation; S04 size assumption. Source accuracy of every definition/example and hosted progress writes BLOCKED.                                                                                    |
| One-time Homework, current local repair | SQL/browser create 10, deliver to A, edit to 20, database count/readback, A sees update, add/remove B, answer/reload, admin progress, history and atomic invalid-save rollback passed. Unit lifecycle additionally covers 10→5/15/20/30, mixed sources, simultaneous remove/add, groups, rejoining and >200 student directory. | Hosted definitions retain C01–C05; C06 local UI incompatibility exists until backend is updated. Pending repair has not been tested through actual hosted student accounts.                                                                                                    |
| Recurring Homework                      | Tashkent midnight/start/deadline boundaries, derived daily visibility, idempotent start, direct/group enrollment, late/missed state, pause/resume/archive, future revisions, finite-pool exhaustion, answer/reload, occurrence completion and dedicated admin reporting passed.                                                | Real template count/unique-instance health and definitions verified. C11 premature reuse remains even with pending migration. Live occurrence start/complete and clock-boundary browser verification BLOCKED.                                                                  |
| User management / permissions           | Existing admin/student route protection and account handler tests, student creation/deactivation browser fixtures, saved settings, own-session/RLS restrictions and answer-key privacy tests passed. Deactivation preserves accounts/history in the implementation.                                                            | `manage-student` ACTIVE version 1; all public tables have RLS. Hosted account creation/deactivation and deployed function source parity not exercised; C03 narrow Homework eligibility gap, M03 configuration gap. No destructive account tests performed.                     |
| Content Review / approval               | Admin-only review, publication blocking, approval/rejection, audit history and supported answer UI fixtures passed; unsafe markup rendering tests passed.                                                                                                                                                                      | Actual approved/pending totals and eligibility triggers read. Approval writes/source imports prohibited; every pending item’s source fidelity not reviewed. C12 eligibility key consistency remains.                                                                           |
| Student analytics / admin monitoring    | Existing metrics, active time, practice aggregates, bounded question lists, daily analytics and empty/responsive reporting pages passed.                                                                                                                                                                                       | C07 completed open-attempt load, C09 open-answer display, C10 time queue, C16 overview scope. Admin cards cannot currently be treated as complete platform-wide assignment totals.                                                                                             |
| Reliability / transactions              | Local atomic Homework rollback preserves metadata/sections/roster/progress; idempotent start and unique assignment/day constraints tested. Lint/build passed.                                                                                                                                                                  | No actual duplicates found. Real parallel Postgres connections, flaky-network hosted reload, high-volume authenticated queries, and full production access matrix not exercised. PGlite tests do not model all hosted concurrency/transport behavior.                          |

## Scheduling and intentional behavior

Daily occurrences are derived from versioned windows/enrollments; a missing midnight cron job is not itself a bug. A directory can expose scheduled work before an instance/session row is materialized on start. Current local tests verify Asia/Tashkent boundaries. Recurring edits and roster changes intentionally take effect the next local day; current/completed historical definitions are preserved. Turning reuse off intentionally produces an actionable exhaustion error once no eligible unseen questions remain.

Completed one-time attempts retain their original definitions after editing. The pending repair synchronizes unfinished attempts while preserving retained-question progress and archiving removed items. Legacy homework without recorded recipient configuration cannot reliably reconstruct former group/all-student intent until recipients are re-saved. The repaired admin directory still has a 200-assignment cap; admin pagination remains a known limitation even though the student cap is removed.

Neither the intentional next-day recurring policy nor preserving completed history is counted as a bug. Actual premature reuse despite unused questions is C11.

## Recommended fix/review order

1. **Access and answer loss:** C03 withdrawn-session access; C08 failed-save SPA navigation. Review all save/check/finish/read guards and recovery behavior first.
2. **Review the existing local Homework repair as one release unit:** C01–C06. Preserve atomic rollback/progress/history. Do not deploy the picker alone. Establish explicitly approved disposable hosted fixture accounts before subsequent hosted write verification; never use the scripts’ real-user fallback (S05).
3. **Admin completion visibility:** C07 and C09, followed by C16 overview scope, so monitoring reflects saved student activity.
4. **Recurring selection:** C11 and a regression proving never-assigned priority before reuse.
5. **Grading/eligibility consistency:** C12; validate key completeness and requested/actual question counts. No currently incorrect hosted numeric/MCQ grading key was established by this audit.
6. **Time accounting and content access:** C10, C14, C15; measure S02 long-session behavior.
7. **Maintenance, performance and content gaps:** C13; profile S01 before index/policy changes; decide boundaries for S03/S04; review M01–M03.

No implementation or release step in this order has been executed. Only this report was added to the tracked project work; existing uncommitted application/database/test files were preserved.
