# Continuation acceptance — 2026-10-31

Full product acceptance remains unfinished. These are verified local milestones,
not a release-readiness claim. Branch throughout: `feature/universal-book-import`.
Starting HEAD was clean `b0c4072`. Ending implementation:
`f3ccc48a385012b7afb8db19fe3edf53e1bdecb5`; the documentation checkpoint commit
follows it (resolve with `git log -1`).

## Local commits

| Commit    | Verified milestone                                                               |
| --------- | -------------------------------------------------------------------------------- |
| `a960921` | Actual Supabase services, host lobby controls and recovery                       |
| `5c5b951` | Service acceptance checkpoint                                                    |
| `fa5aac0` | Whole-match timer UI, natural expiry and pool sampling parity                    |
| `1bdba1c` | Server-graded Word Matching and saved readable pairs                             |
| `68e0407` | Transactional compatible public 1v1 Quick Match                                  |
| `9df8029` | Accuracy trend, Dashboard/heatmap motion; complete R&W/Vocabulary HTTP histories |
| `f3ccc48` | Measured breakdown bars and known-denominator ordering                           |

## Import and actual isolated backend

Official Storage API **1.81.0** with its file backend, Edge Runtime **1.77.4**
with real user workers, and Realtime **2.143.3** run beside preserved native
PostgreSQL **17.11**, PostgREST **14.1**, Auth **v2.197.0**. SHA-256-pinned OCI
roots are cached locally and run through Bubblewrap. `wal2json` **2.7** was
compiled in the user cache. All listeners/targets are loopback, credentials are
disposable, inherited hosted settings are stripped, and logs redact secrets
before disk. No Docker/sudo/system service or project dotenv change is required.

The actual-service combined suite passes **12/12**: original 30-question ZIP,
six image assets, durable draft, denied student draft/staging/signing access,
public-download denial, correction/replacement upload/preview, retry, publish,
student private image decode, MCQ/SPR Check, post-Check explanation, resume,
Question Bank canonical UUID, hide/archive/restore and unchanged saved Check
history. A separate original six-question R&W ZIP also imports/publishes and
feeds a completed match and Question Bank.

**Boundary:** actual Storage file backend is verified; S3/MinIO/hosted gateway
configuration is not. Auth deliberately retains its separate local database and
matching disposable application UUIDs. Maximum ZIP/Edge resource benchmarking,
JPEG/WebP entropy validation, richer import diagnostics/recovery and integrated
content-review queue remain open. [Service setup and evidence](isolated-supabase-services.md).

## Battles

- Complete real Auth/REST **1v1, 2v2, 3v3** with frozen common rounds, saved scores
  and personal histories; private/public admission, capacity races, replay
  protection, host controls and same-seat fresh-login recovery.
- Actual two-browser **2v2** covers team swapping, settings, confirmed kick,
  balanced replacement, ready/start, offline/reload answer recovery and final
  scores. Host settings and decreasing whole-match clock have a separate browser
  test; the original lighter native mode also passes its browser regression.
- Actual **twenty-client** concurrent HTTP room: two rounds, exactly forty saved
  answers despite duplicate intents, 100 points per client/2000 total and twenty
  histories. Synthetic clients, not humans or a load benchmark.
- Actual member-only **WAL/WebSocket Realtime** revisions, with no outsider
  events. Payload is only battle ID/revision/time. Coarse heartbeat presence and
  polling fallback remain; live presence/restart/load testing is unfinished.
- Natural-clock **30-second** whole-match expiry preserves earned points and
  rejects late answers. No SQL clock manipulation. Per-question, total-only and
  friendly untimed settings have SQL coverage. Transitions reconcile on the next
  authorized RPC against saved server deadlines; no scheduler is claimed.
- **Math and R&W** finish exact saved network histories. R&W uses original
  passage/domain/book filters. **Meaning Rush and Reverse Meaning** each finish
  exact 100/0 HTTP histories; Typed Word Challenge and **Word Matching** have
  actual browser completion. Matching freezes four unique pairs, validates a
  complete permutation, privately grades and saves readable pair review.
- **Quick Match:** four concurrent Auth clients pair into two compatible public
  1v1 rooms; a Math pair finishes 100/100. Two browsers Quick Match a Vocabulary
  matching game and finish 100/0. Exact normalized source/mode/timer matching,
  retries, exclusions and authentication are tested.

Still open: complete browser R&W/Meaning Rush/Reverse Meaning journeys, failed-call
transport throttling, richer custom formats, host category/source edits,
dedicated rankings/XP and broader disconnect/load acceptance. No Battle result
rewrites practice/Homework grades. [Detailed evidence](battles-acceptance.md).

## Analytics, gamification and design

Progress now offers an actual daily accuracy line with genuine gaps, exact
sample table and 7/30/90-day subject selection. First-result accuracy counts
canonical first-correct / known first results across Books/Bank/Homework;
unknowns are excluded and corrections stay attributed to the first date.
The weighted summary is not an average of daily percentages. Its controls scope
that panel; the other cards/breakdown remain explicitly all time.

Dashboard bars animate the existing per-day distinct-check totals (repeat dates
can count again; this differs from platform-global first exposure). Progress
breakdown bars weight canonical counts and retain section context for domain,
skill, difficulty and source. Their previous sorting denominator differed from
displayed accuracy; both now use known first results, with unavailable rows last.
Small samples remain labeled rather than asserted weaknesses.

The real-service analytics narrative saves four Checks and one later correction
through actual Auth/HTTP, then backdates **only synthetic fixture timestamps**.
It verifies **75%** (3/4 known), one correction, daily **50/100/100%** with a gap,
and an exact **75% Algebra bar**. No time is inferred. Original Check rows remain
unchanged. Actual admin Homework verifies first two cells **100/0%**, six unknown,
small-sample/keyboard details, no replay, denied student aggregate access and
mobile time mode **No time**. Homework accuracy is the first recorded non-review
grade **within that assignment**, among submitted attempts, excluding skipped
and unknown first outcomes. Positive saved active seconds alone form time metrics.

Motion uses browser-owned transforms/clipped reveal in 750ms, without per-frame
React state/chart dependencies. It pauses offscreen/hidden and reduced motion
renders final geometry. Exact baselines/final values, table interaction, reload,
mobile overflow and normal/reduced states are tested. Four supplied reference
images were inspected for direction; their sample values/assets were not copied.
[Actual synthetic-account screenshots](screenshots/analytics) include Dashboard
laptop, Progress laptop/mobile, admin Homework laptop/mobile and breakdown detail.
Battle captures are in [real-services](screenshots/real-services) and
[word-matching](screenshots/word-matching). These are light theme, 1366×768 and
390×844. True dark theme, 768/1920 widths and a broad accessibility audit are open.

**Gamification:** no XP ledger, earning rule, level formula, new badge or Battle
ranking was introduced. No XP is awarded. Existing streak/learning Standings
semantics were preserved, not newly accepted as complete. Time cards show saved
values; time charts/counters, richer topic drilldowns, coherent cross-panel filters,
admin cohort KPIs and achievements remain unfinished.
[Exact analytics definitions and proof](analytics-metrics.md).

## Math corpus: exact boundary

No third-party text conversions or crops were performed in this continuation.
The preserved local metadata inventory covers **2367 occurrences**, consisting
of **1677 composite MCQs + 690 SPRs**, with **2060 candidate source IDs**.
All 2367 remain rights-blocked. There are **140 collision groups / 447
occurrences**, or 307 excess occurrences: 2367 − 307 = 2060. These are candidate
IDs, not verified unique live canonical questions. Actual unique totals, already
satisfactory/source-unavailable/manual-review/failure counts across the live
corpus are **unknown** without a sanitized canonical export and rights evidence.
Do not infer zero for unknown categories or rewrite historical IDs to reconcile.

Prior original synthetic evidence remains: two reviewed layouts → ten lossless
stem/A–D crops. Those are not existing-corpus conversions or new conversions in
this session. The bounded crop manifest/rights/hash/retry pipeline and audited
replacement mechanisms exist; full admin crop-review/reconciliation UI and
corpus application remain unfinished. [Per-package inventory and resume commands](math-corpus-conversion.md).

## Verification record

Counts below are per focused command, not additive coverage totals. Overlapping
matching/Quick and parent/subtests must not be counted as unique user journeys.
All listed final executions passed with zero skips.

| Layer                             | Command/scope                                                    |             Passing count |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------: |
| Unit                              | native environment, service logs, accuracy geometry, breakdown   |                         7 |
| Database                          | lobby controls                                                   |                         2 |
| Database                          | match timers                                                     |                         2 |
| Database                          | pool parity                                                      |                         1 |
| Database                          | matching plus five existing Battles regressions                  |                         6 |
| Database                          | Quick Match                                                      |                         1 |
| Actual services/browser/HTTP      | `test:sprint:services`                                           | 12 (11 subtests + parent) |
| Actual WebSocket/WAL              | `test:realtime`                                                  |                         1 |
| Actual HTTP                       | `test:battles:network`                                           |                         1 |
| Actual natural clock              | `test:battles:timer`                                             |                         1 |
| Actual two-browser                | `test:battles:browser`                                           |                         1 |
| Actual two-browser                | `test:battles:matching`                                          |                         1 |
| Actual HTTP + two-browser         | `test:battles:quick`                                             |                         2 |
| Actual HTTP                       | `test:battles:reading`                                           | 3 (two subtests + parent) |
| Actual browser + persisted SQL    | `test:analytics:native`, extended breakdown narrative            |                         1 |
| Default native browser regression | `sprint-native.js --battle-browser`                              |                         1 |
| Browser fixtures                  | accuracy-trend + performance-breakdown, one worker               |                         4 |
| Browser fixtures                  | original progress-activity regression after shared-chart changes |                         2 |

The daily-bar regression also passes after the final shared-chart change.
Full historical suite has not
been rerun. Failures encountered during development were fixed and retested:
service startup/roles/WAL path, fixture onboarding, timer120 option, strict quick
RPC payload, pool sampling parity, Quick SQL variable ambiguity, fixture study
preferences, exact float comparison, clipped-line endpoint, and browser selector/
Web Animations task races. No known failed final check is hidden by a skip.
Lint/build pass; mechanical UI detector reports no findings. Native services run
serially on **3816 MiB** RAM; no performance/peak-memory improvement is claimed.
Build Reporting chunk is ~41.6 kB (~10.9 kB gzip); initial chunk remains ~497.5 kB
(~144.4 kB gzip). These are build sizes, not runtime benchmarks.

Logs remain temporary under `/tmp/satchi-*.log`; durable reproduction is in tests,
scripts, screenshots and focused evidence documents.

## Release boundary and next work

New pending migrations in this continuation are `20261031000700` through `20261031001100`:
lobby controls, total timers, pool parity, matching and Quick Match. They depend
on all earlier Battle/auth/content/privacy/typed-vocabulary migrations. Analytics
uses the earlier progress/homework RPC migrations and adds no new data grants.
All were applied only to disposable databases. Some replace existing functions;
columns and helpers alone are not a complete rollback. A separately authorized
release needs isolated ordered replay, backup/review and the transport/hosted
checks above. Do not manually remove historical rooms/answers to roll back.

Next concrete tasks and exact commands are in [sprint-resume.md](sprint-resume.md).
**No GitHub push, deployment, hosted/production migration, production config write,
real student-record modification or real student-account test occurred.**
