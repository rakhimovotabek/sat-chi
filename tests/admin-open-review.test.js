import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openReviewDatabase } from "./helpers/open-review-database.js";
import { admin, student, other } from "./helpers/database.js";

for (const kind of ["homework", "book", "bank"])
  test(`${kind}: submitted open review persists decisions, restores automatic grading and updates student/admin totals`, async () => {
    const { db, role, call, session, item, mcq } =
      await openReviewDatabase(kind);
    try {
      const row = async () =>
        (
          await db.query(
            "select * from public.book_practice_items where id=$1",
            [item],
          )
        ).rows[0];
      const original = await row();
      assert.equal(original.correct, false);
      const review = async () =>
        (await call("book_practice_open_review", [session], ["uuid"]))[0];
      await role(admin);
      assert.deepEqual((await review()).accepted_answers, ["8.6", "43/5"]);
      const decide = (value, revision) =>
        call(
          "review_open_response",
          [session, item, value, revision],
          ["uuid", "uuid", "boolean", "bigint"],
        );
      const saved = await decide(true, 0);
      assert.equal(saved.review_correct, true);
      assert.equal(saved.automatic_correct, false);
      assert.equal(saved.reviewed_by, admin);
      assert.equal((await row()).correct, true);
      assert.equal((await review()).review_revision, 1);
      assert.equal(
        (await call("learning_metrics", [student], ["uuid"])).correct,
        1,
      );
      await assert.rejects(decide(false, 0), (e) => e.code === "40001");
      assert.equal((await row()).correct, true);
      await assert.rejects(
        call(
          "review_open_response",
          [session, mcq, true, 0],
          ["uuid", "uuid", "boolean", "bigint"],
        ),
        /Submitted open response required/,
      );
      await assert.rejects(
        db.query(
          "update public.practice_open_reviews set review_correct=false where item_id=$1",
          [item],
        ),
        /permission denied/,
      );
      await role(student);
      assert.equal((await review()).review_correct, true);
      assert.equal((await call("learning_metrics")).correct, 1);
      await call("finish_book_practice", [session], ["uuid"]);
      assert.equal(
        (await row()).correct,
        true,
        "submission replay cannot erase a manual decision",
      );
      await assert.rejects(decide(false, 1), /administrator required/i);
      await role(other);
      assert.equal(
        (
          await db.query(
            "select * from public.practice_open_reviews where item_id=$1",
            [item],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(review(), /administrator review required/);
      await role(admin);
      await decide(false, 1);
      assert.equal((await review()).review_correct, false);
      assert.equal(
        (await call("learning_metrics", [student], ["uuid"])).correct,
        0,
      );
      await decide(null, 2);
      assert.equal((await review()).review_correct, null);
      assert.equal((await row()).correct, original.correct);
      assert.equal((await row()).selected_response, original.selected_response);
      assert.equal((await row()).answer_revision, original.answer_revision);
      assert.deepEqual((await row()).question, original.question);
      await db.exec(
        `reset role;update public.profiles set active=false where id='${admin}'`,
      );
      await role(admin);
      await assert.rejects(decide(true, 3), /administrator required/i);
    } finally {
      await db.close();
    }
  });

test("correct numeric alternatives keep automatic grading, and an incorrect override survives submission replay", async () => {
  const { db, role, call, session, item } = await openReviewDatabase(
    "book",
    true,
    null,
    "43/5",
  );
  try {
    const row = async () =>
      (
        await db.query("select * from public.book_practice_items where id=$1", [
          item,
        ])
      ).rows[0];
    assert.equal((await row()).correct, true);
    await role(admin);
    const saved = await call(
      "review_open_response",
      [session, item, false, 0],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    assert.equal(saved.automatic_correct, true);
    await role(student);
    await call("finish_book_practice", [session], ["uuid"]);
    assert.equal((await row()).correct, false);
    await role(admin);
    await call(
      "review_open_response",
      [session, item, null, 1],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    assert.equal((await row()).correct, true);
    assert.equal((await row()).selected_response, "43/5");
  } finally {
    await db.close();
  }
});

test("unfinished attempts cannot expose official keys or accept review decisions", async () => {
  const { db, role, call, session, item } = await openReviewDatabase(
    "homework",
    false,
  );
  try {
    await role(admin);
    await assert.rejects(
      call("book_practice_open_review", [session], ["uuid"]),
      /Submitted own practice/,
    );
    await assert.rejects(
      call(
        "review_open_response",
        [session, item, true, 0],
        ["uuid", "uuid", "boolean", "bigint"],
      ),
      /Submitted practice required/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.practice_open_reviews",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("C07 reproduces with the old owner-only RPC and administrator review succeeds after restoring the current definition", async () => {
  const { db, role, call, session } = await openReviewDatabase();
  try {
    await db.exec("reset role");
    const current = (
      await db.query(
        "select pg_get_functiondef('public.book_practice_open_review(uuid)'::regprocedure) sql",
      )
    ).rows[0].sql;
    const source = await readFile(
      "supabase/migrations/20261007000100_homework_answers_and_bank_loading.sql",
      "utf8",
    );
    const start = source.indexOf(
      "create or replace function public.book_practice_open_review(",
    );
    await db.exec(source.slice(start, source.indexOf("end;$$;", start) + 7));
    await role(admin);
    await assert.rejects(
      call("book_practice_open_review", [session], ["uuid"]),
      /Submit your own book practice first/,
    );
    await db.exec("reset role");
    await db.exec(current);
    await role(admin);
    assert.deepEqual(
      (await call("book_practice_open_review", [session], ["uuid"]))[0]
        .accepted_answers,
      ["8.6", "43/5"],
    );
  } finally {
    await db.close();
  }
});
