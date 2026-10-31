# Vocabulary Word Matching

`20261031001000_battle_word_matching.sql` extends the existing Vocabulary pool,
round generator and Battle state machine. Four distinct stored word/definition
pairs form one round. Every participant receives the same frozen words and
shuffled definitions. A complete correct mapping earns 100 points; a wrong valid
mapping earns zero. There is no partial credit, invented definition or XP award.

Sources must already be published/readable and pass the existing content-review
gate. Book and up to 32 selected set filters are retained. Normalized word and
definition duplicates are conservatively reduced by stable source ID before
grouping; ambiguous duplicate records can reduce the eligible count. Four pairs
are required per round, with no source word reused within one match. Impossible
counts are rejected before lobby creation rather than padded with fake words.

Active snapshots expose the four words/source IDs and four definition strings,
but not the mapping, answer key or explanation. The server accepts only a JSON
permutation of the four definition positions, bounds the existing response size,
rejects missing/duplicate/non-numeric positions and grades against its private
frozen mapping. Private helpers are not executable by browser roles. Normal
membership, deadline and answer-idempotency checks are unchanged.

The interface provides four native labeled selects with unique-definition
selection and keyboard/touch access. The saved result displays actual word/
definition pairs, rather than a raw implementation mapping. Correct pairs appear
only at round reveal or in finished history. Source text and historical grades
remain frozen even if the live vocabulary catalog changes later.

## Actual verification

- **6/6 disposable SQL tests passed**: the new two-round/multi-set matching
  narrative plus all five existing Battle regressions (1v1, 2v2, 3v3, twenty
  seats, three older vocabulary modes, pool rejection/privacy/replay).
  Matching specifically checks count rejection, denied helper calls, malformed
  and duplicate mappings, private active keys, distinct pairs/no repeated words,
  withheld current-round scores, reveal and exact final 200/100 scores/history.
- **1/1 official-service two-browser test passed**: actual Auth sessions,
  published original vocabulary book/set selection, create/join/ready/start,
  rejected malformed direct HTTP mapping, correct host and deliberately wrong
  guest mapping, no early reveal, final 100/0 points, persisted response and
  human-readable pairs. No browser RPC interception. Real PostgreSQL/PostgREST,
  Auth, Storage API/file backend, Edge Runtime and Realtime run locally.
- Lint/build pass. Light/reduced-motion laptop/mobile captures are under
  `screenshots/word-matching/`. The mobile layout has no horizontal overflow.
  The mechanical detector reports no findings; this is not a broad accessibility
  or long-definition performance audit.

Commands: `npm run test:battles:matching` and
`node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/battle-word-matching.test.js tests/battles.test.js`.

The migration remains local and depends on the earlier typed Vocabulary/Battle
migrations. It adds only private helpers and forward patches, with no data
backfill. Remove the mode from the UI before any future rollback; preserve
helpers/state-machine branches needed to read or finish already-frozen matches.
