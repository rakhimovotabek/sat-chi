# Admin performance acceptance

Implemented inside existing Admin → Homework → assignment results. SQL aggregation
and the native browser are exercised with original disposable content. Definitions,
privacy, samples, positive-time rules and rollback guidance are in
[analytics metrics](analytics-metrics.md#admin-homework-question-heatmap).

Commands:

```bash
node --expose-gc --import ./scripts/testing/release-memory.js --test --test-concurrency=1 tests/homework-performance.test.js
npm run test:sprint:native
```

No fabricated averages, cohort names, answer distributions or claims of group
strength appear. Fewer than five known results stays neutral with a small-sample
label. Initial grades are assessment-scoped; global canonical first attempts and
current/manual grades are different metrics. API rejects non-admins before
reading results. Homework grades/attempts and source keys are unchanged.

Native screenshots `test-results/native-admin-heatmap-{laptop,mobile}.png` contain
synthetic accounts only. One-time assignments are verified; recurring-occurrence
aggregation reuses the authorized report but still needs a dedicated fixture.
200+ question browser pagination, group filters, answer distribution, true dark
theme and entry motion remain unfinished. No production changes were made.
