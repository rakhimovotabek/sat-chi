# Production release execution — stopped before cutover

Follow-up investigation and current release status are in [storage-freeze-and-release-report.md](storage-freeze-and-release-report.md). Actual pre-issued-token and service-role uploads both succeeded during maintenance despite disposable-path restrictive policies. All temporary policies and files were cleaned up, mode was restored to `off`, and Phase2 remains blocked.

2026-10-08. **NO-GO.** An authenticated production check found an independent Storage writer that the documented PostgREST gate does not block. The release stopped before the four migrations, commit, push, or frontend deployment. Maintenance was reversed using the documented pre-migration `set_mode('off')` procedure.

## Verified targets

- Supabase: `ileffhbbaomfimwulvpw`, PostgreSQL 17.11.
- GitHub: `rakhimovotabek/sat-chi`, branch `main`; existing commit `95a9dd377dcd8c2b7dd78a45e3f88ddf94757567`.
- Netlify: site `sat-chi`, ID `da05598f-7845-4675-a916-d0591e6a8e05`, <https://sat-chi.netlify.app>. Netlify login accepted; published deployment metadata matches the GitHub repository and existing commit.
- Local build passed (`/tmp/satchi-coordinated-release-build.log`). Targeted regression run: 51 passed, zero failed or skipped (`/tmp/satchi-release-targeted-regression.log`). These are not post-release production workflow checks.

## Production actions performed

1. Captured pre-gate role configuration and affected function definitions/ACLs outside Git.
2. Installed the reviewed `scripts/release/install-write-gate.sql`. Its initial mode was `off`.
3. Set `SATCHI_RELEASE_GATE_REQUIRED=true` and deployed the guarded `manage-student` Edge function. An initial concurrent deployment conflict was resolved by a sequential retry. No account mutation was tested or performed.
4. Authenticated the authorized admin fixture. The guard RPC accepted its request while the gate was off.
5. Briefly enabled maintenance without verification-user exemptions and tested real production endpoints.
6. Restored mode `off` in the verification script's cleanup path and independently verified it through PostgreSQL.

## Authenticated maintenance results

| Check | Actual result | Assessment |
| --- | --- | --- |
| Legacy `save_book_practice` POST, nonexistent session and empty answers | HTTP 503, `PT503` | Gate rejected cached-client save requests before mutation |
| `satchi_assert_release_write_access` POST | HTTP 503 | Account guard rejected writes |
| Storage signed-upload admission POST for a unique disposable path | HTTP 200 | **Independent Storage write admission remained open** |
| Restore pre-migration mode | `off`, verified directly | Old frontend/database remain matched |
| October 8 migrations in migration history | 0 of 4 | None applied |
| Storage rows under disposable verification prefix | 0 | Signing did not upload a file or persist an object |

The Storage request only requested an upload token. No file was uploaded, no book/question assets were changed, and response credentials were not logged. Existing authenticated administrator insert/update/delete policies on `storage.objects` remain enabled. The PostgREST pre-request hook does not intercept the separate Storage service. A signed-upload acceptance is evidence that this writer has not been frozen; it is not a full upload test.

The runbook requires independent writers to be paused but does not provide a reviewed and rehearsed Storage admission freeze. Auth signup is also enabled and must be accounted for in the independent-writer drain. No improvised production policies, triggers, or Auth settings were applied to work around this gap. No `cron.job` catalog was found during the read-only inspection; this does not establish that every external writer has been drained.

## Backup and current release state

The earlier backup at `/home/otabek/satchi-release-backups/20261008T133244Z` was restored in isolated PostgreSQL 17 and its Storage inventory/files verified. It covers application data, Auth and Storage metadata, migration history and separately copied Storage bytes. Managed-service recovery limitations remain as documented in `release-safeguards-report.md`.

**No fresh cutover backup was taken:** the required complete writer freeze failed first. The older verified backup must not be presented as a fresh, gated cutover snapshot.

Operator evidence for this attempt is private, outside Git, under `/home/otabek/satchi-release-backups/release-20261008T175314Z`, including `hosted-gate-verification.json` and `final-production-state.json`. Credentials and private data are excluded from this report and Git.

- All four migrations remain pending.
- No new commit or GitHub push occurred.
- No Netlify frontend deployment occurred.
- Post-release student/Homework/grading/image verification did not occur because cutover was not attempted.
- Normal admission has been restored to its pre-migration state. The installed hook and guarded Edge function remain in place with mode `off`.
- Existing uncommitted application work is preserved.

## Required next step

Prepare and rehearse a reversible, server-enforced freeze for independent Storage writes, including previously issued upload credentials and already admitted requests. Complete the Auth/background/privileged writer inventory and drain. Document exact activation, verification, and reversal commands before any further production cutover. Then repeat maintenance verification, take and restore-verify a fresh gated backup, and follow the existing ordered migration/frontend release plan. Do not reopen a migrated backend in `off` mode; successful post-cutover reopening requires the documented compatible-client gate.
