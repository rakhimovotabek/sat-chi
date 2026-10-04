import test from "node:test";
import assert from "node:assert/strict";
import { blockedSourcePage } from "../src/features/review/source-pages.js";
test("blocked source counts and pagination include tasks beyond the first ordinary source page", async () => {
  const sources = Array.from({ length: 53 }, (_, id) => ({
    id,
    blocked: id >= 24,
  }));
  const calls = [];
  const fetchPage = async (page) => {
    calls.push(page);
    return {
      rows: sources.slice(page * 25, page * 25 + 25),
      total: sources.length,
    };
  };
  const first = await blockedSourcePage(fetchPage);
  assert.equal(first.total, 29);
  assert.equal(first.rows.length, 25);
  assert.equal(first.rows[0].id, 24);
  assert.deepEqual(calls, [0, 1, 2]);
  const second = await blockedSourcePage(fetchPage, 1);
  assert.deepEqual(
    second.rows.map((s) => s.id),
    [49, 50, 51, 52],
  );
});
