# Reliability production release — 2026-10-09

The owner explicitly authorized release from8833490 after the instrumented complete suite passed255/255 and actual hosted student authentication survived a persistent-profile restart. Conclusive classification of the historical, unreproduced storage failure is no longer a release condition. Diagnostics remain enabled; no Auth architecture or revision protection was weakened.

Preflight confirmed Supabaseileffhbbaomfimwulvpw, GitHubrakhimovotabek/sat-chi/main and Netlifyda05598f-7845-4675-a916-d0591e6a8e05 (sat-chi.netlify.app). Reviewed migration fingerprints match the readiness report. Only090003→090004→090005 were pending; all three applied successfully, without replaying prior migrations. The deployed20261008 client contract remains compatible.

Maintenance was activated with zero exemptions; legacy/current saves, direct REST mutations and the account-management Edge writer returned503. Signup was paused with its original setting saved privately. No cron schema or active direct DML writers were found. Independent Storage remained operational under the documented application-scoped recovery strategy.

Fresh backup20261009T145042Z was checksummed and restored into isolated PostgreSQL17:7,572 questions,4,685 practice items,24 Auth users; all three pending migrations rehearsed, protected existing rows and Storage metadata preserved. All17,489 snapshot Storage files verified. Credentials, profile captures, exports and inventories remain outside Git. Managed-service disaster recovery still requires provider support and reconciliation of post-backup data.

The completed reliability fixes, pagination correction, Check DOM/image retention and newer-acknowledged-answer reconciliation are included. Fresh production build and release-diff credential scan passed. Netlify has no Git build integration, so the matching dist artifact is published explicitly after pushingmain.

Execution is in progress. Maintenance must remain active until protected-row integrity and authenticated production smoke checks pass. Final deployment, verification, cleanup and reopening evidence will be appended here.

## Stopped safely: Netlify publication blocked

**BLOCKED / NOT DEPLOYED.** The three migrations applied successfully, and post-migration count/hash comparison proved all50 existing public tables unchanged (normalizing only the new nullablepool_count field). All five replaced RPC ACLs match the prior definitions. GitHubmain received9cd8ef1.

Netlify CLI publication failed with JSONHTTPError404 even when explicitly given the API-verified credential. The same credential can read the site/deployments and accounts; the account API reports Owner. Publication through the [documented ZIP API](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/) also returned HTTP404/Not Found, including the exact canonical site ID endpoint without optional query parameters. This is an actual publication blocker, not the historical Auth test. No permission/security workaround was used. Errored CLI deployment6ac9013b565b820008ba93c8 did not replace the published frontend.

The published deployment remains6ac7f2a3a1c596000848ae27 (previous frontend). Matching-release production smoke tests were NOT executed; no disposable Homework/practice records were created in this cutover. Normal writes were NOT restored. Confirmed final state: maintenance, zero exemptions, signup paused (original disable_signup=false saved privately). Previous frontend and compatible new schema remain installed; do not reapply090003/090004/090005 or drop indexed-pool structures.

Private execution workspace: /home/otabek/satchi-release-backups/reliability-release-20261009T144806Z. Fresh recoverable backup: /home/otabek/satchi-release-backups/20261009T145042Z. Export/restore/Storage/integrity/API-error evidence is retained outside Git. No existing student answers, grades, completed Homework or content rows changed during migrations.

Next step is to resolve Netlify's current publication404 with the site/account owner or provider, then publish the already verified dist artifact through the authorized target. Verify published deploy identity and served asset hashes before admitting only the recorded admin/student accounts, running browser-release-smoke.private.mjs and authoritative database checks. Clean tracked disposable IDs only. Reopen with satchi_release.set_mode('compatible') and restore the saved signup setting only after critical workflows pass. No new code or historical-auth diagnosis is required to resume.
