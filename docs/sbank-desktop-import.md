## Active implementation checkpoint (supersedes the original audit status below)

The user explicitly attests that these packages are copyright-free and authorizes publication. This is recorded as user attestation, with the original manifest provenance retained; no CC0/open-source license or independent creator verification is claimed.

Migration `20261031001500_sbank_source_isolation` is now applied (103 total). All65 protected production table fingerprints matched across this migration and compatible access was restored. A default-preserving `books.bank_source` field and source-aware candidate/query wrappers isolate `satchi` and `sbank`; selector key `college-board` is retained for compatibility. The original Books catalog excludes SBank backing books.

Prepared content: Math1,922 eligible questions plus3 duplicate candidates in review; R&W1,844 eligible plus1 ambiguous-choice candidate. Every joined image segment was verified pixel-for-pixel. Forty-question bounded ZIPs were generated (49 Math,47 R&W), with per-asset SHA256 inventories and deterministic archive IDs. All work files/assets stay outside Git.

Verified: focused SQL source/filter/grading/history test; actual PostgreSQL and authenticated browser practice test; seven source/answer-retention/responsive browser cases; transport tests proving stored-byte verification precedes checkpoints and corrupted storage prevents completion. Import uploads are bounded in the cloud; asset checkpoints advance only after verified storage and cannot regress. Draft creation uses the existing authenticated Edge/admin workflow. Imported questions are not automatically published.

Production draft staging is in progress. Private resumable state: `/home/otabek/satchi-release-backups/sbank-prepared/production-state.private.json`; prepared Math/R&W folders and import logs live alongside it. Two40-question drafts completed before the checkpointed transport optimization restart. The operator now resumes saved jobs without reuploading their ZIPs. Do not claim all records imported/published or live student acceptance until database counts and both hosts have been verified.

# Desktop SBank packages — complete local inventory; not imported

Production release remains `0c74db32e537a221daeb2bff76658cc4b6368f31`. Its restore,20 migrations (102 total, latest `20261031001400`) and both hosting deployments were verified in the production release report. No backup, migration, import, upload or deployment was repeated for this inspection. No production records were changed.

## Actual package inventory

| Measure | Math | Reading & Writing |
| --- | ---: | ---: |
| Questions detected | 1,925 | 1,845 |
| Multiple choice | 1,461 | 1,845 |
| Student-produced numerical response | 464 | 0 |
| Questions with explanation images | 1,925 | 1,845 |
| Questions with separate option images | 1,461 | 1,844 |
| Questions with multi-segment image blocks | 85 | 86 |
| Image-only stems | 1,925 | 1,845 |
| PNG asset files | 9,785 | 11,153 |
| Missing referenced assets | 0 | 0 |
| PNG signature/chunk-CRC/zlib-stream failures | 0 | 0 |
| Asset owner/role mismatches against package provenance | 0 | 0 |
| Duplicate record IDs | 0 | 0 |
| Exact stem/options content duplicate groups | 3 pairs | 0 |
| Explicit answer/option-mapping review exceptions | 0 | 1 |
| Questions imported | **0** | **0** |
| Questions published | **0** | **0** |

Every ZIP entry was read with CRC validation; every PNG's chunks and compressed image stream were checked sequentially without extracting the archives. No unsafe archive paths or duplicate ZIP entry names were found. All source ordering values are sequential. All464 numerical-response answer arrays have supported integer/decimal/fraction syntax and nonzero denominators. This does not independently prove that source answers or crop boundaries are correct. Original source PDFs are absent.

All records carry source-attributed domains, skills and easy/medium/hard classifications. No official difficulty has been inferred. The full domain/skill/difficulty inventory, source IDs, archive SHA256 hashes and asset anomalies are in [the machine-readable audit](verification/sbank-desktop-audit.json).

| Domain | Questions |
| --- | ---: |
| Algebra | 616 |
| Advanced Math | 540 |
| Problem-Solving and Data Analysis | 421 |
| Geometry and Trigonometry | 348 |
| Information and Ideas | 555 |
| Craft and Structure | 471 |
| Expression of Ideas | 398 |
| Standard English Conventions | 421 |

Math difficulty counts: easy685, medium630, hard610. R&W: easy611, medium624, hard610. Passages are embedded in stem images; all separate passage fields are null. Images preserve punctuation/formatting pixels; this audit does not certify transcription or accessible text. The existing skill spelling/capitalization variations are retained in the inventory.

## Exact content anomalies

Math duplicate stem/options image content occurs under different source IDs in these pairs:

- `sbank-math-d8539e09`, `sbank-math-f8ff3249`
- `sbank-math-d3f7c429`, `sbank-math-dd3a910a`
- `sbank-math-99c5e794`, `sbank-math-c048055c`

These are duplicate candidates, not records silently discarded. Explanations and source lineage may differ. No source IDs overlap between the packages. Comparison against existing production questions has not been performed.

R&W `sbank-rw-e3bbf2bf`, source page1177, lacks a verified D mapping: the fourth choice is nested below C without a D label. Its preserved review image `assets/sbank-rw-e3bbf2bf_unseparated_choices_review.png` exists but is not referenced by the normal stem/options/explanation arrays. A converter must retain it explicitly in the review record. Never fabricate its D option or publish it as answerable.

## Provenance and permissions status

Both supplied manifests attribute question metadata/rationales to College Board and explicitly state `unverified_third_party_reproduction_rights`, `open_source:false`, with no independent republication license provided. The README repeats this limitation. The user subsequently states that a Telegram seller created/reconstructed the questions based on College Board material and authorizes deployment. That user statement is recorded here; it does not change the files' attribution or provide a named creator/license granting student-facing republication. This audit makes no determination of legal ownership. Do not falsify the required owner/license fields or silently turn unverified provenance into an original/open-source claim.

## Import compatibility and remaining prerequisites

These archives are not compatible with the live importer merely because `schema_version` says `satchi-book-v1`:

- Actual importer requires `format`, nested `book`, topics, source rights owner/license, `mcq`/numeric record structure and verified answer mappings. The files use `book_id`, chapter metadata, `multiple_choice`/`student_produced`, letter keys and asset arrays.
- Archives are approximately217MiB/388MiB, with9,791/11,159 entries. The live importer permits32MiB ZIPs,96MiB expanded and4,000 entries. Raising global limits is not an acceptable streaming/import solution for a4GB laptop.
- A resumable converter must shard packages within limits, preserve collision-resistant IDs and lineage, preserve every image segment in order, retain explicit option roles, normalize verified numeric answers and stage the ambiguous record for admin review. No such converter has been claimed complete.
- Live SBank retains legacy selector key `college-board` but currently offers taxonomy/availability UI, not an isolated local question pool. Backend source isolation, source-aware bank RPCs/filters and wired SBank practice are required before publishing these records. Importing them through the ordinary Books path would contaminate the original SAT'chi Bank.
- Current publication-ready count is **not established**. All3,770 records are unimported; one has an explicit mapping exception and six Math records form three duplicate-candidate pairs. Rights/provenance reconciliation and technical integration apply to both entire packages.

No new student-facing SBank content exists on either host as a result of this task. No grading, explanation reveal, SBank counts, saved-progress or idempotent production import test can honestly be reported successful yet. Existing SAT'chi Bank was untouched.

Reproduce the read-only audit with:

```bash
python3 scripts/imports/audit-sbank.py \
  /home/otabek/Desktop/sbank-math.zip /home/otabek/Desktop/sbank-rw.zip \
  --output docs/verification/sbank-desktop-audit.json
```
