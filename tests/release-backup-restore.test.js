import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { nativeAppEnvironment } from "./helpers/native-app-environment.js";
const exec = promisify(execFile);

test(
  "restore the private production backup into PostgreSQL17 and rehearse pending migrations",
  {
    skip: !(
      process.env.SATCHI_BACKUP_ARCHIVE &&
      process.env.SATCHI_TEST_POSTGRES_BIN &&
      process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 300000,
  },
  async (t) => {
    const archive = process.env.SATCHI_BACKUP_ARCHIVE;
    const folder = dirname(archive);
    const manifest = JSON.parse(
      await readFile(join(folder, "export-manifest.json"), "utf8"),
    );
    assert.equal(manifest.project, "ileffhbbaomfimwulvpw");
    for (const name of ["application.dump", "roles.sql"])
      assert.equal(
        createHash("sha256")
          .update(await readFile(join(folder, name)))
          .digest("hex"),
        manifest.sha256[name],
        "Backup checksum must match before restoration",
      );
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    const bin = process.env.SATCHI_TEST_POSTGRES_BIN;
    const port = String(app.databasePort);
    assert.match(
      await app.json("select to_jsonb(current_setting('server_version'))"),
      /^17\./,
    );
    // Policy role names are needed even when restoring without managed ownership.
    const roles = await readFile(join(folder, "roles.sql"), "utf8");
    for (const name of [
      ...roles.matchAll(/^CREATE ROLE ([a-zA-Z_][a-zA-Z0-9_]*);$/gm),
    ].map((match) => match[1]))
      await app.sql(
        `do $$begin if not exists(select 1 from pg_roles where rolname='${name}') then create role "${name}" nologin;end if;end$$`,
      );
    await app.sql("create database satchi_backup_restore");
    const query = async (sql) =>
      (
        await exec(
          join(bin, "psql"),
          [
            "-X",
            "-h",
            "127.0.0.1",
            "-p",
            port,
            "-d",
            "satchi_backup_restore",
            "-v",
            "ON_ERROR_STOP=1",
            "-At",
            "-c",
            sql,
          ],
          { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PGTZ: "UTC" } },
        )
      ).stdout.trim();
    await query(
      'drop schema public;create schema extensions;create extension "uuid-ossp" with schema extensions;create extension pgcrypto with schema extensions;create extension ltree with schema extensions;',
    );
    let restored = true;
    try {
      await exec(
        join(bin, "pg_restore"),
        [
          "--exit-on-error",
          "--no-owner",
          "-h",
          "127.0.0.1",
          "-p",
          port,
          "-d",
          "satchi_backup_restore",
          archive,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      );
    } catch (error) {
      restored = false;
      await writeFile(
        join(folder, "restore.private.log"),
        error.stderr || error.message,
        { mode: 0o600 },
      );
    }
    assert.ok(
      restored,
      "Restore failed; inspect the owner-readable restore.private.log outside Git (contents withheld)",
    );
    const result = JSON.parse(
      await query(
        `select jsonb_build_object('auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects),'questions',(select count(*) from public.questions),'practice_items',(select count(*) from public.book_practice_items),'migration_count',(select count(*) from supabase_migrations.schema_migrations))`,
      ),
    );
    await writeFile(
      join(folder, "storage-inventory.private.json"),
      await query(
        "select coalesce(jsonb_agg(jsonb_build_object('bucket_id',bucket_id,'name',name,'metadata',metadata) order by bucket_id,name),'[]') from storage.objects",
      ),
      { mode: 0o600 },
    );
    const historySql =
      "select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex'),'' order by i.id),''),'UTF8')),'hex') from public.book_practice_items i";
    const history = await query(historySql);
    const tables = JSON.parse(
      await query(
        "select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
      ),
    );
    const rowDigest = async (schema, table, exclude = "__unused__") =>
      JSON.parse(
        await query(
          `select jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to((to_jsonb(r)-'${exclude}')::text,'UTF8')),'hex'),'' order by encode(sha256(convert_to((to_jsonb(r)-'${exclude}')::text,'UTF8')),'hex')),''),'UTF8')),'hex')) from ${schema}."${table}" r`,
        ),
      );
    const protectedRows = {};
    for (const table of tables.filter(
      (name) => name !== "question_bank_eligibility",
    ))
      protectedRows[table] = await rowDigest(
        "public",
        table,
        table === "book_practice_items"
          ? "answer_revision"
          : table === "homework_questions"
            ? "open_key"
            : "__unused__",
      );
    const storageBefore = await rowDigest("storage", "objects");
    for (const file of [
      "20261008000100_homework_lifecycle.sql",
      "20261008000200_practice_answer_integrity.sql",
      "20261008000300_admin_open_response_review.sql",
      "20261008000400_homework_snapshot_assets.sql",
    ])
      await query(await readFile(join("supabase/migrations", file), "utf8"));
    assert.ok(
      (await query(
        historySql.replace("to_jsonb(i)", "(to_jsonb(i)-'answer_revision')"),
      )) === history,
      "Existing student answer and grading rows must remain unchanged",
    );
    for (const [table, before] of Object.entries(protectedRows))
      assert.deepEqual(
        await rowDigest(
          "public",
          table,
          table === "book_practice_items"
            ? "answer_revision"
            : table === "homework_questions"
              ? "open_key"
              : "__unused__",
        ),
        before,
        "Existing public rows must survive migration: " + table,
      );
    assert.deepEqual(
      await rowDigest("storage", "objects"),
      storageBefore,
      "All existing Storage metadata must remain unchanged",
    );
    await writeFile(
      join(folder, "application-integrity-baseline.private.json"),
      JSON.stringify(protectedRows, null, 2),
      { mode: 0o600 },
    );
    await writeFile(
      join(folder, "restoration-verification.json"),
      JSON.stringify(
        {
          postgresMajor: 17,
          restored: true,
          ...result,
          pendingMigrationsRehearsed: 4,
          existingAnswerRowsUnchanged: true,
          allExistingPublicRowsPreserved: true,
          existingPublicTablesVerified: Object.keys(protectedRows).length,
          storageMetadataUnchanged: true,
          deliberateDataChanges: [
            "question_bank_eligibility derived refresh",
            "homework_questions.open_key backfill",
            "book_practice_items.answer_revision default zero",
          ],
          limitations: [
            "Managed ownership not restored; original ACLs restored with native role stubs",
            "Storage object bytes require separate recovery verification",
            "Provider extensions outside the selected schemas require a managed Supabase recovery target",
          ],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await chmod(join(folder, "restoration-verification.json"), 0o600);
  },
);
