# Administrator content review

Open **Admin → Content Review** (`/admin/content-review`). All data is live, paginated, and protected by administrator checks in the database. Student requests to the RPCs are rejected; RLS hides review records, import history and audit data.

## Inspect a source

Sources shows filenames, classifications, explicit outcomes, actual catalog counts, warnings and pending reviews. Search sources and use pagination. **Inspect source** opens parser/version, checkpoint date, diagnosis, page/OCR samples and review progress. **Review this source** filters the queue. **Open catalog book** uses the existing book/vocabulary editor.

Outcomes are independent of publication:

- Imported: complete supported extraction with existing administrator publication.
- Imported — needs review: complete supported extraction, still awaiting publication/review.
- Partially imported: a verified subset was imported; other structures remain unresolved.
- Manual review required: no catalog content was safely imported.
- Unsupported: source contains reference material without supported keyed exercises.
- Failed: an actual processing failure, not simply an unsupported layout.

Candidate/skipped marker counts on unsupported sources are heuristics, not a promise that every question has been inventoried. SAToplam region counts can include duplicate markers; printed key counts remain the source inventory for its supported sections. Logos/raster images and vector math/underlines are distinguished in diagnoses.

## Review decisions

The queue supports source, type, status, warning/duplicate text, domain, vocabulary set name, recorded confidence and content search. Catalog shows only records actually inserted, including vocabulary set size/passage/exercise counts. Pages contain at most 25 items. Open one item to see its supplied passage, choices, detected answer, physical page, parser and warnings.

- **Edit item** saves a validated correction and returns the item to pending. Questions reuse the existing editor; word fields and passages have dedicated forms. Missing answers require an explicit selection. Page corrections persist. Vocabulary exercises retain their supplied exercise type and use their explicit source page; passage pages are shown as unknown when the original schema did not store them.
- **Approve item** validates required content on the server. An item with warnings requires a note describing source verification/correction. Approval never publishes a book automatically.
- **Reject item** and **Mark duplicate** preserve the record and audit history. They do not delete catalog content or copyrighted source evidence.
- **Skip for now** marks a task deferred; it stays counted as awaiting review.

Each action checks the version shown in the editor. Refresh if another administrator has changed the item. Audit history retains the actor, time and before/after values. Direct edits through existing catalog editors also invalidate approval and produce audit entries. Editing, rejecting or deferring published source content returns its book to draft; review and publish it again explicitly.

Publication of an imported book is blocked while any existing catalog item is unapproved. Excluded candidates and source diagnostics do not prevent publication of an approved subset. Rejected catalog items must be corrected or removed through existing editors before publication; they cannot leak through as approved content. A new item added to an imported source is queued automatically.

There is no bulk approve-everything button.

## Unresolved / scanned sources

Source diagnostic tasks expose exact blockers and sample OCR confidence. Source PDFs and page renderings remain only in `~/Desktop/Books` and ignored `local-imports/`; the app provides no private filesystem/download links. Review original source pages locally. OCR confidence does not establish mathematical or answer-key correctness. No OCR candidate is auto-approved.

For recoverable excluded question candidates, correct the prompt, passage, choices, explicit answer, page and any essential HTTPS image/table reference, record how warnings were checked, then approve. Approval creates a draft catalog question under **Manually reviewed import**, preserving its source/page and audit record. Source-only diagnostic tasks can be rejected/deferred after investigation but cannot be approved as learning content.

For a source with no safely recoverable candidate, open its detail and choose **Transcribe a source question**. Supply verified text, choices, the printed answer and physical page. This creates a pending item tied to that source; a separate approval requires a verification note and adds it to a draft book. For bulk manual work, existing Books JSON import tools still preview and validate draft content. Do not guess keys or replace missing figures with text. Numeric/open responses and vector math layouts remain unsupported by the existing MCQ authoring model; preserve their diagnostics rather than forcing a conversion.

## Import history and resuming

Import history records source checkpoint snapshots: parser/version, catalog count at checkpoint, skipped markers, warnings/errors and outcome. Existing history was reconstructed from the **latest persisted checkpoint** only. Its original earlier run timing/deltas and historical reviewers are unavailable; the UI labels this explicitly. New checkpoint changes are recorded transactionally. Audit history is separate and records manual decisions/edits.

Trusted CLI commands (no PDF/text artifacts committed):

```bash
node scripts/imports/local-books.js
node scripts/imports/check-source-layouts.js
node scripts/imports/apply-local-imports.js --apply
node scripts/imports/report.js
# Explicit revalidation of one source only:
node scripts/imports/local-books.js --reprocess --source="Filename.pdf"
```

Completed hashes/parser versions are resumed. Exact source repeats and exact catalog duplicates are skipped; conflicting printed keys roll back that source. Normalized possible duplicates are flagged for review without deleting either record. The browser JSON cap remains 500 questions; trusted local imports allow 2,000 with the existing 4 MB/200-topic limits.

## Settings

Students open **Settings** (`/settings`); administrators use `/admin/settings`. Display name and student daily study minutes persist to the account. Changing the daily goal preserves today's work, historical completed tasks, study days and selected sets; future unstarted tasks are regenerated within the new budget. SAT/profile preferences remain in Profile and Study Plan.

Vocabulary shuffle, test size and test type persist per account on this browser and initialize the existing vocabulary learning controls. Storage errors are shown. Theme switching is omitted because the current styling does not provide a complete theme system. The existing account bar remains the single logout action.
