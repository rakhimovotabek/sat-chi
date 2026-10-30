# Math corpus conversion — local metadata audit, 2026-10-31

**PARTIALLY IMPLEMENTED / BLOCKED**. Zero existing-question text conversions and
zero existing-question image crops performed. No source images/PDFs were read,
transcribed, extracted or published. No production connection was made.

Run the deterministic, network-free metadata inventory:

```bash
python3 scripts/imports/audit-math-corpus.py --packages /home/otabek/Desktop
python3 tests/math-corpus-audit.py
```

Private artifacts: `local-imports/math-corpus/inventory.csv` (every record) and
`summary.json` (reconciling totals). They contain no stems, choices or answer keys.
The script reads only `book.json` and ZIP member names, never asset bytes. Rights
must be supplied explicitly with `--rights /path/to/evidence.json`: map source slug
to `{"authorized":true,"evidence":"processing and publication authorization"}`.
The auditor does not convert or upload even when rights are supplied.

| Local package | Records | Composite MCQs | SPR | Candidate IDs | Rights blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| HardBook 2 | 487 | 307 | 180 | 180 | 487 |
| MathBook 2 | 1462 | 1062 | 400 | 1462 | 1462 |
| MathBook 3 | 418 | 308 | 110 | 418 | 418 |
| Total | 2367 | 1677 | 690 | 2060 | 2367 |

The local packages' declared totals reconcile with all enumerated records.
**Candidate IDs are not a current database count.** HardBook has 140 source IDs
used multiple times, spanning 447 occurrences (307 excess occurrences). The
inventory retains every occurrence with chapter/topic and flags identity collisions;
it does not deduplicate different questions or fabricate replacement identities.
Resolve against the actual canonical export before applying any repair. The
legacy `preparePackage` already rejects duplicate IDs; keep that safeguard.

Checked-in historical reports also name six other Math sources: 800 Challenge
(150), Advanced Math bank (518), Algebra bank (589), PrepPros Advanced (150),
PrepPros Complete (1263), Problem Solving bank (400). These lack local structured
packages here. Nine historical reports sum to 5433 rows, including MathBook 3's
historical 414 versus the current package's 418. These are historical metadata,
not proof of present database population or canonical uniqueness. College Panda
has a local PDF but no canonical record inventory in these reports. Source PDF
filenames were listed only; no extraction ran.

Already satisfactory/source-unavailable/failure counts across the **entire live
corpus remain unknown**. There is no safe isolated canonical database export here;
current database totals cannot be reconciled. The inventory covers all records in
every locally discovered structured legacy Math package, not every live question.
Rights restrictions take precedence over observed representation. All 2367 local
records remain rights-blocked, including SPRs which need no A–D conversion.

Next: obtain a sanitized local canonical export and verified processing rights;
reconcile IDs, package versions and source coverage; add authorized crop proposals
with hashes/coordinates, admin review and audited application. Keep original
assets, answer keys and historical attempts unchanged. Crop editor and batch
application remain unimplemented. Tests exercise rights failure, identity
collisions, count mismatch, SPR recognition, missing assets and LaTeX detection
using original synthetic metadata only.
