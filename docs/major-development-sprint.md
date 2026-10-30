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
