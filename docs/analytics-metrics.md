# Progress activity semantics

`progress_activity(days, section)` returns personal aggregate data only, using
existing `learning_question_facts(auth.uid())`. Allowed windows: 7, 30, 90 local
calendar days including today. Subject: all, Math, Reading & Writing. Stored
`study_preferences.timezone` controls dates, with UTC fallback. No student ID
parameter exists; active authentication is mandatory. No answer payloads return.

One canonical question contributes once, on its earliest recorded graded date
across Books/Bank/Homework. Selection without grading does not count. Known first
results form the denominator; first-correct results form the numerator. Unknown
historical results remain in the graded count but not accuracy. Zero denominator
returns null, displayed as unavailable. Later corrections are counted separately
and attributed to the original question's first date, not their correction date.
Repeated contexts never add another global first attempt. Classification uses the
existing canonical facts snapshot policy. Battles/vocabulary/time are excluded.

The Progress activity panel's period/subject controls affect its summary, bars
and table together; existing cards below remain explicitly labeled all-time.
Metric toggle selects daily question count, accuracy bars or an accuracy trend line. Period/subject/metric
persist in sessionStorage; inaccessible storage falls back to memory. Accessible
keyboard details/table supplies all exact dates, numerator/denominator and rates.
Empty results render explanatory copy, not an invented flat trend.

Bars scale from zero to actual values in 750ms without layout changes, starting
only when the chart enters view. Browser-owned animations pause when offscreen or
the tab is hidden, resume without restarting, and cancel to final values if
reduced motion is enabled. No per-frame React state updates are used. Unrelated
state changes don't restart them; scope/metric changes do. Reduced motion renders
final geometry instantly. No continuous RAF, animation library or chart dependency.
The trend uses straight segments between adjacent dates with known first results,
not smoothing or interpolation across missing days. Real zero accuracy is retained;
null is a gap. A single observed date is explicitly not described as a trend.
Points rise from the zero baseline while lines reveal left to right, ending on
the exact daily rates. Axis text stays 14px at mobile widths; the exact table is
the keyboard-accessible alternative. No animated counters, area plots, goals,
source filters, new streak model or gamification are claimed.

Evidence: three disposable PostgreSQL tests verify 70% after corrections and
Books/Bank repeats, exact counts, scope/empty behavior and separate account
isolation. Two single-worker browser fixtures cover 7/30-day selection, subject
empty state, exact 70% bar height, animation final transform, reduced motion,
keyboard table access, reload and laptop/mobile overflow. UI uses mocked REST;
**VERIFIED BACKEND** for SQL and **BROWSER WITH FIXTURES ONLY** for charts, not
full integration. Images in `test-results/progress-*-{laptop,mobile}.png` are
synthetic fixtures. Mechanical design detector reported no findings.

Migration `20261031000300_progress_activity.sql` is additive: one authenticated
RPC; no new tables, grants to private facts, indexes or backfill. Apply after prior
migrations to an isolated environment first. A safe rollback can drop only this
RPC after reverting the UI caller; no history changes. No production application
was authorized or performed. Existing question facts can scan substantial histories;
no speed/performance improvement is claimed without production-scale measurements.


## Actual native Progress acceptance

`test:sprint:native` now signs in a disposable student with real Auth and opens
Progress using live local PostgREST aggregates. After three graded canonical
questions and an administrator key correction, the chart/summary retain three
first-correct results and 100% accuracy. Period/subject selection, keyboard table,
reduced motion and laptop/mobile overflow are verified without mocked requests.
The pure browser-fixture suite additionally verifies normal animation at 70% and
unrelated table interaction without replay. Source/domain filters and animated counters remain unfinished; no study-time
chart is invented.

## Admin Homework question heatmap

`homework_question_performance(homework, day, page)` calls the existing authorized
assignment/occurrence report and aggregates submitted sessions only. Each canonical
question uses its earliest non-review grade event **within that assignment**;
this differs deliberately from platform-global first exposure. Skipped answers
and unknown initial results are excluded from accuracy. Manual/current regrading
cannot redefine that first grade. Samples, skipped/unknown counts and positive
recorded active-time mean/median/sample size are returned. Zero recorded seconds
means unavailable timing. No idle duration is inferred. At most 100 questions
return per page; no student names, responses or answer keys enter the aggregate.

The existing admin Homework result page includes clickable/keyboard-operable
cells, an accuracy/time toggle, exact data table, small-sample labels below five
known results and per-question details. Time mode uses neutral cells rather than
accuracy colors. The two-student SQL fixture reconciles 100%, 50%, 0%, skips,
unknown legacy outcomes and measured 20s mean/median, including permission
rejection and pagination. The native browser checks an actual one-student submitted
assignment, small-sample details, time-unavailable state and laptop/mobile layout.

Migration `20261031000600_homework_question_performance.sql` adds one admin-checked
RPC, no tables, backfill or expanded raw-data grants. Prior Homework results and
grade-event migrations are dependencies. It can be dropped after reverting the
UI caller without changing saved data. Group comparisons, distributions,
cohort filters and dashboard-wide admin KPIs remain open. Entry motion now uses
the same viewport/visibility/reduced-motion lifecycle as Progress. All cells grow
from their baseline; cell height does not encode accuracy. Final color/text and
selection behavior remain unchanged, and selection does not replay entry motion.


## Saved-data animation acceptance (2026-10-31 continuation)

`npm run test:analytics:native`: **1/1 passed**, zero skips, actual isolated Auth,
PostgREST/PostgreSQL and official Storage API/file backend, Edge Runtime and
Realtime. No intercepted RPCs. A disposable student saves four canonical Checks
and one later correction through real authenticated HTTP acknowledgements.
Only fixture timestamps are backdated after those saves to span several days;
no duration is inferred. Exact results: four known first results, three first
correct, **75%** weighted summary, one later correction; daily **50%, 100%, 100%**
with a correction-only gap. The line has only one adjacent-date segment. Saved
Check rows remain byte-for-byte equal after viewing the charts and submitting
separate fixture Homework.

Dashboard weekly bars reconcile the existing `dashboard_study_activity` output
and rendered heights. That RPC counts distinct checked questions **per day**:
a question checked on different days can occur again. It is not the Progress
platform-global first-exposure count. No Dashboard formula/query changed.

The real admin then opens the same student's submitted Homework: eight cells,
first two accuracies **100% / 0%**, six unavailable, one-student small-sample
labels, keyboard details, selection without replay, denied student aggregate
access, and reduced-motion mobile time mode with **No time**. All measured times
are absent rather than estimated. No admin-wide cohort/dashboard redesign is
claimed.

Geometry units: **2/2**. New single-worker browser fixtures: **2/2** normal/reduced
motion, baseline-position assertions at animation time zero, final geometry,
null gaps, real zero rates, empty subject, table, reload and mobile overflow.
The two existing bar scenarios also passed before the final clipped-line fix;
only the new two line cases needed retesting after that change. These fixture
results supplement, not replace, the native integration test. Lint/build pass;
mechanical design detector returns no findings.

Actual synthetic-account captures: [Dashboard laptop](screenshots/analytics/analytics-dashboard-laptop.png),
[Progress laptop](screenshots/analytics/analytics-progress-laptop.png),
[Progress mobile](screenshots/analytics/analytics-progress-mobile.png),
[admin Homework laptop](screenshots/analytics/analytics-admin-laptop.png),
[admin Homework mobile](screenshots/analytics/analytics-admin-mobile.png).
Laptop is 1366×768 with normal motion; mobile is 390×844 with reduced motion.
Full-page images may be taller. Dark mode, 768/1920 widths and performance at
production-scale histories remain unverified. No chart dependency was added.
