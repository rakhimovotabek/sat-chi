# SAT’chi recovery checkpoint — 2026-10-31

Branch: `feature/universal-book-import`. This continuation started clean at
`a696f59`. Latest implementation: `d57fc27`; this checkpoint is committed directly
after it. Use `git rev-parse HEAD` for the exact documentation-checkpoint ID.

## Local commits in this continuation

- `e4a3ec5`: restore native tools and verify real import/network multiplayer.
- `18e67e3`: owner-attributed correction audit without historical grade rewrites.
- `8e0788d`: authorized, reversible lossless Math crops and original examples.
- `1f1e448`: Typed Word Battles, source/topic selection, real Progress/admin heatmaps.
- `d57fc27`: validated stem/option replacement upload, preview, audited application.

## The testing blocker is resolved

The entire user-local cache was missing. Restored PostgreSQL 17.11, PostgREST 14.1
and Auth v2.197.0 from official checksum-verified distributions; PG built with two
jobs. No sudo, global install or production configuration changes. Native harness
uses real Auth/SQL/PostgREST, temporary disk assets and explicit loopback Vite
configuration. Inherited PG/PGRST/Supabase/Auth environment settings are stripped.

`npm run dev:platform` **actually started successfully** with real services,
Vite, SMTP inbox and 15 synthetic catalog books, then was stopped cleanly. It
prints fresh ports on restart. Tool binaries stay in `~/.cache/satchi-test-tools`.
On this 3816 MiB laptop use one browser, serial suites, PG shared_buffers=32MB,
work_mem=2MB and max_connections=30. Concurrent heavy PGlite/browser runs caused a
login timeout, so final runs were sequential. No memory/speedup claim is made.

**Important boundary:** native Storage HTTP is a disk-backed substitute using
real PostgreSQL metadata policies and actual bytes. Import worker runs actual
handler code through Node Request/Response. Supabase Storage/S3, Deno Edge Runtime,
Realtime delivery and hosted behavior remain unverified. Docker/Podman/Deno and a
full Supabase service stack were not installed. This is a functioning lighter
alternative, not full Supabase emulation. See [native evidence](native-sprint-testing.md).

## Verified outcomes and remaining gaps

| Feature | Actual evidence | Remaining |
| --- | --- | --- |
| Universal importer | Real browser ZIP/6 assets/30 canonical rows, hidden draft, reload, correction, publish, student MCQ/SPR/explanation/resume, Bank UUID, hide/archive/restore and unchanged history | Full Storage/Edge stack; richer grouped diagnostics/failed-job states; paired passages/multiple explanation images |
| Image repair | Actual Admin uploads new B asset, sees 250px preview, saves audited correction; student renders/grades it; published replacement, invalid formats and oversized streams rejected | Crop-boundary UI, unused staging cleanup; JPEG/WebP full entropy decoding |
| Correction audit | Active owning admin plus before/after canonical record; key changes preserve saved Check rows and 3/3 initial outcomes | General lifecycle audits beyond correction records |
| Math corpus | Prior metadata inventory retained: 2367 occurrences, 2060 candidate IDs; 1677 composite MCQs/690 SPR; 140 colliding ID groups/447 occurrences | All existing records rights-unverified; sanitized current canonical export needed; actual database total unknown |
| Crop tool | Two original synthetic images actually produce 10 separate lossless assets; hash/key/retry/bounds/overlap checks and pixel comparison pass | **Zero existing third-party corpus conversions**; canonical application and legacy duplicate reconciliation blocked on rights/export |
| Battles | Real Auth network complete 1v1/2v2, fresh-login same-seat/submission recovery, replay/capacity races, host transfer; browser complete custom-count Typed Word match; actual R&W passage round | Matching, Quick Match, kick/custom teams/settings, total timer, network 3v3/20-player load and real Realtime |
| Battle filtering | Books/topics/domain/skill/difficulty UI; vocabulary book and up to 32 sets; all 3 modes and early pool rejection | Larger topic catalogs/pagination, vocabulary topic aliases |
| Progress | Actual persisted 3/3 first-correct after key edit, subject/period filters, keyboard table, mobile/reduced motion; normal 70% fixture chart; viewport/hidden-tab pause without replay | Source/domain filters, richer history/completion/time charts, line plots/counters, date-boundary/DST fixtures |
| Admin heatmap | Real Homework submission in browser; 2-student SQL proves 100/50/0%, skips, unknown grades, measured time, pagination and permission rejection | Dedicated recurring and 200+ question browser fixtures, group comparisons/distributions, entry motion and dashboard KPIs |
| Design | Native laptop/mobile captures, real data, keyboard heatmap/table controls, bounded browser-owned transforms; mechanical detector no findings | True dark theme, 768/1920-wide checks, broader accessibility/performance profiling |

XP ledger/levels/achievement/leaderboard redesign remains NOT IMPLEMENTED. Existing
stats/streaks retained; Battles award no XP and do not mutate practice/Homework.
No unsupported ranks, scores or time estimates were introduced.

## Final focused verification

- 10 unit checks (7 JavaScript pure/transport/environment + 3 Python crop tests).
- 8 disposable SQL checks across Battle, import ownership/lifecycle and Homework
  performance. Later image work's focused package/auth rerun: 8/8 passed.
- Native integration: **9 scenarios + parent = 10/10 passed**, zero skips.
  Actual Auth/PostgreSQL/PostgREST/browser/handler; Storage boundary as above.
- Browser fixtures: **6/6 passed**, normal/reduced motion and laptop/mobile.
- ESLint and Vite build passed. Full historical suites were not run. Earlier
  locator, pagination, Check/reload race and overlapping-suite failures were fixed.
- Screenshots: `docs/screenshots/native-sprint/` (synthetic accounts/content only).
- Latest logs: `/tmp/satchi-native-replacement.log`,
  `/tmp/satchi-image-repair-unit.log`, `/tmp/satchi-followup-regression.log`,
  `/tmp/satchi-followup-browser.log`, `/tmp/satchi-replacement-build.log`.

## Resume commands — never load hosted dotenv for writes

```bash
npm run setup:test-tools          # only if tools need restoring; cache-only
npm run test:sprint:native        # fail-closed prerequisites; actual local services
npm run dev:platform              # manual disposable workspace; prints ports
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/battles.test.js tests/homework-performance.test.js tests/universal-book.test.js tests/import-authorization.test.js tests/native-environment.test.js
python3 tests/authorized-math-crops.py
npx playwright test tests/browser/universal-book-preview.spec.js tests/browser/progress-activity.spec.js --workers=1
npm run lint
npm run build
```

Next highest-priority independent work: admin crop-plan/preview/apply UI against
original examples; importer diagnostics/recovery; complete remaining Battle modes;
expand measured analytics. For the real Math corpus, obtain verified processing
rights and sanitized canonical export first; the pending user question asks which
sources are authorized and the local export location. Do not infer authorization
from a local ZIP/PDF or replace colliding historical IDs.

New pending SQL: `20261031000400_universal_correction_audit.sql`,
`20261031000500_battle_typed_vocabulary.sql`,
`20261031000600_homework_question_performance.sql`. Apply all prior dependencies
in order only to disposable copies until separate release authorization. The
updated Edge handler requires the new actor-checked correction RPC. No backfill
rewrites grades. Feature docs describe grants and safe forward/rollback boundaries.

**No GitHub push, deployment, hosted migration, production data/config write or
real student-account test occurred.** No test/dev service is intentionally left
running. Full specification remains unfinished; no background work is promised.
