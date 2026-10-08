import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nativeAppEnvironment } from "./helpers/native-app-environment.js";

test(
  "PostgreSQL17 cutover preserves application history while independent Storage metadata writes continue",
  {
    skip: !(
      process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 120000,
  },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    assert.match(
      await app.json("select to_jsonb(current_setting('server_version'))"),
      /^17\./,
    );
    await app.sql(
      await readFile("scripts/release/install-write-gate.sql", "utf8"),
    );
    await app.sql("select satchi_release.set_mode('maintenance')");
    const digest = async (table, exclude = "'__unused__'") =>
      app.json(
        `select jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to((to_jsonb(r)-${exclude})::text,'UTF8')),'hex'),'' order by encode(sha256(convert_to((to_jsonb(r)-${exclude})::text,'UTF8')),'hex')),''),'UTF8')),'hex')) from public.${table} r`,
      );
    const protectedTables = [
      "book_practice_items",
      "book_practice_sessions",
      "book_practice_keys",
      "book_practice_open_keys",
      "homework_assignments",
      "homework_attempts",
      "daily_homework_instances",
      "book_package_assets",
    ];
    const before = {};
    for (const table of protectedTables)
      before[table] = await digest(
        table,
        table === "book_practice_items" ? "'answer_revision'" : "'__unused__'",
      );
    const objectCount = await app.json(
      "select to_jsonb(count(*)) from storage.objects",
    );
    const objectsBefore = await app.json(
      "select jsonb_agg(to_jsonb(o) order by id) from storage.objects o",
    );
    const original = await app.json(
      `select to_jsonb(i) from public.book_practice_items i order by id limit 1`,
    );
    assert.ok(original, "Recovery fixture must contain a real practice item");
    let stop = false,
      completed = 0;
    const writer = (async () => {
      while (!stop) {
        await app.sql(
          `insert into storage.objects(bucket_id,name)values('question-assets','independent-cutover/${completed}.webp')`,
        );
        completed++;
      }
    })();
    try {
      for (const file of [
        "20261008000100_homework_lifecycle.sql",
        "20261008000200_practice_answer_integrity.sql",
        "20261008000300_admin_open_response_review.sql",
        "20261008000400_homework_snapshot_assets.sql",
      ])
        await app.sql(await readFile("supabase/migrations/" + file, "utf8"));
    } finally {
      stop = true;
      await writer;
    }
    assert.ok(
      completed > 0,
      "An independent connection must actually commit writes during migration",
    );
    assert.equal(
      await app.json("select to_jsonb(count(*)) from storage.objects"),
      objectCount + completed,
    );
    for (const row of objectsBefore) {
      assert.deepEqual(
        await app.json(
          `select to_jsonb(o) from storage.objects o where id='${row.id}'`,
        ),
        row,
      );
    }
    for (const table of protectedTables) {
      assert.deepEqual(
        await digest(
          table,
          table === "book_practice_items"
            ? "'answer_revision'"
            : "'__unused__'",
        ),
        before[table],
        table + " must remain unchanged",
      );
    }
    assert.equal(
      await app.json(
        "select to_jsonb(mode) from satchi_release.control where id",
      ),
      "maintenance",
    );
    // Rehearse a targeted recovery from the pre-cutover canonical record.
    // Never restore/drop Auth/Storage schemas or reset answer revision counters.
    await app.sql(
      `update public.book_practice_items set marked=not marked where id='${original.id}'`,
    );
    const newRevision = await app.json(
      `select to_jsonb(answer_revision) from public.book_practice_items where id='${original.id}'`,
    );
    await app.sql(
      `update public.book_practice_items set marked=${original.marked} where id='${original.id}'`,
    );
    assert.deepEqual(
      await app.json(
        `select to_jsonb(i)-'answer_revision' from public.book_practice_items i where id='${original.id}'`,
      ),
      original,
    );
    assert.ok(
      (await app.json(
        `select to_jsonb(answer_revision) from public.book_practice_items where id='${original.id}'`,
      )) > newRevision,
    );
    assert.equal(
      await app.json("select to_jsonb(count(*)) from storage.objects"),
      objectCount + completed,
      "Scoped application recovery must retain independent Storage uploads",
    );
  },
);
