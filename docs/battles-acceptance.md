# Battles acceptance — 2026-10-31

**VERIFIED BACKEND** in disposable PGlite PostgreSQL: separate authenticated roles
complete 1v1, 2v2, 3v3 and 20-player games; private keys and member signals are
protected; duplicate answers do not score twice; deadlines, readiness, host
transfer, expiration and persisted history are checked. Meaning Rush and Reverse
Meaning use published synthetic vocabulary records. These are sequential database
clients, not simultaneous network users. Realtime delivery/reconnect and actual
two-browser/Auth journeys remain **BLOCKED** by the absent local Supabase stack.

Additive migration `20261031000200_battle_answer_privacy_and_pool.sql` masks
current-round points in PLAYING snapshots, including scoreboard sort order.
Previous-round totals remain visible; real current points return at ROUND_RESULTS.
No answer/score rows are rewritten. Math/R&W/Mixed creation checks exact eligible
published canonical count and rejects impossible settings transactionally, even
for an admin with draft access. Battle filters reject personal history filters.
Vocabulary pool validation still occurs at start; richer setup remains open.

Evidence: `node --expose-gc --import ./scripts/testing/release-memory.js --test
--test-concurrency=1 tests/battles.test.js`: five tests passed. New regressions
check hidden score/order, failed-create rollback, zero matching pools and admin
draft exclusion. No new grants, tables, indexes, RLS policies or backfill. The
migration asserts the expected state-machine definition before replacing it;
apply dependencies through the preceding migrations in order. Test only locally;
production migration remains unauthorized. Forward correction is preferred over
restoring the answer leak. Typed vocabulary, matching, total timers, Quick Match,
custom teams/kick/settings UI and Battle XP remain unimplemented.
