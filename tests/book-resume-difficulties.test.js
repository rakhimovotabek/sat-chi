import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other } from "./helpers/database.js";
import { questionState } from "../src/features/player/model.js";
import { toggleDifficulty } from "../src/features/learning/bank-selection.js";

test("book reopening restores checks, mixed history and marks after 100 days and user changes", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    const topic = (
      await db.query(
        "select id from public.book_topics where book_id=$1 limit 1",
        [book],
      )
    ).rows[0].id;
    const sid = await call("start_book_practice", [topic], ["uuid"]);
    const items = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    const check = (index, choice, event) =>
      call(
        "check_book_practice_answer",
        [sid, items[index].id, choice, `f2000000-0000-0000-0000-${event}`],
        ["uuid", "uuid", "integer", "uuid"],
      );
    await check(0, 1, "000000000021");
    await check(1, 0, "000000000022");
    await check(2, 0, "000000000023");
    await check(2, 1, "000000000024");
    await call(
      "save_book_practice",
      [
        sid,
        JSON.stringify([
          { id: items[1].id, selected_answer: 0, marked: true, eliminated: [] },
        ]),
      ],
      ["uuid", "jsonb"],
    );
    await db.exec("reset role");
    // Emulate a legacy session created before topic identity was recorded.
    await db.query(
      "update public.book_practice_sessions set source_id=null,started_at=started_at-interval '100 days' where id=$1",
      [sid],
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
    assert.notEqual(await call("start_book_practice", [topic], ["uuid"]), sid);
    await role(student);
    assert.equal(await call("start_book_practice", [topic], ["uuid"]), sid);
    assert.equal(await call("start_book_practice", [topic], ["uuid"]), sid);
    const restored = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    const attempts = (
      await db.query(
        "select * from public.question_check_attempts order by attempt_order",
      )
    ).rows;
    assert.equal(attempts.length, 4);
    assert.equal(restored[0].correct, true);
    assert.equal(restored[1].correct, false);
    assert.equal(restored[1].marked, true);
    assert.equal(restored[2].selected_answer, 1);
    assert.ok(restored[2].solved_at);
    assert.ok(
      questionState(
        {
          ...restored[2],
          attempts: attempts.filter((a) => a.item_id === restored[2].id),
        },
        true,
        false,
        true,
      ).includes("mixed"),
    );
    const progress = await call("book_practice_progress", [book], ["uuid"]);
    assert.equal(progress[0].solved, 2);
    assert.equal(progress[0].checked, 3);
    assert.equal(progress[0].total, 12);
    assert.equal(
      (
        await db.query(
          "select * from public.book_practice_sessions where student_id=$1",
          [student],
        )
      ).rows.length,
      1,
    );
    // Completed snapshots must also resume rather than being discarded.
    await call("finish_book_practice", [sid], ["uuid"]);
    assert.equal((await call("book_practice_progress", [book], ["uuid"]))[0].checked, 3);
    assert.equal(await call("start_book_practice", [topic], ["uuid"]), sid);
  } finally {
    await db.close();
  }
});

test("difficulty union supports empty, toggled and legacy selections without dropping other filters", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    await db.exec("reset role");
    await db.exec(
      "update public.questions set difficulty=case when position%3=0 then 'easy' when position%3=1 then 'medium' else 'hard' end",
    );
    await role(student);
    let filters = toggleDifficulty(
      { section: "Math", domains: ["Algebra"], difficulty: "easy" },
      "medium",
    );
    assert.deepEqual(filters.difficulties, ["easy", "medium"]);
    assert.deepEqual(filters.domains, ["Algebra"]);
    const bank = () =>
      call("question_bank", [JSON.stringify(filters)], ["jsonb"]);
    const both = await bank();
    assert.equal(both.count, 8);
    assert.deepEqual(
      [
        ...new Set(
          both.questions?.map((q) => q.difficulty) ??
            both.rows?.map((q) => q.difficulty),
        ),
      ].sort(),
      ["easy", "medium"],
    );
    filters = toggleDifficulty(filters, "easy");
    assert.equal((await bank()).count, 4);
    filters = toggleDifficulty(filters, "medium");
    assert.equal((await bank()).count, 12);
    await assert.rejects(
      call("question_bank", ['{"difficulties":["invalid"]}'], ["jsonb"]),
    );
    await assert.rejects(
      call("question_bank", ['{"difficulties":"easy"}'], ["jsonb"]),
    );
    assert.equal(
      (await call("question_bank", ['{"difficulty":"hard"}'], ["jsonb"])).count,
      4,
    );
  } finally {
    await db.close();
  }
});
