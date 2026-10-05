# Algebra hierarchy and student visibility repair

The existing published book was repaired in the linked Supabase database, without re-extracting the PDF, recreating questions, or uploading assets.

## Hierarchy

Before: five empty root topics, each containing one identically named child with its questions (10 rows). After: the five populated children are roots (5 rows), keeping their IDs and original source order.

| Topic                                            | Direct questions |
| ------------------------------------------------ | ---------------: |
| Linear Equations in One Variable                 |              112 |
| Linear Functions                                 |              162 |
| Linear Equations in Two Variables                |              122 |
| Systems of Two Linear Equations in Two Variables |              121 |
| Linear Inequalities in One or Two Variables      |               72 |
| Total                                            |              589 |

The package contains systems and inequalities as its last two topics, rather than Nonlinear Functions and Nonlinear Equations. Source titles and question membership were preserved.

Before/after snapshots were deeply compared. All 589 question records, answers, explanations, image references and IDs were unchanged. All 3,163 stored assets were preserved, with zero reuploads. Existing progress (one practice session and 112 practice items), answer keys, attempts and activity were unchanged. Zero question duplicates were created. The 27 previously skipped review questions remain skipped.

The service-role repair is idempotent. Future package mapping also collapses a chapter with exactly one identically named topic while preserving meaningful distinct hierarchy. See [the reproducible workflow](book-package-import.md).

## Exact student visibility cause

The book was already published and readable to authenticated students. The catalog returned its ten topic rows, but student question queries returned zero questions. Migration 034 renamed the old eligibility function and created a package-aware function with its former name. PostgreSQL policies retain function identity when a function is renamed, so `student_questions` remained bound to the old helper. That helper rejected the package's image choices and open responses. Migration 037 explicitly rebinds the policy to the package-aware helper while retaining active-user and published-book checks.

This was a combination of redundant hierarchy and stale question RLS. The catalog does not filter out zero-direct-question books. Local student configuration and the linked database use the same Supabase project. A missing frontend deployment was not the cause of the zero readable questions. The initial owner-side readiness audit did not catch this authenticated student policy failure.

After repair, a real authenticated student query returns the published book, five flat topics and all 589 questions with counts 112/162/122/121/72. Private answer-key tables remain inaccessible to that student.

## Verification

- `npm test`: 103 unit/database tests passed, including student RLS, idempotent collapse, retained progress and future flat imports.
- `npm run test:e2e` with the four relevant Book Practice/package/attempt browser files: 20 tests passed.
- `npm run lint`, `npm run build`, and `git diff --check` passed.
- An existing confirmed student logged into the local app against the real database, opened Books and each of the five topics, and loaded all topic question lists. Images, image options, source explanations, grading, answer-dependent Explanation visibility and navigation were verified. At 390px, no horizontal overflow was observed.
- All imported stems are original image crops; no text-only question exists in this package. Ordinary text questions and absent-explanation behavior were verified with the existing browser fixture tests.
- Explanation opening created no check attempts. Only the five temporary sessions created by this verification were removed afterward; original progress remained intact.

The safe live results are in [the student verification report](algebra-student-live-verification.json). Backups and screenshots are private under ignored `local-imports/hierarchy-fix/`.

## Deployment

Migration 037 and the data repair are already applied to the linked database. No production frontend deployment was performed. The earlier image/open-response/Explanation frontend changes still require the project's normal hosted frontend deployment; the database hierarchy and RLS corrections themselves are live.
