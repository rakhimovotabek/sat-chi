import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { backup, query, project } from "./backup.js";
import { privateStorageClient } from "../imports/private-storage.js";
if (!process.argv.includes("--apply"))
  throw new Error("Explicit --apply required");
const keep = "6b70f3f6-f00c-5a9c-ac6f-7d253e78503b";
const { directory, snapshot, objects } = await backup();
assert.equal(
  snapshot.books.length,
  1,
  "Unexpected additional books; inspect provenance before deleting",
);
assert.equal(snapshot.books[0].id, keep);
assert.equal(snapshot.questions.length, 589);
assert.equal(snapshot.book_topics.length, 5);
assert.equal(snapshot.book_package_assets.length, 3163);
assert.ok(
  snapshot.import_jobs.every(
    (j) => j.source_type !== "book" || j.book_id === keep,
  ),
);
const serialized = JSON.stringify(snapshot);
const candidates = objects.filter(
  (o) =>
    ["question-assets", "book-covers"].includes(o.bucket_id) &&
    !serialized.includes(o.name),
);
await writeFile(
  `${directory}/assets-to-delete.json`,
  JSON.stringify(candidates, null, 2),
  { mode: 0o600 },
);
const client = await privateStorageClient(project);
for (const bucket of new Set(candidates.map((o) => o.bucket_id))) {
  const paths = candidates
    .filter((o) => o.bucket_id === bucket)
    .map((o) => o.name);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await client.storage
      .from(bucket)
      .remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}
const result = await query(
  `select (select count(*) from questions) questions,(select count(*) from book_topics where book_id='${keep}') topics,(select count(*)from storage.objects where bucket_id='book-package-assets') algebra_assets,(select count(*)from content_review_items where item_type='question' and status='approved') approved_questions,(select count(*)from content_review_items where status='approved') all_approved_items,(select count(*)from content_review_items r left join import_jobs j on j.id=r.source_id where j.id is null) orphan_review_sources`,
);
assert.equal(result[0].questions, 589);
assert.equal(result[0].topics, 5);
assert.equal(result[0].algebra_assets, 3163);
assert.equal(result[0].orphan_review_sources, 0);
console.log(
  JSON.stringify({
    deletedAssets: candidates.length,
    byBucket: Object.fromEntries(
      [...new Set(candidates.map((o) => o.bucket_id))].map((b) => [
        b,
        candidates.filter((o) => o.bucket_id === b).length,
      ]),
    ),
    preservedLegacyAssets:
      objects.filter((o) =>
        ["question-assets", "book-covers"].includes(o.bucket_id),
      ).length - candidates.length,
    ...result[0],
  }),
);
