import { versionedFixtureArgs } from "./helpers/practice-save.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  validateImport,
  validateQuestion,
} from "../src/features/books/import-validation.js";
import {
  practiceSummary,
  questionState,
} from "../src/features/player/model.js";
const q = {
  type: "mcq",
  question: "Solve 2x = 8.",
  options: ["2", "4", "6", "8"],
  correctAnswer: 1,
  explanation: "Divide both sides by 2.",
  passage: "A practice passage.",
  difficulty: "easy",
};
const book = {
  schemaVersion: 1,
  kind: "book",
  book: { title: "Test book", category: "Math", published: true },
  topics: [
    {
      title: "Algebra",
      questions: [q],
      children: [{ title: "Equations", questions: [q] }],
    },
  ],
};
test("JSON import validation reports nested errors and rejects unsupported formats", () => {
  assert.deepEqual(validateImport(book).errors, []);
  assert.equal(validateImport(book).questions, 2);
  assert.deepEqual(validateImport({ questions: [q] }, "topic").errors, []);
  for (const invalid of [
    { ...q, correctAnswer: 4 },
    { ...q, options: ["one"] },
    { ...q, imageUrl: "javascript:alert(1)" },
    { ...q, type: "unknown" },
    { ...q, table: { columns: ["x"], rows: [["a", "b"]] } },
  ])
    assert.ok(validateQuestion(invalid).length);
  assert.ok(validateImport({ ...book, role: "admin" }).errors.length);
  assert.ok(validateImport({ ...book, schemaVersion: 2 }).errors.length);
});
test("practice result counts distinguish unanswered from incorrect and preserve review states", () => {
  const items = [
    { selected_answer: 1, correct: true, marked: true },
    { selected_answer: 0, correct: false },
    { selected_answer: null, correct: false },
  ];
  assert.deepEqual(practiceSummary(items), {
    total: 3,
    correct: 1,
    incorrect: 1,
    unanswered: 1,
    accuracy: 50,
  });
  assert.ok(questionState(items[0], true, true).includes("correct"));
  assert.ok(questionState(items[0], true, true).includes("marked"));
  assert.ok(!questionState(items[0], true, false).includes("correct"));
});
test("PostgreSQL content permissions, imports, snapshot practice and grading resist escalation", async () => {
  const db = new PGlite();
  const admin = "c0000000-0000-0000-0000-000000000001",
    student = "c0000000-0000-0000-0000-000000000002",
    other = "c0000000-0000-0000-0000-000000000003";
  const role = async (id) =>
    db.exec(
      `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const rpc = async (name, args, casts) => {
    args = await versionedFixtureArgs(db, name, args);
    return db.query(
      `select public.${name}(${args.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) as result`,
      args,
    );
  };
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;`,
    );
    for (const file of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.exec(
      `insert into auth.users(id)values('${admin}'),('${student}'),('${other}');update public.profiles set role='admin' where id='${admin}';`,
    );
    await role(admin);
    const imported = await rpc(
      "import_book_content",
      [JSON.stringify(book)],
      ["jsonb"],
    );
    const bid = imported.rows[0].result.book_id;
    assert.equal(imported.rows[0].result.question_count, 2);
    const topics = (
      await db.query(
        "select * from public.book_topics order by parent_id nulls first",
      )
    ).rows;
    const tid = topics[0].id;
    await assert.rejects(
      rpc("import_book_content", [JSON.stringify(book)], ["jsonb"]),
    );
    const before = (
      await db.query("select count(*)::int as n from public.books")
    ).rows[0].n;
    const broken = {
      ...book,
      book: { ...book.book, title: "Broken" },
      topics: [
        { title: "Valid first", questions: [q] },
        { title: "Invalid second", questions: [{ ...q, correctAnswer: 9 }] },
      ],
    };
    await assert.rejects(
      rpc("import_book_content", [JSON.stringify(broken)], ["jsonb"]),
    );
    assert.equal(
      (await db.query("select count(*)::int as n from public.books")).rows[0].n,
      before,
    );
    await assert.rejects(
      db.query("update public.book_topics set parent_id=$1 where id=$2", [
        topics[1].id,
        tid,
      ]),
    );
    await assert.rejects(
      rpc("write_book_question", [tid, JSON.stringify(q)], ["uuid", "jsonb"]),
    );
    await rpc(
      "import_book_content",
      [JSON.stringify({ questions: [q] }), tid],
      ["jsonb", "uuid"],
    );
    const qid = (
      await db.query(
        "select id from public.questions where topic_id=$1 order by position",
        [tid],
      )
    ).rows[0].id;
    await rpc(
      "save_book_question",
      [tid, JSON.stringify({ ...q, question: "Edited question." }), qid],
      ["uuid", "jsonb", "uuid"],
    );
    await role(student);
    assert.equal((await db.query("select * from public.books")).rows.length, 1);
    assert.equal(
      (await db.query("select * from public.question_answers")).rows.length,
      0,
    );
    await assert.rejects(
      db.exec("insert into public.books(title)values('attack')"),
    );
    await assert.rejects(
      rpc("import_book_content", [JSON.stringify(book)], ["jsonb"]),
    );
    const forbiddenUpdate = await db.query(
      'update public.questions set options=\'["a","b","c","d"]\' returning id',
    );
    assert.equal(forbiddenUpdate.rows.length, 0);
    assert.deepEqual(
      (
        await db.query("select options from public.questions where id=$1", [
          qid,
        ])
      ).rows[0].options,
      q.options,
    );
    const sid = (await rpc("start_book_practice", [tid], ["uuid"])).rows[0]
      .result;
    const items = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.equal(items.length, 3);
    assert.ok(
      items.every(
        (i) =>
          !("correct_answer" in i.question) && !("explanation" in i.question),
      ),
    );
    assert.equal(
      (await db.query("select * from public.book_practice_keys")).rows.length,
      0,
    );
    await assert.rejects(rpc("review_book_practice", [sid], ["uuid"]));
    await assert.rejects(
      db.exec("update public.book_practice_items set correct=true"),
    );
    const answers = items.map((i, n) => ({
      id: i.id,
      selected_answer: n === 2 ? null : n === 0 ? 1 : 0,
      marked: n === 0,
      eliminated: [],
    }));
    await rpc(
      "save_book_practice",
      [sid, JSON.stringify(answers)],
      ["uuid", "jsonb"],
    );
    await assert.rejects(
      rpc(
        "save_book_practice",
        [sid, JSON.stringify([{ ...answers[0], correct: true }])],
        ["uuid", "jsonb"],
      ),
    );
    await role(other);
    assert.equal(
      (await db.query("select * from public.book_practice_sessions")).rows
        .length,
      0,
    );
    await assert.rejects(
      rpc(
        "save_book_practice",
        [sid, JSON.stringify(answers)],
        ["uuid", "jsonb"],
      ),
    );
    await assert.rejects(rpc("finish_book_practice", [sid], ["uuid"]));
    await assert.rejects(rpc("review_book_practice", [sid], ["uuid"]));
    await role(admin);
    await db.query("delete from public.books where id=$1", [bid]);
    await role(student);
    assert.equal(
      (await db.query("select * from public.book_practice_items")).rows.length,
      3,
    );
    await rpc("finish_book_practice", [sid], ["uuid"]);
    await rpc("finish_book_practice", [sid], ["uuid"]);
    await assert.rejects(
      rpc(
        "save_book_practice",
        [sid, JSON.stringify(answers)],
        ["uuid", "jsonb"],
      ),
    );
    const review = await db.query(
      "select * from public.review_book_practice($1)",
      [sid],
    );
    assert.equal(review.rows.length, 3);
    assert.equal(review.rows[0].correct_answer, 1);
    const graded = (
      await db.query(
        "select * from public.book_practice_items order by position",
      )
    ).rows;
    assert.deepEqual(practiceSummary(graded), {
      total: 3,
      correct: 1,
      incorrect: 1,
      unanswered: 1,
      accuracy: 50,
    });
    await db.exec("reset role;set role anon;");
    await assert.rejects(db.exec("select * from public.books"));
    await assert.rejects(rpc("review_book_practice", [sid], ["uuid"]));
  } finally {
    await db.close();
  }
});
