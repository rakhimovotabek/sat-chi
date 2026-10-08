import test from "node:test";
import assert from "node:assert/strict";
import { admin, student, other } from "./helpers/database.js";
import {
  homeworkDueInput,
  homeworkDueInstant,
} from "../src/features/learning/homework-model.js";

import { homeworkDatabase } from "./helpers/homework-database.js";

const base = {
  title: "Disposable homework",
  dueAt: "2026-12-01T12:00:00Z",
  students: [student],
  groups: [],
  sections: [{ title: "Math", count: 10, filters: {} }],
};
const save = (call, id, data) =>
  call("update_homework", [id, JSON.stringify(data)], ["uuid", "jsonb"]);

test("Tashkent due input is independent of browser timezone", () => {
  assert.equal(homeworkDueInput("2026-10-08T19:30:00Z"), "2026-10-09T00:30");
  assert.equal(
    homeworkDueInstant("2026-10-09T00:30"),
    "2026-10-08T19:30:00.000Z",
  );
});

test("database lifecycle: 10→5/15/20/30, mixed sources, recipients, reload, progress, completed history and atomic failure", async (t) => {
  const { db, role, call } = await homeworkDatabase();
  try {
    const id = await call("create_homework", [JSON.stringify(base)], ["jsonb"]);
    await role(student);
    let row = (await call("homework_directory"))[0];
    assert.equal(row.id, id);
    const sid = await call("start_homework", [row.assignment_id], ["uuid"]);
    const items = () =>
      db
        .query(
          "select * from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
        .then((r) => r.rows);
    const first = (await items())[0];
    await call(
      "save_book_practice",
      [
        sid,
        JSON.stringify([
          { id: first.id, selected_answer: 1, marked: true, eliminated: [] },
        ]),
      ],
      ["uuid", "jsonb"],
    );
    await role(admin);
    const all = (
      await call("question_bank", ["{}", 0], ["jsonb", "integer"])
    ).rows
      .concat(
        (await call("question_bank", ["{}", 1], ["jsonb", "integer"])).rows,
      )
      .map((q) => q.id);
    const initial = await call("homework_edit_data", [id], ["uuid"]);
    const originalIds = initial.data.sections[0].questionIds;
    const candidates = [
      ...originalIds,
      ...all.filter((q) => !originalIds.includes(q)),
    ];
    for (const count of [5, 15, 20, 10, 30])
      await t.test(
        `save ${count} questions and resume correct student snapshot`,
        async () => {
          await role(admin);
          await save(call, id, {
            ...base,
            sections: [
              {
                title: "Math",
                count: 10,
                questionIds: candidates.slice(0, 10),
              },
            ],
          });
          await save(call, id, {
            ...base,
            sections: [
              { title: "Math", count, questionIds: candidates.slice(0, count) },
            ],
          });
          assert.equal(
            (await call("homework_edit_data", [id], ["uuid"])).data.sections[0]
              .count,
            count,
          );
          await role(student);
          row = (await call("homework_directory"))[0];
          assert.equal(row.sections[0].count, count);
          assert.equal(
            await call("start_homework", [row.assignment_id], ["uuid"]),
            sid,
          );
          assert.equal((await items()).length, count);
          const preserved = (await items()).find((i) => i.id === first.id);
          if (candidates.slice(0, count).includes(first.question.id))
            assert.equal(preserved.selected_answer, 1);
        },
      );
    await t.test(
      "add and remove student; reject withdrawn URL saves, retain rows",
      async () => {
        await role(admin);
        const data = (await call("homework_edit_data", [id], ["uuid"])).data;
        await save(call, id, { ...data, students: [student, other] });
        await role(other);
        const b = (await call("homework_directory"))[0];
        assert.equal(b.id, id);
        const bsid = await call("start_homework", [b.assignment_id], ["uuid"]);
        await role(admin);
        await save(call, id, { ...data, students: [student] });
        await role(other);
        assert.deepEqual(await call("homework_directory"), []);
        await assert.rejects(
          call("save_book_practice", [bsid, "[]"], ["uuid", "jsonb"]),
          /unavailable/,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.book_practice_sessions where id=$1",
              [bsid],
            )
          ).rows.length,
          0,
        );
        await role(admin);
        assert.equal(
          (
            await db.query(
              "select * from public.homework_assignments where homework_id=$1",
              [id],
            )
          ).rows.length,
          2,
        );
      },
    );
    await t.test(
      "simultaneous remove/add archives removed answers and preserves retained answers",
      async () => {
        await role(student);
        const before = await items();
        const removed = before.find((i) => i.id !== first.id);
        await call(
          "save_book_practice",
          [sid, JSON.stringify([{ id: removed.id, selected_answer: 1 }])],
          ["uuid", "jsonb"],
        );
        await role(admin);
        const data = (await call("homework_edit_data", [id], ["uuid"])).data;
        const ids = data.sections[0].questionIds.filter(
          (q) => q !== removed.question.id,
        );
        ids.push(
          candidates.find((q) => !data.sections[0].questionIds.includes(q)),
        );
        await save(call, id, {
          ...data,
          sections: [{ title: "Replacement", count: 30, questionIds: ids }],
        });
        assert.ok(
          (
            await db.query(
              "select item from public.homework_item_history where item->>'id'=$1",
              [removed.id],
            )
          ).rows.some((r) => r.item.selected_answer === 1),
        );
        await role(student);
        assert.equal((await items()).length, 30);
        assert.equal(
          (await items()).find((i) => i.id === first.id)?.selected_answer,
          1,
        );
      },
    );
    await t.test(
      "failure after section writes rolls back metadata, definitions, roster and progress",
      async () => {
        await role(admin);
        const data = (await call("homework_edit_data", [id], ["uuid"])).data;
        const before = await items();
        await assert.rejects(
          save(call, id, {
            ...data,
            title: "Must rollback",
            students: [other],
            sections: [
              { title: "Valid", count: 1, filters: {} },
              { title: "Impossible", count: 500, filters: {} },
            ],
          }),
          /Not enough eligible/,
        );
        assert.deepEqual(
          (await call("homework_edit_data", [id], ["uuid"])).data,
          data,
        );
        assert.deepEqual(await items(), before);
      },
    );
    await t.test(
      "complete and reload; admin status agrees; completed items survive later edit",
      async () => {
        await role(student);
        const before = await items();
        await call(
          "save_book_practice",
          [
            sid,
            JSON.stringify(
              before.map((i) => ({ id: i.id, selected_answer: 1 })),
            ),
          ],
          ["uuid", "jsonb"],
        );
        await call("finish_book_practice", [sid], ["uuid"]);
        assert.ok((await call("homework_directory"))[0].submitted_at);
        await role(admin);
        assert.ok(
          (await call("homework_directory")).find(
            (r) => r.student_id === student,
          ).submitted_at,
        );
        const frozen = await items();
        const data = (await call("homework_edit_data", [id], ["uuid"])).data;
        await save(call, id, {
          ...data,
          sections: [
            {
              title: "Future definition",
              count: 5,
              questionIds: candidates.slice(0, 5),
            },
          ],
        });
        assert.deepEqual(await items(), frozen);
      },
    );
  } finally {
    await db.close();
  }
});

test("group/all-student roster changes synchronize one-time access without duplicate rows", async () => {
  const { db, role, call } = await homeworkDatabase();
  try {
    await role(admin);
    const gid = (
      await db.query(
        "insert into public.groups(name) values('Disposable roster') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into public.group_members(group_id,student_id) values($1,$2)",
      [gid, student],
    );
    const id = await call(
      "create_homework",
      [JSON.stringify({ ...base, students: [], groups: [gid] })],
      ["jsonb"],
    );
    await role(other);
    assert.deepEqual(await call("homework_directory"), []);
    await role(admin);
    await db.query(
      "insert into public.group_members(group_id,student_id) values($1,$2)",
      [gid, other],
    );
    await role(other);
    assert.equal((await call("homework_directory"))[0].id, id);
    await role(admin);
    await db.query(
      "delete from public.group_members where group_id=$1 and student_id=$2",
      [gid, other],
    );
    await role(other);
    assert.deepEqual(await call("homework_directory"), []);
    await role(admin);
    await db.query(
      "insert into public.group_members(group_id,student_id) values($1,$2)",
      [gid, other],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.homework_assignments where homework_id=$1",
          [id],
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("reproduces legacy increase failure when adding an approved open response; corrected save freezes and grades its key", async () => {
  const { readFile } = await import("node:fs/promises");
  const { preparePackage, packageSql, stableId } = await import(
    "../scripts/imports/book-package.js"
  );
  const { db, role, call } = await homeworkDatabase();
  try {
    const source = {
      book: {
        title: "Disposable open package",
        slug: "disposable-homework-open",
        sourceFile: "disposable.pdf",
        totalQuestions: 1,
      },
      chapters: [
        {
          id: "c1",
          title: "Open",
          order: 1,
          topics: [
            {
              id: "t1",
              title: "Open",
              order: 1,
              questions: [
                {
                  id: "open1",
                  type: "open",
                  questionText: "Supply 8.6",
                  questionImage: "assets/open.png",
                  options: [],
                  correctAnswer: "8.6",
                  acceptedAnswers: ["8.6"],
                  answerFormat: "numeric",
                  acceptedRange: null,
                  needsReview: false,
                  page: 1,
                  difficulty: "Easy",
                  explanation: null,
                  explanationImages: [],
                },
              ],
            },
          ],
        },
      ],
    };
    source.book.totalQuestions = 2;
    source.chapters[0].topics[0].questions.push({
      id: "image1",
      type: "mcq",
      questionText: "Choose the supplied fixture image",
      questionImage: "assets/open.png",
      options: [..."ABCD"].map((label, i) => ({
        label,
        text: null,
        image: `assets/choice-${i}.png`,
      })),
      correctAnswer: "B",
      acceptedAnswers: null,
      needsReview: false,
      page: 1,
      difficulty: "Easy",
      explanation: "Supplied fixture key B",
      explanationImages: [],
    });
    const manifest = {
      chapters: 1,
      topics: 1,
      questions: 2,
      assets: 5,
      needsReview: 0,
    };
    const assets = [
      {
        source: "assets/open.png",
        sha256: "a".repeat(64),
        storageHash: "a".repeat(64),
      },
    ];
    assets.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        source: `assets/choice-${i}.png`,
        sha256: String(i + 1).repeat(64),
        storageHash: String(i + 1).repeat(64),
      })),
    );
    const prepared = preparePackage(
      source,
      manifest,
      [],
      assets,
      "b".repeat(64),
    );
    await db.exec("reset role");
    await db.exec(packageSql(source, manifest, [], [], assets, prepared));
    await role(admin);
    const seedIds = (
      await db.query(
        "select id from public.questions where question_type='mcq' and not(import_metadata ? 'package_question_id') order by id limit 10",
      )
    ).rows.map((q) => q.id);
    const id = await call(
      "create_homework",
      [
        JSON.stringify({
          ...base,
          sections: [{ title: "Math", count: 10, questionIds: seedIds }],
        }),
      ],
      ["jsonb"],
    );
    const original = (await call("homework_edit_data", [id], ["uuid"])).data;
    const openId = (
      await db.query(
        "select q.id from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=$1 and q.question_type='open'",
        [stableId("book/disposable-homework-open")],
      )
    ).rows[0].id;
    const imageId = (
      await db.query(
        "select q.id from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=$1 and q.question_type='mcq'",
        [stableId("book/disposable-homework-open")],
      )
    ).rows[0].id;
    assert.deepEqual(
      (
        await call(
          "question_bank",
          [
            JSON.stringify({
              assignment: true,
              book: stableId("book/disposable-homework-open"),
            }),
            0,
          ],
          ["jsonb", "integer"],
        )
      ).rows
        .map((q) => q.id)
        .sort(),
      [openId, imageId].sort(),
    );
    const extra = (
      await db.query(
        "select id from public.questions where question_type='mcq' and not(import_metadata ? 'package_question_id') and not(id=any($1::uuid[])) limit 8",
        [original.sections[0].questionIds],
      )
    ).rows.map((q) => q.id);
    const edited = {
      ...original,
      sections: [
        {
          title: "Mixed MCQ and open",
          count: 20,
          questionIds: [
            ...original.sections[0].questionIds,
            ...extra,
            imageId,
            openId,
          ],
        },
      ],
    };
    const fixed = (
      await db.query(
        "select pg_get_functiondef('public.update_homework(uuid,jsonb)'::regprocedure) sql",
      )
    ).rows[0].sql;
    const old = await readFile(
      "supabase/migrations/20261007000200_homework_editing.sql",
      "utf8",
    );
    const legacy = old
      .slice(
        old.indexOf("create function public.update_homework("),
        old.indexOf("\ndrop policy assignment_self"),
      )
      .replace("create function", "create or replace function");
    await db.exec("reset role");
    await db.exec(legacy);
    await role(admin);
    await assert.rejects(save(call, id, edited), /Not enough eligible/);
    assert.equal(
      (await call("homework_edit_data", [id], ["uuid"])).data.sections[0].count,
      10,
    );
    await db.exec("reset role");
    await db.exec(fixed);
    await role(admin);
    await save(call, id, edited);
    assert.equal(
      (await call("homework_edit_data", [id], ["uuid"])).data.sections[0].count,
      20,
    );
    await role(student);
    const row = (await call("homework_directory"))[0];
    const sid = await call("start_homework", [row.assignment_id], ["uuid"]);
    const item = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1 and question->>'question_type'='open'",
        [sid],
      )
    ).rows[0];
    const imageItem = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 and question->>'id'=$2",
        [sid, imageId],
      )
    ).rows[0];
    assert.deepEqual(imageItem.question.options, ["", "", "", ""]);
    assert.equal(imageItem.question.option_image_urls.length, 4);
    const ack = await call(
      "save_practice_changes",
      [
        sid,
        JSON.stringify([
          {
            id: item.id,
            selected_answer: 0,
            selected_response: "8.6",
            marked: false,
            eliminated: [],
            expected_revision: 0,
          },
          {
            id: imageItem.id,
            selected_answer: 1,
            marked: false,
            eliminated: [],
            expected_revision: 0,
          },
        ]),
      ],
      ["uuid", "jsonb"],
    );
    assert.ok(ack.every((a) => a.answer_revision > 0));
    // Mutate only this disposable fixture as its database owner. Grading-key
    // tables intentionally do not grant direct administrator writes.
    await db.exec("reset role");
    await db.query(
      "update public.book_open_answers set accepted_answers='[\"99\"]',correct_answer='99' where question_id=$1",
      [openId],
    );
    await db.query(
      "update public.question_answers set correct_answer=3 where question_id=$1",
      [imageId],
    );
    await role(student);
    await call("finish_book_practice", [sid], ["uuid"]);
    assert.equal(
      (
        await db.query(
          "select correct from public.book_practice_items where id=$1",
          [item.id],
        )
      ).rows[0].correct,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select correct from public.book_practice_items where id=$1",
          [imageItem.id],
        )
      ).rows[0].correct,
      true,
    );
    await role(admin);
    assert.deepEqual(
      (await call("book_practice_open_review", [sid], ["uuid"]))[0]
        .accepted_answers,
      ["8.6"],
    );
  } finally {
    await db.close();
  }
});

test("student directory keeps assignments beyond the admin page cap", async () => {
  const { db, role, call } = await homeworkDatabase();
  try {
    await db.exec("reset role");
    await db.exec(`insert into public.homeworks(title,due_at) select 'Disposable cap '||n,now()+n*interval '1 hour' from generate_series(1,205)n;
    insert into public.homework_assignments(homework_id,student_id) select id,'${student}' from public.homeworks;`);
    await role(student);
    assert.equal((await call("homework_directory")).length, 205);
    await role(admin);
    assert.equal((await call("homework_directory")).length, 200);
  } finally {
    await db.close();
  }
});

test("repeated edits keep section positions bounded and rejoining group updates an old unfinished attempt", async () => {
  const { db, role, call } = await homeworkDatabase();
  try {
    const gid = (
      await db.query(
        "insert into public.groups(name) values('Disposable rejoin') returning id",
      )
    ).rows[0].id;
    await db.query(
      "insert into public.group_members(group_id,student_id) values($1,$2)",
      [gid, student],
    );
    const data = { ...base, students: [], groups: [gid] };
    const id = await call("create_homework", [JSON.stringify(data)], ["jsonb"]);
    await role(student);
    const sid = await call(
      "start_homework",
      [(await call("homework_directory"))[0].assignment_id],
      ["uuid"],
    );
    await role(admin);
    await db.query("delete from public.group_members where group_id=$1", [gid]);
    for (let i = 0; i < 35; i++)
      await save(call, id, {
        ...data,
        students: [other],
        groups: [],
        sections: [{ title: "Updated", count: 5 + (i % 2), filters: {} }],
      });
    const sections = (
      await db.query(
        "select count(*)::int n,max(position) position from public.homework_sections where homework_id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(sections.position, sections.n - 1);
    // Rebind the group without Student A present, then add A via membership.
    await save(call, id, {
      ...data,
      students: [other],
      sections: [{ title: "New roster definition", count: 20, filters: {} }],
    });
    await db.query(
      "insert into public.group_members(group_id,student_id) values($1,$2)",
      [gid, student],
    );
    await role(student);
    assert.equal(
      await call(
        "start_homework",
        [(await call("homework_directory"))[0].assignment_id],
        ["uuid"],
      ),
      sid,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.book_practice_items where session_id=$1",
          [sid],
        )
      ).rows[0].n,
      20,
    );
  } finally {
    await db.close();
  }
});
