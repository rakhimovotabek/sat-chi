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
Metric toggle selects daily question count or accuracy. Period/subject/metric
persist in sessionStorage; inaccessible storage falls back to memory. Accessible
keyboard details/table supplies all exact dates, numerator/denominator and rates.
Empty results render explanatory copy, not an invented flat trend.

Bars scale from zero to actual values in 750ms without layout changes, starting
only when the chart enters view. Browser-owned animations pause when offscreen or
the tab is hidden, resume without restarting, and cancel to final values if
reduced motion is enabled. No per-frame React state updates are used. Unrelated
state changes don't restart them; scope/metric changes do. Reduced motion renders
final geometry instantly. No continuous RAF, animation library or chart dependency.
No animated counters, line/area plots, goals, source filters, domain drilldowns,
new streak model or gamification are claimed. Viewport-aware pausing is implemented. Existing metric cards and analytics remain unchanged.

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
unrelated table interaction without replay. Source/domain filters and animated
line charts/counters remain unfinished; no study-time chart is invented.

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
cohort filters, heatmap entry motion and dashboard-wide admin KPIs remain open.
