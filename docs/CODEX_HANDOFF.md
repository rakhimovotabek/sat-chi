# SAT’chi handoff

## Current task

Continue the full connected learning roadmap in the latest user request. The authorized source folder is **`~/Desktop/Books` (capital B)** and its subfolders. Never scan sibling Desktop folders, fetch books online, or commit PDFs/extracted text. Authentication, Google OAuth, learning workflows, and the tab-switch fix remain intact. The current request authorizes vocabulary, Study Plan and UI improvements after ingestion checkpoints.

## Implementation

- `scripts/imports/local-books.js`: recursive, symlink-safe discovery; sequential offline extraction; SHA-256 fingerprints; private intermediate JSON/reports; per-source atomic checkpoints; resume by parser version and verified intermediate hash.
- `source-files.js`: path containment, streaming hashes, atomic checkpoints.
- `parsers.js`: existing complete Grammar adapter plus column-aware Rules-To-Results adapter. Explicit printed keys only; source order retained; ambiguous visuals/paired text/underline dependencies quarantined as `NEEDS_REVIEW`.
- `pdf-columns.py`: reconstructs separate PDF columns from local Poppler bounding boxes. `extract-archive.py`: offline DOCX/EPUB text extraction without following URLs or unpacking arbitrary paths. Unknown structures remain in review.
- `apply-local-imports.js`: verifies project `ileffhbbaomfimwulvpw`, source and intermediate hashes; uses **cached CLI with `--offline`**; transactions and duplicate guards; records each completed source before continuing. No service-role key.
- `sample-check.js`: re-extracts actual source PDFs and checks first/middle/last validated questions, choices, and printed keys. Results are private.
- Migrations `20261003000800_import_review_metadata.sql` and `20261003000900_import_asset_deduplication.sql`: admin-only import evidence, vocabulary counts, review counts, source paths; exact-content duplicate ledger; trusted local topic importer with no browser execute grant.
- Admin → Books → Import status shows real reports, exclusions, review evidence and refresh. No source download/export links.

## Commands

```bash
npm run import:inspect
npm run import:check -- --remote
npm run import:apply -- --apply
# Re-run commands normally to resume; completed sources are skipped.
# Re-extract/revalidate one source only:
npm run import:inspect -- --reprocess --source="Filename.pdf"
# Reconcile one source with remote state if its record/book was deleted:
npm run import:apply -- --apply --retry --source="Filename.pdf"
```

Keep `local-imports/` ignored. Per-source `.report.json` files survive an interrupted partial manifest. If extraction crashes, its PID lock is automatically recovered after that process exits. Transactions either commit a draft and report together or roll back. Existing admin-created content is not overwritten.

## Review and limitations

See `book-import-report.md` for the actual run and source-by-source outcomes. Candidate counts on unstructured sources are heuristic, not verified inventories. Difficulty is unclassified unless explicitly supplied in validated JSON. Vocabulary JSON is supported; Vocabook’s multi-column cells and exercise keys need a dedicated verified adapter. DOCX/EPUB extraction does not imply automatic semantic parsing. PDF image references/page coordinates stay private; essential unresolved graphics are excluded. Validated book imports are capped at 500 questions/200 topics per transaction; larger unstructured books remain in review rather than forcing an unsafe import.

## Verification

Run `npm test`, `npm run test:e2e`, and `npm run build` after changes. Tests cover scope/symlinks, ordered columns/key matching, graphics quarantine, duplicate imports, conflicting-key rollback, vocabulary idempotence, RLS, and admin import-report refresh, alongside all existing auth/player tests. No production fixture users or fake learning data are inserted.

## Checkpoint — October 4, 2026: importer reconciliation

- Completed: inspected the existing migrations, scripts, learning components, linked project and remote import jobs; resumed all 27 sources without re-extraction. Seven imported books match 743 actual remote questions. No duplicate source imports or partial transactions found.
- Current milestone: dedicated Vocabook extraction, preserving its actual word tables, set boundaries, passages and printed quizzes.
- Migrations applied: all nine `20261003000100`–`20261003000900`; remote migration history matches local.
- Books processed / needing review: every source is in `docs/book-import-report.md`; 20 remain review-only. Ultimate Grammar is currently admin-published; preserve this decision. Other six imported books are drafts.
- Vocabulary imports: none yet. Found `Vocabook 4.0 by SATashkent.pdf` in the authorized folder; multi-column word cells need bbox reconstruction.
- Tests: `npm test` 50 passed; `npm run test:e2e` 32 passed; production build passed; diff check passed.
- Known issues: report was absent at interruption and has been restored. Source sample checker currently assumes all books remain unpublished; change it to distinguish initial draft import from subsequent admin publication. Unknown parsers/visual dependencies stay NEEDS_REVIEW.
- Unfinished tasks: roadmap milestones 2–19, especially secure review scheduling, multi-set vocabulary, learning modes, plan and mistake integration.
- Exact next action: reconstruct Vocabook table cells from local PDF bounding boxes, validate 25-word boundaries and explicit answer tables with synthetic regression tests; import only verified draft material. Use cached offline CLI; never reset production.

## Checkpoint — Vocabook draft import completed

- Completed: recovered original PDF cells using bounding boxes and vector table borders, including cross-page continuation cells. Preserved College Panda 16 sets and SATashkent 40 sets (25 words each), 1,400 words, 56 source passages and 559 explicitly keyed sentence-completion quizzes. No source PDF, extracted text, examples or private intermediate assets are tracked.
- Books processed: 27 source checkpoints; 743 SAT questions unchanged. Vocabulary source now imported as draft. Other 19 unparsed sources still NEEDS_REVIEW; no failed source blocks another.
- Review: College Panda Set 6 question 9 has a blank C and merged D option in the source; excluded, not guessed. All imported vocabulary requires admin review before publication. PDF page numbers are physical pages (printed page is usually one lower).
- Applied migration: `20261004000100_vocabulary_source_fields.sql`; adds source set/collection/page and word fields without altering existing content.
- Tests: 53 unit/database tests passed; 32 browser tests passed; build and diff check passed. New synthetic parser tests verify both collections, original set sizes, supplied definitions, missing-key quarantine and normalized duplicate protection.
- Audit commands: `node scripts/imports/check-vocabulary.js` checks every remote cell, passage and quiz/key against the validated payload, plus independent raw-source samples. `node scripts/imports/report.js` regenerates the non-copyrighted source inventory from real database counts. Existing question sample checker now allows subsequent admin publication.
- Current milestone: secure vocabulary progress and learning environment. A next migration may exist uncommitted; it is not yet applied.
- Unfinished: review scheduler/favorites, multi-set pool, word accordion/search, learning modes, dashboard/plan/mistake integration, admin editing improvements, performance/RLS tests.
- Exact next action: test and finish `20261004000200_vocabulary_spaced_review.sql`, replace browser progress upserts with derived review RPCs, then add a bounded multi-set learning UI. Preserve auth/player behavior and run full checks before applying/pushing the next milestone.

## Checkpoint — vocabulary learning studio

- Completed: selectable/multi-set library, real book/set aggregates, default expandable Words list, word/definition search, status filters, favorites, Learn, keyboard flashcard flip/navigation, Again/Hard/Good/Easy, strict server-graded typed recall, original clickable passages, reverse/definition/mixed/source tests and weak/due/starred pools. Large combined pools use 100-word pages. Duplicate word/meaning pairs keep source memberships. Dashboard/Progress show vocabulary totals and due work.
- Admin: edit all supported word fields, delete words/sets, reorder sets through existing order editor, inspect source pages/confidence, preview and duplicate-check individual-set JSON or whole books.
- Applied migrations: `20261004000200_vocabulary_spaced_review.sql` and `20261004000300_vocabulary_mixed_practice.sql`, in addition to all earlier migrations. No reset or content publication. Direct browser progress writes revoked; RPCs derive counters/mastery, check publication and ownership, and retry review events without double credit. Submitted mixed vocabulary sessions update linked word reviews.
- Books/vocabulary: still 743 SAT questions and 1,400 draft vocabulary words, 56 passages, 559 quizzes. All remote vocabulary fields/passages/keys and nine independent raw-PDF samples verified. 21 existing SAT source samples passed, including admin-published Ultimate Grammar.
- Tests: 57 unit/database tests; 34 browser tests; lint, scoped format check, build and diff check passed. PostgreSQL tests include future due dates, failures, same-day interval limits, spaced mastery, forbidden manual mastery writes, other-student privacy, combined-set duplicate protection and individual-set import idempotence. Dependency audit: zero vulnerabilities.
- Known limits: combined tests explicitly cap at 200 items; study lists paginate at 100. Context lookup matches supplied words/phrases exactly, not guessed inflections. Typed practice persists individual reviews but has no aggregate saved test-session result yet. Legacy single-set player sessions remain compatible. ESLint 9 is pinned because the selected React plugin supports that major; revisit supported tooling releases later.
- Current milestone: connected Study Plan, meaningful streaks and unified mistake review. Before that, inspect Central Ideas duplicate warnings: exact repeated source questions should be safely skipped rather than rejecting its entire otherwise validated draft.
- Unfinished: other 19 unstructured sources need specialized parsers or manual review; adaptive plan/settings/history; SAT/vocabulary mistake center; recent performance/strong and weak areas; collapsible sidebar with one logout; final performance/security/design audit.
- Exact next action: salvage only confidently parsed Central Ideas questions with exact-key duplicate protection and re-audit; then add bounded, persisted Study Plan tasks linked to real practice/reviews and test automatic completion/history. Keep all new extraction draft and checkpoint each milestone to origin/main.
