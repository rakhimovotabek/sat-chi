# Scoped production release — verification blocked

2026-10-08. The four database migrations and matching frontend were deployed. **The release is incomplete and normal application writes remain blocked.** Actual production Book loading and practice startup failed with PostgreSQL statement timeouts. Do not describe the site as fully verified or reopen writes yet.

## Storage conclusion

A global Storage freeze is unnecessary for these four migrations under the application-scoped recovery strategy in [storage-independent-release-plan.md](storage-independent-release-plan.md). All four SQL files were inspected. 080001–080003 change application data/functions/policies, without Storage writes. 080004 changes `public.can_read_book_package_asset(text)`, a read authorization helper; it does not change object bytes, paths, buckets or Storage metadata.

The real PostgreSQL17 cutover test allowed an independent connection to commit Storage metadata inserts throughout migration execution. Existing application history and asset mappings remained intact. Targeted recovery preserved new uploads and increased the answer revision rather than resetting it. This establishes database independence; it does not pretend to freeze the managed Storage service. Production Storage security and existing objects were not changed.

Affected application writes were gated, new Auth signup temporarily disabled, and the guarded account-management endpoint verified. Previously admitted application transactions were drained before the fresh backup. Storage remained operational by design.

## Backup and preservation

The fresh backup is outside Git at `/home/otabek/satchi-release-backups/20261008T182909Z` with restricted permissions. Its checksummed archive and password-free role definitions were restored into isolated PostgreSQL17. The four migrations were rehearsed there. Coverage includes application schema/data, Auth and Storage metadata, migration history and gate state.

The snapshot contained 24 Auth users, 7,572 questions, 3,879 practice items and 17,489 Storage objects. All 17,489 snapshot object copies were verified using snapshot size/ETag and retained SHA256, totaling 341,995,581 bytes. Credentials, inventories, student records and copied files are not in Git.

All 47 protected pre-existing application tables matched canonical row counts/hashes immediately before and after the production migrations. Comparisons exclude only the explicitly added `answer_revision`/`open_key` fields and the derived eligibility cache. Storage metadata was unchanged by the rehearsed migrations. Canonical hashing uses UTC to avoid false timestamp differences between production and local PostgreSQL.

After browser testing, 46 protected tables still matched. The sole difference was `study_plan_tasks`: the authorized student fixture's dashboard called `refresh_study_plan`, replacing 52 future unstarted/uncompleted tasks with 52 unstarted/uncompleted tasks; total rows remained 59. Archive comparison confirmed both sides belong exclusively to that fixture. No completed or started tasks were removed by this delta. No cleanup or restoration overwrote these tasks. Answers, grades, completed Homework history and mappings remained unchanged.

Recovery remains application-scoped: keep admission closed, prefer forward repair, and reconcile specific application rows from the isolated restored copy while preserving revisions and subsequent independent uploads. Do not restore old Auth/Storage metadata over the live project or blindly drop/recreate `public`. A native PostgreSQL restore is not a recreation of Supabase managed services.

## Applied and published artifacts

| Item | Verified result |
| --- | --- |
| Supabase project | `ileffhbbaomfimwulvpw`, PostgreSQL17.11 |
| `20261008000100_homework_lifecycle.sql` | Applied; migration history verified |
| `20261008000200_practice_answer_integrity.sql` | Applied; migration history verified |
| `20261008000300_admin_open_response_review.sql` | Applied; migration history verified |
| `20261008000400_homework_snapshot_assets.sql` | Applied; migration history verified |
| GitHub | `rakhimovotabek/sat-chi`, `main`, pushed successfully |
| Application commit | `f621312404ed8ad4a31cc6c2bd27ce997b837415` |
| Netlify | Site `sat-chi`; matching deploy `6ac7e47ca05997000886571b` ready and published |
| Production | https://sat-chi.netlify.app |
| Published application asset | `/assets/index-BYg1Y5nP.js`; current client marker verified |

Migration CLI execution succeeded in the documented dependency order. No failed migration was skipped or manually marked applied. All previously completed intended changes were preserved and committed; credentials, backups and temporary files were excluded.

## Verification

Local build and scoped lint passed. The release runs included 26 gate/concurrency/outbox/legacy regression checks, 34 Homework/practice/manual-review database checks, one Storage-independent cutover test and one fresh backup restore test: **62 passed, zero skipped in those runs**. These are not claims of hosted workflow success.

Actual authenticated Chromium tests against the published production site passed:

- Authorized admin and student login.
- Question Bank loading and difficulty filtering.

The browser then encountered HTTP500 from the Book catalog request and `start_book_practice`. The latter returned `57014`, `canceling statement due to statement timeout`. The authenticated role has `statement_timeout=8s`. A selected leaf topic had only two direct questions and no child topics; practice startup still timed out. No JavaScript exception was recorded. The failed request did not persist a practice session or items.

The Book catalog requests nested `book_topics(questions(count))` under student authorization. Existing `start_book_practice` evaluates question eligibility/approval helpers; these legacy Book paths were not replaced by the four migrations. The precise expensive execution plan has not yet been established. Do not claim a confirmed missing index, Storage failure or fixed Book performance without measuring these paths.

The smoke sequence stopped at this critical failure. Hosted Book Check/save/reload, Homework creation/editing/direct/group/recurring delivery, completion, manual grading and images/explanations were **not verified in this release run**. No disposable Homework/group/template fixture was created before the stop. Local regression success does not substitute for those checks.

## Current production state and next step

- Server gate: `maintenance`, zero verification-user exemptions, independently rechecked.
- New Auth signup: `disable_signup=true`, independently rechecked; original setting is saved privately.
- Account-management guard remains active.
- Storage remains operational with existing security policies.
- Normal application writes have **not** been restored. Authentication/read routes that do not require gated POST requests can still work; many application RPC reads are POST and are also gated.

Investigate the Book catalog and startup plans using the full restored production dataset and student authorization in isolated PostgreSQL17. Rehearse a narrowly scoped correction and rerun the actual production smoke suite with only authorized fixture exemptions. Do not raise/disable timeouts, bypass the gate, weaken approval checks, or deploy an incompatible old frontend as a shortcut.

After all critical smoke checks pass, use the documented `compatible` mode reopening and restore the saved Auth signup configuration. Recheck revision-aware saves and legacy rejection. **Do not use gate `off` after080002.** Until then, the application/database artifacts are deployed, but the coordinated release is not complete.

Operator evidence is private under `/home/otabek/satchi-release-backups/scoped-release-20261008T182333Z`, including backup confirmation, migration output, row-integrity comparisons, publication metadata, browser diagnostics, study-plan delta confirmation and final admission state. This report is local release documentation written after the published application commit.
