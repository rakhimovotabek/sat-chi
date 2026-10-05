import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const run = promisify(execFile);
export const project = "ileffhbbaomfimwulvpw";
export async function query(sql) {
  if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== project)
    throw new Error("Unexpected linked project.");
  const { stdout } = await run(
    "npx",
    [
      "--offline",
      "supabase@2.119.0",
      "db",
      "query",
      "--linked",
      sql,
      "--output",
      "json",
    ],
    { maxBuffer: 128 * 1024 * 1024 },
  );
  return JSON.parse(stdout.slice(stdout.indexOf("{"))).rows;
}
export async function backup() {
  const directory = resolve(
    "book-reset-backups",
    new Date().toISOString().replaceAll(":", "-"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Snapshot all public tables for safety; restore only reset-affected records.
  // Private student information stays local, ignored, and owner-readable.
  const tables = await query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  );
  for (const { tablename } of tables)
    if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unsafe table name");
  const snapshot = (
    await query(
      `select jsonb_build_object(${tables.map(({ tablename }) => `'${tablename}',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${tablename} t)`).join(",")}) data`,
    )
  )[0].data;
  const definitions = await query(
    "select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
  );
  const objects = await query(
    "select bucket_id,name,metadata from storage.objects order by bucket_id,name",
  );
  await writeFile(`${directory}/database.json`, JSON.stringify(snapshot), {
    mode: 0o600,
  });
  await writeFile(
    `${directory}/functions.sql`,
    definitions.map((r) => r.definition + ";").join("\n"),
    { mode: 0o600 },
  );
  await writeFile(`${directory}/storage.json`, JSON.stringify(objects), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      backup: directory,
      tables: tables.length,
      books: snapshot.books.length,
      questions: snapshot.questions.length,
      storage_objects: objects.length,
    }),
  );
  return { directory, snapshot, objects };
}
if (process.argv[1] === new URL(import.meta.url).pathname) await backup();
