# Real local Supabase service verification

This extends the existing native PostgreSQL 17.11, PostgREST 14.1 and Auth
v2.197.0 harness. The default `test:sprint:native` mode keeps its disk/Node
substitutes. The opt-in service mode instead runs official linux/amd64 images:

| Service | Version | Pinned manifest SHA-256 |
| --- | --- | --- |
| Storage API | 1.81.0 | `92c5fe87ba5291915d0c21ca530ece9a58e13cc76a36a6c84fc69121a8dde799` |
| Edge Runtime | 1.77.4 | `fded42ff725708990b1a0803633c2659453259d075c4bec6b4d01dfb82dc055e` |
| Realtime | 2.143.3 | `1591e9049bf15fd392da9e8344db892f6acfe9da274517327dbd14733f32b9e1` |

Versions come from the [official self-hosting configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml).
The setup script verifies the selected manifest and every layer before safe
extraction into `~/.cache/satchi-test-tools/services`. Bubblewrap runs read-only
root filesystems with separate user/PID/IPC namespaces, cleared environments,
explicit writable temporary directories and loopback listeners. It needs existing
`bwrap`, user namespaces, Python 3.12+, C tools and the native PostgreSQL cache.
No Docker daemon, sudo, system package install or hosted dotenv is used.

```bash
npm run setup:test-tools       # existing native tools, if missing
npm run setup:test-services    # approximately 730 MiB compressed service images
npm run test:realtime          # focused actual WAL/WebSocket/RLS check
npm run test:sprint:services   # combined actual browser/import/multiplayer suite
```

Run suites serially on the 4 GB laptop. Service startup has a bounded 60-second
readiness allowance; competing PGlite/Chromium work caused a cold Storage startup
timeout during development. No performance improvement or peak-memory claim is
made. Test processes and gateway sockets are explicitly closed; temporary
databases, assets and function caches are removed at shutdown.

## Boundaries and evidence

- Storage runs **the actual Supabase Storage API**, its own migrations, private
  buckets, authenticated signing/downloads and actual disk bytes using its
  supported **file backend**. S3/MinIO and hosted Storage behavior are untested.
- Edge runs **the actual Supabase Edge Runtime/Deno**, routing requests into an
  actual bounded user worker loading `supabase/functions/import-book/index.ts`.
  Only generated loopback URL/service credentials enter that worker. Browser
  clients never receive the service key. Hosted Kong/JWT configuration and
  maximum-size production package benchmarking are untested.
- Realtime runs **the actual Supabase server**, its tenant/CDC migrations,
  `wal2json` and `pgoutput` against logical WAL from the disposable cluster.
  PostgreSQL 17.11's output-plugin allowlist is configured explicitly for both.
  A local HTTP/WebSocket proxy performs the `/realtime/v1` → `/socket` routing.
- Auxiliary Supabase roles exist only in the disposable database. Auth retains
  its existing isolated Auth database; synthetic UUIDs map to the application
  fixtures. This is not a full production Supabase deployment.

Actual browser acceptance already passed against these services: original
30-question ZIP, all six original assets, durable private draft, audited
correction, 250px replacement-option upload/preview, idempotent retry,
publication, student image decode/grading, SPR, reload/resume, Question Bank UUID,
hide/archive/restore and unchanged historical Check rows. Network clients
completed 1v1/2v2/3v3 with fresh-session seat/answer recovery, replay protection,
exact team scores and saved personal history. Existing Progress and Homework
browser checks also passed against this service mode.

`npm run test:realtime`: **1/1 passed**, zero skips, in the focused final run.
An authenticated room member receives an actual WAL-backed revision event
without snapshot polling; an outsider receives none. The event exposes exactly
`battle_id`, `changed_at`, `revision`. Subscription registration is awaited
before the tested mutation. This does not establish Realtime load capacity,
presence or recovery from every transport failure.

`npm run test:sprint:services`: **12/12 passed** (parent plus eleven scenarios),
zero skips. This includes all the narratives above, denied student draft signing,
service-only staged ZIP access, rejected public asset downloads, and the new
two-browser lobby/offline narrative. The latter performs real host settings,
team swaps, confirmed kick, blocked rejoin, balanced replacement join, readiness,
gameplay, browser offline/reload recovery of the same seat/saved answer, and
persisted finished 2v2 scores. The screenshots under `screenshots/real-services/`
contain synthetic content/accounts only.

Earlier failures were fixed and retested: WebSocket route/socket shutdown,
Supabase auxiliary roles, both output-plugin permissions, complete disposable
onboarding fields and accessible select names. Service stdout/stderr are now
redacted before even temporary logging; split JWTs/secrets have a unit regression.
Shutdown waits for child exit/stdio and closes upgraded gateway sockets. No
native service was left running after the verified combined suite.

All content/accounts are disposable originals. No production writes, migration,
deployment, GitHub push or real student account operation occurred.
