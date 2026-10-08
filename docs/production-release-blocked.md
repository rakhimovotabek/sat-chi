# Production release preflight — blocked

**Latest execution status:** See [production-release-execution-report.md](production-release-execution-report.md). The backup was subsequently restored successfully, and the reviewed gate has now been installed and tested in production. The release nevertheless stopped before migrations because Storage signed-upload admission remained open during maintenance. Mode was restored to `off`; no frontend release or Git push occurred. The historical findings below describe the earlier preflight, not the current installed-gate state.

2026-10-08. Release execution was authorized, subject to backup and write-gate safeguards. Preflight stopped before production changes because those safeguards could not be verified. Existing uncommitted changes were preserved.

Subsequent safeguard work is recorded in [release-safeguards-report.md](release-safeguards-report.md). The missing gate described below is a historical preflight finding: a server-side gate has now been implemented and tested in isolation. It has not been installed in production. Recoverable-backup verification remains a separate release requirement.

## Confirmed targets and checks

- Linked Supabase: `ileffhbbaomfimwulvpw`.
- GitHub: `rakhimovotabek/sat-chi`; configured and repository default branch: `main`. GitHub authentication succeeded.
- Existing HEAD: `95a9dd377dcd8c2b7dd78a45e3f88ddf94757567`. This is not a new release commit.
- `npm run build` passed. Local output: `/tmp/satchi-release-build.log`.
- `git diff --check` passed. Local environment/account configuration, Supabase temporary configuration, and built assets are ignored by Git.
- Linked migration history ends at `20261007000600`; all four October8 migrations are pending.
- Public production HTML still serves `/assets/index-Dceo6m6j.js`. Its `api-CgyTxlkW.js` chunk sends legacy `save_book_practice` requests without `expected_revision`, confirming incompatibility with migration080002's JSON contract.

## Failed release gates

**Recoverable backup not confirmed.** The read-only `supabase backups list --project-ref ileffhbbaomfimwulvpw --output json` response reported `backups: null`, empty `physical_backup_data`, `pitr_enabled: false`, and `walg_enabled: true`. WALG being enabled does not establish an available restore point or a verified restoration procedure. This does not prove that no internal backup exists; it means recoverability could not be confirmed. No current project-local `book-reset-backups` directory exists. The older public-table JSON backup script is not a verified full database recovery procedure.

**Safe old-client write gating not available.** `docs/migration-compatibility-release-plan.md` describes required maintenance and gating but explicitly states that a server-enforced client-version admission gate is not implemented by the four migrations. No executable maintenance/gating implementation was found in this repository. There is no verified way here to drain every cached client or prevent its incompatible Check/submission writes when normal permissions reopen. No restrictions were applied merely to simulate maintenance.

## Production actions and verification

- Migration080001: not attempted.
- Migration080002: not attempted.
- Migration080003: not attempted.
- Migration080004: not attempted.
- New commit and GitHub push: none.
- Netlify deployment: none.
- Authenticated post-release production tests: not performed because no release occurred.
- Live URL: `https://sat-chi.netlify.app`; existing version and normal access remain unchanged. Access was never restricted, so no reopening was needed.

## Requirements to resume

1. Establish a recoverable database backup with a documented restoration path, including the database structures and student/Auth/progress data needed for recovery; rehearse restoration in isolation. A backup inventory response without a usable restore point is insufficient.
2. Implement and test database/API maintenance gating for all relevant mutation paths, including saves, Check, finish, heartbeat, administration and background writers. Record exact ACL restoration if using revocation. Account for migration grants restoring permissions.
3. Establish a verified old-client drain or server-enforced client-version admission procedure before reopening. Preserve unresolved pending answers rather than forcing loss through reload.
4. Repeat preflight and follow the approved coordinated sequence in `migration-compatibility-release-plan.md`: gate writes, apply080001→080002→080003→080004, publish the matching frontend while closed, perform authorized disposable authenticated verification, and reopen only on success.

Recommendation: **NO-GO until both failed safeguards are satisfied.** Do not apply migrations or publish the new frontend independently.
