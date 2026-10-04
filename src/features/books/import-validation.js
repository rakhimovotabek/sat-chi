export const CATEGORIES = ["Math", "Reading & Writing", "Vocabulary", "Other"];
const allowed = (value, keys, path, errors) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path}: expected an object.`);
    return false;
  }
  for (const key of Object.keys(value))
    if (!keys.includes(key)) errors.push(`${path}: unknown field “${key}”.`);
  return true;
};
const text = (v, path, errors, max, required = false) => {
  if (v === undefined && !required) return;
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    errors.push(
      `${path}: ${required ? "nonempty " : ""}text up to ${max} characters required.`,
    );
};
const url = (v, path, errors) => {
  if (v === undefined || v === null || v === "") return;
  try {
    if (new URL(v).protocol !== "https:" || v.length > 2048) throw new Error();
  } catch {
    errors.push(`${path}: use a valid HTTPS URL.`);
  }
};
export function validateQuestion(q, path = "Question") {
  const errors = [];
  if (
    !allowed(
      q,
      [
        "type",
        "question",
        "passage",
        "stimulus",
        "options",
        "correctAnswer",
        "explanation",
        "domain",
        "skill",
        "difficulty",
        "source",
        "imageUrl",
        "table",
      ],
      path,
      errors,
    )
  )
    return errors;
  if (q.type !== undefined && q.type !== "mcq")
    errors.push(`${path}: only mcq is supported.`);
  text(q.question, `${path}.question`, errors, 20000, true);
  for (const k of ["passage", "stimulus", "explanation"])
    text(q[k], `${path}.${k}`, errors, 60000);
  for (const k of ["domain", "skill"]) text(q[k], `${path}.${k}`, errors, 200);
  text(q.source, `${path}.source`, errors, 500);
  if (!Array.isArray(q.options) || q.options.length !== 4)
    errors.push(`${path}: exactly four options required.`);
  else
    q.options.forEach((v, i) =>
      text(v, `${path}.options[${i}]`, errors, 4000, true),
    );
  if (
    q.options?.some(
      (v) =>
        typeof v === "string" &&
        /^\s*Choice [A-D] in the source image\s*$/i.test(v),
    )
  )
    errors.push(`${path}: recover actual answer choices before importing.`);
  if (
    !Number.isInteger(q.correctAnswer) ||
    q.correctAnswer < 0 ||
    q.correctAnswer > 3
  )
    errors.push(`${path}: correctAnswer must be 0, 1, 2, or 3.`);
  if (
    q.difficulty !== undefined &&
    !["easy", "medium", "hard", "unclassified"].includes(q.difficulty)
  )
    errors.push(`${path}: invalid difficulty.`);
  url(q.imageUrl, `${path}.imageUrl`, errors);
  if (q.table != null) {
    const t = q.table;
    if (!allowed(t, ["columns", "rows"], `${path}.table`, errors))
      return errors;
    if (
      !Array.isArray(t.columns) ||
      t.columns.length < 1 ||
      t.columns.length > 12 ||
      t.columns.some((v) => typeof v !== "string")
    )
      errors.push(`${path}: table needs 1–12 text column headings.`);
    if (
      !Array.isArray(t.rows) ||
      t.rows.length > 100 ||
      t.rows.some(
        (r) =>
          !Array.isArray(r) ||
          r.length !== t.columns?.length ||
          r.some((v) => !["string", "number"].includes(typeof v)),
      )
    )
      errors.push(
        `${path}: table rows must match headings and contain text or numbers.`,
      );
  }
  return errors;
}
export function validateImport(payload, mode = "book") {
  const errors = [];
  let questions = 0,
    topics = 0;
  if (
    !allowed(
      payload,
      mode === "book"
        ? ["schemaVersion", "kind", "book", "topics"]
        : ["schemaVersion", "kind", "questions"],
      "Import",
      errors,
    )
  )
    return { errors, questions, topics };
  if (payload.schemaVersion !== undefined && payload.schemaVersion !== 1)
    errors.push("schemaVersion must be 1.");
  if (payload.kind !== undefined && payload.kind !== mode)
    errors.push(`kind must be “${mode}”.`);
  const inspectQuestions = (qs, path) => {
    if (!Array.isArray(qs)) {
      errors.push(`${path}: expected a questions array.`);
      return;
    }
    questions += qs.length;
    qs.forEach((q, i) => errors.push(...validateQuestion(q, `${path}[${i}]`)));
  };
  const inspectTopic = (t, path, depth) => {
    topics++;
    if (depth > 8) {
      errors.push(`${path}: maximum topic depth is 8.`);
      return;
    }
    if (!allowed(t, ["title", "questions", "children"], path, errors)) return;
    text(t.title, `${path}.title`, errors, 160, true);
    inspectQuestions(t.questions ?? [], `${path}.questions`);
    if (t.children !== undefined && !Array.isArray(t.children))
      errors.push(`${path}: children must be an array.`);
    else
      (t.children ?? []).forEach((child, i) =>
        inspectTopic(child, `${path}.children[${i}]`, depth + 1),
      );
  };
  if (mode === "book") {
    if (
      allowed(
        payload.book,
        ["title", "description", "category", "coverUrl", "published"],
        "Book",
        errors,
      )
    ) {
      text(payload.book.title, "Book title", errors, 160, true);
      text(payload.book.description, "Book description", errors, 10000);
      if (
        payload.book.category !== undefined &&
        !CATEGORIES.includes(payload.book.category)
      )
        errors.push("Book category is invalid.");
      url(payload.book.coverUrl, "Book cover", errors);
      if (
        payload.book.published !== undefined &&
        typeof payload.book.published !== "boolean"
      )
        errors.push("published must be true or false.");
    }
    if (!Array.isArray(payload.topics)) errors.push("topics must be an array.");
    else payload.topics.forEach((t, i) => inspectTopic(t, `topics[${i}]`, 0));
  } else inspectQuestions(payload.questions, "questions");
  if (questions > 500) errors.push("Import at most 500 questions at a time.");
  if (topics > 200) errors.push("Import at most 200 topics at a time.");
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 4000000)
    errors.push("Import must be smaller than 4 MB.");
  return { errors, questions, topics, title: payload.book?.title };
}
