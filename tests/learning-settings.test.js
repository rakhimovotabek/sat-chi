import test from "node:test";
import assert from "node:assert/strict";
import {
  readLearningSettings,
  saveLearningSettings,
  normalizeLearningSettings,
} from "../src/features/settings/learning-settings.js";
test("learning settings validate values, persist per account and safely recover corrupted device storage", () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    };
  assert.equal(readLearningSettings("one", storage).vocabularyCount, 20);
  saveLearningSettings(
    "one",
    {
      vocabularyCount: 50,
      shuffleVocabulary: true,
      vocabularyTestType: "typed",
    },
    storage,
  );
  assert.deepEqual(readLearningSettings("one", storage), {
    vocabularyCount: 50,
    shuffleVocabulary: true,
    vocabularyTestType: "typed",
  });
  assert.equal(readLearningSettings("two", storage).shuffleVocabulary, false);
  assert.deepEqual(
    normalizeLearningSettings({
      vocabularyCount: 100000,
      shuffleVocabulary: "yes",
      vocabularyTestType: "unknown",
    }),
    {
      vocabularyCount: 20,
      shuffleVocabulary: false,
      vocabularyTestType: "mixed",
    },
  );
  values.set("satchi.learning-settings.one", "malformed");
  assert.equal(
    readLearningSettings("one", storage).vocabularyTestType,
    "mixed",
  );
  assert.throws(
    () =>
      saveLearningSettings(
        "one",
        {},
        {
          setItem() {
            throw new Error("blocked");
          },
        },
      ),
    /cannot save/,
  );
});
