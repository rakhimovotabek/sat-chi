# SAT’chi recovery checkpoint — 2026-10-31

Branch: `feature/universal-book-import`. Started clean at `b0c4072`.
Latest committed implementation: `a960921` (real Supabase services and Battle
lobby recovery). Timer UI/native-harness regression is the current next milestone.
Use `git status --short` and `git log` before resuming; newer work may exist.

## Verified service milestone

- `npm run test:sprint:services`: **12/12 passed**, zero skips. Official
  Supabase Storage API 1.81.0 (file backend), Edge Runtime 1.77.4 user workers,
  Realtime 2.143.3, plus native PostgreSQL 17.11/PostgREST 14.1/Auth v2.197.0.
- Actual browser ZIP/6 assets/30 canonical questions; private draft and denied
  student signing/staging/public downloads; reload, audited correction, new option
  upload/preview, idempotent retry, publish, student asset decode/MCQ/SPR,
  explanation/resume, Bank UUID, hide/archive/restore and unchanged Check history.
- Real network complete 1v1/2v2/3v3; fresh Auth login restores the same seat and
  answer. Replay/capacity races, exact team scores and saved histories pass.
- Actual WAL-backed WebSocket revisions reach a member and not an outsider;
  payload contains only battle ID, revision and timestamp. Focused Realtime 1/1.
- Two independent browser sessions complete 2v2: server-confirmed host settings,
  team swap, confirmed kick, rejoin denial, balanced replacement join, ready/start,
  offline/reload same-seat/answer recovery and exact persisted final scores.
  Standalone browser check also passes. Laptop/mobile captures are under
  `docs/screenshots/real-services/`.
- Real twenty-client HTTP acceptance **1/1 passed**: twenty independent Auth
  sessions, simultaneous joins/readiness/answers, two frozen rounds, repeated
  answer intents, forty saved rows, 100 points each/2000 total and twenty saved
  personal histories. These are synthetic clients, not humans or a load benchmark.
- Actual admin-host selection failure fixed: admission and sampling now use the
  same approved/published pool. No unapproved question was exposed: the old final
  safety gate rejected the match. The new parity regression passes.
- Existing real Progress (3 first-correct questions, 100%, Math/7 days) and Admin
  Homework heatmap browser narratives pass against the actual service mode.

## Tests and constraints

New focused unit: **3/3** (account bounds/identity compatibility, inherited-env
isolation, chunk-split secret/JWT log redaction). New disposable SQL: **5/5**
(2 lobby/heartbeat, 2 whole-match timers, 1 pool parity), all individually passed.
Lint and production build pass. Full historical suite has not been run.

Official images are SHA-256 pinned in the setup script and cached user-locally.
Bubblewrap/user namespaces run them without Docker, sudo or system packages.
`wal2json` 2.7 is compiled into the existing user-cache PostgreSQL installation.
Every listener is loopback; no dotenv chooses write targets. Service logs are
redacted before disk, child shutdown is awaited and upgraded sockets are closed.
Run heavy suites serially on this 3816 MiB laptop; concurrent PGlite/cold Storage
startup produced a timeout during development. No speed/peak-memory claim.

**Boundary:** actual Storage API/file backend is verified; S3/MinIO and hosted
Storage/gateway/JWT configuration are not. Auth retains its existing separate
local Auth database with synthetic matching application UUIDs. Realtime presence,
hosted delivery and broad load capacity remain unverified. No full production
Supabase clone or deployment-readiness claim. Details:
[service evidence](isolated-supabase-services.md), [Battles](battles-acceptance.md),
[lobby controls](battle-lobby-controls.md).

## Remaining priorities

1. Complete whole-match timer UI/native-harness regression. Natural-clock HTTP
   expiry already passed 1/1 with actual services (30-second budget, late-answer
   rejection, one persisted correct answer/100 points, unanswered zero). Migration
   `20261031000800` already has two passing SQL checks: missed countdowns no longer
   grant fresh full rounds; whole deadlines reject late answers, preserve earned
   points and give unanswered items zero. Settings bounds and untimed questions
   with a total budget are covered. UI verification is not established by SQL.
2. Vocabulary Word Matching and Quick Match; richer custom formats/rankings;
   complete R&W and Meaning Rush/Reverse Meaning network histories. Typed Word
   has actual browser completion; R&W has one real passage round. Keep live
   subscriptions/poll fallback and private keys intact.
3. New animated analytics/gamification work remains. Existing Progress and admin
   charts are measured, but no new Dashboard/Admin Analytics redesign or XP,
   levels, badges/leaderboard ledger was implemented in this continuation.
4. Math: prior metadata inventory retained (2367 occurrences/2060 candidate IDs;
   1677 composite MCQs/690 SPR; 140 collision groups/447 occurrences). Actual
   canonical unique total is unknown without a sanitized export. Existing corpus
   processing rights remain unverified; **zero third-party conversions**. Prior
   two original synthetic layouts/ten lossless crops remain valid. Do not infer
   rights from local files or rewrite colliding historical IDs. Crop-review UI
   and full authorized corpus application remain unfinished.
5. True dark theme, remaining responsive sizes, import diagnostics/recovery,
   and broader accessibility/performance profiling remain unfinished. Current
   Battle captures are light/reduced-motion laptop/mobile only.

## Resume commands

```bash
npm run setup:test-tools        # only if native cache is missing
npm run setup:test-services     # pinned cache; ~730 MiB compressed images
npm run test:realtime
npm run test:battles:network
npm run test:battles:browser
npm run test:sprint:services
node scripts/testing/sprint-native.js --battle-browser  # default native mode
node --test tests/native-environment.test.js tests/service-log.test.js
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/battle-lobby-controls.test.js tests/battle-match-timers.test.js tests/battle-pool-parity.test.js
npm run lint
npm run build
```

New pending migrations: `20261031000700_battle_lobby_controls.sql`,
`20261031000800_battle_match_timers.sql`, `20261031000900_battle_pool_parity.sql`,
plus every prior checkpoint's pending dependencies. Additive changes preserve
saved grades, IDs and frozen history; apply only to disposable copies until a
separately authorized release. No backfill invents student outcomes.

Logs: `/tmp/satchi-official-final.log`, `/tmp/satchi-realtime-focused.log`,
`/tmp/satchi-battle-browser.log`, `/tmp/satchi-battle-network.log`,
`/tmp/satchi-lobby-controls.log`, `/tmp/satchi-match-timers.log`,
`/tmp/satchi-pool-parity.log`, `/tmp/satchi-service-unit.log`,
`/tmp/satchi-services-lint.log`, `/tmp/satchi-services-build.log`.

**No push, deployment, hosted migration, production data/config write or real
student-account test occurred.** No test service was left running after the
verified milestone. Full sprint acceptance remains unfinished.
