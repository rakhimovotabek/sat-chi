import test from "node:test";
import assert from "node:assert/strict";
import { sendStudyTimeBatch } from "../src/features/player/study-time-batch.js";
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
