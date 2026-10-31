# Whole-match Battle timing

Migration `20261031000800_battle_match_timers.sql` adds `total_seconds` (zero or
30–3600) and a nullable `match_deadline`. Existing rooms receive zero/null; no
historical scores, questions, responses or timing estimates are backfilled.
It depends on the established Battle state machine and lobby controls.

At Start, the database freezes the question set and sets the match deadline to
the five-second countdown deadline plus the selected total budget. Each active
round is capped by that deadline, including otherwise untimed questions.
After expiry, the next authorized RPC finalizes the saved match. There is no
background scheduler: a disconnected lobby is reconciled using its original
deadline on reconnect, rather than receiving a new budget. A failed late answer
does not add an answer or points; a following state read persists the transition.
Missed countdowns also no longer grant a fresh full timed round on reconnect.

Only saved correct answers earn 100 points. Unanswered/wrong items earn zero.
Finished history still contains the entire frozen set and each participant's
actual saved response/grade. Existing answer retries remain idempotent, including
after the match has finished. No practice/Homework grade or XP is changed.

The create form and host controls offer a whole-match limit independently of
per-question timing. Zero per-question time plus a total budget provides one
shared match timer; zero for both provides friendly untimed questions (subject
to the existing two-hour room expiry). Host changes require lobby state and
reset readiness. Display timers use the latest server timestamp and a monotonic
elapsed clock between snapshots. Display values are approximate by network
latency; the database's deadline decides whether an answer is accepted.

Verification:

- **2/2 SQL tests passed**: exact budget after countdown, per-round clamp,
  client timestamp/deadline spoof rejection, retained earned scores, zero for
  unanswered items, replay identity, unchanged history, missed countdowns,
  untimed questions with a total budget and invalid budget bounds.
- **1/1 actual service/network test passed**: a real 30-second budget expires
  naturally after the five-second countdown. No SQL clock manipulation. One
  saved correct answer earns 100, a late second-client answer is rejected,
  untouched questions score zero, the final history persists and the database
  contains exactly one answer. Real Auth/PostgREST plus the official services.
- **1/1 official-service browser check passed**, including an actual 120-second
  saved host setting, a match timer that decreases between snapshots, two
  browsers, offline/reload recovery and final persisted scores.
- **1/1 default native browser regression passed** with the original
  PostgreSQL/PostgREST/Auth setup and documented Storage/Node substitutes. This
  protects the existing lighter development mode. Light/reduced-motion captures
  from this run are in `screenshots/native-timer/`.

Command: `npm run test:battles:timer`. Run heavy browser/database suites serially.
These changes remain local/pending a separately authorized release. Removing the
UI is reversible; do not drop columns while the patched functions refer to them.
