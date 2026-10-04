// Idempotent, scoped repair using persisted evidence and exact catalog fingerprints.
// Does not re-import content or change any question text, keys or publication.
import { readFile, writeFile, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { attachProvenance } from "./provenance.js";
import { sourcePath, fingerprintFile, atomicJson } from "./source-files.js";
import { validateLocalImport } from "./local-validation.js";
const root = await realpath(join(homedir(), "Desktop", "Books")),
  run = promisify(execFile),
  manifest = JSON.parse(await readFile("local-imports/manifest.json", "utf8"));
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const json = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
for (const r of manifest.filter(
  (r) => r.resolution_status === "partial" && r.intermediate_file,
)) {
  if (
    (await fingerprintFile(await sourcePath(root, r.source_path))) !==
    r.fingerprint
  )
    throw new Error("Source changed");
  const path = join("local-imports", r.intermediate_file);
  if ((await fingerprintFile(path)) !== r.intermediate_hash)
    throw new Error("Intermediate changed");
  const payload = JSON.parse(await readFile(path, "utf8"));
  attachProvenance(payload.topics, r.evidence, r.source_file, r.parser_version);
  if (validateLocalImport(payload).errors.length)
    throw new Error("Invalid repaired provenance");
  const flat = [];
  const walk = (ts) =>
    ts.forEach((t) => {
      flat.push(...(t.questions || []));
      walk(t.children || []);
    });
  walk(payload.topics);
  if (flat.some((q) => !q.source_page || !q.import_metadata))
    throw new Error("Incomplete page inventory");
  const values = flat
    .map(
      (q) =>
        `(public.local_question_fingerprint(${json(q)}),${q.source_page},${json(q.import_metadata)})`,
    )
    .join(",\n");
  const sql = `begin;select pg_advisory_xact_lock(hashtextextended('satchi-local-import',0));
 do $repair_guard$ begin if exists(select 1 from public.import_jobs j join public.books b on b.id=j.book_id where j.fingerprint='${r.fingerprint}' and b.published) or exists(select 1 from public.content_review_audit a join public.import_jobs j on j.id=a.source_id where j.fingerprint='${r.fingerprint}' and a.actor is not null) then raise exception 'Refusing to repair published or manually reviewed content; use administrator review';end if;end $repair_guard$;
 create temporary table repaired(id uuid) on commit drop;
 with evidence(fp,page,metadata) as(values ${values}),changed as(
 update public.questions q set source_page=e.page,import_metadata=e.metadata from evidence e,public.local_question_imports l,public.book_topics t,public.import_jobs j where l.fingerprint=e.fp and l.question_id=q.id and q.topic_id=t.id and public.local_question_fingerprint(jsonb_build_object('question',q.question_text,'passage',q.passage,'stimulus',q.stimulus,'options',q.options,'imageUrl',q.image_url,'table',q.stimulus_table))=e.fp and t.book_id=j.book_id and j.fingerprint='${r.fingerprint}' and (q.source_page is distinct from e.page or q.import_metadata is distinct from e.metadata) returning q.id) insert into repaired select id from changed;
 update public.content_review_items r set source_page=q.source_page,extraction_method=q.import_metadata->>'extraction_method' from public.questions q,public.book_topics t,public.import_jobs j where r.item_type='question' and r.entity_id=q.id and q.topic_id=t.id and t.book_id=j.book_id and j.fingerprint='${r.fingerprint}';
 update public.import_jobs set updated_at=now() where fingerprint='${r.fingerprint}' and exists(select 1 from repaired);
 select count(*) changed from repaired;commit;`;
  const file = `local-imports/${r.fingerprint}.provenance-repair.sql`;
  await writeFile(file, sql, { mode: 0o600 });
  if (process.argv.includes("--apply")) {
    await run(
      "npx",
      [
        "--offline",
        "supabase@2.119.0",
        "db",
        "query",
        "--linked",
        "--file",
        file,
        "--output",
        "json",
      ],
      { maxBuffer: 1024 * 1024 },
    );
    await atomicJson(path, payload);
    r.intermediate_hash = await fingerprintFile(path);
    r.provenance_repaired_at = new Date().toISOString();
    await atomicJson(`local-imports/${r.fingerprint}.report.json`, r);
    await atomicJson("local-imports/manifest.json", manifest);
    console.log(
      `${r.source_file}: verified provenance repaired without re-import`,
    );
  } else console.log(`${r.source_file}: repair prepared`);
}
