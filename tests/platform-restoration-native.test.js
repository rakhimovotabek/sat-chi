import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
import { catalogFixture, seedCatalogBook } from "./helpers/platform-catalog.js";
const exec = promisify(execFile);
test(
  "actual catalog hierarchy produces exact ordered whole-book totals and restores isolated evidence intact",
  {
    skip: !(
      process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 180000,
  },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const catalog = await catalogFixture();
    assert.equal(catalog.books.length, 15);
    assert.equal(
      catalog.books.reduce((n, b) => n + b.questions, 0),
      7931,
    );
    for (const name of [
      "800 Challenge",
      "The Complete Guide",
      "MathBook 2.0",
    ]) {
      const book = catalog.books.find((b) => b.title.includes(name));
      await seedCatalogBook(app, book);
      const sid = await app.json(
        app.as(
          student,
          `select public.start_entire_book_practice('${book.id}')`,
        ),
      );
      const snapshot = await app.json(
        `select jsonb_build_object('total',count(*),'distinct',count(distinct question->>'id'),'first',min(position),'last',max(position))from book_practice_items where session_id='${sid}'`,
      );
      assert.deepEqual(snapshot, {
        total: book.questions,
        distinct: book.questions,
        first: 0,
        last: book.questions - 1,
      });
      const topic = book.topics.find((t) => !t.parent_id);
      const ids = await app.json(
        app.as(
          student,
          `with recursive tree as(select id from book_topics where id='${topic.id}' union all select t.id from book_topics t join tree p on t.parent_id=p.id)select jsonb_build_object('expected',(select count(*)from questions where topic_id in(select id from tree)),'reported',(select (r->>'total')::integer from jsonb_array_elements(public.book_practice_progress('${book.id}'))r where r->>'topic_id'='${topic.id}'))`,
        ),
      );
      assert.equal(ids.reported, ids.expected);
    }
    const sid = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}')`),
    );
    const item = await app.json(
      `select to_jsonb(id)from book_practice_items where session_id='${sid}' order by position limit 1`,
    );
    await app.sql(
      app.as(
        student,
        `select public.check_book_practice_answer('${sid}','${item}',0,gen_random_uuid());select public.save_practice_changes('${sid}',jsonb_build_array((select jsonb_build_object('id',id,'expected_revision',answer_revision,'selected_answer',1)from book_practice_items where id='${item}')));select public.check_book_practice_answer('${sid}','${item}',1,gen_random_uuid());select public.finish_book_practice('${sid}');`,
      ),
    );
    const fingerprint = `select jsonb_build_object('questions',(select md5(string_agg(to_jsonb(x)::text,','order by id))from questions x),'keys',(select md5(string_agg(to_jsonb(x)::text,','order by question_id))from question_answers x),'items',(select md5(string_agg(to_jsonb(x)::text,','order by id))from book_practice_items x),'checks',(select md5(string_agg(to_jsonb(x)::text,','order by id))from question_check_attempts x),'grades',(select md5(string_agg(to_jsonb(x)::text,','order by id))from practice_grade_events x))`;
    const before = await app.json(fingerprint);
    const folder = await mkdtemp(join(tmpdir(), "satchi-platform-restore-"));
    t.after(() => rm(folder, { recursive: true, force: true }));
    const args = ["-h", "127.0.0.1", "-p", String(app.databasePort)];
    const archive = join(folder, "isolated.dump");
    await exec(join(process.env.SATCHI_TEST_POSTGRES_BIN, "pg_dump"), [
      ...args,
      "-d",
      "postgres",
      "-Fc",
      "-f",
      archive,
    ]);
    await app.sql("create database platform_restored");
    await exec(join(process.env.SATCHI_TEST_POSTGRES_BIN, "pg_restore"), [
      ...args,
      "-d",
      "platform_restored",
      "--exit-on-error",
      archive,
    ]);
    assert.deepEqual(
      JSON.parse(
        (await app.sql(fingerprint, "platform_restored")).split("\n").at(-1),
      ),
      before,
    );
    const metrics = JSON.parse(
      (
        await app.sql(
          app.as(student, "select public.learning_metrics()"),
          "platform_restored",
        )
      )
        .split("\n")
        .at(-1),
    );
    assert.equal(metrics.first_incorrect, 1);
    assert.equal(metrics.eventually_correct, 1);
    assert.equal(metrics.first_accuracy, 0);
  },
);
