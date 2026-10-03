# Learning workflows

The existing authentication, onboarding, student management and book player are retained. New pages query Supabase; empty states represent missing records, not generated statistics.

## Administration

- **Groups:** create, rename and delete groups; search active students and add/remove memberships. Duplicate membership is rejected by PostgreSQL. The activity summary uses completed answers and recorded study time.
- **Homework:** choose active students, groups or everyone. Add up to 20 sections and combine random filtered selection with exact question selection. Assignment creation is a single transaction, including frozen content and answer keys. Missing questions or recipients roll back the entire assignment. Current UI lists the latest 200 assignment records.
- **Question Bank:** filter eligible content in PostgreSQL and retrieve 25 previews per page. Parent-topic filters include subtopics. Each new session freezes its question order and keys. The current player supports 500 questions per session, including the “All” choice. Timed practice permits 90 seconds per question, capped at six hours.
- **Vocabulary:** author books, ordered sets, words, supplied passages and four-choice test questions. Import validated vocabulary JSON. Student modes include word list, flashcards, meaning selection, supplied passages with clickable terms, and imported tests. Test answer keys are never returned before submission.
- **Monitoring:** click a student in the directory to view scores, groups, totals and recent activity. Homework attempts open read-only. The admin dashboard aggregates actual student records; administrator practice does not contribute to student totals.
- **Import status:** `/admin/imports` lists extraction reports, warnings, counts and actual import outcomes. This page never offers source downloads.

## Practice, results and reporting

Homework and Question Bank reuse the book player and its existing server grading. Current question, answers, eliminations and review marks persist. Submitted sessions include totals, accuracy and section breakdowns. Timed sessions use a server-enforced deadline; opening another tab cannot extend it. Expired sessions submit saved answers automatically when the player is open or resumed.

Heartbeats record capped active study seconds, pause while hidden/unfocused, and stop credit after two minutes without interaction. Last seconds are flushed on page exit. These measurements describe foreground interaction, not proof of attention. Flashcard/word-list study time is not yet included; vocabulary test sessions are tracked.

Progress groups completed answers by section/domain, skill, difficulty and source. Daily question totals and streaks currently use database UTC dates. Standings share names and calculated learning totals, never email or private profile fields. Current standings show the top 100 active students.

## Local sources

```bash
npm run import:inspect
npm run import:apply                  # prepare private SQL files only
npm run import:apply -- --apply       # execute against the verified linked project
```

Inspection reads only relevant files directly on `~/Desktop` and files directly inside `~/Desktop/Books`. It does not traverse Projects or other personal folders. `pdftotext` must be installed for PDFs. PDF/TXT extraction and existing book JSON are supported; DOCX/EPUB files are reported for review until an extraction adapter is supplied.

Artifacts live in ignored `local-imports/`: SHA-256 source fingerprints, intermediate JSON, validation reports and private SQL. The importer verifies the source hash again, validates JSON, checks that the linked project is exactly `ileffhbbaomfimwulvpw`, and imports through the authenticated Supabase CLI. No service-role key is used or stored. Each source imports transactionally and duplicate payloads reuse the existing book. Large or ambiguous extracts stay unimported; validated topic imports can be split into batches of at most 500 questions.

The initial run found 27 PDFs. **Ultimate Grammar Book** imported as an unpublished draft with 18 topics and 41 questions. All 41 question numbers, four choices, answer keys and worked solutions agreed. Difficulty remains **unclassified** rather than inferred. The other 26 sources, including Vocabook, need review for columns, keys, diagrams, or OCR. Detected counts on review reports are candidates, not verified question inventories. No vocabulary source was automatically inserted.

Review the grammar draft under Admin → Books before publishing it. Keep source attribution and resolve uncertain extraction before importing other files. Source PDFs are neither committed nor uploaded. No public export or download feature exists.

## Vocabulary JSON

```json
{
  "title": "Your supplied vocabulary book",
  "source": "Local source attribution",
  "published": false,
  "sets": [{
    "title": "Set 1",
    "words": [{"word": "supplied word", "definition": "supplied definition", "example": "supplied example"}],
    "passage": "Optional passage from the source",
    "questions": [{"type": "mcq", "question": "Supplied question", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]
  }]
}
```

Optional word fields: `synonym`, `translation`. Import up to 100 sets, each with 1–100 words, in a file under 4 MB. Meaning-selection practice requires four distinct definitions. Imported tests can express sentence completion, meaning selection or word-in-context using four choices. Matching exercises and automatic sentence generation are not implemented.

## Math tools

The reference sheet is available for Math questions. Desmos loads on demand through its official GraphingCalculator API, preserving calculator state when its modal closes. Obtain an approved key from [Desmos](https://www.desmos.com/my-api), configure `VITE_DESMOS_API_KEY` locally and in Netlify, then rebuild. See the [official API documentation](https://www.desmos.com/api/v1.12/docs/index.html). No demo key is included. Until configured, the calculator dialog links to the official Desmos calculator in a separate tab without changing the practice page.

## Security and deployment

Migrations `20261003000400` through `20261003000700` add the learning tables, scoped RPCs, constraints and indexes. All tables have RLS and anonymous grants revoked. Students cannot write content, assignments, grades, private keys, activity events or ranking totals. Own learning preferences use restricted RLS; practice writes and grading use checked server RPCs. Internal helpers have no browser execution grants. No new Edge Function is required.

Run `npm test`, `npm run test:e2e`, and `npm run build`. PostgreSQL tests execute all migrations in PGlite and test privilege escalation, ownership, keys, atomic imports, assignments, filters, generated vocabulary tests and calculated metrics. Browser tests retain auth/tab-switch coverage and exercise the new workflows with isolated intercepted API fixtures; these fixtures never seed the hosted database.

Netlify continues to build with `npm run build`, publish `dist`, and apply SPA redirects from `netlify.toml`. Existing Supabase frontend environment variables and OAuth callbacks remain unchanged. Private source artifacts and credentials stay out of Git and the production bundle.
