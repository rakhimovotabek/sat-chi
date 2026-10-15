import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { learningDatabase, admin, student, other } from "./helpers/database.js";

test("admin book analytics retain initial mistakes and reject student access and foreign writes", async () => {
  const { db, call, role, book } = await learningDatabase();
  try {
    const topic = (
      await db.query("select id from book_topics where book_id=$1", [book])
    ).rows[0].id;
    const sid = await call("start_book_practice", [topic], ["uuid"]);
    const item = (
      await db.query(
        "select * from book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows[0];
    for (const choice of [0, 1])
      await call(
        "check_book_practice_answer",
        [sid, item.id, choice, randomUUID()],
        ["uuid", "uuid", "integer", "uuid"],
      );
    await role(admin);
    const books = await call("admin_student_books", [student], ["uuid"]);
    assert.equal(books.books[0].id, book);
    assert.equal(books.progress[0].first_incorrect, 1);
    assert.equal(books.progress[0].eventually_correct, 1);
    assert.equal(books.progress[0].first_accuracy, 0);
    const outline = await call(
      "admin_student_book_outline",
      [student, book, "corrected", 0],
      ["uuid", "uuid", "text", "integer"],
    );
    assert.equal(outline.total, 1);
    const review = await call(
      "admin_student_book_question",
      [student, book, item.question.id],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(review.read_only, true);
    assert.equal(review.first_correct, false);
    assert.equal(review.review.correct_answer, "1");
    assert.deepEqual(
      review.history.rows.map((a) => a.correct),
      [false, true],
    );
    const unanswered = await call(
      "admin_student_book_outline",
      [student, book, "unanswered", 0],
      ["uuid", "uuid", "text", "integer"],
    );
    const empty = await call(
      "admin_student_book_question",
      [student, book, unanswered.rows[0].question_id],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(empty.item.selected_answer, null);
    await assert.rejects(
      call(
        "save_practice_changes",
        [
          sid,
          JSON.stringify([
            { id: item.id, expected_revision: 0, selected_answer: 2 },
          ]),
        ],
        ["uuid", "jsonb"],
      ),
      /unavailable/i,
    );
    await assert.rejects(
      call("finish_book_practice", [sid], ["uuid"]),
      /unavailable/i,
    );
    await assert.rejects(
      call(
        "check_book_practice_answer",
        [sid, item.id, 2, randomUUID()],
        ["uuid", "uuid", "integer", "uuid"],
      ),
      /own/i,
    );
    for (const uid of [student, other]) {
      await role(uid);
      await assert.rejects(
        call("admin_student_books", [student], ["uuid"]),
        /administrator/i,
      );
      await assert.rejects(
        call(
          "admin_student_book_question",
          [student, book, item.question.id],
          ["uuid", "uuid", "uuid"],
        ),
        /administrator/i,
      );
    }
  } finally {
    await db.close();
  }
});
