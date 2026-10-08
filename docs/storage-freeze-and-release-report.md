> Current execution status (2026-10-08): the four migrations and matching frontend are published, but Book queries timed out during production verification. Writes remain in maintenance. See [scoped-production-release-report.md](scoped-production-release-report.md). Earlier pending/aborted status below is historical.

# Storage freeze investigation and release status

2026-10-08. **NOT DEPLOYED — NO-GO.** A real upload using a token issued before maintenance succeeded during maintenance, despite restrictive Storage policies. A service-role upload also succeeded. The ordinary authenticated upload and new signing requests were rejected. No four-migration cutover, GitHub push, or Netlify frontend deployment was attempted. All probe restrictions and files were removed, and normal pre-migration admission was restored.

This report follows `production-release-execution-report.md`, `migration-compatibility-release-plan.md`, and `release-safeguards-report.md`. Their earlier PostgreSQL17 recovery and gate tests were reused, not restarted.

## Writer inventory and consistency impact

| Writer | Evidence and coverage | Impact / required control |
| --- | --- | --- |
| Browser/direct PostgREST mutations, including cached tabs, Homework generation, saves and grading | Installed `satchi_release.check_request`; hosted legacy save returned HTTP503 during this probe | Affects public application data; the existing server gate and advisory-lock drain apply |
| Ordinary authenticated Storage uploads, upserts, moves/copies, deletes and upload-token issuance | Three private buckets: `book-covers`, `question-assets`, `book-package-assets`; existing administrator write policies on the first two. Scoped hosted restriction rejected a direct upload and new signing | Affects file bytes and Storage metadata. Additive restrictive policies can stop RLS-bound requests, preserving SELECT and existing grants. They cannot be represented as a complete freeze |
| Previously issued signed uploads | Actual token issued before maintenance uploaded successfully afterward and created its object | Can change bytes/metadata after admission is closed; requires expiry/revocation and a protocol-level drain, not merely an RLS change |
| TUS resumable uploads | Managed Storage supports resumable uploads and signed-upload tokens; no verified hosted queue/session drain is available in this checkout | Existing upload sessions may outlive the initial signing step. Official documentation describes upload URLs valid up to24 hours; do not assume a two-hour signed-token wait drains every protocol |
| Storage S3 uploads and multipart operations | Management API confirms `features.s3Protocol.enabled=true` | S3 generated access keys bypass RLS. Enabled S3 is a potential independent path, not proof of active external uploads. Credential owners, presigned requests, multipart sessions and disabling/draining semantics need verification |
| Service-role Storage clients | Actual hosted service-role upload succeeded despite maintenance and restrictive policies. Repository imports, cover/asset repair and deletion scripts use privileged Storage clients | Must pause their owning processes and token issuers. No inference that a browser RLS gate covers them; no privileged keys were rotated or exposed |
| `manage-student` Edge function | Management API lists this as the only deployed Edge function. Its handler validates Auth and active-admin status, then calls the installed guard before Auth-admin side effects | Existing gate blocks new account mutations; already admitted requests must finish. There is no atomic lock held across all external Auth side effects, so draining is separately required |
| Supabase Auth signup, OAuth and account/session operations | Signup enabled; email and Google providers enabled. `auth.users` insertion triggers `public.handle_new_user` | New users can create public profiles outside PostgREST. A reviewed temporary signup disable and admitted-request drain are required. Existing sign-in/session writes remain relevant to Auth backup recovery |
| SQL schedules and database hooks | No `cron.job` catalog, `pg_cron`, or `pg_net` extension found. Inspected public/Auth triggers are application triggers; no HTTP webhook trigger found | No scheduled SQL writer was identified. Recurring Homework is generated through application/database calls; no real recurring templates were paused or changed |
| Local import/repair processes, GitHub/Netlify automation and external integrations | Repository has operator import/repair scripts, no `.github` workflow directory, and no Netlify functions/schedule configuration. Observed SQL client sessions were idle provider/PostgREST/Storage/pooler sessions | This does not prove no off-machine service-role/S3/SQL writer exists. Owners and external schedules require a credential/process inventory before claiming an exhaustive drain. No unrelated session was terminated |
| Provider Storage completion/cleanup work | Signed endpoint accepts previously authorized uploads; database-idle observation cannot show pending network bodies, TUS work, multipart completion or queued cleanup | A database lock or idle `pg_stat_activity` alone does not freeze object bytes. Provider-managed internals must remain unchanged |

Read-only inventory and management configuration are stored privately outside Git. No credential value, account email, student answer or asset inventory is included here.

## Narrowly scoped implementation and verification

Added `scripts/release/storage-policy-probe.sql`, `scripts/release/probe-storage-freeze.py`, and `tests/storage-policy-probe.test.js`.

The probe adds restrictive INSERT/UPDATE/DELETE policies only for a fresh UUID prefix inside `question-assets`. It preserves SELECT and unrelated paths. It never replaces existing policies or alters managed tables, roles, upload limits, signing keys or service internals. It issues a token first, activates the documented maintenance gate, tries the pre-issued token and both ordinary/privileged upload paths, and restores policies/mode in `finally`. Object cleanup uses the supported Storage API and exact disposable names, never SQL deletion of Storage metadata.

| Actual hosted request/check | Result |
| --- | --- |
| Baseline authenticated disposable upload | HTTP200 |
| Signed upload token issued before maintenance | HTTP200 |
| Legacy save during maintenance, nonexistent session/empty answers | HTTP503 |
| Authenticated direct upload under scoped restriction | HTTP400, Storage error status403 |
| New signed-upload issuance under scoped restriction | HTTP400 |
| Previously issued token used during maintenance | **HTTP200; SQL confirms its object was created** |
| Service-role upload during maintenance/restriction | **HTTP200** |
| Original policy definitions after removal | Exact match |
| Authenticated upload after reopening | HTTP200 |
| Disposable cleanup | HTTP200; zero remaining objects |
| Final gate | `off` |
| Final Storage management configuration | Exact match; S3 unchanged |

Five non-skipped PostgreSQL17 checks passed, including the parent test: ordinary insert rejection, unaffected unrelated prefixes, blocked update/delete preserving existing fixtures, privileged bypass and exact policy restoration/reopening. `/tmp/satchi-storage-policy-probe.log`. Python compilation and scoped ESLint passed; the new test was formatted. These isolated tests establish policy behavior, not a managed-service drain.

Hosted evidence: `/home/otabek/satchi-release-backups/storage-investigation-20261008T180919Z/hosted-storage-freeze-probe.json`. The report explicitly records `guaranteed_freeze=false`; diagnostic success must never be counted as a passing release safeguard.

## Managed-service limitation

The documented [Storage config API](https://supabase.com/docs/reference/api/v1-update-storage-config) exposes file-size limits, features and external configuration, not a general write-maintenance control. Its current project response likewise has no write-freeze switch. Do not send an invented configuration property or treat an undocumented option as supported.

Supabase's [signed-upload documentation](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) explains that these URLs require no further authentication and are valid for two hours. The reference [signed-upload handler](https://github.com/supabase/storage/blob/master/src/http/routes/object/uploadSignedObject.ts) validates the signature then uploads as a privileged user. This source is explanatory; the actual hosted success above is the production evidence.

[Service keys bypass Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), and [generated S3 access keys do too](https://supabase.com/docs/guides/storage/s3/authentication). Auth key rotation is not a safe substitute for Storage URL revocation: Supabase documents a separate internal Storage signing key and directs revocation requests to support in its [signed URL guidance](https://supabase.com/docs/guides/storage/serving/downloads). Explicit provider confirmation is needed for upload tokens and resumable sessions, not just download links.

The [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design) requires object mutations through the API. No custom trigger, permission change on managed service roles, metadata deletion, exclusive table lock masquerading as an object-byte freeze, bucket deletion, or fabricated MIME/size limit was used. Those shortcuts would not meet the requirement and could leave bytes and metadata inconsistent.

## Supported cutover design — prerequisites before execution

### Option A: provider-assisted immediate maintenance

Ask Supabase support for a supported procedure for this project that stops Storage mutations across ordinary uploads, existing signed-upload tokens, direct `.storage.supabase.co` access, TUS and S3, while allowing backup reads and privileged migration access. Request explicit handling of admitted requests and background completion/cleanup, plus activation and reversal checks. A support-assisted upload-token revocation alone is insufficient unless new issuance and every other protocol are also controlled. Do not assume such a facility exists until the provider confirms it.

Rehearse the provider-approved procedure with disposable assets: issue standard signed, resumable and applicable S3 upload credentials before freezing; confirm each completion fails while frozen, existing files remain readable/unchanged, and fresh uploads work after reopening. Record provider drain confirmation in addition to SQL transaction checks. No support message has been sent automatically.

### Option B: staged admission closure and expiry drain

If immediate provider freeze is unavailable, use supported controls to stop new issuance **before** the migration maintenance window. This is a separate, scheduled lead-in, not an instant maintenance guarantee:

1. Inventory all privileged credential owners and pause their Storage/SQL writers and signing processes. Verify no external issuers remain. Reversible restrictive policies may deny ordinary authenticated Storage mutations/issuance, with reads unchanged. Rehearse global policy scope on the restored database before applying; this probe only covered disposable paths.
2. Rehearse disabling S3 through the supported Storage configuration control; establish whether existing multipart/presigned requests and all hostnames are denied. Preserve the original setting. If this cannot be established, use a provider-approved S3 credential/drain procedure rather than guessing.
3. Establish the actual maximum lifetimes and last issuance for every active signed, resumable and S3 protocol. Wait until all previously authorized sessions expire and admitted uploads/cleanup finish. The documented two-hour standard signing period is not sufficient evidence for TUS or S3. Renewing/chunked sessions must be included. A fixed wait without verified issuance closure and expiry bounds does not qualify.
4. Test the retained pre-closure tokens and upload sessions through their original endpoints after the drain: they must fail for the intended expiry/freeze reason. Verify failed requests create no object and change no existing file. Confirm reads still work and no privileged writer can issue fresh credentials during the window.
5. Only then activate the application maintenance gate and complete the remaining cutover below. If any protocol can still complete, stop; do not take a supposedly frozen backup or migrate.

This staged strategy uses supported policy/API/process controls and token expiration. It is **not implemented or proven globally yet**, because privileged owners, S3/session admission behavior and provider completion drain are not established. It requires a scheduled lead-in and a tested reversal. Neither token expiry nor quiet inventory polling alone proves a complete freeze.

### Common coordinated cutover after either option passes

1. Protect old-client pending drafts; let existing saves acknowledge before admission closes. Record unresolved drafts rather than forcing reloads.
2. Capture reversible provider settings, policies, role settings and writer inventory outside Git. Disable new Auth signup through the supported Auth configuration API and drain admitted account-management/signup requests. Do not change existing users.
3. Activate the reviewed PostgREST gate in maintenance; verify legacy and direct mutations are rejected, allow only the authorized versioned test users, and confirm the advisory-lock transaction drain succeeds. Do not bypass a timeout.
4. Verify the chosen Storage protocol freeze/drain is still effective. Take a fresh dated database archive, restore/rehearse in isolated PostgreSQL17, and extract the Storage inventory from that exact snapshot. Back up all matching object bytes and verify every file against snapshot metadata/checksums. Any mismatch or missing file blocks the cutover. Store all recovery material outside Git; preserve provider-service recovery limitations.
5. Follow the existing migration dry run and apply exactly080001→080002→080003→080004. Keep all gates active, verify history after each migration, and compare original answer/grade/completed-history and asset data against the fresh snapshot.
6. Commit only reviewed application/test/docs/migration files; exclude secrets, backups and local fixtures. Push `main`; verify Netlify publishes the matching commit/assets. Keep normal writes closed.
7. Perform the full authenticated disposable smoke-test checklist from the release plan, including revision saves, Check, Question Bank, Homework editing/direct/group/recurring delivery, grading, images/explanations and reload recovery. Verify cached legacy clients remain rejected. Do not alter unrelated student history.
8. After all checks pass, change the application gate to `compatible`, restore the recorded provider/policy settings and paused jobs, and verify ordinary current clients and Storage uploads work. Old unmarked clients must remain rejected. Monitor persisted progress.

Before migrations, an abort restores the original policies/provider settings and gate `off`. After migration080002, never reopen in `off`; keep maintenance and prefer forward recovery. Restoring only the old frontend is incompatible with the new answer contract. A full restore requires managed-service recovery and reconciliation of any post-backup progress, not an automatic overwrite.

## Release status

- Storage freeze/drain: **failed / not established**; pre-issued and privileged uploads demonstrably bypassed the attempted controls.
- Fresh gated backup: **not taken**. Earlier restored backup remains available; it is not this cutover's recovery point.
- Four migrations: **not applied**, all pending.
- GitHub commit/push: **none**.
- Netlify frontend deployment: **none**; existing site remains at <https://sat-chi.netlify.app>.
- Production smoke tests: **no post-release tests**; only authorized gate/Storage diagnostics performed.
- Normal access: **restored**, gate `off`, original Storage policies/configuration retained, zero disposable probe objects remain.
- Worktree: prior uncommitted work preserved; new diagnostic code/tests/report are local only.

**Next prerequisite:** choose and rehearse a provider-supported immediate freeze or a verified staged expiry/drain. Until then the user's safety conditions do not permit Phase2 execution.
