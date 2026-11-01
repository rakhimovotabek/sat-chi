# SBank Desktop import — production completion

Both packages are imported and the eligible questions are published in the separate **SBank** source on https://sat-chi.netlify.app and https://satchi.vercel.app. No eligible questions remain to import. Four records remain in Content Review.

| Measure | Math | Reading & Writing |
| --- | ---: | ---: |
| Detected questions | 1,925 | 1,845 |
| Imported questions | 1,922 | 1,844 |
| Published questions | 1,922 | 1,844 |
| Records requiring review | 3 | 1 |
| Exact-content duplicate groups | 3 pairs | 0 |
| Published numerical-response questions | 464 | 0 |
| Published questions with image-based answer choices | 1,458 | 1,844 |
| Questions with explanations, detected / published | 1,925 / 1,922 | 1,845 / 1,844 |
| Source PNG assets checked | 9,785 | 11,153 |
| Missing or corrupt source assets | 0 | 0 |
| Published domains / skills | 4 / 19 | 4 / 11 |

All 3,766 published questions passed draft acceptance against their supplied records: identifiers, source pages, ordering, domains, skills, supplied difficulty, correct-answer mappings, accepted numeric answers, question/choice images and explanations. This verifies faithful import of supplied keys, not independent mathematical solving of every question. Source difficulties are not presented as independently established official classifications.

The original archives exceed normal importer limits. Conversion produced 96 deterministic, bounded packages (49 Math, 47 Reading & Writing); the existing authenticated admin/Edge workflow imported these as drafts before validation and publication. All 20,938 source PNGs passed ZIP CRC, PNG chunk CRC and compressed-stream checks. All 177 joined image composites passed pixel-for-pixel verification against source segments. Passages, notation and formatting remain in source images; no fabricated OCR or guessed option crops were substituted. The final 20,644 registered private image objects all exist in Storage.

## Review records retained

- Math `sbank-math-f8ff3249`, source page 444: duplicate of `sbank-math-d8539e09`.
- Math `sbank-math-dd3a910a`, source page 1108: duplicate of `sbank-math-d3f7c429`.
- Math `sbank-math-c048055c`, source page 1033: duplicate of `sbank-math-99c5e794`.
- Reading & Writing `sbank-rw-e3bbf2bf`, source page 1177: fourth answer is nested below C without a verified D label. The unseparated source image is retained for review.

These four are pending in the existing Content Review workflow with source records/assets retained. They were not silently discarded or published with invented mappings. There are no other blocked eligible records.

## Source and provenance

`books.bank_source` separates `sbank` from the default `satchi`. The compatibility selector identifier `college-board` remains, with the visible label **SBank**. Backing SBank books are excluded from the ordinary Books catalog. Original SAT’chi Bank counts remain Math 5,503 and Reading & Writing 2,178; the original 15 published book IDs are unchanged.

Publication authorization is recorded as the user's explicit attestation and instruction. Original manifest attribution and conflicting rights metadata remain preserved. No independent ownership verification, CC0 license or original-content claim is asserted.

## Production migrations and verification

The existing production release backup/restore verification was reused. Production project `ileffhbbaomfimwulvpw` now has 106 migrations, latest `20261031001800`. This SBank release applied:

- `20261031001500_sbank_source_isolation.sql`
- `20261031001600_package_asset_lookup.sql`
- `20261031001700_bank_filter_fast_path.sql`
- `20261031001800_sbank_source_metadata.sql`

Protected production table fingerprints matched across the data-affecting cutovers; migration 18 replaces a function without rewriting existing student records. Source-aware indexed bank queries address the observed timeout without raising statement timeouts. Private asset lookup preserves explanation access restrictions, including denial after selection but before Check. Existing Google/Auth configuration was preserved.

Verified results:

- Focused source/filter/grading/history SQL tests, 23 before/after query-equivalence cases, universal-import compatibility, private asset authorization and bounded upload/readback integrity tests passed.
- Real isolated PostgreSQL/Auth practice integration and seven source/retention/responsive browser cases passed; the targeted Reset regression passed.
- Lint and production build passed. Subsequent changes are migration, operator, test and documentation files; frontend artifacts are unchanged.
- Ten authenticated live interaction checks passed across both domains: Math multiple choice, numerical response, Reading & Writing, private images, correct grading, explanations after Check and saved progress after fresh login. Zero browser page errors.
- Six final live checks passed across both domains: complete counts, both subjects, skill filtering, Reset source retention, refresh, light/dark and 390/768/1366px layouts. Zero browser page errors or horizontal overflow.
- Every domain, all 30 skills and supplied difficulty counts match prepared records. Original bank counts/catalog remain unchanged. Disposable student saved attempts increased by exactly the three verified answers.
- Replaying one published package from each source returned the same job IDs and published status. Before/after totals remain 96 jobs and 3,766 questions: no duplicate import.
- Four pending review records and 96 published SBank backing books confirmed. Removed only 96 temporary transport ZIPs; retained question images and original Desktop archives.
- Only the two disposable verification profiles were deactivated and their sessions revoked at closeout. Their accounts and historical results remain. No real student's records were edited for testing.

Private acceptance, live browser, filter, storage, repeat-import, cleanup and provider evidence is retained under `/home/otabek/satchi-release-backups/sbank-prepared/`; credentials and copyrighted image assets are excluded from Git. `final-host-verification.json` records the final exact release commit, provider deployment identities and matching live JS/CSS hashes after publication. The final release response supplies that immutable commit.

The earlier coordinated release's Books, Homework, Progress, Battles and safe Homework Delete checks are documented in [the production release report](production-release-20261031.md); those checks were not needlessly repeated during this content import. The current focused verification covers the SBank changes and their source, grading and progress boundaries.

Full original domain/skill/difficulty inventory, archive hashes and anomalies: [machine-readable inventory](verification/sbank-desktop-audit.json). Its raw inventory remains distinct from final production counts.
