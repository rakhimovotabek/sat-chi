# Production release checkpoint — backend applied; frontend publishing

The coordinated production release is authorized. The existing backup was restored successfully, all 20 pending migrations were rehearsed and applied to production, and protected data checks passed. Frontend publishing and live authenticated acceptance are the remaining steps at this checkpoint.

## Recovery and production database verification

- Project: `ileffhbbaomfimwulvpw` (Satchi), PostgreSQL 17.11.
- Reused the existing 32,184,094-byte archive in the private `20261031T135451Z` release directory; its recorded checksum still matches. No second backup was created.
- Built matching PostgreSQL 17.11 contrib modules (`uuid-ossp`, `pgcrypto`, `ltree`) in the disposable runtime; the server binary was unchanged.
- Restored the actual archive into a socket-only isolated database. Rehearsed all 20 migrations without skipping restore errors, changing RLS or using migration-history repair.
- Rehearsal preserved original records across 52 application tables, Auth users and Storage metadata. Derived standings reconciled. Focused production-sized probes passed: metrics 1.104s, practice analytics 0.289s, book catalog progress 0.352s, bank facets 0.123s, admin student books 0.965s, largest book snapshot 2.129s. These are rehearsal timings, not live guarantees.
- Production cutover completed at `2026-10-31T15:29:51Z`: migration history now contains 102 versions, latest `20261031001400`.
- All 54 protected table fingerprints (52 application tables, Auth users, Storage metadata) matched before/after migration after excluding newly added fields. No existing record mismatch was found.
- Authenticated execution and exact signatures were verified for `battle_action`, `progress_activity`, `homework_management_directory`, `learning_book_progress`, and `delete_homework`; anonymous execution is denied. PostgREST schema reload requested.
- Existing write gate restored to `compatible` with zero exemptions. Google provider remained enabled; authentication configuration was not changed.
- Private evidence: `platform-restoration-verification.json`, `production-cutover-result.json`, before/after integrity snapshots and operator logs, all outside Git. The database archive includes Storage metadata, not object bytes; no Storage object changes were made.

## Applied migration sequence

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

All versions above were applied through the official linked-project migration command after checking that their hashes matched the successful rehearsal. No destructive reset, seed, role replacement, Vault mutation or history repair was used.

## Frontend release state

- Application source remains the previously verified `d4b6791` lineage; changes since then are release documentation only.
- Netlify account access and ownership of site `02da050d-7e57-45c4-bb83-5de0660fbbf6` confirmed. Its Git source is `rakhimovotabek/sat-chi`, branch `main`.
- Targets: https://sat-chi.netlify.app and https://satchi.vercel.app.
- Before publishing, both still served the older `780eb95` release. Do not interpret backend readiness as proof that the new frontend is live.
- Remaining: fast-forward integration/push, production build/deployment checks on both hosts, focused authenticated Books/Progress/Homework/Battles/SBank checks, fixture-only deletion/history verification, theme and saved-progress checks. Use only newly created, tagged verification accounts; preserve all existing student records.
