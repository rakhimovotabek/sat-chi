import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { learningDatabase, admin, student, other } from "./helpers/database.js";
import { questionAnswerIssue } from "../src/features/player/model.js";

const functionSql = (sql, name) =>
  sql
    .match(
      new RegExp(
        `create (?:or replace )?function public\\.${name}\\(.*?\\$\\$;`,
        "s",
      ),
    )[0]
    .replace("create function", "create or replace function");

test("one-time edit persists metadata, assignees and content without deleting started work", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    const config = {
      title: "Homework before",
      instructions: "Original",
      dueAt: "2026-12-01T12:00:00Z",
      students: [student],
      groups: [],
      sections: [{ title: "Original section", count: 2, filters: {} }],
    };
    await role(admin);
    const hid = await call(
      "create_homework",
      [JSON.stringify(config)],
      ["jsonb"],
    );
    const assigned = (await call("homework_directory"))[0];
    const original = await call("homework_edit_data", [hid], ["uuid"]);
    assert.equal(original.data.title, config.title);
    assert.deepEqual(original.data.students, [student]);
    assert.equal(original.data.sections[0].questionIds.length, 2);
    await role(student);
    const sid = await call(
      "start_homework",
      [assigned.assignment_id],
      ["uuid"],
    );
    const snapshots = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    await assert.rejects(
      call(
        "update_homework",
        [hid, JSON.stringify(original.data)],
        ["uuid", "jsonb"],
      ),
      /Admin required/,
    );
    await role(admin);
    const next = {
      ...original.data,
      title: "Homework after",
      instructions: "Updated",
      dueAt: "2026-12-02T10:00:00Z",
      students: [other],
      timed: true,
      timeLimit: 120,
      sections: [{ title: "Replacement section", count: 3, filters: {} }],
    };
    await call(
      "update_homework",
      [hid, JSON.stringify(next)],
      ["uuid", "jsonb"],
    );
    await role(other); // Auth/session changes do not undo the persisted update.
    const directory = await call("homework_directory");
    assert.equal(directory.length, 1);
    assert.equal(directory[0].title, next.title);
    const newSid = await call(
      "start_homework",
      [directory[0].assignment_id],
      ["uuid"],
    );
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1",
          [newSid],
        )
      ).rows.length,
      3,
    );
    await role(student);
    assert.deepEqual(await call("homework_directory"), []);
    await assert.rejects(
      call("start_homework", [assigned.assignment_id], ["uuid"]),
      /unavailable/,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows,
      snapshots,
    );
    await role(admin);
    const reloaded = await call("homework_edit_data", [hid], ["uuid"]);
    assert.equal(reloaded.data.title, next.title);
    assert.equal(reloaded.data.timeLimit, 120);
    assert.deepEqual(reloaded.data.students, [other]);
    assert.equal(reloaded.data.sections[0].count, 3);
    // A metadata-only edit must retain the question IDs and definition snapshots.
    const before = (
      await db.query("select * from public.homework_questions order by id")
    ).rows;
    await call(
      "update_homework",
      [hid, JSON.stringify({ ...reloaded.data, title: "Metadata only" })],
      ["uuid", "jsonb"],
    );
    assert.deepEqual(
      (await db.query("select * from public.homework_questions order by id"))
        .rows,
      before,
    );
  } finally {
    await db.close();
  }
});

test("admin deactivation preserves homework/history and prevents inactive or student account mutations", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    await role(admin);
    const day = (
      await db.query(
        "select (now() at time zone 'Asia/Tashkent')::date::text as local_day",
      )
    ).rows[0].local_day;
    await call(
      "save_daily_homework",
      [
        JSON.stringify({
          title: "Keep history",
          startDate: day,
          timezone: "Asia/Tashkent",
          count: 1,
          selection: "new",
          filters: {},
          students: [other],
        }),
      ],
      ["jsonb"],
    );
    // The old hard delete fails on the existing non-cascading daily-history FK.
    await db.exec("reset role");
    await assert.rejects(
      db.query("delete from auth.users where id=$1", [other]),
      /foreign key constraint/,
    );
    await role(student);
    await assert.rejects(
      db.query("update public.profiles set active=false where id=$1", [
        student,
      ]),
      /Only active admins/,
    );
    await role(admin);
    await assert.rejects(
      db.query("update public.profiles set active=false where id=$1", [admin]),
      /server-managed/,
    );
    await db.query(
      "update public.profiles set active=false where id=$1 and role='student' returning id",
      [other],
    );
    assert.equal(
      (
        await db.query(
          "select id from public.profiles where role='student' and active",
        )
      ).rows.some((p) => p.id === other),
      false,
    );
    assert.equal(
      (
        await db.query("select active from public.profiles where id=$1", [
          student,
        ])
      ).rows[0].active,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.daily_homework_enrollments where student_id=$1",
          [other],
        )
      ).rows.length,
      1,
    );
    await role(other);
    await assert.rejects(
      call("question_bank", ["{}"], ["jsonb"]),
      /Active account/,
    );
  } finally {
    await db.close();
  }
});

test("real open homework snapshot reproduces rejected payload; MCQ, image and open saves persist and grade", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    await db.exec("reset role");
    const sid = (
      await db.query(
        "insert into public.book_practice_sessions(student_id,title,kind) values($1,'Daily math','homework') returning id",
        [student],
      )
    ).rows[0].id;
    const questions = [
      {
        id: "normal-text",
        question_type: "mcq",
        options: ["2", "4", "6", "8"],
      },
      {
        id: "00135f0c-ac03-59ce-a54f-79d67147904e",
        question_type: "mcq",
        options: ["", "", "", ""],
        option_image_urls: [
          "https://example.test/a.png",
          "https://example.test/b.png",
          "https://example.test/c.png",
          "https://example.test/d.png",
        ],
      },
      // Existing live Daily math open-response question; the saved response is a string.
      {
        id: "fc29e510-2391-522d-abfa-178fbe9c36a2",
        question_type: "open",
        options: [],
        image_url:
          "https://example.test/storage/v1/object/authenticated/book-package-assets/86e46d26b8fbbd447e198b8c6b6fba0edc3c99e98485a6ceaf4f931543b6f96f/stem.png",
        import_metadata: {
          package_question_id: "algebra-official-sat-question-bank_q_0569",
        },
      },
    ];
    const items = [];
    for (const [position, question] of questions.entries()) {
      const id = (
        await db.query(
          "insert into public.book_practice_items(session_id,position,question) values($1,$2,$3) returning id",
          [sid, position, JSON.stringify(question)],
        )
      ).rows[0].id;
      items.push(id);
      await db.query(
        "insert into public.book_practice_keys values($1,$2,'Supplied explanation')",
        [id, position === 2 ? null : 1],
      );
    }
    // Real failing snapshot has no frozen key and its original question row is
    // absent. Recover the exact supplied key from the retained source package.
    await db.query(
      "insert into public.book_import_packages values($1,$2,$3,$4,'{}','[]','[]')",
      [
        book,
        "algebra-official-sat-question-bank",
        "86e46d26b8fbbd447e198b8c6b6fba0edc3c99e98485a6ceaf4f931543b6f96f",
        JSON.stringify({
          chapters: [
            {
              topics: [
                {
                  questions: [
                    {
                      id: "algebra-official-sat-question-bank_q_0569",
                      type: "open",
                      needsReview: false,
                      correctAnswer: "25",
                      acceptedAnswers: ["25"],
                      options: [],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ],
    );
    const repairSql = await readFile(
      "supabase/migrations/20261007000100_homework_answers_and_bank_loading.sql",
      "utf8",
    );
    await db.exec(
      repairSql.match(
        /insert into public\.book_practice_open_keys\(item_id,accepted_answers,correct_answer,answer_format,accepted_range\)\nselect i\.id[\s\S]*?;/,
      )[0],
    );
    assert.deepEqual(
      (
        await db.query(
          "select accepted_answers from public.book_practice_open_keys where item_id=$1",
          [items[2]],
        )
      ).rows[0].accepted_answers,
      ["25"],
    );
    await role(student);
    const payload = [
      {
        id: items[2],
        selected_answer: 0,
        selected_response: "25",
        marked: false,
        eliminated: [],
      },
    ];
    const old = await readFile(
      "supabase/migrations/20261004003800_package_question_bank.sql",
      "utf8",
    );
    const fixed = await readFile(
      "supabase/migrations/20261007000100_homework_answers_and_bank_loading.sql",
      "utf8",
    );
    await db.exec("reset role");
    await db.exec(functionSql(old, "save_book_practice"));
    await role(student);
    await assert.rejects(
      call(
        "save_book_practice",
        [sid, JSON.stringify(payload)],
        ["uuid", "jsonb"],
      ),
      /Invalid answer fields/,
    );
    await db.exec("reset role");
    await db.exec(functionSql(fixed, "save_book_practice"));
    await role(student);
    await call(
      "save_book_practice",
      [
        sid,
        JSON.stringify([
          ...payload,
          ...items.slice(0, 2).map((id) => ({
            id,
            selected_answer: 1,
            marked: true,
            eliminated: [],
          })),
        ]),
      ],
      ["uuid", "jsonb"],
    );
    await role(other);
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1",
          [sid],
        )
      ).rows.length,
      0,
    );
    await role(student);
    const restored = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.deepEqual(
      restored.map((i) => i.selected_answer),
      [1, 1, 0],
    );
    assert.equal(restored[2].selected_response, "25");
    // Mark-only saves must preserve a previously saved open response.
    await call(
      "save_book_practice",
      [sid, JSON.stringify([{ id: items[2], marked: true, eliminated: [] }])],
      ["uuid", "jsonb"],
    );
    assert.equal(
      (
        await db.query(
          "select selected_response from public.book_practice_items where id=$1",
          [items[2]],
        )
      ).rows[0].selected_response,
      "25",
    );
    await call("finish_book_practice", [sid], ["uuid"]);
    assert.deepEqual(
      (
        await db.query(
          "select correct from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows.map((i) => i.correct),
      [true, true, true],
    );
    assert.equal(
      (await call("book_practice_open_review", [sid], ["uuid"]))[0]
        .correct_answer,
      "25",
    );
  } finally {
    await db.close();
  }
});

test("embedded source choices are answerable while unsupported or missing choices fail closed", () => {
  const q = {
    id: "217091aa-2150-544e-adb7-ff2defee53c9",
    question_type: "mcq",
    options: ["", "", "", ""],
    image_url: "https://example.test/algebra-q001.jpg",
    import_metadata: { questionImageIncludesOptions: true },
  };
  assert.equal(questionAnswerIssue(q), null);
  assert.equal(
    questionAnswerIssue({ ...q, import_metadata: {} }),
    "Missing answer choices",
  );
  assert.equal(
    questionAnswerIssue({ ...q, question_type: "reference" }),
    "Unsupported question type",
  );
  assert.equal(
    questionAnswerIssue({ question_type: "open", options: [] }),
    null,
  );
});

test("recurring status edits persist and Bank facets match counts across sections and sources", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    await role(admin);
    const day = (
      await db.query(
        "select (now() at time zone 'Asia/Tashkent')::date::text as local_day",
      )
    ).rows[0].local_day;
    const data = {
      title: "Status edit",
      startDate: day,
      timezone: "Asia/Tashkent",
      count: 1,
      selection: "new",
      filters: {},
      students: [student],
      active: true,
    };
    const tid = await call(
      "save_daily_homework",
      [JSON.stringify(data)],
      ["jsonb"],
    );
    await call(
      "save_daily_homework",
      [JSON.stringify({ ...data, active: false }), tid],
      ["jsonb", "uuid"],
    );
    assert.equal(
      (
        await db.query(
          "select state from public.daily_homework_templates where id=$1",
          [tid],
        )
      ).rows[0].state,
      "paused",
    );
    await call(
      "save_daily_homework",
      [JSON.stringify(data), tid],
      ["jsonb", "uuid"],
    );
    assert.equal(
      (
        await db.query(
          "select state from public.daily_homework_templates where id=$1",
          [tid],
        )
      ).rows[0].state,
      "active",
    );
    await db.exec("reset role");
    await db.exec(
      "update public.questions set section='Reading & Writing',domain='Information and Ideas' where position=0",
    );
    await role(student);
    for (const section of ["Math", "Reading & Writing"]) {
      const filters = JSON.stringify({
        section,
        book,
        difficulties: ["easy", "medium"],
      });
      const bank = await call("question_bank", [filters], ["jsonb"]);
      const facets = await call("question_bank_facets", [filters], ["jsonb"]);
      assert.ok(bank.count > 0);
      assert.equal(
        facets.reduce((sum, row) => sum + row.count, 0),
        bank.count,
      );
    }
    await assert.rejects(
      call("homework_snapshot_open_key", ["{}"], ["jsonb"]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("recurring save uses maintained student eligibility instead of rescanning legacy approvals", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    await role(admin);
    await db.exec("reset role");
    await db.exec(
      `create or replace function public.question_approved_for_students(p_id uuid) returns boolean language plpgsql as $$begin raise exception 'Legacy approval scan must not run during Save';end;$$;`,
    );
    await role(admin);
    const day = (
      await db.query(
        "select timezone('Asia/Tashkent',now())::date::text as local_day",
      )
    ).rows[0].local_day;
    const config = {
      title: "Before edit",
      instructions: "Before",
      students: [student],
      groups: [],
      timezone: "Asia/Tashkent",
      startDate: day,
      count: 2,
      selection: "new",
      filters: { book },
    };
    const id = await call(
      "save_daily_homework",
      [JSON.stringify(config)],
      ["jsonb"],
    );
    const edited = {
      ...config,
      title: "Saved edit",
      instructions: "After",
      students: [other],
      timeLimit: 120,
      allowLate: false,
      allowRepeat: true,
    };
    await call(
      "save_daily_homework",
      [JSON.stringify(edited), id],
      ["jsonb", "uuid"],
    );
    const row = (
      await db.query(
        "select data,jsonb_array_length(pool) size from public.daily_homework_versions where template_id=$1 order by revision desc limit 1",
        [id],
      )
    ).rows[0];
    assert.equal(row.data.title, edited.title);
    assert.deepEqual(row.data.students, [other]);
    assert.equal(row.data.timeLimit, 120);
    assert.equal(row.size, 12);
    await db.exec("reset role");
    await db.query("update public.books set published=false where id=$1", [
      book,
    ]);
    await role(admin);
    await assert.rejects(
      call("save_daily_homework", [JSON.stringify(config)], ["jsonb"]),
      /Not enough usable published/,
    );
  } finally {
    await db.close();
  }
});
