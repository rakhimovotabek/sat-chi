import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
const exec = promisify(execFile);
const admin = "f1000000-0000-0000-0000-000000000001",
  student = "f1000000-0000-0000-0000-000000000002";
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";

test(
  "native PostgreSQL separate connections serialize stale answers and concurrent homework edits without data loss",
  { skip: !process.env.SATCHI_TEST_POSTGRES_BIN, timeout: 120000 },
  async (t) => {
    const bin = resolve(process.env.SATCHI_TEST_POSTGRES_BIN);
    const folder = await mkdtemp(join(tmpdir(), "satchi-native-postgres-"));
    const data = join(folder, "data");
    const server = createServer();
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    await new Promise((r) => server.close(r));
    const env = { ...process.env };
    const psql = (sql) =>
      exec(
        join(bin, "psql"),
        [
          "-X",
          "-h",
          "127.0.0.1",
          "-p",
          String(port),
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
          "-c",
          sql,
        ],
        { env, maxBuffer: 8 * 1024 * 1024 },
      );
    const as = (uid, sql) =>
      `set role authenticated;select set_config('request.jwt.claim.sub',${quote(uid)},false);${sql}`;
    const json = async (sql) =>
      JSON.parse((await psql(sql)).stdout.trim().split("\n").at(-1));
    let running = false;
    try {
      await exec(
        join(bin, "initdb"),
        ["-D", data, "--no-locale", "--encoding=UTF8", "--auth=trust"],
        { env },
      );
      await exec(
        join(bin, "pg_ctl"),
        [
          "-D",
          data,
          "-l",
          join(folder, "server.log"),
          "-o",
          `-h 127.0.0.1 -p ${port} -k ${folder}`,
          "-w",
          "start",
        ],
        { env },
      );
      running = true;
      await psql(
        "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;",
      );
      for (const file of (await readdir("supabase/migrations")).sort())
        await psql(await readFile(join("supabase/migrations", file), "utf8"));
      await psql(
        `insert into auth.users(id)values(${quote(admin)}),(${quote(student)});update public.profiles set role='admin' where id=${quote(admin)};`,
      );
      const payload = {
        schemaVersion: 1,
        kind: "book",
        book: {
          title: "Disposable concurrency fixture",
          category: "Math",
          published: true,
        },
        topics: [
          {
            title: "Algebra",
            questions: Array.from({ length: 32 }, (_, n) => ({
              type: "mcq",
              question: `Local concurrency question ${n}`,
              options: ["1", "2", "3", "4"],
              correctAnswer: 1,
              explanation: "Fixture key",
              domain: "Algebra",
              difficulty: "easy",
            })),
          },
        ],
      };
      await psql(
        as(
          admin,
          `select public.import_book_content(${quote(JSON.stringify(payload))}::jsonb);`,
        ),
      );
      const config = {
        title: "Concurrent homework",
        dueAt: "2026-12-01T12:00:00Z",
        students: [student],
        sections: [{ title: "Math", count: 10, filters: {} }],
      };
      const hid = await json(
        as(
          admin,
          `select to_jsonb(public.create_homework(${quote(JSON.stringify(config))}::jsonb));`,
        ),
      );
      const assignment = await json(
        as(student, "select public.homework_directory();"),
      );
      const sid = await json(
        as(
          student,
          `select to_jsonb(public.start_homework(${quote(assignment[0].assignment_id)}::uuid));`,
        ),
      );
      const items = await json(
        as(
          student,
          `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id=${quote(sid)};`,
        ),
      );
      const change = (id, answer) =>
        JSON.stringify([
          {
            id,
            selected_answer: answer,
            marked: false,
            eliminated: [],
            expected_revision: 0,
          },
        ]);
      const save = (id, answer, hold = false) =>
        psql(
          as(
            student,
            `begin;select public.save_practice_changes(${quote(sid)}::uuid,${quote(change(id, answer))}::jsonb);${hold ? "select pg_sleep(0.3);" : ""}commit;`,
          ),
        );
      await t.test(
        "independent question updates both commit from separate connections",
        async () => {
          await Promise.all([save(items[0].id, 1, true), save(items[1].id, 2)]);
          const rows = await json(
            as(
              student,
              `select jsonb_agg(selected_answer order by position) from public.book_practice_items where session_id=${quote(sid)};`,
            ),
          );
          assert.deepEqual(rows.slice(0, 2), [1, 2]);
        },
      );
      await t.test(
        "simultaneous conflicting writers have one commit and one version rejection",
        async () => {
          const result = await Promise.allSettled([
            save(items[2].id, 1, true),
            save(items[2].id, 2),
          ]);
          assert.equal(
            result.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.match(
            result.find((r) => r.status === "rejected").reason.stderr,
            /Answers changed in another tab/,
          );
        },
      );
      await t.test(
        "question edit racing an answer save either retains the answer or archives it; never silently overwrites",
        async () => {
          const definition = (
            await json(
              as(
                admin,
                `select public.homework_edit_data(${quote(hid)}::uuid);`,
              ),
            )
          ).data;
          const ids = await json(
            as(
              admin,
              "select jsonb_agg(id order by id) from public.questions;",
            ),
          );
          const selected = [
            ...definition.sections[0].questionIds.filter(
              (id) => id !== items[3].question.id,
            ),
            ...ids.filter(
              (id) => !definition.sections[0].questionIds.includes(id),
            ),
          ].slice(0, 20);
          const edited = {
            ...definition,
            sections: [
              { title: "Edited Math", count: 20, questionIds: selected },
            ],
          };
          const result = await Promise.allSettled([
            save(items[3].id, 1, true),
            psql(
              as(
                admin,
                `select public.update_homework(${quote(hid)}::uuid,${quote(JSON.stringify(edited))}::jsonb);`,
              ),
            ),
          ]);
          assert.equal(result[1].status, "fulfilled");
          const count = await json(
            as(
              student,
              `select to_jsonb(count(*)) from public.book_practice_items where session_id=${quote(sid)};`,
            ),
          );
          assert.equal(count, 20);
          if (result[0].status === "fulfilled") {
            const history = await json(
              as(
                admin,
                `select jsonb_agg(item) from public.homework_item_history where item->>'id'=${quote(items[3].id)};`,
              ),
            );
            assert.ok(history.some((i) => i.selected_answer === 1));
          } else
            assert.match(result[0].reason.stderr, /Homework questions changed/);
          const first = await json(
            as(
              student,
              `select to_jsonb(selected_answer) from public.book_practice_items where id=${quote(items[0].id)};`,
            ),
          );
          assert.equal(first, 1);
        },
      );
    } finally {
      if (running)
        await exec(
          join(bin, "pg_ctl"),
          ["-D", data, "-m", "immediate", "-w", "stop"],
          { env },
        ).catch(() => {});
      await rm(folder, { recursive: true, force: true });
    }
  },
);
