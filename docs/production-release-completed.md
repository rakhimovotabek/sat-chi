# Production release complete

2026-10-09, Asia/Tashkent. **COMPLETE.** Production application writes are reopened in `compatible` mode with zero account exemptions. Signup is restored to its original enabled setting. The server gate remains installed to reject incompatible cached clients.

## Root causes and corrections

1. **Book `57014`:** the practice snapshot plan evaluated repeated source/review/package eligibility across all 7,572 questions before restricting to a two-question leaf. This took 7,346.928 ms in restored PostgreSQL17, close to the deployed authenticated 8s limit. Book catalog nested counts repeated the same helper through question RLS. Required question/review indexes already existed; no lock waits were observed. A bounded production read-only plan measured the gate at 5.967 ms, so maintenance was not the cause.
2. **Stale-save HTTP504 discovered during verification:** application revision guards raised PostgreSQL serialization SQLSTATE `40001`. The managed API retried these permanent conflicts: provider logs counted 5,500 occurrences in the bounded failed-check window. Closing verification admission drained the retries. This matches [Supabase's documented PostgREST14 behavior](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). The earlier PostgREST16 rehearsal did not expose this managed-service behavior.

`20261009000100_book_approval_cache.sql` caches the exact original Book approval rule in the existing private eligibility table and maintains it transactionally for all relevant inputs. It materializes the selected topic's questions before evaluating eligibility. Existing permissions, snapshot fields/order/limits, keys, resume behavior, answers and history remain intact. Staging startup dropped to about 58 ms including the command, and exact PostgREST Book/start requests passed. These are staging timings, not a production latency guarantee.

`20261009000200_practice_conflict_http.sql` replaces only six functions' explicit application-conflict SQLSTATE with `PT409`. It preserves revision guards, locks, atomicity, idempotent retries and grading. The frontend recognizes both `PT409` and the prior response, keeps pending drafts, and requires reload/review before replaying a conflict. No latest-revision default or blind overwrite was introduced. Real PostgreSQL17/PostgREST14 requests now return HTTP409 promptly.

## Database and deployment

- Supabase project: `ileffhbbaomfimwulvpw`, PostgreSQL17.
- The four October8 migrations were already applied and were **not reapplied**.
- Both October9 migrations applied successfully through the documented linked CLI procedure; dry runs listed exactly the respective pending file. No migration was skipped or manually marked applied.
- Book correction commit: `94b34162a60468f940cd2ee28fb66367f0005e1b`.
- Matching conflict/frontend application commit: `f44a7f7ab0a495a7c5b53e443d602b03ba781399`, pushed to GitHub `rakhimovotabek/sat-chi`, `main`.
- Matching Netlify application deployment: `6ac7f2a3a1c596000848ae27`, ready and published; application entry asset `/assets/index-CvmaICal.js`.
- Production: https://sat-chi.netlify.app (HTTP200 verified after reopening).

This completion report is a subsequent documentation update; the application revision above identifies the verified code.

## Backup and data protection

The restricted backup `/home/otabek/satchi-release-backups/20261008T190945Z` was checksum-verified and restored into isolated PostgreSQL17. Missing October9 migrations were rehearsed there without replaying already recorded October8 versions. All 17,489 snapshot Storage copies were separately verified. Backup files, accounts, credentials, inventories and operator logs remain outside Git.

All 49 current protected public tables—including the new review/history tables—matched before/after each targeted production migration. The second comparison included preceding disposable browser records, proving that the function correction did not alter their saved answers either. The verified archive plus private original function definitions/ACLs remain recovery material. No timeout limit was increased, no managed service internals changed, and Storage security/objects were untouched.

Cleanup deleted only recorded disposable IDs, with guards for fixture ownership and verification titles. Across the two browser runs, 8 sessions, 4 Homework definitions, 2 recurring templates and 2 groups were removed. No accounts, books or questions were imported/deleted. Pre-existing student answers, grades and completed Homework history were preserved. The authorized fixture student's dashboard naturally regenerated unstarted future study-plan tasks; those derived task changes are not presented as unchanged rows or restored over the live account.

## Verification results

Final targeted local/staging runs: 36 persistence/integrity/manual-review/package checks, 7 actual PostgreSQL17/PostgREST14 transition checks, and 1 full-backup restore/data/performance rehearsal: **44 passed, zero failed/skipped in the final runs**. Scoped lint and frontend build passed. An earlier native startup attempt failed while heavy suites ran concurrently; its fresh isolated rerun passed. Earlier production runs correctly stopped on the stale-save failure and did not reopen writes.

The final **16 actual authenticated Chromium production workflow checks** passed on the matched frontend/backend:

1. Admin and student login.
2. Question Bank loading and difficulty filters; dashboard refresh RPC also succeeded.
3. Book list loading.
4. Chapter/topic loading through actual Book navigation.
5. Book Practice startup, Check feedback and explanation.
6. Revision-aware answer saving and restoration after reload.
7. Direct Homework delivery, start and acknowledged answer saving.
8. Actual admin picker 10→20 save with started-answer preservation.
9. Actual admin picker 20→10 save.
10. Group delivery, withdrawal/access rejection and recipient reactivation.
11. Homework completion and admin monitoring.
12. Authenticated private source image loading.
13. Submitted open response/official answer inspection; Mark correct, Mark incorrect and Restore automatic grading persisted through admin/student reloads and changed student results appropriately.
14. Asia/Tashkent recurring occurrence delivery, duplicate-start prevention and answer restoration.
15. Unmarked legacy rejection, revisionless legacy rejection and stale HTTP409/`PT409` rejection without overwriting the saved answer.
16. Logout/login recovery of saved progress.

No browser JavaScript exceptions occurred in the final run. Recorded HTTP403/426/400/409 responses were the intentional withdrawal, legacy and conflict rejection checks; the final run did not encounter the earlier gateway timeout.

## Reopening verification

Only after all 16 checks passed was `set_mode('compatible')` used. With zero exemptions, a current student request saved a reversible mark change, restored the mark, and preserved the answer. An unmarked legacy request returned 426; a student's admin-review request returned 403. Signup was restored with a supported Auth configuration PATCH of only the original `disable_signup` value, then independently rechecked.

Security rehearsal rejected signup metadata claiming an admin role and rejected student self-elevation; the relevant production authorization functions were not changed by these fixes. No production account was created/deactivated for these checks. Disposable fixture rows were subsequently confirmed absent.

Current state: **compatible admission, zero exemptions, signup enabled, matching frontend published, normal access restored.** Do not turn the gate `off` while incompatible cached clients exist.

## Limits

These checks establish the specified release workflows, not an exhaustive audit of every account, book, viewport or future integration. Older tabs may need a reload to obtain the improved conflict interface; preserve pending drafts before refreshing. Managed-service disaster recovery still requires provider support and reconciliation; native PostgreSQL restoration is not a recreation of Supabase Auth/Storage services. No remaining critical failure was observed in the verified release matrix.

Private execution evidence is retained under `/home/otabek/satchi-release-backups/scoped-release-20261008T182333Z`, including migration results, before/after digests, provider retry logs, final browser results, fixture cleanup, publication metadata and reopening checks.
