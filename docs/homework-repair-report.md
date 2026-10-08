# Homework repair — local verification, October 8, 2026

No frontend deployment, hosted migration, Git push, production account mutation, or production data cleanup was performed. The available checkout is `/home/otabek/Desktop/sat-chi`; `/home/otabek/Desktop/satchi` does not exist.

## 1. Increasing-question Save failure

Reproduced against the old `update_homework` function using real local PostgreSQL/PGlite: create 10 MCQs, select 20 questions including an approved package open response, and Save. The old selector explicitly requires `question_type='mcq'`, so it cannot satisfy the submitted count and raises “Not enough eligible questions.” The old `homework_questions.correct_answer` column also requires a non-null integer and has no frozen open-response key. The picker exposes open responses. Removing that question can therefore make a smaller save succeed. The corrected selector and schema saved all 20 and graded the supplied open-response answer.

There is also an admin/student eligibility mismatch: the admin bank permits unpublished or unapproved ordinary questions that must not be delivered. Homework's picker and save now require published, student-ready content. Selected IDs define the pool independently of browsing filters, supporting selections across books/domains. Duplicate IDs or counts inconsistent with the explicit selection fail with meaningful errors. Random selection keeps the requested count. Limits remain 20 sections and 500 questions total.

These are confirmed defects in this checkout, not a forensic diagnosis of the unavailable hosted database. Hosted migration history, execution plans, timeout logs, and failing payloads could not be inspected.

## 2. Missing or stale student assignments

One-time assignments were resolved on create/edit only. Group membership changes and activation/all-student roster changes did not update assignment rows. New roster triggers resolve current active students, upsert each `(homework_id, student_id)` once, and soft-disable removed recipients. Rejoining students' unfinished attempts are synchronized.

The student directory also had an unconditional 200-row limit; assigned older homework could disappear from the result. Students now receive their full directory; the admin view retains its explicitly stated 200-record cap.

Started one-time attempts previously retained an old question snapshot after edits. Unfinished attempts now receive current definitions, preserve item IDs/answers/marks for unchanged questions and keys, and retain removed item/key snapshots in a private archive. Completed attempts remain immutable. Withdrawal blocks unfinished attempt reads, saves, and submissions through old URLs while retaining completed history. Saving, opening, and submission use a consistent homework → assignment → session lock order.

## 3. Files and functions changed

- `supabase/migrations/20261008000100_homework_lifecycle.sql`: `create_homework`, `update_homework`, `start_homework`, `homework_directory`, assignment-aware `bank_candidate_ids`, save/finish access guards, private candidate/session synchronization helpers, roster triggers, frozen open keys, and private removed-item history.
- `src/features/learning/HomeworkForm.jsx`: explicit Asia/Tashkent due-date input/conversion and save/history explanation.
- `src/features/learning/QuestionPicker.jsx`: assignable content only and reset pagination after browsing-filter changes.
- `src/features/learning/homework-model.js`: timezone-independent due-date conversion.
- `src/features/learning/Homework.jsx`: admin answered/total progress column.
- `tests/homework-lifecycle.test.js`, `tests/helpers/homework-database.js`: SQL lifecycle/rollback/eligibility/snapshot/roster regressions.
- `tests/browser/homework-database.spec.js`, `tests/browser/helpers/homework-database.js`: real SQL-backed browser workflows with disposable local profiles.
- `tests/homework-bug-fixes.test.js`: assert withdrawal prevents student reads while admin retains the same stored history.

## 4. Database and migration status

The new additive migration is executed by the local database tests after every existing migration. It is **not applied to the hosted database**. Existing applied migration files are unchanged.

The migration adds frozen open keys and permits null integer keys for open responses, adds an admin-only removed-item archive, and makes section position uniqueness deferrable to reorder sections without temporary collisions or exponentially increasing offsets. All content, answer keys, and assignment writes remain in one RPC transaction; errors roll back metadata, sections, assignments, and progress together. Helpers are private and use an empty search path. A recreated internal bank helper's leaked browser execute grant is revoked.

Starting an assignment synchronizes only that student's attempt. Specific saves fetch the selected source IDs rather than rescanning the complete bank; eligibility uses the maintained cache. Hosted-volume performance and simultaneous-connection races remain unverified.

## 5–10. Verification results

Final results: **46/46 targeted database/unit checks**, **26/26 browser tests** (2 SQL-backed workflows and 24 existing network-fixture regressions), lint, production build, changed-file formatting, and `git diff --check` passed. Hosted end-to-end tests: **0**.

The earlier full unit run passed 136/138 checks. The book-reset failure reproduces in the unchanged baseline. The other failure was a cover-rendering timeout under concurrent load; rerunning the cover suite alone passed **3/3**. The final relevant database and browser suites were run sequentially. Local SQL tests and SQL-backed browser workflows are distinct from hosted end-to-end verification. Browser authentication is simulated; application REST reads/RPCs execute the actual migrations and RLS in PGlite, with no canned homework results. Local profiles and homework exist only in disposable in-memory databases, which are closed after tests.

- Count edits: 10 → 5, 10 → 15, 10 → 20, 10 → 30; mixed sources; simultaneous removals/additions; approved open response; rollback on insufficient pool.
- Delivery: direct recipients, group membership addition/removal/rejoining, unique assignment rows, and student directory beyond 200 rows.
- Progress: answer persistence after reload, retained item identity and marks, removed-answer archival, completed immutable snapshots, and admin answered/total/status readback.
- Recurring: Asia/Tashkent midnight/start/end boundaries, idempotent start, recipient/group eligibility, future revisions, missed days, late policy, pool exhaustion, pause/resume, completion, and admin reporting. Existing recurring semantics intentionally apply edits and roster changes tomorrow in the template timezone, preserving today's and historical definitions. Occurrences are derived by directory/report queries; a scheduler or external notification is not required for in-account delivery.

## 11. Remaining limitations

No authorized hosted database connection or disposable hosted account credentials were available. Hosted end-to-end tests performed: **0**. Actual Supabase Auth, PostgREST transport, hosted RLS/migration state, and production performance therefore remain unverified. The repair must not be called a verified production fix.

The full unit run exposed a book-reset failure (`Protected data changed: question_bank_eligibility`) that also reproduces without this migration, and a cover-rendering ImageMagick timeout. The cover suite passed on its isolated rerun. Those unrelated implementations were not changed.

Legacy one-time homework without saved recipient configuration retains its existing direct assignment rows; the original group/all-student intent cannot be reconstructed until an admin re-saves the recipients.

The admin one-time directory remains capped at 200 assignment records. Recurring edits take effect next day; a finite pool without repetition intentionally refuses generation after exhaustion with an actionable error. Completed one-time attempts show their original question definitions rather than being reopened on content edits.

## 12. Deployment requirement

A later frontend deployment and application of the additive migration are necessary for hosted users to receive this repair. Neither was performed. No Git commit or push was made.

## Reproduce local checks

Use Node 22.12+ (or 24+) and `npm ci`. If Node is absent, this session installed Node 22.16.0 temporarily in `/tmp/node-v22.16.0-linux-x64`; prepend its `bin` to `PATH` when reproducing in this machine session.

```sh
node --test --test-concurrency=2 tests/homework-lifecycle.test.js tests/homework-bug-fixes.test.js tests/daily-homework.test.js tests/daily-reporting.test.js tests/learning.test.js tests/book-package.test.js tests/practice-attempts.test.js
npm run test:e2e -- tests/browser/homework-database.spec.js tests/browser/homework-save.spec.js tests/browser/homework-bug-fixes.spec.js tests/browser/daily-homework.spec.js --workers=1
npm run lint
npm run build
```

Run database/unit and browser suites sequentially on this low-memory machine. Install Playwright Chromium once with `npx playwright install chromium`. The browser adapter implements only the REST subset used by these tests; it does not substitute for hosted Auth/PostgREST integration testing.


## Existing connection audit and required configuration

The repository contains no `.env`, `.env.local`, or `.env.production`, and no `supabase/.temp` link state. `supabase/config.toml` is present, but its `project_id = "satchi"` is local configuration, not authentication or hosted link state. Relevant environment variables and CLI token files under `~/.supabase` / `~/.config/supabase` are absent. Existing live verification scripts depend on `.env` and a logged-in CLI; they cannot recover credentials here. Their fallback to a real student is unsuitable for this task and was not invoked.

`npx --offline supabase@2.119.0 projects list --output json` was executed and failed with exit code 1 because no access token is available. The CLI itself is available through the npm cache after this session's installation; authentication and link state remain absent. No API keys were revealed or production scripts run.

The historical project reference recorded in the repository is `ileffhbbaomfimwulvpw`; it has not been verified by an authenticated connection in this session.

For frontend access, create an ignored `.env.local` (copy `.env.example`) containing:

```dotenv
VITE_SUPABASE_URL=https://ileffhbbaomfimwulvpw.supabase.co
VITE_SUPABASE_ANON_KEY=<project public anon or publishable key>
```

Restart the local development server after configuring it. Do not place a server/service-role key in any `VITE_` variable.

To restore management access and inspect the existing project/link state, authenticate the CLI using `npx supabase login`, then run `npx supabase projects list` and `npx supabase link --project-ref ileffhbbaomfimwulvpw`. Supply the database password interactively when prompted. An existing `SUPABASE_ACCESS_TOKEN` can also supply CLI authentication. A private `DATABASE_URL` connection string is an alternative for PostgreSQL catalog/migration inspection; `SUPABASE_DB_PASSWORD` can supply the linked database password. Store secrets locally, never in tracked files or chat.

Hosted student workflow verification additionally requires an explicitly identified safe admin fixture and two safe student fixtures with authorized sign-in credentials/session access. Public frontend configuration alone does not authorize test-account impersonation or private database inspection. Production student accounts must not be selected as a fallback. Hosted migration application and production data changes require separate explicit approval; this session performed neither.
