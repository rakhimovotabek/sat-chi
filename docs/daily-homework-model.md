# Daily Homework backend

Daily Homework shares the existing `book_practice_sessions` player with `kind = 'homework'`. It keeps homework's final-answer grading; Question Bank retry/check is not enabled for these sessions. Migration `20261004002800_daily_homework.sql` adds the backend model. Student/admin UI, dashboard counts, streak aggregates and frontend RPC integration are a subsequent milestone.

## Model

- `daily_homework_templates`: identity, immutable IANA timezone, lifecycle and recipient configuration.
- `daily_homework_versions`: append-only admin-created revisions, effective date, instructions/configuration and a frozen, private pool of approved published questions and keys.
- `daily_homework_enrollments`: student eligibility periods, preserving individual/group/all-active membership history.
- `daily_homework_windows`: active schedule periods, preserving pause/resume history.
- `daily_homework_instances`: one opened day per template/student/date, source revision, immutable deadline, selected question IDs, linked homework session, start/completion timestamps, answer/score counts, active time and late flag.

Unopened days are derived from revision, enrollment and schedule history. Opening materializes a unique day instance; rows are not duplicated into the one-time `homeworks` tables. Historical missed days remain in the derived directory even if they were never opened. Opened records stay visible even after the eligibility period ends. No midnight job is required.

## Calendar and lifecycle policies

Timezone defaults to the administrator's existing study preference, or `Asia/Tashkent` if absent. It cannot change after creation. Each local calendar day opens at 00:00 and is due at **the next local midnight**, using PostgreSQL `AT TIME ZONE`. This also handles DST days with 23/25 hours. Student UI should say **Due by midnight**, with the assignment timezone visible.

New assignments start no earlier than their creation local date; a backdated start date does not retroactively assign earlier work. Edits append a revision effective no earlier than tomorrow and never rewrite today's or prior definitions. Recipient configuration changes, group membership changes and active-account changes affect the **next local day**, keeping today's work stable. This includes new group members: they start tomorrow, without retroactive assignments. Pausing/archiving stops future days beginning tomorrow while preserving today's work. Resuming opens the current day; same-day pause/resume does not duplicate schedule periods. Archival is final in the current API.

Completion requires a submitted answer for every assigned question, independently of correctness. Opening or partial work never earns completion. Normal incomplete submissions are rejected so work can continue. A timed session may submit partially when its existing time limit expires; this preserves grading, records **Incomplete**, and gives no completion credit. As with existing timed homework, the submitted session remains read-only. After the day's deadline, an unfinished day is **Missed**.

Late work is allowed by default and records **Completed late**, distinct from on-time completion. With `allowLate = false`, overdue starts/reopening/submission are rejected. Completed results remain readable.

## Selection

`selection` accepts `fixed`, `new`, or `random`. Fixed selection freezes the configured question count and explicitly repeats it daily. New/random select a deterministic shuffled daily subset, favoring questions not previously answered by the student. They exclude previously assigned questions from this template unless `allowRepeat` is true. Explicit `questionIds` optionally narrow the pool; filters reuse `bank_candidates` and additionally require actual published, approved student eligibility.

The source pool is frozen at revision creation, capped at 5,000 questions; each day supports 1–500 questions. An insufficient initial pool fails atomically. Exhaustion without allowed repetition raises an actionable error rather than creating a shorter assignment. Frontend creation/history flows must surface these errors to the teacher/student. Keys remain admin-only until the existing submitted-session review permits access.

## RPCs

All exposed functions require an active account. Definition/lifecycle RPCs require admin. Students can start/read only their own assigned days; admin directory access can filter a student or template. No student direct-write grants exist on any of the new tables.

- `save_daily_homework(p_data jsonb, p_template uuid default null)` creates a template or appends its future revision. Fields: `title`, `instructions`, `timezone`, `startDate`, optional `endDate`, `count`, `selection`, `filters`, optional `questionIds`, `students`, `groups`, `allStudents`, optional `timeLimit` (seconds), `allowLate`, `allowRepeat`, and initial `active`.
- `set_daily_homework_state(p_template uuid, p_state text)` accepts `active`, `paused`, `archived`.
- `daily_homework_templates()` returns up to 100 admin definitions with latest revision/configuration and usable pool count. Normal admin UI should hide archived templates by default while offering history.
- `daily_homework_directory(p_student uuid default null, p_template uuid default null, p_from date default null, p_until date default null, p_page integer default 0)` returns `{total, rows}`. Date windows are bounded to a maximum 31-day difference; pagination is 50 rows. Without a student filter admin sees all recipients; students always see themselves. Each row includes title, instructions, local day/zone, `is_today`, status, count, progress, session and late/completion metadata. Default range includes recent history and current days across zones. Explicit local-date filtering is preferable in the next UI milestone.
- `start_daily_homework(p_template uuid, p_day date)` returns an owned homework session ID. Repeated starts resume the unique instance. Future unopened days are not startable.

Internal roster/scheduling/trigger functions have no browser execution grants. `finish_book_practice` checks daily completion rules before delegating to existing grading. Completion triggers snapshot the resulting counts/timing.

## Validation and next integration

Run `node --test tests/daily-homework.test.js` for the executed PostgreSQL model/access suite; `npm test` also includes it. Existing learning/books/attempt tests load every migration and protect shared session behavior.

Migrations 026–028 were applied and catalog-audited on the verified linked production project on October 4, 2026. Additive migration 029 closes the default PUBLIC execution grant on the recreated submission function. All public tables have RLS and anonymous security-definer execution is zero. The next milestone must connect One-time/Daily recurring in the existing form, Today/Missed/history and admin template monitoring, dashboard counts, daily completion/streak aggregates, and their browser regressions. Avoid creating another recurring schema or another homework player.
