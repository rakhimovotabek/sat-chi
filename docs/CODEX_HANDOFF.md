# SAT’chi handoff

## Current task

Current scope is ONLY: reconcile the 18 unresolved local sources, build administrator Content Review/audit tools, and replace Settings with working preferences. Source scope remains **~/Desktop/Books**, capital B. Preserve completed auth, RLS, homework, vocabulary, player, progress and tab stability. Do not start unrelated roadmap features. Latest checkpoint below is authoritative; older entries are historical.

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

## Checkpoint — Central Ideas recovered

- Completed: safely skipped one exact repeated question with a matching printed key. Imported 79 validated Central Ideas questions as a new draft; 26 formatting/visual-dependent questions remain NEEDS_REVIEW. Conflicting printed answers now quarantine both duplicate instances, with source evidence renumbered after exclusions.
- Remote audit: eight question books, **822 actual SAT questions**, plus unchanged draft Vocabook (1,400 words / 56 passages / 559 quizzes). All 27 remote import jobs match actual counts. Twenty-four SAT source/database samples passed. Other **18** sources remain review-only.
- Tests: 58 unit/database tests, 34 browser tests, lint, build and diff check passed. No migration applied in this checkpoint.
- Current work: `20261004000400_study_plan.sql` may be present uncommitted; it is NOT applied yet. It needs executed RPC tests and UI before deployment.
- Exact next action: finish Study Plan preference/task RPC tests, verify automatic completion and bounded daily workloads, add Study Plan UI and meaningful streak/mistake integration. Commit/apply only after checks. Preserve all past completed history and all working sessions.

## Checkpoint — connected plan and review loop

- Completed: `/study-plan` settings and persisted 14-day daily tasks; preferred/rest days; optional vocabulary sets carried from the library; due/new/weak vocabulary, recent weak-domain practice, question mistakes and fitting homework; owned task sessions resume idempotently; scheduled word IDs load exactly; completion is verified from real submitted answers/reviews. Future unstarted tasks adapt; completed history survives; missed days never double the daily budget.
- Completed: `/mistakes` Questions/Vocabulary tabs, source/domain/skill/date filters, 25-row question pagination, deduplicated mistakes, snapshot-based Practice Again with private keys. Progress now has real recent SAT accuracy, sample-gated strong/attention areas and current/longest meaningful streaks. Vocabulary study contributes active time. Dashboard shows real homework/plan reminders and due vocabulary.
- Migrations applied: `20261004000400_study_plan.sql`, `20261004000500_learning_intelligence.sql`; all preceding migrations remain applied. New tables have private student RLS and no browser mutation grants. No production fixtures or publication changes.
- Tests: 60 unit/database tests, 36 browser tests, focused learning RPC tests, lint, format check, build and diff check. SQL tests execute preferences, daily budget caps, recent weakness selection, completion, exact vocabulary task pool, ownership denial, mistake deduplication and historical completion preservation. Auth/OAuth/tab-stability/player tests still pass.
- Source state: 822 SAT questions, 1,400 vocabulary words / 56 passages / 559 exercises; automatically added material remains draft. Eighteen sources require dedicated parsers/manual review; see the report. No source dumps are tracked.
- Known limits: planning uses deterministic workload estimates (not predicted SAT scores); homework exceeding the daily budget stays in the homework reminder. Historical plan records persist but UI shows a seven-day lookback. Typed recall saves word reviews but lacks a separate aggregate persisted typed-test result. Large vocabulary tests still explicitly cap at 200. Original-source review is required before publication.
- Current milestone: sidebar/mobile UX and performance/security/importer robustness audit.
- Exact next action: make the desktop sidebar collapsible and mobile navigation a drawer with one logout action; audit per-source importer validation failures so one damaged checkpoint cannot halt unrelated imports; add meaningful regressions, run all checks, update the report/handoff, commit and push. Then consider larger vocabulary test/result pagination and remaining source adapters.

## Checkpoint — navigation and audit hardening

- Completed: persistent desktop sidebar collapse, icon-only navigation with accessible labels, mobile drawer/backdrop and Escape dismissal, account area at the bottom, exactly one logout action. Auth/tab stability remains unchanged.
- Completed: importer source/hash/intermediate failures are now checkpointed per source and later sources continue sequentially. A full apply resume skipped all 27 completed reports without reinsertion. Admin import reports paginate at 25 and load detailed source evidence only when expanded. Vocabulary's singular review warnings no longer crash the page; real set/word counts and content-review links are visible.
- Production security audit: no public application table lacks RLS; authenticated INSERT/UPDATE on vocabulary_progress are false; UPDATE on study_plan_tasks is false; anonymous execution of public definer RPCs is empty. No duplicate import fingerprints. No new migration in this milestone.
- Source audit/report: unchanged 822 SAT questions and 1,400 vocabulary words; report regenerated from linked project. Eighteen source books remain NEEDS_REVIEW. All source/extracted content remains ignored.
- Tests: 61 unit/database tests, 38 browser tests, lint, format check, build and diff check passed. New regressions cover sequential failure isolation, collapsed/mobile navigation and one logout, plus vocabulary admin warnings. Old auth logout test now targets the single visible action; the authentication behavior/assertions remain.
- Current milestone: vocabulary test depth and final product polish.
- Exact next action: add a persisted, paginated typed-recall test with real results/mistake replay (current typed mode saves individual reviews only); keep answer keys/private progress server-controlled. Then audit book-catalog pagination and remaining UX gaps, with full tests and checkpoint commits.

## In-progress checkpoint — saved typed tests

- Applied migration: `20261004000600_vocabulary_typed_tests.sql` (linked production push succeeded). Private frozen sessions/items/keys; no browser mutations or key SELECT; strict RPC grading and idempotent answers; snapshot mistake replay; 100-item pages; 20-session history; active seconds/streak integration. No source/publication changes.
- Completed locally: typed test UI, All available (maximum 10,000), first-unanswered resume, submission/results and incorrect-word replay, saved library history. Source memberships retained.
- Tests: full unit/database suite 61 passed, lint/format/build/diff passed before final route-isolation refinement. Full 39-browser suite currently running; production RLS re-audit and final checks still required before commit/push.
- Books/vocabulary remain 822 SAT questions / 1,400 draft vocabulary words, 56 passages, 559 quizzes; eighteen review-only sources. All prior checkpoints still apply.
- Current work: complete browser validation and typed-test checkpoint; then bounded book catalog/search and visual spacing audit.
- Exact next action: inspect `local-imports/typed-e2e.log` for the full browser result, fix any failure, rerun lint/build/diff and executed SQL regressions after final edits, audit production typed permissions, then commit and push. Never reapply/edit an applied migration; use another additive migration for necessary changes.

## Checkpoint — persisted typed recall and results

- Completed: saved typed vocabulary tests, All available (10,000-word safety bound), combined-set deduplication/source memberships, 100-question pages, first-unanswered resume, strict server grading, active-time tracking, final score/accuracy/correct/incorrect/unanswered/current-mastery results, mistake filtering and snapshot-only incorrect-word replay. Library history loads twenty tests per page.
- Applied: `20261004000600_vocabulary_typed_tests.sql`; all preceding migrations remain applied. Typed tables have RLS; browser key SELECT and item UPDATE/session INSERT are false; anonymous definer execution remains zero. Removed/edited source words preserve frozen results without granting mismatched progress.
- Validation: 61 unit/database tests and 39 browser tests passed; focused final SQL workflow, lint, scoped formatting, build and diff check passed. Tests exercise ownership, private keys, retry/time idempotence, exact recall, result/mistake replay and >100-item pagination. Desktop vocabulary/mobile drawer visually inspected using isolated synthetic fixtures; screenshots are private.
- Books/vocabulary: unchanged 822 SAT questions, 1,400 draft words, 56 source passages, 559 exercises. Eighteen sources remain NEEDS_REVIEW; original admin publication remains intact.
- Current milestone: bounded library catalogs and remaining UI/performance polish.
- Known limits: multiple-choice/source tests retain the explicit 200-item bound. Typed tests support the larger paginated pool. Source passage requests remain limited to ten visible-set passages. No new automatic source publication.
- Unfinished: catalog search/pagination; remaining specialized PDF adapters/OCR/manual visual review; optional further question/filter UX and supported-tooling upgrade. All learning workflows are deterministic, without external AI dependencies.
- Exact next action: paginate/search SAT and vocabulary book catalogs on the database; add searchable bounded book selectors to question administration/bank filters, keeping chosen books visible; add meaningful browser pagination/search regressions and compact mobile vocabulary modes; test, checkpoint and push.

## In-progress checkpoint — bounded catalogs

- Local changes: SAT catalog queries now select metadata, search by title and return exact totals in 50-book pages. Vocabulary catalogs search/page at 50. Question administration and bank/homework filters use a bounded searchable book selector that preserves its selected book outside the current page. Mobile vocabulary modes scroll horizontally; saved typed history follows the book library.
- No new migration. All production/source counts and review requirements remain unchanged.
- Validation: synthetic 55-book pagination/search/selection browser regression passed. Full 61-unit / 40-browser suites and final lint/build/diff checks are running in ignored `local-imports/catalog-*.log`.
- Exact next action: verify the full suite results, fix any regression, update documentation and commit/push the catalog checkpoint. If finishing this session, leave clean main and identify the remaining eighteen source adapters/manual review and the explicit 200-item multiple-choice bound.

## Checkpoint — bounded catalogs and final verification

- Completed: server-filtered SAT/vocabulary catalog search and fifty-book pages; exact SAT totals; bounded, searchable book selectors for Question Bank/homework filters and question administration; selection preserved across searches/pages. Changing vocabulary books clears old set selection. Saved typed history follows the book library. Compact horizontal mobile study modes keep controls near content.
- Validation: **61 unit/database tests and 40 browser tests passed**; lint, scoped formatter check, production build and diff check passed. The new 55-book regression exercises SAT/vocabulary paging, title search beyond the first page and selected-book preservation. Existing auth/OAuth, tab stability, homework, question player and learning flows all passed. No new migration in this checkpoint.
- Production state: migrations `20261003000100`–`20261003000900` and `20261004000100`–`20261004000600` applied. The latest typed-table permissions/RLS audit passed. Counts remain **822 SAT questions, 1,400 vocabulary words, 56 source passages and 559 keyed exercises**. Twenty-seven sources are inventoried; eighteen require dedicated adapters/OCR/manual review. Automatically extracted content stays draft; the earlier admin-published Ultimate Grammar is preserved.
- Current work: stable checkpoint complete; continue remaining content recovery and product refinements from this state. No import or migration is running. Source checkpoints/intermediates/screenshots/test logs remain in ignored `local-imports/`; no copyrighted dumps/secrets are tracked.
- Known limits / unfinished tasks: specialized parsing/visual review for eighteen books and excluded individual questions; one damaged Vocabook quiz (College Panda Set 6 Q9 / physical page44) remains excluded. Multiple-choice/source sessions cap at200 explicitly; typed tests handle up to10,000 with100-item pages. Source passage retrieval currently caps at ten per visible-set request. Plan history UI shows7 past days/14 future days. ESLint9 tooling support should be revisited. Further dashboard/player/admin visual refinements and larger context-passage navigation remain possible; do not claim all roadmap items finished.
- Exact next action: inspect the existing private checkpoints for a remaining text-based source in `~/Desktop/Books` (for example PrepPro Reading) and its actual printed question/key structure; implement a narrowly validated adapter only if key/visual mapping is reliable, process that source sequentially as draft, audit counts/samples, update the import report, test and checkpoint. Alternatively address the explicit passage-navigation limit with paged source passages before additional polish. Never restart completed sources, republish drafts, reset production, or edit an applied migration.

## Checkpoint — source-specific reconciliation, October 4, 2026

- Completed: investigated all 18 unresolved PDFs individually, measured embedded text and sampled first/middle/end. OCR only for three scanned sources; measured confidence shows handwriting/math corruption. No OCR-derived catalog content imported or approved.
- New deterministic adapters: SATakror unequal columns and explicit 101-answer key; SAToplam section-scoped number/answer tables and stacked regions; PrepPro Writing Chapter 12 two-column transitions and Chapter 13 full-width notes. Vector blanks, underlines/paired passages, truncated source fragments and uncertain regions remain excluded. Trusted CLI cap is 2,000 questions/4 MB; browser cap stays 500.
- Draft imports: PrepPro Writing 53, SATakror 54, SAToplam Reading 520, SAToplam Writing 340. Catalog total **1,789 SAT questions** (before 822), **56 vocabulary sets / 1,400 words / 56 passages / 559 exercises**. Exact repeats deduplicated within sources and against the existing ledger. Original Ultimate Grammar publication preserved.
- All 27 sources reconciled: 1 imported/admin-published; 8 imported needing review; 4 partially imported; 13 manual review required; 1 unsupported reference-only source; 0 failed. Full source-specific diagnosis, extracted counts, warnings, OCR samples and validation notes are in book-import-report.md. Remaining source content is not claimed imported.
- Applied additive migration: **20261004000700_question_import_provenance.sql**. Physical page and bounded JSON provenance stored on questions; private validated writer wrapper preserves metadata during existing edits. No reset or data deletion.
- Private resumable evidence: source-investigation.json, layout-sample-validation.json, source report/intermediate hashes under ignored local-imports. Run `node scripts/imports/check-source-layouts.js` for 42 independent raw-page checks across first/middle/end of each accepted topic; all pass.
- Tests: 65 unit/database tests, 40 browser tests, lint and production build passed; diff checks required before commit. No source text, images, PDFs or secrets tracked.
- Current milestone: administrator Content Review center. A new unapplied migration 20261004000800 and in-progress review components may exist in the workspace; they are NOT part of this source-import checkpoint. Verify/tighten review RPCs/RLS, audit and publication gating before applying.
- Unfinished: review overview/source detail, queue/edit/approve/reject/duplicate/defer, catalog inspection and run/audit history; real Settings; new DB/browser regression tests and complete validation; final documentation/checkpoint.
- Known limits: no safe automatic math OCR; vector blanks/underlining need admin-supplied visual references; unknown source inventories remain heuristic. History before this phase has only persisted source checkpoints; do not invent historical run timestamps or reviewers.
- Exact next action: finish and test the additive Content Review schema/UI, then apply 20261004000800 to linked project ileffhbbaomfimwulvpw; keep all new content draft. Next replace Settings and wire real preferences to vocabulary/study planning.

## Latest checkpoint — Content Review and Settings, October 4, 2026

This checkpoint supersedes older “current milestone” and “next action” entries.

- **Completed milestones:** source-specific reconciliation and draft imports; administrator source overview/detail, real catalog totals, paginated review/catalog filters (source, type, status, warning/duplicate, domain, set, confidence/search), persisted question/word/passage/exercise corrections, approve/reject/duplicate/defer, manual source transcription, audit and import checkpoint history; working student/admin Settings. Existing auth, RLS, homework, question player, vocabulary, progress and tab stability remain covered by regressions.
- **Current milestone:** implementation, production migrations and validation complete; stable checkpoint prepared for origin/main. Next work is administrator content review. No unrelated roadmap feature started.
- **Production project:** ileffhbbaomfimwulvpw. All additive migrations **20261004000700 through 20261004001400** applied. 007 adds question provenance; 008 administrator-only review/audit/history and publication gating; 009 account Settings; 010 manual source candidates/approval reconciliation; 011 safe changed-payload resume without duplicate books or empty topics; 012 visual/source-text validation; 013 physical-page approval validation; 014 preserves original vocabulary exercise types/pages and marks unstored passage pages unknown. Earlier migrations remain unchanged.
- **Books processed:** all **27** local sources accounted for. Complete supported imports: **9** (1 existing admin-published, 8 needing review); **4 partial**; **13 manual review required**; **1 unsupported** reference-only chart; **0 failed**. All 18 previously unresolved sources have individual diagnoses and first/middle/end sample reports. No unsupported source is claimed imported.
- **New draft SAT questions:** PrepPro Writing 53, SATakror 54, SAToplam Reading 520, SAToplam Writing 340; **967 added**, catalog **822 → 1,789**. All new questions remain unpublished. Existing Ultimate Grammar publication preserved.
- **Vocabulary imports:** unchanged **56 sets / 1,400 words / 56 supplied passages / 559 exercises**, still draft pending review. No source PDFs, extracted text, copyrighted samples, secrets or local-imports artifacts committed.
- **Production review state:** **4,964 pending records**, including **2,769 question records** (catalog plus excluded candidates), **1,400 words**, **56 passages**, **559 exercises**, **180 source diagnostic tasks**. **41** historical published question approvals preserved. **2 possible duplicates**, flagged rather than deleted. **0 OCR-derived catalog items**. **31 checkpoint snapshots** and **1,579 provenance-maintenance audit entries**; no invented historical import runs/admin identities.
- **Data QA:** found and fixed evidence-index lookup advancing inside Array.find. Repaired only the four new sources using persisted evidence and exact fingerprints, without re-importing questions or changing text, keys/publication. All **967 remote questions** match source content fingerprints, explicit answer keys, physical pages and parser metadata. **42** independently re-extracted raw-source beginning/middle/end-per-topic samples pass. **1,756/1,789** total questions have stored physical pages; **33 legacy questions** require explicit page verification before approval, and are flagged. Private source evidence survives under ignored local-imports.
- **Security:** review tables are SELECT-only to browser roles with administrator RLS; mutations use checked fixed-search-path RPCs with optimistic version checks. Student attempts to read/mutate review data fail in real PostgreSQL tests. Publication is blocked until catalog reviews are approved. Direct content edits/new source items invalidate approval and return a published source book to draft. Visual/underline/paired-passage and physical-page requirements block unsafe approval. Audit/system maintenance has no fabricated admin actor. Production audit: **0 public tables without RLS; 0 anonymous-executable definer RPCs**; private writer/seed/payload helpers have no browser execute grant.
- **Settings:** account display name and daily study minutes persist server-side. Daily minutes feed future Study Plan budgets and preserve today's/completed/started work, existing days and selected sets. Per-account browser preferences initialize actual vocabulary shuffle, test count and type; survive reload and logout/login. Email is read-only; the account bar remains the single logout action. Theme omitted because current styles do not provide a complete theme system.
- **Tests:** **69 unit/database tests passed; 50 browser tests passed**, including new review/source transcription/settings persistence/behavior/access/mobile checks and all previous suites. Lint, scoped formatting, additional changed-file Prettier checks, production build and diff checks passed at final checkpoint. No tests removed or weakened.
- **Known limitations / unfinished source work:** scanned/math layouts, vector blanks/underlines, chapter-local keys, missing source fragments and inconsistent math keys remain explicitly unresolved. Numeric/open response ingestion remains unsupported by the existing MCQ schema. History before this phase is reconstructed only from latest persisted source checkpoints, clearly labeled; earlier run deltas/times/reviewers are unknown. Transient CLI credential failure recovered on retry; migrations were ultimately applied, no user login required.
- **Review workflow:** docs/content-review-workflow.md. Source files/renderings remain local; review queue exposes diagnostics/candidates, not private filesystem links. Manual source transcription requires a page and an explicit verified answer, creates a pending candidate, and only a separate noted approval inserts a draft question. Reject/duplicate decisions are recoverable in audit history.
- **Exact next action:** administrators should open /admin/content-review, inspect sources and review/correct the draft catalog before publishing. For continued extraction, choose one documented blocker at a time (vector blanks/underlines in SAToplam or a chapter-specific math/Erica layout), preserve original source/key evidence and use the pending manual-review path. Do not rerun completed imports wholesale or resume unrelated roadmap work without a new request.
- **Audit commands:** `node scripts/imports/check-source-layouts.js`, `node scripts/imports/audit-source-provenance.js`, `node scripts/imports/report.js`. If metadata repair is ever necessary, `node scripts/imports/repair-provenance.js --apply` is idempotent, scoped to the four new partial sources and guarded by project/source/intermediate hashes and refuses published or manually reviewed sources. Do not modify its private intermediates manually. Changed parser payloads reuse an existing source book; exact repeats do not create empty topics; changed vocabulary imports require admin reconciliation instead of duplicating 1,400 words.
