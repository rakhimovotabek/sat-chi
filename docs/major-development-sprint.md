# SAT’chi major development sprint

Branch: `feature/universal-book-import`. Baseline: `780eb95`. All implementation and checks stayed local. No hosted database changes, production account operations, deployments or GitHub pushes were performed.

**Status: substantial implementation delivered; full sprint acceptance is not yet established.** The disposable SQL integration tests exercise actual PostgreSQL functions and RLS, but the complete Edge/Storage upload and real network multiplayer flows still need a disposable Supabase environment.

## Universal Import System

Implemented in the existing Admin → Books workspace:

- Upload → Validate → Preview → Import → Publish stages; drag/drop or file picker, file size, book metadata, nested topics, classification distribution, individual question/answer/explanation previews and real local image previews.
- Strict ZIP member paths, duplicate names, structure, CRC and expansion bounds. Limits: 32 MiB archive, 96 MiB expanded, 8 MiB member, 4000 members, 3000 questions, 200 topics and eight nested levels. Store/deflate only; no archive extraction, executables, SVG, PDFs, ZIP64 or encrypted files.
- PNG/JPEG/WebP signature and dimension checks; 8 million pixel ceiling. PNG chunks and exact non-interlaced pixel expansion are verified. JPEG/WebP entropy decoding is not verified.
- Authenticated admin-only Edge worker. Service credentials stay server-side. Validated archives are staged privately; each step uploads/hash-verifies up to 20 assets and inserts up to 25 questions. Durable job cursors, fingerprint uniqueness, fingerprint-specific database locks and canonical source mappings support safe retries.
- Private drafts and atomic publication guards. Incomplete, pending or rejected content cannot publish, including through direct book updates. Published questions use the existing Books and Question Bank paths, answer tables, canonical IDs and eligibility cache.
- Book metadata/cover editing remains available. New hide, archive and restore actions preserve history. Restore returns a draft. Archived books cannot publish. Deletion is blocked when saved practice/Homework history or import references would be damaged; the interface explains using hide/archive instead.
- Admin book details include a JSON record correction editor for imported text, original choices, accepted answers, classification and review status. The Edge worker revalidates changes and only permits existing package assets. IDs are preserved and published books must be hidden before correction.

Specification: [satchi-book-v1.md](satchi-book-v1.md). Formal schemas: [manifest](schemas/satchi-book-v1.schema.json), [question](schemas/satchi-book-v1-question.schema.json). Original CC0 [example ZIP](../assets/examples/satchi-book-v1/original-practice.zip), regenerated with `python3 scripts/imports/create-universal-example.py`, covers text MCQ, image options, LaTeX, numerical response, passage, explanation image and multiple chapters/domains. It contains no College Board questions.

Verified SQL/package behavior: compressed archive validation, malformed archive rejection, invalid choices/count/rights rejection, admin/service permissions, retry identity, idempotent batches, hidden drafts, incomplete publish rejection, archive/restore, correction approval gates, published Books/Question Bank discovery, practice grading and history protection.

Limitations: full Edge/Storage/browser upload-to-publication acceptance has not run. Duplicate candidate discovery and an integrated Content Review queue for universal records are unfinished; the correction editor is separate within book management. Review CSV is required but not parsed as an authoritative key; JSONL status is authoritative. Explicit precision intervals/rounding rules are not yet accepted by the universal format (existing legacy package range grading remains available). ZIP errors currently stop at the first invalid record. Safe delete conservatively blocks imports even when unused; no import cleanup UI exists. Large ZIP steps reread/revalidate the staged archive and need Edge runtime benchmarking before production.

## Battles

Implemented a lazy-loaded `/battles` surface with public/private lobby creation, invitation codes, public lobby discovery, readiness, host start/cancel, leave/host transfer, countdown, common frozen rounds, answer submission, scoreboards, round review and durable personal history.

Categories: Math, Reading & Writing, Mixed, Vocabulary. Vocabulary supports Meaning Rush and Reverse Meaning using real published word-definition pairs with distinct distractors. Backend Vocabulary filters support book/set and mode; selection UI currently offers mode only.

UI formats: 1v1, 2v2, 3v3 and free-for-all with 4/10/20 seats. Backend capacity is bounded at 20, custom counts at 1–50 and timed questions at 30–600 seconds. Untimed friendly mode is available. Team games require full balanced teams, assigned by seat. Every participant receives the same frozen question set. Battle open-response selection currently admits numeric accepted-answer keys; symbolic and numeric-range source questions are excluded so they cannot be graded with an incompatible battle key. Correct answers earn 100 points; incorrect responses earn zero. Team totals sum member scores. Battle results do not award EXP or affect ordinary practice/Homework grades.

A single server RPC locks each room before mutations. The server controls membership, question selection, timing, scoring, transitions and saved results. Answer keys and submissions are private tables, and keys are omitted from active snapshots. Unique submission keys prevent double scoring. Reconnection retrieves the same persistent seat. Timed rounds advance through client-triggered server refreshes; rooms expire after two hours. Untimed rooms wait for every response or expiration.

**Transport: member-restricted Supabase Realtime revision signals plus two-second snapshot polling as a fallback.** Only battle ID, revision and timestamp enter the new Realtime publication; keys, responses, invitation codes and student identities remain private. Signals prompt an ownership-checked snapshot refresh. Last-seen heartbeats provide coarse presence; richer Realtime presence remains unfinished. Signal RLS is tested, but live Realtime delivery has not been verified without a disposable service. Database integration tests complete games using separate authenticated roles for 1v1, 2v2, 3v3 and 20-player free-for-all. Tests also cover both Vocabulary modes, private access, host permissions, capacity, duplicate submissions, late joining, answer privacy, host transfer, expiry, history and server scores. These are not concurrent network or two-browser tests.

Remaining: Quick Match, Quick Match vocabulary pairing, typed Word Challenge, custom teams/kick/settings controls, whole-battle timer, source/topic/difficulty selection UI, dedicated leaderboards, detailed time/domain/word weakness analytics, Realtime presence, simultaneous-join stress tests, real Auth/REST/network interruption and two-browser completion. The database limiter persists successful calls; failed transactions roll back limiter increments, so failed-request throttling requires a transport-level limiter before production. Snapshot polling also needs load profiling.

## Math improvements

- Existing image-choice mapping remains canonical. Universal imports map actual A–D text/images separately. WebP support was added to private image and explanation resolution. Combined-image legacy fallback remains intact; no fictitious crops are created. Authorized conversion/crop review guidance is in the package specification.
- Lazy-loaded KaTeX typesets `$…$`, `$$…$$`, `\(…\)` and `\[…\]` in safe formatted content, options and explanations. Trusted URL/HTML commands are disabled; expression length, expansion and size are bounded, and macros are isolated per expression. Implementation follows the [official KaTeX API](https://katex.org/docs/api).
- Shared numerical syntax validation supports integers, decimals, leading decimals, negative values and fractions. Five characters are allowed normally, six including a leading minus. A leading Unicode minus/en dash/em dash directly followed by a digit or decimal point normalizes to `-`. Outer spaces are trimmed; internal spaces, scientific notation, expressions, denominator signs and zero denominators are rejected. Limits follow [College Board’s response instructions](https://satsuite.collegeboard.org/media/pdf/sat-practice-test-4-digital.pdf); no test questions from that PDF were ingested.
- Private numeric and numeric-range grading applies the syntax gate before existing exact numeric/range comparison. Symbolic source formats retain their existing behavior. Explicit accepted alternatives remain authoritative; no broad rounding tolerance was invented.
- Explanations now require a durable Check, including a wrong Check, or final submission. Frontend and ownership-checked RPC enforce this. Legacy tests that expected selection alone to unlock explanations were updated for this requested behavior.
- Regression checks cover equivalent fractions/decimals, negative fractions, Unicode minus, invalid input, response lengths, rendering safety, image mapping, first wrong then correct history, shared Books/Bank identity and Homework grade preservation.

## Engineering and validation

New migrations:

| Migration | Purpose |
| --- | --- |
| `20261030000100_universal_book_jobs.sql` | Durable import jobs, canonical mapping, service-only writes, publication/eligibility/assets/history guards |
| `20261030000200_battles.sql` | Private rooms, memberships, rounds, answers and transactional state machine |
| `20261030000300_sat_numeric_responses.sql` | SAT numeric syntax and post-Check explanations |
| `20261030000400_book_lifecycle_and_corrections.sql` | Archive/restore and private validated question correction records |
| `20261030000500_vocabulary_battles.sql` | Published word-pair battle rounds |
| `20261030000600_battle_realtime_signals.sql` | Member-only Realtime revision signals with snapshot fallback |

Main files: `supabase/functions/import-book/index.ts`, shared `universal-package.js`, `src/features/books/UniversalImport.jsx`, `UniversalDraftEditor.jsx`, existing book pages/API/cover handling, `src/features/battles/`, player grading/explanations, shared formatted/math rendering, route/navigation and focused tests. Dependency: KaTeX `0.19.1`, pinned with lockfile (plus its transitive CLI dependency). Vite was updated to `8.3.5` within the existing Vite 8 range to resolve the audit finding; `npm update vite` reported zero vulnerabilities.

Local commits:

- `9ab5913` — Add validated resumable universal book import drafts.
- `8c858bb` — Add server-authoritative Battles lobbies rounds and history.
- `320f69a` — Add safe LaTeX rendering and SAT numerical response grading.
- `ca4e4af` — Harden import assets and add draft corrections and book lifecycle controls.
- `380a334` — Add vocabulary Battles and verify team games and responsive previews.
- `3b3f51b` — Document sprint verification limitations and local review instructions.
- Final Realtime signal work is recorded in the following local commit.

Final combined focused run: **26 passed, zero failed, one skipped** (27 tests). The skipped `book-jpeg-explanation.test.js` requires absent native service binaries. The passing coverage includes legacy package import/Bank behavior, new malicious archive fixtures, four multiplayer configurations, both vocabulary modes, Math safety/grading, canonical history and Homework first-grade invariants. Lint and production build passed. Two browser tests passed with desktop/mobile snapshots and no horizontal overflow. Their first attempts failed on strict label locators, which were corrected to semantic combobox locators. The mechanical UI detector reported no findings. A small final table-validation/control-layout follow-up was then rechecked with its focused package/browser checks and lint/build. Earlier runs caught and fixed migration syntax/alias conflicts, the Question Bank eligibility cache integration, and legacy explanation-gate expectations. No migration was tested against a hosted database. Full historical test-suite execution is not claimed.

## Localhost instructions

Supported Node: `^22.12.0 || >=24.0.0`. Install with `npm ci`.

Run SQL/package regressions without any hosted credentials:

```bash
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/universal-book.test.js tests/battles.test.js tests/sat-numeric-response.test.js tests/math-typesetting.test.js tests/embedded-answer-choices.test.js tests/first-attempt-statistics.test.js tests/shared-question-history.test.js tests/book-package.test.js
npm run lint
npm run build
```

The tests create disposable PGlite PostgreSQL instances, apply migrations and use synthetic authenticated roles. The UI-only browser spec uses mocked Auth/REST, original ZIP bytes and real image/KaTeX rendering; it does **not** verify backend upload or multiplayer:

```bash
npx playwright test tests/browser/universal-book-preview.spec.js --workers=1
```

Its Vite server uses `http://127.0.0.1:5199` with explicit fixture URL/key overrides and is cleaned up by Playwright.

For actual acceptance, provision a disposable Supabase stack (Docker and Edge runtime are currently unavailable here). Apply all migrations to that disposable stack only. Set local-only function secrets (`SUPABASE_URL`, service key and anonymous key), serve `supabase functions serve import-book --env-file <local-only-env>`, then start Vite with explicit local overrides:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY='<disposable-anon-key>' npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`. Create disposable admin/student accounts; import/preview/publish the CC0 fixture as admin and verify student Books/Bank practice. Use two authenticated browser sessions to create/join/start/finish a battle and test reconnection. Never test using the repository’s hosted `.env`.

Existing native `npm run dev:platform` also requires the absent PostgreSQL 17, PostgREST 14 and Auth tool binaries documented in `platform-improvements-report.md`. This is a prerequisite, not a passing test.

Deployment remains unauthorized. Before any future production release: verify disposable Edge/Storage acceptance and concurrent real-network multiplayer; finish failed-request throttling and security/load testing; review migration compatibility/storage policies and the known feature gaps; obtain explicit deployment authorization.


Local review captures: [import laptop](screenshots/sprint/import-laptop.png), [import mobile](screenshots/sprint/import-mobile.png), [Battles laptop](screenshots/sprint/battles-laptop.png), [Battles mobile](screenshots/sprint/battles-mobile.png). These show synthetic fixture accounts and content.

Final follow-up result: four package/import tests passed, two browser tests passed, ESLint passed, production build passed. No test processes are intentionally left running. Run `npm run test:sprint` and `npm run test:sprint:ui` for the documented checks. Complete file changes can be reviewed with `git diff --name-status 780eb95..HEAD`; the commit list above separates functional milestones.
