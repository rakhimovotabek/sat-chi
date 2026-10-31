# SAT’chi book packages, v1

The permanent format identifier is `satchi-book-v1`. Import through Admin → Books → Import Book. Legacy JSON import remains available separately. All new imports create private drafts. Publish is a separate atomic database operation. Admin book details include archive/restore and a validated JSON correction editor; hide a book before correcting it.

Required ZIP members: `manifest.json`, `questions.jsonl`, `review-report.csv`, `README.md`. Optional images live under `assets/` and are referenced by exact case-sensitive relative paths. Empty `assets/` directory entries are allowed. External URLs, HTML files, SVG, PDF, scripts, encrypted archives, split archives and ZIP64 are rejected. Use ZIP store or deflate compression. Limits: 32 MiB compressed, 96 MiB expanded, 8 MiB per member, 4000 members, 3000 questions and 200 parent-first topics, nested at most eight levels. Archives are never extracted onto the filesystem. CRC, declared sizes, paths and duplicate member names are checked. Images are bounded to 8 million pixels and 12000 pixels per dimension. PNG chunk CRCs and exact non-interlaced pixel expansion are verified; JPEG/WebP headers and dimensions are inspected. JPEG/WebP entropy decoding is not verified server-side.

Manifest fields:

- `format`: exactly `satchi-book-v1`.
- `book`: stable lowercase hyphenated `id`, `title`, `section` (`Math` or `Reading & Writing`), optional `author`, `description`, `cover` asset path.
- `rights`: `authorized: true`, nonempty `owner`, `license`, optional `provenance`. The uploader is responsible for accurate authorization.
- `topics`: ordered `{id,title,parent?}` records; chapters are root topics.
- `questionCount`: exact JSONL record count.

Every JSONL record includes `id`, `topic`, `type`, `text`, `domain`, `skill`, `difficulty` (`easy`, `medium`, `hard`, `unclassified`), `reviewStatus` (`approved`, `pending`, `rejected`) and `source: {reference}`. Optional fields: `image`, `passage`, `explanation`, `explanationImage`, `table: {columns,rows}`. Text uses the existing safe formatting renderer; arbitrary HTML is never executed. LaTeX source is retained; inline/display LaTeX is typeset through lazy-loaded KaTeX. Trusted TeX URL/HTML commands are disabled.

MCQ: `options` contains exactly four ordered `{label,text,image?}` records labeled A–D and `answer` is a zero-based integer. Empty choice text requires a separate image. Never place placeholder choices into the package. Open Math response: `acceptedAnswers` contains explicit numerical strings, including alternate fractions/decimals; omit `options` and `answer`. Source-defined precision should be represented by explicit accepted answers in this revision; interval/rounding configuration is not yet part of the universal format.

`review-report.csv` is a human-readable conversion report. The authoritative status is each JSONL record's `reviewStatus`. Pending/rejected content blocks publication. README describes source, authorization and conversion decisions. Identical ZIP retries resume the same job; changed bytes sharing a book ID are rejected to avoid accidental replacement. Canonical database question IDs survive retries.

Generate the original CC0 example with `python3 scripts/imports/create-universal-example.py`. The committed [example](../assets/examples/satchi-book-v1/original-practice.zip) contains text, image options, LaTeX source, numerical response, passage, explanation image and multiple chapters/domains.

## Conversion

Extract content only from authorized sources. Assign stable source IDs, preserve original choice order, classify questions, and verify every key against its source. Separate stem and option assets manually when crop boundaries are uncertain. Keep combined-image legacy questions in the existing review workflow until the real option crops are available. Export parent topics before their children, then one complete JSON object per question line. Include every referenced asset. Validate via the admin preview before importing. No inference repairs malformed packages.

## Local backend

Apply additive migration `20261030000100` only to a disposable Supabase instance. Serve `import-book` locally (`supabase functions serve import-book --env-file <local-only-env>`). Configure Vite with that instance's local URL and anonymous key. Never use the repository's hosted `.env` for this test. Service credentials remain inside the Edge runtime. The worker authenticates the JWT and checks the database admin role on every request. It stores the validated ZIP privately, uploads/verifies at most 20 assets, and writes at most 25 questions per step. Durable cursors permit resumption. Repeated question batches are transactionally idempotent.

The SQL-only test harness verifies insertion, draft isolation, publication, Question Bank eligibility, grading and retry identity. Full Edge/Storage/browser acceptance still requires a disposable Supabase stack; a passing SQL test alone does not establish that acceptance.

## Author validation and acceptance content

All JSON/JSONL/CSV/text members use UTF-8. Image-only choices use empty `text`
plus an individual `image` reference. Source IDs are qualified by the immutable
book identity when mapped to canonical database UUIDs.

Optional `assetDigests` maps each `assets/` member to its lowercase SHA-256.
When present, every asset must be inventoried and each digest is checked by the
same parser in the browser, Edge worker and CLI. Legacy packages without an
inventory remain supported; the CLI explicitly identifies them.

```bash
python3 scripts/imports/create-acceptance-example.py
npm run book:validate -- assets/examples/satchi-book-v1/acceptance-math-30.zip
```

The deterministic CC0 fixture contains 30 Math questions across four topics,
including a graph, triangle, passage, image-only options, LaTeX, signed SPR and
an explanation image. Math and Reading & Writing currently require separate
packages; this fixture does not establish mixed-section acceptance. The separate
acceptance-reading-6 fixture exercises Reading & Writing. The older
original-practice fixture is also Math. Multiple explanation
images and paired-passage records remain unsupported in universal v1.

The validator returns JSON with package fingerprint, counts, review totals,
missing explanations and digest status; failure returns JSON on stderr and exit
code 1. Conversion chats need no SAT’chi credentials: prepare these four members,
use the schemas in `docs/schemas`, include original or licensed assets, run this
validator, and upload the ZIP through Admin. Never guess an answer or mark an
uncertain record approved.
