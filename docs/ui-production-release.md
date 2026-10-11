# UI/reporting production release — 2026-10-11

Source includes verified local commits through `2f0539d`: admin Homework results, consistent all-mode standings, Night Light, compact shared tools/header, independent Reference Sheet, draggable/resizable Desmos and preserved question/image DOM.

Authorized target: Supabase `ileffhbbaomfimwulvpw`, GitHub `rakhimovotabek/sat-chi/main`, Netlify `02da050d-7e57-45c4-bb83-5de0660fbbf6`, https://sat-chi.netlify.app.

The owner explicitly waived a fresh backup during execution. Its incomplete export was stopped and is not a verified recovery archive. The existing restored October 9 backup remains available; recovery must preserve subsequent live student progress rather than blindly restoring that older snapshot. Private prior function definitions and a fresh source-row integrity baseline are retained outside Git.

The existing maintenance gate rejected legacy/current saves, direct REST mutations and the account-management Edge writer with HTTP503. Signup was temporarily paused. No cron writer or other deployed Edge writer was found. Storage remained independent; neither migration modifies Storage or source learning records.

Applied only `20261011000100_admin_homework_results.sql` then `20261011000200_consistent_learning_standings.sql` through the linked CLI. All 51 existing application tables retained identical counts and row digests. The new private cache backfilled 22 students and denies authenticated direct SELECT. Existing migration history was not replayed.

Scoped lint/build and focused local Chromium/PostgreSQL/Desmos regression passed before release. Production publication and focused authenticated verification are in progress; maintenance stays active until those pass. Execution evidence and disposable fixture IDs reside privately in `/home/otabek/satchi-release-backups/ui-release-20261011`.
