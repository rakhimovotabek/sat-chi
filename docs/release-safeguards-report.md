# Release safeguards preparation — 2026-10-08

Production frontend, application data and migration history remain unchanged. No production gate installation, migration, Edge deployment, Git commit/push, or Netlify deployment was executed. Existing uncommitted application repairs were preserved.

## Connection and recovery scope

The owner-readable, Git-ignored `.supabase-db.local` connection was verified without logging its contents. Linked PostgreSQL is17.11; the authorized connection can read Auth users and Storage metadata. At inspection there were24 Auth users and17,489 Storage objects. Backups and private inventories reside outside Git in `/home/otabek/satchi-release-backups`, with directories0700 and files0600.

`scripts/release/backup.py` exports `public`, `auth`, `storage`, `supabase_migrations`, and the optional release-gate schema. It also exports role definitions/settings without role passwords. It writes SHA256 checksums only after successful export. A failed export writes `FAILED.json`; its partial archive is never treated as a recovery point. `--inserts` provides a batched-INSERT alternative to COPY streaming through the pooler.

`tests/release-backup-restore.test.js` creates a separate native PostgreSQL17 database, restores the archive, rehearses the four pending migrations, and compares existing practice answer/grading rows before and after migration. It does not expose restored production data through the fixture application's API. It writes private recovery evidence and a Storage inventory from the restored snapshot only after successful restoration.

`scripts/release/backup-storage.py` downloads object bytes using an authorized server credential kept in process memory. No credential is printed or written into source. It validates size/ETag and records SHA256, supports cached-file reuse, and records incomplete progress separately from a complete result. A diagnostic subset is explicitly marked incomplete. Fixed an existing backup-directory mode600 that prevented file traversal: backup directories require700, while files require600.

Limitations: native recovery uses managed-role stubs and ignores managed ownership during the rehearsal; original ACLs are restored onto native role stubs; a compatible Supabase recovery target is required for complete provider-service recovery. Provider-managed extensions, configuration, JWT signing keys, SMTP settings, Edge secrets and deployment configuration require separately protected recovery records. Database metadata alone does not restore Storage files. No production restoration is authorized by these scripts.

## Enforceable gate implemented locally

`scripts/release/install-write-gate.sql` is a reviewed operator script outside the automatic migration directory. It installs an authenticator `pgrst.db_pre_request` hook backed by a private control table and refuses to overwrite an unrelated hook. Production read-only preflight found no existing authenticator pre-request setting. Actual hosted installation/activation remains an approved-release check.

Maintenance rejects non-read-method PostgREST calls with503 for ordinary users and service-role integrations. Verification users require an active profile, an explicit operator allowlist and the updated frontend marker. Account-management mutations are paused even for those users. Reopening in `compatible` mode allows current clients while old unmarked requests receive426. Normal reopening does not disable the gate. A public version marker grants no identity or access; JWT/RLS/session ownership and revision checks remain enforced.

Shared advisory transaction locks on admitted API requests and an exclusive lock on gate-mode changes provide a tested drain for PostgREST transactions. This does not cover already-admitted multi-transaction Edge operations or direct SQL/background jobs; the release runbook explicitly pauses/drains them separately. Auth signup and Storage mutation controls also need provider-side coordination. Pending answers are retained by the updated player during503 errors and can be retried after reopening. Old deployed tabs lack the new outbox guarantee: preserve any unacknowledged drafts before refreshing them.

The frontend sends `x-satchi-client-version: 20261008`. `manage-student` forwards that marker and the validated caller token to the safeguard RPC when `SATCHI_RELEASE_GATE_REQUIRED=true`; missing safeguards fail closed before Auth-admin side effects. This Edge update and flag must be released before gate activation.

## Verification

- PostgreSQL17.11, real PostgREST, actual Vite/Chromium and the Edge handler: **38 checks passed,0 failed,0 skipped**, including29 account-handler unit checks and9 native gate checks (parent checks included). `/tmp/satchi-gate-pq17-final.log`.
- Additional native Homework/practice workflow regression: **12 checks passed,0 failed,0 skipped**. `/tmp/satchi-safeguards-regression.log`.
- Covered cached-tab/direct RPC rejection, direct PATCH, service-role maintenance rejection, verification restrictions, migration-time gate persistence, current-client acceptance, unversioned save rejection even with a forged marker, idempotent retry, session ownership, mode reversal, and concurrent transaction draining.
- Actual account-management handler calls the real local gate RPC and creates no Auth row while maintenance is active. Its Auth transport is a fixture. Native browser suites also use fixture Auth/Storage transport; application database requests are real. These are isolated checks, not hosted gate verification.
- Scoped ESLint (including an explicit no-ignore check for the Edge handler), Python compilation and frontend build passed. `/tmp/satchi-safeguards-final-build.log`.
- A permanent-connection COPY export ended with `SSL connection has been closed unexpectedly` during `daily_homework_versions`. The isolated restore of that incomplete archive correctly failed with unexpected EOF. Earlier temporary-connection exports also failed. These are failed backup checks, not passing recovery tests.

## Recovery result and release decision

**Both original blockers are resolved in local preparation. Conditional GO for the reviewed coordinated release; no production execution occurred.**

Verified recovery folder: `/home/otabek/satchi-release-backups/20261008T133244Z`.

- Successful PostgreSQL17 custom archive and password-free role export; SHA256 checks verified before restoration.
- Actual isolated PostgreSQL17 restore passed, including original ACLs onto native role stubs.
- Restored counts:24 Auth users,7,572 questions,3,879 practice items,17,489 Storage objects,62 pre-release migration-history rows.
- All four pending migrations rehearsed successfully on the restored production copy. SHA256-based comparison confirms all existing practice answer/grading rows unchanged except the newly added revision column.
- All17,489 object files verified, totaling341,995,581 bytes. Their inventoried metadata exactly matches the inventory extracted from the restored backup; files are stored with the verified recovery archive.
- Final recovery test:1 passed,0 failed,0 skipped; `/tmp/satchi-backup-restore-final.log`. Together with the38 gate and12 workflow checks,51 checks passed.
- A fresh COPY export using the matching PostgreSQL17 client library completed successfully. Earlier streaming failures and an abandoned stalled INSERT attempt are retained as failed artifacts; they are not backups. That successful attempt does not by itself prove the underlying cause of the earlier SSL failures. The export utility now imposes a15-minute deadline per export command.

Remaining release gates are operational: approve/install the operator SQL hook and guarded Edge function, prove hosted activation with an existing authenticated tab, drain/pause independent writers, take and verify a fresh gated recovery point, apply the four migrations, deploy the matching frontend while gated, and pass authenticated production checks before switching to `compatible`. Do not treat isolated PostgREST16.4 verification as hosted PostgREST14 verification; activation must be tested on the linked service. Managed service ownership, provider configuration/secrets and complete Auth/Storage service recreation were not rehearsed; recovery needs a compatible Supabase-managed target.

The exact approved-release commands, migration ordering, old-client draining, verification allowlist, Edge guard, reopening and recovery procedure are in [migration-compatibility-release-plan.md](migration-compatibility-release-plan.md). The four October8 migrations remain pending in production. Installing and activating the tested gate is a separate production change requiring release approval; no safety check may be bypassed.

## Historical paused checkpoint

Paused at the user's request. Active dump and Storage-transfer processes were stopped. The batched-INSERT attempt in `/home/otabek/satchi-release-backups/20261008T114041Z` was interrupted and is not a verified backup. Its failure marker is retained. The earlier partial COPY archives are also unusable.

Storage last recorded checkpoint: 1732 verified of 17489 expected; 2012 object files are retained outside Git. The manifest remains incomplete. Resume can reuse matching cached files and retry transient failures; complete Storage verification still requires all objects.

Next: resume an export using the permanent connection; finish a complete archive, run the actual PostgreSQL17 restore/migration rehearsal, reconcile Storage inventory to that restored snapshot, finish object verification, and update the release decision. Inspect/drain only the operator's own interrupted pooler dump sessions if still present before a future release; never terminate unrelated production sessions. No production release safeguards were activated. This historical NO-GO is superseded by the successful recovery result above.
