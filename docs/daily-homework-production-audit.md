# Daily Homework production audit — October 4, 2026

Verified linked project: **Satchi / ileffhbbaomfimwulvpw**, using both the project reference and linked-project metadata. Initial Git checkpoint: `f2fe2b1`, clean tree. Existing remote history matched local through 025; 026–028 were pending.

## Applied migrations

| Version        | Purpose                                                            | Final state        |
| -------------- | ------------------------------------------------------------------ | ------------------ |
| 20261004002600 | Immutable bank checks and active time                              | Applied, read back |
| 20261004002700 | Authorized practice aggregates                                     | Applied, read back |
| 20261004002800 | Recurring Homework model, RPCs, shared grading                     | Applied, read back |
| 20261004002900 | Revoke PUBLIC/anonymous execution on recreated submission function | Applied, read back |
| 20261004003000 | Daily aggregate reports and private internal projection            | Applied, read back |
| 20261004003100 | Lifetime student metrics; unused-first reuse selection             | Applied, read back |
| 20261004003200 | Timed partial submission metadata for read-only results            | Applied, read back |

Deployment used cached `npx --offline supabase@2.119.0 db push --linked --yes`. No reset, seeds, fixture accounts/assignments, content edits, approvals or publication changes. Migration 032's first connection timed out before application; retry applied it and catalog history confirmed it. Applied migration files were never edited; each correction is additive.

## Catalog verification

| Table                      | Constraints | Indexes | SELECT policies                   |
| -------------------------- | ----------: | ------: | --------------------------------- |
| daily_homework_templates   |           2 |       1 | Admin                             |
| daily_homework_versions    |           3 |       3 | Admin; frozen answer pool private |
| daily_homework_enrollments |           5 |       3 | Admin, active student own rows    |
| daily_homework_windows     |           3 |       2 | Admin                             |
| daily_homework_instances   |           8 |       5 | Admin, active student own rows    |

All five tables have RLS enabled. Totals: **21 constraints, 14 indexes, seven SELECT policies**. Verified primary/foreign/unique constraints, unique student/template/day and session, valid schedule/deadline/state checks, version-date/student-date/template-date indexes and the partial unique open-window index. Authenticated has SELECT only; no INSERT/UPDATE/DELETE. Anonymous has no table SELECT. Service role retains backend access.

Verified triggers: `daily_group_roster`, `daily_active_roster`, `daily_completion`. They maintain future eligibility and snapshot real final-answer completion without a midnight job.

## RPC/grant verification

Authenticated execution is present for `save_daily_homework`, `set_daily_homework_state`, `daily_homework_templates`, `daily_homework_directory`, `start_daily_homework`, `daily_homework_report`, `daily_homework_statistics`, and `finish_book_practice`. Definition/lifecycle functions require an active admin; student reporting/start access is own-only. Every definer function uses an empty search path with explicit schema qualification.

No authenticated/anonymous execution exists for `sync_daily_roster`, `daily_membership_changed`, `daily_scheduled`, `daily_homework_completed`, `daily_homework_rows`, or `finish_book_practice_before_daily`. Anonymous execution is absent for the exposed RPCs. Final global audit: **zero anonymous executable public security-definer functions; zero public application tables without RLS**.

## Production readback

Read-only authenticated-admin RPC audit returned zero templates, zero daily directory rows and empty daily report aggregates, matching the zero opened daily instances. This verifies the actual empty state without adding demonstration learning activity. Catalog readback preserves **3,375 questions, 1,400 vocabulary words and 14 currently published question books**.

Private query/results evidence remains in ignored `local-imports/daily-production-audit.sql/.json` and `daily-readback.sql/.json`. It contains no tracked credentials or educational source material. Browser workflow checks use isolated network fixtures; PostgreSQL ownership, grading, history and aggregate tests execute the complete migrations in PGlite. The final QA results are recorded in `CODEX_HANDOFF.md`.
