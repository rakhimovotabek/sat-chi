import test from "node:test";
import assert from "node:assert/strict";
import {
  annotationKey,
  readAnnotations,
  writeAnnotations,
} from "../src/features/player/annotation-model.js";
const storage = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
};
test("drawings persist per user, session, question and panel; clearing only removes that drawing", () => {
  const local = storage(),
    key = annotationKey("student-a", "session-1", "q-1", "passage");
  const strokes = [
    {
      tool: "pen",
      width: 0.01,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    },
    { tool: "eraser", width: 0.04, points: [[0.15, 0.15]] },
  ];
  writeAnnotations(local, key, strokes);
  assert.deepEqual(readAnnotations(local, key), strokes);
  for (const other of [
    annotationKey("student-b", "session-1", "q-1", "passage"),
    annotationKey("student-a", "session-2", "q-1", "passage"),
    annotationKey("student-a", "session-1", "q-2", "passage"),
    annotationKey("student-a", "session-1", "q-1", "answers"),
  ])
    assert.deepEqual(readAnnotations(local, other), []);
  writeAnnotations(
    local,
    annotationKey("student-a", "session-1", "q-2", "passage"),
    strokes,
  );
  writeAnnotations(local, key, []);
  assert.deepEqual(readAnnotations(local, key), []);
  assert.deepEqual(
    readAnnotations(
      local,
      annotationKey("student-a", "session-1", "q-2", "passage"),
    ),
    strokes,
  );
});
test("invalid drawing data cannot feed unbounded or nonfinite coordinates to the canvas", () => {
  const local = storage();
  local.setItem(
    "x",
    JSON.stringify({
      version: 1,
      strokes: [
        { tool: "pen", width: 1, points: [[0, 0]] },
        { tool: "bad", width: 0.01, points: [[0, 0]] },
        { tool: "pen", width: 0.01, points: [[-1, 0]] },
        { tool: "pen", width: 0.01, points: [[0, 0.2]] },
      ],
    }),
  );
  assert.deepEqual(readAnnotations(local, "x"), [
    { tool: "pen", width: 0.01, points: [[0, 0.2]] },
  ]);
});
