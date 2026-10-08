import { versionedFixtureArgs } from "./practice-save.js";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const admin = "f1000000-0000-0000-0000-000000000001",
  student = "f1000000-0000-0000-0000-000000000002",
  other = "f1000000-0000-0000-0000-000000000003";
export async function learningDatabase() {
  const db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;`,
  );
  for (const f of (await readdir("supabase/migrations")).sort())
    await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    `insert into auth.users(id)values('${admin}'),('${student}'),('${other}');update public.profiles set role='admin' where id='${admin}';`,
  );
  const role = (id) =>
    db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  const call = async (name, args = [], casts = []) => {
    args = await versionedFixtureArgs(db, name, args);
    return (
      await db.query(
        `select public.${name}(${args.map((_, i) => `$${i + 1}::${casts[i]}`).join(",")}) result`,
        args,
      )
    ).rows[0].result;
  };
  await role(admin);
  const imported = await call(
    "import_book_content",
    [
      JSON.stringify({
        schemaVersion: 1,
        kind: "book",
        book: { title: "Analytics fixture", category: "Math", published: true },
        topics: [
          {
            title: "Algebra",
            questions: Array.from({ length: 12 }, (_, i) => ({
              type: "mcq",
              question: `Solve fixture ${i}.`,
              options: ["2", "4", "6", "8"],
              correctAnswer: 1,
              explanation: "Divide.",
              domain: "Algebra",
              skill: "Equations",
              difficulty: "easy",
            })),
          },
        ],
      }),
    ],
    ["jsonb"],
  );
  await role(student);
  return { db, role, call, book: imported.book_id };
}
