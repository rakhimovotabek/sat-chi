# Recovered disposable testing — 2026-10-31

The missing prerequisite was the **entire user-local tool cache**, not an
incompatible schema or an inability to run PostgreSQL on this Dell. No postgres,
initdb, psql, PostgREST, Auth, Docker, Podman or Deno executable was on PATH.

Restored without sudo/system package changes:

- PostgreSQL 17.11 compiled from official checksum-verified source, two jobs,
  without ICU/readline, installed at `~/.cache/satchi-test-tools/pg17/opt/pgsql-17`.
- Official PostgREST 14.1 static binary and Supabase Auth v2.197.0 amd64 release,
  each checked against the SHA-256 digest supplied by its GitHub release API.
- Auth's bundled migrations and a loopback SMTP sink are used. Auth tokens are
  real independently issued sessions; credentials and JWT keys are disposable.

Reproduce: `npm run setup:test-tools`, then `npm run test:sprint:native`.
The setup builds only inside the user cache. It requires existing C build tools,
Python, bison/flex, zlib headers and internet access. Never reads dotenv. No global
services are installed. Official sources: [PostgreSQL source procedure](https://www.postgresql.org/docs/17/install-getsource.html),
[PostgREST release](https://github.com/PostgREST/postgrest/releases/tag/v14.1),
[Auth release](https://github.com/supabase/auth/releases/tag/v2.197.0).

This laptop reports 3816 MiB RAM. The harness uses shared_buffers=32MB,
work_mem=2MB, max_connections=30, one browser and serial test execution. A full
Docker Supabase stack was unnecessary. No peak-memory/performance claim is made.
All databases and asset files are temporary and removed on shutdown. Loopback
preflight is printed before database initialization. Vite receives explicit
locally generated URL/key overrides; production `.env.local` is not used.

## Actual acceptance

`npm run test:sprint:native`: **6/6 passed** (parent plus five subtests), zero
skips. Actual browser/HTTP/SQL, no intercepted browser REST/RPCs:

- Original ZIP upload, all 6 real image assets uploaded/read/hash-verified by the
  actual import handler, 30 canonical records, private persisted draft, reload,
  correction through Admin, repeat package without duplicate rows, publication.
- Student Books access, real image-only options decoding at 120px, MCQ and SPR
  Checks, post-Check explanation, refresh/resume, same UUID in Bank, hide/archive/
  restore/republish and byte-for-byte unchanged saved Check history.
- HTTP student upload rejected; malformed bytes rejected without another job.
- Independent real Auth clients complete 1v1 and 2v2 over PostgREST with natural
  server countdown/results deadlines. Fresh login recovers the same seat and
  submitted response; duplicate answer yields no extra points. Team totals and
  persisted personal results checked.
- Concurrent last-slot network joins admit exactly one client; nonmember read is
  rejected; host leave transfers control and new host cancels.

**Boundary:** the import handler runs under Node's standard Request/Response
adapter, not Deno Edge Runtime. Storage transport is a disk-backed test substitute:
actual uploaded bytes are retained, downloaded and signed; student signing uses
real PostgreSQL Storage metadata policies. This does not prove the Supabase
Storage server, S3, native Edge runtime or Realtime delivery. Battles exercise the
snapshot path. Native Auth/PostgreSQL/PostgREST and browser-to-database acceptance
are verified; full Supabase-stack equivalence is not claimed.

First diagnostic failed on the editor's accessible field name and an assertion
racing the SPR save. Added explicit field aria-label and awaited post-Check UI
acknowledgment. Final rerun passed all six. Lint/build passed. No production,
GitHub or deployment operation occurred.
