# Locally reproduced bugs — repair and verification, 2026-10-08

No deployment, GitHub push, or production migration was performed. Existing uncommitted Phase 1/2 work was preserved. Linked browser tests used the explicitly authorized admin/student accounts and one disposable assignment. That assignment and its session were removed with exact-ID and exact-title guards; linked SQL verified both remaining counts were zero. Existing accounts, content, and unrelated progress were preserved.

## 1. Practice saving

**Root cause:** the linked schema does not contain `public.save_practice_changes(p_session uuid,p_changes jsonb)`. The frontend sends those exact named parameters. Pending migration `20261008000200_practice_answer_integrity.sql` defines that exact contract, including persisted-answer acknowledgements and revision checks. The hosted migration history stops before the pending 20261008 migrations. An older `save_book_practice(p_session_id,p_answers)` function exists, but using its unversioned implementation as a fallback would undermine answer integrity. This is an unapplied migration, not an obsolete signature; reloading the current schema cache alone cannot create the missing function.

**Reproduce:** run the current Vite application against the linked Supabase project, sign in as the authorized student, open the disposable homework, and select an answer. Network returns HTTP404/PGRST202 for `save_practice_changes`.

**Source fix:** retain the versioned persistence contract and durable recovery outbox; map PGRST202 to a clear server-update message. The UI remains **Save failed** until a genuine database acknowledgement arrives. Pending answers stay recoverable locally. No error is hidden and no acknowledgement is fabricated.

**Verified:** actual hosted browser failure, accurate failure status, and unsaved draft recovery after refresh. Actual Vite/PostgREST/native PostgreSQL after isolated migration verified persisted MCQ answers across refresh and logout/login, open-response and image-choice persistence, and failed offline saves followed by successful retry. Database assertions inspect the exact question IDs and stored answers. The existing targeted SQL tests additionally verify stale/concurrent writes, lost acknowledgements, atomic rollback, and withdrawal checks.

**Hosted status:** successful backend persistence remains **BLOCKED** until the required migration is approved and applied. Hosted logout/login persistence after successful saving cannot yet be claimed.

## 2. SATakror reference images

**Root cause:** the Storage authorization helper allows approved source assets and owned frozen Book/Bank snapshots, but omits Homework snapshots. A frozen Homework question can retain valid asset references while its current source question is unapproved. The object exists, but signing is denied.

| Screenshot question                    | Question ID                            | Source status      | Actual hosted student HTTP                         |
| -------------------------------------- | -------------------------------------- | ------------------ | -------------------------------------------------- |
| Men of Maize / My Name Is Red, q100 v2 | `e5e3ef38-b5de-5efc-a0eb-a4391fd175a0` | Not approved/ready | Signing HTTP400; Storage SDK reports statusCode404 |
| Defoe / The Storm, q13 v1              | `0c3530cb-2955-5db8-a472-7014f368237d` | Approved/ready     | Signing200; fresh signed-image fetch200            |

Storage bucket: `book-package-assets`. Exact references:

- q100: `a17f2e1b524cf015e49068bbd59435f51beba55b4213bb2d129011aa244d692d/279cac675e430aeb57e6d5122a50318b8b58500085b0f0ab40363b619a369abf.png`.
- q13: `a17f2e1b524cf015e49068bbd59435f51beba55b4213bb2d129011aa244d692d/9e858a5ee6a77902a9bb18adbf32f167bf8aa9df1112346d72955aa043a2d59c.png`.

Read-only linked inspection confirmed both asset mappings and both actual PNG Storage objects exist. Both referenced snapshot sessions have kind `homework` and title `SATakror`. Fresh signing reproduces the failure, so expiry is not the cause of this observed case. The frontend requests 3600-second URLs and Retry image requests a new URL.

**Source fix:** new local migration `20261008000400_homework_snapshot_assets.sql` replaces the existing helper, extending frozen-image access to Homework with `can_access_homework_session` authorization. Source approval requirements, private archive restrictions, explanation gating, and ownership remain enforced. Existing completed history remains readable. No source approval, asset reimport, or asset regeneration was performed.

**Verified:** actual hosted signing/fetch responses above; isolated browser retry successfully loads the frozen image without approving its source. Actual local Storage-table RLS denies another student and a withdrawn unfinished attempt, denies an unanswered explanation, and preserves completed-history image access and the saved answer.

**Hosted status:** repair remains **BLOCKED** on approved migrations 080001 and 080004. q100's current source review status is preserved and requires separate content review before it becomes eligible for new practice or assignment selection.

## 3. Recurring editor filters and minimum pool size

**Root cause:** the linked `bank_candidate_ids` filter whitelist lacks `assignment`. The current picker needs `assignment:true` to use the student-eligible pool. Pending migration 080001 adds that supported contract. The inspected book, subject, difficulty and topic fields were not the incompatible field in this case.

The seven-selected/eight-required message is independently valid: seven distinct selected questions cannot supply eight daily questions. That validation must remain.

**Source fix:** route the picker through `assignmentBank`. On Invalid filters, an otherwise identical request without assignment is used only to diagnose an older server. If that probe succeeds, display an explicit server-update message and preserve selections. Never display or return that potentially broader legacy admin pool. If both requests reject genuine invalid filters, retain the original error. Compatible servers use a single request.

**Verified:** actual hosted RPC returns HTTP400/P0001 Invalid filters; actual admin editor shows the server-update diagnostic. Isolated browser/database workflow keeps the seven/eight validation, selects an eighth eligible question and saves eight, then rejects nine with eight selected, lowers the daily count to seven and saves again. Database version rows and reopening the editor confirm both saved configurations. Recurring edits retain the existing next-local-day semantics.

**Hosted status:** successful compatible picker/save verification remains **BLOCKED** on approval/application of migration 080001. Existing genuine insufficient-selection validation is retained.

## 4. Check versus final submission

**Root cause of the screenshot discrepancy:** the screenshot sessions are Homework, although the shared shell breadcrumb says Book practice. Homework finalization is legitimate and must preserve its separate grading/submission behavior. Actual Book/Bank sessions already use individual Check and do not expose Submit practice.

**Source fix:** label Homework's final action **Submit homework**, retaining individual Check for Book/Bank. No session kind was converted and no early Homework answer key was exposed.

**Verified:** actual isolated Book Practice selects a wrong answer, checks it, shows wrong feedback, retrieves Explanation, selects the correct answer, checks it, and persists both attempts after reload. Open-response and image-choice checks also persist. Homework keeps its separate submission action. Complementary browser regressions were updated for the Homework label.

The shared Book practice breadcrumb is a remaining cosmetic mismatch outside these scoped repairs.

## Files and database changes

Changes for this task, in addition to preserved earlier work:

- `src/features/books/api.js`: missing-save-RPC error diagnosis.
- `src/features/learning/api.js`: assignment-filter contract diagnosis.
- `src/features/learning/QuestionPicker.jsx`: call the compatible assignment-pool API.
- `src/features/player/Player.jsx`: distinguish the final Homework label.
- `supabase/migrations/20261008000400_homework_snapshot_assets.sql`: scoped replacement of `can_read_book_package_asset(text)`.
- `tests/helpers/native-app-environment.js`, `tests/native-app-workflows.test.js`: actual Vite/PostgREST/PostgreSQL regression infrastructure and six scenarios.
- `tests/browser/homework-filter-contract.spec.js`: focused diagnostic contract tests with simulated RPC responses.
- Homework submission-label assertions in `tests/browser/daily-homework.spec.js`, `homework-database.spec.js`, and `learning.spec.js`.
- `README.md`: reproducible isolated regression command.

Final read-only linked schema/cleanup verification again confirmed the save RPC is absent, no 20261008 migration is applied, and both disposable-data remaining counts are zero.

Pending linked migrations remain: 080001 lifecycle, 080002 answer integrity, 080003 admin review from the preceding task, and 080004 snapshot assets. No duplicate save function was added. After approved application, verify PostgREST exposes the exact named parameters; reload its schema cache if needed, then repeat authenticated hosted persistence, picker and image checks. Native tests applied these migrations only to disposable clusters.

## Verification environments and evidence

- **Linked Supabase, actual authenticated browser:** successful admin/student sign-in; disposable direct assignment delivery; missing save RPC; unsaved draft recovery; q100/q13 Storage signing and image HTTP; assignment-filter mismatch; improved admin diagnostic. No successful hosted repair claim.
- **Native isolated database and actual application:** PostgreSQL18.6, PostgREST16.4, Vite and Chromium. Application REST/RPC requests are neither intercepted nor canned. Local Auth and Storage HTTP transport are fixture services; Storage authorization executes actual database RLS. Six scenarios, seven Node checks including their parent, all passed in two successive final runs. Native PostgreSQL is not a complete local Supabase stack and uses a different major database version from a potentially older hosted project.
- **Targeted embedded PostgreSQL/unit tests:** 45 checks passed in `book-package`, `homework-lifecycle`, `practice-answer-integrity`, and `practice-persistence` suites.
- **Complementary Playwright regressions:** 61 passed, zero failed, two skipped across the scoped 60-test run and the three new filter-contract tests. The skipped original-source crop tests require the optional `SATCHI_PACKAGE_DIR` checkpoint; they do not verify SATakror. Mock HTTP success is not treated as hosted verification; the existing database-adapter browser tests use embedded PostgreSQL.
- **Scoped lint:** passed for changed application/test JavaScript files.
- **Build:** `npm run build` passed. Build output is local only.

Earlier native harness failures included PostgreSQL boolean parsing and Chromium module-loading resource errors during rapid document navigation. The corrected tests use JSON-valued SQL assertions, wait for the actual signed-in dashboard, resume Homework through the actual UI, and check for frontend exceptions, unexpected failed HTTP requests and resource errors. The passing run includes genuine refresh and logout/login. Those earlier failed runs were not counted as repair verification.

Temporary evidence: `/tmp/satchi-native-final.log`, `/tmp/satchi-picker-contract.log`, `/tmp/satchi-final-schema-check.json`, `/tmp/satchi-native-workflows.log`, `/tmp/satchi-targeted-unit.log`, `/tmp/satchi-scoped-browser.log`, `/tmp/satchi-scoped-build.log`, `/tmp/satchi-hosted-browser-results.json`, `/tmp/satchi-cleanup-disposable.json`, and the read-only screenshot catalog/asset JSON. No passwords, tokens or secret keys are included in this report.

## Release status

1. **Fixed locally:** clearer save/filter errors without false success or unsafe fallback; distinct Submit homework label; isolated database/browser persistence, filter and asset fixes verified.
2. **Fixed in source but blocked on unapplied migrations:** linked answer saving, assignment-filter support, and frozen Homework image access.
3. **Still broken on the linked schema:** those three backend behaviors until approved schema updates. They were not repaired remotely.
4. **Requires manual review:** approval/application of pending migrations, subsequent hosted verification, and separate review of q100's source eligibility. The shared breadcrumb remains cosmetic.

Frontend deployment will eventually be needed to publish the local UI changes, coordinated with the required schema. None was performed or scheduled automatically.
