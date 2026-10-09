# Homework reliability report

2026-10-09. **Verified in isolated PostgreSQL17/PostgREST14 and Chromium. Production unchanged.** Combined reliability suite: 66 passed, 0 failed, 0 skipped. Its twelve adversarial browser workflows and four dedicated Homework browser workflows are supplemented by actual SQL concurrency/authorization regressions.

## Two distinct errors

- **Insufficient selection:** seven explicit questions cannot satisfy an eight- or ten-question daily assignment. This validation is correct. Select more questions, reduce daily count, or use an adequately sized Random-by-filters pool. Failed configuration must leave the old template intact.
- **Broad-pool failure:** the prior `save_daily_homework` rejects more than 5,000 eligible questions even when only eight are required. The actual legacy RPC error was reproduced in the isolated database before restoring the repaired function. This is a backend snapshot-storage restriction, not a frontend filter-format error or an insufficient selection.

## Repair

Pending `20261009000300_daily_homework_indexed_pool.sql` adds nullable `daily_homework_versions.pool_count` and private frozen snapshot rows in `daily_homework_pool_questions`, keyed by `(version_id,question_id)`. New saves freeze eligible questions directly into indexed rows without a giant JSON aggregate or arbitrary 5,000 cap. Daily start ranks small IDs, then reads only selected snapshots. New versions still snapshot every eligible candidate: storage/write cost grows with pool size; this is not cost-free selection.

Existing JSON-backed versions are unchanged and retain a supported fallback. No existing question, answer key, completed session, grade or historical version is rewritten. No source-question foreign key cascades into frozen pools. Students cannot read private pool answer keys; admins retain review access. Existing callable RPC signatures/grants are preserved.

Both indexed and legacy selection paths now prefer never-assigned questions before repeats when reuse is enabled. Fixed assignments keep explicit repeat behavior. Saves remain transactional: invalid pools/recipients roll back template, version and roster changes. Existing recipient synchronization and Asia/Tashkent scheduling are retained; recurring edits take effect on the next local day and completed occurrences keep their applicable version.

## Actual verification

| Check                            | Evidence/result                                                                                                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad Random edit7→8             | Create 5,010 additional eligible fixture questions; old function returns the 5,000 error; restored new function saves through the real admin editor. Latest `pool_count` exceeds5,000 and legacy JSON field is empty for the new version.                                    |
| Daily delivery and completion    | Student receives seven questions, saves/submits them; after editing, completed item snapshots and original JSON version remain unchanged.                                                                                                                                    |
| Next-day count and deduplication | Isolated fixture advances applicability/day boundaries, then starts eight questions. Repeat start returns the same session;15 assigned questions are distinct before reuse. This simulates the next local day, not a24-hour live soak.                                       |
| One-time10→20→10                 | Admin picker adds and removes questions; student resumes the updated count with unchanged saved answers retained.                                                                                                                                                            |
| Group delivery/removal           | Browser and database verify membership sync/access changes and absence of duplicate assignments.                                                                                                                                                                             |
| Multiple students                | Three separate student browser accounts complete independent saves in group-assigned Homework; cross-account reads/writes denied.                                                                                                                                            |
| Started/completed history        | Edit/save race retains or archives answers; recurring completed items and versions remain immutable.                                                                                                                                                                         |
| Explicit insufficient pool       | Focused database regression proves failure and full rollback.                                                                                                                                                                                                                |
| Reuse/exhaustion                 | New and legacy version regressions verify unseen-first ordering; existing daily regressions retain exhaustion/late-access behavior.                                                                                                                                          |
| Dashboard totals                 | Native regression verifies withdrawn rows excluded from active one-time totals, completed history retained, daily started/completed counts and historical typed responses included; timed partial submissions earn no completion credit; student admin-RPC request rejected. |
| Manual grading and final status  | All three review actions persist; student results/admin metrics match authoritative rows. Interrupted finish safely retries once.                                                                                                                                            |

The broader existing Homework suite covers increases/decreases, specific selections, pause/resume, timezone/deadline rules and source key eligibility. Its PGlite/mock transport results are distinguished from actual native browser checks in the handoff.

## Pending release

This migration is local only. The four October8 migrations are already released and must not be reapplied. Review and approve `090003`, followed by `090004` historical Book progress optimization and `090005` scoped admin dashboard totals, before any production change. Frontend repairs also require a separately authorized deployment. No GitHub push or release was performed.

Source files: migration090003; `tests/homework-indexed-pool.test.js`; `tests/real-user-reliability.test.js`; native environment row-cap/Auth fixtures. Logs are outside Git in `/home/otabek/satchi-release-backups/reliability-*.log`.

During final review, the new dashboard daily counter initially used session submission rather than canonical `daily_homework_instances.completed_at`. A native timed-partial regression reproduced 2 instead of 1 completed occurrences. This was corrected locally before deployment in `75488e3`; the final 66-check run passed. Dedicated daily scheduling/grading behavior was unchanged.

The indexed pool has no new Storage-policy dependency: after start, selected snapshots still become practice items, and the existing `can_read_book_package_asset` authorizes assets through those owned, accessible items. No Storage objects/policies were changed. Hosted expiry and original source-pixel correctness remain unverified.
