# Platform improvements — local review report

Status: **GO for local review; NO-GO for deployment.** Implementation and focused verification are complete. Hosted configuration and any production action require a separate authorized release. Nothing was deployed or pushed; no migrations or record changes were made on hosted Supabase.

## 1. Accuracy and attempt history

Implemented. Canonical per-student question facts preserve the earliest recorded checked outcome across Books, Question Bank and Homework. First-attempt accuracy uses known first outcomes; eventual mastery and current grading are separate. Retries and duplicate saves do not add attempted questions. Original Check events remain intact. New submission/review events are additive and private.

The 10-question regression remains **7 first correct / 3 first incorrect / 70% first-attempt accuracy / 10 eventually correct** after corrections. Historical first outcomes are reconstructed from Check logs and frozen original automatic grades where available. Final-only legacy snapshots remain unknown; reports explicitly show partial history. Pending manual grades do not become incorrect answers. Recorded initial pending submissions receive their earliest actual manual grade without changing the pending event. Homework tables and submitted session results distinguish current assignment grading from canonical first history.

Contract: [answer-statistics.md](answer-statistics.md).

## 2. Parent/subtopic and Question Bank progress

Implemented. The inconsistency came from aggregated canonical book counts versus answer hydration limited to the newly opened session's item IDs. Authorized, paged history RPCs now resolve prior activity through the canonical question ID and student owner. Overview states distinguish prior correct, prior wrong, corrected, and current checked activity. Previous answers and event history are visible separately; they never become a new Homework submission or overwrite current answers.

## 3. Whole-book practice and hierarchy

Implemented. “Practice Entire Book” creates/resumes a frozen, ordered, distinct-question snapshot. Meaningful sections remain; tiny topics use expandable original links without repeated prominent actions, and single-child delegation avoids duplicate buttons. Original topics, IDs, references and imported order are preserved.

Question metadata loads in 250-row pages beyond PostgREST's 1,000-row cap. The overview renders 100 navigation buttons per page with jump/last controls. Images load for the current/adjacent question. All frozen question metadata is retained client-side; this is bounded snapshot paging, not lazy question-content retrieval.

Read-only catalog inspection verified **15 published books, 403 topics, 7,931 questions**. Examples: 800 Challenge 150; PrepPros Complete Guide 1,263; MathBook 2.0 1,462. Local catalog fixtures retain public hierarchy/counts but use newly generated synthetic questions and test keys.

## 4. Administrator analytics and read-only review

Implemented. Students open detailed profiles with canonical totals, channel/domain reports and expandable book progress. Book review has paged overview filters, frozen question rendering/keys, selected answers, original results, corrections and available timestamps. Private RPCs authorize administrator/owner access; ordinary students cannot inspect another student. Save, Check and finish endpoints reject an administrator attempting to write another student's session. No editing controls exist in this viewer.

## 5. Password recovery

Implemented and tested against real isolated Supabase Auth v2.197.0, PostgreSQL 17 and an in-memory SMTP sink. Uses supported PKCE recovery and `updateUser`, generic email-request responses, matching validated passwords, explicit invalid/expired-link states and URL cleanup. Open the email in the browser/origin that requested it. No tokens or passwords are logged.

**Hosted redirect allowlist and SMTP delivery remain unverified and unchanged.** Exact future dashboard settings: [password-recovery.md](password-recovery.md).

## 6. Dashboard and SAT countdown

Implemented. Reuses the account's persisted test date with a separate validated IANA exam timezone. Convention: **00:00 at the start of the selected date, not an official exam start time**. Supports date editing, missing/past-date states and isolated seconds ticking without database requests.

Continue Studying, upcoming Homework, first-attempt performance, recent sessions, weekly recorded activity and weak domains navigate to real destinations. Weakness/trend claims require meaningful known-result samples. No projected SAT scores. Legacy session-start anchors are excluded from observed daily activity and hidden as answer timestamps.

## 7. Question Bank domains

Implemented as indexed, conservative projections: official Math and Reading & Writing domains plus explicit Other groups. Original domain/skill metadata and answer keys are unchanged. Ambiguous strategy titles stay in Other rather than being guessed into official domains. SQL facets honor current source/difficulty/history context; question rows are paged. The bank retains multiple difficulties, source, prior-result and review-mark filters.

## 8. Book previews

Implemented catalog cards with subject/title, question totals, eligible solved count, first-attempt accuracy, progress and Open/Continue actions. Existing cover URLs/private cover assets retain priority. Images are lazy decoded with bounded dimensions; signing is batched per catalog page. Broken/missing artwork falls back to a clearly labeled title preview.

Local-only exact-source first-page extraction prepared **9 WebP previews** (480×720 maximum, approximately 23–63 KB each). **6 exact-source PDFs were unavailable** and use placeholders. No first-question image substitution or fabricated covers. Assets/provenance are under ignored `local-imports/platform-book-previews/`; no upload or production book pointer changes were made.

## 9. UI and motion

Preserved SAT'chi navigation/identity. Added book-card focus/hover treatment, clearer compact topic hierarchy and dashboard spacing. Limited transitions use 180 ms and honor reduced motion. No animation dependency, image prefetch storm or active-question remount was added for decoration.

Local screenshots: [desktop dashboard](../local-imports/platform-dashboard-desktop.png), [mobile dashboard](../local-imports/platform-dashboard-mobile.png), [Books](../local-imports/platform-books-desktop.png), [Question Bank](../local-imports/platform-bank-desktop.png), [administrator student profile](../local-imports/platform-admin-student.png). These ignored artifacts contain disposable fixture data only.

## 10. Migrations and compatibility

New ordered migrations, rehearsed only on isolated databases:

| File prefix      | Purpose                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `20261015000100` | Immutable grading evidence and canonical first-attempt statistics |
| `20261015000200` | Shared canonical history and Bank status filters                  |
| `20261015000300` | Ordered entire-book snapshots and larger topic sessions           |
| `20261015000400` | Authorized student book analytics/read-only review                |
| `20261015000500` | Persisted exam timezone/countdown and real activity               |
| `20261015000600` | Conservative indexed Bank domain projections                      |
| `20261015000700` | Cross-channel first-history consistency and Homework reports      |
| `20261015000800` | Exclude inferred legacy activity timestamps                       |

Apply in order only after separate approval. Existing records/keys are preserved; no hierarchy merge or progress reset. Frontend changes require these migrations. The pre-existing, user-owned `20261013000100_long_written_responses.sql` is a local dependency included in rehearsal; it was not authored or committed in this task. Other pre-existing import/document changes remain uncommitted.

## 11. Verification

Checks used disposable accounts and isolated PostgreSQL 17/PostgREST, with real browsers. Initial failures and subsequent focused reruns are distinguished below; the full suites were not repeatedly rerun after their individual failures were resolved.

- Full unit/database diagnostic: 235 tests, 209 passed, 25 skipped, 1 old expectation failed. The failed unique-question weakness expectation was corrected; its focused rerun passed.
- Focused final statistics: 12 passed; subsequent historical-activity suite: 6 passed.
- Full browser diagnostic: **140 tests: 121 passed, 16 failed, 3 skipped**. All 16 initially failing cases passed focused reruns after correcting stale controls/labels/mocks. The calculator/affected-suite rerun passed all five calculator cases but had four Homework failures; the final serial Homework rerun passed **11/11**, including those four. No unresolved failure from these runs remains. Calculator tests now exercise existing title dragging and the supported resize handle; Homework history tests use the existing History summary control.
- Isolated PostgreSQL 17.11 / PostgREST 14.1 platform run: **39 passed, 1 fixture failure, 0 skipped**. The remaining restoration fixture correctly hit the existing save-before-Check concurrency guard. After adding the required save, its focused rerun **passed**, including exact 150/1,263/1,462 totals and dump/restore fingerprints for questions, keys, session items, Check history and grading events. No application protection was bypassed or weakened.
- This run includes the real Auth recovery flow, admin/student access boundaries, concurrent answer writers, Homework edits/group delivery, 20 complete browser restarts, all eight platform browser journeys, countdown query isolation and taxonomy facets.
- Running review workspace smoke: **passed**. Student and admin both show 70% first-attempt accuracy, the catalog renders 16 cards (15 source books plus one isolated fixture), actual private first-page previews load, mobile has no horizontal overflow, and the probe recorded zero browser errors/failed responses.
- Final lint: **passed**; production build: **passed**. No deployment was performed.

Evidence logs on this workstation: `/tmp/satchi-platform-full-unit-final.log`, `/tmp/satchi-final-statistics.log`, `/tmp/satchi-platform-browser.log`, `/tmp/satchi-browser-rerun.log`, `/tmp/satchi-browser-controls-final.log`, `/tmp/satchi-homework-browser-verified.log`, `/tmp/satchi-platform-verified.log`, `/tmp/satchi-platform-restoration-verified.log`, `/tmp/satchi-platform-review-smoke.log`, `/tmp/satchi-platform-verified-lint.log`, `/tmp/satchi-platform-final-build.log`. Earlier resource-constrained diagnostics were retained rather than overwritten.

Native commands fail if tools are missing rather than silently skipping. Default `npm test` uses serial execution and explicit post-test GC to bound PGlite memory on 4 GB laptops. Heavy browser and database suites should run sequentially.

## 12. Local commits

| Commit    | Change                                                  |
| --------- | ------------------------------------------------------- |
| `7b9163c` | First-attempt statistics and immutable grading evidence |
| `428574b` | Shared canonical practice history                       |
| `50e36c9` | Entire-book practice and compact topics                 |
| `8770ca9` | Authorized admin student book review                    |
| `abb580f` | PKCE email recovery and real isolated Auth              |
| `127b77f` | Persisted countdown and useful dashboard                |
| `083cd52` | Conservative Question Bank taxonomy                     |
| `e805b08` | Canonical channel/Homework first-history consistency    |
| `38039c0` | Honest historical activity timestamps                   |

No pushes. The report itself is recorded in a separate documentation commit.

## 13. Remaining limitations

- Unrecorded first attempts cannot be recovered. Legacy unknowns remain explicit; later correct results are not proof of initial success.
- Hosted SMTP/redirects, cover uploads and migration application require a later authorized release. Local Auth success does not establish real email delivery.
- Six preview source files are missing. Existing local source PDFs and generated assets are deliberately not committed.
- Local review questions, answer keys and demonstration domain assignments are synthetic; source hierarchy/counts are real public metadata. No real student data was copied. Production access during this work was limited to read-only schema/catalog transactions.
- Large sessions retain all question metadata client-side; image bytes and overview DOM are bounded. Existing practice has a 20,000-item safety bound.
- Restarting the disposable review process recreates its fixtures. Reloads and fresh login persist while that process runs.

## 14. Local testing and release decision

Current local review URL: **http://127.0.0.1:43463/login**. Local-only recovery inbox: **http://127.0.0.1:41981**. These exact ports belong to the running process; restarting prints new ports. Disposable logins: `student@fixture.invalid` and `admin@fixture.invalid`; initial password `disposable-test-only`. These accounts only exist in the isolated fixture.

```bash
npm run dev:platform
npm run test:platform
npm test
npm run test:e2e -- --workers=1
npm run lint
npm run build
```

Tools: PostgreSQL 17 at `~/.cache/satchi-test-tools/pg17/opt/pgsql-17/bin`, PostgREST 14 at `~/.cache/satchi-test-tools/postgrest14/postgrest`, Auth v2.197.0 (including its migrations directory) at `~/.cache/satchi-test-tools/auth2197/auth`. Override with `SATCHI_TEST_POSTGRES_BIN`, `SATCHI_TEST_POSTGREST`, `SATCHI_TEST_AUTH_BIN`. Development/test launchers never load hosted credentials. Preview preparation additionally needs the exact local PDF sources, Poppler and ImageMagick.

**GO for local review. NO-GO for deployment.** Review the working local features and historical-data semantics, then separately verify hosted Auth settings, review/apply the ordered migrations and decide whether to upload the prepared previews as part of an explicitly approved release. None of those production actions occurred here.
