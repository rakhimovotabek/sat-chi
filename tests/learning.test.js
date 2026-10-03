import { buildImportSql } from "../scripts/imports/import-sql.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  homeworkStatus,
  sectionResults,
} from "../src/features/learning/homework-model.js";
import { validateVocabulary } from "../src/features/learning/vocabulary-validation.js";
import { parseGrammar } from "../scripts/imports/parsers.js";
test("homework statuses and section results reflect saved data", () => {
  const now = new Date("2026-10-03T10:00:00Z");
  assert.equal(
    homeworkStatus({ due_at: "2026-10-03T08:00:00Z" }, now),
    "Overdue",
  );
  assert.equal(
    homeworkStatus({ due_at: "2026-10-04", session_id: "saved" }, now),
    "In Progress",
  );
  assert.equal(homeworkStatus({ submitted_at: "done" }, now), "Completed");
  assert.deepEqual(
    sectionResults([
      {
        question: { homework_section: "Math" },
        selected_answer: 1,
        correct: true,
      },
      {
        question: { homework_section: "Math" },
        selected_answer: null,
        correct: false,
      },
    ]),
    [{ name: "Math", total: 2, correct: 1, incorrect: 0, unanswered: 1 }],
  );
});
test("vocabulary validation rejects malformed and duplicate words", () => {
  assert.ok(
    validateVocabulary({
      title: "Book",
      sets: [
        {
          title: "Set",
          words: [
            { word: "one", definition: "first" },
            { word: "one", definition: "duplicate" },
          ],
        },
      ],
    }).length,
  );
  assert.deepEqual(
    validateVocabulary({
      title: "Book",
      sets: [{ title: "Set", words: [{ word: "one", definition: "first" }] }],
    }),
    [],
  );
  assert.throws(
    () => parseGrammar("ambiguous raw PDF text", "book.pdf"),
    /boundaries/,
  );
});
test("real PostgreSQL learning workflows preserve ownership, private keys, frozen sessions and calculated results", async () => {
  const db = new PGlite(),
    admin = "e0000000-0000-0000-0000-000000000001",
    student = "e0000000-0000-0000-0000-000000000002",
    other = "e0000000-0000-0000-0000-000000000003";
  const role = (id) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const call = async (name, values = [], casts = []) =>
    (
      await db.query(
        `select public.${name}(${values.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) result`,
        values,
      )
    ).rows[0].result;
  const q = {
    question: "Which number is four?",
    options: ["2", "4", "6", "8"],
    correctAnswer: 1,
    domain: "Algebra",
    skill: "Linear equations",
  };
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;`,
    );
    for (const f of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
    await db.exec(
      `insert into auth.users(id)values('${admin}'),('${student}'),('${other}');update public.profiles set role='admin' where id='${admin}';`,
    );
    const localPayload = {
      book: {
        title: "Local draft",
        category: "Other",
        description: "Quoted source ' $import$; drop table public.profiles; --",
      },
      topics: [{ title: "Topic", questions: [q] }],
    };
    const report = {
      fingerprint: "a".repeat(64),
      source_file: "Local.json",
      title: "Local draft",
      status: "validated",
      detected_topics: 1,
      detected_questions: 1,
      imported_count: 0,
      skipped_count: 0,
      warnings: [],
      errors: [],
    };
    await db.exec(buildImportSql(report, localPayload));
    await db.exec(buildImportSql(report, localPayload));
    assert.equal(
      (await db.query("select imported_count from public.import_jobs")).rows[0]
        .imported_count,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.books where title='Local draft'",
        )
      ).rows[0].n,
      1,
    );
    await role(admin);
    const imported = await call(
      "import_book_content",
      [
        JSON.stringify({
          book: { title: "Published math", category: "Math", published: true },
          topics: [
            {
              title: "Algebra",
              questions: [
                q,
                { ...q, question: "Another question" },
                { ...q, question: "Third question" },
                { ...q, question: "Fourth question" },
              ],
            },
          ],
        }),
      ],
      ["jsonb"],
    );
    const parent = (
      await db.query(
        "select id from public.book_topics where book_id=$1 and parent_id is null",
        [imported.book_id],
      )
    ).rows[0].id;
    const child = (
      await db.query(
        "insert into public.book_topics(book_id,parent_id,title)values($1,$2,'Subtopic') returning id",
        [imported.book_id, parent],
      )
    ).rows[0].id;
    await db.query(
      "update public.questions set topic_id=$1 where id=(select id from public.questions where topic_id=$2 limit 1)",
      [child, parent],
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ topic: parent })],
          ["jsonb"],
        )
      ).count,
      4,
    );
    const group = (
      await db.query(
        "insert into public.groups(name)values('Group A') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into public.group_members(group_id,student_id)values($1,$2)",
      [group, student],
    );
    await assert.rejects(
      db.query(
        "insert into public.group_members(group_id,student_id)values($1,$2)",
        [group, student],
      ),
    );
    const homework = {
      title: "Mixed homework",
      dueAt: "2026-10-05T12:00:00Z",
      groups: [group],
      sections: [{ title: "Algebra", count: 2, filters: { section: "Math" } }],
    };
    const hid = await call(
      "create_homework",
      [JSON.stringify(homework)],
      ["jsonb"],
    );
    await assert.rejects(
      call(
        "create_homework",
        [
          JSON.stringify({
            ...homework,
            sections: [{ title: "Too many", count: 50, filters: {} }],
          }),
        ],
        ["jsonb"],
      ),
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.homeworks")).rows[0]
        .n,
      1,
    );
    await role(student);
    await assert.rejects(call("learning_metrics_internal", [], []));
    await assert.rejects(
      db.exec("insert into public.groups(name)values('attack')"),
    );
    await assert.rejects(
      call("create_homework", [JSON.stringify(homework)], ["jsonb"]),
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ section: "Math" })],
          ["jsonb"],
        )
      ).count,
      4,
    );
    assert.equal(
      (
        await call(
          "question_bank",
          [JSON.stringify({ section: "Reading & Writing" })],
          ["jsonb"],
        )
      ).count,
      0,
    );
    await assert.rejects(call("bank_candidates", ["{}"], ["jsonb"]));
    const list = await call("homework_directory"),
      aid = list[0].assignment_id;
    assert.equal(list.length, 1);
    assert.equal(list[0].sections[0].count, 2);
    assert.equal(
      (await db.query("select * from public.homework_questions")).rows.length,
      0,
    );
    const sid = await call("start_homework", [aid], ["uuid"]);
    assert.equal(await call("start_homework", [aid], ["uuid"]), sid);
    const items = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.equal(items.length, 2);
    assert.ok(
      items.every(
        (i) =>
          !("correct_answer" in i.question) && !("explanation" in i.question),
      ),
    );
    await assert.rejects(call("review_book_practice", [sid], ["uuid"]));
    await call(
      "practice_heartbeat",
      [sid, 1, 99999],
      ["uuid", "integer", "integer"],
    );
    assert.equal(
      (
        await db.query(
          "select current_position from public.book_practice_sessions where id=$1",
          [sid],
        )
      ).rows[0].current_position,
      1,
    );
    await call(
      "save_book_practice",
      [
        sid,
        JSON.stringify(
          items.map((i) => ({
            id: i.id,
            selected_answer: 1,
            marked: true,
            eliminated: [],
          })),
        ),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [sid], ["uuid"]);
    const m = await call("learning_metrics");
    assert.equal(m.attempted, 2);
    assert.equal(m.correct, 2);
    assert.equal(m.homework_completed, 1);
    assert.equal(m.activity.length, 1);
    assert.ok(m.study_seconds <= 30);
    assert.equal(
      (await call("learning_standings", [true], ["boolean"])).length,
      1,
    );
    await assert.rejects(call("learning_metrics", [other], ["uuid"]));
    await assert.rejects(
      db.exec(
        "insert into public.student_activity(student_id,kind,title)values(auth.uid(),'fake','fake')",
      ),
    );
    await assert.rejects(
      call(
        "start_bank_practice",
        ["{}", null, false],
        ["jsonb", "integer", "boolean"],
      ),
    );
    const bankSession = await call(
      "start_bank_practice",
      ["{}", 3, false],
      ["jsonb", "integer", "boolean"],
    );
    const frozen = (
      await db.query(
        "select id,position,question from public.book_practice_items where session_id=$1 order by position",
        [bankSession],
      )
    ).rows;
    assert.equal(frozen.length, 3);
    assert.deepEqual(
      (
        await db.query(
          "select id,position,question from public.book_practice_items where session_id=$1 order by position",
          [bankSession],
        )
      ).rows,
      frozen,
    );
    await role(other);
    assert.equal((await call("homework_directory")).length, 0);
    await assert.rejects(call("start_homework", [aid], ["uuid"]));
    await assert.rejects(
      call("practice_heartbeat", [sid, 0, 30], ["uuid", "integer", "integer"]),
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_sessions where id=$1",
          [sid],
        )
      ).rows.length,
      0,
    );
    await role(admin);
    assert.equal(
      (await db.query("select * from public.review_book_practice($1)", [sid]))
        .rows.length,
      2,
    );
    const words = ["abate", "candid", "diligent", "prudent"].map((word, i) => ({
      word,
      definition: `Meaning ${i + 1}`,
      example: `An example of ${word}.`,
    }));
    const vocab = {
      title: "Vocabulary book",
      published: true,
      sets: [
        {
          title: "Set 1",
          words,
          passage: "Be candid and prudent.",
          questions: [q],
        },
      ],
    };
    const vbid = await call(
      "import_vocabulary",
      [JSON.stringify(vocab)],
      ["jsonb"],
    );
    await assert.rejects(
      call("import_vocabulary", [JSON.stringify(vocab)], ["jsonb"]),
    );
    const set = (
        await db.query(
          "select id from public.vocabulary_sets where book_id=$1",
          [vbid],
        )
      ).rows[0].id,
      word = (
        await db.query(
          "select id from public.vocabulary_words where set_id=$1 limit 1",
          [set],
        )
      ).rows[0].id;
    await role(student);
    assert.equal(
      (await db.query("select * from public.vocabulary_questions")).rows.length,
      0,
    );
    await db.query(
      "insert into public.vocabulary_progress(student_id,word_id,status)values($1,$2,'known')",
      [student, word],
    );
    await assert.rejects(
      db.query(
        "insert into public.vocabulary_progress(student_id,word_id,status)values($1,$2,'known')",
        [other, word],
      ),
    );
    const vsid = await call(
      "start_vocabulary_test",
      [set, false],
      ["uuid", "boolean"],
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1",
          [vsid],
        )
      ).rows.length,
      4,
    );
    await assert.rejects(call("review_book_practice", [vsid], ["uuid"]));
    await call("finish_book_practice", [vsid], ["uuid"]);
    assert.equal(
      (await db.query("select * from public.review_book_practice($1)", [vsid]))
        .rows.length,
      4,
    );
    const importedTest = await call(
      "start_vocabulary_test",
      [set, true],
      ["uuid", "boolean"],
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1",
          [importedTest],
        )
      ).rows.length,
      1,
    );
    await role(other);
    assert.equal(
      (await db.query("select * from public.vocabulary_progress")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(call("question_bank", ["{}"], ["jsonb"]));
    await assert.rejects(db.exec("select * from public.vocabulary_words"));
  } finally {
    await db.close();
  }
});

test("local grammar extraction requires complete numbering and agreement between key and worked solutions", () => {
  const questions = Array.from(
    { length: 41 },
    (_, i) =>
      `${i + 1} GRAMMAR\nA supplied sentence.\nWhich choice completes the text?\nA. first\nB. second\nC. third\nD. fourth`,
  ).join("\n\n");
  const keys = Array.from({ length: 41 }, (_, i) => `${i + 1}. B`).join(" "),
    solutions = Array.from(
      { length: 41 },
      (_, i) => `Q${i + 1} Answer: B. The supplied explanation.`,
    ).join("\n\n");
  const text = `\nPractice Section\n${questions}\nAnswer Key\n${keys}\nWorked Solutions\n${solutions}`;
  const result = parseGrammar(text, "Fixture.pdf");
  assert.deepEqual(result.errors, []);
  assert.equal(result.payload.topics[0].questions.length, 41);
  assert.equal(
    result.payload.topics[0].questions[0].difficulty,
    "unclassified",
  );
  assert.ok(
    parseGrammar(
      text.replace("Q11 Answer: B.", "Q11 Answer: C."),
      "Fixture.pdf",
    ).errors.some((e) => e.includes("Question 11")),
  );
});
