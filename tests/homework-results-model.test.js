import test from "node:test";
import assert from "node:assert/strict";
import {
  answerStatus,
  resultTotals,
  resultStatus,
} from "../src/features/learning/homework-results-model.js";
import {
  readNightLight,
  readNightLightLevel,
  applyNightLight,
  nightLightKey,
} from "../src/lib/night-light.js";
test("results distinguish open unanswered/ungraded/manual decisions and withdrawal", () => {
  const i = {
    question: { question_type: "open" },
    selected_answer: null,
    selected_response: "  ",
  };
  assert.equal(answerStatus(i), "Unanswered");
  i.selected_response = "1/2";
  assert.match(answerStatus(i), /Pending/);
  i.correct = false;
  assert.equal(answerStatus(i), "Incorrect");
  i.correct = true;
  assert.equal(answerStatus(i), "Correct");
  assert.equal(
    resultStatus({ active: false, completed_at: "2026-01-01" }),
    "Completed",
  );
  assert.equal(resultStatus({ active: false }), "Withdrawn");
  const totals = resultTotals([
    {
      active: true,
      session_id: "x",
      completed_at: "date",
      correct: 2,
      incorrect: 1,
    },
    { active: true, correct: 0, incorrect: 0 },
    { active: false, correct: 0, incorrect: 0 },
  ]);
  assert.deepEqual(totals, {
    eligible: 2,
    started: 1,
    completed: 1,
    pending: 1,
    accuracy: 67,
  });
});
test("Night Light persists preference, toggles root only and tolerates unavailable storage", () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    };
  const classes = new Set(),
    root = {
      dataset: {},
      classList: {
        toggle: (key, on) => (on ? classes.add(key) : classes.delete(key)),
      },
    };
  assert.equal(readNightLight(storage), false);
  applyNightLight(true, root, storage);
  assert.equal(readNightLight(storage), true);
  assert.equal(values.get(nightLightKey), "warm");
  applyNightLight("extra-warm", root, storage);
  assert.equal(readNightLightLevel(storage), "extra-warm");
  assert.equal(root.dataset.nightLight, "extra-warm");
  assert.ok(classes.has("night-light"));
  applyNightLight(false, root, storage);
  assert.equal(readNightLight(storage), false);
  assert.ok(!classes.size);
  assert.equal(readNightLight(undefined), false);
  assert.doesNotThrow(() => applyNightLight(true, root, undefined));
});
