# Battle lobby controls

`20261031000700_battle_lobby_controls.sql` is additive and pending release.
Apply after all existing Battle/Realtime/Vocabulary migrations, only to a
disposable copy until a separate release is authorized.

The authenticated `battle_lobby_control(action, data)` RPC locks the same room
row as `battle_action`. It requires the active host, an unexpired lobby and a
bounded request. It reuses the authenticated state limiter. Supported actions:

- `swap`: exchange two existing players on different teams. Team sizes are
  preserved. This cannot modify an active or finished match.
- `settings`: change question count, per-question time and public discovery.
  Database bounds and the same published/approved pool eligibility are enforced;
  an impossible change rolls back atomically. Category, source filters and lobby
  format remain those selected at creation.
- `kick`: remove another member and prevent that member from rejoining this
  lobby. The host cannot kick themselves. Exclusions are private and scoped to
  the lobby, with no effect on other matches or student learning records.

Each successful change resets every participant's ready flag. New participants
fill the smaller team, including after custom swaps/kicks; seat parity no longer
overfills a team. The normal start gate still requires full, balanced, ready
teams. A presence-only `last_seen` update no longer emits redundant revision
events. Readiness, team, roster, room and score changes still signal normally.

The interface requires an inline second confirmation before removing a player.
It displays server-acknowledged saves, preserves partially edited settings across
ordinary polling, and exposes no host controls to other participants. Failed
snapshot requests provide a return-to-lobby-list action. Snapshot polling pauses
in a hidden tab and resumes on visibility/online events; stale reads cannot
overwrite a user action. The displayed per-round timer advances between server
snapshots using a monotonic clock; the server still accepts/rejects answers.

SQL acceptance: **2/2 passed**, including unauthorized controls/direct exclusion
reads, swap/reset, settings bounds/pool rollback, removal/rejoin denial, balanced
replacement joins, a completed three-round 2v2, exact durable scores and rejection
of post-start edits. Heartbeat revision behavior is checked separately. The new
two-browser control/offline scenario passed standalone and in the **12/12**
combined official-service suite. See [service evidence](isolated-supabase-services.md).
Desktop/mobile screenshots are in `screenshots/real-services/`. Whole-match
timing now has [separate SQL, real-clock HTTP and browser evidence](battle-match-timers.md).
Quick Match, vocabulary matching, public rankings and broader load profiling
remain unfinished.

Rollback for a future approved release: remove the new UI calls first. Reverting
the join/trigger definitions requires deliberate SQL matching the deployed
version; do not simply drop the exclusions table while the patched function
references it. No historical match, student progress or grade is rewritten.
