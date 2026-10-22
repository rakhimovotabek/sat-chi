# Local College Board Question Bank integration

Reviewed 2026-10-22. This change is local only. No deployment, push, hosted query,
content upload, database migration, publication change, or student-data update was
performed. Existing unrelated working-tree edits were preserved.

## Desktop PDF inventory and provenance

Both originals were found at `/home/otabek/Desktop/` using case-insensitive names.
Poppler successfully opened them and their signatures are `%PDF-`.

| File          | Pages | Exact bytes | PDF metadata                                                                                                                             |
| ------------- | ----: | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `math.pdf`    | 2,030 | 166,524,481 | PDF 1.4; Letter, 612 × 792 pt; unencrypted; no title, author, creator, producer, creation/modification dates or metadata stream reported |
| `english.pdf` | 1,977 | 108,040,852 | PDF 1.4; Letter, 612 × 792 pt; unencrypted; no title, author, creator, producer, creation/modification dates or metadata stream reported |

SHA-256:

```text
math.pdf     cb7f299a9701904f9f1113fe0f90c9d9f1050f915bf0fa8d1474da9790faaeb0
english.pdf  e4239714f66699afd1458d80657e9d58025ce936e5d8f29443b813ce3779f8f8
```

The read-only inspector examines metadata and five sampled pages per file
(Math: 1, 2, 1015, 2029, 2030; English: 1, 2, 988, 1976, 1977).
It emits only structural-label booleans, never question text. Text from those
pages exists transiently in the local subprocess and is discarded. No whole-file
text extraction, rendering into assets, copying, publication, or model processing
was performed. Originals are unchanged.

All sampled Math pages contain SAT/Math labels; all sampled English pages contain
SAT/Reading and Writing labels. All contain Question ID, Assessment, Difficulty,
Correct Answer and Rationale labels. These are consistent with question exports
**including answers and explanations**, rather than question-only exports.
This is a sampled structural finding, not validation of every page or answer.

The layout labels are consistent with College Board EQB exports. Authenticity,
download origin/date, assembly history, unique question counts, coverage of the
current bank, overlap between files, and rights remain unverified. Page counts
are not question counts. Missing author/title metadata cannot prove provenance.
The machine-readable evidence is [college-board-pdf-inventory.json](college-board-pdf-inventory.json).

Reproduce without emitting question content:

```bash
python3 scripts/imports/inspect-question-bank-pdfs.py
```

## Official classification and export verification

Visited the [official EQB](https://satsuiteeducatorquestionbank.collegeboard.org/)
and its ordinary public search form in a browser. No sign-in, access-control
bypass, scraping, or bulk question retrieval was used. The initial text-only web
view exposes a JavaScript shell; normal browser navigation exposes the controls.

- Assessment: SAT (the form also offers PSAT/NMSQT & PSAT 10 and PSAT 8/9).
- Section: Math and Reading and Writing. SAT'chi's existing internal spelling
  `Reading & Writing` is retained explicitly.
- Math domains: Algebra; Advanced Math; Problem-Solving and Data Analysis;
  Geometry and Trigonometry.
- R&W domains: Information and Ideas; Craft and Structure; Expression of Ideas;
  Standard English Conventions.

Domains above were verified in the public form. The complete skill mapping in
`src/features/learning/college-board-taxonomy.js` uses the
[official content specifications](https://satsuite.collegeboard.org/higher-ed-professionals/sat-validity/content-domains).
This includes the combined nonlinear-equations skill and the wording Text
Structure and Purpose / Cross-Text Connections. Command of Evidence includes
textual and quantitative evidence in the specifications; these are not invented
extra filters. No unverified finer subtopics or their counts are shown.

The [official domain guidance](https://satsuite.collegeboard.org/practice/content-domains)
confirms Easy, Medium and Hard difficulty. SAT'chi's Unclassified option remains
only in its existing bank. Difficulty and skill controls in College Board currently
save a selection; they cannot filter local questions because none are available.

The [official EQB Help](https://satsuiteeducatorquestionbank.collegeboard.org/help)
documents linked question codes in the ID# column, question detail rationales,
PDF selection and export. It offers three modes: no correct answers or
explanations; with correct answers and explanations; without answers or headers.
The first two include assessment, test, domain, skill, difficulty and optional
state-standard headers. This supports the sampled PDF format expectation.
The help was also read in the rendered browser; no question details were opened.
An attempted additional skill-control check was interrupted by a browser network
error; skill wording is therefore verified from the public specifications, not
claimed as a complete capture of today's result controls.

No official live total or claim of complete PDF coverage is made. Individual
official IDs, duplication, answer correctness and explanation completeness were
not exhaustively checked.

## Existing official-labeled records

The checked-in import reports and catalog snapshot contain three Math books.
These are historical local evidence, **not a fresh production inventory**:

| Book                                                           | Stable book UUID                       | Catalog fixture total (2026-10-16) | Import report accepted | Skipped in report |
| -------------------------------------------------------------- | -------------------------------------- | ---------------------------------: | ---------------------: | ----------------: |
| ALGEBRA - Official SAT Question Bank                           | `6b70f3f6-f00c-5a9c-ac6f-7d253e78503b` |                                616 |                    589 |                27 |
| ADVANCED MATH - Official SAT Question Bank                     | `b8173713-19fe-58e9-a9af-62616f035627` |                                540 |                    518 |                22 |
| PROBLEM-SOLVING AND DATA ANALYSIS - Official SAT Question Bank | `f5493c07-6723-5f39-abfc-9b50f9eb0a1d` |                                421 |                    400 |                21 |

Sources: `tests/fixtures/platform-catalog.json`,
`docs/algebra-package-import-report.json`,
`docs/advanced-math-official-sat-question-bank-package-import-report.json`, and
`docs/problem-solving-and-data-analysis-official-sat-question-bank-package-import-report.json`.
Fixture totals include source/review counts and differ from historical accepted
counts; neither is presented as today's live availability.

Their slugs, source filenames, package fingerprints, source page references and
`import_metadata.package_question_id` provide provenance. Example IDs use a book
slug plus a local ordinal, not a verified College Board question identifier.
Package import uses deterministic UUIDs (`stableId(q.id)`) and slug/fingerprint
guards; duplicate package IDs are rejected. These mechanisms cannot establish
cross-book or Desktop-PDF semantic deduplication. No per-question copyrighted
content was loaded into this model for that purpose. Cross-source duplication
and missing official identifiers remain open audit work after authorization.

The historical reports describe image-based stems/options, both MCQ and open
responses, and explanations for each accepted item. Merely labeling a book
Official does not establish a College Board origin or a publication license.
Nothing was relabeled, copied into the new tab, republished, unpublished, or merged.

## Interface and progress preservation

SAT'chi Bank is the initial default. The rounded source selector has a blue
selected border, keyboard focus ring, reduced-motion support and responsive
layout. Selection changes React state without navigation or a document reload.

The shared configuration component retains the existing bank query/start RPCs,
preview, book selector, contextual counts, taxonomy projections, progress filters,
timing and practice player. Each visited source workspace remains mounted while
hidden, preserving disclosure/page state during switches. No practice engine was
duplicated. Source configuration survives reload within the same browser session:

| Key                                        | Meaning                                                   |
| ------------------------------------------ | --------------------------------------------------------- |
| `satchi.bank.<student UUID>`               | Existing SAT'chi filters, count and timed flag; unchanged |
| `satchi.bank.<student UUID>.college-board` | Separate College Board configuration                      |
| `satchi.bank.<student UUID>.source`        | Last source in this browser session                       |

A route preset opens SAT'chi Bank. New browser sessions default to SAT'chi.
Storage failures do not prevent switching. No answer-storage keys are touched.
College Board never calls bank/facet/start RPCs or renders SAT'chi question rows.
It displays unavailable counts (em dashes), disabled practice/history/mark filters,
source metadata and a direct official-bank link. No PDF is in public assets or
the application bundle.

Existing progress is recorded against owned session/item IDs, immutable question
snapshots, check events and grade events. First-attempt facts group on the frozen
question UUID, with practice-kind scoping where appropriate. This change does
not write those records, change canonical UUIDs, or alter analytics/RLS/functions.

## Authorized-import readiness and permissions

[The architecture](authorized-question-bank-architecture.md) and tested offline
preflight are ready for review. There is deliberately no PDF adapter, database
writer, authorization grant, publication toggle, or automatic import in this
feature. Additional server-enforced storage/RPC work is required before enabling
an authorized dataset. UI selection alone can never serve as authorization.

College Board's [permission instructions](https://privacy.collegeboard.org/copyright-trademark/request-instructions)
restrict reproduction and state that SAT materials are not currently offered
for commercial licensing, including test-prep settings. Their
[permission form](https://privacy.collegeboard.org/copyright-trademark/request-form)
expressly excludes use of copyrighted content with generative AI and AI training.
The [SAT Suite program agreement](https://satsuite.collegeboard.org/k12-educators/educator-experience/student-data-privacy-agreement)
describes a limited classroom/internal-reporting license and restrictions on
online reproduction, including third-party material. The agreement is directed
at participating schools; its existence is not proof that SAT'chi holds a grant.
Export/download availability does not establish rights for app republication.
The instructions permit ordinary website links; no College Board logo is used.

No authorization covering the proposed processing, hosting, display, answers,
explanations or third-party passages was supplied or established. No request was
sent on the user's behalf. College Board local practice remains unavailable.

## Local verification

See the validation record below and the dedicated tests. Browser fixtures use
synthetic questions only. The isolated interactive preview uses real disposable
local Auth/PostgreSQL/PostgREST and synthetic practice content, never production.

```bash
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 \
  tests/authorized-question-bank.test.js tests/question-bank-taxonomy.test.js \
  tests/practice-persistence.test.js tests/first-attempt-statistics.test.js
npx playwright test tests/browser/question-bank-sources.spec.js \
  tests/browser/learning.spec.js tests/browser/answer-persistence.spec.js \
  tests/browser/practice-tools.spec.js --workers=1
npm run lint
npm run build
npm run dev:platform
```

Initial focused unit/database run: **24 passed**. Initial expanded browser run:
**31 passed, one timed out while showing Checking your account** on the unrelated
Mistakes route. That exact existing test passed on isolated retry (3.5 seconds);
no application or test change was made to address it. New source tests passed at
1440, 390 and 320 px, including keyboard focus, minimum 48 px source controls,
source independence, reload, no reload during switching, saved answers and marks,
and no horizontal overflow. The first focus probe was corrected to use actual
keyboard navigation, as programmatic focus after a mouse click does not require
`:focus-visible`. No UI defect was inferred from that initial probe.

Local captures: `local-imports/college-board-{1440,390,320}.png` and
`local-imports/college-board-isolated-{desktop,mobile}.png` (ignored artifacts).
The isolated real-Auth preview also had no page errors or mobile overflow.
Final source suite: **6/6 passed**, including saved review marks and answers.
Across focused runs, **53 distinct browser cases passed** (the existing auth
timeout described above passed on retry). Additional coverage included Pen on
Book/Bank/Homework, touch/stylus drawing, MCQ/open explanations, ordered image
options, Question Overview, resume/timing and administrator student analytics.
A source-progress assertion was narrowed to exclude the study timer's legitimate
elapsed-seconds flush when leaving practice; all answer/progress fields remain
compared. Night Light stayed Warm through a source switch and reload in the
isolated real-Auth preview. Lint, build, scoped Prettier and `git diff --check`
passed. Final SHA-256 checks matched both original PDF hashes.

Additional focused browser commands:

```bash
npx playwright test tests/browser/question-bank-sources.spec.js \
  tests/browser/study-workspace.spec.js tests/browser/annotations.spec.js \
  tests/browser/book-explanations.spec.js --workers=1
npx playwright test tests/browser/practice-attempts.spec.js --workers=1
```

Full-suite, production, live Desmos service availability, authorization and exact
screenshot matching are not claimed; no reference screenshot was accessible.

UI skills used: ui-design Build and ui-verification; loaded aesthetic-direction,
design-guidelines, colors, buttons, navigation, form-controls, responsive-design,
section-layout, verification session-setup/evidence-output, and viewport-stress,
console-network/theme-locale-matrix probes. Scoped rendering, focus, overflow and
runtime checks were run; a full axe/theme/locale/performance audit was outside
this focused change.

Running preview: **http://127.0.0.1:36931/question-bank** (sign in first).
Disposable local login: `student@fixture.invalid`, password `disposable-test-only`.
Restarting `npm run dev:platform` recreates its data and prints a new port.
