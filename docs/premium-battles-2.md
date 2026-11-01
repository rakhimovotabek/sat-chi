> Released with user authorization on 2026-11-01. See [production release report](production-release-20261101.md). The local-only language below records the original development boundary and is superseded for this completed release.

# Premium interface and Battles 2 — local development

Base: production `da06e30`. Branch: `feature/premium-battles-2`.
No push, deployment, hosted migration or production/student-content write is authorized in this sprint. All database tests use disposable local databases. SBank's 3,766 published questions are unchanged.

## Implemented

- Replaced the public landing page with a large editorial hero, six-feature interactive showcase, varied practice/progress/competition sections and a purposeful final call to action. Preview copy describes real product capabilities; it displays no invented student statistics or testimonials.
- Extended the existing Manrope/blue/white/navy system with short entrance/feedback tokens, softer feature surfaces and rounded learning controls. No new animation dependency, WebGL, video or continuous decoration.
- Centralized `CREATOR_PORTFOLIO_URL = "/dashboard"` and a shared **Made by Franz Hermann** component in the public and authenticated footers. Internal router navigation retains authentication protection.
- Personalized Dashboard welcome, intentional **Simply Lovely!** signature, and real saved daily questions/streak counters. Existing Progress counters, rings, charts, heatmaps and reduced-motion behavior remain intact.
- Battles: privacy-safe profile names and initials throughout scoreboards, host controls and standings; duplicate visible names are distinguished with short stable ID suffixes. Invitation codes, team controls, ready/away states and existing reconnect logic remain. Rounded lobby surfaces, point counters, short score feedback, explicit scoring instructions, final player summaries, accuracy/speed bonuses and team-aware/tied result headings.
- Working dedicated `/battles/leaderboard` route plus rankings in the Battle hub; all-time/week/month filters, actual saved scores, wins/losses/draws, win rate, accuracy and current-user highlighting. No fake podium or rank-change animation.
- Library count pills/focus treatment, source-selector target sizing, Vocabulary selection surfaces and Homework focus treatment build on the prior complete student-page design pass. Existing practice, source selection and safe Homework deletion behavior are preserved.

## Narrow backend migration — local only

`20261101000100_battle_competition.sql` adds `battles.scoring_version`. Existing rooms remain version 1 with their previous scores; new rooms default to version 2. No historical scores/answers/grades are rewritten.

One central server function calculates correct answers as 100 plus `floor(50 × remaining seconds / configured round seconds)`, clamped to 0–50 bonus. Incorrect/unanswered earn zero. Untimed rounds receive 100 for correct answers, even with a whole-match budget. A shortened whole-match deadline caps remaining time without increasing the configured round duration. The existing locked state machine enforces deadlines, uniqueness and answer locking; the accepted timestamp is stored explicitly from its server clock after the room lock. Client timestamp/points fields have no authority. Battle points do not affect academic accuracy or study XP.

The public RPC wraps the existing authenticated state machine and enriches only safe profile identities and finalized results. Its underlying implementation and score/name helpers are not callable by anonymous/authenticated clients. Current-round points remain hidden while a round is playing.

Leaderboard results are derived from persisted server answers/members, with no client result-submission endpoint. Primary ranking: total Battle points, equal points share dense rank. Wins use player score or aggregated team score; tied opponents produce draws. Cancelled/expired/lobby matches are excluded. To exclude abandonment conservatively, every participant must have submitted the final question of a finished match. This deliberately excludes even legitimate timeout finishes lacking those submissions. Periods use UTC calendar boundaries against match creation date. Rankings return up to 100 players; current-user highlighting applies when present in that list.

## Verification

- Focused SQL Battle 2 tests: 2 passed, including exact score formula boundaries, faster/slower accepted submissions, duplicate answer locking, point privacy, name privacy, persisted rankings, authorization, untimed scoring, team wins, draws and abandoned/cancelled exclusion.
- Combined Battle SQL regression run: 10 passed (9 legacy cases plus the first new competition case) (legacy privacy/idempotency, lobby controls/presence, match deadlines, 2v2/3v3/20-player totals, vocabulary and invalid pools). Timed historical fixtures explicitly select scoring version 1; new version 2 behavior has separate tests.
- Native PostgreSQL/PostgREST/real Auth: two disposable authenticated clients and two Chromium contexts completed an actual timed match. UI submission timing changed scores; reload/reconnect retained two participants and exact scores, duplicate submission did not add points, final results persisted and appeared in real standings. Passed. This run used polling fallback, not a new official Realtime outage matrix.
- Focused browser run: 18 passed, comprising 9 new interface checks, 7 SBank/source/save regressions and 2 saved-value motion cases (normal and reduced motion).
- Corrected final visual capture run: 9 passed. Landing, Battle hub and arena at 390/768/1366/1920 in both themes; final result captures, long player names, no horizontal overflow, footer and Dashboard signature. Captures explicitly verify the theme and settle counters with reduced motion. Browser fixtures are test data, not product statistics.
- Additional preservation checks: Books topic practice save/mark/resume/grade/review passed 1/1; Homework save/resume/completion and Dashboard daily completion passed 2/2. The Books mock needed its existing production-default `bank_source: "satchi"` field; no Books application logic changed.
- Lint and production build passed. Baseline app entry remains approximately 500 kB uncompressed / 145 kB gzip; no animation library was added. No physical 4 GB laptop frame-time benchmark is claimed.

Independent visual review: **ship**, scoped to 30 final captures and reviewed source. The corrected Dashboard/results captures passed the focused follow-up. [Review findings](premium-battles-visual-review.md). Captures are retained locally under `.impeccable/review/premium-*`; they are not shipped as product assets. Test logs are `/tmp/premium-*.log`.

## Scope and remaining limits

This extends the prior student/admin design system rather than replacing every deep editor/practice state. No automatic rematch backend was added. Leaderboard pagination beyond 100, genuine rank-history movement, broader physical-device performance measurements, and a fresh Realtime network-loss matrix remain future work. The pre-existing Impeccable JSON sidecar was left unchanged; DESIGN.md documents this extension, while sidecar extension metadata remains stale. The four references informed composition and color; no screenshot data was copied.

Start locally with `npm run dev:isolated`, using its generated disposable accounts and URL. Inspect `/`, Dashboard, `/battles`, `/battles/leaderboard`, Progress, and the SBank selector first. Ordinary `npm run dev` still reads the local environment; do not use hosted credentials to exercise this unpublished migration.

## Local milestones

- `52d9751` — Landing replacement, creator footer and personalized study surfaces.
- `ac02f71` — Battle identities, scoring, persisted leaderboard, routes and focused tests.
- The following checkpoint commit records visual review, design documentation and explicit reduced-motion suppression for the final control transitions.
