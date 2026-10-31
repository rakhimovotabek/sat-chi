import test from "node:test";
import assert from "node:assert/strict";
import { accuracyGeometry } from "../src/features/learning/accuracy-geometry.js";

test("accuracy geometry preserves exact saved rates, valid zero values and missing-day gaps", () => {
  const chart = accuracyGeometry([
    { day: "2026-10-01", known: 10, correct: 7, accuracy: 70 },
    { day: "2026-10-02", known: 0, correct: 0, accuracy: null },
    { day: "2026-10-03", known: 5, correct: 2, accuracy: 40 },
    { day: "2026-10-04", known: 5, correct: 0, accuracy: 0 },
  ]);
  assert.deepEqual(
    chart.points.map((point) => point.accuracy),
    [70, 40, 0],
  );
  assert.ok(Math.abs(chart.points[0].y - 58.8) < 1e-9);
  assert.equal(chart.points[2].y, chart.baseline);
  assert.equal(chart.paths.length, 1);
  assert.equal(chart.paths[0], "M396 105.6 L588 168");
});
test("invalid and unknown rates never become invented points or bridged dates", () => {
  assert.equal(
    accuracyGeometry([
      { day: "invalid", known: 1, accuracy: 80 },
      { day: "2026-10-01", known: 0, accuracy: 0 },
      { day: "2026-10-02", known: 1, accuracy: 101 },
    ]).points.length,
    0,
  );
  const chart = accuracyGeometry([
    { day: "2026-10-01", known: 1, accuracy: 100 },
    { day: "2026-10-03", known: 1, accuracy: 0 },
  ]);
  assert.equal(chart.points.length, 2);
  assert.deepEqual(chart.paths, []);
  assert.equal(
    accuracyGeometry([{ day: "2026-10-01", known: 1, accuracy: 100 }]).points[0]
      .x,
    300,
  );
});
