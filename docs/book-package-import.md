# Structured book packages

Apply migrations through `20261004003900` using the existing linked Supabase project. No database reset is needed. Use the commands in README with the original ZIP, Node at the project's supported version, Python 3, and the existing authenticated Supabase CLI (`2.119.0`, already cached locally). Inspection alone makes no database changes.

The importer reads the archive's actual JSON and every asset, validates PNG signatures, chunk CRCs and compressed pixel data, verifies manifest counts, IDs, choices and supplied answer keys, and checks every asset reference. It skips any question flagged `needsReview` or listed in `review.json`. This import has no supplied corrections; none are inferred. Unexpected types, absent assets, inconsistent counts or missing valid keys stop the import.

`--apply --verify-assets` uploads every original PNG byte-for-byte into private `book-package-assets`, downloads each object to compare SHA-256, then sends the catalog JSON in service-role-only staging chunks and writes the complete book in one transaction. Staging is cleared by that transaction and never appears in Books. Asset paths contain package and asset hashes. No deployed URL uses Desktop, ZIP paths, or local checkpoints. Failed database writes leave no partial catalog; retries reuse the same asset paths and deterministic UUIDs. After a fully hash-verified upload, `--apply --resume-assets` reuses the matching private verification checkpoint and checks every object is still present before retrying the database stage. The book slug and fingerprint guard against duplicates and silently replacing a changed package. A changed package requires an explicit correction workflow.

Existing `books`, hierarchical `book_topics`, `questions`, `question_answers`, review records and practice snapshots remain authoritative. The source supplies five chapters, each with one identically named topic. These map to five populated root topic nodes; the redundant chapter/topic level is collapsed. Original chapter metadata remains in the private source package. Source ordering is retained, including gaps from skipped questions. Original package IDs, source IDs, question numbers (including null), pages, crop metadata, and all original JSON are retained. Original source JSON, manifest, review and provenance live in an admin-only package record; answer-bearing JSON is never placed in student-visible question metadata.

Open responses store their supplied accepted strings in private answer tables and copy them into private session keys. Grading compares trimmed strings to the explicitly supplied list, without invented rounding tolerances. Existing progress/analytics uses `selected_answer=0` as an answered marker for these Book Practice items; grading does not use that marker. Migrations 038–039 extend Question Bank eligibility to the same canonical package questions, copy frozen open-response keys into Bank sessions, and grade those responses through the existing attempt table. Native multiple-choice Check/retry behavior remains intact. Homework continues to use multiple-choice candidates because its frozen answer model does not support open responses.

Explanation visibility follows each practice item's current selection or persisted `has_answered` flag. Any choice unlocks it; correctness and submission are not prerequisites. Opening an explanation waits for the answer-save queue, calls an ownership-checked Book Practice RPC, and creates no answer/check attempt. Changing answers or revisiting answered questions preserves availability; new unanswered questions keep the button hidden. Missing explanations display exactly **Explanation is not available for this question.** Source image Markdown is rendered only as signed private images in source order; other text remains plain text. No HTML or AI explanation is generated. Assets and explanations use existing responsive player styling. Source stems and explanations also offer an enlargement dialog with bounded scrolling and image-size controls, so dense source text remains readable on mobile without changing the original pixels.

Validation includes unit/database tests for atomic imports, duplicate prevention, review skips, private answer access, per-question explanation gates, wrong-choice access, ownership, missing explanations, exact open-response grading and attempt isolation. Browser tests cover plain questions, image choices, explanation continuation images, unavailable messages, reload/navigation, open responses and desktop/mobile overflow.

To test the actual source crops as well, set `SATCHI_PACKAGE_DIR` to the inspected `local-imports/packages/<ZIP SHA-256>` folder and run:

```bash
SATCHI_PACKAGE_DIR=/absolute/path/to/checkpoint npm run test:e2e -- tests/browser/book-package-source.spec.js
```

The Algebra counts and all unresolved IDs/reasons are recorded in [the import report](algebra-package-import-report.json). All 27 skips are footer overlap/legibility flags and require supplied corrections or explicit review resolution before a later correction import.

The import publishes the validated book in the linked database. Frontend changes require the normal application build/deployment; this command does not deploy the hosted web application. No source questions, answers, or explanations were rewritten or generated.

## Existing hierarchy repair and student RLS

Migration `20261004003700` rebinds the student question-read policy to the current package-aware approval function. PostgreSQL policies bind function identities; the earlier rename had left the policy calling `question_approved_before_packages`, which excluded the package questions even though owner-side readiness checks returned true. A published book and its topics were readable, but authenticated students received zero questions and zero inventory counts. The catalog does not filter books by direct-question counts. The project `.env` and the import target both use `ileffhbbaomfimwulvpw`.

The importer now collapses a chapter with exactly one identically named topic. Genuine chapter/topic distinctions and multiple child topics retain their hierarchy. Existing redundant rows can be repaired without importing any content or uploading assets:

```bash
node scripts/books/collapse-package-topics.js --slug=algebra-official-sat-question-bank
node scripts/books/collapse-package-topics.js --slug=algebra-official-sat-question-bank --apply
```

The repair promotes the existing populated child, preserves its ID and all question topic references, and removes only its empty same-name parent. Private before/after backups prove that questions, answer keys, explanations, assets and existing practice history are unchanged. Repeating the repair does nothing. The five original source names are retained; the Algebra package's last two topics are Systems of Two Linear Equations in Two Variables and Linear Inequalities in One or Two Variables, not nonlinear topics.

For explicit live verification, run the local Vite application with its normal `.env`, then:

```bash
node scripts/books/verify-package-student.js --live --url=http://127.0.0.1:5200
```

This opt-in script authenticates an existing confirmed, active, onboarded student using an admin-generated login link without sending an email or changing a password. It uses the application's anonymous key and the student's JWT for actual RLS/API and browser checks. It opens the book, starts each topic, checks actual stem/choice/explanation image loads and final grading, and removes only the temporary practice sessions it created. Existing student history remains untouched. Screenshots/checkpoints stay under ignored `local-imports/hierarchy-fix/`.

## Legacy assets and live Bank/image verification

`node scripts/books/cleanup-legacy-assets.js --apply` backs up the database and Storage inventory, confirms that the only remaining book is Algebra, and deletes only legacy images/covers whose object paths have no reference in any public-table snapshot. It never touches the Algebra bucket, canonical questions, Vocabulary, Homework, users, or saved practice. Referenced legacy images are retained and readable to the owner of their Bank/Homework snapshot.

`node scripts/books/verify-bank-images.js --live --url=http://localhost:5173` uses an existing confirmed student account, without sending email or changing a password. It checks the real Bank catalog, canonical practice sessions, actual signed image requests, wrong/correct grading, explanations, refresh, logout/login, mobile and both calculator panels. Only its own temporary sessions are removed afterward. See [the four-fix report](algebra-four-fixes-report.md).
