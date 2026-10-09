# Answer persistence verification

2026-10-09. **Verified locally; no new production verification or deployment.** The final combined run `npm run test:reliability` passed **66/66 checks, zero failures/skips**, in 302 seconds. This total includes unit, PGlite SQL, native SQL, and browser tests; it is not 66 hosted end-to-end tests.

## Verification boundary

`tests/real-user-reliability.test.js` runs the real Vite player in Chromium against actual PostgreSQL17.11/PostgREST14.1 with JWT ownership/RLS. It has twelve nested browser workflows. `tests/homework-pg17-workflows.test.js` adds four admin/student editing/delivery workflows. Dedicated large-session and JPEG tests add two focused browser/database checks. Auth login/refresh and Storage HTTP transport are isolated fixtures, not Supabase managed services. Tests independently query authoritative SQL state after HTTP acknowledgements; a saved badge alone never establishes persistence.

Three disposable student accounts and a separate admin are used. Their records exist only in throwaway clusters. Browser requests are checked for isolation; no production credentials, account fallback, or production data are used.

## Real browser/database results

| Scenario                                         | Result and database evidence                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text MCQ, image choice and open response         | Actual save response/revision acknowledged; stored selections/responses match; restored after reload, complete Chromium-process restart, logout and subsequent login.                                                  |
| Failed request, fast changes and navigation      | Unacknowledged drafts survive navigation/reload/logout and retry. Delayed requests do not produce a false saved state or clear a later edit.                                                                           |
| Commit succeeds but HTTP acknowledgement is lost | Server rows/revision survive. Reload reconciles the draft without duplicate writes or replaying an older answer.                                                                                                       |
| Two browser tabs                                 | Conflicting stale save returns HTTP409; winner remains stored, rejected draft remains available for review. Reload is required before explicitly overriding current data.                                              |
| Pending draft followed by browser close          | Persistent profile retains draft. Expired signed JWT returns401; fixture refresh through the SDK succeeds and recovery is acknowledged. Managed Auth revocation is not tested.                                         |
| Interrupted Homework submission                  | Rejected/aborted request leaves database incomplete. Retry completes once; student directory, admin report and persisted answers agree.                                                                                |
| Three students saving concurrently               | Distinct owned sessions retain distinct answers. Foreign session read returns no rows; foreign save is403. Bounded concurrency is three.                                                                               |
| Manual open review                               | Mark correct, Mark incorrect, Restore automatic grading persist across reload. Official/submitted response visible; student/admin metrics agree with SQL results.                                                      |
| Two books, including Reading/Writing             | Topic startup, passage display, wrong/correct Check, explanation, solved state and reload pass. Double Check records one attempt.                                                                                      |
| Book typed checked counts                        | Separate native browser/database regression passed without code changes: unchecked response excluded, wrong Check included, correction solved, topic count visible. The RPC already writes the legacy answered marker. |
| Question Bank                                    | Actual subject/book/difficulty filters, ten-question startup, Check and reload pass. A 500-question session also loads and persists.                                                                                   |
| History beyond API cap                           | Native PostgREST has a 1,000-row cap. A 1,001-attempt fixture restores all attempts; another Check adds the fourth and reload retains it.                                                                              |
| Separate database connections                    | Different-item writes both commit; same-item race has one winner and one stale rejection; Homework edit/save race retains or archives answers instead of overwriting.                                                  |
| Atomic/authorization safeguards                  | Batch conflict rolls back other items; withdrawal blocks read/save/heartbeat/finish; versionless legacy requests cannot bypass concurrency; private answer helpers reject students.                                    |

## Changes

- Bounded relational attempt-history requests replace 500-UUID URLs; stable pagination restores all Check history.
- Shared compatibility header fixes page-hide keepalive requests.
- Study-time frontend batching retains failed/unattempted entries and collects queued retries at execution. Session-specific queues avoid cross-session pending-map reuse. These tests do not prove exact server time credit after ambiguous lost acknowledgements.
- Historical Book progress aggregation preserves results/ownership and reduces measured staging cost.
- JPEG explanation references use the existing authorized image loader.

The existing answer outbox, explicit acknowledgements and revision protections were retained. No new silent loss of successfully saved answers was reproduced in the tested current implementation. Browser storage clearing/quota, OS process eviction, managed-token revocation and many-hour sessions remain outside the guarantee.

## Commands and evidence

Run `npm run test:reliability`; required binaries are version-checked and native tests cannot silently skip. For exact environment/restart details see [codex-reliability-handoff.md](codex-reliability-handoff.md).

Final log: `/home/otabek/satchi-release-backups/reliability-final-native.log`. Before/after reproduction logs: `reliability-large-transport-before.log`, `reliability-history-cap-before.log`, `reliability-history-cap-after.log`, `reliability-jpeg-before.log`, `reliability-jpeg-after.log`. Logs are outside Git. Broader unit/browser results and remaining failures are recorded in the handoff.

## Broader checks

- Full unit/PGlite run, serialized: **199 tests; 183 passed, 1 failed, 15 skipped**, 348 seconds. Native skips are separately covered by the explicit native runner; skipped backup/package-specific checks are not claimed as verified. The sole failure is the existing C13 book-reset protection error; no safety guard was removed.
- Scoped Playwright regressions: **90 passed**, 7.2 minutes, covering Books, Question Bank, Homework, Vocabulary, review, persistence, auth stability, reading layout, annotations and calculator controls. Most use mocked transport; two Homework journeys and manual-review cases use a SQL adapter. These are not hosted verification.
- Final build and scoped lint: passed. The subsequent SQL-only daily-counter correction has its native regression; frontend sources did not change afterward.
