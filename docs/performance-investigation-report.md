# Practice performance investigation

2026-10-11. Baseline: local/deployed commit `c0e3d14`. All changes and write tests stayed local; no production requests, deployment, push, migrations, or student-data changes.

## Findings and changes

**Check availability:** Player disabled Check while any answer save was pending (`saving`). The selection itself updated locally, but the button waited for a network acknowledgement. Delaying the actual PostgreSQL/PostgREST save reproduced the reported delay. The existing Check handler already awaits the latest persistence queue before grading. Removing only `saving` from the button's disabled condition makes Check immediately available while retaining that barrier. A failed or conflicting save prevents grading. The synchronous duplicate-click guard, event UUID, revision checks, durable pending-answer outbox, acknowledgement validation, study-time flush, and authoritative background reconciliation remain intact. Saving/Saved/Error indicators are unchanged.

**Startup:** `getPractice` fetched session metadata, session items, and recorded attempts sequentially. Session metadata and items independently enforce ownership through RLS, so these two reads now start together with `Promise.all`. Nothing is published until both succeed. Attempt pagination, completed-session reviews, answer revisions and frozen snapshots remain unchanged. This removes one request round trip from the startup critical path without adding requests.

**Navigation and images:** Current-session question content is already resident; first and return navigation made zero question-content GET requests. Existing image handling already caches owner-scoped signed URLs, coalesces signing requests, preloads only the next question (up to five assets), and bounds the resident preload map to ten entries. Check retained the exact question/image DOM nodes. Existing real-Desmos regressions also confirmed no extra application/image requests for toolbar interactions. There was no measured justification to replace this cache, compress originals, add another prefetch layer, or change Storage permissions.

## Measurements

Chromium, Vite development server, actual isolated PostgreSQL 17/PostgREST. Auth and Storage transports are synthetic fixtures; private-image policy checks use the real database. GET requests had 200 ms added latency during startup; selection writes had the delay specified below. Requests continued to the actual server; grading and persistence responses were not mocked.

Each final before/after pair uses the same test and fixtures against the baseline worktree and optimized checkout. These are individual samples, not statistically meaningful p95 estimates. Earlier independent samples also reproduced Check availability improving from 1,593 to 41 ms and 582 to 49 ms. Vite cold initialization and development StrictMode contribute to total startup timings. These figures are **not production benchmarks**.

| Metric | Before | After |
|---|---:|---:|
| Book selected-option visual state, 1,500 ms save delay | 27 ms | 24 ms |
| Book selection → Check enabled, 1,500 ms save delay | 1,612 ms | 50 ms |
| Bank selected-option visual state, 500 ms save delay | 17 ms | 16 ms |
| Bank selection → Check enabled, 500 ms save delay | 589 ms | 36 ms |
| Book Check click → feedback | 101 ms | 1,561 ms |
| Bank Check click → feedback | 109 ms | 609 ms |
| Book startup, added 200 ms per GET | 1,952 ms | 1,785 ms |
| Bank startup, added 200 ms per GET | 1,863 ms | 1,700 ms |
| Homework startup, added 200 ms per GET | 1,739 ms | 1,268 ms |
| Session startup GET envelope, Book / Bank | 1,337 / 1,334 ms | 1,057 / 1,055 ms |
| First-render question transition, Book / Bank | 107 / 98 ms | 95 / 63 ms |
| Return transition, Book / Bank | 109 / 92 ms | 112 / 79 ms |
| Content GETs per next/previous transition | 0 | 0 |
| Fixture reference image ready after question render | 60 ms | 50 ms |

Check-to-feedback needs careful interpretation: before, the student could not click until the selection save finished. After, the student can click immediately and sees Checking while the dependent save finishes. Feedback remains server-authoritative; moving this wait inside Check does **not** eliminate the save/grading round trips or justify optimistic correctness feedback. Homework intentionally autosaves and grades on submission; it has no individual Check button. Its saving/submission semantics were preserved.

The image timing is a tiny fixture image and includes test observation overhead. It does not measure large production scans, compression, decoding, signed-URL issuance, or hosted Storage response times. No image-speed improvement is claimed. All session items are loaded at startup, so “first-render transition” is not an uncached network fetch.

## Reliability verification

One relevant regression pass: **43 tests passed, zero failed/skipped**, covering persistence-controller acknowledgements/drafts, real SQL conflicts and atomicity, native browser restart/fresh-login recovery, lost acknowledgements, interrupted submissions, stale tabs, concurrent students/ownership, MCQ/open/image questions, explanations, two books and Question Bank, 500-item sessions, recurring pools and 7→8 editing, completed history, admin grading/results, standings, and the learning toolbar/real Desmos/Pen/Night Light/Overview.

The new `tests/check-latency-native.test.js` additionally tests immediate Check during 500/1,500 ms delayed real saves, duplicate Check clicks, database-selected answers and revisions, exactly one attempt, stable question/image nodes, next/back content requests, reload restoration, Homework autosave, failed dependent saves preventing grading, rapid answer changes, and a grading commit whose HTTP acknowledgement is lost followed by an idempotent retry.

Initial benchmark harness failures were preserved in temporary logs rather than counted as passes. Repeated Book samples incorrectly assumed startup created a fresh writable session: the existing resume RPC deliberately returns historical/completed sessions too. The failure-injection fixture now starts a fresh Bank session through its public authenticated RPC. Route teardown is scoped to the installed routes; animation-frame polling has a bounded watchdog. A failed-grade error lives inside an alert that also contains a Retry button; the test now checks the alert text rather than expecting a separate element with exactly that text. No application protection or assertion was disabled to accommodate the fixtures.

Scoped ESLint, production build and `git diff --check`: passed. Final focused benchmark: **1 passed, zero failed/skipped**, including failure injection and PostgreSQL assertions. The final baseline benchmark also passed all baseline persistence/navigation assertions. Total final regression cases: **44 passed** across the relevant pass and new focused test. Two early repeated-sample harness failures and one overly strict error-text locator failure were corrected as described; they are not counted as successful verification.

## Limits and release status

No database changes or migrations are needed. No slow SQL plan, missing index, or oversized production image was demonstrated by this investigation; no production EXPLAIN or hosted latency claim is made. The native regression exercises large representative pools and sessions, but is not a production load test. Remaining sequential history/review reads and save → study-time → grading round trips can still make hosted feedback slower. Combining those safely would require separately measured and verified work, not removing revision protections or leaking answer keys.

These focused frontend changes passed local verification and are ready for manual review; deployment remains unapproved and unperformed. Production latency still needs a bounded hosted benchmark after separately authorized deployment. The local commit is available with `git log -1 --format=%h`; pre-existing release-report edits are intentionally excluded.

## Manual inspection and reproduction

```sh
cd ~/Desktop/sat-chi
npm run dev:isolated
```

Use the localhost URL printed by the command. Student: `student@fixture.invalid`; admin: `admin@fixture.invalid`; fixture-only password for both: `disposable-test-only`. Reload/login preserve data during the run. Restarting the command creates fresh disposable fixtures and applies local migrations only to isolated PostgreSQL. Desmos needs internet access.

Focused benchmark command with the installed native tools:

```sh
LD_LIBRARY_PATH="$HOME/.cache/satchi-test-tools/pg17/opt/pgsql-17/lib" \
SATCHI_TEST_POSTGRES_BIN="$HOME/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin" \
SATCHI_TEST_POSTGREST="$HOME/.cache/satchi-test-tools/postgrest14/postgrest" \
node --test tests/check-latency-native.test.js
```

`SATCHI_PERF_BASELINE=1` is only for an unchanged baseline checkout, with this benchmark copied into it. It retains persistence/navigation assertions and expects the old pending-save delay. Regular execution requires Check availability under 100 ms.
