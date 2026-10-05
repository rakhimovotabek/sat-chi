import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase } from "./helpers/database.js";

test("future book questions can store optional images per answer choice without changing answer indices", async () => {
  const { db } = await learningDatabase();
  try {
    await db.exec("reset role");
    const q = (
      await db.query(
        "select id,option_image_urls from public.questions limit 1",
      )
    ).rows[0];
    assert.deepEqual(q.option_image_urls, [null, null, null, null]);
    await db.query(
      "update public.questions set image_url=$1,option_image_urls=$2::jsonb where id=$3",
      [
        "https://example.com/fixture-graph.webp",
        JSON.stringify([
          "https://example.com/fixture-choice.webp",
          null,
          null,
          null,
        ]),
        q.id,
      ],
    );
    const saved = (
      await db.query(
        "select image_url,option_image_urls from public.questions where id=$1",
        [q.id],
      )
    ).rows[0];
    assert.equal(
      saved.option_image_urls[0],
      "https://example.com/fixture-choice.webp",
    );
    await assert.rejects(
      db.query(
        "update public.questions set option_image_urls=$1::jsonb where id=$2",
        [JSON.stringify(["javascript:bad", null, null, null]), q.id],
      ),
    );
    await assert.rejects(
      db.query(
        "update public.questions set option_image_urls=$1::jsonb where id=$2",
        ["[null]", q.id],
      ),
    );
  } finally {
    await db.close();
  }
});
