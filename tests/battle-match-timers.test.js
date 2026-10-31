import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other } from "./helpers/database.js";

test("whole-match deadlines close answers and save exact scores without client time authority", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (action, data) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  let room = await action("create", {
    category: "Math",
    capacity: 2,
    questionCount: 3,
    seconds: 600,
    totalSeconds: 30,
  });
  const id = room.id;
  await role(other);
  await action("join", { code: room.code });
  await action("ready", { id });
  await role(student);
  await action("ready", { id });
  room = await action("start", { id });
  assert.equal(
    Date.parse(room.match_deadline) - Date.parse(room.deadline),
    30000,
  );
  await db.exec(
    `reset role;update battles set deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(student);
  room = await action("state", {
    id,
    serverNow: "1900-01-01",
    deadline: "2100-01-01",
  });
  assert.equal(room.state, "PLAYING");
  assert.equal(room.deadline, room.match_deadline);
  await action("answer", { id, round: 1, response: "1" });
  await db.exec(
    `reset role;update battles set match_deadline=clock_timestamp()-interval '1 second'where id='${id}'`,
  );
  await role(other);
  await assert.rejects(
    () =>
      action("answer", { id, round: 1, response: "1", deadline: "2100-01-01" }),
    /Round is closed/,
  );
  room = await action("state", { id });
  assert.equal(room.state, "FINISHED");
  assert.equal(room.history.length, 3);
  assert.ok(room.history.every((entry) => entry.points === 0));
  assert.equal(
    room.members.find((member) => member.user_id === student).score,
    100,
  );
  assert.equal(
    room.members.find((member) => member.user_id === other).score,
    0,
  );
  await role(student);
  room = await action("state", { id });
  assert.equal(room.history[0].points, 100);
  assert.equal(
    room.history.slice(1).reduce((sum, entry) => sum + entry.points, 0),
    0,
  );
  const replay = await action("answer", { id, round: 1, response: "1" });
  assert.equal(
    replay.members.find((member) => member.user_id === student).score,
    100,
  );
  assert.equal(
    (await action("list", {})).history.find((match) => match.id === id).score,
    100,
  );
});

test("missed countdowns do not extend timed rounds and total budgets support untimed questions", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  const action = (action, data) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  for (const seconds of [30, 0]) {
    await role(student);
    let room = await action("create", {
      category: "Math",
      capacity: 2,
      questionCount: 1,
      seconds,
      totalSeconds: seconds ? 0 : 30,
    });
    const id = room.id;
    await role(other);
    await action("join", { code: room.code });
    await action("ready", { id });
    await role(student);
    await action("ready", { id });
    await action("start", { id });
    await db.exec(
      `reset role;update battles set deadline=clock_timestamp()-interval '40 seconds'where id='${id}'`,
    );
    await role(student);
    room = await action("state", { id });
    assert.equal(room.state, seconds ? "ROUND_RESULTS" : "PLAYING");
    if (!seconds) assert.equal(room.deadline, room.match_deadline);
  }
  await assert.rejects(
    () =>
      action("create", {
        category: "Math",
        capacity: 2,
        questionCount: 1,
        seconds: 30,
        totalSeconds: 1,
      }),
    /check constraint/,
  );
});
