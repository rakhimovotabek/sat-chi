import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other, admin } from "./helpers/database.js";
test("two authenticated players complete a synchronized battle with private keys and idempotent server scores", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (action, data = {}) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  await role(student);
  let b = await action("create", {
    category: "Math",
    capacity: 2,
    teamSize: 0,
    questionCount: 1,
    seconds: 60,
    public: false,
  });
  const id = b.id,
    code = b.code;
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from battle_signals where battle_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  await role(other);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from battle_signals where battle_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
  );

  await role(other);
  await assert.rejects(() => action("state", { id }), /Join this battle/);
  await assert.rejects(() => action("join", { id }), /Invitation code/);
  b = await action("join", { code });
  assert.equal(b.members.length, 2);
  await action("join", { code });
  await assert.rejects(() => action("start", { id }), /Only the host/);
  await action("ready", { id });
  await role(student);
  await action("ready", { id });
  b = await action("start", { id });
  assert.equal(b.state, "COUNTDOWN");
  assert.equal(b.question, null);
  assert.equal(b.review, null);
  await assert.rejects(
    () => db.query("select * from battle_rounds"),
    /permission denied/,
  );
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(student);
  b = await action("state", { id });
  assert.equal(b.state, "PLAYING");
  assert.equal(b.review, null);
  assert.ok(!JSON.stringify(b.question).includes("correct_answer"));
  b = await action("answer", { id, round: 1, response: "1" });
  assert.equal(b.submitted, true);
  assert.equal(b.members.find((m) => m.user_id === student).score, 0);
  b = await action("answer", { id, round: 1, response: "0" });
  assert.equal(b.members.find((m) => m.user_id === student).score, 0);
  await role(other);
  const hidden = await action("state", { id });
  assert.equal(hidden.review, null);
  assert.ok(hidden.members.every((member) => member.score === 0));
  assert.deepEqual(
    hidden.members.map((member) => member.seat),
    [1, 2],
  );
  b = await action("answer", { id, round: 1, response: "0" });
  assert.equal(
    b.members.find((member) => member.user_id === student).score,
    100,
  );
  assert.equal(b.state, "ROUND_RESULTS");
  assert.equal(b.review.answer, 1);
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(student);
  b = await action("state", { id });
  assert.equal(b.state, "FINISHED");
  assert.equal(b.history.length, 1);
  assert.equal(b.history[0].correct, true);
  await role(other);
  b = await action("state", { id });
  assert.equal(b.history[0].correct, false);
  const history = await action("list");
  assert.equal(history.history[0].id, id);
  await assert.rejects(
    () =>
      db.exec(`update battle_members set score=999 where user_id='${other}'`),
    /permission denied/,
  );
  await role(admin);
  await assert.rejects(() => action("join", { code }), /Lobby is closed/);
});
test("capacity limits and team sizes are validated, host departure transfers ownership and expired rooms close", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (a, d = {}) =>
    call("battle_action", [a, JSON.stringify(d)], ["text", "jsonb"]);
  await assert.rejects(
    () =>
      action("create", {
        category: "Math",
        capacity: 21,
        questionCount: 1,
        seconds: 60,
      }),
    /check constraint/,
  );
  await assert.rejects(
    () =>
      action("create", {
        category: "Math",
        capacity: 4,
        teamSize: 3,
        questionCount: 1,
        seconds: 60,
      }),
    /equally sized/,
  );
  let b = await action("create", {
    category: "Math",
    capacity: 2,
    questionCount: 1,
    seconds: 60,
    public: true,
  });
  const id = b.id;
  await role(other);
  await action("join", { id });
  await role(admin);
  await assert.rejects(() => action("join", { id }), /full/);
  await role(student);
  await action("leave", { id });
  await role(other);
  b = await action("state", { id });
  assert.equal(b.host_id, other);
  await db.exec(
    `reset role;update battles set expires_at=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(other);
  b = await action("state", { id });
  assert.equal(b.state, "EXPIRED");
});
test("full 2v2, 3v3 and twenty-player games persist accurate team and individual totals", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (a, d = {}) =>
    call("battle_action", [a, JSON.stringify(d)], ["text", "jsonb"]);
  const users = Array.from(
    { length: 20 },
    (_, i) => `f9000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );
  await db.exec("reset role");
  for (const id of users)
    await db.query("insert into auth.users(id)values($1)", [id]);
  for (const [capacity, teamSize] of [
    [4, 2],
    [6, 3],
    [20, 0],
  ]) {
    await role(users[0]);
    let b = await action("create", {
      category: "Math",
      capacity,
      teamSize,
      questionCount: 1,
      seconds: 60,
      public: true,
    });
    const id = b.id;
    for (const user of users.slice(0, capacity)) {
      await role(user);
      await action("join", { id });
      await action("ready", { id });
    }
    await role(users[0]);
    await action("start", { id });
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    for (let i = 0; i < capacity; i++) {
      await role(users[i]);
      b = await action("answer", {
        id,
        round: 1,
        response: i % 2 === 0 ? "1" : "0",
      });
    }
    assert.equal(b.state, "ROUND_RESULTS");
    assert.equal(
      b.members.reduce((n, m) => n + m.score, 0),
      (capacity / 2) * 100,
    );
    if (teamSize) {
      assert.equal(b.members.filter((m) => m.team === 1).length, teamSize);
      assert.equal(
        b.members.filter((m) => m.team === 1).reduce((n, m) => n + m.score, 0),
        teamSize * 100,
      );
    }
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    await role(users[0]);
    b = await action("state", { id });
    assert.equal(b.state, "FINISHED");
  }
});
test("Meaning Rush and Reverse Meaning use actual published word-definition pairs", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (a, d = {}) =>
    call("battle_action", [a, JSON.stringify(d)], ["text", "jsonb"]);
  await db.exec("reset role");
  const bid = (
    await db.query(
      `insert into vocabulary_books(title,published)values('Original words',false)returning id`,
    )
  ).rows[0].id;
  const sid = (
    await db.query(
      `insert into vocabulary_sets(book_id,title)values($1,'Original set')returning id`,
      [bid],
    )
  ).rows[0].id;
  const pairs = [
    ["lucid", "clear and easy to understand"],
    ["brief", "lasting a short time"],
    ["ample", "more than enough"],
    ["novel", "new or unusual"],
  ];
  for (const [word, definition] of pairs)
    await db.query(
      "insert into vocabulary_words(set_id,word,definition)values($1,$2,$3)",
      [sid, word, definition],
    );
  await db.query("update vocabulary_books set published=true where id=$1", [
    bid,
  ]);
  for (const mode of ["meaning-rush", "reverse-meaning"]) {
    await role(student);
    let b = await action("create", {
      category: "Vocabulary",
      capacity: 2,
      questionCount: 1,
      seconds: 60,
      public: true,
      filters: { book: bid, set: sid, mode },
    });
    const id = b.id;
    await action("ready", { id });
    await role(other);
    await action("join", { id });
    await action("ready", { id });
    await role(student);
    await action("start", { id });
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
    );
    await role(student);
    b = await action("state", { id });
    const pair = pairs.find(
      (p) => p[mode === "meaning-rush" ? 0 : 1] === b.question.question_text,
    );
    assert.ok(pair);
    assert.equal(b.question.options.length, 4);
    assert.equal(new Set(b.question.options).size, 4);
    const answer = b.question.options.indexOf(
      pair[mode === "meaning-rush" ? 1 : 0],
    );
    assert.ok(answer >= 0);
    await action("answer", { id, round: 1, response: String(answer) });
    await role(other);
    b = await action("answer", { id, round: 1, response: String(answer) });
    assert.equal(b.state, "ROUND_RESULTS");
    assert.equal(
      b.members.reduce((n, m) => n + m.score, 0),
      200,
    );
  }
});

test("battle creation rejects impossible canonical pools and never leaves an unusable lobby", async (t) => {
  const { db, call, role, book } = await learningDatabase();
  t.after(() => db.close());
  const create = (extra = {}) =>
    call(
      "battle_action",
      [
        "create",
        JSON.stringify({
          category: "Math",
          capacity: 2,
          questionCount: 20,
          seconds: 60,
          ...extra,
        }),
      ],
      ["text", "jsonb"],
    );
  await assert.rejects(
    () => create(),
    /Only 12 eligible published questions; requested 20/,
  );
  await assert.rejects(
    () =>
      create({ questionCount: 1, filters: { domain: "No matching domain" } }),
    /Only 0 eligible/,
  );
  await assert.rejects(
    () => create({ questionCount: 1, filters: { status: "incorrect" } }),
    /Invalid battle filters/,
  );
  await db.exec("reset role");
  assert.equal(
    (await db.query("select count(*)::int n from battles")).rows[0].n,
    0,
  );
  await db.query("update books set published=false where id=$1", [book]);
  await role(admin);
  await assert.rejects(() => create({ questionCount: 1 }), /Only 0 eligible/);
});
