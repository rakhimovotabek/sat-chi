export const defaultLearningSettings = Object.freeze({
  vocabularyCount: 20,
  shuffleVocabulary: false,
  vocabularyTestType: "mixed",
});
export function normalizeLearningSettings(value) {
  return {
    vocabularyCount: [10, 20, 25, 50].includes(value?.vocabularyCount)
      ? value.vocabularyCount
      : 20,
    shuffleVocabulary: value?.shuffleVocabulary === true,
    vocabularyTestType: [
      "mixed",
      "meaning",
      "reverse",
      "typed",
      "source",
    ].includes(value?.vocabularyTestType)
      ? value.vocabularyTestType
      : "mixed",
  };
}
const key = (id) => `satchi.learning-settings.${id}`;
export function readLearningSettings(id, storage) {
  try {
    return id
      ? normalizeLearningSettings(
          JSON.parse((storage || globalThis.localStorage).getItem(key(id))),
        )
      : { ...defaultLearningSettings };
  } catch {
    return { ...defaultLearningSettings };
  }
}
export function saveLearningSettings(id, value, storage) {
  if (!id) throw new Error("Sign in to save preferences.");
  const settings = normalizeLearningSettings(value);
  try {
    (storage || globalThis.localStorage).setItem(
      key(id),
      JSON.stringify(settings),
    );
  } catch {
    throw new Error(
      "This browser cannot save preferences. Allow local storage and retry.",
    );
  }
  return settings;
}
