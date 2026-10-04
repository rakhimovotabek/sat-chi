import test from "node:test";
import assert from "node:assert/strict";
import {
  planDays,
  performanceAreas,
} from "../src/features/learning/study-plan-model.js";
test("plan groups retain completed history and normal daily effort after missed days", () => {
  const days = planDays(
    [
      { study_date: "2026-10-03", minutes: 15, completed_at: "saved" },
      { study_date: "2026-10-04", minutes: 10 },
      { study_date: "2026-10-04", minutes: 20 },
    ],
    "2026-10-04",
  );
  assert.equal(days[0].completed, 1);
  assert.equal(days[0].missed, true);
  assert.equal(days[1].minutes, 30);
  assert.equal(days[1].missed, false);
});
test("attention and strong labels require ten answers and actual performance", () => {
  const result = performanceAreas([
    { domain: "A", attempted: 9, correct: 0 },
    { domain: "B", attempted: 10, correct: 5 },
    { domain: "C", attempted: 20, correct: 18 },
  ]);
  assert.equal(result.attention.length, 1);
  assert.equal(result.attention[0].domain, "B");
  assert.equal(result.strong[0].domain, "C");
});
