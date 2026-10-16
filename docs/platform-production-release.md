# Platform production release — 2026-10-16

**GO: released and normal access restored.** Production: https://sat-chi.netlify.app

User explicitly authorized the coordinated database, GitHub and Netlify release. GitHub main contains source commit `9d0e039f4ef4f16b23748f66e12dc77a8f83e7e5`; published Netlify deploy: `6ad22d12c50992641536e79b`. Served frontend bundle hashes match the validated production build.

## Database and preservation

Confirmed all eight migrations pending, rehearsed them on restored PostgreSQL 17 production snapshots, then applied them atomically in dependency order:

- `20261015000100_first_attempt_statistics.sql`
- `20261015000200_shared_question_history.sql`
- `20261015000300_entire_book_practice.sql`
- `20261015000400_admin_student_books.sql`
- `20261015000500_dashboard_countdown.sql`
- `20261015000600_question_bank_taxonomy.sql`
- `20261015000700_consistent_context_statistics.sql`
- `20261015000800_historical_activity_evidence.sql`

Previously applied migrations were not repeated. Derived standings were reconciled after canonical history reconstruction. Existing answer keys, answers, grades, Homework, progress and history were preserved. Final post-cleanup fingerprints matched all 51 protected existing tables, allowing only the intended cover metadata additions and additive schema fields.

Fresh final backup: `/home/otabek/satchi-release-backups/platform-release-20261016/cutover/20261016T140447Z`. Database restoration and migration rehearsal passed on private PostgreSQL 17, with no restored student data exposed over HTTP. All 18,067 original Storage files were verified and retained with recoverable private copies. No original Storage objects were overwritten or deleted.

Maintenance/write safeguards remained active during migration and verification. Normal `compatible` mode is restored with zero verification exemptions; the original signup setting is restored.

## Verification

Lint and production build passed. Prior isolated PostgreSQL 17/PostgREST and real isolated Auth tests are detailed in [the implementation report](platform-improvements-report.md).

All 10 authenticated production browser checks passed, using only two newly provisioned disposable accounts:

1. Student and administrator authentication.
2. Ten questions retain 7 first correct / 3 first wrong / 70% accuracy after all 10 become correct, including reload.
3. Parent practice recognizes subtopic history.
4. Question Bank prior history and corrected-question filters.
5. Large whole-book navigation to the final question, paged overview and bounded image rendering.
6. Administrator analytics and read-only review, with server-side cross-student write/access rejection.
7. Homework history isolation and manual grading corrections preserve initial wrong outcomes.
8. Persisted timezone/countdown, mobile fit and no per-second database queries.
9. Concurrency rejection, legacy-client protection and fresh-login answer persistence.
10. Production password recovery routes and invalid-link handling.

No JavaScript exceptions occurred; expected permission/concurrency rejections were verified. Both disposable accounts and their guarded practice/Homework records were removed before the final integrity comparison. Initial backup-tool/socket and browser-fixture/locator issues were corrected before successful reruns. A delayed Auth configuration read during reopening caused a safe maintenance fallback; bounded readback subsequently confirmed restored settings before reopening.

## Previews and limitations

Nine verified actual PDF first-page WebP previews were published to new paths in the existing private cover bucket. Six unavailable source PDFs retain title placeholders. Higher-priority existing covers were preserved.

Production recovery redirect URLs and the ConfirmationURL template were verified. Custom SMTP is not configured: hosted email delivery remains unverified and requires provider setup and a controlled delivery test. The full recovery flow passed against isolated real Supabase Auth and an SMTP sink; this does not establish production delivery.

Detailed private audit artifacts are in `/home/otabek/satchi-release-backups/platform-release-20261016`; they contain sensitive backups and must not be committed. Existing unrelated local import changes were left untouched.
