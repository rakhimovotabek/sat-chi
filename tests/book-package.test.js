import test from "node:test";
import assert from "node:assert/strict";
import {
  preparePackage,
  packageSql,
  packageData,
  stableId,
} from "../scripts/imports/book-package.js";
import { learningDatabase, student, other } from "./helpers/database.js";
const fingerprint = "a".repeat(64);
const assets = ["stem", "a", "b", "c", "d", "explanation", "open"].map(
  (name, i) => ({
    source: `assets/${name}.png`,
    sha256: String(i).repeat(64),
    storageHash: String(i).repeat(64),
  }),
);
const question = {
  id: "package_q_1",
  type: "mcq",
  questionText: "",
  questionImage: "assets/stem.png",
  questionNumber: null,
  sourceQuestionId: "source-key",
  page: 4,
  difficulty: "Easy",
  needsReview: false,
  table: null,
  options: [..."ABCD"].map((label) => ({
    label,
    text: null,
    image: `assets/${label.toLowerCase()}.png`,
  })),
  correctAnswer: "B",
  acceptedAnswers: null,
  explanation: "![Official explanation](assets/explanation.png)",
  explanationImages: ["assets/explanation.png"],
};
const open = {
  ...question,
  id: "package_q_2",
  type: "open",
  questionImage: "assets/open.png",
  options: [],
  correctAnswer: "8.6",
  acceptedAnswers: ["8.6", "43/5"],
  answerFormat: "numeric",
  acceptedRange: null,
  explanation: null,
  explanationImages: [],
};
const book = {
  book: {
    title: "Package fixture",
    slug: "package-fixture",
    sourceFile: "source.pdf",
    totalQuestions: 3,
  },
  chapters: [
    {
      id: "c1",
      title: "Chapter",
      order: 1,
      topics: [
        {
          id: "t1",
          title: "Topic",
          order: 1,
          questions: [
            question,
            open,
            {
              ...question,
              id: "package_q_review",
              needsReview: true,
              reviewReason: "Unresolved",
            },
          ],
        },
      ],
    },
  ],
};
const manifest = {
  chapters: 1,
  topics: 1,
  questions: 3,
  assets: 7,
  needsReview: 1,
};
const review = [{ questionId: "package_q_review", issue: "Unresolved" }];

test("package validation rejects mismatched counts and missing assets, and preserves IDs, keys and skip reasons", () => {
  const p = preparePackage(book, manifest, review, assets, fingerprint);
  assert.equal(p.imported.length, 2);
  assert.equal(p.imported[0].text, "");
  assert.deepEqual(p.imported[0].options, ["", "", "", ""]);
  assert.equal(p.imported[0].correctAnswer, 1);
  assert.equal(p.imported[1].explanation, null);
  assert.deepEqual(p.imported[1].acceptedAnswers, ["8.6", "43/5"]);
  assert.equal(p.imported[1].correctAnswer, "8.6");
  assert.equal(p.imported[1].answerFormat, "numeric");
  assert.equal(p.imported[1].acceptedRange, null);
  assert.equal(p.skipped, undefined);
  assert.equal(p.report.skipped[0].id, "package_q_review");
  assert.equal(p.imported[0].metadata.questionNumber, null);
  assert.equal(p.imported[0].metadata.sourceQuestionId, "source-key");
  assert.ok(!("correctAnswer" in p.imported[0].metadata));
  assert.ok(!("answerSource" in p.imported[1].metadata));
  assert.ok(!("answerImage" in p.imported[1].metadata));
  assert.ok(!("acceptedRange" in p.imported[1].metadata));
  const missingDifficulty = structuredClone(book);
  missingDifficulty.chapters[0].topics[0].questions[1].difficulty = null;
  const fallback = preparePackage(
    missingDifficulty,
    manifest,
    review,
    assets,
    fingerprint,
  );
  assert.equal(fallback.imported[1].difficulty, "unclassified");
  assert.equal(fallback.report.imported.missingDifficultyFallbacks, 1);
  assert.throws(
    () =>
      preparePackage(
        book,
        { ...manifest, questions: 4 },
        review,
        assets,
        fingerprint,
      ),
    /Manifest mismatch/,
  );
  assert.throws(
    () =>
      preparePackage(
        book,
        { ...manifest, assets: 6 },
        review,
        assets.slice(1),
        fingerprint,
      ),
    /Missing package asset/,
  );
});

test("800 Challenge retains source difficulty labels and imports numeric response keys", () => {
  const source = structuredClone(book);
  source.book.slug = "800-challenge-hard-math-150-part-1-sat-math-club";
  const questions = source.chapters[0].topics[0].questions;
  questions[0].difficulty = "EXTRA HARD";
  questions[1].difficulty = "800-LEVEL";
  delete questions[1].answerFormat;
  const prepared = preparePackage(
    source,
    manifest,
    review,
    assets,
    fingerprint,
  );
  assert.equal(prepared.imported[0].difficulty, "hard");
  assert.equal(prepared.imported[0].metadata.difficulty, "EXTRA HARD");
  assert.equal(prepared.imported[1].difficulty, "hard");
  assert.equal(prepared.imported[1].metadata.difficulty, "800-LEVEL");
  assert.equal(prepared.imported[1].answerFormat, "numeric");
  assert.deepEqual(prepared.imported[1].acceptedAnswers, open.acceptedAnswers);
});

test("package import is atomic and idempotent; book practice securely gates explanations and grades supplied open answers", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    const p = preparePackage(book, manifest, review, assets, fingerprint);
    const sql = packageSql(book, manifest, review, [], assets, p);
    await db.exec("reset role");
    const stagedSql = packageSql(book, manifest, review, [], assets, p, true);
    await assert.rejects(db.exec(stagedSql), /Incomplete package transport/);
    await db.exec("rollback");
    const serialized = JSON.stringify(
      packageData(book, manifest, review, [], assets, p),
    );
    for (
      let offset = 0, part = 0;
      offset < serialized.length;
      offset += 2000, part++
    )
      await db.query(
        "insert into public.book_package_import_chunks values($1,$2,$3)",
        [fingerprint, part, serialized.slice(offset, offset + 2000)],
      );
    await db.exec(stagedSql);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.book_package_import_chunks",
        )
      ).rows[0].n,
      0,
    );
    await db.exec(sql);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.questions where id=any($1::uuid[])",
          [p.imported.map((q) => q.id)],
        )
      ).rows[0].n,
      2,
    );
    await role(student);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.book_import_packages",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.book_open_answers"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.questions where id=any($1::uuid[])",
          [p.imported.map((q) => q.id)],
        )
      ).rows[0].n,
      2,
      "student RLS must resolve the package-aware approval helper, not the renamed legacy helper",
    );
    const sid = await call(
      "start_book_practice",
      [stableId("package-fixture/c1/t1")],
      ["uuid"],
    );
    const items = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.equal(items.length, 2);
    assert.equal(items[0].question.question_text, "");
    assert.deepEqual(items[0].question.options, ["", "", "", ""]);
    assert.ok(!("explanation" in items[0].question));
    assert.ok(!("acceptedAnswers" in items[1].question.import_metadata));
    await assert.rejects(
      call("book_practice_explanation", [sid, items[0].id], ["uuid", "uuid"]),
      /Select an answer/,
    );
    assert.equal(
      await call(
        "can_read_book_package_asset",
        [`${fingerprint}/${assets[5].storageHash}.png`],
        ["text"],
      ),
      false,
    );
    const save = (i, answer, response) =>
      call(
        "save_book_practice",
        [
          sid,
          JSON.stringify([
            {
              id: i.id,
              selected_answer: answer,
              ...(response !== undefined
                ? { selected_response: response }
                : {}),
              marked: false,
              eliminated: [],
            },
          ]),
        ],
        ["uuid", "jsonb"],
      );
    await save(items[0], 0); // Incorrect selection still unlocks explanation.
    assert.equal(
      (
        await call(
          "book_practice_explanation",
          [sid, items[0].id],
          ["uuid", "uuid"],
        )
      ).explanation,
      p.imported[0].explanation,
    );
    assert.equal(
      await call(
        "can_read_book_package_asset",
        [`${fingerprint}/${assets[5].storageHash}.png`],
        ["text"],
      ),
      true,
    );
    await assert.rejects(
      call("book_practice_explanation", [sid, items[1].id], ["uuid", "uuid"]),
      /Select an answer/,
    );
    await save(items[0], 1);
    await save(items[1], null, "8.60");
    assert.equal(
      (
        await call(
          "book_practice_explanation",
          [sid, items[1].id],
          ["uuid", "uuid"],
        )
      ).explanation,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.question_check_attempts",
        )
      ).rows[0].n,
      0,
    );
    await role(other);
    await assert.rejects(
      call("book_practice_explanation", [sid, items[0].id], ["uuid", "uuid"]),
    );
    await role(student);
    await call("finish_book_practice", [sid], ["uuid"]);
    assert.deepEqual(
      (
        await db.query(
          "select correct from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows.map((i) => i.correct),
      [true, true],
    );
    assert.deepEqual(
      (await call("book_practice_open_review", [sid], ["uuid"]))[0]
        .accepted_answers,
      ["8.6", "43/5"],
    );
    // Repair an existing redundant hierarchy without touching questions or history.
    await db.exec("reset role");
    const bid = stableId("book/package-fixture"),
      parentId = stableId("package-fixture/c1");
    const questionSnapshot = (
      await db.query(
        "select * from public.questions where id=any($1::uuid[]) order by id",
        [p.imported.map((q) => q.id)],
      )
    ).rows;
    const answerSnapshot = (
      await db.query(
        "select * from public.question_answers where question_id=any($1::uuid[]) order by question_id",
        [p.imported.map((q) => q.id)],
      )
    ).rows;
    const itemSnapshot = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    await db.query("update public.book_topics set title='Topic' where id=$1", [
      parentId,
    ]);
    const collapsed = await call(
      "collapse_book_package_topics",
      [bid],
      ["uuid"],
    );
    assert.equal(collapsed.collapsed.length, 1);
    assert.equal(collapsed.questions_before, 2);
    assert.equal(collapsed.questions_after, 2);
    assert.equal(
      (await call("collapse_book_package_topics", [bid], ["uuid"])).collapsed
        .length,
      0,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from public.questions where id=any($1::uuid[]) order by id",
          [p.imported.map((q) => q.id)],
        )
      ).rows,
      questionSnapshot,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from public.question_answers where question_id=any($1::uuid[]) order by question_id",
          [p.imported.map((q) => q.id)],
        )
      ).rows,
      answerSnapshot,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows,
      itemSnapshot,
    );
    const flat = (
      await db.query(
        "select id,parent_id,position from public.book_topics where book_id=$1",
        [bid],
      )
    ).rows;
    assert.deepEqual(flat, [
      { id: stableId("package-fixture/c1/t1"), parent_id: null, position: 1 },
    ]);
    assert.equal(
      (await db.query("select published from public.books where id=$1", [bid]))
        .rows[0].published,
      true,
    );
    await role(student);
    assert.equal(
      await call(
        "start_book_practice",
        [stableId("package-fixture/c1/t1")],
        ["uuid"],
      ),
      sid,
    );
    // Grade a separate snapshot while preserving the public resume contract.
    await db.exec("reset role");
    const wrongSid = await call(
      "start_book_practice_new_snapshot",
      [stableId("package-fixture/c1/t1")],
      ["uuid"],
    );
    await role(student);
    const wrongItem = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1 and position=1",
        [wrongSid],
      )
    ).rows[0];
    await call(
      "save_book_practice",
      [
        wrongSid,
        JSON.stringify([
          {
            id: wrongItem.id,
            selected_answer: null,
            selected_response: "8.60001",
            marked: false,
            eliminated: [],
          },
        ]),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [wrongSid], ["uuid"]);
    assert.equal(
      (
        await db.query(
          "select correct from public.book_practice_items where id=$1",
          [wrongItem.id],
        )
      ).rows[0].correct,
      false,
    );
    await db.exec("reset role");
    await db.query(
      "update public.book_open_answers set accepted_answers='[]',correct_answer='3.0 to 3.3',answer_format='numeric-range',accepted_range=$2::jsonb where question_id=$1",
      [p.imported[1].id, JSON.stringify({ min: 3, max: 3.3, inclusive: true })],
    );
    await db.exec("reset role");
    const rangeSid = await call(
      "start_book_practice_new_snapshot",
      [stableId("package-fixture/c1/t1")],
      ["uuid"],
    );
    await role(student);
    const rangeItem = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1 and position=1",
        [rangeSid],
      )
    ).rows[0];
    await call(
      "save_book_practice",
      [
        rangeSid,
        JSON.stringify([{ id: rangeItem.id, selected_response: "3.15" }]),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [rangeSid], ["uuid"]);
    assert.equal(
      (
        await db.query(
          "select correct from public.book_practice_items where id=$1",
          [rangeItem.id],
        )
      ).rows[0].correct,
      true,
    );
    const rangeReview = await call(
      "book_practice_open_review",
      [rangeSid],
      ["uuid"],
    );
    assert.deepEqual(
      rangeReview.find((item) => item.item_id === rangeItem.id)
        .accepted_answers,
      ["3.0 to 3.3"],
      "range review falls back to the source answer string for older clients",
    );

    await db.exec("reset role");
    await db.query(
      "update public.book_open_answers set accepted_answers=$2::jsonb,correct_answer='x^2',answer_format='math-expression',accepted_range=null where question_id=$1",
      [p.imported[1].id, JSON.stringify(["x^2"])],
    );
    await db.exec("reset role");
    const expressionSid = await call(
      "start_book_practice_new_snapshot",
      [stableId("package-fixture/c1/t1")],
      ["uuid"],
    );
    await role(student);
    const expressionItem = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1 and position=1",
        [expressionSid],
      )
    ).rows[0];
    await call(
      "save_book_practice",
      [
        expressionSid,
        JSON.stringify([
          { id: expressionItem.id, selected_response: " x ^ 2 " },
        ]),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [expressionSid], ["uuid"]);
    assert.equal(
      (
        await db.query(
          "select correct from public.book_practice_items where id=$1",
          [expressionItem.id],
        )
      ).rows[0].correct,
      true,
    );
  } finally {
    await db.close();
  }
});

test("same-name chapter and single topic map to one populated row while genuine chapter/topic distinctions stay intact", () => {
  const sameName = structuredClone(book);
  sameName.chapters[0].title = "Topic";
  const p = preparePackage(sameName, manifest, review, assets, fingerprint);
  assert.equal(p.topics.length, 1);
  assert.equal(p.topics[0].id, stableId("package-fixture/c1/t1"));
  assert.equal(p.topics[0].position, 1);
  assert.deepEqual(p.topics[0].children, []);
  assert.equal(p.topics[0].questions.length, 2);
  assert.equal(p.report.imported.topicRows, 1);
  const distinct = preparePackage(book, manifest, review, assets, fingerprint);
  assert.equal(distinct.topics[0].children.length, 1);
  const multi = structuredClone(sameName);
  multi.chapters[0].topics.push({
    id: "t2",
    title: "Additional topic",
    order: 2,
    questions: [],
  });
  assert.equal(
    preparePackage(
      multi,
      { ...manifest, topics: 2 },
      review,
      assets,
      fingerprint,
    ).topics[0].children.length,
    2,
  );
});

test("a fresh same-name package imports questions directly into its retained single topic", async () => {
  const { db, role } = await learningDatabase();
  try {
    const sameName = structuredClone(book);
    sameName.chapters[0].title = "Topic";
    const p = preparePackage(sameName, manifest, review, assets, fingerprint);
    await db.exec("reset role");
    const sql = packageSql(sameName, manifest, review, [], assets, p);
    await db.exec(sql);
    await db.exec(sql);
    await role(student);
    const bid = stableId("book/package-fixture");
    const topics = (
      await db.query(
        "select id,parent_id from public.book_topics where book_id=$1",
        [bid],
      )
    ).rows;
    assert.deepEqual(topics, [
      { id: stableId("package-fixture/c1/t1"), parent_id: null },
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.questions where topic_id=$1",
          [topics[0].id],
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("canonical package questions appear in Bank and image/open checks preserve attempts and keys", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    const p = preparePackage(book, manifest, review, assets, fingerprint);
    await db.exec("reset role");
    await db.exec(packageSql(book, manifest, review, [], assets, p));
    await role(student);
    const filters = { book: stableId("book/package-fixture") };
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify(filters), 0],
          ["jsonb", "integer"],
        )
      ).count,
      2,
    );
    assert.equal(
      (
        await call("question_bank_facets", [JSON.stringify(filters)], ["jsonb"])
      ).reduce((s, f) => s + f.count, 0),
      2,
    );
    const sid = await call(
      "start_bank_practice",
      [JSON.stringify(filters), 2, false],
      ["jsonb", "integer", "boolean"],
    );
    const items = (
      await db.query("select * from book_practice_items where session_id=$1", [
        sid,
      ])
    ).rows;
    const response = items.find((i) => i.question.question_type === "open");
    const mcq = items.find((i) => i.question.question_type === "mcq");
    await assert.rejects(
      call("book_practice_explanation", [sid, mcq.id], ["uuid", "uuid"]),
      /Select an answer/,
    );
    const save = async (i, value) =>
      call(
        "save_book_practice",
        [
          sid,
          JSON.stringify([
            {
              id: i.id,
              selected_answer: i.question.question_type === "open" ? 0 : value,
              ...(i.question.question_type === "open"
                ? { selected_response: value }
                : {}),
              eliminated: [],
              marked: false,
            },
          ]),
        ],
        ["uuid", "jsonb"],
      );
    await save(mcq, 0);
    assert.match(
      (await call("book_practice_explanation", [sid, mcq.id], ["uuid", "uuid"]))
        .explanation,
      /Official explanation/,
    );
    const first = await call(
      "check_bank_answer",
      [sid, mcq.id, 0, crypto.randomUUID()],
      ["uuid", "uuid", "integer", "uuid"],
    );
    assert.equal(first.correct, false);
    await save(mcq, 1);
    assert.equal(
      (
        await call(
          "check_bank_answer",
          [sid, mcq.id, 1, crypto.randomUUID()],
          ["uuid", "uuid", "integer", "uuid"],
        )
      ).correct,
      true,
    );
    await save(response, "wrong");
    assert.equal(
      (
        await call(
          "book_practice_explanation",
          [sid, response.id],
          ["uuid", "uuid"],
        )
      ).explanation,
      null,
    );
    await assert.rejects(
      call(
        "check_bank_answer",
        [sid, response.id, 0, crypto.randomUUID()],
        ["uuid", "uuid", "integer", "uuid"],
      ),
      /Open response required/,
    );
    assert.equal(
      (
        await call(
          "check_bank_response",
          [sid, response.id, "wrong", crypto.randomUUID()],
          ["uuid", "uuid", "text", "uuid"],
        )
      ).correct,
      false,
    );
    await save(response, "8.6");
    const event = crypto.randomUUID();
    assert.equal(
      (
        await call(
          "check_bank_response",
          [sid, response.id, "8.60", event],
          ["uuid", "uuid", "text", "uuid"],
        )
      ).correct,
      true,
    );
    assert.equal(
      (
        await call(
          "check_bank_response",
          [sid, response.id, "8.60", event],
          ["uuid", "uuid", "text", "uuid"],
        )
      ).correct,
      true,
    );
    await assert.rejects(
      save(response, "wrong"),
      /Solved answers cannot change/,
    );
    assert.deepEqual(
      (await call("book_practice_open_review", [sid], ["uuid"]))[0]
        .accepted_answers,
      ["8.6", "43/5"],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from question_check_attempts where item_id=any($1)",
          [items.map((i) => i.id)],
        )
      ).rows[0].n,
      4,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from questions where topic_id=$1",
          [mcq.question.topic_id],
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
