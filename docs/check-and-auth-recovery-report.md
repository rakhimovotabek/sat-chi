# Check and browser-restart verification

Work resumed from e06ea61. No production request/data change, migration, deployment or push. **NO-GO: browser-restart storage loss remains reproduced after the launch configuration correction.** Final verification results are recorded below.

## Check: reproduced application defects

The apparent refresh was not a document navigation. Successful Check called `state.reload()`; `useContent` switched to loading, and Player replaced the workspace with ContentState. That detached the reference/options/explanation DOM. QuestionImage then signed private URLs again on remount. Vite StrictMode duplicated signing calls. One native reference-image reproduction recorded **0 document navigations, image detached, 2 signing requests, 1 repeated image request**.

Check now reconciles authoritative data in the background, retaining the workspace and question position. Failed refresh preserves visible feedback/images and provides a distinct retry. Other useContent callers retain foreground loading behavior, and background retention is limited to matching dependencies/session. Authoritative version reads and stale-write protection remain.

Two synchronous clicks also reproduced an independent race: React's checking state had not yet disabled the button; a second callback entered and could send an event ID cleared by the first. A synchronous ref guards entry, and the attempt ID is captured before awaits. The button explicitly uses type="button". No form submission, router navigation, or authentication reset was needed to reproduce either Check defect.

A late background response also reproduced a race: a newer answer acknowledged while the read was in flight could be replaced by its older snapshot. Reconciliation now preserves only higher server-acknowledged revisions from the persistence controller; unsaved drafts still use the recovery outbox. A native regression holds an actual PostgREST response, saves another answer, verifies its SQL row, releases the older response, and checks that both UI and database keep the newer answer. Database compare-and-swap protections remain unchanged.

## Images

Signing promises/URLs are deduplicated in memory, scoped to the authenticated owner, bounded to128 entries, and expire after55 minutes against a requested60-minute capability. Errors do not poison the cache; Retry invalidates it. Logout/account changes clear capabilities and discard signing results from an earlier account epoch. Nothing privileged or persistent is added to the browser.

Only the immediately following question is preloaded (one reference plus up to four choices). At most10 Image objects are retained; repeated preload URLs are skipped. Loading/signing failures remain local to the image and never block Check. Existing source formats/path validation, frozen references, RLS and Storage authorization are unchanged.

Native post-repair checks covered reference images, four image choices and open response: **0 document navigations, 0 image detachments, 0 signing requests and 0 image requests during Check**. Before elapsed measurement860ms; corrected complete-run samples reference621ms, four image options102ms and open95ms. These are observed action/settling spans, not controlled provider-TTFB benchmarks or guarantees of production latency.

The local Storage transport returns a small PNG fixture. Offline archived image copies were inspected only in aggregate: PNG p95~82.5KB/max439KB; JPEG p95~66.4KB/max123KB; WebP p95~28KB/max46KB. Copies span several archives and are not unique production asset counts. No proven need to recompress immutable original assets was established; none were changed/reimported. Real CDN latency/cache headers, compression quality and original-pixel comparisons remain outside this verification. The measured repeated signing/remount waterfall has been removed.

## Restart: confirmed configuration defect, unresolved storage loss

The original first failure was the owned-practice button assertion immediately after closing/relaunching a persistent Chromium profile. The workflow had checked MCQ/image/open save acknowledgements and SQL rows. This Homework journey does not press Check, so its failure is independent of the Check teardown.

The complete pre-correction run reproduced251 checks:241 passed,10 failed (first recovery failure, dependent steps and parent),0 skipped. Instrumentation showed Auth present before shutdown, but absent on the restarted browser's **first** storage reads, with no recorded auth-key removal. This does not demonstrate a lost database answer or application sign-out after reading a valid session.

The browser launch log then exposed duplicate --disable-features switches. The custom --disable-features=BackForwardCache replaced Playwright's default list, losing default profile-close/partitioning safeguards including DestroyProfileOnBrowserClose. Playwright already supplies --disable-back-forward-cache. Removed the redundant overriding flag from the native launch sites; no Auth application code, assertions, waits, revision enforcement or permissions were weakened.

The installed Playwright chromiumSwitches source explicitly disables DestroyProfileOnBrowserClose. [Chromium's profile-manager implementation](https://chromium.googlesource.com/experimental/chromium/src/+/refs/heads/main/chrome/browser/profiles/profile_manager.cc) documents that disabling this feature prevents profile unloading. The precise Chromium internal write/unload instruction that lost the session was not observed. **The corrected full run reproduced the recovery failure again. The invalid launch flag was a real configuration defect, but its removal is NOT a verified fix for storage loss.** No unsupported SDK workaround was implemented.

Regression coverage checks the actual running browser command line through CDP: exactly one --disable-features list containing the profile-close safeguard, plus the standalone back-forward-cache flag. It asserts storage restoration after both immediate process close and explicit tab close, across16 fresh profiles. Original native restart assertions remain unchanged. No storage-state injection, forced login, arbitrary delay or relaxed assertion was used. An earlier8+8 experiment passed even with the old flag, illustrating the intermittent nature; that passing experiment was not used as proof of a cure.

## Persistence and evidence

`tests/check-recovery-native.test.js` uses actual Vite/Chromium/PostgreSQL17/PostgREST14. It verifies server acknowledgements, revisions and persisted attempts; MCQ/image/open feedback; a held Check request and synchronous repeated clicks; injected post-Check read failure and retry without detachment; navigation during refresh; genuine reload, logout/fresh login; and20 browser-process restarts. Only failure injection and Auth/Storage HTTP transport are fixtures. Successful application REST/RPC responses are not mocked. `tests/real-user-reliability.test.js` additionally covers multiple students/books, completed sessions, stale concurrent tabs, lost acknowledgements, expired fixture JWT, Homework delivery/submission and admin grading against SQL state.

Before correction, isolated13-check journeys and many restart repetitions passed while the complete suite failed. Final full-run results take precedence over those targeted successes.

Verification results:

- Corrected complete unit/database/native suite: **253 checks, 243 passed, 10 failed, 0 skipped**, approximately 12.9 minutes. The first restart loses browser Auth storage; dependent failures cascade. This run preceded the final late-snapshot reconciliation and accessible save-status label changes.
- After those final changes: focused persistence/cache unit regressions **14 passed**; actual PostgreSQL17/PostgREST/Chromium Check suite **5 passed**, including 20 process restarts and authoritative database assertions.
- Latest native measurements: reference Check624ms, four-image choices78ms, open response78ms; each recorded zero document navigation, detachment, signing or image requests during Check.
- Scoped Playwright browser rerun: **44 passed, 1 failed (45 total)**. Previously failing image-save locator and Bank open-response Check tests now pass. The remaining SQL-backed two-tab recovery test failed at the stale tab radio selection (`check` did not retain checked state); its exact isolated rerun **passed (1/1,18.7s)** with unchanged assertions. This remains an intermittent unresolved test failure; isolated success does not erase the failed suite. Private evidence: check-final-two-tab-rerun.log. The suite uses HTTP fixtures/PGlite for this SQL-backed case and is distinguished from the real PostgreSQL17 tests above.
- Final full lint and production build: **passed**.

The full suite was not repeated again after the small final reconciliation change: the unresolved first-read Auth storage failure already prevents GO, and bounded targeted verification conserves the user's remaining usage budget. Targeted restart successes do not supersede the complete-suite failure.

Private logs under /home/otabek/satchi-release-backups/: check-recovery-before.log, check-recovery-final.log, check-auth-complete-unit.log (captured original failure), auth-restart-serial-diagnostic.log (Chromium flags), check-auth-final-complete-unit.log, check-auth-final-lint.log, check-auth-final-build.log. Final focused logs: check-final-persistence-unit.log, check-final-reconciliation-native.log, check-final-scoped-browser.log, check-final-lint.log, check-final-build.log.

No new migration is needed for these two repairs. The previously reviewed090003→090004→090005 remain pending, with their original release safeguards. Production/managed Auth and Storage smoke verification remains an authorized-release checkpoint, not a claim of this isolated testing.

Local source/test commit: `5c1deef`. No push or deployment. Remaining blockers: complete-suite Auth restart storage loss and intermittent SQL-backed two-tab browser selection failure; production Storage initial-load latency remains unmeasured.
