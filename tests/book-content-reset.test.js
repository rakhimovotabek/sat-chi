import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { learningDatabase, admin, student } from "./helpers/database.js";

test("book reset empties the library and preserves shared practice and vocabulary", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    await role(admin);
    const day = (
      await db.query(
        "select (now() at time zone 'Asia/Tashkent')::date::text d",
      )
    ).rows[0].d;
    await call(
      "save_daily_homework",
      [
        JSON.stringify({
          title: "Protected frozen pool",
          timezone: "Asia/Tashkent",
          startDate: day,
          count: 2,
          selection: "random",
          filters: { book },
          students: [student],
          allowLate: true,
        }),
      ],
      ["jsonb"],
    );
    const poolBefore = (
      await db.query(
        "select jsonb_agg(p order by p.question_id) snapshot from public.daily_homework_pool_questions p",
      )
    ).rows[0].snapshot;
    assert.equal(poolBefore.length, 12);
    await db.exec("reset role");
    await db.exec(`insert into public.book_practice_sessions(student_id,title,kind) values('${student}','Book history to delete','book'),('${student}','Saved bank history','bank'),('${student}','Saved homework','homework'),('${student}','Saved vocabulary','vocabulary');
      insert into public.book_practice_items(session_id,position,question,selected_response,has_answered,correct)
      select id,0,'{"id":"f2000000-0000-0000-0000-000000000001","question_type":"open"}','42',true,true from public.book_practice_sessions;
      insert into public.book_practice_open_keys(item_id,accepted_answers) select id,'["42"]' from public.book_practice_items;
      insert into public.practice_open_reviews(item_id,automatic_correct,review_correct,revision) select id,true,false,1 from public.book_practice_items;
      insert into public.book_open_answers(question_id,accepted_answers) select id,'["42"]' from public.questions limit 1;
      insert into public.book_import_packages(book_id,slug,fingerprint,source_payload,manifest,review,provenance) select id,'reset-fixture','fixture','{}','{}','{}','{}' from public.books;
      insert into public.book_package_assets(path,book_id,kind,source_path,sha256)select 'fixture.png',id,'archive','fixture.png','fixture' from public.books;
      insert into public.vocabulary_books(title) values('Preserved vocabulary');`);
    const protectedBefore = (
      await db.query(`select jsonb_build_object(
      'items',(select jsonb_agg(i order by i.id) from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.kind<>'book'),
      'keys',(select jsonb_agg(k order by k.item_id) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id join public.book_practice_sessions s on s.id=i.session_id where s.kind<>'book'),
      'reviews',(select jsonb_agg(r order by r.item_id) from public.practice_open_reviews r join public.book_practice_items i on i.id=r.item_id join public.book_practice_sessions s on s.id=i.session_id where s.kind<>'book')) snapshot`)
    ).rows[0].snapshot;
    await db.exec(
      await readFile("scripts/books/delete-imported-content.sql", "utf8"),
    );
    for (const table of [
      "books",
      "book_topics",
      "questions",
      "question_answers",
      "content_imports",
      "local_question_imports",
      "question_bank_eligibility",
      "book_open_answers",
      "book_import_packages",
      "book_package_assets",
    ])
      assert.equal(
        (await db.query(`select count(*)::integer n from public.${table}`))
          .rows[0].n,
        0,
      );
    assert.deepEqual(
      (
        await db.query(
          "select kind from public.book_practice_sessions order by kind",
        )
      ).rows.map((r) => r.kind),
      ["bank", "homework", "vocabulary"],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from public.vocabulary_books",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::integer n from auth.users")).rows[0].n,
      3,
    );
    const after = (
      await db.query(`select jsonb_build_object(
      'items',(select jsonb_agg(i order by i.id) from public.book_practice_items i),
      'keys',(select jsonb_agg(k order by k.item_id) from public.book_practice_open_keys k),
      'reviews',(select jsonb_agg(r order by r.item_id) from public.practice_open_reviews r)) snapshot`)
    ).rows[0].snapshot;
    assert.deepEqual(after, protectedBefore);
    assert.deepEqual(
      (
        await db.query(
          "select jsonb_agg(p order by p.question_id) snapshot from public.daily_homework_pool_questions p",
        )
      ).rows[0].snapshot,
      poolBefore,
    );
  } finally {
    await db.close();
  }
});

test("book reset rejects unexpected protected mutations and rolls back source deletion", async () => {
  const { db } = await learningDatabase();
  try {
    await db.exec("reset role");
    await db.exec(`insert into public.vocabulary_books(title) values('Protected vocabulary');
      create function public.reset_test_tamper() returns trigger language plpgsql as $$begin
        update public.vocabulary_books set title='Unexpected mutation'; return old; end$$;
      create trigger reset_test_tamper before delete on public.books for each row execute function public.reset_test_tamper();`);
    await assert.rejects(
      db.exec(
        await readFile("scripts/books/delete-imported-content.sql", "utf8"),
      ),
      /Protected data changed: vocabulary_books/,
    );
    await db.exec("rollback");
    assert.equal(
      (await db.query("select title from public.vocabulary_books")).rows[0]
        .title,
      "Protected vocabulary",
    );
    assert.equal(
      (await db.query("select count(*)::integer n from public.books")).rows[0]
        .n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from public.question_bank_eligibility",
        )
      ).rows[0].n,
      12,
    );
  } finally {
    await db.close();
  }
});
