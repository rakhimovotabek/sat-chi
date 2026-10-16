// Local-only first-page derivatives. No Supabase client, credentials or uploads.
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderFirstPage } from "../imports/cover-render.js";

const catalog = JSON.parse(
  await readFile("tests/fixtures/platform-catalog.json", "utf8"),
);
const roots = [
  join(homedir(), "Desktop/Books"),
  join(homedir(), "Downloads/AyuGram Desktop"),
];
const output = "local-imports/platform-book-previews";
await mkdir(output, { recursive: true });
const results = [];
for (const book of catalog.books) {
  const name = book.source_file;
  if (!name || basename(name) !== name) {
    results.push({ id: book.id, status: "source_unavailable" });
    continue;
  }
  let source;
  for (const root of roots) {
    const file = join(root, name);
    try {
      await access(file);
      source = file;
      break;
    } catch {
      /* exact filename only; do not guess another edition */
    }
  }
  if (!source) {
    results.push({ id: book.id, status: "source_unavailable" });
    continue;
  }
  try {
    const result = await renderFirstPage(source, join(output, book.id));
    if (result.status !== "generated") {
      results.push({ id: book.id, ...result });
      continue;
    }
    const sha256 = createHash("sha256")
      .update(await readFile(result.path))
      .digest("hex");
    results.push({
      id: book.id,
      title: book.title,
      ...result,
      storage_path: `books/${book.id}/${sha256}.webp`,
      metadata: {
        source_file: name,
        source_sha256: createHash("sha256")
          .update(await readFile(source))
          .digest("hex"),
        source_page: 1,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        extraction_method: result.extraction_method,
      },
    });
  } catch {
    results.push({ id: book.id, status: "render_failed" });
  }
}
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify({ local_only: true, uploaded: false, results }, null, 2) +
    "\n",
);
console.log(
  JSON.stringify({
    local_only: true,
    generated: results.filter((r) => r.status === "generated").length,
    unavailable: results.filter((r) => r.status === "source_unavailable")
      .length,
    other: results.filter(
      (r) => !["generated", "source_unavailable"].includes(r.status),
    ).length,
    manifest: join(output, "manifest.json"),
  }),
);
