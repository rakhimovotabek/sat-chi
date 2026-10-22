# Authorized question-bank import architecture

This is a local design and executable validation boundary. It does not import
content or change database schemas. College Board questions are not bundled.
Read the [provenance/permissions report](college-board-integration.md) before
planning any dataset processing. No rights may be inferred from a PDF, book title,
website download button, review approval, or a validator result.

## Existing integration points

- `questions`: stable UUID, topic/position, section, domain, skill, difficulty,
  text/passage/stimulus, markup, ordered options, option images and provenance.
- `question_answers`: private MCQ index and explanation; `book_open_answers`:
  accepted text/numeric answers and supported answer formats/ranges.
- `book_import_packages`, `book_package_assets`, import jobs and content review:
  package provenance, checksums, private assets, review status and audit trail.
- Practice sessions/items/keys/open keys: immutable snapshots, answer revisions,
  eliminated options, marks, timing and per-item keys. Check/grade events drive
  first-attempt facts and analytics; identities must stay stable across channels.
- Existing bank candidates/facets: publication, review, eligibility, taxonomy and
  student-history constraints; these must still apply with a new source predicate.

## Preflight implemented now

`scripts/imports/authorized-question-bank.js` exports deterministic canonical IDs,
UUIDv8 identities, ordered-content fingerprints, an authorization gate, pure
dataset validation, and a local structured-JSON file preflight.

1. A trusted reviewer checks the actual written grant, intended deployment,
   audience, methods, assets, third-party rights, term and exact dataset bytes.
   The module records the reviewer, timestamp, evidence reference and SHA-256.
   These fields are assertions from a trusted operator, not cryptographic proof
   of legal authorization. No grant is included in this repository.
2. `validateAuthorizedFile(manifest, path)` checks rights **before reading**
   question bytes, then verifies their SHA-256 before parsing JSON. Missing,
   unverified, expired, future-dated or method/scope-mismatched grants fail closed.
   The default required uses are local-processing, local-practice and publication.
   Additional intended methods must be explicitly listed and independently
   authorized; there are no AI calls or AI-processing pipeline here.
3. A version-1 manifest identifies `source: "college-board"`, `assessment: "SAT"`,
   `datasetSha256` and `authorization`. The authorization repeats the source,
   assessment and checksum and includes `status: "verified"`, `reference`,
   `verifiedBy`, `verifiedAt`, optional `expiresAt`, `permissions` and
   `thirdPartyContentCovered: true`.
4. A question array uses opaque `externalId`, `assessment`, `section`, `domain`,
   `skill`, `difficulty`, `type`, `prompt`, optional `passage`/`stimulus`, ordered
   `options`, a type-specific answer key, `explanation` and optional `assets`.
   R&W is explicitly spelled `Reading & Writing` internally; an adapter must
   map the official header's `Reading and Writing` without guessing from files.
   Unknown taxonomy/difficulty is rejected instead of silently classified.
5. Rich blocks preserve `text`, `latex` and/or ordered `assetIds`. Assets carry
   an ID, relative `assets/` path, MIME, SHA-256 and accessible alternative text.
   Dangling references, duplicate asset IDs, unsafe paths and unknown MIME types
   fail validation. The future writer must separately verify actual asset bytes,
   sanitize SVG/markup, and test rendering; metadata validation alone is insufficient.
6. MCQ option IDs must remain A, B, C, D in source order. `correctAnswerId` must
   select one of them. Open Math questions have no options/MCQ key and explicitly
   list nonempty accepted strings; no answer is guessed or generated. Explanation
   includes `questionExternalId` matching its item and a valid content block.
   This validates structure/association, not the academic correctness of a key;
   source-key comparison and human content review remain mandatory.
7. Identity is `college-board:SAT:<opaque external ID>` (case preserved). A PDF's
   checksum/page/order, a book title and an export revision are not identity.
   UUIDs derive deterministically from that identity. Verified equivalent official
   IDs may be normalized only through an explicit reviewed alias table.
8. Duplicate external IDs, identical ordered content under different IDs, and
   changed content under an existing ID require review. Fingerprints include
   source-order choices, answers, explanation content and rich blocks/assets;
   formatting variants and reordered-choice semantic duplicates require manual
   review rather than an unsafe automatic merge.
9. Existing metadata supplied to validation contains `canonicalId`, `questionId`
   and `fingerprint`, never student answers. A previously mapped UUID is retained
   and reported as such. The report does not mutate either input or storage.
   It emits metadata/error codes, not question text, answers or explanations.

Reports have `blocked`, `rejected` or `validated-draft` status, evaluated/accepted
counts, indexed errors/warnings and identity/fingerprint records. Reject the
**entire** batch if any error exists; accepted records inside a rejected report
are diagnostic only. A validated draft never authorizes publication.

`tests/authorized-question-bank.test.js` contains synthetic examples of the exact
manifest and question shape. It never reads the Desktop PDFs. No unrestricted
command or PDF import adapter was added.

## Future persistence layer: required before activation

Implement these only after actual authorization and a reviewed dataset exist:

| Proposed relation             | Constraint / purpose                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `question_sources`            | Stable source slug, publisher, allowed assessment, status; default inactive; private authorization reference                                |
| `authorized_datasets`         | Source FK, version, exact dataset/asset checksums, evidence, reviewer/expiry, intended methods, validation/review status; private RLS       |
| `canonical_question_registry` | Unique `(source_id, assessment, external_id)` and canonical key; stable question UUID binding, revision fingerprint; no automatic rebinding |
| `question_source_memberships` | Source-to-question link and dataset/revision lineage; unique membership; retain original book/topic relationship                            |
| `question_import_runs`        | Immutable manifest hash, validator version, count reconciliation, indexed errors, reviewed duplicate resolutions and actor                  |

Keep records without an explicit verified membership in SAT'chi's existing
collection. Never classify a source from a title substring. College Board's
queries must require that membership, an active authorization scope, reviewed
content and normal eligibility/publication checks. Filter counts and practice
selection must use the identical server predicate. Unknown source slugs fail
closed. The frontend cannot provide trusted source/rights claims.

The server writer must run a transaction with advisory locks and uniqueness
constraints, revalidate authorization and asset hashes, stage draft rows, preserve
all choice positions and type-specific keys, record validation/audit results,
and roll back any conflict. No DELETE-and-reinsert/upsert-by-position strategy.
Existing package import approval is not a content license and must not be reused
as an authorization bypass. Publication is a separate reviewed step under the
actual grant; this task provides no publication endpoint.

Reuse `start_bank_practice`, the existing Player, snapshot keys, save/change RPCs,
review tools and reports. A future source filter is server-enforced and frozen
in the session; snapshots also retain source/dataset/external-ID/revision metadata.
Do not expose keys or explanations in preview/facet payloads. Preserve existing
owner/RLS, answer locking and explanation-unlock rules.

## Protect existing progress and avoid double-counting

Do not rewrite `questions.id`, snapshot `question.id`, item/session IDs, answers,
marks, grade/check events, revisions or first-attempt facts. Verified duplicates
across sources reuse the already-bound question UUID through memberships rather
than creating a second question. Source-specific reports scope owned sessions by
their frozen source; global reports count the canonical UUID once. Switching a
configuration source never transfers a student's answer or creates a session.

If old official-labeled packages have only book ordinals and no verified official
ID, leave their identities and progress untouched. Queue a reviewed mapping.
Ambiguous one-to-many or many-to-one matches block activation; they cannot be
silently collapsed or assigned a new UUID. Conflicting variants need versioned
content and a documented identity decision that preserves historical snapshots.
Legacy sessions with no source tag stay in the legacy SAT'chi scope.

Before enabling a dataset, prove source counts, no cross-source leakage,
idempotent imports, conflict rollback, retry behavior and unchanged existing
progress against a disposable database snapshot. Include a student who encountered
the same verified canonical question through Book Practice, bank practice and
Homework; global first-attempt accuracy must count it once while session history
and source-specific reports remain accurate. None of this future database
functionality is claimed to be implemented by the offline validator.
