import test from "node:test";
import assert from "node:assert/strict";
import { parseSAToplam } from "../scripts/imports/satoplam.js";
import { parseSATakror } from "../scripts/imports/satakror.js";
import { validateLocalImport } from "../scripts/imports/local-validation.js";
import { validateImport } from "../src/features/books/import-validation.js";
const region = (
  number,
  page,
  passage = "A researcher studied a quiet valley and recorded its changing temperatures.",
) => ({
  number,
  page,
  columns: [
    passage,
    "Which choice states the main idea?\nA) A valley changed.\nB) A mountain grew.\nC) A river vanished.\nD) A city developed.",
  ],
  crossing: [],
  gaps: [],
});
test("section-specific tables preserve repeated numbering, pages, passages and explicit answers", () => {
  const p = parseSAToplam(
    "Practice\fAnswers: Main Ideas\nNumber Answer\n1 B\fPractice\fAnswers: Details\nNumber Answer\n1 D",
    [
      { regions: [region(1, 1)] },
      { regions: [] },
      { regions: [region(1, 3)] },
      { regions: [] },
    ],
    "Example.pdf",
  );
  assert.deepEqual(p.errors, []);
  assert.deepEqual(
    p.payload.topics.map((t) => t.questions[0].correctAnswer),
    [1, 3],
  );
  assert.deepEqual(
    p.evidence.map((e) => e.page),
    [1, 3],
  );
  assert.equal(p.payload.book.published, false);
  assert.match(p.payload.topics[0].questions[0].passage, /quiet valley/);
});
test("layout adapter quarantines missing vector blanks, repeated regions, duplicate options and absent regions", () => {
  const r = region(1, 1);
  r.columns[1] = r.columns[1].replace(
    "states the main idea",
    "completes the text",
  );
  let p = parseSAToplam(
    "Practice\fAnswers: Main Ideas\n1 A\n2 B",
    [{ regions: [r] }, { regions: [] }],
    "Example.pdf",
  );
  assert.equal(p.payload.topics.length, 0);
  assert.ok(p.review.some((r) => r.reasons.some((x) => /blank/.test(x))));
  assert.ok(p.review.some((r) => r.number === 2));
  p = parseSAToplam(
    "Practice\fAnswers: Main Ideas\n1 A",
    [{ regions: [region(1, 1), region(1, 1)] }, { regions: [] }],
    "Example.pdf",
  );
  assert.equal(p.review.length, 2);
  assert.equal(p.payload.topics.length, 0);
  const d = region(1, 1);
  d.columns[1] = d.columns[1].replace("A mountain grew.", "A valley changed.");
  p = parseSAToplam(
    "Practice\fAnswers: Main Ideas\n1 A",
    [{ regions: [d] }, { regions: [] }],
    "Example.pdf",
  );
  assert.match(p.review[0].reasons.join(), /Duplicate options/);
});
test("SATakror refuses incomplete or repeated printed keys and never infers them", () => {
  assert.throws(() => parseSATakror("No keys", [], "Example.pdf"), /Missing/);
  assert.throws(
    () => parseSATakror("Answers to SATakror\n1. A", [], "Example.pdf"),
    /101/,
  );
  assert.throws(
    () => parseSATakror("Answers to SATakror\n1. A\n1. B", [], "Example.pdf"),
    /Repeated/,
  );
});
test("trusted local validation preserves browser caps and rejects unsafe provenance/malformed options", () => {
  const q = {
    type: "mcq",
    question: "Which value is largest?",
    options: ["1", "2", "3", "4"],
    correctAnswer: 3,
    source_page: 19,
    import_metadata: { source_number: 2, review_required: true },
  };
  const p = {
    book: { title: "Synthetic", published: false },
    topics: [
      { title: "Practice", questions: Array.from({ length: 501 }, () => q) },
    ],
  };
  assert.deepEqual(validateLocalImport(p).errors, []);
  assert.ok(validateImport(p).errors.some((e) => /500/.test(e)));
  assert.ok(
    validateLocalImport({
      ...p,
      topics: [{ title: "Practice", questions: [{ ...q, source_page: 0 }] }],
    }).errors.length,
  );
  assert.ok(
    validateLocalImport({
      ...p,
      topics: [{ title: "Practice", questions: [{ ...q, correctAnswer: 9 }] }],
    }).errors.length,
  );
});
