import test from "node:test";
import assert from "node:assert/strict";
import {
  createStudyTimeQueue,
  sendStudyTimeBatch,
} from "../src/features/player/study-time-batch.js";
for (const failed of [0, 1, 2])
  test(`heartbeat failure at entry ${failed} retains all failed/unsent time and only retries that remainder`, async () => {
    const entries = [
        [0, 5],
        [1, 7],
        [2, 9],
      ],
      pending = new Map();
    const sent = [];
    await assert.rejects(
      sendStudyTimeBatch(entries, pending, async (position, seconds) => {
        if (position === failed) {
          pending.set(1, 3);
          throw Error("offline");
        }
        sent.push([position, seconds]);
      }),
      /offline/,
    );
    for (const [position, seconds] of entries.slice(failed))
      assert.equal(pending.get(position), seconds + (position === 1 ? 3 : 0));
    const remaining = [...pending];
    pending.clear();
    await sendStudyTimeBatch(remaining, pending, async (p, s) =>
      sent.push([p, s]),
    );
    assert.equal(pending.size, 0);
    assert.equal(
      sent.reduce((sum, [, seconds]) => sum + seconds, 0),
      24,
    );
  });

test("a queued flush retries time restored by an earlier failed request", async () => {
  const pending = new Map([
    [0, 5],
    [1, 7],
  ]);
  const enqueue = createStudyTimeQueue(pending);
  let rejectRequest;
  const failed = enqueue(
    0,
    () =>
      new Promise((resolve, reject) => {
        rejectRequest = reject;
      }),
  );
  await Promise.resolve();
  await Promise.resolve();
  const sent = [];
  const retry = enqueue(1, async (p, seconds) => sent.push([p, seconds]));
  pending.set(2, 3);
  rejectRequest(Error("offline"));
  await assert.rejects(failed, /offline/);
  await retry;
  assert.deepEqual(sent, [
    [2, 3],
    [0, 5],
    [1, 7],
    [1, 0],
  ]);
  assert.equal(pending.size, 0);
});

test("different session queues retain their own pending study time", async () => {
  const oldPending = new Map([[0, 5]]),
    newPending = new Map([[0, 2]]);
  const oldQueue = createStudyTimeQueue(oldPending),
    newQueue = createStudyTimeQueue(newPending);
  const oldSent = [],
    newSent = [];
  await Promise.all([
    oldQueue(0, async (p, seconds) => oldSent.push([p, seconds])),
    newQueue(0, async (p, seconds) => newSent.push([p, seconds])),
  ]);
  assert.deepEqual(oldSent, [
    [0, 5],
    [0, 0],
  ]);
  assert.deepEqual(newSent, [
    [0, 2],
    [0, 0],
  ]);
});
