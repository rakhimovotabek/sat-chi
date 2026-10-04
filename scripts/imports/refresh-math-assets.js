// Re-render existing region assets without changing their paths or catalog IDs.
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import { privateStorageClient } from "./private-storage.js";
import { sourcePath, fingerprintFile, atomicJson } from "./source-files.js";
const run = promisify(execFile),
  source = process.argv.find((a) => a.startsWith("--source="))?.slice(9);
const report = JSON.parse(
  await readFile("local-imports/manifest.json", "utf8"),
).find((r) => r.source_file === source);
if (!report) throw new Error("Source missing");
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const pdf = await sourcePath(
  join(homedir(), "Desktop", "Books"),
  report.source_path,
);
if ((await fingerprintFile(pdf)) !== report.fingerprint)
  throw new Error("Source changed");
const folder = join("local-imports", "math", report.fingerprint),
  recovery = JSON.parse(await readFile(join(folder, "recovery.json"), "utf8"));
for (const [page, regions] of Map.groupBy(recovery.accepted, (r) => r.page)) {
  const args = [join(folder, `page-${page}.png`)];
  for (const r of regions) {
    const side = r.bounds[0] > r.page_width / 2 ? 1 : 0;
    r.render_bounds = [
      side ? r.page_width / 2 - 8 : 0,
      r.bounds[1],
      r.page_width / 2 + 8,
      r.bounds[3],
    ];
    const [x, y, w, h] = r.render_bounds.map((n) => Math.round(n * 2));
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
      join(folder, r.asset.split("/")[1]),
      "+delete",
      ")",
    );
  }
  args.push("null:");
  await run("magick", args, { timeout: 60000, maxBuffer: 1024 * 1024 });
}
const client = await privateStorageClient();
for (let i = 0; i < recovery.accepted.length; i += 6)
  await Promise.all(
    recovery.accepted.slice(i, i + 6).map(async (r) => {
      const bytes = await readFile(join(folder, r.asset.split("/")[1]));
      if (bytes.length > 1048576) throw new Error("Asset too large");
      const { error } = await client.storage
        .from("question-assets")
        .upload(r.asset, bytes, { contentType: "image/webp", upsert: true });
      if (error) throw new Error("Question asset refresh failed");
    }),
  );
await atomicJson(join(folder, "recovery.json"), recovery);
console.log(
  `${source}: refreshed ${recovery.accepted.length} existing asset paths; no catalog changes.`,
);
