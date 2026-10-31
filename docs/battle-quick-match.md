# Public 1v1 Quick Match

`20261031001100_battle_quick_match.sql` adds one authenticated RPC and a private
filter normalizer. It reuses the existing Battle rooms, memberships, readiness,
start gate, frozen question/word selection, timers, grading and history.

Quick Match finds or opens a **public 1v1** with the same category, question/round
count, per-question time, total budget and source/topic/mode filters. Empty
filters are normalized away; set/domain/skill arrays are sorted and deduplicated;
Vocabulary's default Meaning Rush mode is explicit. Selected different timers,
books, topics or modes cannot silently pair. Public discovery is intentional and
explained beside the button, regardless of the ordinary Create form's private
checkbox. Team formats use the normal Create/Join flow.

Matching configurations share a transaction-scoped admission lock. A retry
returns the caller's own compatible lobby, including when it has filled.
Otherwise the server locks a compatible open public room and joins through the
normal membership RPC, or creates one through normal pool/setting validation.
Private, expired, started, full and kicked-player rooms are excluded. Players
still mark ready; Quick Match does not automatically start a timer.

The RPC checks active authentication, bounded/whitelisted input, 1v1 format and
a persisted successful-call limiter. Failed database requests still roll back
limiter increments, as in the established system; a transport-level failed-call
throttle and wider load profiling remain release work. Browser roles receive no
new table grants. No historical score or student progress is backfilled.

Verification:

- **1/1 SQL regression passed**: private-room exclusion, compatible room reuse,
  normalized duplicate/empty filters, retry identity/full-room behavior,
  separate timer budgets, kicked-player exclusion, unsupported team rejection,
  impossible pools and invalid filters.
- **2/2 actual-service integration checks passed**, serially. Four distinct real
  Auth clients request simultaneously, form exactly two public 1v1s, retry into
  the same seats, reject cross-room reads and finish one Math game with exact
  saved 100/100 scores/history. A second test uses two actual browsers to select
  an original published vocabulary book/set, Quick Match with Word Matching,
  ready/start, submit correct/wrong pair mappings, reveal and review saved pairs
  at exact 100/0 points. No intercepted application RPCs.
- Lint/build pass. These are disposable synthetic clients, not a production
  capacity claim or twenty humans. The separate twenty-client acceptance remains
  documented in `battles-acceptance.md`.

Command: `npm run test:battles:quick`. Dependencies include the earlier lobby,
timer, pool-parity and Vocabulary migrations. These files are pending a separately
authorized release; no hosted migration/deployment was performed. The new RPC
and normalizer can be removed after removing the Quick Match UI; existing rooms
and saved histories continue using the established Battle state machine.
