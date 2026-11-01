# Production release — Premium interface and Battles 2

The user authorized pushing/deploying the local sprint on 2026-11-01. That authorization supersedes the earlier local-only restriction. Release code: `e0c25f6ec42fd69c284346300bab4426fe86a602`, integrated by fast-forward into `main` and pushed with `feature/premium-battles-2`.

## Production database

- Correct project: `ileffhbbaomfimwulvpw`.
- Applied only `20261101000100_battle_competition.sql`. Migration history: **107**, latest **20261101000100**.
- Created a fresh **43,668,250-byte** private database archive because the older verified archive predated the SBank import. Checksums verified; restored successfully in socket-only disposable PostgreSQL 17. Rehearsed this exact migration against that restored snapshot.
- All **66 protected table fingerprints matched** across production migration, excluding only the additive `battles.scoring_version` field and the existing derived standings cache. Existing questions, SBank records, Books, Homework, grades, attempts, accounts and Storage metadata remain intact.
- Historical rooms retain scoring version 1 and original scores; new rooms use version 2. No score/answer history was rewritten. Maintenance ended and compatible access was restored, with schema reload requested.
- Database backup, restore evidence, migration hash/log and before/after fingerprints remain outside Git at `/home/otabek/satchi-release-backups/premium-battles-20261101/`. Transfer used TLS with Supabase CA and hostname validation. The archive contains Storage metadata, not object bytes; this release changed no Storage objects.
- Authentication/Google provider configuration and existing Edge Functions were not deployed or reconfigured.

## Hosting verification

Both production domains serve the verified release:

- https://sat-chi.netlify.app
- https://satchi.vercel.app

Provider commit/status evidence plus live JS/runtime/CSS byte comparisons are retained in private `final-host-verification.json`. Entry `/assets/index-B2M-uDrz.js` has SHA256 `2b196cbfc388f562829f91f4fc4ae8d09b93b6243e6a62d181faaac7dc789e2c`. This report-only follow-up does not change frontend artifacts; final hosting confirmation records its exact published commit after the follow-up build.

## Actual live checks

**18 authenticated browser checks passed** across both domains, with **zero page errors and zero failed API/asset requests**:

- New public landing and Franz Hermann footer destination.
- Personalized Dashboard and Simply Lovely signature.
- Published Books catalog, Homework, Progress, Battles hub and dedicated Battle leaderboard.
- Actual SBank Math **1,922** and Reading & Writing **1,844** counts, practice controls and source retention after refresh.
- Leaderboard period switching, light/dark themes and 390/768/1366/1920px widths without horizontal overflow on the checked source page.

Direct authenticated production calls passed for `battle_action`, all three `battle_leaderboard` periods, `progress_activity`, `daily_homework_directory`, `homework_management_directory`, saved metrics and both SBank pools. No missing-RPC/schema-cache or statement-timeout failure occurred. Disposable student's saved attempted/first-result/eventually-correct metrics were equal before and after the walkthrough.

Only the two existing, tagged disposable verification profiles were temporarily activated. Their sessions were revoked and profiles returned inactive after verification; their accounts/history are retained. No real student was used for test writes. Read-only live checks complement the previously passed isolated two-browser timed scoring/reconnect/results test, SQL authorization/team/tie tests and 30-capture visual review; no new live multiplayer match or Homework deletion was performed merely to repeat those tests.

See [implementation and local tests](premium-battles-2.md) and [visual QA](premium-battles-visual-review.md) for scope and remaining limits (top-100 standings, no automatic rematch and no physical-laptop frame-time benchmark). Production checks do not certify every deep editor, game format or animation frame.
