# Battles acceptance — 2026-10-31

**VERIFIED BACKEND**, plus real native browser/network acceptance via
`npm run test:sprint:native`. PostgreSQL 17.11, PostgREST 14.1 and Auth v2.197.0
run locally with independently issued disposable sessions. No mocked REST/RPCs.

- Real network: complete 1v1 and 2v2, published source filters, natural server
  countdown/result deadlines, personal history, same-seat fresh-login recovery,
  replay protection, concurrent last-slot joins and nonmember rejection. Host
  departure transfers ownership; the new host can cancel.
- Actual student browser: select vocabulary book/set, create Typed Word Challenge,
  ready/start and submit the word. Server accepts normalized case/whitespace,
  scores once, hides the private word until reveal and awards no points for a
  wrong word. The bounded custom-count control is exercised with a complete one-round match,
  including its persisted typed response and score.
- Real HTTP: original Reading & Writing ZIP imported/published, then a passage
  battle graded with domain/book filters. This tests one round, not final R&W
  history. The committed package has six original CC0 questions.
- SQL regressions: complete 1v1/2v2/3v3/20-player games; all three vocabulary
  modes; multi-set pools; exact scores, capacity, deadlines, membership, host
  transfer, expiration, idempotency and history. These are sequential SQL roles;
  3v3/20-player concurrent network rooms are not yet verified.

Current-round points **and sort order** are hidden until ROUND_RESULTS; prior
scores remain visible. Math/R&W admission counts eligible published canonical
questions. Vocabulary now rejects impossible pools at creation, uses up to 32
selected sets and supports Meaning Rush, Reverse Meaning and Typed Word Challenge.
Typed grading is exact after Unicode NFKC, whitespace collapse/trim and case
normalization; no fuzzy matching or invented word definitions. Private accepted
words are kept in battle_rounds, omitted from active questions/snapshots.

Migration `20261031000500_battle_typed_vocabulary.sql` adds private pool/generator
helpers and patches the existing state machine. No second lobby system, answer
migration, backfill or public key-table access. Existing frozen matches retain
their snapshots. Migration prerequisites are asserted before patching.

Source/topic/difficulty controls reuse existing Books filters; vocabulary uses
published books and readable sets with title search. Realtime itself is still
**UNVERIFIED**: the native harness has no Realtime server and exercises authoritative
snapshots/polling. Storage and Node Edge-handler substitutions are described in
[native testing](native-sprint-testing.md). No full Supabase-stack claim.

Remaining: word matching, Quick Match, custom teams/kick/settings UI, total-match
timer, public rankings, failed-request transport throttling, longer typed and complete R&W
browser matches and real Realtime disconnect/reconnect/load acceptance. Battle
results remain separate from ordinary practice and Homework and award no XP.
