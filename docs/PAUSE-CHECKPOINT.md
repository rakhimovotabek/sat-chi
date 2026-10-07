# Resumed checkpoint — 2026-10-07

Resumed at the user’s request. Migration 004 was corrected, tested and applied. Live Bank browser validation passes (Math 3627, Reading & Writing 2069). Verified content repair committed: 70 restored questions, 428 scalar choices across 122 questions; three further reviewed source questions already had correct approved keys and were preserved. Catalog audit: 5696 questions, zero unsupported answer UIs; saved snapshots: zero unsupported UIs and zero missing frozen open keys. See practice-content-repair-audit.json for IDs. Lint and build pass. No frontend or Edge Function deployment performed. All code remains uncommitted.

Historical pause state follows; its pending migration/repair notes are superseded by the paragraph above.

# SAT’chi pause checkpoint — 2026-10-07

User requested a safe pause for about 30 minutes. Resume only when the user returns and asks. No deployment is authorized. Preserve the uncommitted working tree and preexisting edits.

## Current state

- Frontend changes for outline answer states, homework editing, active-user soft deletion, saving/retry, embedded source choice rendering, and homework dock/float/resize Desmos are in the working tree.
- Shared linked Supabase project: ileffhbbaomfimwulvpw. Migrations 20261007000100, 20261007000200 and 20261007000300 have been applied. No frontend or Edge Function deployment was performed.
- Migration 20261007000400_bank_eligibility_and_thin_queries.sql is **NOT applied**. It is a draft with a known failing trigger. Do not push it before fixing and validating.
- Real homework session 654df1af-9187-4c8a-bacc-ff48c09d556a had five missing frozen open-answer keys. Existing keys were repaired by the applied migration. Global missing keys and unsupported snapshots were subsequently zero. A rolled-back real-session save of response 21 for source algebra-official-sat-question-bank_q_0569 succeeded; the verified answer is 25. Student answers were not changed by that validation.
- Sequential live Bank RPCs worked (Math 3557, Reading & Writing 2069, 11 source books), but concurrent browser Bank count/facet calls still reproduced a real statement timeout. This remains unresolved.
- Migration 003 maps explicit source SAT domain headings and preserves unknown strategy headings.
- Planned source content repair is **NOT applied**: 73 retained source questions and 428 scalar picture-choice transcriptions across approximately 122 questions. No new books were created/imported; no users/questions/books deleted. Prior content repair attempts used rolled-back transactions, including one timeout. The repair script was just changed to batch snapshot/pool updates; that change is unvalidated.

## Last completed validation

- Earlier scoped work: targeted unit/database tests and selected browser checks, lint/build/format/diff checks passed before the latest migration/script changes.
- Latest tests/practice-content-repair.test.js: 3 passed (scalar extraction safeguards, eligibility updates/privacy, explicit domain mapping).
- Latest combined homework-bug-fixes, book-package and book-resume-difficulties test run: 13 total, 9 passed, 4 failed. All failures report SQL 42702: ambiguous `id` in `public.bank_package_changed()` draft migration 004. Query: `select q.id from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=id`. Rename/qualify the PL/pgSQL variable on resume, then rerun targeted tests.
- Both outstanding local test processes finished before pausing. The localhost Vite server on port 5173 was left available. No ongoing agent task or scheduled automatic resume.

## Resume work

1. Fix draft migration 004 trigger ambiguity and validate package, homework, Bank eligibility/review lifecycle and resume tests before applying it.
2. After successful checks, resolve shared backend Bank concurrency timeout and verify real browser loading, counts, books and multi-difficulty selections.
3. Review scripts/imports/repair-practice-content.js and regenerate its plan/SQL after the batching change. Run rollback validation first, prove keys/progress/publication and source provenance remain intact, then apply only verified repairs to existing content. Do not invoke book imports.
4. Recheck real homework saving, missing-answer UI, retained choice imagery/formulas, review restoration and question IDs/counts. Finish relevant browser checks, lint and build.
5. Give the user's requested 20-item final report, accurately distinguishing completed fixes, applied/pending migrations and remaining limitations. Do not deploy.

## Evidence and helpers

- scripts/imports/choice-text-recovery.py: conservative labeled scalar PDF extraction; rejects stacked fractions/exponents/formulas and ambiguous labels.
- scripts/imports/repair-practice-content.js: retained-source recovery and original choice text replacements. Default SQL transaction rolls back; --apply commits. Inspect usage before running.
- local-imports/practice-repair/plan.json and repair.sql are ignored generated artifacts; regenerate after script edits.
- /tmp/satchi-live-bank-verify.mjs: real student read-only RPC/browser Bank verification; credentials remain in memory. Its last concurrent browser run failed timeout.
- /tmp/satchi-verify-backend.sql: rolled-back real-session save validation.
- /tmp/satchi-practice-read-audit.sql/json: snapshot/key audit.
- /tmp/satchi-{algebra,advanced,data}-choice-text.json and corresponding -bbox.xml: source transcription evidence.
- Retained package source: local-imports/packages/<fingerprint>/; original PDFs: /home/otabek/Downloads/AyuGram Desktop/.
- docs/practice-answer-ui-audit.json: prior embedded-choice audit.

Source recovery details: 70 official-source footer review flags have intact stem/choice crops; three additional retained questions have independently verified source corrections: Prep Advanced q0001 = 91/4 (22.75), Prep Advanced q0110 = 37/4 (9.25), HardBook Geometry q0111 = sqrt(341). These planned question restorations have not been committed to the database. Preserve original source review reasons and assets.
