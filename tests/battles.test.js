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
  assert.equal(b.members.find((m) => m.user_id === student).score, 100);
  b = await action("answer", { id, round: 1, response: "0" });
  assert.equal(b.members.find((m) => m.user_id === student).score, 100);
  await role(other);
  b = await action("answer", { id, round: 1, response: "0" });
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
