# Production release checkpoint — blocked before cutover

The coordinated production release is authorized, but its backup/recovery gate has not passed. No production migration, Git push/main integration or deployment was performed. Earlier no-deployment instructions in historical sprint notes are superseded by the release authorization; data-protection restrictions remain.

## Verified current state

- Candidate: `d4b6791f739a6b5b6dec3e50a5ba6b14e402151d`, branch `feature/universal-book-import`; checkout initially clean.
- Remote `main`: `780eb954fce79150a1538a0b994b9f72b5db621a`. Read-only remote inspection found no published feature branch.
- Correct Supabase: `ileffhbbaomfimwulvpw` (Satchi), PostgreSQL17.11, healthy. Fresh migration listing:82 applied, latest `20261015000800`;20 pending.
- Netlify: https://sat-chi.netlify.app — HTTP200.
- Vercel: https://satchi.vercel.app — HTTP200.
- Both currently serve `/assets/index-CNX8Hupg.js`, SHA256 `6b34e1b923a56b1b7780e8ce7ec61f4ffc4a27394f86fd0ace642dcc77f58cbb`, and target the expected Supabase host. This establishes matching existing entry assets, not deployment of the candidate or independent identification of the current aliased provider commit.
- GitHub records a successful Vercel status for remote main; this is historical status evidence, not proof that a new candidate was deployed. Hosting credentials/project deployment settings were not changed.

## Completed backup export and blocker

The interrupted export completed. Reuse `/home/otabek/satchi-release-backups/final-release-20261031/20261031T135451Z`; do not restart the export unnecessarily. It is private, outside Git, and contains:

- `application.dump`:32,184,094 bytes; public/Auth/Storage metadata/migration/release schemas.
- `roles.sql`:6,260 bytes; role passwords intentionally excluded.
- `export-manifest.json`, private operator logs and `final-release-checkpoint.json`.

Both recorded SHA256 checksums were independently recomputed and matched. Provider backup listing returned `backups:null`, `pitr_enabled:false`; the earlier documented local backup directory was initially absent. No recent provider recovery point was established.

The checksum-verified archive is **not yet restore-verified**. The socket-only isolated PostgreSQL17 rehearsal stopped during restore preparation because `uuid-ossp.control`/its module are absent in the cached runtime. The rehearsal also requires matching `pgcrypto` and `ltree` modules. It stopped before restoring application data or rehearsing any pending migration, and its isolated server shut down cleanly. No unsupported-extension stubs, skipped errors or weakened restore checks were used. Storage object bytes are separate from this database export.

## Exact pending migrations

| Migration file | SHA256 |
| --- | --- |
| `20261030000100_universal_book_jobs.sql` | `05d895a674afd964577c85eb04f1d68be5a67cb2a957b14b3b361706f949af5d` |
| `20261030000200_battles.sql` | `59382ddb3d394a8b05771ad3aa3d54126389b2cd13c3eb6468d98d0f32452a8f` |
| `20261030000300_sat_numeric_responses.sql` | `56ff7dd310fc9c34a59f87a8509830b776593e6702594fc6df1b022feffa7569` |
| `20261030000400_book_lifecycle_and_corrections.sql` | `1ae7d10cc6365f955927810dcf3ce1825249bd19b7eb38125d3e9dae6127edcb` |
| `20261030000500_vocabulary_battles.sql` | `101515b5adfa5cfb42c55ebc9f5cb53bba7e370749d0fc7465b92aa25c8e2738` |
| `20261030000600_battle_realtime_signals.sql` | `048c933c27929041fda246371e936e467e85713df318e3709b2629a1d9b923f5` |
| `20261031000100_import_job_ownership.sql` | `f36788e95b11706e97bd397c15b6b284e6375c2da0fcd2daa971f5e58a7cd2ab` |
| `20261031000200_battle_answer_privacy_and_pool.sql` | `861e74c1081dfb80f5051e8b0af61e380313346a549d796f4428223a42f3aef5` |
| `20261031000300_progress_activity.sql` | `893ed76126bdffad51c298f0ba078790408feba0f03fe27eb294f941273c75b0` |
| `20261031000400_universal_correction_audit.sql` | `0a1bebb1fe1aee24faa1d2e5d13eab320df5a00567f3d6feb29ff3335837e143` |
| `20261031000500_battle_typed_vocabulary.sql` | `6b74d828c9796a04eeb588cb38cc6e3fae6808b2131e6a93df1e3f639915e30d` |
| `20261031000600_homework_question_performance.sql` | `5273cb0092d927aacd5f4e66f2b047794c985f4f13f6285f6650aefd9ec7e37c` |
| `20261031000700_battle_lobby_controls.sql` | `48e218a94301dce2e3c52e5cf768a37fd1b6cee91e25d0278c962b6f8f737941` |
| `20261031000800_battle_match_timers.sql` | `59db4a23abb25a067365fca9f61d9c06309b03fe7a784d1fd22123b8b404ce07` |
| `20261031000900_battle_pool_parity.sql` | `38f33716277bb117455af9af40c01ae939ace9cfda03ff795d990c37089bcacf` |
| `20261031001000_battle_word_matching.sql` | `c78234943c9789ceef5cc530a7cd46dc3853d28079f51723166e67fef186eb06` |
| `20261031001100_battle_quick_match.sql` | `f41b151a645e3da43474988ed31135146bd27bfdb90c2e23fad58fedbba1e38c` |
| `20261031001200_daily_homework_query_bounds.sql` | `9e90411539926a9e6201849a6485aaf5d1de292d9e269eade91dc787fc1ee778` |
| `20261031001300_book_progress_readability_cache.sql` | `2c0776a7e94056eb2854a9bf5b4bf39649ab3ffbf35ce4ff5ca45e29bde7316a` |
| `20261031001400_safe_homework_deletion.sql` | `eda2c6ee2c9ff946ae2bf251918a9b2861aeb2971c2efb1d049d6d69eb07b022` |

Key dependencies: `battle_action` starts in `20261030000200` with later Battle amendments; `progress_activity` is `20261031000300`; bounded Daily Homework is `20261031001200`; Book renderability/progress cache is `20261031001300`; `homework_management_directory` and history-preserving Delete are `20261031001400`. These remain pending, not applied or marked applied.

## Resume safely

1. Supply genuine PostgreSQL17 contrib modules in the isolated runtime. Resume verification against the existing archive using the private `rehearsal-operator.py`; do not run the older repository rehearsal unchanged, since it targets a different eight-migration release.
2. Complete real restore,20-migration compatibility rehearsal, protected-record/Auth/Storage-metadata comparisons and focused RPC checks. Keep restored student data socket-only/private; do not expose it through an app HTTP server.
3. Establish the required production write-admission/integrity baseline, then apply only the reviewed pending versions in dependency order. Do not reset, repair migration history to bypass errors, disable RLS or waive recovery checks.
4. Only after backend readiness, safely push/integrate the verified feature into main and publish the same verified revision on both existing hosting projects. Confirm provider commit metadata and actual live assets.
5. Run focused authenticated production checks for Books, Homework, Progress, Battles, Question Bank/SBank and deletion/history using safely isolated verification records. Do not delete or overwrite existing student accounts, answers or grades.

Authenticated checks of the **new production release**, new Homework Delete preservation and post-migration row-integrity checks were not performed because no cutover occurred. Previous isolated tests remain valid development evidence, not production-release success. No production student/account/answer records were modified by this attempt. No broad test suites were rerun.
