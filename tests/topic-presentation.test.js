import test from "node:test";
import assert from "node:assert/strict";
import {
  compactTopicChildren,
  delegatesToOnlyChild,
} from "../src/features/books/topic-presentation.js";
test("compact presentation groups tiny leaves while preserving meaningful sections", () => {
  const tiny = Array.from({ length: 150 }, (_, n) => ({
    id: String(n),
    parent_id: null,
    questions: [{ count: 1 }],
  }));
  assert.equal(compactTopicChildren(tiny, null), true);
  assert.equal(compactTopicChildren(tiny.slice(0, 3), null), false);
  assert.equal(
    compactTopicChildren(
      tiny.map((t) => ({ ...t, questions: [{ count: 100 }] })),
      null,
    ),
    false,
  );
  const parent = { id: "parent", parent_id: null, questions: [{ count: 0 }] };
  assert.equal(
    delegatesToOnlyChild(
      [parent, { id: "child", parent_id: "parent" }],
      parent,
    ),
    true,
  );
  assert.equal(
    delegatesToOnlyChild(
      [
        parent,
        { id: "a", parent_id: "parent" },
        { id: "b", parent_id: "parent" },
      ],
      parent,
    ),
    false,
  );
});
