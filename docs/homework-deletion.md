# Safe Homework deletion — isolated acceptance

`20261031001400_safe_homework_deletion.sql` adds authenticated administrator RPCs,
private deletion audit snapshots, lifecycle/tombstone metadata, and pending access
and recurrence guards. Existing administrators have application-wide management
scope; this application has no school/tenant ownership model to infer. Anonymous,
student and inactive-admin calls are rejected. No raw browser writes are granted.

| Dependency state | Delete behavior |
| --- | --- |
| Draft/unassigned, no work/history | Permanently removes the unused definition and its assignment-only records |
| Assigned, unattempted | Removes pending assignments and unused snapshots; shared Books/Bank questions stay intact |
| Any started/submitted session, retained item history or started study task | Tombstones the definition, removes normal/pending visibility, retains sessions, keys, answers, original grade events and reporting |

Delete uses an explicit confirmation flag, transaction advisory admission lock,
then the existing definition → assignment → session lock order. It recomputes
actual dependencies under lock, so a stale preview cannot authorize cascading
away new student work. Retries return the original result after permanent removal
as well as after a tombstone. A separate `purge_deleted_homework` RPC requires
explicit permanent confirmation and rejects **any** retained work/history. It has
no ordinary UI button. Direct definition deletion is permission- and trigger-
guarded. No function disables RLS or changes scoring/grading policies.

The dialog shows the real title, individual/group audience, recipient count,
submissions and started attempts. A required checkbox enables Delete. Copy
explains permanence versus retained history, and the server can choose retention
if work arrives before the operation finishes. Native dialog focus/keyboard and
cancel behavior are preserved; pending requests cannot be canceled mid-write.
Success links to the retained results route when applicable. Deleted historical
reporting distinguishes canceled unsubmitted work from retained completed results.

One-time and recurring managers have Actions menus, Edit, Pause/Resume,
Archive/Restore and Delete. Restore returns to paused; archived recurring work
must restore before direct resume. Search and stable pages bound management
queries to 25 rows. Unlike the previous per-recipient list, unassigned drafts are
visible to administrators. Per-student details remain on the results route.

Deleted one-time work cannot be reactivated by group roster changes. Recurring
work stops generating future obligations; historical due days/submissions stay
in reports. Pending session URLs and further save/start requests are rejected,
including direct RLS reads of pending recurring instances. Submitted owned
sessions remain readable. Generated study-plan homework tasks are marked canceled,
kept as historical rows and omitted from pending counts; stale starts are blocked.
Parent/task locking follows Delete's order. No completion or grade is invented.

## Evidence

- Focused database/model/regression run **26/26 passed**, zero skips:
  `tests/homework-deletion.test.js` (11 subtests + parent),
  `tests/daily-homework.test.js`, `tests/homework-results-model.test.js`.
  Covers draft, assigned individual/group, paused, archived, recurring, completed,
  pending, unauthorized/inactive/anonymous, explicit confirmation, idempotency,
  purge rejection, retained raw grade/input/metric equality, roster non-recreation,
  recurring raw-read denial and canceled study-task retention. Existing daily
  pause/archive history regression also passes with the restore gate.
- `npm run test:homework:delete`: **1/1 passed**, zero skips. Real disposable
  Auth/PostgreSQL17/PostgREST, two independent administrator Auth clients and a
  student, actual browser confirmations, blocked unchecked confirmation,
  retained report, exact before/after saved inputs/grade events/canonical metrics,
  refresh/fresh login, paused recurring deletion through its real manager,
  three contended start/delete races, submission/delete race, duplicate deletes
  and unchanged shared source-question count. The race permits either legitimate
  lock winner and verifies that a returned session was never erased.
- Dialog tested at 1366/768/390px. Initial test found inherited table nowrap;
  a scoped dialog reset fixes text wrapping. Screenshots are original disposable
  data: [desktop](screenshots/homework-deletion/homework-delete-desktop.png),
  [768px](screenshots/homework-deletion/homework-delete-768.png),
  [390px](screenshots/homework-deletion/homework-delete-390.png).
- Lint/build pass; mechanical detector has no findings. Logs:
  `/tmp/satchi-homework-delete-regressions-final.log`,
  `/tmp/satchi-homework-delete-native-final.log`,
  `/tmp/satchi-homework-delete-lint-final.log`,
  `/tmp/satchi-homework-delete-build.log`.

The native deletion scenario uses real Auth/REST/database and fixture Storage/Edge
transports, which are not involved in deletion. The earlier real-service 12/12
acceptance covers imports/assets/multiplayer; no new full historical suite is
claimed for this milestone. The new migration depends on the pending preceding
migrations and was applied only to disposable copies. No hosted deletion,
production migration, real student write, push or deployment occurred.
