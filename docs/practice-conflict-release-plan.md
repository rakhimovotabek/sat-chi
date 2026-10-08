# Revision conflicts must not use serialization SQLSTATE

2026-10-09. The Book performance migration is already applied. Normal writes remain in maintenance until the additional conflict correction and authenticated verification pass.

## Failure and cause

Fourteen actual production workflow checks passed after the Book optimization. The stale-save check then received HTTP504; a bounded retry timed out. The RPC intentionally raised `40001` for a stale application revision. Provider logs recorded 5,500 occurrences across two backends within the bounded failed-check window. This matches the managed PostgREST14 retry behavior documented by [Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

The earlier isolated PostgREST16 tests did not reproduce the managed retry loop. This was not sufficient hosted verification. Production verification exemptions were removed and active API requests were confirmed drained; no project restart or unrelated backend termination was needed.

## Small correction

`20261009000200_practice_conflict_http.sql` changes only the explicit application-conflict SQLSTATE in six existing functions: practice persistence, four Check functions, and manual open-response review. It uses `PT409`, which returns HTTP409 without falsely declaring a retryable PostgreSQL serialization failure. Function identities, ACLs, revision comparisons, locks, atomic batches, idempotent acknowledgement retry, history and grading logic remain intact. Unexpected definitions abort the migration transaction.

The frontend recognizes both `PT409` and the prior `40001` response. It retains drafts, requires reload/review before replaying a conflicting answer, and does not silently use the latest revision. Existing revision-aware clients still cannot overwrite newer answers; legacy versionless/unmarked clients remain rejected by the existing server gate and save guards.

Focused real PostgreSQL17/PostgREST14 transition tests passed seven checks, including a prompt HTTP409 response and unchanged data on a stale mixed batch. An initial native environment startup failed while several heavy suites ran together; a fresh isolated rerun passed. Thirty-six persistence/integrity/review/package checks passed. Restoring the fresh backup and rehearsing both October9 migrations preserved existing public rows and Storage metadata. Scoped lint and the frontend build passed.

## Release procedure

1. Retain maintenance with zero exemptions. Use the verified fresh backup `/home/otabek/satchi-release-backups/20261008T190945Z` and separately verified asset copies; retain the six current function definitions/ACLs and all49 current public-table digests privately. Only authorized disposable records changed during preceding browser verification.
2. Require the linked dry run to list only `20261009000200_practice_conflict_http.sql`. Apply it with the established migration CLI procedure. Do not replay the four October8 migrations or the applied Book optimization.
3. Confirm successful migration history and unchanged49 public tables. Commit/push the matching small frontend changes and tests, excluding private operator evidence. Verify Netlify publishes that commit and new asset.
4. Allow only the authorized verification accounts. Rerun the actual production workflow suite against the newly published frontend. Require HTTP409/`PT409` for a stale save, no overwritten answer, and successful save/reload/logout recovery. Verify Book navigation, images, Question Bank, Homework edits/delivery/completion/recurring work and all three manual grading actions.
5. Clean up only tracked disposable fixture IDs after verification, preserving all pre-existing data. Keep maintenance on any critical failure. Only after success switch to `compatible`, restore the original signup setting after security verification, and check current writes succeed while unmarked clients are rejected.

Execution results are recorded separately; this plan is not a claim that normal writes have reopened.
