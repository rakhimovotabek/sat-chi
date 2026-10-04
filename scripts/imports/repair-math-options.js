// Repair the existing catalog in place: same IDs, source pages and correct keys.
// No imports, approvals, publication, or original PDF uploads.
import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import { privateStorageClient } from "./private-storage.js";
import { sourcePath, fingerprintFile, atomicJson } from "./source-files.js";
const run = promisify(execFile),
  apply = process.argv.includes("--apply"),
  catalogOnly = process.argv.includes("--catalog-only"),
  reuseAssets = process.argv.includes("--reuse-assets");
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const sourceFilter = process.argv.find(v => v.startsWith("--source="))?.slice(9);
const manifest = JSON.parse(
    await readFile("local-imports/manifest.json", "utf8"),
  ),
  changes = [],
  counts = [];
for (const fingerprint of await readdir("local-imports/math")) {
  const folder = join("local-imports/math", fingerprint),
    report = manifest.find((r) => r.fingerprint === fingerprint);
  if (!report || (sourceFilter && report.source_file !== sourceFilter)) continue;
  const pdf = await sourcePath(
    join(homedir(), "Desktop", "Books"),
    report.source_path,
  );
  if ((await fingerprintFile(pdf)) !== fingerprint)
    throw new Error("Source changed");
  const rows = JSON.parse(
    (
      await run(
        "python3",
        [
          "scripts/imports/math-options.py",
          join(folder, "bbox.xml"),
          join(folder, "recovery.json"),
        ],
        { maxBuffer: 8 * 1024 * 1024 },
      )
    ).stdout,
  );
  if (
    fingerprint ===
    "dda68708697cec56bfaba3a8581285cd7414661b1188223a858a524f9f9a6585"
  ) {
    const evidence = JSON.parse(
      await readFile("local-imports/scan-options-verified.json", "utf8"),
    );
    if (evidence.fingerprint !== fingerprint)
      throw new Error("Scan evidence mismatch");
    for (const r of rows) {
      const verified = evidence.rows.find((v) => v.page === r.page);
      if (!verified || r.key_page !== 155 || r.number !== r.page)
        throw new Error("Scan key provenance mismatch");
      Object.assign(r, verified, {
        options_verified: true,
        reason: null,
        verifiedMethod: "rendered_page_verified_v1",
      });
    }
  }
  counts.push({
    source: report.source_file,
    verified: rows.filter((r) => r.options_verified).length,
    excluded: rows.filter((r) => !r.options_verified).length,
  });
  for (const r of rows) changes.push({ ...r, folder });
  await atomicJson(join(folder, "options-recovery.json"), rows);
}
console.log(JSON.stringify(counts));
if (!apply) process.exit(0);
const client = reuseAssets ? null : await privateStorageClient();
// Prepare/upload the corrected stem assets first, before changing catalog options.
for (const [, rows] of Map.groupBy(
  changes.filter((r) => r.options_verified),
  (r) => r.folder + "|" + r.page,
)) {
  if (reuseAssets) continue;
  if (catalogOnly && rows.every((r) => !r.verifiedMethod)) continue;
  const first = rows[0],
    args = [join(first.folder, `page-${first.page}.png`)];
  for (const r of rows) {
    const [x, y, w, h] = r.stem_bounds.map((v) => Math.round(v * 2));
    r.correctedFile = join(r.folder, "stem-" + r.asset.split("/")[1]);
    args.push(
      "(",
      "+clone",
      "-crop",
      `${w}x${h}+${x}+${y}`,
      "+repage",
      "-strip",
      "-quality",
      "85",
      "-write",
      r.correctedFile,
      "+delete",
      ")",
    );
  }
  args.push("null:");
  await run("magick", args, { timeout: 60000, maxBuffer: 1024 * 1024 });
}
const safe = changes.filter((r) => r.options_verified);
for (let offset = 0; offset < safe.length; offset += 6) {
  await Promise.all(
    safe
      .slice(offset, offset + 6)
      .filter((r) => !reuseAssets && (!catalogOnly || r.verifiedMethod))
      .map(async (r) => {
        const bytes = await readFile(r.correctedFile);
        if (bytes.length > 1048576) throw new Error("Asset exceeds size limit");
        const { error } = await client.storage
          .from("question-assets")
          .upload(r.asset, bytes, { contentType: "image/webp", upsert: true });
        if (error) throw new Error("Private asset update failed");
      }),
  );
}

const literal = (v) =>
  "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
for (let offset = 0; offset < changes.length; offset += 200) {
  const batch = changes.slice(offset, offset + 200).map((r) => ({
    asset: r.asset,
    options: r.options_verified ? r.options : ["", "", "", ""],
    metadata: {
      options_verified: r.options_verified,
      option_extraction_method:
        r.verifiedMethod || "embedded_single_baseline_v1",
      option_extraction_reason: r.reason,
      stem_bounds: r.stem_bounds || null,
    },
  }));
  const sql = `begin;with repairs as(select * from jsonb_to_recordset(${literal(batch)}) as x(asset text,options jsonb,metadata jsonb)),changed as(update public.questions q set options=r.options,import_metadata=q.import_metadata||r.metadata from repairs r,public.book_topics t,public.books b where t.id=q.topic_id and b.id=t.book_id and q.import_metadata->>'parser_version'='2026-10-04.math-regions1' and q.import_metadata->>'visual_asset'=r.asset and (q.options is distinct from r.options or not(q.import_metadata @> r.metadata)) returning q.id)select count(*) changed from changed;insert into public.local_question_imports(fingerprint,question_id) select public.local_question_fingerprint(jsonb_build_object('question',q.question_text,'passage',q.passage,'stimulus',q.stimulus,'options',q.options,'imageUrl',q.image_url,'table',q.stimulus_table)),q.id from public.questions q where q.import_metadata->>'option_extraction_method' in ('embedded_single_baseline_v1','rendered_page_verified_v1') on conflict(fingerprint)do nothing;commit;`;
  console.log(
    `Repairing catalog batch ${offset + 1}–${Math.min(offset + 200, changes.length)}`,
  );
  await run(
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
    { maxBuffer: 1024 * 1024, timeout: 120000 },
  );
}
await atomicJson("local-imports/math-options-repair-report.json", {
  counts,
  changed: null,
  note: "CLI transaction output omits UPDATE counts; verify catalog separately",
});
console.log(
  `Processed ${changes.length} existing questions; keys and IDs preserved. Verify catalog counts separately.`,
);
