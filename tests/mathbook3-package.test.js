import test from "node:test";
import assert from "node:assert/strict";
import { preparePackage, stableId } from "../scripts/imports/book-package.js";

test("MathBook 3 keeps source-only choices, skips only unresolved IDs and supports supplied fractional keys", () => {
  const q = {
    id: "mathbook3-source-1",
    type: "mcq",
    questionText: "",
    questionImage: "assets/source.jpg",
    questionImageIncludesOptions: true,
    options: [..."ABCD"].map((label) => ({ label, text: null })),
    correctAnswer: "B",
    needsReview: false,
    page: 9,
  };
  const open = {
    ...q,
    id: "mathbook3-source-2",
    type: "open",
    options: [],
    correctAnswer: "0.35",
    acceptedAnswers: ["0.35", "7/20"],
    sourceAnswer: "0.35",
    needsReview: false,
  };
  const pending = {
    ...q,
    id: "mathbook3-source-review",
    correctAnswer: null,
    needsReview: true,
    reviewReason: "No printed source key",
  };
  const book = {
    book: {
      title: "MathBook 3 fixture",
      slug: "mathbook-3-by-satashkent",
      totalQuestions: 3,
    },
    chapters: [
      {
        id: "c1",
        title: "Algebra",
        topics: [{ id: "t1", title: "Topic", questions: [q, open, pending] }],
      },
    ],
  };
  const data = preparePackage(
    book,
    { questions: 3 },
    {
      items: [{ questionId: pending.id, status: "unresolved" }],
      unresolvedExtractionIssues: [
        { questionId: pending.id, status: "unresolved" },
      ],
    },
    [
      {
        source: "assets/source.jpg",
        sha256: "a".repeat(64),
        storageHash: "a".repeat(64),
        extension: ".jpg",
        contentType: "image/jpeg",
      },
    ],
    "a".repeat(64),
  );
  assert.equal(data.imported.length, 2);
  assert.deepEqual(data.imported[0].options, ["", "", "", ""]);
  assert.equal(data.imported[0].correctAnswer, 1);
  assert.equal(data.imported[1].answerFormat, "numeric");
  assert.deepEqual(data.imported[1].acceptedAnswers, ["0.35", "7/20"]);
  assert.equal(data.imported[0].id, stableId(q.id));
  assert.deepEqual(data.report.skipped, [
    { id: pending.id, reason: "No printed source key" },
  ]);
  assert.ok(data.imported[0].image.endsWith(".jpg"));
  assert.ok(!("sourceAnswer" in data.imported[1].metadata));
});
