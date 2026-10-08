> Current execution status (2026-10-08): the four migrations and matching frontend are published, but Book queries timed out during production verification. Writes remain in maintenance. See [scoped-production-release-report.md](scoped-production-release-report.md). Earlier pending/aborted status below is historical.

# Practice answer integrity: compatibility decision and release plan

Reviewed and tested on 2026-10-08. No production migrations, deployment, push, or student-data writes were performed. Existing uncommitted work was preserved.

## Decision

**Current authorized strategy:** [storage-independent-release-plan.md](storage-independent-release-plan.md) supersedes the blanket Storage-freeze requirement below. Full migration inspection shows no Storage object/metadata mutations; the recovery boundary is affected application data, with live Auth/Storage retained and files verified separately. Production execution still requires a fresh restored backup, gated application writes, integrity checks and authenticated matching-frontend verification. Historical reports of signed-token bypass remain valid but are not by themselves a blocker for this scoped cutover.

**Latest production gate status:** [storage-freeze-and-release-report.md](storage-freeze-and-release-report.md) supersedes the earlier conditional readiness statement for execution. Authenticated production testing confirmed that pre-issued signed uploads and service-role Storage writes succeed during PostgREST maintenance despite restrictive policies. The release is **NO-GO** until a provider-supported freeze or a verified admission-closure/expiry/drain strategy covers all independent writers. No October8 migration or frontend cutover has occurred; mode is `off`.

The verified database/asset backup and51 isolated checks are recorded in [release-safeguards-report.md](release-safeguards-report.md). Both preparation blockers are resolved; production activation and authenticated cutover checks remain mandatory.

The executable safeguards and commands in **Release safeguards implementation** below supersede the earlier hypothetical permission-revocation procedure. The four application migrations themselves do not install the gate. Production remains unchanged; this is preparation, not release execution.

**NO-GO for applying the four migrations while the deployed frontend remains in use.** Use a coordinated maintenance window. Conditional GO requires the preparation, client-drain, staging, and authenticated verification gates below. This document is a release recommendation, not authorization to execute it.

No accepting compatibility bridge was added. The existing fail-closed implementation is the safe transition: unversioned writes are rejected; revision-aware requests are accepted. No application or migration changes were necessary for that choice. Added regression tests exercise the exact legacy payload against real local PostgREST, without test helpers injecting revisions.

## Verified contracts and incompatibility

The currently served `https://sat-chi.netlify.app/assets/index-Dceo6m6j.js` references `api-CgyTxlkW.js`. That public API chunk calls:

```js
save_book_practice({
  p_session_id: session,
  p_answers: items.map(
    ({
      id,
      selected_answer,
      selected_response,
      marked,
      eliminated,
      question,
    }) => ({
      id,
      selected_answer,
      ...(question?.question_type === "open" ? { selected_response } : {}),
      marked,
      eliminated,
    }),
  ),
});
```

This is a full snapshot without an observed revision. Migration 080002 keeps the SQL signature `save_book_practice(uuid,jsonb)` but changes its JSON contract: each item must contain numeric `expected_revision`. This is not a missing SQL argument or PostgREST schema-cache problem.

Current local source uses `save_practice_changes(p_session,p_changes)` with dirty-item patches, per-item revisions, persisted acknowledgements, and a local recovery outbox. The older RPC name also accepts revision-aware JSON through the same guarded helper, but returns void; it is not the new acknowledgement contract.

Read-only linked inspection during this task confirmed PostgreSQL 17.11, migration history through `20261007000600`, the old RPC present, and both `save_practice_changes` and `answer_revision` absent. No linked save test or migration was attempted.

Relevant implementation:

- `supabase/migrations/20261008000200_practice_answer_integrity.sql`: `practice_answer_revision`, `persist_practice_changes`, both public save RPCs, and Check guards.
- `src/features/books/api.js`: `savePracticeChanges` and clear missing-server-function errors.
- `src/features/player/practice-persistence.js`: revision-bearing patches, acknowledgement handling, conflict recovery, and retry outbox.
- `src/features/player/Player.jsx`: waits for persistence before Check or submission.

### Why accepting legacy writes is unsafe

A current legacy tab and a stale legacy tab can send identical JSON. The server has no observation token with which to distinguish them. Filling in the latest revision would turn a stale snapshot into an authorized overwrite. Supplying zero is also unsafe: the migration assigns zero to existing items, including answered items, not just blank questions. Timestamps, user IDs, and session ownership do not establish which version the client observed.

Accepting only identical legacy snapshots could provide a no-op acknowledgement, but would not support actual legacy edits. It would also allow stale snapshots identical to current data to appear accepted without establishing a versioned protocol. The implementation consistently rejects missing revisions even for identical values; an empty array is a harmless no-op, not answer-saving compatibility.

Explicitly versioned, identical retries remain idempotent even if their revision is older; they cannot change stored answer fields. Changed stale requests raise PostgreSQL `40001` and roll back the whole batch. In the tested PostgREST version, that code arrives as HTTP 500, not 409; clients must inspect the database error code rather than retrying it as a generic transient failure.

## Verification performed

Command (with the existing isolated native-tool paths configured):

```sh
node --test --test-concurrency=1 \
  tests/migration-compatibility.test.js \
  tests/postgres-concurrency.test.js \
  tests/practice-answer-integrity.test.js \
  tests/practice-persistence.test.js \
  tests/native-app-workflows.test.js
```

**40 checks passed, zero failed, zero skipped**, including parent checks. Final output: `/tmp/satchi-release-transition.log`.

| Behavior                                 | Evidence                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Legacy contract before migration         | Actual authenticated local HTTP RPC succeeds and SQL confirms the answer.                                       |
| Existing progress across migration       | Pre-migration answer remains intact at revision zero; item count unchanged.                                     |
| Missing/null/string revisions            | HTTP rejection; full stored rows unchanged, including mixed batches.                                            |
| Both version-aware public save contracts | Actual HTTP success and SQL answer/revision verification.                                                       |
| Lost acknowledgement                     | Identical HTTP replay returns the same acknowledgement without incrementing revision.                           |
| Legacy/new request race                  | Concurrent actual HTTP requests reject legacy and preserve the new answer.                                      |
| Concurrent version-aware writers         | Separate native PostgreSQL connections: independent questions both commit; conflicting writers have one winner. |
| Stale-client rejection                   | Changed stale requests fail with `40001`; batch writes roll back.                                               |
| Connection failure and retry             | Actual Chromium offline mode, save failure, then successful retry and database acknowledgement.                 |
| Reload/session recovery                  | Actual Vite/Chromium refresh and logout/login recovery, plus outbox conflict/unit regressions.                  |
| Answer types                             | Browser/SQL verification covers MCQ, image choices, and open responses.                                         |
| Homework editing and access regression   | Existing native tests cover a question-edit/save race, withdrawal rejection, and preserved completed history.   |

The native environment uses disposable PostgreSQL18.6, PostgREST16.4, Vite, and Chromium. Application database requests are real. Auth and Storage transport are local fixture services; this is not a full Supabase stack or hosted verification. Embedded PostgreSQL and controller tests supplement the native tests. Initial test development assumed HTTP409 for `40001`; correcting the assertion to the actual HTTP500 mapping produced the final passing run. No production grading behavior was changed.

Scoped lint and formatting checks cover the added test/report. No application code changed in this task, so another frontend build was unnecessary; the preceding repair build passed. A subsequent [PostgreSQL17.11 staging rehearsal](homework-pg17-staging-report.md) passed 23 native database/browser checks, including Homework delivery and recurring history. Successful hosted authenticated verification, backup confirmation, and enforceable old-client draining remain release gates.

## Exact safe release sequence

### 1. Prepare without changing production

1. Obtain explicit approval for the production maintenance, database operations, frontend release, and any temporary permission changes. The current task does not grant it.
2. Freeze the reviewed release artifact and migration file contents; inventory all intended uncommitted fixes before selecting the release. Do not discard existing work or publish an unreviewed working directory.
3. Confirm recoverable backups/PITR, record migration history and affected function definitions/ACLs, and rehearse restoration in an isolated environment. Protect backup data and credentials. Storage references and objects must remain intact.
4. Rehearse all four migrations against a representative PostgreSQL17 schema and existing answered/completed fixtures. Recheck 080002's Check-function replacement anchors and 080001's constraint prerequisites against the release-day schema. Check RLS, definer helper permissions, grading and asset access. Stop on any schema drift or failed gate.
5. Build the current frontend as a release artifact and test it against that migrated staging database. Validate revision-aware requests and acknowledgements through PostgREST, not only function existence.
6. Prepare an enforceable maintenance/write-admission procedure and a rollback decision owner. A frontend maintenance page does not stop cached tabs from calling Supabase directly. RLS alone does not block security-definer RPCs.

### 2. Enter maintenance and drain old clients

1. Announce a window in Asia/Tashkent time. Before blocking writes, ask active students to let pending saves succeed on the old server, verify persistence, and leave practice sessions. Do not promise recovery of unsaved old-client memory after a forced reload; the old client has no new outbox guarantee. Record unresolved drafts for explicit recovery.
2. Pause recurring generation and other background writers using the existing scheduler controls. Stop new practice/homework starts and admin edits.
3. Enforce database/API write maintenance for all relevant mutations, including saves, Check, submission, heartbeat, homework administration and scheduled generation. A possible operator-controlled gate is temporary EXECUTE revocation with recorded ACL restoration; inventory all exposed paths and account for migrations restoring grants. Test the gate using an already authenticated old tab. Do not improvise a broad permission change on production.
4. Drain outstanding transactions. Confirm no old-client writes remain in flight and the gate survives migration grants. Keep the gate until the new frontend is verified.

**Old-tab gate:** require every active testing client to close/reload its cached application before reopening writes. An old Check RPC can mutate revision-zero items because its compatibility guard applies after a versioned mutation; rejecting old saves alone is not a complete old-client shutdown. Expiring sign-in or showing a maintenance page alone is insufficient. If all active clients cannot be demonstrably drained, require a tested server-enforced client-version admission gate for all mutating paths before release. Such a gate is not implemented by these four migrations. Without either condition, remain NO-GO.

### 3. Apply approved database changes in order, still closed

1. `20261008000100_homework_lifecycle.sql`
2. `20261008000200_practice_answer_integrity.sql`
3. `20261008000300_admin_open_response_review.sql`
4. `20261008000400_homework_snapshot_assets.sql`

080002 relies on 080001's lifecycle/locking helpers. 080003 must follow 080002 because it extends the open-review implementation. 080004 uses the final homework-session access helper. Follow the existing 20261007 migrations. Inspect successful application/history after each file. Each file has its own transaction; all four are not one global atomic operation. On failure stop, keep maintenance closed, inspect the committed prefix and failed file, and do not blindly replay already applied files.

Verify the two save RPCs, `answer_revision`, triggers, and permissions through the API. Let normal schema-cache refresh occur; use an approved PostgREST schema-cache reload only if the exact new RPC remains absent after verified successful migration. Cache reload cannot substitute for migration application.

### 4. Release the frontend, still closed

Deploy the prebuilt revision-aware frontend only after the database gate passes. Check that current HTML references the new assets and that the browser actually sends `p_session`, `p_changes`, and each item's observed `expected_revision`. Confirm fresh tabs and deliberately retained old tabs behave as intended. Do not remove the revision requirement to accommodate old tabs.

### 5. Authenticated verification and reopening

Allow only authorized disposable fixtures through the maintenance procedure first. Verify:

- MCQ, image and open-response save acknowledgement; database value matches.
- Refresh, logout/login and session recovery retain acknowledged answers.
- Offline failure is visibly unsaved; retry succeeds; lost-ack replay is idempotent.
- Two-tab conflicting writes reject stale changes and preserve the winner; no partial batch writes.
- Old unversioned saves fail without changing progress; the old-client admission/drain condition holds for Check and submission too.
- Homework 10→20→10, added/removed/group recipients, withdrawn access, started-attempt updates and completed history.
- One recurring occurrence, no duplicate delivery, intended Tashkent boundary.
- Manual open-response decisions persist and both student/admin results agree; automatic grading remains applicable.
- Frozen reference images and explanations obey ownership/completion access; assets remain intact.

Inspect Network, Console, SQL state and admin monitoring. Clean up only exact disposable fixture IDs. Reopen writes and resume scheduling only after every required gate passes. Monitor missing-RPC, version-required and `40001` errors; keep conflict handling rather than treating those errors as automatic retry authorization.

### 6. Failure, rollback and recovery

Before reopening, a failure leaves maintenance closed. Preserve the committed migration prefix and repair forward or use the rehearsed pre-release restoration procedure. Restore exact recorded ACLs only when the chosen schema/frontend combination is coherent. Do not claim that per-file transactions undo earlier successful files.

After reopening, prefer a forward repair while retaining CAS, revision counters, review records and outboxes. Rolling back to the old frontend alone will make its saves fail; restoring the old unversioned save implementation would reintroduce silent overwrites. Restoring a backup after new progress exists requires reconciliation of all post-backup answers, grading decisions, assignments and assets before reopening; never discard that progress automatically. Keep recoverable local drafts and require explicit user conflict resolution. Do not reset revision counters or automatically retry stale changes against a freshly fetched revision.

## What can be released separately

Backup preparation, read-only schema checks, isolated rehearsals, test additions, and building release artifacts can happen independently. They do not repair the hosted application.

The production answer-contract migration and revision-aware frontend require the coordinated sequence above. Publishing the new frontend first leaves saves blocked on the missing RPC; applying 080002 first leaves deployed legacy saves blocked. No seamless mixed-client release is supported by the current contracts. No production changes have been made, and all four migrations remain pending.

## Release safeguards implementation

Prepared 2026-10-08. `scripts/release/install-write-gate.sql` installs an operator-controlled PostgREST pre-request hook. It is deliberately outside `supabase/migrations`: review and approve it separately. The private control table is inaccessible to browser roles; only a privileged SQL operator can change modes. It refuses to overwrite an unrelated existing hook.

- `off`: original behavior, for preparation or an abort before the answer-contract migration.
- `maintenance`: every non-GET/HEAD/OPTIONS PostgREST request is rejected with HTTP503, including service-role requests. Only named, active verification users with the new client marker may use application RPCs. Account-management mutations remain paused for everyone.
- `compatible`: regular current clients can write; unmarked old tabs receive HTTP426. Trusted server-role integrations retain their existing authorization. The marker is a public protocol identifier, not authentication; JWT validation, RLS, ownership, and answer revisions still apply.

The new frontend sends `x-satchi-client-version: 20261008`. This also blocks legacy Check, finish, heartbeat, and Homework calls, rather than only the legacy save RPC. It deliberately blocks read-only RPCs invoked with POST during maintenance too. Read-only table GETs remain available. PostgreSQL prevents GET invocation of volatile mutation RPCs. Gate activation takes an exclusive advisory transaction lock; admitted PostgREST requests hold the shared lock until their transactions end. Thus activation drains those requests. The gate survives grants in all four migrations.

`manage-student` must be released with `SATCHI_RELEASE_GATE_REQUIRED=true` before activation. It checks the gate with the validated caller JWT before Auth-admin side effects and fails closed when the safeguard RPC is unavailable. Do not assume the database hook covers Edge Functions, Auth signup, Storage APIs, direct SQL, or scheduled/background jobs. Freeze new Auth signup in the provider, pause background writers and Storage mutations, and drain already-admitted account-management requests separately. An Edge request admitted before activation can span multiple provider transactions; inspect its completion and drain it before migrations. Login and reading existing assets need not be disabled. Read-only linked inspection found no `cron.job` catalog; recurring generation occurs through application requests. Recheck scheduler/provider configuration on release day instead of assuming a pg_cron job exists.

### 1. Confirm recovery before scheduling release

Use PostgreSQL17 binaries and an owner-readable, Git-ignored connection file. Never put a connection URL in command arguments or shell history. The backup script reads `.supabase-db.local` internally; exports are outside Git, mode0600, in directories mode0700.

```sh
export LD_LIBRARY_PATH=/tmp/satchi-postgres17/opt/pgsql-17/lib
export SATCHI_TEST_POSTGRES_BIN=/tmp/satchi-postgres17/opt/pgsql-17/bin
export SATCHI_TEST_POSTGREST=/tmp/satchi-postgrest/postgrest
python3 scripts/release/backup.py \
  --destination /home/otabek/satchi-release-backups \
  --pg-bin "$SATCHI_TEST_POSTGRES_BIN" \
  --credentials-file /home/otabek/Desktop/sat-chi/.supabase-db.local
```

Set `SATCHI_BACKUP_ARCHIVE` to the successful dated `application.dump` path printed by that command. Do not use an archive with `FAILED.json` or missing `export-manifest.json`.

```sh
node --test tests/release-backup-restore.test.js
```

Require a passing, non-skipped test and `restoration-verification.json` with `restored=true`, `pendingMigrationsRehearsed=4`, and `existingAnswerRowsUnchanged=true`. The test restores all selected schema/data into a separate PostgreSQL17 database, rehearses the migrations there, and extracts a private Storage inventory from that restored snapshot. It never restores into production. Then:

```sh
python3 scripts/release/backup-storage.py \
  --inventory "$(dirname "$SATCHI_BACKUP_ARCHIVE")/storage-inventory.private.json" \
  --destination "$(dirname "$SATCHI_BACKUP_ARCHIVE")/storage" \
  --jobs 8
```

Require `complete=true` and `verified=expected` in the private Storage verification file. Verify archive/roles SHA256 against `export-manifest.json`, preferably retain an encrypted off-device copy and verify that copy's checksums. A one-object diagnostic (`--limit`) is explicitly incomplete. The dump includes `public`, `auth`, `storage`, `supabase_migrations`, and `satchi_release` if installed; role names/settings are exported without passwords. Native rehearsal ignores managed ownership, while restoring original ACLs onto native role stubs; restore into a compatible Supabase recovery target with its managed roles/extensions for service recovery. Provider settings, Edge secrets/code, JWT signing keys, SMTP settings, and Netlify configuration require separately protected recovery records. Database backups contain Storage metadata, not object bytes ([Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)). Do not treat an unverified provider backup inventory as a restore point.

The `/tmp` tool paths are temporary: reinstall matching PostgreSQL17/PostgREST tools after reboot before rerunning these commands. None of this grants production-write authorization.

### 2. Approved gate installation and activation

The following commands are a future release runbook. **They were not executed against production during safeguard preparation.** Verify project `ileffhbbaomfimwulvpw`, repository `rakhimovotabek/sat-chi`, branch `main`, expected pending migration list, and a clean reviewed release artifact. Capture the current authenticator role settings, affected RPC definitions/ACLs and provider controls in the private backup folder. Stop on drift or an existing unrelated pre-request hook.

```sh
supabase db query --linked --file scripts/release/install-write-gate.sql
supabase functions deploy manage-student --project-ref ileffhbbaomfimwulvpw
supabase secrets set SATCHI_RELEASE_GATE_REQUIRED=true --project-ref ileffhbbaomfimwulvpw
```

The hook initially defaults to `off`; installing it must not interrupt the old frontend. Announce maintenance, let old pending saves acknowledge on the old database, and collect unresolved drafts before asking users to reload. The old deployed client does not guarantee an outbox: do not force-refresh unsaved tabs. Freeze provider signup, pause background/Storage writers, and stop new account-management requests. Drain already running Edge requests. **Storage prerequisite:** follow the verified strategy in [storage-freeze-and-release-report.md](storage-freeze-and-release-report.md); RLS and PostgREST maintenance do not stop pre-issued signed uploads or service-role/S3 writes. Do not proceed on a quiet database, a fixed wait, or rejected new signing alone. Previously authorized uploads must be unable to complete, every privileged issuer must be stopped, and admitted work must be drained before the fresh cutover backup.

Create a private `activate-gate.sql` outside Git, substituting only verified active disposable admin/student UUIDs:

```sql
begin;
set local lock_timeout='30s';
select satchi_release.set_mode('maintenance',
  array['ADMIN_TEST_UUID','STUDENT_TEST_UUID']::uuid[]);
commit;
```

Execute it with `supabase db query --linked --file /PRIVATE/BACKUP/PATH/activate-gate.sql`. A lock timeout is a failed drain: stop and investigate; do not bypass it. Query `satchi_release.control` through privileged SQL and verify mode/allowlist. From an already-authenticated ordinary old tab, confirm a legacy save/Check receives503 and stored rows do not change. Verify direct REST PATCH and service-role mutation rejection too. Verification users must send the new marker; an unmarked verification request receives426. Do not migrate until the hosted hook is demonstrably active and Edge/background writers have drained.

Take a fresh dated backup and repeat restoration and Storage verification while writes are frozen. This is the actual release recovery point; an earlier development backup is not sufficient for the final cutover. Preserve completed migrations/answers and all private diagnostics outside Git.

### 3. Apply exactly the reviewed four migrations

```sh
supabase migration list --linked
supabase db push --linked --dry-run --skip-vault
```

Require the dry run to list exactly080001,080002,080003,080004 in that order. Stop if any other migration appears. Avoid `--include-seed`, `--include-all`, `--include-roles`, and Vault changes. Once approved and all safeguards pass:

```sh
supabase db push --linked --skip-vault
supabase migration list --linked
```

Check each migration result and the resulting history; never manually mark a failed migration applied. On failure keep maintenance enabled and inspect the committed prefix. Confirm gate mode remains `maintenance`, new save RPC/answer_revision exist, old Check is blocked, and the disposable revision-aware RPC saves succeed with the marker. Verify source/history preservation. Reload the schema cache only after a verified migration if needed, not as a substitute for applying it.

### 4. Publish the matching artifact, still gated

Run scoped regression tests and build; review the exact Git diff and secret exclusions. Commit only reviewed intended fixes, push the configured production branch, and verify the Netlify build publishes the expected commit. No backups, credential files, private inventories, local auth fixtures, or generated test data belong in the commit. Confirm production HTML serves new asset hashes and authenticated requests carry both the client marker and observed answer revisions.

### 5. Authenticated verification before reopening

Keep the verification allowlist only. With the approved disposable accounts, run the preceding complete browser checklist: login, Question Bank, Book Practice Check/feedback/explanations, MCQ/image/open saves, refresh/logout/recovery, stale two-tab rejection, Homework10→20→10, direct/group recipient changes/access withdrawal, recurring occurrence/history, manual grading, frozen images, and student/admin results. Record database values and Network/Console results. Clean up only recorded disposable IDs. Existing unrelated users/history must remain untouched. Deliberately retain an old tab: it must remain unable to write. Account creation is intentionally paused during this window; prepare test accounts beforehand.

### 6. Reopen and recover reversibly

After all checks pass, create/run a reviewed private SQL file containing:

```sql
begin;
set local lock_timeout='30s';
select satchi_release.set_mode('compatible');
commit;
```

Confirm current-client writes succeed and old unmarked writes receive426. Resume reviewed jobs/Storage writes and restore the recorded Auth signup setting. Keep `SATCHI_RELEASE_GATE_REQUIRED=true`; old account-management clients must also be rejected. Monitor errors and saved progress.

To close again use `set_mode('maintenance', VERIFIED_UUID_ARRAY)`; the same drain applies. Before any migrations, an abort can restore `off` on the unchanged old schema/frontend. **Do not use `off` after migration080002 while cached legacy clients exist.** Restoring only the old frontend is not a coherent rollback. Prefer forward recovery under maintenance; a database restore needs explicit post-backup progress reconciliation and a compatible managed recovery target. Do not overwrite production with this test's native restore command, reset revisions, or automatically retry stale answers with newly fetched revisions.

The hook can be disabled only for an approved coherent pre-release rollback: set `off`, verify the installed setting still equals `satchi_release.check_request`, restore the captured authenticator setting (RESET if previously absent), then `NOTIFY pgrst,'reload config'`. Keep the private gate table/audit evidence; dropping it while the hook is configured would break API requests. Normal reopening is `compatible`, not uninstalling the gate.
