import test from "node:test";
import assert from "node:assert/strict";
import { createPracticePersistence } from "../src/features/player/practice-persistence.js";
const memory = () => {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key: (n) => [...data.keys()][n],
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};
const row = (id = "one", type = "mcq") => ({
  id,
  question: { question_type: type },
  selected_answer: null,
  ...(type === "open" ? { selected_response: null } : {}),
  marked: false,
  eliminated: [],
  answer_revision: 0,
});
let counter = 0;
const setup = (
  storage = memory(),
  items = [row()],
  save = async (changes) =>
    changes.map((c) => ({
      id: c.id,
      answer_revision: c.expected_revision + 1,
    })),
  extra = {},
) =>
  createPracticePersistence({
    userId: "A",
    sessionId: "session",
    items,
    storage,
    save,
    uuid: () => `test-${++counter}`,
    ...extra,
  });

test("only dirty questions are sent; saved unchanged answers are never replayed", async () => {
  const sent = [];
  const p = setup(
    memory(),
    [row("one"), { ...row("two"), selected_answer: 2, answer_revision: 3 }],
    async (c) => {
      sent.push(c);
      return c.map((e) => ({
        id: e.id,
        answer_revision: e.expected_revision + 1,
      }));
    },
  );
  p.change("one", { selected_answer: 1 });
  assert.equal(p.state().unsaved, true);
  await p.flush();
  assert.deepEqual(
    sent[0].map((e) => e.id),
    ["one"],
  );
  assert.equal(p.state().items[1].selected_answer, 2);
  assert.equal(p.state().unsaved, false);
});
for (const type of ["mcq", "open"])
  test(`${type} failure survives navigation/reload and clears only after acknowledgement`, async () => {
    const storage = memory();
    let fail = true;
    const save = async (c) => {
      if (fail) throw Error("Network unavailable");
      return c.map((e) => ({ id: e.id, answer_revision: 1 }));
    };
    const p = setup(storage, [row("one", type)], save);
    p.change(
      "one",
      type === "open"
        ? { selected_answer: 0, selected_response: "43/5" }
        : { selected_answer: 1 },
    );
    await assert.rejects(p.flush(), /Network/);
    assert.equal(p.state().unsaved, true);
    assert.ok(storage.length);
    fail = false;
    const restored = setup(storage, [row("one", type)], save);
    assert.equal(
      restored.state().items[0].selected_answer,
      type === "open" ? 0 : 1,
    );
    if (type === "open")
      assert.equal(restored.state().items[0].selected_response, "43/5");
    await restored.flush();
    assert.equal(restored.state().unsaved, false);
    assert.equal(storage.length, 0);
  });
test("an older successful acknowledgement cannot clear a newer edit", async () => {
  const storage = memory();
  let release;
  const wait = new Promise((r) => (release = r));
  const sent = [];
  const p = setup(storage, [row()], async (c) => {
    sent.push(c);
    if (sent.length === 1) await wait;
    return c.map((e) => ({ id: e.id, answer_revision: sent.length }));
  });
  p.change("one", { selected_answer: 1 });
  const first = p.flush();
  await new Promise((r) => setTimeout(r, 0));
  p.change("one", { selected_answer: 2 });
  const second = p.flush();
  release();
  await first;
  assert.equal(p.state().unsaved, true);
  assert.equal(p.state().items[0].selected_answer, 2);
  await second;
  assert.equal(sent[1][0].expected_revision, 1);
  assert.equal(p.state().unsaved, false);
});
test("lost acknowledgement is recovered without overwriting newer server data", async () => {
  const storage = memory();
  const p = setup(storage);
  p.change("one", { selected_answer: 1 });
  const restored = setup(storage, [
    { ...row(), selected_answer: 1, answer_revision: 4 },
  ]);
  assert.equal(restored.state().unsaved, false);
  assert.equal(restored.state().items[0].answer_revision, 4);
  assert.equal(storage.length, 0);
});
test("a conflicting recovered draft requires an explicit decision against current server version", async () => {
  const storage = memory();
  const p = setup(storage);
  p.change("one", { selected_answer: 1 });
  const sent = [];
  const restored = setup(
    storage,
    [{ ...row(), selected_answer: 2, answer_revision: 2 }],
    async (c) => {
      sent.push(c);
      return [{ id: "one", answer_revision: 3 }];
    },
  );
  assert.deepEqual(restored.state().conflicts, ["one"]);
  assert.equal(restored.state().items[0].selected_answer, 2);
  await assert.rejects(restored.flush(), /Review/);
  assert.equal(sent.length, 0);
  restored.resolve(true);
  await restored.flush();
  assert.equal(sent[0][0].expected_revision, 2);
  assert.equal(restored.state().items[0].selected_answer, 1);
});
test("removed questions and completed sessions keep drafts for review and cannot replay them", async () => {
  for (const extra of [{ items: [] }, { submitted: true }]) {
    const storage = memory();
    const p = setup(storage);
    p.change("one", { selected_answer: 1 });
    const restored = setup(storage, extra.items || [row()], undefined, extra);
    assert.equal(restored.state().canUseDrafts, false);
    await assert.rejects(restored.flush());
    restored.resolve(false);
    assert.equal(storage.length, 0);
  }
});
test("server conflicts require reload before an explicit overwrite and missing acknowledgements remain pending", async () => {
  for (const code of ["PT409", "40001"]) {
    let requests = 0;
    const p = setup(memory(), [row()], async () => {
      requests++;
      throw Object.assign(Error("Changed elsewhere"), { code });
    });
    p.change("one", { selected_answer: 1 });
    await assert.rejects(p.flush());
    assert.equal(p.state().canUseDrafts, false);
    assert.equal(p.state().unsaved, true);
    await assert.rejects(p.flush());
    assert.equal(requests, 1, "A conflict must not be automatically replayed");
    p.resolve(true);
    assert.equal(p.state().conflicts.length, 1);
  }
  const q = setup(memory(), [row()], async () => null);
  q.change("one", { selected_answer: 1 });
  await assert.rejects(q.flush(), /did not confirm/);
  assert.equal(q.state().unsaved, true);
});
test("recovery is scoped to user and session, and storage failure does not imply a successful save", async () => {
  const storage = memory();
  const p = setup(storage);
  p.change("one", { selected_answer: 1 });
  assert.equal(
    setup(storage, [row()], undefined, { userId: "B" }).state().unsaved,
    false,
  );
  assert.equal(
    setup(storage, [row()], undefined, { sessionId: "other" }).state().unsaved,
    false,
  );
  const broken = {
    get length() {
      return 0;
    },
    setItem() {
      throw Error("quota");
    },
    removeItem() {
      throw Error("quota");
    },
  };
  const q = setup(broken, [row()], async () => {
    throw Error("offline");
  });
  q.change("one", { selected_answer: 2 });
  assert.equal(q.state().durable, false);
  await assert.rejects(q.flush());
  assert.equal(q.state().unsaved, true);
});
test("multiple recovery records are read even when acknowledged records are removed during scanning", () => {
  const storage = memory();
  const a = setup(storage, [row("one"), row("two")]);
  a.change("one", { selected_answer: 1 });
  const b = setup(storage, [row("one"), row("two")], undefined, {
    userId: "A",
  });
  b.change("two", { selected_answer: 2 });
  const restored = setup(storage, [
    { ...row("one"), selected_answer: 1, answer_revision: 1 },
    row("two"),
  ]);
  assert.equal(restored.state().items[1].selected_answer, 2);
  assert.equal(restored.state().unsaved, true);
});

test("authoritative reconciliation uses acknowledged values, never a pending draft overlay", async () => {
  const p = setup(memory(), [row("one")]);
  p.change("one", { selected_answer: 1 });
  await p.flush();
  p.change("one", { selected_answer: 2 });
  assert.equal(p.state().items[0].selected_answer, 2);
  assert.equal(p.confirmedItems()[0].selected_answer, 1);
  assert.equal(p.confirmedItems()[0].answer_revision, 1);
  assert.equal(p.state().unsaved, true);
});
