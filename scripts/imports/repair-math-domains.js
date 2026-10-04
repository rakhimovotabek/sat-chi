import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mathDomain } from "./math-domain.js";
const run = promisify(execFile);
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const query = async (sql) => {
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
    { maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout.slice(stdout.indexOf("{"))).rows;
};
const sources = await query(
  "select distinct q.import_metadata->>'source_section' section from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where q.import_metadata->>'parser_version'='2026-10-04.math-regions1' and not b.published",
);
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const values = sources
  .map((r) => `(${literal(r.section)},${literal(mathDomain(r.section))})`)
  .join(",");
const changed = await query(
  `with mapping(section,domain) as (values ${values}), changed as(update public.questions q set domain=m.domain from mapping m,public.book_topics t,public.books b where t.id=q.topic_id and b.id=t.book_id and not b.published and q.import_metadata->>'parser_version'='2026-10-04.math-regions1' and q.import_metadata->>'source_section'=m.section and q.domain is distinct from m.domain returning q.id)select count(*) corrected from changed`,
);
console.log(
  `Corrected ${changed[0].corrected} draft domains from explicit section headings; no answer/image/publication changes.`,
);
