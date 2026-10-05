# Algebra cleanup, Question Bank, images and calculator

## Live content and cleanup

The initial live audit found one book, five flat topics and 589 questions: only the current Algebra import. Its 589 approved question review records all belong to the Algebra import job. There were no old book jobs or stale old question review records to delete. Content Review's 2,550 approved records comprise 589 Algebra questions plus 1,961 legitimate Vocabulary items (1,400 words, 559 exercises and two passages). Vocabulary was preserved as requested.

After a private backup, cleanup deleted 1,238 unreferenced legacy Storage objects: 1,220 question images and 18 covers. It retained 366 legacy images still referenced by saved practice/Homework and one Vocabulary cover. These are still used by protected content. The Algebra bucket retains all 3,163 objects; no Algebra image was reuploaded, and no question was created or recreated. Database relationships remain intact.

## Root causes and fixes

- **Calculator:** Book Practice still used the legacy fixed floating window; the newer workspace was restricted to Bank sessions and fell back to floating/overlay on small screens. Book and Bank now share that existing component. Default docking occupies a real desktop grid track, while narrower screens stack the panel above the question in document flow. Explicit desktop float/drag/resize controls and SDK ResizeObserver remain available.
- **Question Bank:** `bank_candidates` required four nonblank text choices, excluding all package image choices/open responses. It now accepts package-ready questions through the same approval/publication rules and canonical IDs. Bank sessions copy private open-response keys, grade through the existing attempt system, and show image choices and source-image previews. Filters/facets use the same canonical rows. Native MCQ grading and Homework remain supported; unsupported open responses are excluded from Homework candidate selection.
- **Images:** the hosted `index-DVbU22d6.js` bundle lacks `book-package-assets` signing, `book_practice_explanation`, and the new calculator workspace; it uses the correct Supabase host. An unauthenticated browser-style request to a real private Algebra object returned HTTP 400, while the same student's signed URL returned HTTP 200 and decoded in the browser. The local frontend signs permanent private paths for stems, options and explanations. Bank rendering now uses that same component, and explanation-asset permissions recognize owned Bank sessions. Retained legacy Bank/Homework snapshots also receive owner-only asset access after their original book has been removed. No temporary ZIP/local paths or asset reuploads were needed.

## Verification

An existing real student saw all 589 Bank matches. Five real stems were rendered, including three MCQ questions with all 12 option images, one Bank open response and one Book open response. Wrong/correct Check behavior, source explanations, saved navigation, refresh, logout/login, mobile layout and both calculator panels passed. Opening an explanation recorded zero checks. Two successful-run temporary sessions, and the sessions from interrupted verification runs, were removed without touching existing history.

The full unit/database run passed 103 of 104 tests and caught a missing null-count guard. Migration 039 restored the guard; all 11 affected database/unit checks then passed. The relevant browser run passed 24 of 25 tests; the timed-out desktop drag test passed on its isolated rerun. A new Bank open-response browser regression also passed: 26 distinct relevant browser tests are passing across these runs. Lint, production build and diff checks passed. No huge suite was repeated.

Safe live results: [browser verification](algebra-four-fixes-verification.json) and [final data audit](algebra-four-fixes-data-audit.json). Backups/screenshots are ignored private files.

## Environment status

Migrations through 039 and asset cleanup are applied to the linked live database. Local frontend changes are built and tested, with the development server at localhost:5173. The hosted frontend remains the older bundle and still needs the normal production deployment. No deployment was performed. Local success does not establish that the hosted image/player/calculator problems are resolved.
