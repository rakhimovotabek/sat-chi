import { validateQuestion } from "../books/import-validation.js";
export function validateVocabulary(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return ["Enter a vocabulary book object."];
  if (
    typeof payload.title !== "string" ||
    !payload.title.trim() ||
    payload.title.length > 160
  )
    errors.push("A book title up to 160 characters is required.");
  if (
    !Array.isArray(payload.sets) ||
    !payload.sets.length ||
    payload.sets.length > 100
  )
    errors.push("Provide 1–100 sets.");
  else
    payload.sets.forEach((s, i) => {
      if (!s || typeof s !== "object" || Array.isArray(s)) {
        errors.push(`Set ${i + 1}: expected an object.`);
        return;
      }
      if (
        typeof s.title !== "string" ||
        !s.title.trim() ||
        s.title.length > 160
      )
        errors.push(`Set ${i + 1}: title required (up to 160 characters).`);
      if (!Array.isArray(s.words) || !s.words.length || s.words.length > 100)
        errors.push(`Set ${i + 1}: provide 1–100 words.`);
      else {
        const seen = new Set();
        s.words.forEach((w, j) => {
          if (
            !w ||
            typeof w !== "object" ||
            typeof w.word !== "string" ||
            !w.word.trim() ||
            w.word.length > 100 ||
            typeof w.definition !== "string" ||
            !w.definition.trim() ||
            w.definition.length > 2000
          ) {
            errors.push(
              `Set ${i + 1}, word ${j + 1}: valid word and definition required.`,
            );
            return;
          }
          if (seen.has(w.word))
            errors.push(`Set ${i + 1}: duplicate word ${w.word}.`);
          seen.add(w.word);
          for (const field of ["example", "synonym", "translation"])
            if (
              w[field] !== undefined &&
              (typeof w[field] !== "string" || w[field].length > 6000)
            )
              errors.push(`Word ${j + 1}: invalid ${field}.`);
        });
      }
      if (
        s.questions !== undefined &&
        (!Array.isArray(s.questions) || s.questions.length > 100)
      )
        errors.push(`Set ${i + 1}: questions must be an array of up to 100.`);
      else
        (s.questions || []).forEach((q, j) =>
          errors.push(
            ...validateQuestion(q, `Set ${i + 1}, question ${j + 1}`),
          ),
        );
      if (
        s.passage !== undefined &&
        (typeof s.passage !== "string" || s.passage.length > 60000)
      )
        errors.push(
          `Set ${i + 1}: passage must be text up to 60,000 characters.`,
        );
    });
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 4000000)
    errors.push("Import must be under 4 MB.");
  return errors;
}
