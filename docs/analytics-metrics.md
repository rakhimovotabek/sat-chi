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

Bars scale from zero to actual values in 750ms without layout changes. Unrelated
state changes don't restart them; scope/metric changes do. Reduced motion renders
final geometry instantly. No continuous RAF, animation library or chart dependency.
No animated counters, line/area plots, goals, source filters, domain drilldowns,
new streak model or gamification are claimed. Motion is bounded but viewport-aware
pausing is still pending. Existing metric cards and analytics remain unchanged.

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
