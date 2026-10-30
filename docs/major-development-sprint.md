# Major development sprint

Local branch: `feature/universal-book-import`, starting at `780eb95`. No production credentials, deployments, database modifications or pushes are authorized by this work.

## Universal import milestone

Implemented a shared bounded ZIP parser/validator, admin Upload → Validate → Preview → Import → Publish workflow, private staging transport, resumable asset/question batches, hash verification, canonical insertion, publication guard, Question Bank cache integration and history-safe deletion guard. The existing JSON importer, player, numerical keys and student histories remain authoritative. Metadata editing, cover changes and hiding remain available through existing book management.

Specification: `docs/satchi-book-v1.md`; formal manifest schema: `docs/schemas/satchi-book-v1.schema.json`; original example: `assets/examples/satchi-book-v1/original-practice.zip`. Regenerate with `python3 scripts/imports/create-universal-example.py`.

New migration: `20261030000100_universal_book_jobs.sql`. New Edge Function: `import-book`. No new dependencies. The server verifies authentication and admin role on each request. Service-only RPCs create and append jobs. Same-ZIP retries reuse the job and canonical records. Publication requires all records to be imported and approved.

Verified: compressed original ZIP, malformed ZIP rejection, invalid metadata/choice/count/rights rejection, service-only job writes, idempotent batches, student draft isolation, incomplete publish rejection, published Books/Bank visibility, MCQ practice grading and history-safe deletion. Command: `node --test --test-concurrency=1 tests/universal-book.test.js` (3 passed). ESLint passed.

Limitations: full Edge/Storage/browser upload acceptance has not run; local Docker/Deno runtimes and native test service binaries are unavailable. Image signatures and hashes are checked; full raster decoding and pixel/dimension limits need additional hardening before production. The manifest schema is provided; a separate full question JSON Schema remains outstanding. Review CSV is required but JSONL review status is authoritative. Duplicate candidates, universal draft corrections, archive/restore and explicit safe deletion UX remain incomplete. Large packages are bounded at 3000 questions, not unlimited. LaTeX source is retained but the existing renderer does not typeset it. No claim of production readiness or full Priority 1 acceptance is made.

## Local testing

SQL/package checks need only installed project dependencies and supported Node (`^22.12 || >=24`). Run the command above. The database is an ephemeral PGlite PostgreSQL instance with all migrations, authenticated roles and synthetic users; no hosted connection is made.

For full transport acceptance, start a disposable Supabase stack, apply migrations locally, serve `import-book`, and start Vite with explicit local URL/anonymous key overrides. Never use the repository's hosted `.env`. Sign in as a disposable admin, open Admin → Books → Import Book, upload the original fixture, preview, import draft and publish. Sign in as a disposable student to verify both Books and Question Bank. Detailed prerequisites are in the package specification. No hosted migration or function is deployed by these instructions.

## Battles core milestone

Added lazy `/battles` navigation and a transactional PostgreSQL engine (`20261030000200_battles.sql`). UI supports creating private/public rooms, code entry, public lobby discovery, readiness, host start/cancel, leaving with host transfer, countdown, synchronized rounds, scores and persistent personal review/history. Formats offered: 1v1, 2v2, 3v3 and free-for-all capacities 4/10/20. Backend validates capacities 2–20, question counts 1–50 and per-question timing 30–600 seconds or untimed. Team games require two full equal teams. Every participant receives the same frozen questions. Correct answers earn 100 points; incorrect answers earn zero. Team totals are sums. There is no EXP/practice/Homework credit.

Transport is two-second RPC polling; no Realtime channel has been implemented. All transitions and scores use database time and transactions; reconnecting retrieves the persistent membership and room snapshot. Round keys are private until round results. Duplicate answers do not increment scores. Rooms expire after two hours. Host departures in lobbies transfer ownership. Missing players in timed games time out; untimed games can wait until room expiry.

Database integration tests exercise two authenticated roles from create through finish, same-question snapshots, private key protection, correct/wrong answers, replay protection, membership permissions, room capacity, team configuration validation, host transfer, late joins, expiration and saved history. This is not network concurrency or two-browser verification. No claim of Priority 2 acceptance is made.

Remaining: Vocabulary modes, Quick Match, custom team assignments, kick/settings controls, source/topic filter UI, whole-battle timers, dedicated leaderboards, weakness/time analytics, Realtime invalidation/presence, concurrent join stress tests, full 2v2/3v3 match tests, real Auth/REST/network reconnection/browser verification. The per-action database limiter persists successful requests; failed transactions roll back limiter increments, so failed-request throttling needs a transport-level limiter before production. No production deployment is authorized.
