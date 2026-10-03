import test from "node:test";
import assert from "node:assert/strict";
import {
  combineWords,
  recallMatches,
  contextParts,
  masteryPercent,
  vocabularyAccuracy,
} from "../src/features/learning/vocabulary-model.js";
test("mixed sets deduplicate identical meanings while preserving original membership and distinct senses", () => {
  const pool = combineWords([
    { id: "1", set_id: "A", word: "Term", definition: "First" },
    { id: "2", set_id: "B", word: " term ", definition: "first" },
    { id: "3", set_id: "B", word: "Term", definition: "Second" },
  ]);
  assert.equal(pool.length, 2);
  assert.deepEqual(pool[0].source_sets, ["A", "B"]);
});
test("typed recall normalizes case, whitespace and compatibility letters without accepting near spellings", () => {
  assert.ok(recallMatches(" ABATE ", "abate"));
  assert.ok(recallMatches("Ｔｅｒｍ", "Term"));
  assert.ok(recallMatches("attest  to", "attest to"));
  assert.ok(!recallMatches("abait", "abate"));
});
test("source context retains exact passage text, handles multiword phrases and does not match parts of other words", () => {
  const text = "Attest to the candid statement; candidness is different.";
  const parts = contextParts(text, [
    { word: "attest to", definition: "confirm" },
    { word: "candid", definition: "honest" },
  ]);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.equal(parts.filter((p) => p.word).length, 2);
  assert.equal(parts[0].word.definition, "confirm");
});
test("mastery and accuracy derive from review evidence with honest empty states", () => {
  assert.equal(masteryPercent({ total: 25, mastered: 5 }), 20);
  assert.equal(masteryPercent({ total: 0, mastered: 0 }), 0);
  assert.equal(vocabularyAccuracy({ successful: 3, failed: 1 }), 75);
  assert.equal(vocabularyAccuracy({ successful: 0, failed: 0 }), null);
});
