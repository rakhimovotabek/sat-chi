# Application-scoped release with Storage operational

2026-10-08. This is the narrower strategy authorized by the latest release request. It supersedes the blanket Storage-freeze prerequisite in earlier reports. It does not represent execution success; execution evidence is recorded separately.

## Actual migration dependencies

| Migration | Data/schema changes | Storage dependency |
| --- | --- | --- |
|080001 Homework lifecycle | Deferred section-position constraint, frozen open keys, access/recipient/session helpers, history table, roster triggers and filtering | No Storage table or object operation. Frozen question JSON retains its existing asset references |
|080002 Practice integrity | Revision column/trigger, acknowledged save RPC, stale-write/Check guards, heartbeat/access helpers and derived eligibility refresh | No Storage operation. Eligibility examines question/answer/review/package records in `public` |
|080003 Manual review | Review table/policy/trigger and revision-protected admin review RPC | No Storage operation; saved grading rows remain in `public` |
|080004 Snapshot assets | Replaces `public.can_read_book_package_asset(text)` | Changes authorization for existing paths through public asset/question/session records. Does not change Storage rows, buckets, grants, paths or bytes |

All four files were read in full. They do not execute Storage uploads, deletes, bucket changes or metadata writes. An independent upload cannot overwrite a student answer or alter a Homework snapshot. A privileged external process which also edits public content/progress is a separate affected application writer and must be paused/gated.

Global object-byte immutability is unnecessary for these migrations. It was required by the earlier proposed whole-project restore, which would also overwrite live Storage metadata after independent uploads. That recovery approach is no longer the release rollback strategy.

## Backup and recovery boundary

1. Freeze affected application writes with the installed PostgREST gate, including cached clients and service-role REST writes. Stop known SQL/import writers; block new account-management requests and temporarily disable new Auth signup because user insertion creates public profiles. Drain admitted database/account-management work. Do not alter real accounts.
2. Take a fresh PostgreSQL custom archive with one consistent database snapshot. Preserve public schema/data, Auth/Storage metadata, migration history, private gate state, role definitions/ACLs and provider recovery records outside Git. Concurrent Storage metadata transactions do not invalidate PostgreSQL's snapshot consistency.
3. Restore the archive into isolated PostgreSQL17. Rehearse all four migrations and verify all existing public rows by count/hash, ignoring only the explicit new revision/open-key columns and derived eligibility refresh. Verify Storage metadata and existing public asset mapping rows remain unchanged.
4. Extract the Storage inventory from that exact restored snapshot and verify matching file copies by snapshot size/ETag plus retained SHA256. Cached copies may be reused only after verification. A new upload does not need to be in an earlier snapshot. A changed/missing referenced file without a matching recoverable copy blocks the release; never mark a partial inventory complete.
5. Recovery is **application-scoped**: keep admission closed, prefer repairing the committed migration prefix/new frontend, and use the restored isolated database as the canonical source for explicit lost/corrupted application-row reconciliation. Preserve revision counters and new independent uploads. Do not blindly restore `auth` or `storage` into the live project, drop `public CASCADE`, replay old object inventories, or deploy only the old incompatible frontend.
6. A catastrophic managed-project restore remains a separate provider recovery operation with Auth/Storage reconciliation. The native restore does not claim to recreate managed services or preserve post-backup writes automatically.

The database archive covers all migration-dependent student answers, grades, Homework history, frozen snapshots, mappings and function/policy definitions. Object files are separately verified recovery material. This permits Storage to remain operational without weakening its security. Backup reads, independent uploads and Storage signing continue normally.

## Strategy verification

`tests/storage-independent-cutover.test.js` uses actual PostgreSQL17 connections. One independent connection continuously commits Storage metadata inserts while another applies the four migration transactions under application maintenance. It verifies original object rows and all protected application-history/mapping rows remain unchanged. A targeted application-row recovery rehearsal restores the original value while increasing, rather than resetting, its answer revision and retaining every independent Storage insert.

The initial test called a helper which waits for a save acknowledgement from a non-allowlisted fixture; maintenance correctly rejected that request. The test now applies the SQL files directly while retaining maintenance, matching the pre-verification production phase. The corrected run passed (`/tmp/satchi-storage-independent-cutover.log`). Storage transport here is not a managed-service replica; this test establishes database independence, not a physical upload freeze. Earlier hosted probes establish that the independent upload path remains operational.

`tests/release-backup-restore.test.js` now additionally compares all existing public table rows and Storage metadata across the rehearsed migrations. The fresh cutover backup must pass this strengthened check before production migration. Existing gate/concurrency/browser checks remain mandatory; a new strategy does not waive them.

## Exact cutover

1. Verify targets, guarded Edge deployment/flag, pending migration set, reviewed artifact, current old-client contract, build and test results. Save provider Auth config and gate state privately.
2. Temporarily PATCH only `disable_signup=true` through the supported Auth management API; retain the original value for reversal. Activate maintenance with no verification exemptions. Confirm old RPC and direct REST mutations are rejected, and drain affected transactions. Storage is intentionally left operational; do not install the diagnostic policy probe.
3. Take and restore-verify the fresh archive and asset copies as above. Capture the protected-row baseline and asset mapping digest. Stop on export, restore, integrity or asset verification failure; pre-migration abort restores gate `off` and the original signup setting.
4. Dry-run the linked migration push; require exactly080001→080002→080003→080004. Apply in that order, stop on a failed file, and verify history plus preservation against the fresh baseline. Keep maintenance throughout. Independent Storage rows need not equal the old inventory; existing asset mappings/references and backed-up files must still be valid.
5. Commit reviewed intended files without secrets/backups/local credentials, push `main`, and verify Netlify's matching commit and asset publication. Retain maintenance while the frontend and database are being matched.
6. Allow only active authorized admin/student fixtures with the current client marker. Run actual production authenticated browser/API checks covering login, Book Practice Check/save/reload, Question Bank filters, Homework edits/direct/group/recurring delivery, completion, admin grading, images and explanations. Preserve unrelated history; record disposable IDs. Verify unmarked cached-client writes still fail.
7. Only after success, switch the gate to `compatible`, restore the saved Auth signup setting, and verify current-client saves succeed while old-client mutations remain rejected. Record commit/deployment/migration/verification evidence and cleanup status.

After080002, abort/recovery keeps maintenance, never `off`. There is no accepted unversioned-save shortcut. Preserve pending old-client drafts before refreshing; older tabs lack the new local outbox guarantee.
