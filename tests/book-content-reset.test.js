import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { learningDatabase, student } from "./helpers/database.js";

test("book reset empties the library and preserves shared practice and vocabulary", async () => {
  const { db } = await learningDatabase();
  try {
    await db.exec("reset role");
    await db.exec(`insert into public.book_practice_sessions(student_id,title,kind) values('${student}','Book history to delete','book'),('${student}','Saved bank history','bank'),('${student}','Saved homework','homework'),('${student}','Saved vocabulary','vocabulary');
      insert into public.vocabulary_books(title) values('Preserved vocabulary');`);
    await db.exec(await readFile("scripts/books/delete-imported-content.sql", "utf8"));
    for (const table of ["books", "book_topics", "questions", "question_answers", "content_imports", "local_question_imports"])
      assert.equal((await db.query(`select count(*)::integer n from public.${table}`)).rows[0].n, 0);
    assert.deepEqual((await db.query("select kind from public.book_practice_sessions order by kind")).rows.map((r) => r.kind), ["bank", "homework", "vocabulary"]);
    assert.equal((await db.query("select count(*)::integer n from public.vocabulary_books")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::integer n from auth.users")).rows[0].n, 3);
  } finally {
    await db.close();
  }
});
