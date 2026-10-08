# Local bugs repair checkpoint — paused at user request, 2026-10-08

Historical checkpoint. Work has resumed; see `local-reproduced-bugs-report.md` for subsequent verification and current status.

Work is incomplete. Resume this task, not the previous whole-platform audit. Preserve all current uncommitted Phase 1/2 changes. Do not deploy, push, or apply linked/production migrations without explicit approval.

## Confirmed causes

- Linked Supabase lacks `save_practice_changes(p_session uuid,p_changes jsonb)`. Local migration `20261008000200_practice_answer_integrity.sql` defines exactly that signature. Hosted migration history stops before the four pending 20261008 migrations. This is an unapplied migration, not evidence of an obsolete frontend signature or merely stale schema cache.
- Linked `bank_candidate_ids` rejects the `assignment` filter needed by the pending lifecycle repair. The frontend sends `assignment:true` deliberately to avoid selecting unusable questions. Pending migration 080001 supplies the compatible contract. Separately, seven selected questions cannot supply eight daily questions: preserve that legitimate validation.
- SATakror question 100 v2 (`e5e3ef38-b5de-5efc-a0eb-a4391fd175a0`) and question 13 v1 (`0c3530cb-2955-5db8-a472-7014f368237d`) both have actual PNG objects in Storage. q100 is currently not approved/ready; q13 is approved/ready. Hosted asset policy permits frozen owned book/bank snapshots but omits homework snapshots. Do not reimport assets or approve source questions to bypass this.
- Read-only aggregate snapshot inspection established both screenshot questions occur in sessions with kind `homework` and title `SATakror`. Homework finalization is different from Book Practice Check. The existing Book/Bank player already has Check; its real browser regression is still unfinished.

## Current scoped source edits

- `src/features/books/api.js`: map PGRST202 to an explicit server-update error, preserve pending draft and failure status; no legacy unversioned save fallback and no fabricated acknowledgement.
- `src/features/learning/api.js`: new `assignmentBank` diagnoses Invalid filters by probing the otherwise identical filter without assignment. A successful diagnostic results in an explicit server-update error, never returning the broader legacy admin question pool.
- `src/features/learning/QuestionPicker.jsx`: use assignmentBank; preserve selections.
- `src/features/player/Player.jsx`: homework final action says Submit homework; Book/Bank Check behavior unchanged.
- New local migration `20261008000400_homework_snapshot_assets.sql`: extend frozen asset access to homework with `can_access_homework_session` authorization, keeping source approval and explanation gating. Not applied remotely. Review/test thoroughly before approval.
- New experimental test helper `tests/helpers/native-app-environment.js` and `tests/native-app-workflows.test.js`: native PostgreSQL 18 + actual PostgREST 16.4 + Vite + Playwright. Auth and Storage HTTP transport are synthetic fixture services; Storage authorization is executed against actual PostgreSQL RLS. No intercepted/canned application RPCs. These files still need debugging, formatting and scoped lint.

## Actual hosted browser checks performed

The user explicitly authorized use of the supplied existing admin/student accounts and test-related writes. Credentials are in ignored mode-0600 `.env.e2e.local` (JSON, do not print). `.env.local` contains the authorized publishable frontend configuration; never put secret/service keys in Vite variables.

Actual Vite connected to linked Supabase, actual hosted Auth/REST/Storage:

1. Both account sign-ins worked.
2. A clearly labeled disposable one-question assignment created through authenticated admin RPC appeared in the student's actual Homework page.
3. Selecting an answer produced actual HTTP404/PGRST202 save failure; UI showed Save failed and server-update message, not All changes saved.
4. Reload recovered the unsaved local answer and kept Save failed. This is draft recovery, NOT successful backend persistence.
5. Fresh hosted signed URL request for q100 failed: Storage HTTP400, SDK statusCode404; q13 signing and actual signed-object fetch returned200. Objects exist according to read-only linked SQL. Do not describe q100 hosted response as HTTP403.
6. Actual assignment filter RPC returned HTTP400/P0001 Invalid filters.
7. Actual admin editor displayed explicit server-update diagnostic.
8. No frontend page exceptions in the successful hosted run. Expected failed Network requests were recorded.

All created hosted test data has been removed. Exact-ID + exact disposable-title guarded cleanup removed ONLY the new homework and its new session. Linked verification returned `disposable_homework_remaining:0`, `disposable_session_remaining:0`. No existing accounts, answers, books or assets were changed. No migrations/deploy/push performed.

Evidence in `/tmp` (may disappear between machines/reboots):

- `/tmp/satchi-hosted-browser-results.json` and `.log`: successful hosted run.
- `/tmp/satchi-hosted-browser.mjs`: one-off actual browser script, currently reuses the now-deleted disposable fixture ID; DO NOT rerun unchanged.
- `/tmp/satchi-cleanup-disposable.json`: verified cleanup.
- `/tmp/satchi-screenshot-catalog.json`, `/tmp/satchi-screenshot-assets.json`: read-only linked schema/source/Storage evidence.
- `/tmp/satchi-native-workflows.log`: latest isolated regression run.

## Latest isolated regression state — not green

Latest run: baseline reproduction subtest passed. The remaining three subtests failed; parent counted as failed (Node reports 1 pass/4 fail including parent).

- Recovery subtest reached successful UI retry and image retry but failed parsing a SQL query returning empty/NULL (`Unexpected end of JSON input`, test line69). Investigate the actual selected item/current position and persistence, not merely the JSON parser. No successful full persistence claim yet.
- Recurring pool subtest previously saved 8-question and 7-question configurations in an earlier run, but latest final reopening timed out. Investigate race/fixture consistency; do not claim stable pass.
- Book Practice subtest latest timed out at Start topic practice. Earlier run exercised wrong feedback, explanation and correct feedback, but reload verification failed. Need resolve fixture/navigation/possible genuine behavior before reporting success.
- Native fixture source import job insertion repopulates review items: q100-equivalent review removal must happen after creating the fixture import job. Helper now does that. All data is synthetic and removed at teardown.

No scoped lint, formatting or build has been completed for these latest edits yet. No final repair report yet.

## Resume commands/environment

Node: `/tmp/node-v22.16.0-linux-x64/bin`; native PG binaries: `/tmp/satchi-postgres18/usr/bin`; libraries: `/tmp/satchi-postgres18/usr/lib`; PostgREST: `/tmp/satchi-postgrest/postgrest`.

```
PATH=/tmp/node-v22.16.0-linux-x64/bin:$PATH \
LD_LIBRARY_PATH=/tmp/satchi-postgres18/usr/lib \
SATCHI_TEST_POSTGRES_BIN=/tmp/satchi-postgres18/usr/bin \
SATCHI_TEST_POSTGREST=/tmp/satchi-postgrest/postgrest \
node --test tests/native-app-workflows.test.js
```

Then add/finish focused negative asset authorization and MCQ/open-response recovery regressions, run relevant existing tests and scoped lint. Only claim hosted persistence/filter/image repairs after approved migrations and actual hosted verification. Pending migrations: 080001 lifecycle, 080002 integrity, 080003 admin review, 080004 homework snapshot assets. Keep the final report separated into fixed locally / blocked migrations / still broken / manual review.
