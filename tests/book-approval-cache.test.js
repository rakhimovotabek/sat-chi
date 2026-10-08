import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student } from "./helpers/database.js";

test("Book approval cache preserves legacy rules and follows every approval dependency", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    await db.exec("reset role");
    const { id: question, topic_id: topic } = (
      await db.query("select id,topic_id from public.questions limit 1")
    ).rows[0];
    const approval = async (expected) => {
      const { cached, original } = (
        await db.query(
          "select public.question_approved_for_students($1) cached,public.book_question_approved_uncached($1) original",
          [question],
        )
      ).rows[0];
      assert.equal(cached, original, "Cache must preserve the original rule");
      assert.equal(cached, expected);
    };
    await approval(true);
    await role(student);
    const session = await call("start_book_practice", [topic], ["uuid"]);
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.book_practice_items where session_id=$1",
          [session],
        )
      ).rows[0].n,
      12,
    );
    await assert.rejects(
      db.query("select * from public.question_bank_eligibility"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.book_question_approved_uncached($1)", [question]),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query(
      'update public.questions set options=\'["1","1","2","3"]\' where id=$1',
      [question],
    );
    await approval(false);
    await db.query(
      'update public.questions set options=\'["2","4","6","8"]\' where id=$1',
      [question],
    );
    await approval(true);
    const job = (
      await db.query(
        "insert into public.import_jobs(fingerprint,source_file,title,status) values(repeat('a',64),'fixture','Fixture','review') returning id",
      )
    ).rows[0].id;
    const review = (
      await db.query(
        "insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,status) values($1,'question',$2,'fixture','pending') returning id",
        [job, question],
      )
    ).rows[0].id;
    await approval(false);
    await db.query(
      "update public.content_review_items set status='approved' where id=$1",
      [review],
    );
    await approval(true);
    await db.query(
      "update public.content_review_items set warnings='[\"Possible duplicate\"]' where id=$1",
      [review],
    );
    await approval(false);
    await db.query(
      "update public.content_review_items set item_type='source' where id=$1",
      [review],
    );
    await approval(true);
    await db.query(
      "update public.content_review_items set item_type='question',warnings='[]' where id=$1",
      [review],
    );
    await db.query(
      "update public.questions set question_type='open',options='[]',import_metadata='{\"package_question_id\":\"fixture\"}' where id=$1",
      [question],
    );
    // Editing source content intentionally invalidates its previous approval.
    await db.query(
      "update public.content_review_items set status='approved' where id=$1",
      [review],
    );
    await approval(false);
    await db.query(
      "insert into public.book_import_packages values($1,'cache-fixture','fixture','{}','{}','{}','{}')",
      [book],
    );
    await approval(false);
    await db.query(
      "insert into public.book_open_answers(question_id,accepted_answers) values($1,'[\"1\"]')",
      [question],
    );
    await approval(true);
    const otherBook = (
      await db.query(
        "insert into public.books(title,published) values('Other fixture',true) returning id",
      )
    ).rows[0].id;
    await assert.rejects(
      db.query("update public.book_topics set book_id=$1 where id=$2", [
        otherBook,
        topic,
      ]),
      /book/i,
    );
    const otherTopic = (
      await db.query(
        "insert into public.book_topics(book_id,title,position) values($1,'Other topic',0) returning id",
        [otherBook],
      )
    ).rows[0].id;
    await db.query("update public.questions set topic_id=$1 where id=$2", [
      otherTopic,
      question,
    ]);
    await db.query(
      "update public.content_review_items set status='approved' where id=$1",
      [review],
    );
    await approval(false);
    await db.query("update public.questions set topic_id=$1 where id=$2", [
      topic,
      question,
    ]);
    await db.query(
      "update public.content_review_items set status='approved' where id=$1",
      [review],
    );
    await approval(true);
    await db.query(
      "delete from public.book_open_answers where question_id=$1",
      [question],
    );
    await approval(false);
    await db.query(
      "insert into public.book_open_answers(question_id,accepted_answers) values($1,'[\"1\"]')",
      [question],
    );
    await approval(true);
    await db.query("delete from public.book_import_packages where book_id=$1", [
      book,
    ]);
    await approval(false);
    assert.equal(
      (
        await db.query(
          "select count(*) n from public.book_practice_items where session_id=$1",
          [session],
        )
      ).rows[0].n,
      12,
      "Frozen started practice survives later source changes",
    );
  } finally {
    await db.close();
  }
});
