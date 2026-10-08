# Admin submitted open-response review

October 8, 2026. Scope: audit C07 and the administrator's submitted open-response review workflow only. No deployment, Git push, hosted migration or real student data changes were performed. Previous uncommitted work was preserved.

## 1. Root cause

C07's `book_practice_open_review` required the owning student, while general session review allowed administrators. Consequently, fetching submitted open keys rejected an administrator and failed the whole attempt page. Phase 1 already contained the pending local permission fix and typed-response rendering. However, the administrator view still omitted the official key, and there were no existing manual grading controls or persistence model for submitted student responses. Source Content Review is a different workflow. The user explicitly approved adding **Mark correct**, **Mark incorrect**, and **Restore automatic grading**.

## 2. Fix implemented

`src/features/learning/OpenResponseReview.jsx` adds those three actions only to submitted open-response items in `AdminSession`, alongside the saved student response, frozen official accepted answers/range, effective correctness, and persisted review status. It displays save errors, disables buttons during saving/reloading, and permits loading the latest review after a conflict. Numeric range boundaries show inclusive/exclusive semantics rather than dropping the bounds or inventing an answer.

`src/features/learning/Reporting.jsx` mounts the component in the administrator attempt page. No other Homework, Books or Question Bank interface was changed in this task. Existing `getPractice` already merges open-key review data, and existing result/monitoring summaries already read each item's `correct` result, so these paths needed no changes.

The new local migration `20261008000300_admin_open_response_review.sql` adds:

- `practice_open_reviews`: original automatic correctness, current override, version, reviewer and timestamp. Students can read their own completed review; active administrators can read reviews. Clients have no direct write permission.
- `review_open_response`: active-admin-only, submitted-session/open-response-only RPC. It locks the session using the existing Homework/session lock order and atomically saves review metadata and effective correctness. Expected review versions reject stale decisions with SQLSTATE `40001`.
- A guarded correctness trigger: automatic grading/submission retries cannot erase a manual override. Rows with no override retain existing automatic grading. Restore clears the override and restores the original automatic result.
- Extended `book_practice_open_review`: consistent submitted owner/admin authorization, existing frozen key fields, and the saved review metadata.

The student's response, source question/key, answer revision, check-attempt history and timing are preserved. Review changes affect current submitted-result counts and student/admin correctness metrics; historical check attempts remain historical automatic events. No student can grade themselves through the RPC, and unfinished attempts cannot receive decisions or expose official keys through this review endpoint.

## 3. Tests

**Final results: 6/6 focused database tests, 4/4 SQL-backed browser tests, scoped ESLint, the production build, changed-file formatting, and `git diff --check` passed. No remaining targeted test failure.** The build was required to verify the newly imported review component and produced local artifacts only. Temporary evidence logs: `/tmp/satchi-admin-review-db.log`, `/tmp/satchi-admin-review-browser.log`, `/tmp/satchi-admin-review-lint.log`, `/tmp/satchi-admin-review-build.log`.

`tests/admin-open-review.test.js` reproduces the old C07 function's admin denial and verifies the restored definition. It covers submitted Homework/Book/Bank review, all actions, metadata/readback, student/admin totals, preserved responses and answer versions, stale reviews, direct-write rejection, student/other-account/inactive-admin restrictions, unfinished attempt rejection, positive numeric-alternative automatic grading, and submission replay protection for both correct and incorrect overrides.

`tests/browser/admin-open-review-actions.spec.js` executes real migrated PostgreSQL/PGlite RPCs/RLS through the existing browser adapter. It covers save failure, retry, two-tab stale-review rejection, all three actions, reload persistence, official-answer inspection, and actual student result changes after reload. Additional cases verify inclusive and exclusive official ranges. The existing `admin-open-review.spec.js` remains unchanged and also runs. The initial stale-review browser assertion was a fixture timing failure: the second tab had not finished fetching its initial version before the first review. Waiting for both original snapshots corrected the test, and the rerun passed.

Fixtures live only in disposable local databases. Browser authentication and the REST adapter are simulated; database review results are not mocked. This does **not** constitute hosted Supabase Auth/PostgREST/student verification. No broad platform audit or unrelated test repair was repeated.

## 4. Migration requirement

**Yes.** `20261008000300_admin_open_response_review.sql` is created locally and was applied only to test databases. It depends on the existing pending lifecycle/answer-integrity migrations (`20261008000100`, `20261008000200`), which were preserved unchanged. No production migration was applied. A later approved migration/frontend release and safe hosted verification are needed before calling this a production fix.

## 5. Local connection and verification

The ignored `.env.local` now contains the supplied project URL and publishable key, with restricted file permissions. No secret key was put in a `VITE_` variable or stored by this task. A read-only hosted `/auth/v1/settings` request with the publishable key returned **HTTP 200**. That verifies configuration/connectivity, not a sign-in/sign-up workflow; restart any existing Vite server to pick up the changed environment. Real account creation/sign-in and review writes were not attempted.

## 6. Remaining issues

Hosted review decisions remain unverified and unavailable until the required migrations and frontend release are approved/applied. Hosted end-to-end review tests: **0**. The review table retains the latest reviewer/decision and original automatic grade; it is not a full chronological decision-audit log. Results refresh on reload; no live cross-tab subscription was added. The unrelated platform audit issues remain outside this task. The secret shared in chat should be rotated in Supabase and kept out of browser configuration.

Reproduce with installed project tooling:

```sh
node --test --test-concurrency=1 tests/admin-open-review.test.js
npm run test:e2e -- tests/browser/admin-open-review.spec.js tests/browser/admin-open-review-actions.spec.js --workers=1
npx eslint src/features/learning/OpenResponseReview.jsx src/features/learning/Reporting.jsx tests/admin-open-review.test.js tests/helpers/open-review-database.js tests/browser/admin-open-review-actions.spec.js
npm run build
git diff --check
```
