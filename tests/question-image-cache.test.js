import test from "node:test";
import assert from "node:assert/strict";
import { createQuestionImageCache } from "../src/components/question-image-cache.js";
test("image signing deduplicates mounts, isolates owners, expires before the capability, and bounds retention", async () => {
  let time = 0,
    calls = 0;
  const cache = createQuestionImageCache(async (src) => `${src}:${++calls}`, {
    now: () => time,
    ttl: 10,
    limit: 2,
  });
  assert.deepEqual(
    await Promise.all([cache.get("a", "image"), cache.get("a", "image")]),
    ["image:1", "image:1"],
  );
  assert.equal(await cache.get("b", "image"), "image:2");
  time = 10;
  assert.equal(await cache.get("a", "image"), "image:3");
  cache.invalidate("a", "image");
  assert.equal(await cache.get("a", "image"), "image:4");
  await cache.get("a", "second");
  await cache.get("a", "third");
  assert.equal(await cache.get("a", "image"), "image:7");
});
test("failed signing does not poison cache or remove a newer retry", async () => {
  let reject;
  const cache = createQuestionImageCache((src) =>
    src === "pending"
      ? new Promise((_, fail) => {
          reject = fail;
        })
      : Promise.resolve(src),
  );
  const first = cache.get("a", "pending");
  await Promise.resolve();
  cache.invalidate("a", "pending");
  const retry = cache.get("a", "pending");
  const assertFirst = assert.rejects(first, /Denied/);
  reject(new Error("Denied"));
  await assertFirst;
  assert.equal(cache.get("a", "pending"), retry);
});

test("clearing account capabilities does not reinsert an old in-flight result", async () => {
  let finish;
  let calls = 0;
  const cache = createQuestionImageCache(() =>
    ++calls === 1
      ? new Promise((done) => {
          finish = done;
        })
      : Promise.resolve("new-account-capability"),
  );
  const old = cache.get("student", "image");
  await Promise.resolve();
  cache.clear();
  finish("discarded-capability");
  await old;
  assert.equal(await cache.get("student", "image"), "new-account-capability");
});
