# Recovered disposable testing — 2026-10-31

The missing prerequisite was the **entire user-local tool cache**. PostgreSQL,
initdb, psql, PostgREST, Auth, Docker, Podman and Deno were absent from PATH.
Docker was not needed to restore the existing native test environment.

Restored without sudo or system package changes:

- PostgreSQL 17.11 from official SHA-256-verified source, compiled with two jobs
  without ICU/readline under `~/.cache/satchi-test-tools/pg17/opt/pgsql-17`.
- Official PostgREST 14.1 static binary and Auth v2.197.0 amd64 release, verified
  against SHA-256 digests returned by their GitHub release APIs. Auth uses its
  bundled migrations and a loopback SMTP sink; sessions are independently issued.

Reproduce: `npm run setup:test-tools`, then `npm run test:sprint:native`.
Setup needs existing C tools, Python 3.12+, bison/flex, zlib headers and internet.
Official sources: [PostgreSQL](https://www.postgresql.org/docs/17/install-getsource.html),
[PostgREST](https://github.com/PostgREST/postgrest/releases/tag/v14.1),
[Auth](https://github.com/supabase/auth/releases/tag/v2.197.0).
No dotenv files are loaded. Child services strip inherited PG/PGRST/Supabase/
Auth/database URL settings before applying generated local configuration. The
browser receives only an ephemeral anon key and explicit loopback URL.

This laptop reports 3816 MiB RAM. The harness uses shared_buffers=32MB,
work_mem=2MB, max_connections=30, one Chromium instance and serial tests. Running
PGlite and Chromium-heavy suites concurrently caused a login timeout; final
browser/database suites run separately. No peak-memory/speedup claim is made.
Databases and disk assets are temporary and removed on shutdown. Test preflight
prints the generated loopback target before initializing the disposable cluster.

## Actual acceptance

`npm run test:sprint:native`: **10/10 passed** (parent plus nine subtests), zero
skips. Actual browser/HTTP/SQL, no intercepted browser REST/RPCs:

1. Original Math ZIP upload, 6 actual assets uploaded/read/hash-verified by the
   actual handler, 30 canonical records, private draft, reload, Admin correction,
   repeat package without duplicates, explicit publication.
2. Student Books, real image-only choices decoded at 120px, MCQ/SPR Check,
   post-Check explanation, refresh/resume, same UUID across Bank pages, hide,
   audited answer-key correction, archive/restore/republish and unchanged Check
   history. The canonical key correction preserves the original 3/3 first grades.
3. Student upload and malformed bytes rejected without another job.
4. Independent real Auth clients complete 1v1/2v2 over PostgREST with natural
   server countdown/result deadlines, fresh-login same-seat recovery, replay
   protection, exact team totals and persisted personal results.
5. Concurrent last-slot joins admit exactly one; nonmember read rejected;
   departing host transfers control and new host cancels.
6. Real Progress page/aggregates retain three first-correct questions and 100%
   accuracy after key correction; filters, table, reduced motion and mobile layout.
7. Student browser selects a published vocabulary book/topic and custom count,
   completes a one-round Typed Word match, checks normalized grading, private
   active keys, reveal, final saved response/score and mobile layout.
8. Original six-question R&W package imports/publishes and supplies a passage
   battle with book/domain filtering and server grading (one round, not full history).
9. Actual submitted Homework generates the admin question heatmap; student is
   denied the aggregate; keyboard detail, small sample, missing time and mobile
   layout are checked.

**Boundary:** the actual import handler runs under Node's Request/Response adapter,
not native Deno Edge Runtime. Storage HTTP is a disk-backed substitute: actual
bytes are retained/downloaded/signed and student signing uses real PostgreSQL
metadata policies. It does not prove Supabase Storage/S3, Edge Runtime, Realtime
or hosted delivery. Battles use authoritative snapshots/polling. These native
journeys are verified; full Supabase-stack equivalence is not claimed.

## Attributed corrections

`20261031000400_universal_correction_audit.sql` transactionally records canonical
ID, job, active owner/editor, before/after record and timestamp. The old unattributed
service entrypoint is revoked. Audit rows are admin-readable; students cannot
enumerate them and browser roles cannot write/delete them. No past attempt or
snapshot is rewritten; no backfill invents previous editor identity. Prior import
job/ownership/correction migrations are dependencies. SQL and actual HTTP/native
checks prove history preservation after changing a key.

Early diagnostics exposed exact-label locator mismatches, a Check/reload race,
Bank pagination assumptions and concurrent-suite resource pressure. These were
fixed; the final focused checks pass. Full historical suites and true dark-mode,
Realtime and hosted Edge/Storage acceptance are not claimed. No production,
GitHub or deployment operation occurred.
