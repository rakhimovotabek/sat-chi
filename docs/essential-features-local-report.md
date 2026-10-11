# Essential features — local verification

Production was not changed. No push, deployment, account mutation, or production migration was performed. The previously uncommitted production-release status report is preserved separately.

## Homework results

Recurring View previously rendered an easily missed panel below the list; its overview did not load date-specific student results. View now opens an admin assignment route, with an occurrence date for recurring assignments. The existing history-summary tabs remain available. One-time assignments now also have a View link. The reporting RPC includes every assignment recipient, rather than deriving a partial assignment overview from the global 200-row directory.

Reports derive answered/correct/incorrect/ungraded/unanswered counts from persisted items, including written responses. Withdrawn historical attempts remain inspectable. Recurring results use the selected date's frozen revision and instances, not today's combined history. Group names and the occurrence's configured audience are shown. Eligible students exclude inactive recipients. Accuracy is the combined accuracy of graded answers; awaiting-grading answers are excluded from its denominator.

The existing admin attempt page now renders passages, question/reference/option images, all options, the actual selected/written answer, frozen official keys, explanations, recorded Check history, and existing manual-review actions/status. Missing history is explicitly described as unrecorded. Pending grading is distinguished from incorrect and unanswered. Official keys use a new server-enforced admin-only RPC, including for unfinished attempts; student access is rejected. No grading or answer-saving function was replaced.

## Standings

The previous metric was all-time answered questions in submitted sessions, ranked descending with student ID as the tie breaker. It missed open responses and most ongoing Book/Bank practice, even when Check had persisted an attempt.

The revised metric is **distinct answered SAT source questions across Book Practice, Question Bank, and Homework**. Completed answered work and persisted Checks qualify. Merely selecting an unchecked answer in unfinished work does not qualify. A source question counts once per student across modes and sessions. The latest qualifying result supplies correctness; retries and incorrect-to-correct changes cannot add another question or points. Historical records are backfilled. If a historical snapshot has no source question ID, its stable item ID is used; cross-session deduplication cannot be inferred for such records.

The all-time period, top-100 limit, active-student filtering, group scope, and deterministic tie breaker remain. Both workspaces use the same RPC. A private derived cache avoids rescanning learning history on leaderboard page loads. Write-side refreshes are indexed and confined to the affected student; multi-item grading refreshes once per owner per SQL statement. Heartbeats update the time total without rescanning question history. Per-student serialization prevents competing sessions from publishing stale aggregates. Actual source answers and grades are never rewritten by this cache.

## Night Light and optional work

A header button toggles a subtle 10% warm CSS overlay, persisted in localStorage. It also tints images/embedded calculators; pointer events pass through. It changes neither question state nor image files and does not remount questions. The existing Pen button now uses an accessible icon/tooltip. Optional question-layout and floating-Desmos changes were intentionally not attempted.

## Pending local migrations

Apply **only after separate release approval**, in order after the existing migration chain:

1. `20261011000100_admin_homework_results.sql`: read-only admin assignment reporting and frozen-answer inspection.
2. `20261011000200_consistent_learning_standings.sql`: private cached standings, historical backfill, maintenance triggers, and compatible existing RPC output.

Both were applied successfully to isolated PostgreSQL 17, with existing homework and completed historical open-response data. The deployed frontend's existing RPC signatures remain valid. The new admin UI needs 110001. Before production release, review backfill/index duration with production-sized data, take the normal recoverable backup, and use the established write gate during schema/backfill changes. Recovery for the cache is rebuildable from preserved source records; do not restore or reset student progress to roll back a reporting change.

## Tests

- Focused PostgreSQL 17/PostgREST/Chromium feature test and two model tests: **3 passed, zero failed/skipped**. Covers server admin denial, actual View navigation/student details/options, recurring date separation, historical open-response backfill, all three learning modes, repeated-source deduplication, grading correction without score inflation, admin/student totals, cache privacy, concurrent same-student session inserts without FK/aggregate-lock deadlocks, Night Light retention/reload, image-option Check, server acknowledgement, and answer restoration against database rows.
- Existing open-response review regressions: **6 passed** (PGlite), covering Homework/Books/Bank manual decisions and automatic grading restoration. No complete suite was run.
- `npm run lint` and `npm run build`: passed. `git diff --check`: passed.
- Initial focused-run failures were corrected test assumptions: RPC spelling, a date before the fixture assignment existed, attempting to Check an already-solved resumed question, and expecting Homework feedback wording in Book Practice. The final run does not skip or weaken those workflows.
- Auth and Storage transports in the isolated browser environment are fixture services; database/RLS/RPC/answer persistence run against actual PostgreSQL 17/PostgREST. This is not hosted Supabase verification or production-volume performance certification.

## Manual testing

```sh
cd ~/Desktop/sat-chi
npm run dev:isolated
```

This starts disposable PostgreSQL 17, PostgREST, fixture Auth/Storage, and Vite with all local migrations, and prints its localhost URL. The currently running environment is **http://127.0.0.1:41061**.

- Admin: `admin@fixture.invalid`
- Student: `student@fixture.invalid`
- Password for both: `disposable-test-only`

Use Admin → Homework → View, choose a date, and open student Details. Use either workspace's Standings → Everyone to inspect combined activity. In the student workspace, use Books → fixture topic for MCQ/open/image choices and Check; use the header Night Light button, then reload.

These accounts/data exist only in the isolated environment. Reload and login preserve data during the run; restarting the command creates fresh fixtures. Ctrl+C shuts it down. The cached PostgreSQL/PostgREST binaries must exist at the documented defaults in `scripts/testing/manual-development.js`, or supply `SATCHI_TEST_POSTGRES_BIN` and `SATCHI_TEST_POSTGREST`. Do not use plain `npm run dev` to test these pending database features against the production configuration.
