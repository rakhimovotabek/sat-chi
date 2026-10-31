import test from "node:test";
import assert from "node:assert/strict";
import { performanceBreakdown } from "../src/features/learning/performance-breakdown.js";

test("breakdown sorts by known first-result accuracy rather than unknown history", () => {
  const rows = performanceBreakdown(
    [
      {
        section: "Math",
        domain: "A",
        attempted: 200,
        first_known: 100,
        correct: 100,
      },
      {
        section: "Math",
        domain: "B",
        attempted: 100,
        first_known: 100,
        correct: 90,
      },
      {
        section: "Math",
        domain: "C",
        attempted: 1,
        first_known: 1,
        correct: 0,
      },
      {
        section: "Math",
        domain: "D",
        attempted: 3,
        first_known: 0,
        correct: 0,
      },
    ],
    "domain",
  );
  assert.deepEqual(
    rows.map((row) => row.accuracy),
    [0, 90, 100, null],
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Math · C", "Math · B", "Math · A", "Math · D"],
  );
});

test("breakdown weights canonical counts and preserves section context in every grouping", () => {
  const rows = performanceBreakdown(
    [
      {
        section: "Math",
        skill: "Shared",
        attempted: "4",
        first_known: "4",
        correct: "3",
        incorrect: "1",
      },
      {
        section: "Math",
        skill: "Shared",
        attempted: "2",
        first_known: "1",
        correct: "0",
        incorrect: "1",
      },
      {
        section: "Reading & Writing",
        skill: "Shared",
        attempted: 1,
        first_known: 1,
        correct: 1,
      },
      { attempted: 0 },
    ],
    "skill",
  );
  assert.deepEqual(rows[0], {
    label: "Math · Shared",
    attempted: 6,
    known: 5,
    correct: 3,
    incorrect: 2,
    accuracy: 60,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].label, "Reading & Writing · Shared");
  assert.equal(
    performanceBreakdown([{ attempted: 1 }], "domain")[0].accuracy,
    null,
  );
  assert.deepEqual(performanceBreakdown([], "domain"), []);
});
