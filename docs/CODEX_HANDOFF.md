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
